import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';

/**
 * Abre el Customer Portal de Stripe: cambiar de plan, tarjeta o cancelar.
 * Lo que el cliente cambie allí vuelve por el webhook, que es quien
 * escribe `suscripciones`.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return NextResponse.json({ error: 'Stripe no está configurado' }, { status: 500 });

  const { data: fila } = await supabase
    .from('suscripciones')
    .select('stripe_customer_id')
    .maybeSingle();
  if (!fila?.stripe_customer_id) {
    return NextResponse.json({ error: 'Esta cuenta no tiene una suscripción de Stripe.' }, { status: 400 });
  }

  const session = await new Stripe(secretKey).billingPortal.sessions.create({
    customer: fila.stripe_customer_id,
    return_url: `${new URL(request.url).origin}/ajustes`,
  });
  return NextResponse.json({ url: session.url });
}
