/**
 * POST /api/correos/prueba { tipo: 'resumen' | 'avisos' } — manda a la
 * propia empresa un ejemplo con sus datos de ahora, para ver cómo le van a
 * llegar. A su propio correo y como mucho 5 por hora.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { checkRateLimit } from '@/lib/rateLimit';
import { correoConfigurado, enviarCorreo } from '@/lib/correo/enviar';
import { avisosDeHoy, datosDeEmpresa, enlaces } from '@/lib/notificaciones/servidor';
import { correoAvisos, correoResumen } from '@/lib/notificaciones/correos';
import { mesAnteriorA, resumenDelMes } from '@/lib/notificaciones/resumen';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (!correoConfigurado()) return NextResponse.json({ error: 'El envío de correos todavía no está configurado en el servidor.' }, { status: 503 });
  if (!(await checkRateLimit(`correo-prueba:${user.id}`, 5, 3600))) {
    return NextResponse.json({ error: 'Ya has pedido varios correos de prueba. Espera un rato.' }, { status: 429 });
  }
  const { tipo } = await request.json().catch(() => ({}));
  const db = supabaseServicio();
  const d = await datosDeEmpresa(db, user.id);
  if (!d) return NextResponse.json({ error: 'Tu cuenta no tiene correo.' }, { status: 400 });

  // La fila (y su enlace de baja) se crea si aún no existe.
  await db.from('notificaciones_correo').upsert({ user_id: user.id }, { onConflict: 'user_id', ignoreDuplicates: true });
  const { data: fila } = await db.from('notificaciones_correo').select('token_baja').eq('user_id', user.id).single();
  const u = enlaces(fila?.token_baja ?? '');
  const ahora = new Date();

  let c: { asunto: string; html: string; texto: string };
  if (tipo === 'avisos') {
    const importantes = avisosDeHoy(d, ahora);
    if (!importantes.length) return NextResponse.json({ ok: true, nada: true, mensaje: 'Hoy no tienes nada urgente: el correo de avisos sólo llega cuando lo hay.' });
    c = correoAvisos(importantes, d.destinatario, u);
  } else {
    c = correoResumen(resumenDelMes(d.documentos, d.gastos, mesAnteriorA(ahora), ahora), d.destinatario, u);
  }
  try {
    await enviarCorreo({ para: d.correo, asunto: `[Prueba] ${c.asunto}`, html: c.html, texto: c.texto, bajaUrl: u.baja, etiqueta: `prueba-${tipo === 'avisos' ? 'avisos' : 'resumen'}` });
  } catch (e) {
    console.error('[correos/prueba]', e instanceof Error ? e.message : e);
    return NextResponse.json({ error: 'No se ha podido mandar el correo. Inténtalo en un momento.' }, { status: 502 });
  }
  return NextResponse.json({ ok: true, para: d.correo });
}
