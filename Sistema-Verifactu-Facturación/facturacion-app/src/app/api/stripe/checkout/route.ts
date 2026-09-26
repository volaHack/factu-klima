import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { checkRateLimit, clientIpFromRequest } from '@/lib/rateLimit';
import { aCentimos, pendienteDeCobro, sePuedePagarOnline } from '@/lib/cobroOnline/calculo';
import { cuentaDeCobro, stripeServidor } from '@/lib/cobroOnline/servidor';

type FilaFactura = {
  id: string;
  number: string;
  total: number;
  subtotal: number;
  retencion_pct: number | null;
  paid_amount: number | null;
  client_id: string | null;
  client_name: string;
  status: string;
  user_id: string;
};

const COLUMNAS = 'id, number, total, subtotal, retencion_pct, paid_amount, client_id, client_name, status, user_id';

/**
 * Crea el pago con tarjeta (Stripe Checkout) de una factura.
 *
 * El importe sale SIEMPRE de la factura en la base de datos —lo que falta
 * por cobrar—, nunca del cuerpo de la petición: si no, cualquiera podría
 * pagar 1 € una factura de 5.000 €.
 *
 * El dinero va a la cuenta de Stripe DEL NEGOCIO (ver lib/cobroOnline/
 * servidor.ts). Si el negocio no ha activado el cobro online, no se cobra:
 * antes se creaba el pago en la cuenta de la plataforma.
 *
 * Tres formas legítimas de llegar, y cada una prueba su derecho a pagar:
 *  1. El propio negocio, con su sesión (RLS: sólo ve sus facturas).
 *  2. Su cliente desde /aprobar/[token]: el token apunta a ESA factura.
 *  3. Su cliente desde el portal /portal/[token]: el token es de ese
 *     cliente de ese negocio, y la factura tiene que ser suya.
 */
export async function POST(request: Request) {
  try {
    const { invoiceId, approvalToken, portalToken } = await request.json();
    const publico = (typeof approvalToken === 'string' && approvalToken.length > 0)
      || (typeof portalToken === 'string' && portalToken.length > 0);

    if (publico && !(await checkRateLimit(`checkout-public:${clientIpFromRequest(request)}`, 10, 3600))) {
      return NextResponse.json({ error: 'Demasiados intentos. Inténtalo más tarde.' }, { status: 429 });
    }
    if (!invoiceId || typeof invoiceId !== 'string') {
      return NextResponse.json({ error: 'Falta invoiceId' }, { status: 400 });
    }

    const stripe = stripeServidor();
    if (!stripe) return NextResponse.json({ error: 'El pago online no está disponible ahora mismo.' }, { status: 503 });

    const db = supabaseServicio();
    let factura: FilaFactura | null = null;
    const baseUrl = new URL(request.url).origin;
    let vuelta: { ok: string; cancelado: string };

    if (typeof approvalToken === 'string' && approvalToken.length > 0) {
      const { data: aprobacion } = await db.from('order_approvals')
        .select('invoice_id, expires_at').eq('token', approvalToken).single();
      if (!aprobacion || aprobacion.invoice_id !== invoiceId) {
        return NextResponse.json({ error: 'Enlace de pago no válido' }, { status: 403 });
      }
      if (new Date(aprobacion.expires_at) < new Date()) {
        return NextResponse.json({ error: 'Este enlace ha caducado' }, { status: 403 });
      }
      ({ data: factura } = await db.from('invoices').select(COLUMNAS).eq('id', invoiceId).single<FilaFactura>());
      vuelta = { ok: `${baseUrl}/aprobar/${approvalToken}?paid=true`, cancelado: `${baseUrl}/aprobar/${approvalToken}?cancelled=true` };
    } else if (typeof portalToken === 'string' && portalToken.length > 0) {
      const { data: enlace } = await db.from('portal_clientes')
        .select('user_id, client_id, revocado_en').eq('token', portalToken).maybeSingle();
      if (!enlace || enlace.revocado_en) return NextResponse.json({ error: 'Enlace no válido' }, { status: 403 });
      ({ data: factura } = await db.from('invoices').select(COLUMNAS).eq('id', invoiceId).single<FilaFactura>());
      // La factura tiene que ser de ESE cliente de ESE negocio.
      if (factura && (factura.user_id !== enlace.user_id || factura.client_id !== enlace.client_id)) factura = null;
      const portal = `${baseUrl}/portal/${portalToken}`;
      vuelta = { ok: `${portal}?pagado=${invoiceId}`, cancelado: `${portal}?cancelado=${invoiceId}` };
    } else {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
      ({ data: factura } = await supabase.from('invoices').select(COLUMNAS).eq('id', invoiceId).single<FilaFactura>());
      vuelta = { ok: `${baseUrl}/facturas/${invoiceId}?paid=true`, cancelado: `${baseUrl}/facturas/${invoiceId}?cancelled=true` };
    }

    if (!factura) return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });
    if (factura.status === 'pagada') return NextResponse.json({ error: 'Esta factura ya está pagada' }, { status: 409 });
    if (factura.status === 'anulada') return NextResponse.json({ error: 'Esta factura está anulada' }, { status: 409 });
    if (!sePuedePagarOnline(factura)) {
      return NextResponse.json({ error: 'Esta factura no se puede pagar online.' }, { status: 409 });
    }

    const cuenta = await cuentaDeCobro(db, factura.user_id);
    if (!cuenta?.cobrosActivos) {
      return NextResponse.json(
        { error: 'Este negocio todavía no tiene activado el cobro con tarjeta. Paga por transferencia o contacta con él.' },
        { status: 409 },
      );
    }

    const importe = pendienteDeCobro(factura);
    const metadata = { tipo: 'cobro_factura', invoiceId: factura.id, invoiceNumber: factura.number, userId: factura.user_id };

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: { name: `Factura ${factura.number}`, description: factura.client_name },
          unit_amount: aCentimos(importe),
        },
        quantity: 1,
      }],
      payment_intent_data: {
        on_behalf_of: cuenta.stripeAccountId,
        transfer_data: { destination: cuenta.stripeAccountId },
        description: `Factura ${factura.number}`,
        metadata,
      },
      client_reference_id: factura.id,
      metadata,
      success_url: vuelta.ok,
      cancel_url: vuelta.cancelado,
    });

    await db.from('cobros_online').insert({
      user_id: factura.user_id, invoice_id: factura.id, stripe_session_id: session.id, importe,
    });

    return NextResponse.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('Error creando el pago con Stripe:', err);
    return NextResponse.json({ error: 'No se ha podido conectar con el sistema de pago.' }, { status: 500 });
  }
}
