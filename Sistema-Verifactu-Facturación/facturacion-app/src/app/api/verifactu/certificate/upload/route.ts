/**
 * POST /api/verifactu/certificate/upload
 * Recibe un certificado .p12/.pem y lo almacena cifrado.
 *
 * ============================================================================
 * ADVERTENCIA IMPORTANTE — INTEGRACIÓN DE DEMOSTRACIÓN, NO VALIDACIÓN REAL
 * ============================================================================
 * Este endpoint NO valida que el fichero subido sea un certificado FNMT
 * legítimo. No descifra el PKCS#12, no comprueba la cadena de confianza,
 * no verifica que sea de firma electrónica y no consulta la lista de
 * revocación (CRL) de la AEAT/FNMT. Un usuario autenticado puede subir
 * CUALQUIER archivo BASE64 con CUALQUIER contraseña no vacía y el sistema
 * lo aceptará y lo mostrará como "certificado cargado" — subject/issuer
 * son texto fijo, no datos extraídos del certificado real.
 *
 * Hacer esa validación de verdad requiere una librería de parseo
 * PKCS#12/X.509 (p.ej. node-forge o pkijs) que no está instalada en este
 * proyecto (ver package.json) y añadirla no entra en el alcance de esta
 * revisión de seguridad. En vez de simular una validación que no existe,
 * este endpoint:
 *   1. Marca cada certificado con validation_status = 'unverified' en BD.
 *   2. Devuelve un campo `warning` explícito en la respuesta.
 *   3. Dice la verdad en cada comentario/mensaje de error en vez de fingir.
 *
 * Lo que SÍ es real a partir de esta revisión:
 *   - El contenido se cifra en reposo con AES-256-GCM (ver
 *     certificateEncryption.ts) usando una clave que sólo vive en el
 *     servidor. Antes se guardaba con Buffer.from(...).toString(), que ni
 *     cifra nada ni preserva los bytes originales (corrompe binario no-UTF8).
 *   - El thumbprint es un SHA-256 real del fichero subido, no un valor fijo
 *     inventado igual para todos los certificados.
 * ============================================================================
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { encryptCertificateBlob, hashUploadedBytes } from '@/lib/verifactu/certificateEncryption';

// Un .p12/.pem real pesa como mucho unos pocos KB. 10 MB es generoso y
// evita que este endpoint se use para volcar payloads enormes en la BD.
const MAX_CERTIFICATE_BYTES = 10 * 1024 * 1024;

/**
 * MOCK — simula la validación de un certificado FNMT.
 *
 * En un servidor real, aquí iría:
 * 1. Descifrar el .p12 con la contraseña (crypto nativo / OpenSSL)
 * 2. Extraer los datos del certificado (subject, issuer, fechas reales)
 * 3. Validar que venga de AC FNMT (cadena de confianza)
 * 4. Verificar que sea para firma electrónica
 * 5. Comprobar contra CRL que no esté revocado
 *
 * Nada de eso ocurre aquí todavía. Sólo se comprueba que el payload sea
 * BASE64 y que se haya escrito alguna contraseña — es decir, esto no es
 * una validación de certificado, es una validación de formulario.
 */
async function mockValidateCertificateServer(rawBytes: Buffer, password: string) {
  if (rawBytes.length === 0) {
    throw new Error('Certificado vacío o BASE64 inválido');
  }

  if (!password || password.length < 1) {
    throw new Error('Contraseña requerida');
  }

  // Mock: datos de certificado NO extraídos del fichero real.
  // Se marcan explícitamente como "sin verificar" para que no se
  // confundan con datos reales del certificado en la UI.
  return {
    thumbprint: hashUploadedBytes(rawBytes), // SHA-256 real del archivo (no es el fingerprint X.509)
    subjectName: '(sin verificar) — no se ha parseado el certificado real',
    issuerName: '(sin verificar) — no se ha comprobado que sea AC FNMT',
    serialNumber: 'SIN-VERIFICAR',
    notBefore: new Date(),
    notAfter: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // fecha inventada, no extraída del certificado
  };
}

export async function POST(request: NextRequest) {
  try {
    // Verificar autenticación
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: 'No autenticado' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { certificate, password } = body;

    if (!certificate || !password || typeof certificate !== 'string' || typeof password !== 'string') {
      return NextResponse.json(
        { error: 'Certificado y contraseña requeridos' },
        { status: 400 }
      );
    }

    // Decodificar BASE64 a los bytes binarios reales UNA sola vez. Antes
    // el código volvía a decodificar por separado para "validar" y para
    // "guardar", y la copia que se guardaba pasaba por .toString('utf8'),
    // lo que corrompe datos binarios no-UTF8 (los sustituye por U+FFFD).
    let rawBytes: Buffer;
    try {
      rawBytes = Buffer.from(certificate.split(',').pop() || '', 'base64');
    } catch {
      return NextResponse.json(
        { error: 'Certificado inválido (no es BASE64)' },
        { status: 400 }
      );
    }

    if (rawBytes.length === 0) {
      return NextResponse.json(
        { error: 'Certificado vacío o BASE64 inválido' },
        { status: 400 }
      );
    }

    if (rawBytes.length > MAX_CERTIFICATE_BYTES) {
      return NextResponse.json(
        { error: `El certificado supera el tamaño máximo permitido (${MAX_CERTIFICATE_BYTES / (1024 * 1024)} MB)` },
        { status: 400 }
      );
    }

    // "Validar" certificado (ver advertencia arriba: esto es un mock)
    let certData;
    try {
      certData = await mockValidateCertificateServer(rawBytes, password);
    } catch (validationErr) {
      return NextResponse.json(
        { error: validationErr instanceof Error ? validationErr.message : 'Certificado inválido' },
        { status: 400 }
      );
    }

    // Cifrar en reposo con AES-256-GCM. Si la clave de cifrado no está
    // configurada, se rechaza la subida en vez de guardar en texto plano
    // afirmando (como antes) que estaba "encriptado".
    let encryptedBlob: string;
    try {
      encryptedBlob = encryptCertificateBlob(rawBytes);
    } catch (encErr) {
      console.error('No se pudo cifrar el certificado:', encErr);
      return NextResponse.json(
        {
          error:
            'El servidor no está configurado para cifrar certificados (falta CERTIFICATE_ENCRYPTION_KEY). No se ha guardado nada.',
        },
        { status: 500 }
      );
    }

    const uploadedIp =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      null;

    // Almacenar en Supabase (cifrado — ver advertencia de cabecera:
    // cifrado en reposo no es lo mismo que certificado verificado)
    const { data, error } = await supabase
      .from('verifactu_certificates')
      .insert({
        user_id: user.id,
        certificate_data: encryptedBlob,
        certificate_thumbprint: certData.thumbprint,
        subject_name: certData.subjectName,
        issuer_name: certData.issuerName,
        serial_number: certData.serialNumber,
        not_before: certData.notBefore.toISOString(),
        not_after: certData.notAfter.toISOString(),
        is_valid: true,
        is_revoked: false,
        is_aeat_connected: false,
        validation_status: 'unverified',
        uploaded_ip: uploadedIp,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error storing certificate:', error);
      return NextResponse.json(
        { error: 'No se pudo almacenar el certificado' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      certificateId: data.id,
      message: 'Certificado guardado cifrado en el servidor.',
      warning:
        'MODO DEMOSTRACIÓN: no se ha verificado que el certificado sea auténtico ni que provenga de AC FNMT. Las facturas NO se envían todavía automáticamente a la AEAT con este certificado.',
    });
  } catch (err) {
    console.error('Certificate upload error:', err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : 'Error al cargar certificado',
      },
      { status: 500 }
    );
  }
}
