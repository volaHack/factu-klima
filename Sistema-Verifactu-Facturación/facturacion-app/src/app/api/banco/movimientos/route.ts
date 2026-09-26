/**
 * POST /api/banco/movimientos { conexionId, cuenta, desde } — los
 * movimientos de una cuenta conectada, ya en el formato de la conciliación.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { transacciones } from '@/lib/banco/enableBanking';
import { movimientosDesdeBanco } from '@/lib/banco/conectado';
import { checkRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  // Los bancos limitan las lecturas sin el usuario delante (unas 4 al día por cuenta).
  if (!(await checkRateLimit(`banco-mov:${user.id}`, 20, 3600))) {
    return NextResponse.json({ error: 'Demasiadas lecturas seguidas. Espera un rato.' }, { status: 429 });
  }

  const { conexionId, cuenta, desde } = await request.json().catch(() => ({}));
  if (typeof conexionId !== 'string' || typeof cuenta !== 'string') return NextResponse.json({ error: 'Falta la cuenta.' }, { status: 400 });
  const fechaDesde = typeof desde === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(desde)
    ? desde
    : new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);

  const db = supabaseServicio();
  const { data: c } = await db.from('bancos_conectados')
    .select('id, cuentas, valido_hasta').eq('id', conexionId).eq('user_id', user.id).maybeSingle();
  if (!c) return NextResponse.json({ error: 'No existe esa conexión.' }, { status: 404 });
  if (c.valido_hasta && new Date(c.valido_hasta).getTime() < Date.now()) {
    return NextResponse.json({ error: 'El permiso del banco ha caducado. Vuelve a conectarlo.' }, { status: 409 });
  }
  const datos = (c.cuentas as { uid: string; iban: string | null }[]).find(x => x.uid === cuenta);
  if (!datos) return NextResponse.json({ error: 'Esa cuenta no es de esta conexión.' }, { status: 404 });

  try {
    const movimientos = movimientosDesdeBanco(await transacciones(cuenta, fechaDesde), datos.iban ?? cuenta);
    await db.from('bancos_conectados').update({ ultima_lectura: new Date().toISOString() }).eq('id', c.id);
    return NextResponse.json({ cuenta: datos.iban, desde: fechaDesde, movimientos });
  } catch (e) {
    console.error('No se han podido leer los movimientos:', e);
    return NextResponse.json({ error: 'El banco no ha devuelto los movimientos. Inténtalo en un momento.' }, { status: 502 });
  }
}
