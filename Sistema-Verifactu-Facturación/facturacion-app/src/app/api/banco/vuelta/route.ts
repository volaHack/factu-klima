/**
 * GET /api/banco/vuelta?code&state — el banco devuelve aquí al negocio tras
 * dar (o negar) el permiso. Se crea la sesión y se vuelve a Conciliación.
 */

import { NextResponse } from 'next/server';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { crearSesion } from '@/lib/banco/enableBanking';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const destino = (estado: string) => NextResponse.redirect(`${url.origin}/conciliacion?banco=${estado}`);
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  if (!state) return destino('error');

  const db = supabaseServicio();
  const { data: aut } = await db.from('bancos_autorizaciones').select('user_id, banco, pais').eq('state', state).maybeSingle();
  // El `state` es de un solo uso.
  await db.from('bancos_autorizaciones').delete().eq('state', state);
  if (!aut) return destino('error');
  if (!code) return destino(url.searchParams.get('error') ? 'cancelado' : 'error');

  try {
    const s = await crearSesion(code);
    const { error } = await db.from('bancos_conectados').insert({
      user_id: aut.user_id, banco: aut.banco, pais: aut.pais, session_id: s.sessionId, cuentas: s.cuentas, valido_hasta: s.validoHasta,
    });
    if (error) throw new Error(error.message);
    return destino('conectado');
  } catch (e) {
    console.error('No se ha podido cerrar la conexión con el banco:', e);
    return destino('error');
  }
}
