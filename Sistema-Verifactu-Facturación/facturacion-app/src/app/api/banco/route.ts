/**
 * /api/banco — las conexiones del negocio con sus bancos.
 *   GET     lista (sin el session_id, que no sale del servidor)
 *   DELETE  ?id=… desconecta: se borra la sesión en Enable Banking y aquí
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { borrarSesion, enableBankingConfigurado } from '@/lib/banco/enableBanking';

export const dynamic = 'force-dynamic';

async function usuario() {
  const { data: { user } } = await (await createClient()).auth.getUser();
  return user;
}

export async function GET() {
  const user = await usuario();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (!enableBankingConfigurado()) return NextResponse.json({ disponible: false, conexiones: [] });
  const { data } = await supabaseServicio().from('bancos_conectados')
    .select('id, banco, cuentas, valido_hasta, ultima_lectura').eq('user_id', user.id).order('creado_en', { ascending: false });
  const ahora = Date.now();
  return NextResponse.json({
    disponible: true,
    conexiones: (data ?? []).map(c => ({
      id: c.id, banco: c.banco, cuentas: c.cuentas ?? [], validoHasta: c.valido_hasta, ultimaLectura: c.ultima_lectura,
      caducada: !!c.valido_hasta && new Date(c.valido_hasta).getTime() < ahora,
    })),
  });
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
