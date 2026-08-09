/**
 * Cifrado en reposo de certificados Verifactu — SOLO SERVIDOR.
 *
 * Usa AES-256-GCM con node:crypto (ya viene con Node.js, sin dependencias
 * nuevas) para cifrar el contenido binario del certificado (.p12/.pem)
 * antes de guardarlo en Supabase. La clave vive en la variable de entorno
 * CERTIFICATE_ENCRYPTION_KEY (32 bytes en base64) y nunca sale del
 * servidor ni se envía al navegador.
 *
 * IMPORTANTE — LO QUE ESTO NO HACE:
 * Este módulo cifra los bytes tal cual llegan, byte a byte. NO verifica
 * que sean un PKCS#12/X.509 válido, no comprueba la cadena de confianza
 * FNMT, y no consulta la lista de revocación (CRL). Esa validación de
 * certificado NO está implementada (ver la advertencia en
 * src/lib/verifactu/certificate.ts y en el endpoint de subida). No hay
 * que confundir "cifrado en reposo" con "certificado verificado como
 * auténtico": son dos cosas distintas y sólo la primera está resuelta
 * aquí.
 *
 * Si CERTIFICATE_ENCRYPTION_KEY no está configurada, las funciones de
 * cifrado lanzan un error en vez de degradar a texto plano en silencio:
 * es preferible que la subida de certificados falle con un mensaje claro
 * a que el sistema guarde secretos sin cifrar mientras dice lo contrario.
 */
import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // longitud recomendada para GCM
const AUTH_TAG_LENGTH = 16;
const KEY_ENV_VAR = 'CERTIFICATE_ENCRYPTION_KEY';

function getEncryptionKey(): Buffer {
  const raw = process.env[KEY_ENV_VAR];
  if (!raw) {
    throw new Error(
      `Falta la variable de entorno ${KEY_ENV_VAR}. Sin ella el servidor no puede cifrar certificados y, por seguridad, se niega a guardarlos en texto plano. Genera una con: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
    );
  }

  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(
      `${KEY_ENV_VAR} debe decodificar a 32 bytes en base64 (clave AES-256). Longitud actual: ${key.length} bytes.`
    );
  }
  return key;
}

/**
 * Cifra un buffer binario arbitrario.
 *
 * El buffer debe ser el contenido BINARIO real del archivo (decodificado
 * de BASE64 con Buffer.from(base64, 'base64')), NUNCA el resultado de
 * volver a pasarlo por .toString('utf8'): eso interpreta bytes binarios
 * arbitrarios como texto UTF-8 y corrompe silenciosamente cualquier byte
 * que no forme una secuencia UTF-8 válida (los sustituye por U+FFFD).
 * Un .p12 es binario, no texto, así que ese bug rompía el propio
 * certificado antes incluso de guardarlo.
 *
 * Formato de salida: IV (12 bytes) || authTag (16 bytes) || ciphertext,
 * codificado como string hex con el prefijo \x que Postgres reconoce
 * como formato de entrada para columnas BYTEA.
 */
export function encryptCertificateBlob(plainBytes: Buffer): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plainBytes), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const combined = Buffer.concat([iv, authTag, ciphertext]);
  return `\\x${combined.toString('hex')}`;
}

/**
 * Descifra un blob generado por encryptCertificateBlob.
 *
 * No lo usa ningún flujo todavía porque no existe envío real a AEAT (ver
 * advertencias en /api/verifactu/health). Se deja listo para cuando ese
 * flujo exista, en vez de duplicar la lógica de IV/authTag en ese momento.
 */
export function decryptCertificateBlob(hexWithPrefix: string): Buffer {
  const key = getEncryptionKey();
  const hex = hexWithPrefix.startsWith('\\x') ? hexWithPrefix.slice(2) : hexWithPrefix;
  const combined = Buffer.from(hex, 'hex');

  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * SHA-256 del contenido subido, en hexadecimal.
 *
 * OJO: esto NO es el "thumbprint" X.509 real de un certificado (ese se
 * calcula sobre la estructura DER del certificado tras parsearlo, no
 * sobre el fichero .p12 completo). Es un hash honesto de "estos bytes
 * exactos que subió el usuario", útil para detectar duplicados o
 * manipulación del fichero guardado, pero no sustituye a un fingerprint
 * X.509 real. Antes este campo era un valor fijo inventado
 * ('a'.repeat(64)) igual para todos los certificados — este hash al
 * menos es real y distinto por archivo.
 */
export function hashUploadedBytes(plainBytes: Buffer): string {
  return crypto.createHash('sha256').update(plainBytes).digest('hex');
}
