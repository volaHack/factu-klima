/**
 * /api/banco/movimientos — los movimientos guardados del banco conectado.
 *   GET   ?desde=AAAA-MM-DD&cuenta=uid  → { movimientos } (con si están conciliados)
 *   PATCH { id, ignorado }               → apartar o recuperar un movimiento
 *
 * Lo ignorado se guarda en el servidor: vale en todos los dispositivos.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { conciliadosDe } from '@/lib/banco/servidor';

export const dynamic = 'force-dynamic';

async function usuario() {
  const { data: { user } } = await (await createClient()).auth.getUser();
  return user;
}

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const user = await usuario();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const url = new URL(request.url);
  const desdeQ = url.searchParams.get('desde');
  const desde = desdeQ && RE_FECHA.test(desdeQ) ? desdeQ : new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const cuenta = url.searchParams.get('cuenta');

  const db = supabaseServicio();
  let q = db.from('banco_movimientos')
    .select('id, cuenta_uid, iban, fecha, importe, concepto, referencia, saldo, ignorado')
    .eq('user_id', user.id).gte('fecha', desde)
    .order('fecha', { ascending: false }).limit(3000);
  if (cuenta) q = q.eq('cuenta_uid', cuenta);
  const [{ data, error }, hechos] = await Promise.all([q, conciliadosDe(db, user.id)]);
  if (error) return NextResponse.json({ error: 'No se han podido leer los movimientos.' }, { status: 500 });

  return NextResponse.json({
    desde,
    movimientos: (data ?? []).map(m => ({
      id: m.id, cuenta: m.cuenta_uid, iban: m.iban, fecha: m.fecha, importe: Number(m.importe),
      concepto: m.concepto, ...(m.referencia ? { referencia: m.referencia } : {}),
      ...(m.saldo != null ? { saldo: Number(m.saldo) } : {}),
      ignorado: m.ignorado, conciliado: hechos.get(m.id) ?? null,
    })),
  });
}

export async function PATCH(request: Request) {
  const user = await usuario();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  const { id, ignorado } = await request.json().catch(() => ({}));
  if (typeof id !== 'string' || !/^[a-z0-9]{3,64}$/.test(id) || typeof ignorado !== 'boolean') {
    return NextResponse.json({ error: 'Petición mal formada.' }, { status: 400 });
  }
  const { error } = await supabaseServicio().from('banco_movimientos').update({ ignorado }).eq('user_id', user.id).eq('id', id);
  if (error) return NextResponse.json({ error: 'No se ha podido guardar.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
