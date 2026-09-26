/**
 * POST /api/cobros/panel — enlace de un solo uso al panel de Stripe del
 * negocio: sus cobros, sus transferencias al banco y sus datos.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { cuentaDeCobro, stripeServidor } from '@/lib/cobroOnline/servidor';

export const dynamic = 'force-dynamic';

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const stripe = stripeServidor();
  const cuenta = await cuentaDeCobro(supabaseServicio(), user.id);
  if (!stripe || !cuenta?.datosEnviados) return NextResponse.json({ error: 'El cobro online no está activado.' }, { status: 409 });

  try {
    const enlace = await stripe.accounts.createLoginLink(cuenta.stripeAccountId);
    return NextResponse.json({ url: enlace.url });
  } catch {
    return NextResponse.json({ error: 'No se ha podido abrir el panel de Stripe.' }, { status: 502 });
  }
}
