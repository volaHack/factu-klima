import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { decryptString } from '@/lib/encryption';

/**
 * Webhook de Stripe específico para inquilinos (tenants).
 * Cada empresa configura esta URL (con su userId) en su propio Stripe Dashboard.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;
  if (!userId) {
    return NextResponse.json({ error: 'Falta userId en la URL' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Webhook rechazado: falta SUPABASE_SERVICE_ROLE_KEY.');
    return NextResponse.json({ error: 'Webhook no configurado' }, { status: 500 });
  }

  // Stripe no lleva la sesión del usuario, así que aquí se usa la service role key.
  const admin = createAdminClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: keys } = await admin
    .from('stripe_connections')
    .select('encrypted_secret_key, encrypted_webhook_secret')
    .eq('user_id', userId)
    .single();

  if (!keys?.encrypted_webhook_secret || !keys?.encrypted_secret_key) {
    console.error(`Webhook rechazado: la empresa ${userId} no tiene configurado el webhook_secret o secret_key.`);
    return NextResponse.json({ error: 'Configuración incompleta' }, { status: 400 });
  }

  const secretKey = decryptString(keys.encrypted_secret_key);
  const webhookSecret = decryptString(keys.encrypted_webhook_secret);

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Falta la firma de Stripe' }, { status: 400 });
  }

  const stripe = new Stripe(secretKey);

  let event: Stripe.Event;
  try {
    const rawBody = await request.text();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error(`Firma de webhook inválida para tenant ${userId}:`, err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Firma inválida' }, { status: 400 });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;

      if (session.payment_status !== 'paid') {
        return NextResponse.json({ received: true, ignored: 'payment_status no es "paid"' });
      }

      // Este endpoint es SOLO para pagos de facturas de inquilinos, NO para suscripciones SaaS.
      if (session.mode === 'subscription') {
        return NextResponse.json({ received: true, ignored: 'Las suscripciones SaaS deben ir al webhook global.' });
      }

      const invoiceId = session.client_reference_id || session.metadata?.invoiceId;
      if (!invoiceId) {
        console.error('Webhook: no se encontró invoiceId en la sesión');
        return NextResponse.json({ received: true, ignored: 'sin referencia a factura' });
      }

      // IMPORTANTE: nos aseguramos de que esta factura pertenezca realmente al tenant
      // para evitar que alguien con un webhook configurado pague facturas de otros.
      const { data: invoice } = await admin
        .from('invoices')
        .select('id, user_id')
        .eq('id', invoiceId)
        .single();
        
      if (!invoice || invoice.user_id !== userId) {
        console.error(`Webhook: intento de pagar factura ${invoiceId} que no pertenece al tenant ${userId}`);
        return NextResponse.json({ received: true, ignored: 'factura no pertenece a este inquilino' });
      }

      const paidDate = new Date().toISOString().split('T')[0];
      const { error } = await admin
        .from('invoices')
        .update({
          status: 'pagada',
          paid_date: paidDate,
          stripe_session_id: session.id,
          paid_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', invoiceId)
        .in('status', ['emitida', 'pendiente', 'vencida', 'borrador']);

      if (error) {
        console.error(`Error actualizando factura ${invoiceId}:`, error.message);
        return NextResponse.json({ error: 'No se pudo actualizar la factura' }, { status: 500 });
      }

      console.log(`Factura ${invoiceId} del tenant ${userId} cobrada vía Stripe.`);
      return NextResponse.json({ received: true });
    }

    return NextResponse.json({ received: true, ignored: 'tipo de evento no procesado' });
  } catch (err) {
    console.error('Error interno procesando webhook:', err);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
