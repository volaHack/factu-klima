import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { getPlan } from '@/lib/plans';
import { checkRateLimit, clientIpFromRequest } from '@/lib/rateLimit';
import { zonaFiscal } from '@/lib/plataforma/impuestos';

/**
 * Inicia un Checkout de Stripe en modo suscripción (planes de precio).
 * Distinto de /api/stripe/checkout, que cobra facturas puntuales en modo
 * 'payment' — son dos flujos Stripe separados a propósito (ver diseño en
 * docs/plans/2026-08-08-precios-suscripciones-stripe-design.md).
 */
export async function POST(request: Request) {
  const allowed = await checkRateLimit(`subscribe:${clientIpFromRequest(request)}`, 10, 3600);
  if (!allowed) {
    return NextResponse.json({ error: 'Demasiados intentos. Inténtalo más tarde.' }, { status: 429 });
  }

  const { planId, interval } = await request.json();
  const plan = getPlan(planId);
  if (!plan || (interval !== 'month' && interval !== 'year')) {
    return NextResponse.json({ error: 'Plan o periodicidad no válidos' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    // El frontend interpreta este código para mandar a /login?next=/precios
    return NextResponse.json({ error: 'No autenticado', requiresLogin: true }, { status: 401 });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json({ error: 'Stripe no está configurado' }, { status: 500 });
  }
  const priceEnvVar = interval === 'month' ? plan.stripePriceEnvMonthly : plan.stripePriceEnvAnnual;
  const priceId = process.env[priceEnvVar];
  if (!priceId) {
    console.error(`Falta la variable de entorno ${priceEnvVar} (Price de Stripe para ${plan.id}/${interval})`);
    return NextResponse.json({ error: `Falta configurar el precio de Stripe para ${plan.name}` }, { status: 500 });
  }

  const stripe = new Stripe(secretKey);
  const baseUrl = new URL(request.url).origin;

  // Los datos fiscales del cliente van en su factura, y el plan anual
  // supera los 400 € de la simplificada: sin NIF y dirección no hay factura.
  const { data: ajustes } = await supabase
    .from('company_settings')
    .select('nif, business_name, address, postal_code')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!ajustes?.nif?.trim() || !ajustes.business_name?.trim() || !ajustes.address?.trim() || !ajustes.postal_code?.trim()) {
    return NextResponse.json({
      error: 'Antes de suscribirte, completa en Ajustes tu NIF, razón social y dirección: van en la factura de tu plan.',
      requiresSettings: true,
    }, { status: 400 });
  }

  const { data: sus } = await supabase.from('suscripciones').select('stripe_customer_id').maybeSingle();
  const customer = sus?.stripe_customer_id || undefined;

  const { data: cfg } = await supabaseServicio().from('plataforma_config')
    .select('cobrar_impuesto, regimen_igic, stripe_tax_rate_igic').single();
  const sumarIgic = Boolean(
    cfg?.cobrar_impuesto &&
    cfg.regimen_igic === 'general' &&
    cfg.stripe_tax_rate_igic &&
    zonaFiscal(ajustes.postal_code) === 'canarias'
  );

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer,
    customer_email: customer ? undefined : user.email,
    client_reference_id: user.id,
    line_items: [{ price: priceId, quantity: 1 }],
    // Sin esto, Stripe Checkout NO pinta la casilla de código de
    // descuento. La página de precios enseña el cupón de lanzamiento y
    // hasta tiene un botón para copiarlo, así que el cliente llegaba
    // aquí con el código en el portapapeles, sin ningún sitio donde
    // pegarlo, y pagaba el precio entero: la página prometía −50% y la
    // pasarela cobraba el 100%.
    allow_promotion_codes: true,
    tax_id_collection: { enabled: true },
    ...(customer ? { customer_update: { name: 'auto' as const, address: 'auto' as const } } : {}),
    metadata: { userId: user.id, planId: plan.id },
    subscription_data: {
      metadata: { userId: user.id, planId: plan.id },
      ...(sumarIgic ? { default_tax_rates: [cfg!.stripe_tax_rate_igic!] } : {}),
    },
    success_url: `${baseUrl}/dashboard?subscribed=true`,
    cancel_url: `${baseUrl}/precios?cancelled=true`,
  });

  return NextResponse.json({ url: session.url });
}
