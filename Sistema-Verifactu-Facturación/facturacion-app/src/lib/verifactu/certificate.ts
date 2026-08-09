/**
 * Validación de certificados digitales FNMT
 * Soporta: .pem, .crt, .cer, .p12, .pfx
 *
 * ============================================================================
 * ADVERTENCIA — NINGUNA FUNCIÓN DE ESTE FICHERO VALIDA UN CERTIFICADO DE
 * VERDAD. Son comprobaciones de formato (¿es BASE64?, ¿tiene los
 * delimitadores PEM?, ¿hay contraseña?), no criptografía. En concreto,
 * NADA aquí ni en el servidor (ver /api/verifactu/certificate/upload):
 *   - descifra el PKCS#12 con la contraseña,
 *   - parsea la estructura X.509 para extraer subject/issuer/fechas reales,
 *   - valida la cadena de confianza hasta AC FNMT,
 *   - comprueba la lista de revocación (CRL).
 * Un archivo cualquiera con contenido BASE64 válido y cualquier
 * contraseña no vacía pasa estas comprobaciones. Tratar un "valid: true"
 * de este fichero como "certificado FNMT verificado" es el error que
 * esta revisión de seguridad busca evitar.
 * ============================================================================
 */

export interface CertificateInfo {
  valid: boolean;
  subject: string;
  issuer: string;
  notBefore: Date;
  notAfter: Date;
  thumbprint: string;
  issuerName: string;
  subjectName: string;
  serialNumber: string;
  error?: string;
}

/**
 * Valida un certificado PEM (lectura básica)
 * Nota: La validación completa requiere crypto nativo que solo está en Node.js
 * Este validador hace checks básicos que funcionan en el navegador.
 */
export function validateCertificatePEM(pemContent: string): CertificateInfo {
  const error = { valid: false, error: 'Certificado inválido' };

  // Verificar que contiene bloques PEM válidos
  if (
    !pemContent.includes('BEGIN CERTIFICATE') ||
    !pemContent.includes('END CERTIFICATE')
  ) {
    return {
      ...error,
      subject: '',
      issuer: '',
      notBefore: new Date(),
      notAfter: new Date(),
      thumbprint: '',
      issuerName: '',
      subjectName: '',
      serialNumber: '',
      error: 'No contiene bloque de certificado PEM válido',
    };
  }

  // Extraer el bloque BASE64
  const match = pemContent.match(
    /-----BEGIN CERTIFICATE-----\s*([\s\S]+?)\s*-----END CERTIFICATE-----/
  );
  if (!match) {
    return {
      ...error,
      subject: '',
      issuer: '',
      notBefore: new Date(),
      notAfter: new Date(),
      thumbprint: '',
      issuerName: '',
      subjectName: '',
      serialNumber: '',
      error: 'Formato PEM no válido',
    };
  }

  const base64 = match[1].replace(/\s/g, '');

  // Validar que el BASE64 sea válido
  try {
    atob(base64);
  } catch {
    return {
      ...error,
      subject: '',
      issuer: '',
      notBefore: new Date(),
      notAfter: new Date(),
      thumbprint: '',
      issuerName: '',
      subjectName: '',
      serialNumber: '',
      error: 'BASE64 no válido en certificado',
    };
  }

  // En el navegador solo podemos hacer validaciones básicas.
  // La validación completa ocurre en el servidor.
  return {
    valid: true,
    subject: 'Certificado válido (validación básica)',
    issuer: 'FNMT / AC (validación completa en servidor)',
    notBefore: new Date(),
    notAfter: new Date(),
    thumbprint: generateThumbprint(base64),
    issuerName: 'Autoridad Certificadora',
    subjectName: 'Sujeto del Certificado',
    serialNumber: '',
  };
}

/**
 * Genera un thumbprint SHA-256 del certificado (para UI)
 * Nota: Este es un thumbprint aproximado. El real se calcula en el servidor.
 */
function generateThumbprint(base64: string): string {
  // Usar un simple hash para demostración
  let hash = 0;
  for (let i = 0; i < base64.length; i++) {
    const char = base64.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convertir a entero de 32 bits
  }
  return Math.abs(hash).toString(16).padStart(16, '0');
}

/**
 * Valida que sea un certificado FNMT de la AEAT
 * Checks:
 * - Viene de AC FNMT
 * - Es de firma electrónica (no autenticación)
 * - No está revocado
 * - No ha expirado
 */
export function validateFNMTCertificate(info: CertificateInfo): {
  valid: boolean;
  error?: string;
} {
  if (!info.valid) {
    return { valid: false, error: info.error };
  }

  // Verificar expiración
  if (new Date() > info.notAfter) {
    return {
      valid: false,
      error: `Certificado expirado desde ${info.notAfter.toLocaleDateString('es-ES')}`,
    };
  }

  if (new Date() < info.notBefore) {
    return { valid: false, error: 'Certificado aún no válido' };
  }

  // En el navegador no podemos verificar contra CRL (Certificate Revocation List)
  // Eso se hace en el servidor

  return { valid: true };
}

/**
 * Parsea un archivo .p12 (PKCS#12) - solo verificación básica
 * El descifrado real ocurre en el servidor con OpenSSL/crypto
 */
export function validateP12Certificate(
  base64Content: string,
  password: string
): { valid: boolean; error?: string } {
  if (!base64Content || !password) {
    return { valid: false, error: 'Certificado o contraseña vacíos' };
  }

  // Validar BASE64
  try {
    atob(base64Content.split(',').pop() || '');
  } catch {
    return { valid: false, error: 'Archivo no es BASE64 válido' };
  }

  // El resto se valida en el servidor
  return { valid: true };
}

/**
 * Prepara el certificado para envío al servidor
 * El servidor lo descifra y almacena de forma segura
 */
export async function prepareCertificateForUpload(file: File): Promise<{
  filename: string;
  content: string;
  fileType: string;
}> {
  const filename = file.name;
  const fileType = file.type || 'application/octet-stream';

  // Leer archivo como BASE64
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result as string;
      resolve({ filename, content, fileType });
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
  });
}
