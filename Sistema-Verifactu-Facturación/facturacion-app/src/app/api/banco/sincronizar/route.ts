/**
 * POST /api/banco/sincronizar { conexionId? } — «Sincronizar ahora»: lee
 * del banco los movimientos y saldos nuevos de una conexión (o de todas las
 * de la empresa) y los guarda.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { enableBankingConfigurado } from '@/lib/banco/enableBanking';
import { sincronizarConexion } from '@/lib/banco/sincronizar';
import { conexionesDe, vistaDeConexion } from '@/lib/banco/servidor';
import { checkRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (!enableBankingConfigurado()) return NextResponse.json({ error: 'La conexión con bancos no está disponible todavía.' }, { status: 503 });
  // Con el usuario delante los bancos dejan leer más, pero no sin límite.
  if (!(await checkRateLimit(`banco-sync:${user.id}`, 6, 3600))) {
    return NextResponse.json({ error: 'Ya se ha sincronizado varias veces en la última hora. Prueba un poco más tarde.' }, { status: 429 });
  }

  const { conexionId } = await request.json().catch(() => ({}));
  const db = supabaseServicio();
  const todas = await conexionesDe(db, user.id);
  const elegidas = typeof conexionId === 'string' ? todas.filter(c => c.id === conexionId) : todas.filter(c => c.estado !== 'caducada');
  if (typeof conexionId === 'string' && elegidas.length === 0) return NextResponse.json({ error: 'No existe esa conexión.' }, { status: 404 });

  let nuevos = 0;
  let caducadas = 0;
  const errores: string[] = [];
  for (const c of elegidas) {
    try {
      const r = await sincronizarConexion(db, c);
      nuevos += r.nuevos;
      if (r.caducada) caducadas += 1;
      if (r.error) errores.push(`${c.banco}: ${r.error}`);
    } catch (e) {
      console.error('No se ha podido sincronizar:', e instanceof Error ? e.message : e);
      errores.push(`${c.banco}: no ha respondido`);
    }
  }
  const conexiones = (await conexionesDe(db, user.id)).map(c => vistaDeConexion(c));
  return NextResponse.json({ nuevos, caducadas, errores, conexiones });
}
