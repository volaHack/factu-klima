/**
 * POST /api/verifactu/comprobar-nif — ¿estos NIF son de estos nombres?
 *
 * Pregunta al censo de la AEAT (servicio VNifV2, ver lib/verifactu/censoAeat.ts)
 * con el certificado que la empresa tiene subido para Veri*Factu. Va por el
 * servidor por lo mismo que el envío: el certificado sólo se descifra aquí.
 *
 * Entrada: { consultas: [{ nif, nombre }] } (hasta 50).
 * Salida:  { disponible: true, resultados: ResultadoCenso[] }
 *        | { disponible: false, motivo }   ← sin certificado: no es un error,
 *          la app sigue con las comprobaciones que hace sin conexión.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import { decryptCertificateBlob } from '@/lib/verifactu/certificateEncryption';
import { enviarSobreSoap } from '@/lib/verifactu/clienteAeat';
import { ENDPOINT_VNIF, MAX_CONSULTAS, parsearRespuestaVNifV2, sobreVNifV2 } from '@/lib/verifactu/censoAeat';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  if (!(await checkRateLimit(`verifactu-censo:${user.id}`, 30, 60))) {
    return NextResponse.json({ error: 'Demasiadas consultas seguidas. Espera un minuto.' }, { status: 429 });
  }

  let consultas: { nif: string; nombre: string }[] = [];
  try {
    const cuerpo = await request.json();
    consultas = (Array.isArray(cuerpo?.consultas) ? cuerpo.consultas : [])
      .map((c: { nif?: unknown; nombre?: unknown }) => ({
        nif: String(c?.nif ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20),
        nombre: String(c?.nombre ?? '').trim().slice(0, 200),
      }))
      .filter((c: { nif: string; nombre: string }) => c.nif && c.nombre);
  } catch {
    return NextResponse.json({ error: 'Petición mal formada.' }, { status: 400 });
  }
  if (consultas.length === 0) return NextResponse.json({ error: 'Falta el NIF o el nombre.' }, { status: 400 });
  if (consultas.length > MAX_CONSULTAS) {
    return NextResponse.json({ error: `Como mucho ${MAX_CONSULTAS} a la vez.` }, { status: 400 });
  }

  const { data: cert } = await supabase
    .from('verifactu_certificates')
    .select('certificate_data, certificate_password_encrypted')
    .eq('user_id', user.id)
    .eq('is_valid', true)
    .eq('is_revoked', false)
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!cert?.certificate_data || !cert.certificate_password_encrypted) {
    return NextResponse.json({
      disponible: false,
      motivo: 'Para preguntar a la AEAT hace falta el certificado digital de la empresa (se sube en Veri*Factu).',
    });
  }

  let credencial;
  try {
    credencial = {
      pfx: decryptCertificateBlob(cert.certificate_data as string),
      passphrase: decryptCertificateBlob(cert.certificate_password_encrypted as string).toString('utf8'),
    };
  } catch {
    return NextResponse.json({ disponible: false, motivo: 'No se ha podido abrir el certificado guardado. Vuelve a subirlo en Veri*Factu.' });
  }

  try {
    const respuesta = await enviarSobreSoap(ENDPOINT_VNIF, sobreVNifV2(consultas), credencial);
    if (respuesta.estado >= 500 && !/Fault/.test(respuesta.cuerpo)) {
      return NextResponse.json({ error: `La AEAT no está respondiendo (error ${respuesta.estado}). Prueba en unos minutos.` }, { status: 502 });
    }
    const resultados = parsearRespuestaVNifV2(respuesta.cuerpo);
    if (resultados.length === 0) {
      return NextResponse.json({ error: 'La AEAT ha contestado sin resultados. Prueba en unos minutos.' }, { status: 502 });
    }
    return NextResponse.json({ disponible: true, resultados });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'No se ha podido consultar a la AEAT.' }, { status: 502 });
  }
}
