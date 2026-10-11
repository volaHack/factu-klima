/**
 * /api/banco — las conexiones del negocio con sus bancos.
 *   GET     lista con saldos y caducidad (sin el session_id, que no sale
 *           del servidor) y cuántos movimientos quedan por conciliar
 *   DELETE  ?id=… desconecta: se borra la sesión en Enable Banking y aquí
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { borrarSesion, enableBankingConfigurado } from '@/lib/banco/enableBanking';
import { conexionesDe, sinConciliarDe, vistaDeConexion } from '@/lib/banco/servidor';
import { bancoAbiertoA } from '@/lib/banco/abierto';

export const dynamic = 'force-dynamic';

async function usuario() {
  const { data: { user } } = await (await createClient()).auth.getUser();
  return user;
}

export async function GET() {
  const sesion = await createClient();
  const { data: { user } } = await sesion.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (!(await bancoAbiertoA(sesion))) {
    return NextResponse.json({ disponible: false, proximamente: enableBankingConfigurado(), conexiones: [], sinConciliar: 0 });
  }
  const db = supabaseServicio();
  const conexiones = await conexionesDe(db, user.id);
  // El panel pregunta en cada carga: sin bancos no hay nada que contar.
  const sinConciliar = conexiones.length ? await sinConciliarDe(db, user.id).catch(() => 0) : 0;
  return NextResponse.json({ disponible: true, conexiones: conexiones.map(c => vistaDeConexion(c)), sinConciliar });
}

export async function DELETE(request: Request) {
  const user = await usuario();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Falta la conexión' }, { status: 400 });
  const db = supabaseServicio();
  const { data: c } = await db.from('bancos_conectados').select('session_id').eq('id', id).eq('user_id', user.id).maybeSingle();
  if (!c) return NextResponse.json({ error: 'No existe' }, { status: 404 });
  try { await borrarSesion(c.session_id); } catch { /* ya caducada en el banco: se borra igual aquí */ }
  await db.from('bancos_conectados').delete().eq('id', id).eq('user_id', user.id);
  return NextResponse.json({ ok: true });
}
