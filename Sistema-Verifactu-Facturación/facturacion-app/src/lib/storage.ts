// ============================================================
// CAPA DE PERSISTENCIA — OFFLINE-FIRST
// Escribe primero a IndexedDB, luego encola sync con Supabase
// Lecturas: IndexedDB (instant) + background sync desde Supabase
// ============================================================

import { createClient } from '@/lib/supabase/client';
import {
  getAll, getById, put, putMany, remove as removeFromDb,
  clearStore, enqueueSyncAction, isOfflineDbAvailable,
} from './offlineDb';
import { Abono, AbonoAplicacion, Albaran, Client, CompanySettings, CustomCategory, Devolucion, Invoice, InvoiceLineItem, InvoiceStatus, OrderApproval, OrderApprovalItem, PaymentMethod, PosSession, Product, TpvMode, UserProfile } from './types';
import { DEFAULT_APPROVAL_EXPIRY_HOURS, DEFAULT_COMPANY_SETTINGS, SECTOR_DEFAULT_CATEGORIES, defaultTpvModeForSector } from './constants';
import { addDays, calculateInvoiceTotals, formatCurrency, generateId, generateInvoiceNumber } from './utils';
import { expectedCashForSession } from './tpvOffline';

function supabase() {
  return createClient();
}

// ============================================================
// BACKGROUND REFRESH HELPER
// ============================================================

async function backgroundRefresh<T>(
  storeName: string,
  supabaseQuery: () => Promise<{ data: T[] | null; error: unknown }>,
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  mapper?: (item: any) => T,
): Promise<void> {
  if (!navigator.onLine) return;
  try {
    const { data, error } = await supabaseQuery();
    if (!error && data) {
      const mapped = mapper ? data.map(mapper) : data;
      await clearStore(storeName);
      await putMany(storeName, mapped);
    }
  } catch {
    // Silently fail — offline data is still valid
  }
}

// ============================================================
// CACHÉ DE SETTINGS — LOCK DE ESCRITURA
// ============================================================

/**
 * Serializa las escrituras a la fila `settings/company` de IndexedDB.
 *
 * Sin este lock, un background refresh que lea la caché justo antes de que
 * una edición de categorías se materialice, puede acabar escribiendo DESPUÉS
 * la fila de BD (que aún no trae custom_categories) y clobberear la edición.
 * Con el lock, el read+write del refresh es atómico frente al write del edit:
 * o pasa entero antes (y gana el edit) o entero después (y el no-clobber
 * conserva las categorías locales).
 */
let settingsCacheChain: Promise<unknown> = Promise.resolve();

function withSettingsCacheLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = settingsCacheChain.then(fn, fn);
  settingsCacheChain = next.then(() => undefined, () => undefined);
  return next;
}

// ============================================================
// INVOICES
// ============================================================

export async function getInvoices(): Promise<Invoice[]> {
  const offlineAvail = await isOfflineDbAvailable();

  if (offlineAvail) {
    // Try IndexedDB first
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const cached = await getAll<any>('invoices');
    if (cached.length > 0) {
      // Background refresh from Supabase
      refreshInvoicesFromSupabase();
      return cached.map((inv) =>
        mapInvoiceFromDb(inv, inv._lineItems || [], inv._taxBreakdown || [])
      );
    }
  }

  // Fallback to direct Supabase if no local data
  return getInvoicesFromSupabase();
}

async function getInvoicesFromSupabase(): Promise<Invoice[]> {
  if (!navigator.onLine) return [];

  const { data: invoicesData, error } = await supabase()
    .from('invoices')
    .select('*')
    .order('issue_date', { ascending: false });

  if (error || !invoicesData) return [];

  const invoiceIds = invoicesData.map((i: { id: string }) => i.id);

  const { data: lineItemsData } = await supabase()
    .from('invoice_line_items')
    .select('*')
    .in('invoice_id', invoiceIds)
    .order('sort_order', { ascending: true });

  const { data: taxData } = await supabase()
    .from('invoice_tax_breakdown')
    .select('*')
    .in('invoice_id', invoiceIds);

  const invoices = invoicesData.map((inv: Record<string, unknown>) =>
    mapInvoiceFromDb(
      inv,
      (lineItemsData || []).filter((li: { invoice_id: string }) => li.invoice_id === inv.id),
      (taxData || []).filter((tb: { invoice_id: string }) => tb.invoice_id === inv.id),
    )
  );

  // Cache to IndexedDB
  const offlineAvail = await isOfflineDbAvailable();
  if (offlineAvail) {
    const enriched = invoicesData.map((inv: Record<string, unknown>) => ({
      ...inv,
      _lineItems: (lineItemsData || []).filter((li: { invoice_id: string }) => li.invoice_id === inv.id),
      _taxBreakdown: (taxData || []).filter((tb: { invoice_id: string }) => tb.invoice_id === inv.id),
    }));
    await clearStore('invoices');
    await putMany('invoices', enriched);
  }

  return invoices;
}

async function refreshInvoicesFromSupabase(): Promise<void> {
  if (!navigator.onLine) return;
  try {
    await getInvoicesFromSupabase(); // This also caches
  } catch { /* silent */ }
}

export async function getInvoiceById(id: string): Promise<Invoice | undefined> {
  const offlineAvail = await isOfflineDbAvailable();

  if (offlineAvail) {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const cached = await getById<any>('invoices', id);
    if (cached) {
      return mapInvoiceFromDb(cached, cached._lineItems || [], cached._taxBreakdown || []);
    }
  }

  if (!navigator.onLine) return undefined;

  const { data: inv } = await supabase()
    .from('invoices')
    .select('*')
    .eq('id', id)
    .single();

  if (!inv) return undefined;

  const { data: lineItems } = await supabase()
    .from('invoice_line_items')
    .select('*')
    .eq('invoice_id', id)
    .order('sort_order', { ascending: true });

  const { data: taxBreakdown } = await supabase()
    .from('invoice_tax_breakdown')
    .select('*')
    .eq('invoice_id', id);

  return mapInvoiceFromDb(inv, lineItems || [], taxBreakdown || []);
}

/**
 * Lee la factura directamente de Supabase, sin pasar por la caché local.
 * Necesario tras emitir: la huella y el índice de cadena los pone el
 * servidor, así que la copia local siempre va un paso por detrás.
 */
async function getInvoiceFromSupabase(id: string): Promise<Invoice | undefined> {
  if (!navigator.onLine) return undefined;

  const { data: inv } = await supabase().from('invoices').select('*').eq('id', id).single();
  if (!inv) return undefined;

  const { data: lineItems } = await supabase()
    .from('invoice_line_items').select('*').eq('invoice_id', id)
    .order('sort_order', { ascending: true });
  const { data: taxBreakdown } = await supabase()
    .from('invoice_tax_breakdown').select('*').eq('invoice_id', id);

  const mapped = mapInvoiceFromDb(inv, lineItems || [], taxBreakdown || []);

  if (await isOfflineDbAvailable()) {
    await put('invoices', { ...inv, _lineItems: lineItems || [], _taxBreakdown: taxBreakdown || [] });
  }
  return mapped;
}

/**
 * Estados en los que la factura ya está sellada fiscalmente.
 * Debe coincidir con is_sealed_status() en migration_002_antifraude.sql.
 */
const SEALED_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.EMITIDA,
  InvoiceStatus.PENDIENTE,
  InvoiceStatus.PAGADA,
  InvoiceStatus.VENCIDA,
  InvoiceStatus.ANULADA,
];

export function isSealed(invoice: Pick<Invoice, 'status'>): boolean {
  return SEALED_STATUSES.includes(invoice.status);
}

export async function saveInvoice(invoice: Invoice): Promise<void> {
  const userId = await requireUserId();

  const sealed = isSealed(invoice);

  const invRow = {
    id: invoice.id,
    user_id: userId,
    number: invoice.number,
    series: invoice.series,
    client_id: invoice.clientId || null,
    client_name: invoice.clientName,
    client_nif: invoice.clientNif,
    client_address: invoice.clientAddress,
    issue_date: invoice.issueDate,
    due_date: invoice.dueDate,
    paid_date: invoice.paidDate || null,
    status: invoice.status,
    subtotal: invoice.subtotal,
    total_discount: invoice.totalDiscount,
    total_tax: invoice.totalTax,
    total: invoice.total,
    payment_method: invoice.paymentMethod,
    notes: invoice.notes,
    pos_session_id: invoice.posSessionId || null,
    number_temporary: invoice.numberTemporary ?? false,
    // Los campos verifactu_* los calcula y firma el servidor (trigger
    // tr_invoice_seal). Mandarlos desde aquí sería justamente el vector
    // de fraude que estamos cerrando, así que no se envían.
  };

  const lineRows = invoice.lineItems.map((li, idx) => ({
    id: li.id,
    invoice_id: invoice.id,
    product_id: li.productId || null,
    product_name: li.productName,
    product_ref: li.productRef,
    quantity: li.quantity,
    unit_price: li.unitPrice,
    unit: li.unit,
    tax_rate: li.taxRate,
    discount_percent: li.discountPercent,
    subtotal: li.subtotal,
    tax_amount: li.taxAmount,
    total: li.total,
    sort_order: idx,
  }));

  const taxRows = invoice.taxBreakdown.map(tb => ({
    invoice_id: invoice.id,
    rate: tb.rate,
    base_amount: tb.base,
    tax_amount: tb.amount,
  }));

  // 1. Save to IndexedDB
  const offlineAvail = await isOfflineDbAvailable();
  if (offlineAvail) {
    await put('invoices', {
      ...invRow,
      _lineItems: lineRows,
      _taxBreakdown: taxRows,
    });
  }

  // 2. If online, save directly to Supabase
  if (navigator.onLine) {
    const { error: invError } = await supabase().from('invoices').upsert(invRow);
    // Un rechazo del servidor aquí suele ser una regla antifraude
    // (factura sellada, fecha retroactiva, número duplicado). Se propaga
    // para que la UI lo enseñe en vez de tragárselo en silencio.
    if (invError) throw new Error(translateDbError(invError));

    // Las líneas y el desglose sólo se reescriben mientras es borrador:
    // en una factura sellada el servidor los rechaza, y con razón.
    if (!sealed) {
      await supabase().from('invoice_line_items').delete().eq('invoice_id', invoice.id);
      if (lineRows.length > 0) {
        const { error } = await supabase().from('invoice_line_items').insert(lineRows);
        if (error) throw new Error(translateDbError(error));
      }

      await supabase().from('invoice_tax_breakdown').delete().eq('invoice_id', invoice.id);
      if (taxRows.length > 0) {
        const { error } = await supabase().from('invoice_tax_breakdown').insert(taxRows);
        if (error) throw new Error(translateDbError(error));
      }
    }
  } else {
    // 3. Queue for later sync
    await enqueueSyncAction('upsert', 'invoices', invRow);
    if (!sealed) {
      for (const lr of lineRows) {
        await enqueueSyncAction('upsert', 'invoice_line_items', lr);
      }
      for (const tr of taxRows) {
        await enqueueSyncAction('upsert', 'invoice_tax_breakdown', tr);
      }
    }
  }
}

/**
 * Emite una factura: es el punto de no retorno.
 * El servidor le asigna posición en la cadena, la engancha con la huella
 * de la anterior y la sella. A partir de aquí ya no se puede editar.
 */
export async function issueInvoice(invoice: Invoice): Promise<Invoice> {
  if (invoice.lineItems.length === 0) {
    throw new Error('No se puede emitir una factura sin líneas.');
  }

  // Lo que decide si la factura ya está emitida es el estado PERSISTIDO, no
  // el que el llamador marque en el objeto en memoria: los formularios pasan
  // status EMITIDA porque es el estado al que quieren llegar. Emitir dos veces
  // la misma factura rompería la cadena de integridad, así que se comprueba
  // contra la fuente autoritativa antes de sellar.
  const persisted = navigator.onLine
    ? await getInvoiceFromSupabase(invoice.id)
    : await getInvoiceById(invoice.id);
  if (persisted && isSealed(persisted)) {
    throw new Error(`La factura ${invoice.number} ya está emitida.`);
  }

  // Primero se consolidan las líneas como borrador (con la factura aún
  // editable), y sólo después se sella. Al revés el servidor bloquearía
  // la escritura de las líneas.
  await saveInvoice({ ...invoice, status: InvoiceStatus.BORRADOR });
  await saveInvoice({ ...invoice, status: InvoiceStatus.EMITIDA });

  const fresh = await getInvoiceFromSupabase(invoice.id);
  return fresh ?? { ...invoice, status: InvoiceStatus.EMITIDA };
}

/**
 * Anula una factura emitida. No la borra: deja constancia del motivo.
 * Es lo que exige la normativa — una factura emitida no desaparece.
 */
export async function cancelInvoice(id: string, reason: string): Promise<void> {
  await requireUserId();
  if (!reason.trim()) {
    throw new Error('Indica el motivo de la anulación: queda registrado.');
  }
  if (!navigator.onLine) {
    throw new Error('La anulación de una factura requiere conexión.');
  }

  const { error } = await supabase()
    .from('invoices')
    .update({ status: InvoiceStatus.ANULADA, cancel_reason: reason.trim() })
    .eq('id', id);

  if (error) throw new Error(translateDbError(error));
  await refreshInvoicesFromSupabase();
}

/**
 * Sólo elimina borradores. Una factura emitida nunca se borra —
 * el servidor lo rechaza igualmente, pero avisamos antes y mejor.
 */
export async function deleteInvoice(id: string): Promise<void> {
  const invoice = await getInvoiceById(id);
  if (invoice && isSealed(invoice)) {
    throw new Error(
      `La factura ${invoice.number} está emitida y no se puede eliminar. Anúlala indicando el motivo.`
    );
  }

  if (!navigator.onLine) {
    throw new Error('Eliminar un borrador requiere conexión.');
  }

  const { error } = await supabase().from('invoices').delete().eq('id', id);
  if (error) throw new Error(translateDbError(error));

  if (await isOfflineDbAvailable()) {
    await removeFromDb('invoices', id);
  }
}

// ============================================================
// INTEGRIDAD DE LA CADENA (antifraude)
// ============================================================

export interface ChainStatus {
  sealedInvoices: number;
  brokenLinks: number;
  lastSealedAt: string | null;
  criticalAlerts: number;
  chainValid: boolean;
  checkedAt: string;
}

export interface ChainBreak {
  chainIndex: number;
  invoiceId: string;
  invoiceNumber: string;
  issueDate: string;
  total: number;
  status: string;
  expectedHash: string;
  storedHash: string;
  problem: string;
}

export interface InvoiceEvent {
  id: number;
  invoiceId: string | null;
  invoiceNumber: string | null;
  eventType: string;
  severity: 'info' | 'warning' | 'critical';
  detail: string;
  occurredAt: string;
}

/** Resumen del estado de la cadena. Lo calcula el servidor. */
export async function getChainStatus(): Promise<ChainStatus | null> {
  if (!navigator.onLine) return null;
  const { data, error } = await supabase().rpc('invoice_chain_status');
  if (error || !data) return null;
  const d = data as Record<string, unknown>;
  return {
    sealedInvoices: Number(d.sealed_invoices ?? 0),
    brokenLinks: Number(d.broken_links ?? 0),
    lastSealedAt: (d.last_sealed_at as string) ?? null,
    criticalAlerts: Number(d.critical_alerts ?? 0),
    chainValid: Boolean(d.chain_valid),
    checkedAt: (d.checked_at as string) ?? new Date().toISOString(),
  };
}

/** Recalcula toda la cadena y devuelve los eslabones que no cuadran. */
export async function verifyChain(): Promise<ChainBreak[]> {
  if (!navigator.onLine) return [];
  const { data, error } = await supabase().rpc('verify_invoice_chain');
  if (error || !data) return [];
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  return (data as any[]).map(r => ({
    chainIndex: Number(r.chain_index),
    invoiceId: r.invoice_id,
    invoiceNumber: r.invoice_number,
    issueDate: r.issue_date,
    total: Number(r.total),
    status: r.status,
    expectedHash: r.expected_hash,
    storedHash: r.stored_hash,
    problem: r.problem,
  }));
}

/** Registro de eventos: incluye los intentos de manipulación bloqueados. */
export async function getInvoiceEvents(limit = 100): Promise<InvoiceEvent[]> {
  if (!navigator.onLine) return [];
  const { data, error } = await supabase()
    .from('invoice_events')
    .select('id, invoice_id, invoice_number, event_type, severity, detail, occurred_at')
    .order('occurred_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  return (data as any[]).map(e => ({
    id: e.id,
    invoiceId: e.invoice_id,
    invoiceNumber: e.invoice_number,
    eventType: e.event_type,
    severity: e.severity,
    detail: e.detail || '',
    occurredAt: e.occurred_at,
  }));
}

/** Traduce los errores del servidor a algo que se entienda en pantalla. */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
function translateDbError(error: any): string {
  const msg: string = error?.message || 'Error desconocido al guardar.';

  if (msg.includes('ANTIFRAUDE:')) {
    return msg.split('ANTIFRAUDE:')[1].trim();
  }
  if (error?.code === '23505') {
    if (msg.includes('uq_invoices_user_series_number')) {
      return 'Ya existe una factura con ese número en esta serie. La numeración no puede repetirse.';
    }
    return 'Ese registro ya existe: se ha impedido crear un duplicado.';
  }
  if (error?.code === '42501') {
    return 'Operación no permitida sobre un registro fiscal protegido.';
  }
  return msg;
}

// ============================================================
// CLIENTS
// ============================================================

export async function getClients(): Promise<Client[]> {
  const offlineAvail = await isOfflineDbAvailable();

  if (offlineAvail) {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const cached = await getAll<any>('clients');
    if (cached.length > 0) {
      backgroundRefresh('clients', () =>
        supabase().from('clients').select('*').order('business_name', { ascending: true })
      );
      return cached.map(mapClientFromDb);
    }
  }

  if (!navigator.onLine) return [];

  const { data, error } = await supabase()
    .from('clients')
    .select('*')
    .order('business_name', { ascending: true });

  if (error || !data) return [];

  if (await isOfflineDbAvailable()) {
    await clearStore('clients');
    await putMany('clients', data);
  }

  return data.map(mapClientFromDb);
}

export async function getClientById(id: string): Promise<Client | undefined> {
  const offlineAvail = await isOfflineDbAvailable();
  if (offlineAvail) {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const cached = await getById<any>('clients', id);
    if (cached) return mapClientFromDb(cached);
  }

  if (!navigator.onLine) return undefined;

  const { data } = await supabase()
    .from('clients')
    .select('*')
    .eq('id', id)
    .single();

  return data ? mapClientFromDb(data) : undefined;
}

export async function saveClient(client: Client): Promise<void> {
  const userId = await requireUserId();

  const row = {
    id: client.id,
    user_id: userId,
    nif: client.nif,
    business_name: client.businessName,
    trade_name: client.tradeName,
    email: client.email,
    phone: client.phone,
    contact_person: client.contactPerson,
    address: client.address,
    city: client.city,
    postal_code: client.postalCode,
    province: client.province,
    country: client.country,
    payment_days: client.paymentDays,
    default_payment_method: client.defaultPaymentMethod,
    notes: client.notes,
    active: client.active,
    is_walk_in: client.isWalkIn ?? false,
  };

  const offlineAvail = await isOfflineDbAvailable();
  if (offlineAvail) {
    await put('clients', row);
  }

  if (navigator.onLine) {
    // Solo se reencola si la petición ni siquiera llegó al servidor (red
    // caída). Si el servidor respondió con un error (RLS, NIF duplicado,
    // id inválido...), reencolar repetiría el mismo rechazo más tarde en
    // silencio: hay que propagarlo ahora para que la UI lo muestre.
    let result: { error: unknown } | null = null;
    try {
      result = await supabase().from('clients').upsert(row);
    } catch {
      await enqueueSyncAction('upsert', 'clients', row);
    }
    if (result?.error) throw new Error(translateDbError(result.error));
  } else {
    await enqueueSyncAction('upsert', 'clients', row);
  }
}

export async function deleteClient(id: string): Promise<void> {
  const offlineAvail = await isOfflineDbAvailable();
  if (offlineAvail) {
    await removeFromDb('clients', id);
  }

  if (navigator.onLine) {
    try {
      await supabase().from('clients').delete().eq('id', id);
    } catch {
      await enqueueSyncAction('delete', 'clients', { id });
    }
  } else {
    await enqueueSyncAction('delete', 'clients', { id });
  }
}

// ============================================================
// PRODUCTS
// ============================================================

export async function getProducts(): Promise<Product[]> {
  const offlineAvail = await isOfflineDbAvailable();

  if (offlineAvail) {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const cached = await getAll<any>('products');
    if (cached.length > 0) {
      backgroundRefresh('products', () =>
        supabase().from('products').select('*').order('name', { ascending: true })
      );
      return cached.map(mapProductFromDb);
    }
  }

  if (!navigator.onLine) return [];

  const { data, error } = await supabase()
    .from('products')
    .select('*')
    .order('name', { ascending: true });

  if (error || !data) return [];

  if (await isOfflineDbAvailable()) {
    await clearStore('products');
    await putMany('products', data);
  }

  return data.map(mapProductFromDb);
}

export async function getProductById(id: string): Promise<Product | undefined> {
  const offlineAvail = await isOfflineDbAvailable();
  if (offlineAvail) {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const cached = await getById<any>('products', id);
    if (cached) return mapProductFromDb(cached);
  }

  if (!navigator.onLine) return undefined;

  const { data } = await supabase()
    .from('products')
    .select('*')
    .eq('id', id)
    .single();

  return data ? mapProductFromDb(data) : undefined;
}

export async function saveProduct(product: Product): Promise<void> {
  const userId = await requireUserId();

  const row = {
    id: product.id,
    user_id: userId,
    ref: product.ref,
    name: product.name,
    description: product.description,
    category: product.category,
    unit_price: product.unitPrice,
    default_tax_rate: product.defaultTaxRate,
    unit: product.unit,
    active: product.active,
    barcode: product.barcode || null,
    stock_quantity: product.stockQuantity ?? 0,
    low_stock_threshold: product.lowStockThreshold ?? null,
    units_sold: product.unitsSold ?? 0,
  };

  const offlineAvail = await isOfflineDbAvailable();
  if (offlineAvail) {
    await put('products', row);
  }

  if (navigator.onLine) {
    let result: { error: unknown } | null = null;
    try {
      result = await supabase().from('products').upsert(row);
    } catch {
      await enqueueSyncAction('upsert', 'products', row);
    }
    if (result?.error) throw new Error(translateDbError(result.error));
  } else {
    await enqueueSyncAction('upsert', 'products', row);
  }
}

export async function deleteProduct(id: string): Promise<void> {
  const offlineAvail = await isOfflineDbAvailable();
  if (offlineAvail) {
    await removeFromDb('products', id);
  }

  if (navigator.onLine) {
    try {
      await supabase().from('products').delete().eq('id', id);
    } catch {
      await enqueueSyncAction('delete', 'products', { id });
    }
  } else {
    await enqueueSyncAction('delete', 'products', { id });
  }
}

// ============================================================
// TPV (punto de venta)
// ============================================================

/** Busca un producto por su código de barras exacto (para el escáner). */
export async function findProductByBarcode(barcode: string): Promise<Product | undefined> {
  const code = barcode.trim();
  if (!code) return undefined;
  const products = await getProducts();
  return products.find(p => p.barcode === code);
}

/**
 * Ajusta el stock de un producto. Online usa fn_pos_adjust_stock (UPDATE
 * atómico en el servidor: dos ventas simultáneas del mismo producto no se
 * pisan el descuento). Offline no hay forma de garantizar atomicidad sin
 * conexión — mejor esfuerzo con recálculo local, aceptable para el
 * terminal único de una tienda pequeña.
 */
export async function adjustStock(productId: string, delta: number): Promise<number> {
  if (navigator.onLine) {
    const { data, error } = await supabase().rpc('fn_pos_adjust_stock', {
      p_product_id: productId,
      p_delta: delta,
    });
    if (error) throw new Error(translateDbError(error));
    const newStock = Number(data);

    // El RPC no pasa por put(), así que la caché offline se actualiza
    // aparte para que la siguiente lectura no vea el stock desactualizado.
    if (await isOfflineDbAvailable()) {
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const cached = await getById<any>('products', productId);
      if (cached) await put('products', { ...cached, stock_quantity: newStock });
    }
    return newStock;
  }

  const product = await getProductById(productId);
  if (!product) throw new Error('Producto no encontrado.');
  const newStock = (product.stockQuantity ?? 0) + delta;
  await saveProduct({ ...product, stockQuantity: newStock });
  return newStock;
}

/**
 * Cliente "Venta al público" para tickets sin NIF (factura simplificada).
 * Se crea una sola vez por empresa la primera vez que se necesita — el
 * índice único idx_clients_one_walk_in en Supabase impide duplicados
 * incluso si dos pestañas intentan crearlo a la vez.
 */
export async function ensureWalkInClient(): Promise<Client> {
  const clients = await getClients();
  const existing = clients.find(c => c.isWalkIn);
  if (existing) return existing;

  const now = new Date().toISOString();
  const walkIn: Client = {
    id: generateId(),
    nif: '',
    businessName: 'Venta al público',
    tradeName: 'Venta al público',
    email: '',
    phone: '',
    contactPerson: '',
    address: '',
    city: '',
    postalCode: '',
    province: '',
    country: 'España',
    paymentDays: 0,
    defaultPaymentMethod: PaymentMethod.EFECTIVO,
    notes: 'Cliente genérico del TPV para tickets sin NIF (factura simplificada).',
    active: true,
    createdAt: now,
    updatedAt: now,
    isWalkIn: true,
  };
  await saveClient(walkIn);
  return walkIn;
}

function mapPosSessionFromDb(s: {
  id: string; opened_at: string; closed_at: string | null; starting_cash: number | string;
  counted_cash: number | string | null; expected_cash: number | string | null;
  cash_difference: number | string | null; status: 'open' | 'closed'; notes: string | null;
}): PosSession {
  return {
    id: s.id,
    openedAt: s.opened_at,
    closedAt: s.closed_at || undefined,
    startingCash: Number(s.starting_cash),
    countedCash: s.counted_cash != null ? Number(s.counted_cash) : undefined,
    expectedCash: s.expected_cash != null ? Number(s.expected_cash) : undefined,
    cashDifference: s.cash_difference != null ? Number(s.cash_difference) : undefined,
    status: s.status,
    notes: s.notes || undefined,
  };
}

function posSessionToRow(s: PosSession, userId: string) {
  return {
    id: s.id, user_id: userId, opened_at: s.openedAt, closed_at: s.closedAt || null,
    starting_cash: s.startingCash, counted_cash: s.countedCash ?? null,
    expected_cash: s.expectedCash ?? null, cash_difference: s.cashDifference ?? null,
    status: s.status, notes: s.notes || null,
  };
}

/** El turno de caja abierto, si hay uno. Lee primero de IndexedDB (funciona offline); si no hay un turno abierto en caché y hay conexión, lo busca en Supabase (visibilidad entre terminales). */
export async function getActivePosSession(): Promise<PosSession | undefined> {
  const offlineAvail = await isOfflineDbAvailable();
  let sessions: Array<Record<string, unknown>> = [];
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  if (offlineAvail) sessions = await getAll<any>('pos_sessions');
  const open = sessions.find(s => s.status === 'open');
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  if (open) return mapPosSessionFromDb(open as any);
  if (navigator.onLine) {
    const { data } = await supabase().from('pos_sessions').select('*').eq('status', 'open').maybeSingle();
    if (data) {
      if (offlineAvail) await put('pos_sessions', data);
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      return mapPosSessionFromDb(data as any);
    }
  }
  return undefined;
}

/**
 * Abre un turno de caja. Escribe primero en IndexedDB y, si hay conexión,
 * también en Supabase; si no, encola el alta para sincronizarla al volver.
 */
export async function openPosSession(startingCash: number): Promise<PosSession> {
  const userId = await requireUserId();
  const session: PosSession = {
    id: generateId(), openedAt: new Date().toISOString(),
    startingCash, status: 'open',
  };
  const row = posSessionToRow(session, userId);
  const offlineAvail = await isOfflineDbAvailable();
  if (offlineAvail) await put('pos_sessions', row);
  if (navigator.onLine) {
    try {
      const { data, error } = await supabase().from('pos_sessions').insert(row).select('*').single();
      if (error) throw error;
      return mapPosSessionFromDb(data);
    } catch {
      await enqueueSyncAction('upsert', 'pos_sessions', row);
    }
  } else {
    await enqueueSyncAction('upsert', 'pos_sessions', row);
  }
  return session;
}

/**
 * Cierra el turno de caja: hace el arqueo desde las ventas en efectivo LOCALES
 * del turno (facturas no anuladas), persiste el cierre en IndexedDB y, si no
 * hay conexión, encola el update para sincronizarlo al volver.
 */
export async function closePosSession(sessionId: string, countedCash: number): Promise<PosSession> {
  const userId = await requireUserId();
  const offlineAvail = await isOfflineDbAvailable();
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const cached = offlineAvail ? await getById<any>('pos_sessions', sessionId) : undefined;
  if (!cached) throw new Error('No se encuentra el turno de caja.');

  // Arqueo desde las ventas en efectivo LOCALES del turno.
  const invoices = await getInvoices();
  const cashSales = invoices
    .filter(i => i.posSessionId === sessionId
      && i.paymentMethod === PaymentMethod.EFECTIVO
      && i.status !== InvoiceStatus.ANULADA)
    .reduce((sum, i) => sum + i.total, 0);
  const expectedCash = expectedCashForSession(Number(cached.starting_cash), [cashSales]);

  const session: PosSession = {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    ...mapPosSessionFromDb(cached as any),
    countedCash, expectedCash,
    cashDifference: Number((countedCash - expectedCash).toFixed(2)),
    closedAt: new Date().toISOString(), status: 'closed',
  };
  const row = posSessionToRow(session, userId);
  if (offlineAvail) await put('pos_sessions', row);
  if (navigator.onLine) {
    try {
      const { data, error } = await supabase().from('pos_sessions').update(row).eq('id', sessionId).select('*').single();
      if (error) throw error;
      return mapPosSessionFromDb(data);
    } catch {
      await enqueueSyncAction('upsert', 'pos_sessions', row);
    }
  } else {
    await enqueueSyncAction('upsert', 'pos_sessions', row);
  }
  return session;
}

// ============================================================
// ALBARANES (documento de entrega / preparación)
// ============================================================

export async function getAlbaranes(): Promise<Albaran[]> {
  const offlineAvail = await isOfflineDbAvailable();

  if (offlineAvail) {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const cached = await getAll<any>('albaranes');
    if (cached.length > 0) {
      backgroundRefresh('albaranes', () =>
        supabase().from('albaranes').select('*').order('issue_date', { ascending: false })
      );
      return cached.map((a) => mapAlbaranFromDb(a, a._lineItems || []));
    }
  }

  if (!navigator.onLine) return [];

  const { data, error } = await supabase()
    .from('albaranes')
    .select('*')
    .order('issue_date', { ascending: false });
  if (error || !data) return [];

  const ids = data.map((a: { id: string }) => a.id);
  const { data: lineItems } = await supabase()
    .from('albaran_line_items')
    .select('*')
    .in('albaran_id', ids)
    .order('sort_order', { ascending: true });

  const out = data.map((a: { id: string }) =>
    mapAlbaranFromDb(a, (lineItems || []).filter((li: { albaran_id: string }) => li.albaran_id === a.id)));

  if (offlineAvail) {
    await clearStore('albaranes');
    await putMany('albaranes', data.map((a: { id: string }) => ({
      ...a,
      _lineItems: (lineItems || []).filter((li: { albaran_id: string }) => li.albaran_id === a.id),
    })));
  }

  return out;
}

export async function getAlbaranById(id: string): Promise<Albaran | undefined> {
  const offlineAvail = await isOfflineDbAvailable();
  if (offlineAvail) {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const cached = await getById<any>('albaranes', id);
    if (cached) return mapAlbaranFromDb(cached, cached._lineItems || []);
  }

  if (!navigator.onLine) return undefined;

  const { data: albaran } = await supabase()
    .from('albaranes')
    .select('*')
    .eq('id', id)
    .single();
  if (!albaran) return undefined;

  const { data: lineItems } = await supabase()
    .from('albaran_line_items')
    .select('*')
    .eq('albaran_id', id)
    .order('sort_order', { ascending: true });

  const mapped = mapAlbaranFromDb(albaran, lineItems || []);
  if (offlineAvail) {
    await put('albaranes', { ...albaran, _lineItems: lineItems || [] });
  }
  return mapped;
}

export async function saveAlbaran(albaran: Albaran): Promise<void> {
  const userId = await requireUserId();

  const row = {
    id: albaran.id,
    user_id: userId,
    number: albaran.number,
    series: albaran.series,
    client_id: albaran.clientId || null,
    client_name: albaran.clientName,
    client_nif: albaran.clientNif,
    client_address: albaran.clientAddress,
    issue_date: albaran.issueDate,
    status: albaran.status,
    subtotal: albaran.subtotal,
    total_discount: albaran.totalDiscount,
    total_tax: albaran.totalTax,
    total: albaran.total,
    notes: albaran.notes,
    invoice_id: albaran.invoiceId || null,
  };

  const lineRows = albaran.lineItems.map((li, idx) => ({
    id: li.id,
    albaran_id: albaran.id,
    product_id: li.productId || null,
    product_name: li.productName,
    product_ref: li.productRef,
    quantity: li.quantity,
    unit_price: li.unitPrice,
    unit: li.unit,
    tax_rate: li.taxRate,
    discount_percent: li.discountPercent,
    subtotal: li.subtotal,
    tax_amount: li.taxAmount,
    total: li.total,
    sort_order: idx,
  }));

  const offlineAvail = await isOfflineDbAvailable();
  if (offlineAvail) {
    await put('albaranes', { ...row, _lineItems: lineRows });
  }

  if (navigator.onLine) {
    const { error: headerError } = await supabase().from('albaranes').upsert(row);
    if (headerError) throw new Error(translateDbError(headerError));

    await supabase().from('albaran_line_items').delete().eq('albaran_id', albaran.id);
    if (lineRows.length > 0) {
      const { error } = await supabase().from('albaran_line_items').insert(lineRows);
      if (error) throw new Error(translateDbError(error));
    }
  } else {
    await enqueueSyncAction('upsert', 'albaranes', row);
    for (const lr of lineRows) {
      await enqueueSyncAction('upsert', 'albaran_line_items', lr);
    }
  }
}

/** Sólo se borran albaranes en borrador: un albarán expedido/facturado es un registro de entrega. */
export async function deleteAlbaran(id: string): Promise<void> {
  const albaran = await getAlbaranById(id);
  if (albaran && albaran.status !== 'borrador') {
    throw new Error(`El albarán ${albaran.number} ya está ${albaran.status}. Sólo se pueden borrar borradores.`);
  }
  if (!navigator.onLine) {
    throw new Error('Eliminar un albarán requiere conexión.');
  }

  const { error } = await supabase().from('albaranes').delete().eq('id', id);
  if (error) throw new Error(translateDbError(error));

  if (await isOfflineDbAvailable()) {
    await removeFromDb('albaranes', id);
  }
}

/**
 * Expide el albarán: lo marca como entregado y descuenta el stock de los
 * productos despachados. Es el único momento en que el albarán toca el
 * stock (la conversión a factura no vuelve a descontar).
 */
export async function expedirAlbaran(id: string): Promise<Albaran> {
  const albaran = await getAlbaranById(id);
  if (!albaran) throw new Error('Albarán no encontrado.');
  if (albaran.status !== 'borrador') {
    throw new Error(`El albarán ${albaran.number} ya no está en borrador.`);
  }
  if (albaran.lineItems.length === 0) {
    throw new Error('No se puede expedir un albarán sin líneas.');
  }

  const updated: Albaran = {
    ...albaran,
    status: 'expedido',
    updatedAt: new Date().toISOString(),
  };
  await saveAlbaran(updated);

  // Descuento de stock (mejor esfuerzo: si una línea no tiene producto
  // asociado — venta sin ficha — simplemente se omite).
  for (const li of albaran.lineItems) {
    if (!li.productId || li.quantity <= 0) continue;
    try {
      await adjustStock(li.productId, -li.quantity);
    } catch (err) {
      console.warn(`Stock no actualizado para ${li.productName}:`, err);
    }
  }

  return updated;
}

export async function anularAlbaran(id: string): Promise<Albaran> {
  const albaran = await getAlbaranById(id);
  if (!albaran) throw new Error('Albarán no encontrado.');
  if (albaran.status === 'facturado') {
    throw new Error(`El albarán ${albaran.number} ya está facturado. No se puede anular.`);
  }
  const updated: Albaran = {
    ...albaran,
    status: 'anulado',
    updatedAt: new Date().toISOString(),
  };
  await saveAlbaran(updated);
  return updated;
}

/**
 * Convierte albaranes EXPEDIDOS en facturas borrador.
 * - Si todos los albaranes son del mismo cliente, genera una única factura.
 * - Si hay varios clientes, genera una factura por cliente (facturación
 *   agrupada: todos los albaranes del mes de un cliente van a una factura).
 * Cada albarán queda con estado 'facturado' y enlazado a su factura.
 */
export async function convertirAlbaranesAFactura(albaranIds: string[]): Promise<Invoice[]> {
  if (albaranIds.length === 0) return [];

  const all = await getAlbaranes();
  const seleccionados = all.filter(a => albaranIds.includes(a.id) && a.status === 'expedido');
  if (seleccionados.length === 0) {
    throw new Error('No hay albaranes expedidos en la selección.');
  }

  const settings = await getCompanySettings();
  // Agrupamos por cliente para facturar "en conjunto".
  const porCliente = new Map<string, Albaran[]>();
  for (const a of seleccionados) {
    const list = porCliente.get(a.clientId) || [];
    list.push(a);
    porCliente.set(a.clientId, list);
  }

  const invoices: Invoice[] = [];

  for (const [, grupo] of porCliente) {
    const numero = generateInvoiceNumber(settings.invoiceSeries, settings.nextInvoiceNumber);
    const primero = grupo[0];
    const lineItems: InvoiceLineItem[] = grupo.flatMap(a => a.lineItems.map(li => ({
      id: generateId(),
      productId: li.productId,
      productName: li.productName,
      productRef: li.productRef,
      quantity: li.quantity,
      unitPrice: li.unitPrice,
      unit: li.unit,
      taxRate: li.taxRate,
      discountPercent: li.discountPercent,
      subtotal: li.subtotal,
      taxAmount: li.taxAmount,
      total: li.total,
    })));

    const totals = calculateInvoiceTotals(lineItems);
    const issueDate = new Date().toISOString().split('T')[0];
    const now = new Date().toISOString();

    const invoice: Invoice = {
      id: generateId(),
      number: numero,
      series: settings.invoiceSeries,
      clientId: primero.clientId,
      clientName: primero.clientName,
      clientNif: primero.clientNif,
      clientAddress: primero.clientAddress,
      issueDate,
      dueDate: addDays(issueDate, settings.defaultPaymentDays),
      status: InvoiceStatus.BORRADOR,
      lineItems,
      ...totals,
      paymentMethod: settings.defaultPaymentMethod,
      notes: `Factura agrupada de albaranes: ${grupo.map(a => a.number).join(', ')}`,
      createdAt: now,
      updatedAt: now,
    };

    await saveInvoice(invoice);
    settings.nextInvoiceNumber += 1;
    invoices.push(invoice);

    for (const a of grupo) {
      await saveAlbaran({
        ...a,
        status: 'facturado',
        invoiceId: invoice.id,
        updatedAt: now,
      });
    }
  }

  await saveCompanySettings(settings);
  return invoices;
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
function mapAlbaranFromDb(a: any, lineItems: any[]): Albaran {
  const lines = lineItems.map(mapLineItemFromDb);
  const totals = calculateInvoiceTotals(lines);
  return {
    id: a.id,
    number: a.number,
    series: a.series,
    clientId: a.client_id || '',
    clientName: a.client_name,
    clientNif: a.client_nif || '',
    clientAddress: a.client_address || '',
    issueDate: a.issue_date,
    status: a.status,
    lineItems: lines,
    subtotal: Number(a.subtotal ?? totals.subtotal),
    totalDiscount: Number(a.total_discount ?? totals.totalDiscount),
    taxBreakdown: totals.taxBreakdown,
    totalTax: Number(a.total_tax ?? totals.totalTax),
    total: Number(a.total ?? totals.total),
    notes: a.notes || '',
    invoiceId: a.invoice_id || undefined,
    createdAt: a.created_at,
    updatedAt: a.updated_at,
  };
}

// ============================================================
// DEVOLUCIONES (mercancía devuelta: roturas, defectos…)
// ============================================================

export async function getDevoluciones(): Promise<Devolucion[]> {
  const offlineAvail = await isOfflineDbAvailable();

  if (offlineAvail) {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const cached = await getAll<any>('devoluciones');
    if (cached.length > 0) {
      backgroundRefresh('devoluciones', () =>
        supabase().from('devoluciones').select('*').order('issue_date', { ascending: false })
      );
      return cached.map(d => mapDevolucionFromDb(d, d._lineItems || []));
    }
  }

  if (!navigator.onLine) return [];

  const { data, error } = await supabase()
    .from('devoluciones')
    .select('*')
    .order('issue_date', { ascending: false });
  if (error || !data) return [];

  const ids = data.map((d: { id: string }) => d.id);
  const { data: lineItems } = await supabase()
    .from('devolucion_line_items')
    .select('*')
    .in('devolucion_id', ids)
    .order('sort_order', { ascending: true });

  const out = data.map((d: { id: string }) =>
    mapDevolucionFromDb(d, (lineItems || []).filter((li: { devolucion_id: string }) => li.devolucion_id === d.id)));

  if (offlineAvail) {
    await clearStore('devoluciones');
    await putMany('devoluciones', data.map((d: { id: string }) => ({
      ...d,
      _lineItems: (lineItems || []).filter((li: { devolucion_id: string }) => li.devolucion_id === d.id),
    })));
  }

  return out;
}

export async function getDevolucionById(id: string): Promise<Devolucion | undefined> {
  const offlineAvail = await isOfflineDbAvailable();
  if (offlineAvail) {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const cached = await getById<any>('devoluciones', id);
    if (cached) return mapDevolucionFromDb(cached, cached._lineItems || []);
  }

  if (!navigator.onLine) return undefined;

  const { data: devolucion } = await supabase()
    .from('devoluciones')
    .select('*')
    .eq('id', id)
    .single();
  if (!devolucion) return undefined;

  const { data: lineItems } = await supabase()
    .from('devolucion_line_items')
    .select('*')
    .eq('devolucion_id', id)
    .order('sort_order', { ascending: true });

  const mapped = mapDevolucionFromDb(devolucion, lineItems || []);
  if (offlineAvail) {
    await put('devoluciones', { ...devolucion, _lineItems: lineItems || [] });
  }
  return mapped;
}

export async function saveDevolucion(devolucion: Devolucion): Promise<void> {
  const userId = await requireUserId();

  const row = {
    id: devolucion.id,
    user_id: userId,
    number: devolucion.number,
    series: devolucion.series,
    origin: devolucion.origin,
    origin_id: devolucion.originId || null,
    origin_number: devolucion.originNumber || null,
    client_id: devolucion.clientId || null,
    client_name: devolucion.clientName,
    client_nif: devolucion.clientNif,
    issue_date: devolucion.issueDate,
    reason: devolucion.reason,
    reason_note: devolucion.reasonNote,
    status: devolucion.status,
    total: devolucion.total,
    notes: devolucion.notes,
    abono_id: devolucion.abonoId || null,
  };

  const lineRows = devolucion.lineItems.map((li, idx) => ({
    id: li.id,
    devolucion_id: devolucion.id,
    product_id: li.productId || null,
    product_name: li.productName,
    product_ref: li.productRef,
    quantity: li.quantity,
    unit_price: li.unitPrice,
    unit: li.unit,
    tax_rate: li.taxRate,
    total: li.total,
    restock: li.restock,
    sort_order: idx,
  }));

  const offlineAvail = await isOfflineDbAvailable();
  if (offlineAvail) {
    await put('devoluciones', { ...row, _lineItems: lineRows });
  }

  if (navigator.onLine) {
    const { error: headerError } = await supabase().from('devoluciones').upsert(row);
    if (headerError) throw new Error(translateDbError(headerError));

    await supabase().from('devolucion_line_items').delete().eq('devolucion_id', devolucion.id);
    if (lineRows.length > 0) {
      const { error } = await supabase().from('devolucion_line_items').insert(lineRows);
      if (error) throw new Error(translateDbError(error));
    }
  } else {
    await enqueueSyncAction('upsert', 'devoluciones', row);
    for (const lr of lineRows) {
      await enqueueSyncAction('upsert', 'devolucion_line_items', lr);
    }
  }
}

export async function deleteDevolucion(id: string): Promise<void> {
  if (!navigator.onLine) {
    throw new Error('Eliminar una devolución requiere conexión.');
  }
  const { error } = await supabase().from('devoluciones').delete().eq('id', id);
  if (error) throw new Error(translateDbError(error));

  if (await isOfflineDbAvailable()) {
    await removeFromDb('devoluciones', id);
  }
}

/**
 * Registra una devolución: opcionalmente repone el stock de las líneas
 * marcadas para re-stock y genera un abono (nota de crédito) a favor del
 * cliente por el importe total devuelto.
 */
export async function createDevolucion(
  devolucion: Devolucion,
  opts: { restock?: boolean; generateAbono?: boolean } = {},
): Promise<Devolucion> {
  const restock = opts.restock ?? true;
  const generateAbono = opts.generateAbono ?? false;

  // Reposición de stock antes de persistir: si algo falla no queda media devolución.
  if (restock) {
    for (const li of devolucion.lineItems) {
      if (!li.productId || li.quantity <= 0 || !li.restock) continue;
      await adjustStock(li.productId, li.quantity);
    }
  }

  let final: Devolucion = devolucion;

  if (generateAbono) {
    const settings = await getCompanySettings();
    const abono: Abono = {
      id: generateId(),
      number: generateInvoiceNumber(settings.abonoSeries || 'ABO', settings.nextAbonoNumber || 1),
      series: settings.abonoSeries || 'ABO',
      clientId: devolucion.clientId,
      clientName: devolucion.clientName,
      clientNif: devolucion.clientNif,
      issueDate: devolucion.issueDate,
      total: Number(devolucion.total.toFixed(2)),
      usedAmount: 0,
      status: 'emitido',
      devolucionId: devolucion.id,
      reason: `Abono de la devolución ${devolucion.number}`,
      notes: devolucion.notes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await saveAbono(abono);
    settings.nextAbonoNumber = (settings.nextAbonoNumber || 1) + 1;
    await saveCompanySettings(settings);

    final = {
      ...devolucion,
      status: 'abonada',
      abonoId: abono.id,
      updatedAt: new Date().toISOString(),
    };
  }

  await saveDevolucion(final);
  return final;
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
function mapDevolucionFromDb(d: any, lineItems: any[]): Devolucion {
  return {
    id: d.id,
    number: d.number,
    series: d.series,
    origin: d.origin || 'manual',
    originId: d.origin_id || undefined,
    originNumber: d.origin_number || undefined,
    clientId: d.client_id || '',
    clientName: d.client_name,
    clientNif: d.client_nif || '',
    issueDate: d.issue_date,
    reason: d.reason || 'otro',
    reasonNote: d.reason_note || '',
    status: d.status,
    lineItems: (lineItems || []).map(li => ({
      id: li.id,
      productId: li.product_id || '',
      productName: li.product_name,
      productRef: li.product_ref || '',
      quantity: Number(li.quantity),
      unitPrice: Number(li.unit_price),
      unit: li.unit,
      taxRate: li.tax_rate,
      total: Number(li.total),
      restock: li.restock ?? true,
    })),
    total: Number(d.total),
    notes: d.notes || '',
    abonoId: d.abono_id || undefined,
    createdAt: d.created_at,
    updatedAt: d.updated_at,
  };
}

// ============================================================
// ABONOS (nota de crédito a favor del cliente)
// ============================================================

export async function getAbonos(): Promise<Abono[]> {
  const offlineAvail = await isOfflineDbAvailable();

  if (offlineAvail) {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const cached = await getAll<any>('abonos');
    if (cached.length > 0) {
      backgroundRefresh('abonos', () =>
        supabase().from('abonos').select('*').order('issue_date', { ascending: false })
      );
      return cached.map(mapAbonoFromDb);
    }
  }

  if (!navigator.onLine) return [];

  const { data, error } = await supabase()
    .from('abonos')
    .select('*')
    .order('issue_date', { ascending: false });
  if (error || !data) return [];

  if (offlineAvail) {
    await clearStore('abonos');
    await putMany('abonos', data);
  }

  return data.map(mapAbonoFromDb);
}

export async function getAbonoById(id: string): Promise<Abono | undefined> {
  const offlineAvail = await isOfflineDbAvailable();
  if (offlineAvail) {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const cached = await getById<any>('abonos', id);
    if (cached) return mapAbonoFromDb(cached);
  }

  if (!navigator.onLine) return undefined;

  const { data } = await supabase()
    .from('abonos')
    .select('*')
    .eq('id', id)
    .single();

  if (data && offlineAvail) {
    await put('abonos', data);
  }
  return data ? mapAbonoFromDb(data) : undefined;
}

/** Abonos activos de un cliente (no anulados y con saldo disponible). */
export async function getAbonosByClient(clientId: string): Promise<Abono[]> {
  const all = await getAbonos();
  return all.filter(a =>
    a.clientId === clientId &&
    a.status !== 'anulado' &&
    a.usedAmount < a.total
  );
}

export async function getClientAbonoBalance(clientId: string): Promise<number> {
  const abonos = await getAbonosByClient(clientId);
  return Number(abonos.reduce((sum, a) => sum + (a.total - a.usedAmount), 0).toFixed(2));
}

export async function saveAbono(abono: Abono): Promise<void> {
  const userId = await requireUserId();

  const row = {
    id: abono.id,
    user_id: userId,
    number: abono.number,
    series: abono.series,
    client_id: abono.clientId || null,
    client_name: abono.clientName,
    client_nif: abono.clientNif,
    issue_date: abono.issueDate,
    total: abono.total,
    used_amount: abono.usedAmount,
    status: abono.status,
    devolucion_id: abono.devolucionId || null,
    reason: abono.reason,
    notes: abono.notes,
  };

  const offlineAvail = await isOfflineDbAvailable();
  if (offlineAvail) {
    await put('abonos', row);
  }

  if (navigator.onLine) {
    try {
      const { error } = await supabase().from('abonos').upsert(row);
      if (error) await enqueueSyncAction('upsert', 'abonos', row);
    } catch {
      await enqueueSyncAction('upsert', 'abonos', row);
    }
  } else {
    await enqueueSyncAction('upsert', 'abonos', row);
  }
}

/** Sólo se pueden borrar abonos emitidos sin uso. */
export async function deleteAbono(id: string): Promise<void> {
  const abono = await getAbonoById(id);
  if (abono && abono.usedAmount > 0) {
    throw new Error(`El abono ${abono.number} ya tiene ${formatCurrency(abono.usedAmount)} aplicados. No se puede borrar.`);
  }
  if (!navigator.onLine) {
    throw new Error('Eliminar un abono requiere conexión.');
  }
  const { error } = await supabase().from('abonos').delete().eq('id', id);
  if (error) throw new Error(translateDbError(error));

  if (await isOfflineDbAvailable()) {
    await removeFromDb('abonos', id);
  }
}

export async function anularAbono(id: string): Promise<Abono> {
  const abono = await getAbonoById(id);
  if (!abono) throw new Error('Abono no encontrado.');
  if (abono.usedAmount > 0) {
    throw new Error(`El abono ${abono.number} ya tiene ${formatCurrency(abono.usedAmount)} aplicados. No se puede anular.`);
  }
  const updated: Abono = { ...abono, status: 'anulado', updatedAt: new Date().toISOString() };
  await saveAbono(updated);
  return updated;
}

/**
 * Aplica un abono sobre una factura: registra la aplicación y descuenta el
 * saldo usado del abono. La factura NO cambia su total sellado (el abono es
 * una nota de crédito que compensa la deuda, no una rebaja del documento).
 */
export async function applyAbonoToInvoice(
  abonoId: string,
  invoiceId: string,
  invoiceNumber: string,
  amount: number,
): Promise<void> {
  const abono = await getAbonoById(abonoId);
  if (!abono) throw new Error('Abono no encontrado.');
  if (abono.status === 'anulado') throw new Error('No se puede aplicar un abono anulado.');
  const disponible = Number((abono.total - abono.usedAmount).toFixed(2));
  if (amount <= 0) throw new Error('El importe a aplicar debe ser mayor que cero.');
  if (amount > disponible) {
    throw new Error(`El abono ${abono.number} sólo tiene ${formatCurrency(disponible)} disponibles.`);
  }

  const aplicacion: AbonoAplicacion = {
    id: generateId(),
    abonoId,
    invoiceId,
    invoiceNumber,
    amount: Number(amount.toFixed(2)),
    appliedAt: new Date().toISOString(),
  };

  const offlineAvail = await isOfflineDbAvailable();
  if (offlineAvail) {
    await put('abono_aplicaciones', aplicacion);
  }

  if (navigator.onLine) {
    try {
      const { error } = await supabase().from('abono_aplicaciones').insert({
        id: aplicacion.id,
        abono_id: aplicacion.abonoId,
        invoice_id: aplicacion.invoiceId,
        invoice_number: aplicacion.invoiceNumber,
        amount: aplicacion.amount,
        applied_at: aplicacion.appliedAt,
      });
      if (error) await enqueueSyncAction('upsert', 'abono_aplicaciones', aplicacion as unknown as Record<string, unknown>);
    } catch {
      await enqueueSyncAction('upsert', 'abono_aplicaciones', aplicacion as unknown as Record<string, unknown>);
    }
  } else {
    await enqueueSyncAction('upsert', 'abono_aplicaciones', aplicacion as unknown as Record<string, unknown>);
  }

  const newUsed = Number((abono.usedAmount + aplicacion.amount).toFixed(2));
  const status: Abono['status'] = newUsed >= abono.total ? 'usado' : 'parcial';
  await saveAbono({ ...abono, usedAmount: newUsed, status, updatedAt: new Date().toISOString() });
}

export async function getAbonoAplicacionesByInvoice(invoiceId: string): Promise<AbonoAplicacion[]> {
  const offlineAvail = await isOfflineDbAvailable();
  if (offlineAvail) {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const all = await getAll<any>('abono_aplicaciones');
    return all.filter(a => a.invoice_id === invoiceId).map(mapAplicacionFromDb);
  }
  if (!navigator.onLine) return [];
  const { data } = await supabase()
    .from('abono_aplicaciones')
    .select('*')
    .eq('invoice_id', invoiceId);
  return (data || []).map(mapAplicacionFromDb);
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
function mapAbonoFromDb(a: any): Abono {
  return {
    id: a.id,
    number: a.number,
    series: a.series,
    clientId: a.client_id || '',
    clientName: a.client_name,
    clientNif: a.client_nif || '',
    issueDate: a.issue_date,
    total: Number(a.total),
    usedAmount: Number(a.used_amount ?? 0),
    status: a.status,
    devolucionId: a.devolucion_id || undefined,
    reason: a.reason || '',
    notes: a.notes || '',
    createdAt: a.created_at,
    updatedAt: a.updated_at,
  };
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
function mapAplicacionFromDb(ap: any): AbonoAplicacion {
  return {
    id: ap.id || ap._id,
    abonoId: ap.abono_id,
    invoiceId: ap.invoice_id,
    invoiceNumber: ap.invoice_number,
    amount: Number(ap.amount),
    appliedAt: ap.applied_at || ap.appliedAt,
  };
}

// ============================================================
// COMPANY SETTINGS
// ============================================================
// COMPANY SETTINGS
// ============================================================

export async function getCompanySettings(): Promise<CompanySettings> {
  const offlineAvail = await isOfflineDbAvailable();
  let settings: CompanySettings | null = null;

  if (offlineAvail) {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const cached = await getById<any>('settings', 'company');
    if (cached) {
      // Background refresh
      if (navigator.onLine) {
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        supabase().from('company_settings').select('*').limit(1).single().then((res: any) => {
          if (res?.data) {
            withSettingsCacheLock(async () => {
              /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
              const prev = await getById<any>('settings', 'company');
              const data = { ...res.data };
              // No clobber: si la fila de BD aún no trae custom_categories
              // (migración 008 sin aplicar), conserva las que haya localmente.
              if (prev?.custom_categories && !Array.isArray(data.custom_categories)) {
                data.custom_categories = prev.custom_categories;
              }
              await put('settings', { ...data, key: 'company' });
            });
          }
        }).catch(() => {});
      }
      settings = mapSettingsFromDb(cached);
    }
  }

  if (!settings && !navigator.onLine) {
    settings = { ...DEFAULT_COMPANY_SETTINGS };
  }

  if (!settings) {
    const { data } = await supabase()
      .from('company_settings')
      .select('*')
      .limit(1)
      .single();

    if (data) {
      if (await isOfflineDbAvailable()) {
        await withSettingsCacheLock(() => put('settings', { ...data, key: 'company' }));
      }
      settings = mapSettingsFromDb(data);
    } else {
      settings = { ...DEFAULT_COMPANY_SETTINGS };
    }
  }

  try {
    const { data: authData } = await supabase().auth.getUser();
    const email = authData?.user?.email?.toLowerCase();
    if (email === 'volitancrooss@gmail.com') {
      settings.planId = 'sin_limite';
      settings.subscriptionStatus = 'active';
    } else {
      // Todas las demás cuentas se inician en 'inactive' (Sin Suscripción)
      settings.subscriptionStatus = 'inactive';
    }
  } catch {}

  return settings;
}

export async function saveCompanySettings(settings: CompanySettings): Promise<void> {
  const userId = await requireUserId();

  const row = {
    user_id: userId,
    business_name: settings.businessName,
    nif: settings.nif,
    trade_name: settings.tradeName,
    sector: settings.sector,
    accent_theme: settings.accentTheme,
    email: settings.email,
    phone: settings.phone,
    website: settings.website,
    address: settings.address,
    city: settings.city,
    postal_code: settings.postalCode,
    province: settings.province,
    invoice_series: settings.invoiceSeries,
    next_invoice_number: settings.nextInvoiceNumber,
    tpv_series: settings.tpvSeries,
    next_tpv_number: settings.nextTpvNumber,
    tpv_mode: settings.tpvMode ?? defaultTpvModeForSector(settings.sector),
    tpv_enabled: settings.tpvEnabled === undefined ? null : settings.tpvEnabled,
    igic_enabled: settings.igicEnabled ?? false,
    stripe_enabled: settings.stripeEnabled ?? false,
    albaran_series: settings.albaranSeries || 'ALB',
    next_albaran_number: settings.nextAlbaranNumber || 1,
    devolucion_series: settings.devolucionSeries || 'DEV',
    next_devolucion_number: settings.nextDevolucionNumber || 1,
    abono_series: settings.abonoSeries || 'ABO',
    next_abono_number: settings.nextAbonoNumber || 1,
    default_payment_days: settings.defaultPaymentDays,
    default_payment_method: settings.defaultPaymentMethod,
    invoice_footer_text: settings.invoiceFooterText,
    iban: settings.iban,
    bank_name: settings.bankName,
    verifactu_enabled: settings.verifactuEnabled,
    logo_url: settings.logoUrl,
    plan_id: settings.planId || 'basico',
    subscription_status: settings.subscriptionStatus || 'inactive',
  };

  // Categorías personalizadas: van en la misma fila de company_settings.
  const fullRow = { ...row, custom_categories: settings.customCategories || [] };

  const offlineAvail = await isOfflineDbAvailable();
  if (offlineAvail) {
    await withSettingsCacheLock(() => put('settings', { ...fullRow, key: 'company' }));
  }

  if (navigator.onLine) {
    try {
      // Check if settings exist
      const { data: existing } = await supabase()
        .from('company_settings')
        .select('id')
        .limit(1)
        .single();

      const write = async (payload: typeof row | typeof fullRow) => {
        if (existing) {
          return supabase().from('company_settings').update(payload).eq('id', existing.id);
        }
        return supabase().from('company_settings').insert(payload);
      };

      const res = await write(fullRow);
      if (res?.error) {
        // Si la columna custom_categories aún no existe en BD (migración 008
        // sin aplicar), reintenta sin ella para no romper el resto del guardado.
        if (/custom_categories/i.test(String(res.error.message))) {
          const retry = await write(row);
          if (retry?.error) await enqueueSyncAction('upsert', 'company_settings', row);
        } else {
          await enqueueSyncAction('upsert', 'company_settings', row);
        }
      }
    } catch {
      await enqueueSyncAction('upsert', 'company_settings', row);
    }
  } else {
    await enqueueSyncAction('upsert', 'company_settings', row);
  }
}

// ============================================================
// AUTH HELPERS
// ============================================================

export async function getCurrentUserId(): Promise<string | null> {
  try {
    const { data } = await supabase().auth.getUser();
    if (data?.user?.id) return data.user.id;

    const { data: sessionData } = await supabase().auth.getSession();
    if (sessionData?.session?.user?.id) return sessionData.session.user.id;
  } catch (err) {
    console.warn('Supabase auth check failed:', err);
  }

  // Sin sesión no hay identidad. NO se inventa un usuario:
  // un ID compartido haría que todos los datos cayeran en el mismo
  // cajón y dejaría las facturas sin titular identificable.
  return null;
}

export async function isAuthenticated(): Promise<boolean> {
  const userId = await getCurrentUserId();
  return !!userId;
}

/** Igual que getCurrentUserId pero falla en vez de callar. Para escrituras. */
async function requireUserId(): Promise<string> {
  const userId = await getCurrentUserId();
  if (!userId) {
    throw new Error('Sesión no válida. Vuelve a iniciar sesión para guardar cambios.');
  }
  return userId;
}

// ============================================================
// RESET ALL DATA (maintenance)
// ============================================================

/**
 * Borra los datos de trabajo (clientes, productos, borradores).
 * Las facturas emitidas NO se tocan: son registros fiscales y el
 * servidor rechaza su borrado. Se informa de cuántas se conservan.
 */
export async function resetAllData(): Promise<{ keptInvoices: number }> {
  const userId = await requireUserId();

  if (!navigator.onLine) {
    throw new Error('Reiniciar los datos requiere conexión.');
  }

  const { count } = await supabase()
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .not('sealed_at', 'is', null);

  const keptInvoices = count ?? 0;

  // Sólo borradores. Las selladas quedan fuera por diseño.
  await supabase().from('invoices').delete().eq('user_id', userId).is('sealed_at', null);
  await supabase().from('clients').delete().eq('user_id', userId);
  await supabase().from('products').delete().eq('user_id', userId);

  const offlineAvail = await isOfflineDbAvailable();
  if (offlineAvail) {
    await clearStore('invoices');
    await clearStore('clients');
    await clearStore('products');
    await clearStore('syncQueue');
  }

  return { keptInvoices };
}

// ============================================================
// SEED DATA (first login)
// ============================================================

export async function seedInitialData(): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) return;

  if (navigator.onLine) {
    // Check if user already has settings in Supabase
    const { data: existing } = await supabase()
      .from('company_settings')
      .select('id')
      .limit(1)
      .single();

    if (existing) return; // Already seeded
  } else {
    // Check offline
    const offlineAvail = await isOfflineDbAvailable();
    if (offlineAvail) {
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const cached = await getById<any>('settings', 'company');
      if (cached) return;
    }
  }

  // Create default settings
  await saveCompanySettings(DEFAULT_COMPANY_SETTINGS as CompanySettings);
}

// ============================================================
// MAPPING: DB snake_case → TS camelCase
// ============================================================

/* eslint-disable @typescript-eslint/no-explicit-any */

export function mapInvoiceFromDb(inv: any, lineItems: any[], taxBreakdown: any[]): Invoice {
  return {
    id: inv.id,
    number: inv.number,
    series: inv.series,
    clientId: inv.client_id || '',
    clientName: inv.client_name,
    clientNif: inv.client_nif || '',
    clientAddress: inv.client_address || '',
    issueDate: inv.issue_date,
    dueDate: inv.due_date,
    paidDate: inv.paid_date || undefined,
    status: inv.status,
    lineItems: lineItems.map(mapLineItemFromDb),
    subtotal: Number(inv.subtotal),
    totalDiscount: Number(inv.total_discount),
    taxBreakdown: taxBreakdown.map(tb => ({
      rate: tb.rate,
      base: Number(tb.base_amount),
      amount: Number(tb.tax_amount),
    })),
    totalTax: Number(inv.total_tax),
    total: Number(inv.total),
    paymentMethod: inv.payment_method,
    notes: inv.notes || '',
    verifactu: inv.verifactu_hash ? {
      chainedHash: inv.verifactu_hash,
      qrCodeUrl: inv.verifactu_qr_url || '',
      timestamp: inv.verifactu_timestamp || '',
      signatureStatus: inv.verifactu_signature_status || 'PENDING',
    } : undefined,
    createdAt: inv.created_at,
    updatedAt: inv.updated_at,
    posSessionId: inv.pos_session_id || undefined,
    numberTemporary: !!inv.number_temporary,
  };
}

export function mapLineItemFromDb(li: any): InvoiceLineItem {
  return {
    id: li.id,
    productId: li.product_id || '',
    productName: li.product_name,
    productRef: li.product_ref || '',
    quantity: Number(li.quantity),
    unitPrice: Number(li.unit_price),
    unit: li.unit,
    taxRate: li.tax_rate,
    discountPercent: Number(li.discount_percent),
    subtotal: Number(li.subtotal),
    taxAmount: Number(li.tax_amount),
    total: Number(li.total),
  };
}

function mapClientFromDb(c: any): Client {
  return {
    id: c.id,
    nif: c.nif,
    businessName: c.business_name,
    tradeName: c.trade_name || '',
    email: c.email || '',
    phone: c.phone || '',
    contactPerson: c.contact_person || '',
    address: c.address || '',
    city: c.city || '',
    postalCode: c.postal_code || '',
    province: c.province || '',
    country: c.country || 'España',
    paymentDays: c.payment_days || 30,
    defaultPaymentMethod: c.default_payment_method || 'transferencia',
    notes: c.notes || '',
    active: c.active ?? true,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    isWalkIn: c.is_walk_in ?? false,
  };
}

export function mapProductFromDb(p: any): Product {
  return {
    id: p.id,
    ref: p.ref,
    name: p.name,
    description: p.description || '',
    category: p.category || 'otros',
    unitPrice: Number(p.unit_price),
    defaultTaxRate: p.default_tax_rate || 21,
    unit: p.unit || 'ud',
    active: p.active ?? true,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    barcode: p.barcode || undefined,
    stockQuantity: Number(p.stock_quantity ?? 0),
    lowStockThreshold: p.low_stock_threshold != null ? Number(p.low_stock_threshold) : undefined,
    unitsSold: Number(p.units_sold ?? 0),
  };
}

export function mapSettingsFromDb(s: any): CompanySettings {
  return {
    businessName: s.business_name || '',
    nif: s.nif || '',
    tradeName: s.trade_name || '',
    sector: s.sector || 'alimentacion',
    accentTheme: s.accent_theme || 'rose',
    email: s.email || '',
    phone: s.phone || '',
    website: s.website || '',
    address: s.address || '',
    city: s.city || '',
    postalCode: s.postal_code || '',
    province: s.province || '',
    invoiceSeries: s.invoice_series || 'FAC',
    nextInvoiceNumber: s.next_invoice_number || 1,
    tpvSeries: s.tpv_series || 'TPV',
    nextTpvNumber: s.next_tpv_number || 1,
    tpvMode: (s.tpv_mode as TpvMode) || defaultTpvModeForSector(s.sector),
    tpvEnabled: s.tpv_enabled == null ? undefined : Boolean(s.tpv_enabled),
    igicEnabled: s.igic_enabled ?? false,
    stripeEnabled: s.stripe_enabled ?? false,
    albaranSeries: s.albaran_series || 'ALB',
    nextAlbaranNumber: s.next_albaran_number || 1,
    devolucionSeries: s.devolucion_series || 'DEV',
    nextDevolucionNumber: s.next_devolucion_number || 1,
    abonoSeries: s.abono_series || 'ABO',
    nextAbonoNumber: s.next_abono_number || 1,
    defaultPaymentDays: s.default_payment_days || 30,
    defaultPaymentMethod: s.default_payment_method || 'transferencia',
    invoiceFooterText: s.invoice_footer_text || '',
    iban: s.iban || '',
    bankName: s.bank_name || '',
    verifactuEnabled: s.verifactu_enabled ?? true,
    logoUrl: s.logo_url || '',
    planId: s.plan_id || s.planId || 'basico',
    subscriptionStatus: s.subscription_status || s.subscriptionStatus || 'inactive',
    customCategories: Array.isArray(s.custom_categories)
      ? s.custom_categories.map((c: any) => ({
          id: c.id,
          name: c.name,
          icon: c.icon || 'Package',
          sector: c.sector,
          hidden: !!c.hidden,
        }))
      : [],
  };
}

// ============================================================
// ORDER APPROVALS (online-only by nature, but with offline read)
// ============================================================

export async function createOrderApproval(invoiceId: string): Promise<OrderApproval | null> {
  if (!navigator.onLine) {
    console.warn('Order approvals require online connection');
    return null;
  }

  const userId = await getCurrentUserId();
  if (!userId) return null;

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + DEFAULT_APPROVAL_EXPIRY_HOURS);

  const { data, error } = await supabase()
    .from('order_approvals')
    .insert({
      invoice_id: invoiceId,
      expires_at: expiresAt.toISOString(),
    })
    .select()
    .single();

  if (error || !data) {
    console.error('Error creating approval:', error);
    return null;
  }

  // Update invoice status to pre_aprobacion
  await supabase()
    .from('invoices')
    .update({ status: InvoiceStatus.PRE_APROBACION, updated_at: new Date().toISOString() })
    .eq('id', invoiceId);

  return mapApprovalFromDb(data);
}

export async function getApprovalByInvoiceId(invoiceId: string): Promise<OrderApproval | null> {
  if (!navigator.onLine) return null;

  const { data } = await supabase()
    .from('order_approvals')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  return data ? mapApprovalFromDb(data) : null;
}

export async function getApprovalItems(approvalId: string): Promise<OrderApprovalItem[]> {
  if (!navigator.onLine) return [];

  const { data } = await supabase()
    .from('order_approval_items')
    .select('*')
    .eq('approval_id', approvalId);

  return (data || []).map(mapApprovalItemFromDb);
}

export function mapApprovalFromDb(a: any): OrderApproval {
  return {
    id: a.id,
    invoiceId: a.invoice_id,
    token: a.token,
    status: a.status,
    clientMessage: a.client_message || '',
    respondedAt: a.responded_at || null,
    expiresAt: a.expires_at,
    createdAt: a.created_at,
  };
}

function mapApprovalItemFromDb(i: any): OrderApprovalItem {
  return {
    id: i.id,
    approvalId: i.approval_id,
    lineItemId: i.line_item_id,
    accepted: i.accepted,
    adjustedQuantity: i.adjusted_quantity ? Number(i.adjusted_quantity) : null,
    rejectionReason: i.rejection_reason || '',
  };
}

// ============================================================
// USER PROFILES (Onboarding)
// ============================================================

export async function getUserProfile(): Promise<UserProfile | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const offlineAvail = await isOfflineDbAvailable();
  if (offlineAvail) {
    const cached = await getById<any>('userProfiles', userId);
    if (cached) return mapProfileFromDb(cached);
  }

  if (!navigator.onLine) return null;

  const { data } = await supabase()
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (data && await isOfflineDbAvailable()) {
    await put('userProfiles', data);
  }

  return data ? mapProfileFromDb(data) : null;
}

export async function saveUserProfile(profile: Partial<UserProfile>): Promise<void> {
  const userId = await requireUserId();

  const row = {
    id: userId,
    display_name: profile.displayName || '',
    avatar_url: profile.avatarUrl || '',
    onboarding_completed: profile.onboardingCompleted ?? false,
  };

  const offlineAvail = await isOfflineDbAvailable();
  if (offlineAvail) {
    await put('userProfiles', row);
  }

  if (navigator.onLine) {
    try {
      await supabase().from('user_profiles').upsert(row);
    } catch {
      await enqueueSyncAction('upsert', 'user_profiles', row);
    }
  } else {
    await enqueueSyncAction('upsert', 'user_profiles', row);
  }
}

export async function isOnboardingCompleted(): Promise<boolean> {
  const profile = await getUserProfile();
  return profile?.onboardingCompleted ?? false;
}

function mapProfileFromDb(p: any): UserProfile {
  return {
    id: p.id,
    displayName: p.display_name || '',
    avatarUrl: p.avatar_url || '',
    onboardingCompleted: p.onboarding_completed ?? false,
    createdAt: p.created_at,
  };
}

// ============================================================
// DYNAMIC CATEGORIES PER SECTOR & CUSTOM CATEGORIES
// ============================================================

export interface CategoryOption {
  value: string;
  label: string;
  icon: string;
  isCustom?: boolean;
}

export async function getCompanyCategories(): Promise<CategoryOption[]> {
  const settings = await getCompanySettings();
  const sector = settings?.sector || 'alimentacion';
  const defaults = SECTOR_DEFAULT_CATEGORIES[sector] || SECTOR_DEFAULT_CATEGORIES.alimentacion;

  const customs = settings?.customCategories || [];
  const byId = new Map<string, CustomCategory>();
  for (const c of customs) byId.set(c.id, c);

  const out: CategoryOption[] = [];

  // Categorías por defecto del sector: una custom con el mismo id la
  // renombra/recategoriza (edición); hidden=true la oculta (eliminación).
  for (const d of defaults) {
    const override = byId.get(d.value);
    if (override?.hidden) continue;
    out.push({
      value: d.value,
      label: override?.name ?? d.label,
      icon: override?.icon ?? d.icon,
      isCustom: override ? true : undefined,
    });
  }

  // Categorías adicionales creadas por el usuario.
  for (const c of customs) {
    if (c.hidden) continue;
    if (defaults.some(d => d.value === c.id)) continue; // ya aplicada como override
    out.push({ value: c.id, label: c.name, icon: c.icon, isCustom: true });
  }

  return out;
}

export async function addCustomCategory(name: string, icon: string): Promise<CategoryOption> {
  const settings = await getCompanySettings();
  if (!settings) throw new Error('No company settings found');

  const newCat: CustomCategory = {
    id: `custom_${Date.now()}`,
    name,
    icon,
    sector: settings.sector,
  };

  const existing = settings.customCategories || [];
  const updatedSettings = {
    ...settings,
    customCategories: [...existing, newCat],
  };

  await saveCompanySettings(updatedSettings);

  return {
    value: newCat.id,
    label: newCat.name,
    icon: newCat.icon,
    isCustom: true,
  };
}

export async function deleteCustomCategory(categoryId: string): Promise<void> {
  const settings = await getCompanySettings();
  if (!settings) return;

  const sector = settings.sector || 'alimentacion';
  const defaults = SECTOR_DEFAULT_CATEGORIES[sector] || SECTOR_DEFAULT_CATEGORIES.alimentacion;
  const isDefault = defaults.some(d => d.value === categoryId);
  const customs = settings.customCategories || [];

  let next: CustomCategory[];
  if (isDefault) {
    // Eliminar una categoría por defecto = ocultarla. Así los productos que
    // la referencian por value no se rompen, y puede restaurarse editando.
    const def = defaults.find(d => d.value === categoryId)!;
    const existing = customs.find(c => c.id === categoryId);
    next = existing
      ? customs.map(c => c.id === categoryId ? { ...c, hidden: true } : c)
      : [...customs, { id: def.value, name: def.label, icon: def.icon, sector: settings.sector, hidden: true }];
  } else {
    next = customs.filter(c => c.id !== categoryId);
  }

  await saveCompanySettings({ ...settings, customCategories: next });
}

export async function updateCustomCategory(categoryId: string, name: string, icon: string): Promise<void> {
  const settings = await getCompanySettings();
  if (!settings) return;

  const customs = settings.customCategories || [];
  const existing = customs.find(c => c.id === categoryId);
  const next = existing
    ? customs.map(c => c.id === categoryId ? { ...c, name, icon, hidden: false } : c)
    // Editar una categoría por defecto = crear un override con su mismo id.
    : [...customs, { id: categoryId, name, icon, sector: settings.sector, hidden: false }];

  await saveCompanySettings({ ...settings, customCategories: next });
}

// ============================================================
// ONBOARDING VALIDATION
// ============================================================

export interface OnboardingStatus {
  isComplete: boolean;
  missingFields: string[];
  message: string;
}

/**
 * Valida que los datos críticos estén completos para poder emitir facturas.
 * Necesarios: NIF, razón social, dirección fiscal.
 */
export async function getOnboardingStatus(): Promise<OnboardingStatus> {
  try {
    const settings = await getCompanySettings();

    const missingFields: string[] = [];

    if (!settings.nif || !settings.nif.trim()) {
      missingFields.push('NIF');
    }

    if (!settings.businessName || !settings.businessName.trim()) {
      missingFields.push('razón social');
    }

    if (!settings.address || !settings.address.trim()) {
      missingFields.push('dirección fiscal');
    }

    if (missingFields.length > 0) {
      return {
        isComplete: false,
        missingFields,
        message: `Faltan datos críticos: ${missingFields.join(', ')}. Completa los primeros pasos antes de emitir.`,
      };
    }

    return {
      isComplete: true,
      missingFields: [],
      message: '',
    };
  } catch {
    return {
      isComplete: false,
      missingFields: ['Configuración'],
      message: 'No se pudieron validar los datos. Intenta más tarde.',
    };
  }
}

/**
 * Marca el onboarding como completado (solo para uso interno).
 * Se actualiza cuando el usuario completa FirstStepsModal.
 */
export async function completeOnboarding(data: {
  nif: string;
  businessName: string;
  address: string;
  ivaTaxRate: string;
}): Promise<void> {
  const settings = await getCompanySettings();

  await saveCompanySettings({
    ...settings,
    nif: data.nif.toUpperCase(),
    businessName: data.businessName.trim(),
    address: data.address.trim(),
  });
}

// ============================================================
// VERIFACTU CERTIFICATES
// ============================================================

export interface VerifactuCertificate {
  id: string;
  subjectName: string;
  issuerName: string;
  serialNumber: string;
  notBefore: string;
  notAfter: string;
  isValid: boolean;
  isRevoked: boolean;
  isAeatConnected: boolean;
  lastConnectionCheck: string | null;
  aeatStatusCode: string | null;
  uploadedAt: string;
  /**
   * 'unverified' | 'verified' | 'invalid'. Hoy el flujo de subida sólo
   * puede producir 'unverified': no hay validación real de PKCS#12/X.509
   * ni de la cadena de confianza FNMT. No confundir con isValid (que sólo
   * indica "no expirado / no revocado a mano").
   */
  validationStatus: string;
}

export interface VerifactuConnectionStatus {
  hasActiveCertificate: boolean;
  isConnected: boolean;
  statusCode: string | null;
  lastCheck: string | null;
  error: string | null;
  expiresAt: string | null;
}

/**
 * Obtiene el estado de conexión del certificado actual
 */
export async function getVerifactuConnectionStatus(): Promise<VerifactuConnectionStatus> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return {
        hasActiveCertificate: false,
        isConnected: false,
        statusCode: null,
        lastCheck: null,
        error: 'No autenticado',
        expiresAt: null,
      };
    }

    // get_active_certificate ya no recibe el user_id como parámetro:
    // lo obtiene internamente de auth.uid() en el servidor, así no
    // depende de que el cliente lo mande correctamente.
    const { data, error } = await supabase().rpc('get_active_certificate');

    if (error || !data || data.length === 0) {
      return {
        hasActiveCertificate: false,
        isConnected: false,
        statusCode: null,
        lastCheck: null,
        error: error?.message || 'No hay certificado activo',
        expiresAt: null,
      };
    }

    const cert = data[0];
    return {
      hasActiveCertificate: true,
      isConnected: cert.is_aeat_connected ?? false,
      statusCode: cert.aeat_status_code,
      lastCheck: cert.last_connection_check,
      error: null,
      expiresAt: cert.not_after,
    };
  } catch (err) {
    return {
      hasActiveCertificate: false,
      isConnected: false,
      statusCode: null,
      lastCheck: null,
      error: err instanceof Error ? err.message : 'Error desconocido',
      expiresAt: null,
    };
  }
}

/**
 * Obtiene el certificado actual del usuario
 */
export async function getActiveCertificate(): Promise<VerifactuCertificate | null> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return null;

    const { data, error } = await supabase()
      .from('verifactu_certificates')
      .select('*')
      .eq('user_id', userId)
      .eq('is_valid', true)
      .eq('is_revoked', false)
      .gt('not_after', new Date().toISOString())
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return null;

    return {
      id: data.id,
      subjectName: data.subject_name,
      issuerName: data.issuer_name,
      serialNumber: data.serial_number,
      notBefore: data.not_before,
      notAfter: data.not_after,
      isValid: data.is_valid,
      isRevoked: data.is_revoked,
      isAeatConnected: data.is_aeat_connected,
      lastConnectionCheck: data.last_connection_check,
      aeatStatusCode: data.aeat_status_code,
      uploadedAt: data.uploaded_at,
      validationStatus: data.validation_status ?? 'unverified',
    };
  } catch {
    return null;
  }
}

/**
 * Envía certificado al servidor para almacenamiento.
 *
 * ADVERTENCIA: el servidor lo cifra en reposo (AES-256-GCM) pero NO lo
 * valida como certificado FNMT real todavía — ver las advertencias en
 * src/app/api/verifactu/certificate/upload/route.ts. El campo `warning`
 * de la respuesta refleja ese aviso; la UI debe mostrarlo.
 */
export async function uploadVerifactuCertificate(
  certificateBase64: string,
  password: string
): Promise<{ success: boolean; error?: string; certificateId?: string; warning?: string }> {
  try {
    const response = await fetch('/api/verifactu/certificate/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        certificate: certificateBase64,
        password,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: result.error || 'No se pudo cargar el certificado',
      };
    }

    return {
      success: true,
      certificateId: result.certificateId,
      warning: result.warning,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error al cargar certificado',
    };
  }
}

/**
 * Revoca el certificado actual (lo marca como revocado)
 */
export async function revokeVerifactuCertificate(): Promise<void> {
  const userId = await requireUserId();
  const cert = await getActiveCertificate();

  if (!cert) return;

  await supabase()
    .from('verifactu_certificates')
    .update({ is_revoked: true, updated_at: new Date().toISOString() })
    .eq('id', cert.id)
    .eq('user_id', userId);
}

/**
 * Verifica la conexión con los servidores de AEAT
 * Esta llamada hace un health check contra AEAT
 */
export async function checkVerifactuConnection(): Promise<{
  isConnected: boolean;
  statusCode: string | null;
  error: string | null;
}> {
  try {
    const response = await fetch('/api/verifactu/health', {
      method: 'POST',
    });

    const result = await response.json();

    return {
      isConnected: response.ok && result.isConnected,
      statusCode: result.statusCode || null,
      error: result.error || null,
    };
  } catch (err) {
    return {
      isConnected: false,
      statusCode: null,
      error: err instanceof Error ? err.message : 'Error de conexión',
    };
  }
}
