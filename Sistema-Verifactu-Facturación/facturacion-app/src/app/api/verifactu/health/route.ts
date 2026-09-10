/**
 * POST /api/verifactu/health — ¿la AEAT acepta este certificado?
 *
 * Esto ya no es un ping de cortesía. Abre una conexión TLS real contra
 * el servidor de Veri*Factu presentando el certificado del usuario, que
 * es exactamente el mismo saludo que hace un envío de facturas. Si esto
 * funciona, el envío funcionará; si falla, falla aquí, con el usuario
 * mirando la pantalla y pudiendo arreglarlo, en vez de fallar a las tres
 * de la mañana con una cola de facturas detrás.
 *
 * LO QUE HACE Y LO QUE NO
 * Comprueba el CANAL: que el certificado se puede descifrar, que la
 * contraseña guardada lo abre, que el servidor de la AEAT lo acepta en
 * el saludo TLS y que su propio certificado es válido. NO manda ningún
 * registro ni consulta nada: un «hola» que crea facturas no es un
 * «hola».
 *
 * La versión anterior de este fichero devolvía «conectado» sin
 * comprobar nada en cualquier entorno que no fuera producción, para
 * poder ver la pantalla bonita. Se quedó escrito en sus comentarios, y
 * lo que se quedó en la pantalla del usuario fue «Conectado a AEAT»
 * mientras no se enviaba absolutamente nada.
 */

import { NextResponse } from 'next/server';
import tls from 'node:tls';
import { URL } from 'node:url';
import { createClient } from '@/lib/supabase/server';
import { decryptCertificateBlob } from '@/lib/verifactu/certificateEncryption';
import { ENDPOINTS, type EntornoAeat } from '@/lib/verifactu/clienteAeat';

export const dynamic = 'force-dynamic';

const TIEMPO_MAXIMO_MS = 15_000;

interface Resultado {
  isConnected: boolean;
  statusCode: string | null;
  error: string | null;
}

/**
 * El saludo TLS con el certificado puesto.
 *
 * Se resuelve en cuanto la conexión está establecida y se corta acto
 * seguido: no hace falta mandar nada para saber que el canal se puede
 * abrir, y no mandar nada es justo lo que queremos.
 */
function saludar(destino: string, pfx: Buffer, passphrase: string): Promise<Resultado> {
  const url = new URL(destino);

  return new Promise(resolver => {
    let resuelto = false;
    const terminar = (r: Resultado) => {
      if (resuelto) return;
      resuelto = true;
      resolver(r);
    };

    const socket = tls.connect({
      host: url.hostname,
      port: 443,
      servername: url.hostname,
      pfx,
      passphrase,
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2',
      timeout: TIEMPO_MAXIMO_MS,
    }, () => {
      const autorizado = socket.authorized;
      terminar({
        isConnected: autorizado,
        statusCode: autorizado ? 'TLS-OK' : 'TLS-NO-AUTORIZADO',
        error: autorizado
          ? null
          : `El servidor de la AEAT no ha podido validarse: ${socket.authorizationError ?? 'motivo desconocido'}.`,
      });
      socket.end();
    });

    socket.on('timeout', () => {
      socket.destroy();
      terminar({
        isConnected: false, statusCode: null,
        error: `La AEAT no ha respondido en ${TIEMPO_MAXIMO_MS / 1000} segundos.`,
      });
    });

    socket.on('error', (e: NodeJS.ErrnoException) => {
      const texto = String(e.message || '');
      let mensaje = `No se ha podido conectar con la AEAT: ${texto}`;

      if (/mac verify failure|bad decrypt/i.test(texto)) {
        mensaje = 'La contraseña guardada no abre el certificado. Vuelve a subirlo.';
      } else if (/ENOTFOUND|EAI_AGAIN/i.test(texto)) {
        mensaje = 'No se ha podido resolver la dirección de la AEAT. Comprueba la conexión a internet.';
      } else if (/unable to verify|self.signed/i.test(texto)) {
        mensaje = 'No se ha podido verificar el certificado del servidor de la AEAT. Si hay un proxy corporativo inspeccionando el tráfico, es lo que lo provoca.';
      } else if (/ECONNRESET|ECONNREFUSED/i.test(texto)) {
        mensaje = 'La AEAT ha rechazado la conexión. Suele significar que el certificado no vale para ese NIF, o que el servicio está caído.';
      }

      terminar({ isConnected: false, statusCode: null, error: mensaje });
    });
  });
}

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

    const [{ data: cert }, { data: config }] = await Promise.all([
      supabase.from('verifactu_certificates')
        .select('id, certificate_data, certificate_password_encrypted, not_after')
        .eq('user_id', user.id).eq('is_valid', true).eq('is_revoked', false)
        .order('uploaded_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('verifactu_config').select('entorno').eq('user_id', user.id).maybeSingle(),
    ]);

    if (!cert) {
      return NextResponse.json({
        isConnected: false, statusCode: null,
        error: 'No hay ningún certificado cargado.',
      });
    }

    if (!cert.certificate_password_encrypted) {
      return NextResponse.json({
        isConnected: false, statusCode: null,
        error: 'El certificado guardado no lleva la contraseña cifrada porque se subió antes de que existiera el envío real. Vuelve a subirlo.',
      });
    }

    const entorno: EntornoAeat = config?.entorno === 'produccion' ? 'produccion' : 'pruebas';

    let resultado: Resultado;
    try {
      resultado = await saludar(
        ENDPOINTS[entorno],
        decryptCertificateBlob(cert.certificate_data as string),
        decryptCertificateBlob(cert.certificate_password_encrypted as string).toString('utf8'),
      );
    } catch {
      resultado = {
        isConnected: false, statusCode: null,
        error: 'No se ha podido descifrar el certificado en el servidor. Vuelve a subirlo.',
      };
    }

    // Se guarda el resultado para poder enseñar en la pantalla cuándo fue
    // la última vez que esto funcionó de verdad.
    await supabase.from('verifactu_certificates')
      .update({
        is_aeat_connected: resultado.isConnected,
        last_connection_check: new Date().toISOString(),
        last_connection_error: resultado.error,
        aeat_status_code: resultado.statusCode,
      })
      .eq('id', cert.id);

    return NextResponse.json({ ...resultado, entorno });
  } catch (err) {
    console.error('Verifactu health check error:', err);
    return NextResponse.json({
      isConnected: false, statusCode: null,
      error: err instanceof Error ? err.message : 'Error comprobando la conexión',
    }, { status: 500 });
  }
}
