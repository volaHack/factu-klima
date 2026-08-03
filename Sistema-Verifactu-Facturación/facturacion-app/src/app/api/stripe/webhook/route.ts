import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient as createAdminClient } from '@supabase/supabase-js';

const STRIPE_API_VERSION = '2026-01-28';

/**
 * Webhook de Stripe: marca facturas como pagadas.
 *
 * Este endpoint es público (lo llama Stripe, no un usuario logueado), así
 * que la ÚNICA prueba de autenticidad es la firma criptográfica. Antes
 * había un modo de respaldo que hacía JSON.parse del cuerpo cuando no
 * había secreto configurado: eso permitía a cualquiera enviar un POST y
 * marcar como cobrada una factura que nadie ha pagado. Ese camino ya no
 * existe: sin firma válida, no se procesa nada.
 *
 * Idempotencia: Stripe reintenta la entrega de un mismo evento (at-least-
 * once delivery) si no respondemos 2xx a tiempo, así que este handler
 * puede recibir el mismo `checkout.session.completed` más de una vez. No
 * hace falta una tabla de `processed_event_ids`: el UPDATE de abajo lleva
 * la condición `.in('status', ['emitida', 'pendiente', 'vencida'])`, de
 * forma que en la segunda entrega la factura ya está en `pagada`, la
 * cláusula WHERE no encuentra fila que actualizar, Supabase devuelve 0
 * filas afectadas SIN error, y respondemos 200 igualmente. El evento
 * repetido es un no-op seguro, no un fallo ni una doble escritura.
 *
 * ------------------------------------------------------------------
 * CHECKLIST DE PUESTA EN PRODUCCIÓN (pendiente de que Elena lo haga a
 * mano en su dashboard de Stripe — nada de esto se puede automatizar
 * desde el código):
 *
 * 1. Variables de entorno del servidor (hosting, no en el navegador):
 *    STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE_SERVICE_ROLE_KEY
 *    (las tres ya documentadas con más detalle en .env.example).
 * 2. Stripe Dashboard → Developers → Webhooks → Add endpoint:
 *    URL = https://TU-DOMINIO-REAL/api/stripe/webhook
 *    Evento a escuchar: checkout.session.completed
 *    (Con eso basta para el flujo actual: tarjeta, cobro inmediato. Si
 *    Elena activa métodos de pago asíncronos como SEPA o Bizum desde el
 *    dashboard de Stripe, este handler tendría que ampliarse para
 *    escuchar también checkout.session.async_payment_succeeded /
 *    _failed, porque con esos métodos el pago no se confirma en el
 *    momento del checkout.)
 * 3. Copiar el "Signing secret" (whsec_...) de ESE endpoint concreto a
 *    STRIPE_WEBHOOK_SECRET. Cada endpoint tiene su propio secreto.
 * 4. Pasar de test mode a live mode en el dashboard de Stripe y sustituir
 *    las claves sk_test_/pk_test_ por sk_live_/pk_live_ en el entorno de
 *    producción y en Ajustes → Cobros con Stripe (Publishable Key).
 * 5. Rellenar el perfil público de la cuenta Stripe (Settings → Public
 *    details): nombre del negocio, logo, email de soporte — eso es lo
 *    que ve el cliente en la pantalla de Checkout, no lo pone el código.
 * 6. Probar el flujo completo en live mode con un cobro real pequeño
 *    antes de anunciarlo a clientes: /aprobar/[token] → pagar → volver
 *    → comprobar que la factura pasa a "pagada" y que el webhook
 *    aparece como "Succeeded" en Stripe Dashboard → Developers →
 *    Webhooks → (endpoint) → recent deliveries.
 * ------------------------------------------------------------------
 */
export async function POST(request: Request) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secretKey || !webhookSecret) {
    console.error('Webhook rechazado: faltan STRIPE_SECRET_KEY o STRIPE_WEBHOOK_SECRET.');
    return NextResponse.json({ error: 'Webhook no configurado' }, { status: 500 });
  }
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Webhook rechazado: falta SUPABASE_SERVICE_ROLE_KEY.');
    return NextResponse.json({ error: 'Webhook no configurado' }, { status: 500 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Falta la firma de Stripe' }, { status: 400 });
  }

  const stripe = new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion });

  let event: Stripe.Event;
  try {
    const rawBody = await request.text();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error('Firma de webhook inválida:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Firma inválida' }, { status: 400 });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;

      // Sólo cuenta como cobrada si Stripe confirma que el pago se liquidó.
      if (session.payment_status !== 'paid') {
        return NextResponse.json({ received: true, ignored: 'payment_status no es "paid"' });
      }

      const invoiceId = session.client_reference_id || session.metadata?.invoiceId;
      if (!invoiceId) {
        return NextResponse.json({ received: true, ignored: 'sin invoiceId' });
      }

      // Stripe no lleva la sesión del usuario, así que aquí se usa la
      // service role key. Nunca se expone al navegador: sólo vive en el
      // entorno del servidor.
      const admin = createAdminClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      // Actualización mínima y acotada: sólo el estado de cobro. No se
      // tocan importes, fechas de emisión ni la huella — el trigger
      // antifraude rechazaría cualquier intento.
      const { error } = await admin
        .from('invoices')
        .update({
          status: 'pagada',
          paid_date: new Date().toISOString().split('T')[0],
        })
        .eq('id', invoiceId)
        .in('status', ['emitida', 'pendiente', 'vencida']);

      if (error) {
        console.error('No se pudo marcar la factura como pagada:', error.message);
        return NextResponse.json({ error: 'Error al actualizar la factura' }, { status: 500 });
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('Error procesando el webhook:', err);
    return NextResponse.json({ error: 'Error procesando el webhook' }, { status: 500 });
  }
}
