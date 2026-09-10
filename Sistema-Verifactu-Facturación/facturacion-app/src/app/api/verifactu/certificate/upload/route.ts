/**
 * POST /api/verifactu/certificate/upload
 *
 * Recibe el .p12/.pfx del obligado tributario, comprueba que sea de
 * verdad lo que dice ser, y lo guarda cifrado para poder presentarlo
 * ante la AEAT en cada envío.
 *
 * QUÉ CAMBIÓ RESPECTO A LA VERSIÓN ANTERIOR
 * Antes esto era, y lo decía en sus propios comentarios, «una validación
 * de formulario»: comprobaba que el contenido fuera BASE64 y que la
 * contraseña no estuviera vacía, y guardaba un titular «(sin verificar)»
 * y una caducidad inventada a un año vista. Ahora se abre el PKCS#12 de
 * verdad (ver lib/verifactu/certificado.ts), lo que comprueba de una
 * sentada tres cosas que importan:
 *
 *   - que el fichero es un PKCS#12 y no un .cer sin clave privada;
 *   - que la contraseña es LA BUENA, en el momento de escribirla y no
 *     semanas después con un error de saludo TLS incomprensible;
 *   - quién es el titular, quién lo emitió y cuándo caduca, leídos del
 *     certificado en vez de rellenados a ojo.
 *
 * LA CONTRASEÑA SE GUARDA CIFRADA, NO EN HASH
 * Un hash sirve para comprobar que alguien sabe la contraseña. Aquí no
 * hay que comprobar nada: hay que ABRIR el certificado en cada envío
 * para levantar el TLS mutuo, y un hash no abre nada. La alternativa
 * sería pedírsela al usuario cada vez, que convierte «facturar» en
 * «facturar y quedarse mirando la pantalla». Se cifra con AES-256-GCM
 * con una clave que sólo existe en el servidor.
 *
 * LO QUE SIGUE SIN COMPROBARSE
 * Que el certificado no esté revocado. Eso exige consultar la CRL o el
 * OCSP del emisor, con su petición de red y sus tiempos de espera. No
 * está hecho.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { encryptCertificateBlob, hashUploadedBytes } from '@/lib/verifactu/certificateEncryption';
import { avisosDelCertificado, leerCertificado } from '@/lib/verifactu/certificado';
import { checkRateLimit } from '@/lib/rateLimit';

// Un .p12 real pesa unos pocos KB. 10 MB es generoso y evita que este
// endpoint se use para volcar payloads enormes en la base de datos.
const MAX_CERTIFICATE_BYTES = 10 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    if (!(await checkRateLimit(`cert-upload:${user.id}`, 5, 3600))) {
      return NextResponse.json(
        { error: 'Demasiadas subidas de certificado. Inténtalo de nuevo más tarde.' },
        { status: 429 },
      );
    }

    const { certificate, password } = await request.json();
    if (!certificate || !password || typeof certificate !== 'string' || typeof password !== 'string') {
      return NextResponse.json({ error: 'Certificado y contraseña requeridos' }, { status: 400 });
    }

    // Se decodifica UNA sola vez a los bytes binarios reales. La versión
    // vieja los volvía a decodificar por separado para «validar» y para
    // «guardar», y la copia que guardaba pasaba por .toString('utf8'),
    // que corrompe cualquier byte que no forme UTF-8 válido — es decir,
    // rompía el certificado antes de guardarlo.
    let rawBytes: Buffer;
    try {
      rawBytes = Buffer.from(certificate.split(',').pop() || '', 'base64');
    } catch {
      return NextResponse.json({ error: 'Certificado inválido (no es BASE64)' }, { status: 400 });
    }

    if (rawBytes.length === 0) {
      return NextResponse.json({ error: 'Certificado vacío o BASE64 inválido' }, { status: 400 });
    }
    if (rawBytes.length > MAX_CERTIFICATE_BYTES) {
      return NextResponse.json(
        { error: `El certificado supera el tamaño máximo permitido (${MAX_CERTIFICATE_BYTES / (1024 * 1024)} MB)` },
        { status: 400 },
      );
    }

    // Validación de verdad: si esto pasa, el fichero es un PKCS#12 y la
    // contraseña abre la clave privada.
    let datos;
    try {
      datos = leerCertificado(rawBytes, password);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'No se ha podido leer el certificado' },
        { status: 400 },
      );
    }

    if (datos.notAfter < new Date()) {
      return NextResponse.json(
        { error: `Este certificado caducó el ${datos.notAfter.toLocaleDateString('es-ES')}. Renuévalo antes de subirlo.` },
        { status: 400 },
      );
    }

    // Cifrado en reposo. Si la clave de cifrado no está configurada, se
    // rechaza la subida en vez de guardar en claro afirmando lo
    // contrario, que es lo que hacía la primera versión de esto.
    let blobCertificado: string;
    let blobPassword: string;
    try {
      blobCertificado = encryptCertificateBlob(rawBytes);
      blobPassword = encryptCertificateBlob(Buffer.from(password, 'utf8'));
    } catch (encErr) {
      console.error('No se pudo cifrar el certificado:', encErr);
      return NextResponse.json(
        { error: 'El servidor no está configurado para cifrar certificados (falta CERTIFICATE_ENCRYPTION_KEY). No se ha guardado nada.' },
        { status: 500 },
      );
    }

    const { data: ajustes } = await supabase
      .from('company_settings').select('nif').eq('user_id', user.id).maybeSingle();

    const uploadedIp =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || null;

    // Al subir uno nuevo, el anterior deja de estar activo: si no, el
    // envío podría seguir usando el viejo sin que nadie lo note.
    await supabase.from('verifactu_certificates')
      .update({ is_valid: false, last_validation_error: 'Sustituido por un certificado más reciente' })
      .eq('user_id', user.id)
      .eq('is_valid', true);

    const { data, error } = await supabase
      .from('verifactu_certificates')
      .insert({
        user_id: user.id,
        certificate_data: blobCertificado,
        certificate_password_encrypted: blobPassword,
        certificate_thumbprint: hashUploadedBytes(rawBytes),
        subject_name: datos.subjectName,
        issuer_name: datos.issuerName,
        serial_number: datos.serialNumber,
        not_before: datos.notBefore.toISOString(),
        not_after: datos.notAfter.toISOString(),
        is_valid: true,
        is_revoked: false,
        is_aeat_connected: false,
        // «verified» significa aquí lo que puede significar: es un
        // PKCS#12 legítimo, la contraseña es correcta y los datos son
        // los que trae el certificado. No incluye comprobación de
        // revocación, que sigue sin estar hecha.
        validation_status: 'verified',
        uploaded_ip: uploadedIp,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error storing certificate:', error);
      return NextResponse.json({ error: 'No se pudo almacenar el certificado' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      certificateId: data.id,
      titular: datos.subjectName,
      emisor: datos.issuerName,
      caduca: datos.notAfter.toISOString(),
      avisos: avisosDelCertificado(datos, ajustes?.nif),
      message: 'Certificado comprobado y guardado cifrado en el servidor.',
    });
  } catch (err) {
    console.error('Certificate upload error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error al cargar certificado' },
      { status: 500 },
    );
  }
}
