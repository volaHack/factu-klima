/** GET /api/cobros/estado — en qué punto está el cobro online del negocio. */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { cuentaDeCobro, refrescarCuenta, stripeServidor } from '@/lib/cobroOnline/servidor';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const stripe = stripeServidor();
  const db = supabaseServicio();
  if (!stripe) return NextResponse.json({ disponible: false, conectada: false, activos: false, datosEnviados: false });

  let cuenta = await cuentaDeCobro(db, user.id);
  // Mientras no está activa se pregunta a Stripe: el alta se termina allí.
  if (cuenta && !cuenta.cobrosActivos) {
    try { cuenta = await refrescarCuenta(db, stripe, user.id); } catch { /* se queda lo guardado */ }
  }
  return NextResponse.json({
    disponible: true,
    conectada: !!cuenta,
    activos: !!cuenta?.cobrosActivos,
    datosEnviados: !!cuenta?.datosEnviados,
  });
}
