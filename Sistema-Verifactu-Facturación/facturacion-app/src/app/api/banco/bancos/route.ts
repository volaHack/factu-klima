/** GET /api/banco/bancos — los bancos españoles que se pueden conectar. */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { bancosDe, enableBankingConfigurado, type BancoDisponible } from '@/lib/banco/enableBanking';

export const dynamic = 'force-dynamic';

// La lista cambia poco: una hora en memoria ahorra una llamada por visita.
let cache: { en: number; bancos: BancoDisponible[] } | null = null;

export async function GET() {
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  if (!enableBankingConfigurado()) return NextResponse.json({ disponible: false, bancos: [] });
  try {
    if (!cache || Date.now() - cache.en > 3_600_000) cache = { en: Date.now(), bancos: await bancosDe('ES') };
    return NextResponse.json({ disponible: true, bancos: cache.bancos });
  } catch (e) {
    console.error('No se ha podido leer la lista de bancos:', e);
    return NextResponse.json({ error: 'No se ha podido cargar la lista de bancos.' }, { status: 502 });
  }
}
