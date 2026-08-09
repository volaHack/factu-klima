import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { checkRateLimit, clientIpFromRequest } from '@/lib/rateLimit';

interface RespondBody {
  items: { lineItemId: string; accepted: boolean; adjustedQuantity?: number; rejectionReason?: string }[];
  clientMessage?: string;
}

/**
 * Recibe la respuesta del cliente al portal público de aprobación (sin
 * login). Usa la service role key por el mismo motivo que el GET de esta
 * misma ruta: RLS bloquea el acceso anónimo a order_approvals/
 * order_approval_items desde el navegador.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'Token inválido' }, { status: 400 });
  }

  const allowed = await checkRateLimit(`aprobar-respond:${clientIpFromRequest(request)}`, 10, 3600);
  if (!allowed) {
    return NextResponse.json({ error: 'Demasiados intentos. Inténtalo más tarde.' }, { status: 429 });
  }

  let body: RespondBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }
  if (!Array.isArray(body.items)) {
    return NextResponse.json({ error: 'Faltan items' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Portal de aprobación no disponible: falta SUPABASE_SERVICE_ROLE_KEY.');
    return NextResponse.json({ error: 'Servicio no disponible' }, { status: 500 });
  }
  const admin = createAdminClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: approvalRow } = await admin
    .from('order_approvals').select('*').eq('token', token).single();

  if (!approvalRow) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (approvalRow.status !== 'pending') {
    return NextResponse.json({ error: 'already_responded' }, { status: 409 });
  }
  if (new Date(approvalRow.expires_at) < new Date()) {
    return NextResponse.json({ error: 'expired' }, { status: 410 });
  }

  // Los lineItemId deben pertenecer a ESTA factura (la resuelta por el
  // token), no a cualquier UUID que llegue en el body: si no, un item
  // manipulado podría apuntar a la línea de otra factura ajena.
  const { data: ownLineItems } = await admin
    .from('invoice_line_items')
    .select('id')
    .eq('invoice_id', approvalRow.invoice_id);
  const ownLineItemIds = new Set((ownLineItems || []).map(li => li.id));

  if (body.items.some(item => !ownLineItemIds.has(item.lineItemId))) {
    return NextResponse.json({ error: 'Item de pedido no válido' }, { status: 400 });
  }

  const itemRows = body.items.map(item => ({
    approval_id: approvalRow.id,
    line_item_id: item.lineItemId,
    accepted: item.accepted,
    adjusted_quantity: item.adjustedQuantity ?? null,
    rejection_reason: item.rejectionReason || '',
  }));
  const { error: insertError } = await admin.from('order_approval_items').insert(itemRows);
  if (insertError) {
    // A diferencia de la versión original en storage.ts, aquí SÍ se
    // comprueba el error del insert: ignorarlo dejaba al cliente creyendo
    // que su respuesta se había guardado cuando podía no haberlo hecho.
    console.error('Error guardando items de aprobación:', insertError);
    return NextResponse.json({ error: 'No se pudo guardar la respuesta' }, { status: 500 });
  }

  const allAccepted = body.items.every(i => i.accepted && !i.adjustedQuantity);
  const allRejected = body.items.every(i => !i.accepted);
  const status = allAccepted ? 'approved' : allRejected ? 'rejected' : 'partial';
  const invoiceStatus = allAccepted ? 'aprobado' : allRejected ? 'rechazado' : 'aprobado_parcial';

  await admin.from('order_approvals').update({
    status,
    client_message: body.clientMessage || '',
    responded_at: new Date().toISOString(),
  }).eq('id', approvalRow.id);

  await admin.from('invoices').update({
    status: invoiceStatus,
    updated_at: new Date().toISOString(),
  }).eq('id', approvalRow.invoice_id);

  return NextResponse.json({ success: true });
}
