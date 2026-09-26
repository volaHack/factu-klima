/**
 * POST /api/buzon/entrada?secreto=… — el correo entrante (Postmark Inbound).
 *
 * Lo llama Postmark, no un usuario: se autentica con el secreto de la URL
 * (BUZON_WEBHOOK_SECRETO), que sólo conocen Postmark y el servidor. Cada
 * adjunto que sea una factura (PDF o foto) se guarda en la bandeja de la
 * cuenta cuya clave va en la dirección; la cuenta lo revisa en Gastos.
 *
 * A una clave desconocida se le contesta 200 igual: si no, Postmark
 * reintentaría el mismo correo durante horas.
 */

import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { leerCorreoPostmark } from '@/lib/buzon/correo';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function secretoCorrecto(recibido: string | null): boolean {
  const esperado = process.env.BUZON_WEBHOOK_SECRETO;
  if (!esperado || !recibido) return false;
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!secretoCorrecto(new URL(request.url).searchParams.get('secreto'))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  let json: unknown;
  try { json = await request.json(); } catch { return NextResponse.json({ error: 'JSON no válido' }, { status: 400 }); }
  const correo = leerCorreoPostmark(json);
  if (!correo.clave || correo.adjuntos.length === 0) {
    return NextResponse.json({ ok: true, guardados: 0, descartados: correo.descartados });
  }

  const db = supabaseServicio();
  const { data: dir } = await db.from('buzon_direcciones').select('user_id').eq('clave', correo.clave).maybeSingle();
  if (!dir) return NextResponse.json({ ok: true, guardados: 0, motivo: 'clave desconocida' });

  const { error } = await db.from('buzon_documentos').insert(correo.adjuntos.map(a => ({
    user_id: dir.user_id, remitente: correo.remitente, asunto: correo.asunto, nombre: a.nombre, mime: a.mime, contenido: a.contenido,
  })));
  if (error) {
    console.error('No se ha podido guardar el correo del buzón:', error.message);
    return NextResponse.json({ error: 'No se ha podido guardar' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, guardados: correo.adjuntos.length, descartados: correo.descartados });
}
