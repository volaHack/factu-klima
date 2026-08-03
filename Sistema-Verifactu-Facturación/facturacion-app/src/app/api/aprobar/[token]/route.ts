import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { checkRateLimit, clientIpFromRequest } from '@/lib/rateLimit';
import {
  mapInvoiceFromDb, mapSettingsFromDb, mapApprovalFromDb,
} from '@/lib/storage';

/**
 * Portal público de aprobación de pedidos (sin login): lee la aprobación,
 * la factura asociada y los datos de la empresa emisora usando la service
 * role key. RLS bloquea el acceso anónimo directo a estas tablas desde el
 * navegador (migration_004), así que esta ruta de servidor es el único
 * camino legítimo para que un cliente externo vea su pedido.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'Token inválido' }, { status: 400 });
  }

  const allowed = await checkRateLimit(`aprobar-get:${clientIpFromRequest(request)}`, 30, 3600);
  if (!allowed) {
    return NextResponse.json({ error: 'Demasiados intentos. Inténtalo más tarde.' }, { status: 429 });
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
    .from('order_approvals')
    .select('*')
    .eq('token', token)
    .single();

  if (!approvalRow) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const { data: invRow } = await admin
    .from('invoices').select('*').eq('id', approvalRow.invoice_id).single();
  if (!invRow) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const { data: lineItemsRows } = await admin
    .from('invoice_line_items').select('*').eq('invoice_id', invRow.id).order('sort_order', { ascending: true });
  const { data: taxBreakdownRows } = await admin
    .from('invoice_tax_breakdown').select('*').eq('invoice_id', invRow.id);
  const { data: itemsRows } = await admin
    .from('order_approval_items').select('*').eq('approval_id', approvalRow.id);
  const { data: settingsRow } = await admin
    .from('company_settings').select('*').eq('user_id', invRow.user_id).limit(1).single();

  return NextResponse.json({
    approval: mapApprovalFromDb(approvalRow),
    invoice: mapInvoiceFromDb(invRow, lineItemsRows || [], taxBreakdownRows || []),
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    items: (itemsRows || []).map((i: any) => ({
      id: i.id, approvalId: i.approval_id, lineItemId: i.line_item_id,
      accepted: i.accepted, adjustedQuantity: i.adjusted_quantity ? Number(i.adjusted_quantity) : null,
      rejectionReason: i.rejection_reason || '',
    })),
    companySettings: settingsRow ? mapSettingsFromDb(settingsRow) : null,
  });
}
