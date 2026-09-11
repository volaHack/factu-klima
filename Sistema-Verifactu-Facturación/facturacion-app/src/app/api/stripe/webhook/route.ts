import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { procesarEvento } from '@/lib/stripe/procesarEvento';

/**
 * Webhook de Stripe: suscripciones, pagos de facturas y propinas.
 *
 * Este endpoint es público (lo llama Stripe, no un usuario logueado), así
 * que la ÚNICA prueba de autenticidad es la firma criptográfica.
 *
 * Idempotencia: Stripe reintenta la entrega (at-least-once delivery).
 * `stripe_eventos` deduplica: si el evento ya se procesó, se contesta 200
 * sin volver a ejecutar nada.
 *
 * ------------------------------------------------------------------
 * CHECKLIST DE PUESTA EN PRODUCCIÓN:
 *
 * 1. Variables de entorno del servidor:
 *    STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE_SERVICE_ROLE_KEY
 * 2. Stripe Dashboard → Developers → Webhooks → Add endpoint:
 *    URL = https://TU-DOMINIO-REAL/api/stripe/webhook
 *    Eventos: checkout.session.completed, customer.subscription.created,
 *    customer.subscription.updated, customer.subscription.deleted,
 *    invoice.paid, credit_note.created
 * 3. Copiar el "Signing secret" (whsec_...) a STRIPE_WEBHOOK_SECRET.
 * 4. Pasar de test mode a live mode y sustituir las claves.
 * ------------------------------------------------------------------
 */
export async function POST(request: Request) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secretKey || !webhookSecret) {
    console.error('Webhook rechazado: faltan STRIPE_SECRET_KEY o STRIPE_WEBHOOK_SECRET.');
    return NextResponse.json({ error: 'Webhook no configurado' }, { status: 500 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Falta la firma de Stripe' }, { status: 400 });
  }

  const stripe = new Stripe(secretKey);

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await request.text(), signature, webhookSecret);
  } catch (err) {
    console.error('Firma de webhook inválida:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Firma inválida' }, { status: 400 });
  }

  const db = supabaseServicio();

  // Cada evento, una vez: Stripe entrega «al menos una vez».
  const { error: yaEsta } = await db.from('stripe_eventos').insert({ id: event.id, tipo: event.type });
  if (yaEsta?.code === '23505') {
    const { data } = await db.from('stripe_eventos').select('procesado_en').eq('id', event.id).single();
    if (data?.procesado_en) return NextResponse.json({ received: true, duplicado: true });
  }

  try {
    await procesarEvento(event, db);
    await db.from('stripe_eventos').update({ procesado_en: new Date().toISOString(), error: null }).eq('id', event.id);
    return NextResponse.json({ received: true });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err);
    // «REVISAR:» es un caso que no se arregla reintentando: se apunta,
    // sale en el panel y se contesta 200 para que Stripe no insista.
    const revisar = /^(REVISAR|ANTIFRAUDE|SUSCRIPCION|PLATAFORMA):/.test(mensaje);
    await db.from('stripe_eventos')
      .update({ error: mensaje, procesado_en: revisar ? new Date().toISOString() : null })
      .eq('id', event.id);
    console.error('Error procesando el webhook:', mensaje);
    return NextResponse.json({ received: !revisar ? false : true }, { status: revisar ? 200 : 500 });
  }
}
