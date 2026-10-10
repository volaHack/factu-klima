/**
 * GET /api/cron/banco — cada mañana, los movimientos y saldos nuevos de
 * todas las empresas con banco conectado. Una lectura al día por cuenta,
 * dentro de las cuatro que PSD2 permite sin el usuario delante.
 */

import { NextResponse } from 'next/server';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { enableBankingConfigurado } from '@/lib/banco/enableBanking';
import { sincronizarTodas } from '@/lib/banco/sincronizar';
import { cronAutorizado } from '@/lib/seguridad/secretos';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!cronAutorizado(request)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!enableBankingConfigurado()) return NextResponse.json({ ok: true, omitido: 'sin configurar' });
  const resumen = await sincronizarTodas(supabaseServicio());
  return NextResponse.json({ ok: true, ...resumen });
}
