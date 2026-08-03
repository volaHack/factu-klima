import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

const STRIPE_API_VERSION = '2026-01-28';

type InvoiceRow = {
  id: string;
  number: string;
  total: number;
  client_name: string;
  status: string;
  user_id: string;
};

/**
 * Crea una sesión de pago de Stripe para una factura.
 *
 * Nota de seguridad: el importe se toma SIEMPRE de la factura en base de
 * datos, nunca del cuerpo de la petición. Si el importe llegara desde el
 * cliente, cualquiera podría pagar 1 € una factura de 5.000 €.
 *
 * Hay DOS formas legítimas de llegar aquí, y por tanto dos formas de probar
 * que quien pide el cobro tiene derecho a esa factura:
 *
 * 1) Elena, autenticada, desde /facturas/[id] → se valida con su sesión de
 *    Supabase (RLS garantiza que sólo ve/cobra sus propias facturas).
 * 2) Su cliente, anónimo, desde el portal público /aprobar/[token] → NO
 *    tiene sesión de Elena (ni debe tenerla). Ahí la prueba de legitimidad
 *    es un `approvalToken` válido, no caducado, cuyo `invoice_id` coincide
 *    exactamente con la factura pedida. Se resuelve con la service role key
 *    (igual que el webhook) porque un usuario anónimo no tiene permisos RLS
 *    sobre `invoices`.
 *
 * Antes esta ruta exigía sesión de Supabase SIEMPRE, lo que rompía el botón
 * "Confirmar y pagar pedido online" del portal público: el cliente nunca
 * está logueado como Elena, así que la petición moría en un 401 y el pago
 * jamás llegaba a crear una sesión de Stripe.
 */
export async function POST(request: Request) {
  try {
    const { invoiceId, approvalToken } = await request.json();

    if (!invoiceId || typeof invoiceId !== 'string') {
      return NextResponse.json({ error: 'Falta invoiceId' }, { status: 400 });
    }

    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      return NextResponse.json(
        { error: 'Stripe no está configurado. Define STRIPE_SECRET_KEY en el servidor.' },
        { status: 500 },
      );
    }

    let invoice: InvoiceRow | null = null;
    const isPublicApprovalFlow = typeof approvalToken === 'string' && approvalToken.length > 0;

    if (isPublicApprovalFlow) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!supabaseUrl || !serviceRoleKey) {
        console.error('Checkout público rechazado: falta SUPABASE_SERVICE_ROLE_KEY.');
        return NextResponse.json({ error: 'Pago online no disponible' }, { status: 500 });
      }

      const admin = createAdminClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const { data: approval } = await admin
        .from('order_approvals')
        .select('invoice_id, expires_at')
        .eq('token', approvalToken)
        .single();

      // El token debe existir y apuntar EXACTAMENTE a la factura pedida.
      // Sin esto, alguien con un token de SU propio pedido podría intentar
      // pagar el invoiceId de otro cliente cambiando sólo ese campo.
      if (!approval || approval.invoice_id !== invoiceId) {
        return NextResponse.json({ error: 'Enlace de pago no válido' }, { status: 403 });
      }
      if (new Date(approval.expires_at) < new Date()) {
        return NextResponse.json({ error: 'Este enlace ha caducado' }, { status: 403 });
      }

      const { data } = await admin
        .from('invoices')
        .select('id, number, total, client_name, status, user_id')
        .eq('id', invoiceId)
        .single();
      invoice = data;
    } else {
      // Cliente con la sesión del usuario: RLS garantiza que sólo pueda
      // cobrar sus propias facturas.
      const supabase = await createClient();

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
      }

      const { data } = await supabase
        .from('invoices')
        .select('id, number, total, client_name, status, user_id')
        .eq('id', invoiceId)
        .single();
      invoice = data;
    }

    if (!invoice) {
      return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });
    }
    if (invoice.status === 'pagada') {
      return NextResponse.json({ error: 'Esta factura ya está pagada' }, { status: 409 });
    }
    if (invoice.status === 'anulada') {
      return NextResponse.json({ error: 'Esta factura está anulada' }, { status: 409 });
    }

    const amountCents = Math.round(Number(invoice.total) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return NextResponse.json({ error: 'El importe de la factura no es válido' }, { status: 400 });
    }

    const stripe = new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion });

    // El origen se deriva de la petición, no de un campo que mande el
    // cliente: así no se puede redirigir el pago a un dominio ajeno.
    const baseUrl = new URL(request.url).origin;

    // El destino tras pagar/cancelar depende de quién paga: Elena vuelve a
    // su panel (autenticado); su cliente, anónimo, vuelve al portal público
    // — si lo mandáramos a /facturas/[id] chocaría con el login y nunca
    // vería confirmación de que su pago se recibió.
    const successUrl = isPublicApprovalFlow
      ? `${baseUrl}/aprobar/${approvalToken}?paid=true`
      : `${baseUrl}/facturas/${invoice.id}?paid=true`;
    const cancelUrl = isPublicApprovalFlow
      ? `${baseUrl}/aprobar/${approvalToken}?cancelled=true`
      : `${baseUrl}/facturas/${invoice.id}?cancelled=true`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: `Factura ${invoice.number}`,
            description: `Pago de la factura ${invoice.number} — ${invoice.client_name}`,
          },
          unit_amount: amountCents,
        },
        quantity: 1,
      }],
      client_reference_id: invoice.id,
      metadata: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.number,
        userId: invoice.user_id,
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('Error creating Stripe Checkout session:', err);
    return NextResponse.json({ error: 'Error al conectar con Stripe' }, { status: 500 });
  }
}
