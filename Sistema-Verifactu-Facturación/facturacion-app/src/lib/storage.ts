// ============================================================
// CAPA DE PERSISTENCIA — OFFLINE-FIRST
// Escribe primero a IndexedDB, luego encola sync con Supabase
// Lecturas: IndexedDB (instant) + background sync desde Supabase
// ============================================================

import { createClient } from '@/lib/supabase/client';
import { estadoEfectivo, type FilaSuscripcion } from './suscripcion';
import { consumirLote } from './lotes';
import { venderNumero } from './numerosSerie';
import { costeDeEscandallo, nuevoPmpTrasFabricar } from './fabricacion';
import {
  movimientosDeProducto, reproducirCostes,
  type AjusteParaCostes, type DocumentoParaCostes,
} from './costes';
import {
  getAll, getById, put, putMany, remove as removeFromDb,
  clearStore, enqueueSyncAction, isOfflineDbAvailable,
} from './offlineDb';
import {
  Abono, AbonoAplicacion, Albaran, Client, CompanySettings, CustomCategory,
  Devolucion, Invoice, InvoiceLineItem, InvoiceStatus, Oferta, OrderApproval,
  OrderApprovalItem, PaymentMethod, PosSession, Product, SerieDocumento,
  SentidoDocumento, TipoDocumento, TpvMode, UserProfile, Vendedor,
  Almacen, TraspasoAlmacen, TraspasoLineItem, RegularizacionStock,
  CobroPago, CobroPagoDesglose, TipoCobroPago, MovimientoExtracto,
  Gasto, GastoCategoria, Vehiculo, Obra, OrdenTrabajo, Lote, RappelConfig, GrupoCliente, RutaReparto, NumeroSerie, Escandallo,
} from './types';
import { tipoFiscalAlEmitir } from './verifactu/tipoAlEmitir';
import { problemasParaEmitir, resumenDeErrores } from './validation/identidad';
import { escribirQuitandoColumnasQueFaltan } from './columnasQueFaltan';
import {
  agruparPendientes, lineasDelGrupo, notaDelGrupo, type GrupoAFacturar, type Periodo,
} from './albaranes/facturacionPeriodo';
import { DEFAULT_APPROVAL_EXPIRY_HOURS, DEFAULT_COMPANY_SETTINGS, DEFAULT_IGIC_RATES, DEFAULT_IVA_RATES, DEFAULT_SERIES_DOCUMENTOS, SECTOR_DEFAULT_CATEGORIES, defaultTpvModeForSector } from './constants';
import { addDays, calculateInvoiceTotals, formatCurrency, generateId, generateInvoiceNumber, sequenceFromNumber } from './utils';
import { expectedCashForSession } from './tpvOffline';
import { lineasConCustomCols } from './plantillas/datos';
import { registrarActividad } from './perfilesCliente';
import { totalAPagar } from './retenciones';

function supabase() {
  return createClient();
}

// ============================================================
// BACKGROUND REFRESH HELPER
// ============================================================

const refrescandoAlmacen = new Map<string, Promise<void>>();

/** Lo mismo ordenado igual: dos lecturas iguales dan la misma firma. */
function firmaDeFilas(filas: unknown[]): string {
  return filas
    .map(f => JSON.stringify(f))
    .sort()
    .join('\n');
}

/**
 * Trae del servidor y reemplaza la copia local. Si lo que llega es distinto
 * de lo que había, avisa (`klima-<almacén>-updated`) para que las pantallas
 * abiertas se repinten solas: antes se guardaba en silencio y la pantalla
 * seguía enseñando lo viejo hasta recargar. Una sola petición por almacén a
 * la vez, y sin cambios no hay aviso, así que repintar no hace bucle.
 */
function backgroundRefresh<T>(
  storeName: string,
  supabaseQuery: () => Promise<{ data: T[] | null; error: unknown }>,
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  mapper?: (item: any) => T,
): Promise<void> {
  if (!navigator.onLine) return Promise.resolve();
  const enCurso = refrescandoAlmacen.get(storeName);
  if (enCurso) return enCurso;
  const tarea = (async () => {
    try {
      const { data, error } = await supabaseQuery();
      if (!error && data) {
        const mapped = mapper ? data.map(mapper) : data;
        const antes = firmaDeFilas(await getAll<unknown>(storeName));
        await clearStore(storeName);
        await putMany(storeName, mapped);
        if (antes !== firmaDeFilas(mapped) && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent(`klima-${storeName}-updated`));
          window.dispatchEvent(new CustomEvent('klima-data-updated', { detail: { type: storeName } }));
        }
      }
    } catch {
      // Silently fail — offline data is still valid
    } finally {
      refrescandoAlmacen.delete(storeName);
    }
  })();
  refrescandoAlmacen.set(storeName, tarea);
  return tarea;
}

/** Las consultas de refresco, compartidas por la carga y la revisión periódica. */
const consultaClientes = async () =>
  soloDe(supabase().from('clients').select('*'), await idParaLeer()).order('business_name', { ascending: true });
const consultaProductos = () => supabase().from('products').select('*').order('name', { ascending: true });

export type DatosRevisables = 'invoices' | 'clients' | 'products';

/**
 * Vuelve a mirar el servidor por si algo cambió fuera de esta pestaña
 * (otro equipo, el TPV, lo que se emite solo). Si hay cambios, llega el
 * aviso de siempre y cada pantalla se repinta con lo suyo.
 */
export async function revisarDatos(tipos: DatosRevisables[]): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  if (!(await isOfflineDbAvailable())) return;
  await Promise.all(tipos.map(t =>
    t === 'invoices' ? revisarFacturas()
      : t === 'clients' ? backgroundRefresh('clients', consultaClientes)
        : backgroundRefresh('products', consultaProductos)));
}

/**
 * El usuario de la sesión, para filtrar las lecturas de lo propio.
 *
 * Hace falta aunque la seguridad de la base de datos ya aísla cuentas: una
 * gestoría puede LEER las facturas, clientes, gastos y ajustes de las
 * empresas que lleva (migración 045). Sin este filtro, esas filas se
 * mezclarían con las suyas en sus listados, sus modelos y su contabilidad.
 * Se lee de la sesión local (sin ir a la red); sin sesión no se filtra y
 * la base de datos ya no devuelve nada.
 */
async function idParaLeer(): Promise<string | null> {
  try {
    const { data } = await supabase().auth.getSession();
    if (data?.session?.user?.id) return data.session.user.id;
  } catch { /* se intenta abajo */ }
  return getCurrentUserId();
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
function soloDe<Q extends { eq: (col: string, v: string) => any }>(consulta: Q, userId: string | null): Q {
  return userId ? consulta.eq('user_id', userId) : consulta;
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

export function notifyDataUpdate(type: 'invoices' | 'clients' | 'products' | 'settings' | 'albaranes' | 'all') {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(`klima-${type}-updated`));
    window.dispatchEvent(new CustomEvent('klima-data-updated', { detail: { type } }));
  }
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

  const userId = await idParaLeer();
  const { data: invoicesData, error } = await soloDe(supabase()
    .from('invoices')
    .select('*'), userId)
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
    // ¿Ha cambiado algo respecto a lo que la pantalla ya enseña? Si sí,
    // se avisa al terminar: si no, la lista se quedaba con la copia vieja
    // (una factura recién emitida, sin su número ni su estado definitivos)
    // hasta que alguien recargaba a mano.
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const antes = firmaDeFacturas(await getAll<any>('invoices'));
    await clearStore('invoices');
    await putMany('invoices', enriched);
    if (antes !== firmaDeFacturas(enriched)) cambiaronLasFacturas = true;
  }

  return invoices;
}

/** Lo que, si cambia, cambia lo que se ve en una lista de facturas. */
function firmaDeFacturas(filas: Record<string, unknown>[]): string {
  return filas
    .map(f => [f.id, f.status, f.number, f.total, f.updated_at, f.sealed_at, f.paid_amount, f.due_date,
      Array.isArray(f._lineItems) ? f._lineItems.length : 0].join('|'))
    .sort()
    .join('\n');
}

let cambiaronLasFacturas = false;
let refrescandoFacturas: Promise<void> | null = null;

/**
 * Trae las facturas del servidor y, si algo cambió, avisa a las pantallas
 * abiertas (`klima-invoices-updated`) para que se repinten solas. Una sola
 * petición a la vez: varias pantallas escuchando no multiplican las llamadas,
 * y como sólo se avisa si hay cambios, repintar no provoca otra vuelta.
 */
function refreshInvoicesFromSupabase(): Promise<void> {
  if (!navigator.onLine) return Promise.resolve();
  if (refrescandoFacturas) return refrescandoFacturas;
  refrescandoFacturas = (async () => {
    try {
      cambiaronLasFacturas = false;
      await getInvoicesFromSupabase(); // This also caches
      if (cambiaronLasFacturas) notifyDataUpdate('invoices');
    } catch { /* silent */ } finally {
      refrescandoFacturas = null;
    }
  })();
  return refrescandoFacturas;
}

/** Vuelve a mirar el servidor (al volver a la pestaña, cada rato). */
export function revisarFacturas(): Promise<void> {
  return refreshInvoicesFromSupabase();
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

export function tipoDocumento(doc: { tipo?: TipoDocumento }): TipoDocumento {
  return doc.tipo ?? 'factura';
}
export function sentidoDocumento(doc: { sentido?: SentidoDocumento }): SentidoDocumento {
  return doc.sentido ?? 'venta';
}
/** true si el documento es sellable fiscalmente (factura/rectificativa de venta). */
export function esSellable(doc: { tipo?: TipoDocumento; sentido?: SentidoDocumento }): boolean {
  const t = tipoDocumento(doc);
  const s = sentidoDocumento(doc);
  return (t === 'factura' || t === 'rectificativa') && s === 'venta';
}

export function isSealed(invoice: Pick<Invoice, 'status' | 'tipo' | 'sentido'>): boolean {
  return esSellable(invoice) && SEALED_STATUSES.includes(invoice.status);
}

export function serieDeTipo(settings: CompanySettings, tipo: TipoDocumento, sentido: SentidoDocumento): SerieDocumento {
  const config = settings.seriesDocumentos?.[`${tipo}_${sentido}`];
  if (config && config.serie) return config;
  const porDefecto = DEFAULT_SERIES_DOCUMENTOS[`${tipo}_${sentido}`];
  return porDefecto ?? { serie: 'DOC', nextNumber: 1 };
}

/**
 * Si el número solicitado para la factura borrador ya existe en BD (contador desincronizado,
 * trabajo multiterminal...), asigna automáticamente el siguiente número libre de la serie.
 */
async function nextFreeInvoiceNumber(
  userId: string,
  series: string,
  requestedNumber: string,
  invoice: Invoice,
): Promise<Invoice> {
  const { data } = await supabase()
    .from('invoices')
    .select('id, number')
    .eq('user_id', userId)
    .eq('series', series);

  // Sólo cuentan los números de OTRAS facturas: re-guardar un borrador
  // existente (editar/emitir) no debe renumerarlo aunque su número ya esté
  // en BD. Sin esto, cada edición de un borrador consumía un número nuevo
  // y el contador quedaba desfasado (FAC-2026-0026 previsto → 0033 real).
  const used = new Set(
    (data ?? [])
      .filter((r: { id: string }) => r.id !== invoice.id)
      .map((r: { number: string }) => r.number as string),
  );
  if (!used.has(requestedNumber)) return invoice;

  let candidate = requestedNumber;
  for (let i = 0; i < 1000 && used.has(candidate); i++) {
    candidate = incrementDocumentNumber(candidate, series);
  }
  if (used.has(candidate)) {
    throw new Error('No se pudo asignar un número libre a esta factura. Revisa la numeración.');
  }
  return { ...invoice, number: candidate };
}

/** Guarda cualquier documento no fiscal (presupuesto, pedido, albarán) o una factura/rectificativa borrador. */
export async function saveDocumento(doc: Invoice): Promise<Invoice> {
  if (esSellable(doc) && isSealed(doc)) {
    throw new Error(`El documento ${doc.number} ya está sellado. No se puede modificar.`);
  }
  return saveInvoice(doc);
}

/**
 * Anota en la factura lo que se le ha cobrado.
 *
 * COBRAR UNA FACTURA NO ES MODIFICARLA.
 *
 * `saveDocumento` rechaza cualquier cambio sobre un documento sellado, y una
 * factura cobrable está EMITIDA, PENDIENTE o VENCIDA, que son estados
 * sellados. Con lo cual el registro de un cobro reventaba SIEMPRE, y por eso
 * la tesorería daba «Error al guardar el registro» pasara lo que pasara.
 *
 * Pero lo que se sella es el CONTENIDO FISCAL —el número, la fecha, las
 * bases, las cuotas, el NIF, la cadena de huellas—, no si el cliente ha
 * pagado. Que una factura de marzo se cobre en junio no cambia nada de lo que
 * se declaró en marzo. La propia base de datos lo tiene claro: su disparador
 * de inmutabilidad enumera los campos intocables y `paid_amount`, `status` y
 * `paid_date` no están en la lista.
 *
 * Por eso esto NO pasa por `saveInvoice`: aquél reescribe también las líneas,
 * y el guardián de líneas rechaza tocarlas en una factura sellada aunque los
 * valores sean idénticos —y de paso anota un aviso de manipulación grave en
 * el registro de seguridad, que es lo último que hace falta al cobrar una
 * factura corriente.
 *
 * Se toca la fila de la factura y sólo las cuatro columnas del cobro.
 */
export async function anotarCobroEnFactura(
  factura: Invoice,
  cobro: {
    paidAmount: number;
    paidDate?: string;
    status: InvoiceStatus;
    paymentRecordIds: string[];
  },
): Promise<void> {
  const userId = await requireUserId();
  const campos = {
    paid_amount: cobro.paidAmount,
    paid_date: cobro.paidDate ?? null,
    status: cobro.status,
    payment_record_ids: cobro.paymentRecordIds,
  };

  if (await isOfflineDbAvailable()) {
    const guardada = await getById<Record<string, unknown>>('invoices', factura.id);
    if (guardada) await put('invoices', { ...guardada, ...campos });
  }

  // Va como 'upsert' porque es lo único que entiende la cola, pero el
  // sincronizador reconoce que la fila sólo trae columnas de cobro y aplica
  // ésas sin tocar ni el contenido fiscal ni las líneas.
  const encolar = () => enqueueSyncAction('upsert', 'invoices', { id: factura.id, user_id: userId, ...campos });

  if (!navigator.onLine) {
    await encolar();
    return;
  }
  try {
    const { error } = await supabase().from('invoices').update(campos).eq('id', factura.id);
    if (error) await encolar();
  } catch {
    await encolar();
  }
}

export async function saveInvoice(invoice: Invoice): Promise<Invoice> {
  const userId = await requireUserId();

  const sealed = isSealed(invoice);

  let current: Invoice = invoice;
  if (invoice.status === InvoiceStatus.BORRADOR && navigator.onLine) {
    current = await nextFreeInvoiceNumber(userId, invoice.series, invoice.number, invoice);
  }

  // --- Los totales SIEMPRE salen de las líneas ---
  //
  // Antes se guardaba lo que trajera el documento, y un documento puede venir
  // con los totales mal. Pasó: una factura llegó con la base calculada
  // aplicando sólo el primero de los tres descuentos. El formulario enseñaba
  // 183,16 € y la factura impresa 190,71 €, con los subtotales de línea
  // correctos y el total mintiendo. Se cobra de más y el cliente que suma las
  // líneas no llega al total que se le pide.
  //
  // No basta con arreglar el sitio donde se calcularon mal: cualquier página
  // que monte un documento puede volver a equivocarse. Recalculándolos aquí,
  // el que llegue mal se arregla al guardar.
  //
  // Un documento sellado NO se toca: sus importes son los que se firmaron y
  // se declararon, y recalcularlos rompería la huella. Si uno sellado tuviera
  // los totales mal, se corrige con una rectificativa, que es como se corrige
  // una factura ya emitida.
  if (!sealed) {
    const totales = calculateInvoiceTotals(current.lineItems, [
      current.globalDiscountPercent1 ?? 0,
      current.globalDiscountPercent2 ?? 0,
      current.globalDiscountPercent3 ?? 0,
    ]);
    current = {
      ...current,
      subtotal: totales.subtotal,
      totalDiscount: totales.totalDiscount,
      totalTax: totales.totalTax,
      total: totales.total,
      taxBreakdown: totales.taxBreakdown,
    };
  }

  const buildInvRow = (inv: Invoice) => ({
    id: inv.id,
    user_id: userId,
    number: inv.number,
    series: inv.series,
    client_id: inv.clientId || null,
    client_name: inv.clientName,
    client_nif: inv.clientNif,
    client_address: inv.clientAddress,
    issue_date: inv.issueDate,
    due_date: inv.dueDate,
    paid_date: inv.paidDate || null,
    status: inv.status,
    subtotal: inv.subtotal,
    total_discount: inv.totalDiscount,
    total_tax: inv.totalTax,
    total: inv.total,
    payment_method: inv.paymentMethod,
    notes: inv.notes,
    pos_session_id: inv.posSessionId || null,
    number_temporary: inv.numberTemporary ?? false,
    datos_extras: inv.datosExtras ?? {},
    tipo: inv.tipo ?? 'factura',
    sentido: inv.sentido ?? 'venta',
    documento_origen_id: inv.documentoOrigenId ?? null,
    documento_origen_number: inv.documentoOrigenNumber ?? null,
    vendedor_id: inv.vendedorId ?? null,
    tarifa_id: inv.tarifaId ?? null,
    almacen_id: inv.almacenId ?? null,
    obra_id: inv.obraId ?? null,
    retencion_pct: inv.retencionPct ?? null,
    paid_amount: inv.paidAmount ?? 0,
    payment_record_ids: inv.paymentRecordIds ?? [],
    global_discount_percent_1: inv.globalDiscountPercent1 ?? 0,
    global_discount_percent_2: inv.globalDiscountPercent2 ?? 0,
    global_discount_percent_3: inv.globalDiscountPercent3 ?? 0,
    sii_status: inv.siiStatus || null,
    tipo_factura_fiscal: inv.tipoFacturaFiscal || null,
    clave_regimen_iva: inv.claveRegimenIva || null,
    es_intracomunitaria: inv.esIntracomunitaria ?? false,
    tipo_operacion_349: inv.tipoOperacion349 || null,
    client_vat_number: inv.clientVatNumber || null,
  });

  const lineRows = current.lineItems.map((li, idx) => ({
    id: li.id,
    invoice_id: current.id,
    product_id: li.productId || null,
    product_name: li.productName,
    product_ref: li.productRef,
    quantity: li.quantity,
    unit_price: li.unitPrice,
    unit: li.unit,
    tax_rate: li.taxRate,
    discount_percent: li.discountPercent,
    discount_percent_2: li.discountPercent2 ?? 0,
    discount_percent_3: li.discountPercent3 ?? 0,
    units_per_package: li.unitsPerPackage ?? null,
    lote_id: li.loteId ?? null,
    lote_codigo: li.loteCodigo ?? null,
    numero_serie_id: li.numeroSerieId ?? null,
    numero_serie: li.numeroSerie ?? null,
    cost_price: li.costPrice ?? 0,
    subtotal: li.subtotal,
    tax_amount: li.taxAmount,
    total: li.total,
    sort_order: idx,
  }));

  const taxRows = current.taxBreakdown.map(tb => ({
    invoice_id: current.id,
    rate: tb.rate,
    base_amount: tb.base,
    tax_amount: tb.amount,
  }));

  // 1. Save to IndexedDB
  const offlineAvail = await isOfflineDbAvailable();
  if (offlineAvail) {
    await put('invoices', {
      ...buildInvRow(current),
      _lineItems: lineRows,
      _taxBreakdown: taxRows,
    });
  }

  // 2. If online, save directly to Supabase
  if (navigator.onLine) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const { error: invError } = await supabase().from('invoices').upsert(buildInvRow(current));
      if (!invError) break;
      if (current.status === InvoiceStatus.BORRADOR && invError?.code === '23505') {
        current = await nextFreeInvoiceNumber(userId, current.series, current.number, current);
        if (offlineAvail) {
          await put('invoices', { ...buildInvRow(current), _lineItems: lineRows, _taxBreakdown: taxRows });
        }
        continue;
      }
      throw new Error(translateDbError(invError));
    }

    // Las líneas y el desglose sólo se reescriben mientras es borrador
    if (!sealed) {
      await supabase().from('invoice_line_items').delete().eq('invoice_id', current.id);
      if (lineRows.length > 0) {
        const { error } = await supabase().from('invoice_line_items').insert(lineRows);
        if (error) throw new Error(translateDbError(error));
      }

      await supabase().from('invoice_tax_breakdown').delete().eq('invoice_id', current.id);
      if (taxRows.length > 0) {
        const { error } = await supabase().from('invoice_tax_breakdown').insert(taxRows);
        if (error) throw new Error(translateDbError(error));
      }
    }
  } else {
    // 3. Queue for later sync
    await enqueueSyncAction('upsert', 'invoices', buildInvRow(current));
    if (!sealed) {
      for (const lr of lineRows) {
        await enqueueSyncAction('upsert', 'invoice_line_items', lr);
      }
      for (const tr of taxRows) {
        await enqueueSyncAction('upsert', 'invoice_tax_breakdown', tr);
      }
    }
  }

  notifyDataUpdate('invoices');
  return current;
}

/**
 * Emite una factura: es el punto de no retorno.
 * El servidor le asigna posición en la cadena, la engancha con la huella
 * de la anterior y la sella. A partir de aquí ya no se puede editar.
 */
const formatearEuros = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);

/**
 * Emite una factura y apunta quién lo hizo (el perfil de trabajo activo en
 * este equipo, si la cuenta usa perfiles). El apunte va detrás y no espera:
 * si no se puede apuntar, la factura queda emitida igual.
 */
export async function issueInvoice(invoice: Invoice): Promise<Invoice> {
  const emitida = await emitirFactura(invoice);
  registrarActividad('factura_emitida', {
    documentoId: emitida.id,
    detalle: `${emitida.number} · ${formatearEuros(emitida.total)}`,
  });
  return emitida;
}

async function emitirFactura(invoice: Invoice): Promise<Invoice> {
  if (!esSellable(invoice)) {
    throw new Error('Solo las facturas y rectificativas de venta se sellan. Usa guardarDocumento para el resto.');
  }
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
  // la escritura de las líneas. El primer guardado puede reasignar el
  // número si el previsto ya lo usaba otra factura, así que el sellado
  // debe usar el número que de verdad se persistió (no el del objeto
  // original, que quedaría desfasado o chocaría con el de otra factura).
  // Completa o simplificada se decide AQUÍ: sellada ya no se puede
  // cambiar, y una F1 sin NIF del cliente la rechazaría la AEAT.
  const tipoFacturaFiscal = tipoFiscalAlEmitir(invoice);
  if (tipoFacturaFiscal) invoice = { ...invoice, tipoFacturaFiscal };

  // Última puerta antes de sellar: NIF y nombre de quien emite y de quien
  // recibe, que cuadren entre sí, y los domicilios de la factura completa.
  // Después de esta línea la factura ya no se puede corregir, sólo
  // rectificar; por eso aquí se para, venga de donde venga (nueva
  // factura, edición, detalle o TPV).
  const [ajustesEmisor, fichaCliente] = await Promise.all([
    getCompanySettings(),
    invoice.clientId ? getClientById(invoice.clientId).catch(() => undefined) : Promise.resolve(undefined),
  ]);
  const bloqueo = resumenDeErrores(problemasParaEmitir(invoice, ajustesEmisor, fichaCliente?.country));
  if (bloqueo) throw new Error(bloqueo);

  const draft = await saveInvoice({ ...invoice, status: InvoiceStatus.BORRADOR });
  await saveInvoice({ ...draft, status: InvoiceStatus.EMITIDA });

  const fresh = await getInvoiceFromSupabase(invoice.id);
  return fresh ?? { ...draft, status: InvoiceStatus.EMITIDA };
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
  notifyDataUpdate('invoices');
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

  notifyDataUpdate('invoices');
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
      void backgroundRefresh('clients', consultaClientes);
      return cached.map(mapClientFromDb);
    }
  }

  if (!navigator.onLine) return [];

  const { data, error } = await soloDe(supabase()
    .from('clients')
    .select('*'), await idParaLeer())
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

export async function getClientes(): Promise<Client[]> {
  const all = await getClients();
  return all.filter(c => !c.esProveedor);
}

export async function getProveedores(): Promise<Client[]> {
  const all = await getClients();
  return all.filter(c => c.esProveedor);
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
    es_proveedor: client.esProveedor ?? false,
    vendedor_id: client.vendedorId || null,
    tarifa_id: client.tarifaId || null,
    default_discounts: client.defaultDiscounts || [0, 0, 0],
    grupo_id: client.grupoId || null,
    ruta_id: client.rutaId || null,
    vat_number: client.vatNumber || null,
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

  notifyDataUpdate('clients');
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

  notifyDataUpdate('clients');
}

// ============================================================
// VENDEDORES
// ============================================================

function mapVendedorFromDb(v: any): Vendedor {
  return {
    id: v.id,
    nombre: v.nombre || '',
    activo: v.activo ?? true,
    series: v.series || {},
    almacenId: v.almacen_id || undefined,
    comisionPct: v.comision_pct != null ? Number(v.comision_pct) : undefined,
    createdAt: v.created_at || new Date().toISOString(),
    updatedAt: v.updated_at || new Date().toISOString(),
  };
}

export async function getVendedores(): Promise<Vendedor[]> {
  const offlineAvail = await isOfflineDbAvailable();
  if (offlineAvail) {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const cached = await getAll<any>('vendedores');
    if (cached.length > 0) {
      backgroundRefresh('vendedores', () =>
        supabase().from('vendedores').select('*').order('nombre', { ascending: true })
      );
      return cached.map(mapVendedorFromDb);
    }
  }

  if (!navigator.onLine) return [];

  const { data, error } = await supabase()
    .from('vendedores')
    .select('*')
    .order('nombre', { ascending: true });

  if (error || !data) return [];

  if (await isOfflineDbAvailable()) {
    await clearStore('vendedores');
    await putMany('vendedores', data);
  }

  return data.map(mapVendedorFromDb);
}

export async function getVendedorById(id: string): Promise<Vendedor | undefined> {
  const offlineAvail = await isOfflineDbAvailable();
  if (offlineAvail) {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const cached = await getById<any>('vendedores', id);
    if (cached) return mapVendedorFromDb(cached);
  }

  if (!navigator.onLine) return undefined;

  const { data } = await supabase()
    .from('vendedores')
    .select('*')
    .eq('id', id)
    .single();

  return data ? mapVendedorFromDb(data) : undefined;
}

export async function saveVendedor(vendedor: Vendedor): Promise<void> {
  const userId = await requireUserId();
  const row = {
    id: vendedor.id,
    user_id: userId,
    nombre: vendedor.nombre,
    activo: vendedor.activo,
    series: vendedor.series || {},
    almacen_id: vendedor.almacenId || null,
    comision_pct: vendedor.comisionPct ?? null,
    updated_at: new Date().toISOString(),
  };

  const offlineAvail = await isOfflineDbAvailable();
  if (offlineAvail) {
    await put('vendedores', row);
  }

  if (navigator.onLine) {
    let result: { error: unknown } | null = null;
    try {
      result = await supabase().from('vendedores').upsert(row);
    } catch {
      await enqueueSyncAction('upsert', 'vendedores', row);
    }
    if (result?.error) throw new Error(translateDbError(result.error));
  } else {
    await enqueueSyncAction('upsert', 'vendedores', row);
  }
}

export async function deleteVendedor(id: string): Promise<void> {
  const offlineAvail = await isOfflineDbAvailable();
  if (offlineAvail) {
    await removeFromDb('vendedores', id);
  }

  if (navigator.onLine) {
    try {
      await supabase().from('vendedores').delete().eq('id', id);
    } catch {
      await enqueueSyncAction('delete', 'vendedores', { id });
    }
  } else {
    await enqueueSyncAction('delete', 'vendedores', { id });
  }
}

// ============================================================
// ALBARANES (EXPEDICIÓN VENTA Y COMPRA CON MULTI-ALMACÉN Y PMP)
// ============================================================

export async function expedirAlbaranCompra(id: string): Promise<Invoice> {
  const doc = await getInvoiceById(id);
  if (!doc) throw new Error('Documento no encontrado.');
  if (doc.sentido !== 'compra' || doc.tipo !== 'albaran') throw new Error('No es un albarán de compra.');
  if (doc.status === InvoiceStatus.EXPEDIDO || isSealed(doc)) throw new Error(`El albarán ${doc.number} ya está expedido.`);
  const updated = await saveDocumento({ ...doc, status: InvoiceStatus.EXPEDIDO });
  for (const li of doc.lineItems) {
    if (!li.productId || li.quantity <= 0) continue;
    const precioNetoLinea = li.unitPrice * (1 - (li.discountPercent || 0) / 100) * (1 - (li.discountPercent2 || 0) / 100) * (1 - (li.discountPercent3 || 0) / 100);
    await actualizarPmpYStockCompra(li.productId, Math.abs(li.quantity), precioNetoLinea, doc.almacenId);
  }
  return updated;
}

export async function expedirAlbaranVenta(id: string): Promise<Invoice> {
  const doc = await getInvoiceById(id);
  if (!doc) throw new Error('Documento no encontrado.');
  if (doc.tipo !== 'albaran') throw new Error('No es un albarán.');
  if (doc.status === InvoiceStatus.EXPEDIDO || isSealed(doc)) throw new Error(`El albarán ${doc.number} ya está expedido.`);
  const updated = await saveDocumento({ ...doc, status: InvoiceStatus.EXPEDIDO });
  for (const li of doc.lineItems) {
    if (!li.productId || li.quantity <= 0) continue;
    await adjustStock(li.productId, -Math.abs(li.quantity), doc.almacenId);

    // El lote se descuenta en el MISMO momento que el stock del producto: es
    // cuando la mercancía sale de verdad por la puerta. Descontarlo antes
    // —al crear el albarán, todavía sin expedir— dejaría el lote gastado por
    // una venta que a lo mejor ni siquiera llega a salir.
    if (li.loteId) {
      const lote = await getLoteById(li.loteId);
      if (lote) {
        const { cantidadDisponible } = consumirLote(lote, Math.abs(li.quantity));
        await saveLote({ ...lote, cantidadDisponible });
      }
    }

    // Igual con el número de serie: pasa a «vendido» en el mismo instante en
    // que la unidad sale de verdad, no al crear el albarán.
    if (li.numeroSerieId) {
      const numero = await getNumeroSerieById(li.numeroSerieId);
      if (numero) {
        await saveNumeroSerie(venderNumero(numero, {
          fechaVenta: doc.issueDate,
          clienteId: doc.clientId,
          clienteNombre: doc.clientName,
          invoiceId: doc.id,
        }));
      }
    }
  }
  return updated;
}

// ============================================================
// ALMACENES, LOCALIZACIONES Y TRASPASOS
// ============================================================

export async function getAlmacenes(): Promise<Almacen[]> {
  const offlineAvail = await isOfflineDbAvailable();

  if (offlineAvail) {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const cached = await getAll<any>('almacenes');
    if (cached.length > 0) {
      backgroundRefresh('almacenes', () =>
        supabase().from('almacenes').select('*').order('nombre', { ascending: true })
      );
      return cached.map(mapAlmacenFromDb);
    }
  }

  if (!navigator.onLine) return [];

  const { data, error } = await supabase()
    .from('almacenes')
    .select('*')
    .order('nombre', { ascending: true });

  if (error || !data) return [];

  if (await isOfflineDbAvailable()) {
    await clearStore('almacenes');
    await putMany('almacenes', data);
  }

  return data.map(mapAlmacenFromDb);
}

export async function getAlmacenById(id: string): Promise<Almacen | undefined> {
  const almacenes = await getAlmacenes();
  return almacenes.find(a => a.id === id);
}

export async function ensureDefaultAlmacen(): Promise<Almacen> {
  const almacenes = await getAlmacenes();
  const principal = almacenes.find(a => a.principal && a.activo) || almacenes[0];
  if (principal) return principal;

  const now = new Date().toISOString();
  const def: Almacen = {
    id: generateId(),
    codigo: 'ALM-01',
    nombre: 'Almacén Central',
    direccion: 'Sede Principal',
    principal: true,
    activo: true,
    createdAt: now,
    updatedAt: now,
  };
  await saveAlmacen(def);
  return def;
}

export async function saveAlmacen(almacen: Almacen): Promise<void> {
  const userId = await requireUserId();

  const row = {
    id: almacen.id,
    user_id: userId,
    codigo: almacen.codigo,
    nombre: almacen.nombre,
    direccion: almacen.direccion || null,
    principal: almacen.principal ?? false,
    activo: almacen.activo ?? true,
    updated_at: new Date().toISOString(),
  };

  const offlineAvail = await isOfflineDbAvailable();
  if (offlineAvail) {
    await put('almacenes', row);
  }

  if (navigator.onLine) {
    try {
      await supabase().from('almacenes').upsert(row);
    } catch {
      await enqueueSyncAction('upsert', 'almacenes', row);
    }
  } else {
    await enqueueSyncAction('upsert', 'almacenes', row);
  }
}

export async function deleteAlmacen(id: string): Promise<void> {
  const offlineAvail = await isOfflineDbAvailable();
  if (offlineAvail) {
    await removeFromDb('almacenes', id);
  }

  if (navigator.onLine) {
    try {
      await supabase().from('almacenes').delete().eq('id', id);
    } catch {
      await enqueueSyncAction('delete', 'almacenes', { id });
    }
  } else {
    await enqueueSyncAction('delete', 'almacenes', { id });
  }
}

export function mapAlmacenFromDb(a: any): Almacen {
  return {
    id: a.id,
    codigo: a.codigo,
    nombre: a.nombre,
    direccion: a.direccion || '',
    principal: a.principal ?? false,
    activo: a.activo ?? true,
    createdAt: a.created_at || a.createdAt || new Date().toISOString(),
    updatedAt: a.updated_at || a.updatedAt || new Date().toISOString(),
  };
}

// --- TRASPASOS ENTRE ALMACENES ---

export async function getTraspasos(): Promise<TraspasoAlmacen[]> {
  const offlineAvail = await isOfflineDbAvailable();

  if (offlineAvail) {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const cached = await getAll<any>('traspasos');
    if (cached.length > 0) {
      return cached.map(mapTraspasoFromDb);
    }
  }

  if (!navigator.onLine) return [];

  const { data, error } = await supabase()
    .from('traspasos')
    .select('*, traspaso_line_items(*)')
    .order('created_at', { ascending: false });

  if (error || !data) return [];

  if (await isOfflineDbAvailable()) {
    await clearStore('traspasos');
    await putMany('traspasos', data);
  }

  return data.map(mapTraspasoFromDb);
}

export async function saveTraspaso(traspaso: TraspasoAlmacen): Promise<void> {
  const userId = await requireUserId();

  const row = {
    id: traspaso.id,
    user_id: userId,
    number: traspaso.number,
    origen_almacen_id: traspaso.origenAlmacenId,
    origen_almacen_nombre: traspaso.origenAlmacenNombre,
    destino_almacen_id: traspaso.destinoAlmacenId,
    destino_almacen_nombre: traspaso.destinoAlmacenNombre,
    fecha: traspaso.fecha,
    notas: traspaso.notas || null,
    updated_at: new Date().toISOString(),
  };

  const lineRows = traspaso.lineItems.map((li, idx) => ({
    id: li.id,
    traspaso_id: traspaso.id,
    product_id: li.productId,
    product_name: li.productName,
    product_ref: li.productRef,
    quantity: li.quantity,
    unit: li.unit || 'ud',
    sort_order: idx,
  }));

  // Actualizar stocks en productos
  for (const li of traspaso.lineItems) {
    const prod = await getProductById(li.productId);
    if (!prod) continue;

    const currentStocks = { ...(prod.stocksByAlmacen || {}) };
    const stockOrigen = (currentStocks[traspaso.origenAlmacenId] ?? 0) - li.quantity;
    const stockDestino = (currentStocks[traspaso.destinoAlmacenId] ?? 0) + li.quantity;

    currentStocks[traspaso.origenAlmacenId] = stockOrigen;
    currentStocks[traspaso.destinoAlmacenId] = stockDestino;

    await saveProduct({
      ...prod,
      stocksByAlmacen: currentStocks,
    });
  }

  const offlineAvail = await isOfflineDbAvailable();
  if (offlineAvail) {
    await put('traspasos', { ...row, _lineItems: lineRows });
  }

  if (navigator.onLine) {
    try {
      await supabase().from('traspasos').upsert(row);
      await supabase().from('traspaso_line_items').delete().eq('traspaso_id', traspaso.id);
      if (lineRows.length > 0) {
        await supabase().from('traspaso_line_items').insert(lineRows);
      }
    } catch {
      await enqueueSyncAction('upsert', 'traspasos', { ...row, line_items: lineRows });
    }
  } else {
    await enqueueSyncAction('upsert', 'traspasos', { ...row, line_items: lineRows });
  }
}

export function mapTraspasoFromDb(t: any): TraspasoAlmacen {
  const rawLines = t.traspaso_line_items || t._lineItems || [];
  return {
    id: t.id,
    number: t.number,
    origenAlmacenId: t.origen_almacen_id || t.origenAlmacenId,
    origenAlmacenNombre: t.origen_almacen_nombre || t.origenAlmacenNombre || '',
    destinoAlmacenId: t.destino_almacen_id || t.destinoAlmacenId,
    destinoAlmacenNombre: t.destino_almacen_nombre || t.destinoAlmacenNombre || '',
    fecha: t.fecha,
    lineItems: rawLines.map((li: any) => ({
      id: li.id,
      productId: li.product_id || li.productId || '',
      productName: li.product_name || li.productName || '',
      productRef: li.product_ref || li.productRef || '',
      quantity: Number(li.quantity || 0),
      unit: li.unit || 'ud',
    })),
    notas: t.notas || '',
    createdAt: t.created_at || t.createdAt || new Date().toISOString(),
    updatedAt: t.updated_at || t.updatedAt || new Date().toISOString(),
  };
}

// --- REGULARIZACIONES DE STOCK (INVENTARIO) ---

export async function getRegularizaciones(): Promise<RegularizacionStock[]> {
  const offlineAvail = await isOfflineDbAvailable();

  if (offlineAvail) {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const cached = await getAll<any>('regularizaciones_stock');
    if (cached.length > 0) {
      return cached.map(mapRegularizacionFromDb);
    }
  }

  if (!navigator.onLine) return [];

  const { data, error } = await supabase()
    .from('regularizaciones_stock')
    .select('*')
    .order('created_at', { ascending: false });

  if (error || !data) return [];

  if (await isOfflineDbAvailable()) {
    await clearStore('regularizaciones_stock');
    await putMany('regularizaciones_stock', data);
  }

  return data.map(mapRegularizacionFromDb);
}

export async function saveRegularizacion(reg: RegularizacionStock): Promise<void> {
  const userId = await requireUserId();

  const row = {
    id: reg.id,
    user_id: userId,
    fecha: reg.fecha,
    almacen_id: reg.almacenId,
    almacen_nombre: reg.almacenNombre,
    product_id: reg.productId,
    product_name: reg.productName,
    product_ref: reg.productRef,
    stock_teorico: reg.stockTeorico,
    stock_real: reg.stockReal,
    diferencia: reg.diferencia,
    motivo: reg.motivo,
    notas: reg.notas || null,
    created_at: reg.createdAt || new Date().toISOString(),
  };

  // Ajustar stock del producto al stock real
  const prod = await getProductById(reg.productId);
  if (prod) {
    const currentStocks = { ...(prod.stocksByAlmacen || {}) };
    currentStocks[reg.almacenId] = reg.stockReal;

    // Recalcular stock total sumando los almacenes o ajustando la diferencia
    const nuevoStockTotal = (prod.stockQuantity ?? 0) + reg.diferencia;
    await saveProduct({
      ...prod,
      stockQuantity: nuevoStockTotal,
      stocksByAlmacen: currentStocks,
    });
  }

  const offlineAvail = await isOfflineDbAvailable();
  if (offlineAvail) {
    await put('regularizaciones_stock', row);
  }

  if (navigator.onLine) {
    try {
      await supabase().from('regularizaciones_stock').upsert(row);
    } catch {
      await enqueueSyncAction('upsert', 'regularizaciones_stock', row);
    }
  } else {
    await enqueueSyncAction('upsert', 'regularizaciones_stock', row);
  }
}

export function mapRegularizacionFromDb(r: any): RegularizacionStock {
  return {
    id: r.id,
    fecha: r.fecha,
    almacenId: r.almacen_id || r.almacenId,
    almacenNombre: r.almacen_nombre || r.almacenNombre || '',
    productId: r.product_id || r.productId,
    productName: r.product_name || r.productName || '',
    productRef: r.product_ref || r.productRef || '',
    stockTeorico: Number(r.stock_teorico ?? r.stockTeorico ?? 0),
    stockReal: Number(r.stock_real ?? r.stockReal ?? 0),
    diferencia: Number(r.diferencia ?? 0),
    motivo: r.motivo || 'Recuento de inventario',
    notas: r.notas || '',
    createdAt: r.created_at || r.createdAt || new Date().toISOString(),
  };
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
      void backgroundRefresh('products', consultaProductos);
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
    image: product.imageUrl || null,
    supplier_ref: product.supplierRef || null,
    tarifa_prices: product.tarifaPrices || {},
    coste_pmp: product.costePmp ?? 0,
    coste_ultima_compra: product.costeUltimaCompra ?? 0,
    stocks_by_almacen: product.stocksByAlmacen || {},
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

  notifyDataUpdate('products');
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

  notifyDataUpdate('products');
}

// ============================================================
// TPV Y AJUSTES DE STOCK CON MULTI-ALMACÉN Y PMP
// ============================================================

/** Busca un producto por su código de barras exacto (para el escáner). */
export async function findProductByBarcode(barcode: string): Promise<Product | undefined> {
  const code = barcode.trim();
  if (!code) return undefined;
  const products = await getProducts();
  return products.find(p => p.barcode === code);
}

/**
 * Ajusta el stock de un producto (opcionalmente desglosado por almacén).
 */
export async function adjustStock(productId: string, delta: number, almacenId?: string): Promise<number> {
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
      if (cached) {
        const stocks = { ...(cached.stocks_by_almacen || {}) };
        if (almacenId) stocks[almacenId] = (stocks[almacenId] ?? 0) + delta;
        await put('products', { ...cached, stock_quantity: newStock, stocks_by_almacen: stocks });
      }
    }
    return newStock;
  }

  const product = await getProductById(productId);
  if (!product) throw new Error('Producto no encontrado.');

  const currentStocks = { ...(product.stocksByAlmacen || {}) };
  if (almacenId) {
    currentStocks[almacenId] = (currentStocks[almacenId] ?? 0) + delta;
  }

  const newStock = (product.stockQuantity ?? 0) + delta;
  await saveProduct({
    ...product,
    stockQuantity: newStock,
    stocksByAlmacen: currentStocks,
  });

  return newStock;
}

/**
 * Actualiza el stock y recalcula el PMP (Precio Medio Ponderado) al registrar una compra.
 * Fórmula: PMP = ((Stock * PMP_ant) + (Cant * Precio)) / (Stock + Cant)
 */
export async function actualizarPmpYStockCompra(
  productId: string,
  cantidadComprada: number,
  precioCompraNeto: number,
  almacenId?: string,
): Promise<void> {
  const product = await getProductById(productId);
  if (!product) return;

  const stockActual = Math.max(product.stockQuantity ?? 0, 0);
  const pmpActual = product.costePmp && product.costePmp > 0 ? product.costePmp : (product.unitPrice || 0);

  const nuevoPmp = stockActual + cantidadComprada > 0
    ? ((stockActual * pmpActual) + (cantidadComprada * precioCompraNeto)) / (stockActual + cantidadComprada)
    : precioCompraNeto;

  const currentStocks = { ...(product.stocksByAlmacen || {}) };
  if (almacenId) {
    currentStocks[almacenId] = (currentStocks[almacenId] ?? 0) + cantidadComprada;
  }

  const nuevoStockTotal = (product.stockQuantity ?? 0) + cantidadComprada;

  await saveProduct({
    ...product,
    stockQuantity: nuevoStockTotal,
    costePmp: Math.round(nuevoPmp * 10000) / 10000,
    costeUltimaCompra: Math.round(precioCompraNeto * 10000) / 10000,
    stocksByAlmacen: currentStocks,
  });
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
/** Abre la caja y apunta quién la abrió. */
export async function openPosSession(startingCash: number): Promise<PosSession> {
  const sesion = await abrirCaja(startingCash);
  registrarActividad('caja_abierta', { documentoId: sesion.id, detalle: `Fondo ${formatearEuros(startingCash)}` });
  return sesion;
}

async function abrirCaja(startingCash: number): Promise<PosSession> {
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
/** Cierra la caja y apunta quién la cerró y con qué descuadre. */
export async function closePosSession(sessionId: string, countedCash: number): Promise<PosSession> {
  const sesion = await cerrarCaja(sessionId, countedCash);
  const dif = sesion.cashDifference ?? 0;
  registrarActividad('caja_cerrada', {
    documentoId: sesion.id,
    detalle: dif === 0 ? 'Cuadrada' : `${dif > 0 ? 'Sobran' : 'Faltan'} ${formatearEuros(Math.abs(dif))}`,
  });
  return sesion;
}

async function cerrarCaja(sessionId: string, countedCash: number): Promise<PosSession> {
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

async function refreshAlbaranesFromSupabase(): Promise<void> {
  if (!navigator.onLine) return;
  try {
    await getAlbaranesFromSupabase();
  } catch { /* silent */ }
}

export async function getAlbaranes(): Promise<Albaran[]> {
  const offlineAvail = await isOfflineDbAvailable();

  if (offlineAvail) {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const cached = await getAll<any>('albaranes');
    if (cached.length > 0) {
      refreshAlbaranesFromSupabase();
      return cached.map((a) => mapAlbaranFromDb(a, a._lineItems || []));
    }
  }

  return getAlbaranesFromSupabase();
}

async function getAlbaranesFromSupabase(): Promise<Albaran[]> {
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

  const offlineAvail = await isOfflineDbAvailable();
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

/** Avanza un número de documento (SERIE-AAAA-NNNN) a la siguiente secuencia. */
function incrementDocumentNumber(number: string, series: string): string {
  const match = /^(.*)-(\d{4})-(\d+)$/.exec(number);
  if (!match) return generateInvoiceNumber(series, 1);
  const year = Number(match[2]);
  const seq = Number(match[3]) + 1;
  return generateInvoiceNumber(series, seq, year);
}

/**
 * Si el número solicitado para el albarán ya existe en BD (contador de settings
 * desincronizado, trabajo en varios dispositivos…), devuelve el albarán con el
 * siguiente número libre de la serie. En caso contrario, sin cambios.
 */
async function nextFreeAlbaranNumber(
  userId: string,
  series: string,
  requestedNumber: string,
  albaran: Albaran,
): Promise<Albaran> {
  const { data } = await supabase()
    .from('albaranes')
    .select('id, number')
    .eq('user_id', userId)
    .eq('series', series);

  // Igual que en facturas: sólo cuentan los números de OTROS albaranes.
  // Re-guardar uno existente no debe renumerarlo aunque su número ya esté
  // en BD; si lo está en otro documento, sí se asigna el siguiente libre.
  const used = new Set(
    (data ?? [])
      .filter((r: { id: string }) => r.id !== albaran.id)
      .map((r: { number: string }) => r.number as string),
  );
  if (!used.has(requestedNumber)) return albaran;

  let candidate = requestedNumber;
  for (let i = 0; i < 1000 && used.has(candidate); i++) {
    candidate = incrementDocumentNumber(candidate, series);
  }
  if (used.has(candidate)) {
    throw new Error('No se pudo asignar un número libre a este albarán. Revisa la numeración.');
  }
  return { ...albaran, number: candidate };
}

export async function saveAlbaran(albaran: Albaran): Promise<Albaran> {
  const userId = await requireUserId();

  const buildRow = (a: Albaran) => ({
    id: a.id,
    user_id: userId,
    number: a.number,
    series: a.series,
    client_id: a.clientId || null,
    client_name: a.clientName,
    client_nif: a.clientNif,
    client_address: a.clientAddress,
    issue_date: a.issueDate,
    status: a.status,
    subtotal: a.subtotal,
    total_discount: a.totalDiscount,
    total_tax: a.totalTax,
    total: a.total,
    notes: a.notes,
    invoice_id: a.invoiceId || null,
    datos_extras: a.datosExtras ?? {},
  });

  // Numeración auto-reparable: si el número del borrador ya existe, se avanza
  // al siguiente libre en vez de chocar con uq_albaranes_user_series_number
  // (que devolvería 23505 y el error "Ese registro ya existe").
  let current: Albaran = albaran;
  if (albaran.status === 'borrador' && navigator.onLine) {
    current = await nextFreeAlbaranNumber(userId, albaran.series, albaran.number, albaran);
  }

  const lineRows = current.lineItems.map((li, idx) => ({
    id: li.id,
    albaran_id: current.id,
    product_id: li.productId || null,
    product_name: li.productName,
    product_ref: li.productRef,
    quantity: li.quantity,
    unit_price: li.unitPrice,
    unit: li.unit,
    tax_rate: li.taxRate,
    discount_percent: li.discountPercent,
    discount_percent_2: li.discountPercent2 ?? 0,
    discount_percent_3: li.discountPercent3 ?? 0,
    subtotal: li.subtotal,
    tax_amount: li.taxAmount,
    total: li.total,
    sort_order: idx,
  }));

  const offlineAvail = await isOfflineDbAvailable();
  if (offlineAvail) {
    await put('albaranes', { ...buildRow(current), _lineItems: lineRows });
  }

  if (navigator.onLine) {
    // Reintento acotado ante una carrera de numeración entre dispositivos:
    // si el servidor sigue rechazando el número, se re-numera y se reintenta.
    for (let attempt = 0; attempt < 20; attempt++) {
      const { error: headerError } = await supabase().from('albaranes').upsert(buildRow(current));
      if (!headerError) break;
      if (current.status === 'borrador' && headerError?.code === '23505') {
        current = await nextFreeAlbaranNumber(userId, current.series, current.number, current);
        if (offlineAvail) {
          await put('albaranes', { ...buildRow(current), _lineItems: lineRows });
        }
        continue;
      }
      throw new Error(translateDbError(headerError));
    }

    await supabase().from('albaran_line_items').delete().eq('albaran_id', current.id);
    if (lineRows.length > 0) {
      const { error } = await supabase().from('albaran_line_items').insert(lineRows);
      if (error) throw new Error(translateDbError(error));
    }
  } else {
    await enqueueSyncAction('upsert', 'albaranes', buildRow(current));
    for (const lr of lineRows) {
      await enqueueSyncAction('upsert', 'albaran_line_items', lr);
    }
  }

  return current;
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

/**
 * Anula un albarán dejando constancia del motivo.
 *
 * El motivo no se guardaba: las dos pantallas que anulan un albarán lo
 * pedían como obligatorio, lo validaban… y luego llamaban aquí sin él,
 * porque esta función ni siquiera lo aceptaba. El aviso de después decía
 * «motivo registrado» y no había tal registro en ninguna parte.
 *
 * Va a `notes` y no a una columna propia como en las facturas
 * (`cancel_reason`): un albarán no entra en la cadena sellada de
 * Veri*Factu, así que no necesita columna aparte, y `notes` ya se
 * guarda y ya se enseña en la ficha.
 */
export async function anularAlbaran(id: string, motivo?: string): Promise<Albaran> {
  const albaran = await getAlbaranById(id);
  if (!albaran) throw new Error('Albarán no encontrado.');
  if (albaran.status === 'facturado') {
    throw new Error(`El albarán ${albaran.number} ya está facturado. No se puede anular.`);
  }

  const anotacion = motivo?.trim()
    ? `ANULADO (${new Date().toLocaleDateString('es-ES')}): ${motivo.trim()}`
    : '';

  const updated: Albaran = {
    ...albaran,
    status: 'anulado',
    notes: [albaran.notes?.trim(), anotacion].filter(Boolean).join('\n'),
    updatedAt: new Date().toISOString(),
  };
  await saveAlbaran(updated);

  notifyDataUpdate('albaranes');
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
  const grupos = agruparPendientes(all.filter(a => albaranIds.includes(a.id)));

  if (grupos.length === 0) {
    throw new Error('No hay albaranes expedidos en la selección.');
  }
  return facturarGruposDeAlbaranes(grupos);
}

/**
 * Factura todos los albaranes expedidos de un periodo: una factura por
 * cliente. Con `claves`, sólo los de esos clientes (ver `claveCliente`).
 */
export async function facturarAlbaranesDelPeriodo(periodo: Periodo, claves?: string[]): Promise<Invoice[]> {
  const grupos = agruparPendientes(await getAlbaranes(), periodo)
    .filter(g => !claves || claves.includes(g.clave));
  if (grupos.length === 0) {
    throw new Error('No hay albaranes expedidos pendientes de facturar en esas fechas.');
  }
  return facturarGruposDeAlbaranes(grupos);
}

async function facturarGruposDeAlbaranes(grupos: GrupoAFacturar[]): Promise<Invoice[]> {
  const settings = await getCompanySettings();
  const invoices: Invoice[] = [];

  for (const grupo of grupos) {
    const numero = generateInvoiceNumber(settings.invoiceSeries, settings.nextInvoiceNumber);
    const lineItems = lineasDelGrupo(grupo, generateId);
    const totals = calculateInvoiceTotals(lineItems);
    const issueDate = new Date().toISOString().split('T')[0];
    const now = new Date().toISOString();

    const invoice: Invoice = {
      id: generateId(),
      number: numero,
      series: settings.invoiceSeries,
      clientId: grupo.clientId,
      clientName: grupo.clientName,
      clientNif: grupo.clientNif,
      clientAddress: grupo.clientAddress,
      issueDate,
      dueDate: addDays(issueDate, settings.defaultPaymentDays),
      status: InvoiceStatus.BORRADOR,
      lineItems,
      ...totals,
      paymentMethod: settings.defaultPaymentMethod,
      notes: notaDelGrupo(grupo),
      createdAt: now,
      updatedAt: now,
    };

    const savedInvoice = await saveInvoice(invoice);
    settings.nextInvoiceNumber = sequenceFromNumber(savedInvoice.number) + 1;
    invoices.push(savedInvoice);

    for (const a of grupo.albaranes) {
      await saveAlbaran({
        ...a,
        status: 'facturado',
        invoiceId: savedInvoice.id,
        updatedAt: now,
      });
    }
  }

  await saveCompanySettings(settings);
  notifyDataUpdate('albaranes');
  notifyDataUpdate('invoices');
  return invoices;
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
function mapAlbaranFromDb(a: any, lineItems: any[]): Albaran {
  const lines = lineasConCustomCols(lineItems.map(mapLineItemFromDb), a.datos_extras ?? {});
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
    datosExtras: a.datos_extras ?? {},
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

/**
 * Cuántas veces se han guardado los ajustes en esta pestaña.
 *
 * `getCompanySettings` devuelve la caché y, a la vez, pide la fila al
 * servidor para refrescarla. Si mientras esa petición va y viene se guarda
 * algo (borrar categorías, por ejemplo), la respuesta trae la fila de ANTES
 * y, al llegar, pisaba la caché: la categoría borrada volvía a salir en
 * cuanto se recargaba la lista. Con este contador, una respuesta que salió
 * antes del último guardado se tira.
 */
let versionAjustes = 0;

export async function getCompanySettings(): Promise<CompanySettings> {
  const offlineAvail = await isOfflineDbAvailable();
  let settings: CompanySettings | null = null;

  if (offlineAvail) {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const cached = await getById<any>('settings', 'company');
    if (cached) {
      // Background refresh
      if (navigator.onLine) {
        const versionAlPedir = versionAjustes;
        idParaLeer().then(uid => soloDe(supabase().from('company_settings').select('*'), uid).order('updated_at', { ascending: false }).limit(1))
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        .then((res: any) => {
          const data = res?.data?.[0];
          if (data && versionAlPedir === versionAjustes) {
            withSettingsCacheLock(async () => {
              /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
              const prev = await getById<any>('settings', 'company');
              // Otra comprobación ya dentro del cerrojo: el guardado pudo
              // entrar mientras se esperaba el turno.
              if (versionAlPedir !== versionAjustes) return;
              const merged = { ...data };
              // No clobber: si la fila de BD aún no trae custom_categories
              // (migración 008 sin aplicar), conserva las que haya localmente.
              if (prev?.custom_categories && !Array.isArray(merged.custom_categories)) {
                merged.custom_categories = prev.custom_categories;
              }
              await put('settings', { ...merged, key: 'company' });
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
    // Se lee la fila más reciente SIN .single(): si existen filas duplicadas
    // de company_settings (guardados offline antiguos), un .single() devolvería
    // 406 y el contador caería a los valores por defecto, provocando choques
    // de numeración al crear albaranes, facturas, devoluciones y abonos.
    const { data } = await soloDe(supabase()
      .from('company_settings')
      .select('*'), await idParaLeer())
      .order('updated_at', { ascending: false })
      .limit(1);

    const row = data?.[0];
    if (row) {
      if (await isOfflineDbAvailable()) {
        await withSettingsCacheLock(() => put('settings', { ...row, key: 'company' }));
      }
      settings = mapSettingsFromDb(row);
    } else {
      settings = { ...DEFAULT_COMPANY_SETTINGS };
    }
  }

  // El plan lo deciden Stripe y la administradora, y vive en
  // `suscripciones`, que el usuario sólo puede leer (migración 040).
  // Antes aquí se forzaba 'inactive' a todo el que no fuera la propietaria:
  // un cliente que pagaba veía «Sin suscripción». Sin conexión se queda lo
  // que hubiera en caché.
  try {
    const [{ data: fila }, { data: esAdmin }] = await Promise.all([
      supabase()
        .from('suscripciones')
        .select('origen, plan_id, estado, cortesia_hasta, periodo_fin, cancela_al_final')
        .maybeSingle(),
      supabase().rpc('soy_admin'),
    ]);
    if (esAdmin) {
      settings.planId = 'sin_limite';
      settings.subscriptionStatus = 'active';
    } else {
      const estado = estadoEfectivo(fila as FilaSuscripcion | null);
      settings.planId = estado.planId ?? settings.planId;
      settings.subscriptionStatus = estado.activa ? 'active' : 'inactive';
    }

    // EL PLAN TPV ES SÓLO EL MOSTRADOR
    //
    // Todas las pantallas deciden qué enseñar mirando `settings.modulos`
    // (el menú lateral, el panel, los formularios), así que el plan se
    // aplica aquí, en el único sitio por el que pasan todas. Si se
    // filtrara en cada pantalla, la primera que se olvidara enseñaría de
    // más — y lo que se vende a 29 € es la caja, no el programa entero.
    //
    // Lo que se cobra de verdad no depende de esto: el tope de facturas
    // completas lo aplica la base de datos (migración 043), que es la
    // que no se puede esquivar desde el navegador.
    if (settings.planId === 'tpv') {
      settings.modulos = ['tpv'];
    }
  } catch {}

  return settings;
}

/**
 * El servidor ha dicho que no, y va a seguir diciendo que no.
 *
 * Se distingue de una caída de red porque cambia lo que hay que hacer con el
 * cambio: una caída se reintenta cuando vuelva la conexión; un rechazo hay
 * que contárselo al usuario y deshacerlo.
 */
export class ErrorGuardado extends Error {}

/** Forma mínima del error que devuelve supabase-js. */
export interface FalloSupabase {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
}

/**
 * Distingue «no se ha podido llegar al servidor» de «el servidor lo ha
 * rechazado».
 *
 * Los SQLSTATE que empiezan por 23 son las violaciones de integridad
 * (`23514` es el `check_violation` con el que el guardián antifraude corta el
 * cambio de NIF); los que empiezan por 42 son errores de la propia consulta;
 * y `42501` es el permiso denegado de RLS. Ninguno mejora esperando.
 */
export function esRechazoDefinitivo(fallo: FalloSupabase): boolean {
  const codigo = String(fallo?.code ?? '');
  if (/^(23|42)/.test(codigo)) return true;
  return /ANTIFRAUDE/i.test(String(fallo?.message ?? ''));
}

/** El texto que verá el usuario, sin el ruido de PostgREST alrededor. */
export function mensajeDeRechazo(fallo: FalloSupabase): string {
  const bruto = String(fallo?.message ?? '').trim();
  // Los mensajes del guardián ya vienen escritos para leerse; el prefijo
  // sobra en pantalla.
  const limpio = bruto.replace(/^ANTIFRAUDE:\s*/i, '');
  return limpio || 'El servidor ha rechazado el cambio.';
}

/**
 * Cuántas facturas selladas tiene la empresa.
 *
 * Es lo que decide si el NIF del emisor todavía se puede tocar: en cuanto hay
 * una factura sellada, su NIF forma parte de la huella encadenada y cambiarlo
 * rompería la cadena de todas las demás. Lo comprueba el guardián de la base
 * de datos; esto sólo sirve para poder DECÍRSELO al usuario antes de que
 * escriba, en vez de dejarle teclear un NIF que no va a poder guardar.
 */
export async function contarFacturasSelladas(): Promise<number> {
  try {
    if (!navigator.onLine) return 0;
    const { count } = await soloDe(supabase()
      .from('invoices')
      .select('id', { count: 'exact', head: true }), await idParaLeer())
      .not('sealed_at', 'is', null);
    return count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Guarda los ajustes de la empresa.
 *
 * LAS CATEGORÍAS SÓLO LAS ESCRIBE QUIEN LAS CAMBIA (`{ categorias: true }`)
 *
 * Media aplicación guarda los ajustes enteros con el objeto que cargó al
 * abrir la pantalla: el TPV tras cada venta (contador de tickets), nueva
 * factura, albaranes, tesorería, devoluciones, Ajustes… Si entre medias
 * se borraba una categoría en Productos, la siguiente venta del TPV —abierto
 * desde por la mañana— volvía a escribir la lista vieja y las categorías
 * «resucitaban». Ahora, salvo que la llamada venga de las funciones de
 * categorías, la columna no se toca en la base de datos y en la caché se
 * conserva la que ya hubiera.
 */
export async function saveCompanySettings(
  settings: CompanySettings,
  opciones: { categorias?: boolean } = {},
): Promise<void> {
  versionAjustes++;
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
    regimen_irpf: settings.regimenIrpf || null,
    epigrafe_iae: settings.epigrafeIae || null,
    porcentaje_prorrata: settings.porcentajeProrrata ?? null,
    stripe_enabled: settings.stripeEnabled ?? false,
    albaran_series: settings.albaranSeries || 'ALB',
    next_albaran_number: settings.nextAlbaranNumber || 1,
    devolucion_series: settings.devolucionSeries || 'DEV',
    next_devolucion_number: settings.nextDevolucionNumber || 1,
    abono_series: settings.abonoSeries || 'ABO',
    next_abono_number: settings.nextAbonoNumber || 1,
    cobro_series: settings.cobroSeries || 'COB',
    next_cobro_number: settings.nextCobroNumber || 1,
    pago_series: settings.pagoSeries || 'PAG',
    next_pago_number: settings.nextPagoNumber || 1,
    default_payment_days: settings.defaultPaymentDays,
    default_payment_method: settings.defaultPaymentMethod,
    invoice_footer_text: settings.invoiceFooterText,
    iban: settings.iban,
    bank_name: settings.bankName,
    verifactu_enabled: settings.verifactuEnabled,
    logo_url: settings.logoUrl,
    modulos: settings.modulos ?? null,
    panel: settings.panel ?? null,
    comision_base: settings.comisionBase ?? 'facturado',
    // plan_id, subscription_plan y subscription_status ya no se escriben
    // desde el navegador: viven en `suscripciones` (migración 040).
  };

  const offlineAvail = await isOfflineDbAvailable();
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const anterior = offlineAvail ? await getById<any>('settings', 'company') : null;

  // Ver el comentario de arriba: sin `categorias: true` manda la lista que
  // ya había guardada, no la del objeto que trae quien llama.
  const categorias = opciones.categorias || !Array.isArray(anterior?.custom_categories)
    ? (settings.customCategories || [])
    : anterior.custom_categories;

  // Categorías personalizadas y porcentajes de IVA/IGIC configurables: van
  // en la misma fila de company_settings.
  const fullRow = {
    ...row,
    custom_categories: categorias,
    iva_rates: settings.ivaRates || DEFAULT_IVA_RATES,
    igic_rates: settings.igicRates || DEFAULT_IGIC_RATES,
    series_documentos: settings.seriesDocumentos || {},
    tarifas: settings.tarifas || [],
    almacenes: settings.almacenes || [],
  };

  if (offlineAvail) {
    await withSettingsCacheLock(() => put('settings', { ...fullRow, key: 'company' }));
  }

  /**
   * Deshace el guardado local.
   *
   * Hace falta cuando el servidor RECHAZA el cambio: si la caché se queda con
   * el valor nuevo y la base de datos con el viejo, la pantalla enseña una
   * cosa y la verdad es otra, hasta que el refresco de fondo de
   * `getCompanySettings` devuelve el valor de la base y el cambio «se
   * deshace solo» delante del usuario sin que nadie le haya dicho nada.
   */
  const deshacerCacheLocal = async () => {
    if (!offlineAvail) return;
    if (anterior) await withSettingsCacheLock(() => put('settings', anterior));
  };

  // Lo que se reintenta más tarde tampoco lleva categorías si no se están
  // cambiando: un reintento de madrugada tampoco puede resucitarlas.
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const paraLaCola: Record<string, any> = { ...fullRow };
  if (!opciones.categorias) delete paraLaCola.custom_categories;

  if (navigator.onLine) {
    try {
      // Comprobar si existen settings. Sin .single(): filas duplicadas no
      // deben romper el guardado ni provocar la creación de otra fila nueva.
      const { data: existingRows } = await soloDe(supabase()
        .from('company_settings')
        .select('id'), await idParaLeer())
        .order('updated_at', { ascending: false })
        .limit(1);
      const existing = existingRows?.[0];

      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const write = async (payload: Record<string, any>) => {
        if (existing) {
          return supabase().from('company_settings').update(payload).eq('id', existing.id);
        }
        return supabase().from('company_settings').insert(payload);
      };

      // En la base de datos, las categorías sólo se escriben si se están
      // cambiando (o si la fila es nueva).
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const payload: Record<string, any> = { ...fullRow };
      if (existing && !opciones.categorias) delete payload.custom_categories;

      const { error: fallo, quitadas } = await escribirQuitandoColumnasQueFaltan(write, payload);
      // Un refresco que saliera mientras se escribía trae la fila de antes.
      versionAjustes++;
      if (quitadas.includes('custom_categories') && opciones.categorias) {
        // Sin la columna (migración 008) las categorías no se pueden guardar:
        // decirlo, en vez de enseñar un cambio que no existe.
        await deshacerCacheLocal();
        throw new ErrorGuardado('La base de datos no tiene todavía la columna de categorías (migración 008). Aplícala en Supabase para poder cambiarlas.');
      }

      if (fallo) {
          // UN RECHAZO DEL SERVIDOR NO SE PUEDE REINTENTAR
          //
          // Encolarlo era lo que hacía este código, y es lo que convertía un
          // «no puedes hacer eso» en un «guardado» seguido de un cambio que
          // se deshace solo un rato después. El guardián antifraude de la
          // base de datos (`fn_settings_guard`) rechaza cambiar el NIF del
          // emisor cuando ya hay facturas selladas, porque su NIF entra en la
          // huella encadenada de todas ellas; reintentarlo mil veces va a
          // fallar mil veces igual.
          //
          // Así que la caché local vuelve a lo que había y el error sube tal
          // cual: el mensaje del guardián explica el motivo mucho mejor que
          // nada de lo que pudiéramos escribir aquí.
          if (esRechazoDefinitivo(fallo)) {
            await deshacerCacheLocal();
            throw new ErrorGuardado(mensajeDeRechazo(fallo));
          }
          await enqueueSyncAction('upsert', 'company_settings', paraLaCola);
      }
    } catch (err) {
      // Un rechazo ya viene explicado: se deja pasar. Lo demás —caída de red,
      // servidor que no contesta— sí es reintentable.
      if (err instanceof ErrorGuardado) throw err;
      await enqueueSyncAction('upsert', 'company_settings', paraLaCola);
    }
  } else {
    await enqueueSyncAction('upsert', 'company_settings', paraLaCola);
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
    .eq('user_id', userId)
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
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();

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
    cancelReason: inv.cancel_reason || undefined,
    cancelledAt: inv.cancelled_at || undefined,
    tipo: (inv.tipo as TipoDocumento) ?? 'factura',
    sentido: (inv.sentido as SentidoDocumento) ?? 'venta',
    documentoOrigenId: inv.documento_origen_id ?? undefined,
    documentoOrigenNumber: inv.documento_origen_number ?? undefined,
    vendedorId: inv.vendedor_id ?? undefined,
    tarifaId: inv.tarifa_id || undefined,
    almacenId: inv.almacen_id || undefined,
    obraId: inv.obra_id || undefined,
    retencionPct: inv.retencion_pct != null ? Number(inv.retencion_pct) : undefined,
    paidAmount: Number(inv.paid_amount || 0),
    paymentRecordIds: Array.isArray(inv.payment_record_ids) ? inv.payment_record_ids : [],
    globalDiscountPercent1: Number(inv.global_discount_percent_1 || 0),
    globalDiscountPercent2: Number(inv.global_discount_percent_2 || 0),
    globalDiscountPercent3: Number(inv.global_discount_percent_3 || 0),
    lineItems: lineasConCustomCols(lineItems.map(mapLineItemFromDb), inv.datos_extras ?? {}),
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
    datosExtras: inv.datos_extras ?? {},
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
    siiStatus: inv.sii_status || undefined,
    tipoFacturaFiscal: inv.tipo_factura_fiscal || undefined,
    claveRegimenIva: inv.clave_regimen_iva || undefined,
    esIntracomunitaria: !!inv.es_intracomunitaria,
    tipoOperacion349: inv.tipo_operacion_349 || undefined,
    clientVatNumber: inv.client_vat_number || undefined,
  };
}

export function mapLineItemFromDb(li: any): InvoiceLineItem {
  return {
    id: li.id,
    productId: li.product_id ?? li.productId ?? '',
    productName: li.product_name ?? li.productName ?? '',
    productRef: li.product_ref ?? li.productRef ?? '',
    quantity: Number(li.quantity ?? 0),
    unitPrice: Number(li.unit_price ?? li.unitPrice ?? 0),
    unit: li.unit ?? 'ud',
    taxRate: Number(li.tax_rate ?? li.taxRate ?? 21),
    discountPercent: Number(li.discount_percent ?? li.discountPercent ?? 0),
    discountPercent2: Number(li.discount_percent_2 ?? li.discountPercent2 ?? 0),
    discountPercent3: Number(li.discount_percent_3 ?? li.discountPercent3 ?? 0),
    unitsPerPackage: li.units_per_package != null ? Number(li.units_per_package) : undefined,
    loteId: li.lote_id || undefined,
    loteCodigo: li.lote_codigo || undefined,
    numeroSerieId: li.numero_serie_id || undefined,
    numeroSerie: li.numero_serie || undefined,
    costPrice: Number(li.cost_price ?? li.costPrice ?? 0),
    subtotal: Number(li.subtotal ?? 0),
    taxAmount: Number(li.tax_amount ?? li.taxAmount ?? 0),
    total: Number(li.total ?? 0),
  };
}

export function mapClientFromDb(c: any): Client {
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
    esProveedor: c.es_proveedor ?? false,
    grupoId: c.grupo_id || undefined,
    rutaId: c.ruta_id || undefined,
    vendedorId: c.vendedor_id || undefined,
    tarifaId: c.tarifa_id || undefined,
    vatNumber: c.vat_number || undefined,
    defaultDiscounts: Array.isArray(c.default_discounts)
      ? [Number(c.default_discounts[0] ?? 0), Number(c.default_discounts[1] ?? 0), Number(c.default_discounts[2] ?? 0)]
      : undefined,
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
    imageUrl: p.image || undefined,
    supplierRef: p.supplier_ref || undefined,
    tarifaPrices: (p.tarifa_prices && typeof p.tarifa_prices === 'object') ? p.tarifa_prices : {},
    costePmp: Number(p.coste_pmp ?? 0),
    costeUltimaCompra: Number(p.coste_ultima_compra ?? 0),
    stocksByAlmacen: (p.stocks_by_almacen && typeof p.stocks_by_almacen === 'object') ? p.stocks_by_almacen : {},
    unitsPerPackage: p.units_per_package != null ? Number(p.units_per_package) : undefined,
  };
}

/**
 * Series de documento por (tipo, sentido) a partir del JSONB `series_documentos`.
 * Superpone lo persistido sobre los defaults y, si el usuario aún no tiene
 * entradas, siembra `factura_venta`/`albaran_venta` desde los contadores legacy
 * (invoice_series/next_invoice_number y albaran_series/next_albaran_number).
 * Así el nuevo motor no reinicia la numeración a 1 y no colisiona con
 * documentos existentes.
 */
function buildSeriesDocumentosFromDb(
  raw: unknown,
  legacy: { invoice_series?: string; next_invoice_number?: number; albaran_series?: string; next_albaran_number?: number },
): Record<string, SerieDocumento> {
  const base: Record<string, SerieDocumento> = { ...DEFAULT_SERIES_DOCUMENTOS };
  const rawObj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, { serie?: string; nextNumber?: number }>;
  for (const [k, v] of Object.entries(rawObj)) {
    if (v && typeof v === 'object') {
      base[k] = {
        serie: typeof v.serie === 'string' && v.serie ? v.serie : (base[k]?.serie ?? 'DOC'),
        nextNumber: Number.isFinite(Number(v.nextNumber)) ? Number(v.nextNumber) : (base[k]?.nextNumber ?? 1),
      };
    }
  }
  if (!rawObj.factura_venta) {
    base.factura_venta = { serie: legacy.invoice_series || 'FAC', nextNumber: Number(legacy.next_invoice_number || 1) };
  }
  if (!rawObj.albaran_venta) {
    base.albaran_venta = { serie: legacy.albaran_series || 'ALB', nextNumber: Number(legacy.next_albaran_number || 1) };
  }
  return base;
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
    seriesDocumentos: buildSeriesDocumentosFromDb(s.series_documentos, s),
    tarifas: Array.isArray(s.tarifas) ? s.tarifas : [],
    almacenes: Array.isArray(s.almacenes) ? s.almacenes.map(mapAlmacenFromDb) : [],
    tpvSeries: s.tpv_series || 'TPV',
    nextTpvNumber: s.next_tpv_number || 1,
    tpvMode: (s.tpv_mode as TpvMode) || defaultTpvModeForSector(s.sector),
    tpvEnabled: s.tpv_enabled == null ? undefined : Boolean(s.tpv_enabled),
    igicEnabled: s.igic_enabled ?? false,
    regimenIrpf: s.regimen_irpf || undefined,
    epigrafeIae: s.epigrafe_iae || undefined,
    porcentajeProrrata: s.porcentaje_prorrata == null ? undefined : Number(s.porcentaje_prorrata),
    ivaRates: Array.isArray(s.iva_rates) ? s.iva_rates.map(Number) : undefined,
    igicRates: Array.isArray(s.igic_rates) ? s.igic_rates.map(Number) : undefined,
    stripeEnabled: s.stripe_enabled ?? false,
    albaranSeries: s.albaran_series || 'ALB',
    nextAlbaranNumber: s.next_albaran_number || 1,
    devolucionSeries: s.devolucion_series || 'DEV',
    nextDevolucionNumber: s.next_devolucion_number || 1,
    abonoSeries: s.abono_series || 'ABO',
    nextAbonoNumber: s.next_abono_number || 1,
    cobroSeries: s.cobro_series || 'COB',
    nextCobroNumber: s.next_cobro_number || 1,
    pagoSeries: s.pago_series || 'PAG',
    nextPagoNumber: s.next_pago_number || 1,
    defaultPaymentDays: s.default_payment_days || 30,
    defaultPaymentMethod: s.default_payment_method || 'transferencia',
    invoiceFooterText: s.invoice_footer_text || '',
    iban: s.iban || '',
    bankName: s.bank_name || '',
    verifactuEnabled: s.verifactu_enabled ?? true,
    logoUrl: s.logo_url || '',
    // Sin configurar todavía se quedan en undefined a propósito, no en lista
    // vacía: «no lo ha tocado» y «lo ha apagado todo» son cosas distintas, y
    // la primera tiene que caer en los de salida de su sector.
    modulos: Array.isArray(s.modulos) ? s.modulos : undefined,
    panel: Array.isArray(s.panel) ? s.panel : undefined,
    comisionBase: s.comision_base === 'cobrado' ? 'cobrado' : 'facturado',
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

  await saveCompanySettings(updatedSettings, { categorias: true });

  return {
    value: newCat.id,
    label: newCat.name,
    icon: newCat.icon,
    isCustom: true,
  };
}

export async function deleteCustomCategory(categoryId: string): Promise<void> {
  await deleteCategories([categoryId]);
}

/**
 * Borra varias categorías de una vez, con UN solo guardado de ajustes (uno
 * por categoría eran N viajes y N copias en la cola sin conexión).
 *
 * Las del sector no se borran de verdad: se ocultan, para que los productos
 * que las nombran no se rompan y se puedan recuperar editándolas. «otros»
 * nunca: es donde van a parar los productos de las categorías borradas.
 */
export function categoriasTrasBorrar(
  customs: CustomCategory[],
  defaults: { value: string; label: string; icon: string }[],
  ids: Set<string>,
  sector?: CustomCategory['sector'],
): CustomCategory[] {
  const esDefecto = (id: string) => defaults.some(d => d.value === id);
  // Propias: fuera. Del sector que ya tenían ajuste: se marcan ocultas.
  const next: CustomCategory[] = customs
    .filter(c => !ids.has(c.id) || esDefecto(c.id))
    .map(c => (ids.has(c.id) ? { ...c, hidden: true } : c));
  // Del sector sin ajuste previo: se añade el ajuste oculto.
  for (const id of ids) {
    const def = defaults.find(d => d.value === id);
    if (def && !customs.some(c => c.id === id)) {
      next.push({ id: def.value, name: def.label, icon: def.icon, sector, hidden: true });
    }
  }
  return next;
}

export async function deleteCategories(categoryIds: string[]): Promise<void> {
  const settings = await getCompanySettings();
  if (!settings) return;
  const ids = new Set(categoryIds.filter(id => id !== 'otros'));
  if (ids.size === 0) return;

  const sector = settings.sector || 'alimentacion';
  const defaults = SECTOR_DEFAULT_CATEGORIES[sector] || SECTOR_DEFAULT_CATEGORIES.alimentacion;
  const next = categoriasTrasBorrar(settings.customCategories || [], defaults, ids, settings.sector);
  await saveCompanySettings({ ...settings, customCategories: next }, { categorias: true });
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

  await saveCompanySettings({ ...settings, customCategories: next }, { categorias: true });
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

// ============================================================
// LA COLA DE ENVÍO A LA AGENCIA TRIBUTARIA
// ============================================================
//
// La cadena de registros la genera y la firma la base de datos al sellar
// cada factura (ver migración 038). Desde aquí sólo se LEE lo que hay y
// se pide al servidor que mande lo pendiente: el envío necesita
// descifrar el certificado, y eso no puede pasar en el navegador.

export type EstadoRegistroVerifactu =
  | 'pendiente' | 'enviando' | 'aceptado'
  | 'aceptado_con_errores' | 'rechazado' | 'error_envio';

export interface RegistroVerifactu {
  id: string;
  invoiceId: string;
  tipoRegistro: 'alta' | 'anulacion';
  indice: number;
  primerRegistro: boolean;
  huella: string;
  huellaAnterior: string | null;
  numSerie: string;
  fechaExpedicion: string;
  tipoFactura: string | null;
  importeTotal: number;
  cuotaTotal: number;
  fechaHoraHuso: string;
  estado: EstadoRegistroVerifactu;
  entorno: 'pruebas' | 'produccion' | null;
  csvAeat: string | null;
  codigoError: string | null;
  descripcionError: string | null;
  enviadoEn: string | null;
  respondidoEn: string | null;
}

export interface ConfigVerifactu {
  activo: boolean;
  entorno: 'pruebas' | 'produccion';
  envioAutomatico: boolean;
  productorNombre: string;
  productorNif: string;
  nombreSistema: string;
  idSistema: string;
  versionSistema: string;
  numeroInstalacion: string;
}

const CONFIG_VERIFACTU_POR_DEFECTO: ConfigVerifactu = {
  activo: false,
  entorno: 'pruebas',
  envioAutomatico: true,
  productorNombre: '',
  productorNif: '',
  nombreSistema: 'Klima',
  idSistema: '01',
  versionSistema: '1.0',
  numeroInstalacion: '',
};

export async function getConfigVerifactu(): Promise<ConfigVerifactu> {
  const userId = await getCurrentUserId();
  if (!userId) return { ...CONFIG_VERIFACTU_POR_DEFECTO };

  const { data } = await supabase()
    .from('verifactu_config').select('*').eq('user_id', userId).maybeSingle();

  if (!data) return { ...CONFIG_VERIFACTU_POR_DEFECTO };

  return {
    activo: data.activo ?? false,
    entorno: data.entorno === 'produccion' ? 'produccion' : 'pruebas',
    envioAutomatico: data.envio_automatico ?? true,
    productorNombre: data.productor_nombre ?? '',
    productorNif: data.productor_nif ?? '',
    nombreSistema: data.nombre_sistema ?? 'Klima',
    idSistema: data.id_sistema ?? '01',
    versionSistema: data.version_sistema ?? '1.0',
    numeroInstalacion: data.numero_instalacion ?? '',
  };
}

export async function saveConfigVerifactu(config: ConfigVerifactu): Promise<void> {
  const userId = await requireUserId();

  const { error } = await supabase().from('verifactu_config').upsert({
    user_id: userId,
    activo: config.activo,
    entorno: config.entorno,
    envio_automatico: config.envioAutomatico,
    productor_nombre: config.productorNombre.trim() || null,
    productor_nif: config.productorNif.trim().toUpperCase() || null,
    nombre_sistema: config.nombreSistema.trim() || 'Klima',
    id_sistema: config.idSistema.trim() || '01',
    version_sistema: config.versionSistema.trim() || '1.0',
    numero_instalacion: config.numeroInstalacion.trim() || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });

  if (error) throw new Error(error.message);
}

export async function getRegistrosVerifactu(limite = 500): Promise<RegistroVerifactu[]> {
  const userId = await getCurrentUserId();
  if (!userId) return [];

  const { data, error } = await supabase()
    .from('verifactu_registros')
    .select('*')
    .eq('user_id', userId)
    .order('indice', { ascending: false })
    .limit(limite);

  if (error || !data) return [];

  // La tabla es nueva y todavía no está en los tipos generados de
  // Supabase, así que se declara aquí la forma de la fila en vez de
  // dejar que todo se convierta en «any» sin que nadie lo note.
  interface FilaRegistroDb {
    id: string; invoice_id: string; tipo_registro: 'alta' | 'anulacion';
    indice: number | string; primer_registro: boolean;
    huella: string; huella_anterior: string | null;
    num_serie: string; fecha_expedicion: string; tipo_factura: string | null;
    importe_total: number | string | null; cuota_total: number | string | null;
    fecha_hora_huso: string; estado: EstadoRegistroVerifactu;
    entorno: 'pruebas' | 'produccion' | null; csv_aeat: string | null;
    codigo_error: string | null; descripcion_error: string | null;
    enviado_en: string | null; respondido_en: string | null;
  }

  return (data as unknown as FilaRegistroDb[]).map(r => ({
    id: r.id,
    invoiceId: r.invoice_id,
    tipoRegistro: r.tipo_registro,
    indice: Number(r.indice),
    primerRegistro: r.primer_registro,
    huella: r.huella,
    huellaAnterior: r.huella_anterior,
    numSerie: r.num_serie,
    fechaExpedicion: r.fecha_expedicion,
    tipoFactura: r.tipo_factura,
    importeTotal: Number(r.importe_total ?? 0),
    cuotaTotal: Number(r.cuota_total ?? 0),
    fechaHoraHuso: r.fecha_hora_huso,
    estado: r.estado,
    entorno: r.entorno,
    csvAeat: r.csv_aeat,
    codigoError: r.codigo_error,
    descripcionError: r.descripcion_error,
    enviadoEn: r.enviado_en,
    respondidoEn: r.respondido_en,
  }));
}

export interface ResultadoEnvioAeat {
  ok: boolean;
  error?: string;
  entorno?: 'pruebas' | 'produccion';
  csv?: string | null;
  enviados?: number;
  aceptados?: number;
  conAvisos?: number;
  rechazados?: number;
  sinRespuesta?: number;
  resumen?: string;
  mensaje?: string;
  problemas?: Array<{ numero: string; problemas: string[] }>;
}

/**
 * Pide al servidor que mande lo pendiente.
 *
 * Devuelve el resultado en vez de lanzar incluso cuando falla: lo que
 * pasa aquí hay que enseñarlo entero (cuántas entraron, cuáles no y por
 * qué), y un throw se queda en «algo ha fallado».
 */
export async function enviarPendientesAeat(): Promise<ResultadoEnvioAeat> {
  try {
    const respuesta = await fetch('/api/verifactu/enviar', { method: 'POST' });
    const datos = await respuesta.json();
    return respuesta.ok ? datos : { ...datos, ok: false };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'No se ha podido contactar con el servidor.',
    };
  }
}

// ============================================================
// COBROS, PAGOS Y TESORERÍA (Fase 4)
// ============================================================

export function mapCobroPagoFromDb(row: any): CobroPago {
  return {
    id: row.id,
    tipo: row.tipo,
    series: row.series,
    number: row.number,
    fecha: row.fecha,
    contraparteId: row.contraparte_id || row.contraparteId,
    contraparteNombre: row.contraparte_nombre || row.contraparteNombre,
    contraparteNif: row.contraparte_nif || row.contraparteNif || undefined,
    paymentMethod: row.payment_method || row.paymentMethod,
    cuentaBancaria: row.cuenta_bancaria || row.cuentaBancaria || undefined,
    importeTotal: Number(row.importe_total ?? row.importeTotal ?? 0),
    desglose: Array.isArray(row.desglose)
      ? row.desglose.map((d: any) => ({
          invoiceId: d.invoiceId || d.invoice_id,
          invoiceNumber: d.invoiceNumber || d.invoice_number,
          importeAplicado: Number(d.importeAplicado ?? d.importe_aplicado ?? 0),
        }))
      : [],
    notas: row.notas || undefined,
    createdAt: row.created_at || row.createdAt || new Date().toISOString(),
    updatedAt: row.updated_at || row.updatedAt || new Date().toISOString(),
  };
}

function mapCobroPagoToDb(item: CobroPago, userId: string) {
  return {
    id: item.id,
    user_id: userId,
    tipo: item.tipo,
    series: item.series,
    number: item.number,
    fecha: item.fecha,
    contraparte_id: item.contraparteId,
    contraparte_nombre: item.contraparteNombre,
    contraparte_nif: item.contraparteNif || null,
    payment_method: item.paymentMethod,
    cuenta_bancaria: item.cuentaBancaria || null,
    importe_total: item.importeTotal,
    desglose: item.desglose,
    notas: item.notas || null,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  };
}

export async function getCobrosPagos(filtro?: { tipo?: TipoCobroPago; contraparteId?: string }): Promise<CobroPago[]> {
  const offlineAvail = await isOfflineDbAvailable();
  if (offlineAvail) {
    const cached = await getAll<any>('cobros_pagos');
    if (cached.length > 0) {
      backgroundRefresh('cobros_pagos', () =>
        supabase().from('cobros_pagos').select('*').order('fecha', { ascending: false })
      );
      let list = cached.map(mapCobroPagoFromDb);
      if (filtro?.tipo) list = list.filter(c => c.tipo === filtro.tipo);
      if (filtro?.contraparteId) list = list.filter(c => c.contraparteId === filtro.contraparteId);
      return list;
    }
  }

  if (!navigator.onLine) return [];

  let query = supabase().from('cobros_pagos').select('*').order('fecha', { ascending: false });
  if (filtro?.tipo) query = query.eq('tipo', filtro.tipo);
  if (filtro?.contraparteId) query = query.eq('contraparte_id', filtro.contraparteId);

  const { data, error } = await query;
  if (error || !data) return [];

  if (await isOfflineDbAvailable()) {
    await clearStore('cobros_pagos');
    await putMany('cobros_pagos', data);
  }

  return data.map(mapCobroPagoFromDb);
}

export async function getCobroPagoById(id: string): Promise<CobroPago | undefined> {
  const offlineAvail = await isOfflineDbAvailable();
  if (offlineAvail) {
    const cached = await getById<any>('cobros_pagos', id);
    if (cached) return mapCobroPagoFromDb(cached);
  }

  if (!navigator.onLine) return undefined;
  const { data } = await supabase().from('cobros_pagos').select('*').eq('id', id).single();
  return data ? mapCobroPagoFromDb(data) : undefined;
}

export async function saveCobroPago(cobroPago: CobroPago): Promise<CobroPago> {
  const userId = await requireUserId();
  const row = mapCobroPagoToDb(cobroPago, userId);

  const offlineAvail = await isOfflineDbAvailable();
  if (offlineAvail) {
    await put('cobros_pagos', row);
  }

  if (navigator.onLine) {
    try {
      const { error } = await supabase().from('cobros_pagos').upsert(row);
      if (error) await enqueueSyncAction('upsert', 'cobros_pagos', row);
    } catch {
      await enqueueSyncAction('upsert', 'cobros_pagos', row);
    }
  } else {
    await enqueueSyncAction('upsert', 'cobros_pagos', row);
  }

  // Actualizar las facturas desglosadas
  for (const item of cobroPago.desglose) {
    if (!item.invoiceId || item.importeAplicado <= 0) continue;
    const inv = await getInvoiceById(item.invoiceId);
    if (!inv) continue;

    const currentPaid = inv.paidAmount || 0;
    const newPaid = Number((currentPaid + item.importeAplicado).toFixed(2));
    // Con retención de IRPF lo que llega es el total menos lo retenido: eso
    // ya es la factura cobrada entera.
    const isTotal = newPaid >= (totalAPagar(inv.total, inv.subtotal, inv.retencionPct) - 0.01);
    const newStatus = isTotal
      ? InvoiceStatus.PAGADA
      : (newPaid > 0 ? InvoiceStatus.PARCIAL : inv.status);

    const recIds = new Set(inv.paymentRecordIds || []);
    recIds.add(cobroPago.id);

    // Por la vía del cobro, NO por `saveDocumento`.
    //
    // Una factura cobrable está EMITIDA, PENDIENTE o VENCIDA, y los tres son
    // estados sellados: `saveDocumento` los rechaza de plano, así que esto
    // reventaba en cuanto se intentaba cobrar cualquier cosa.
    await anotarCobroEnFactura(inv, {
      paidAmount: newPaid,
      paidDate: isTotal ? cobroPago.fecha : inv.paidDate,
      status: newStatus,
      paymentRecordIds: Array.from(recIds),
    });
  }

  return cobroPago;
}

export async function deleteCobroPago(id: string): Promise<void> {
  const cobro = await getCobroPagoById(id);
  if (!cobro) return;

  // Revertir importes aplicados en facturas
  for (const item of cobro.desglose) {
    if (!item.invoiceId) continue;
    const inv = await getInvoiceById(item.invoiceId);
    if (!inv) continue;

    const newPaid = Math.max(0, Number(((inv.paidAmount || 0) - item.importeAplicado).toFixed(2)));
    const newStatus = newPaid >= (totalAPagar(inv.total, inv.subtotal, inv.retencionPct) - 0.01)
      ? InvoiceStatus.PAGADA
      : (newPaid > 0 ? InvoiceStatus.PARCIAL : InvoiceStatus.EMITIDA);

    const recIds = (inv.paymentRecordIds || []).filter(rid => rid !== id);

    // Por la vía del cobro, igual que al anotarlo: deshacerlo tampoco es
    // modificar la factura.
    await anotarCobroEnFactura(inv, {
      paidAmount: newPaid,
      // Si ya no queda nada cobrado, tampoco queda fecha de cobro.
      paidDate: newPaid > 0 ? inv.paidDate : undefined,
      status: newStatus,
      paymentRecordIds: recIds,
    });
  }

  const offlineAvail = await isOfflineDbAvailable();
  if (offlineAvail) {
    await removeFromDb('cobros_pagos', id);
  }

  if (navigator.onLine) {
    try {
      await supabase().from('cobros_pagos').delete().eq('id', id);
    } catch {
      await enqueueSyncAction('delete', 'cobros_pagos', { id });
    }
  } else {
    await enqueueSyncAction('delete', 'cobros_pagos', { id });
  }
}

export async function getExtractoCuenta(
  contraparteId: string,
  fechaDesde?: string,
  fechaHasta?: string,
): Promise<{
  movimientos: MovimientoExtracto[];
  totalDebe: number;
  totalHaber: number;
  saldoFinal: number;
}> {
  const [allInvoices, allCobrosPagos] = await Promise.all([
    getInvoices(),
    getCobrosPagos({ contraparteId }),
  ]);

  const clientInvoices = allInvoices.filter(i =>
    i.clientId === contraparteId &&
    (i.tipo === 'factura' || i.tipo === 'rectificativa') &&
    i.status !== InvoiceStatus.BORRADOR &&
    i.status !== InvoiceStatus.ANULADA
  );

  const movimientosRaw: {
    id: string;
    fecha: string;
    tipo: 'factura' | 'cobro_pago';
    numero: string;
    concepto: string;
    debe: number;
    haber: number;
  }[] = [];

  // Facturas
  for (const inv of clientInvoices) {
    if (fechaDesde && inv.issueDate < fechaDesde) continue;
    if (fechaHasta && inv.issueDate > fechaHasta) continue;

    const esVenta = inv.sentido !== 'compra';
    const total = inv.total;

    movimientosRaw.push({
      id: inv.id,
      fecha: inv.issueDate,
      tipo: 'factura',
      numero: inv.number,
      concepto: `Factura ${inv.number}${inv.sentido === 'compra' ? ' (Compra)' : ' (Venta)'}`,
      debe: esVenta ? total : 0,
      haber: !esVenta ? total : 0,
    });
  }

  // Cobros y pagos
  for (const cp of allCobrosPagos) {
    if (fechaDesde && cp.fecha < fechaDesde) continue;
    if (fechaHasta && cp.fecha > fechaHasta) continue;

    const esCobro = cp.tipo === 'cobro';
    movimientosRaw.push({
      id: cp.id,
      fecha: cp.fecha,
      tipo: 'cobro_pago',
      numero: cp.number,
      concepto: `${esCobro ? 'Cobro recibido' : 'Pago emitido'} ${cp.number} (${cp.paymentMethod})`,
      debe: !esCobro ? cp.importeTotal : 0,
      haber: esCobro ? cp.importeTotal : 0,
    });
  }

  // Ordenar cronológicamente
  movimientosRaw.sort((a, b) => a.fecha.localeCompare(b.fecha));

  let saldoAcumulado = 0;
  let totalDebe = 0;
  let totalHaber = 0;

  const movimientos: MovimientoExtracto[] = movimientosRaw.map(m => {
    saldoAcumulado = Number((saldoAcumulado + m.debe - m.haber).toFixed(2));
    totalDebe += m.debe;
    totalHaber += m.haber;
    return {
      ...m,
      saldo: saldoAcumulado,
    };
  });

  return {
    movimientos,
    totalDebe: Number(totalDebe.toFixed(2)),
    totalHaber: Number(totalHaber.toFixed(2)),
    saldoFinal: saldoAcumulado,
  };
}


// ============================================================
// REGULARIZACIÓN DE COSTES
// ============================================================

/** Lo que costó de verdad vender un producto, y cuánto se sacó. */
export interface RentabilidadProducto {
  productId: string;
  ref: string;
  nombre: string;
  categoria: string;
  unidadesVendidas: number;
  ingresos: number;
  coste: number;
  margen: number;
  /** En porcentaje sobre los ingresos. */
  margenPorcentaje: number;
  /** El precio medio al final del histórico, ya regularizado. */
  pmpFinal: number;
  /** Alguna venta se costeó con un precio de compra posterior. */
  tieneEstimados: boolean;
  /** Se vendió más de lo que consta comprado: falta meter alguna compra. */
  huboDescubierto: boolean;
}

/**
 * Recalcula los costes de todo el histórico y saca la rentabilidad real.
 *
 * El precio medio se movía sólo hacia delante, y en una empresa de verdad los
 * papeles no llegan en orden: se vende el lunes y la factura del proveedor
 * llega el día 20 del mes siguiente. Esa venta se quedaba guardada con el
 * coste que se supo entonces —el medio viejo, o cero si el producto era
 * nuevo— y nadie la corregía. El margen que salía era mentira, y siempre a
 * favor: con coste cero, un beneficio del cien por cien.
 *
 * Aquí se ponen todos los movimientos en orden de fecha y se recalcula desde
 * el principio, que es lo que hace cualquier programa de contabilidad al
 * cerrar el mes.
 *
 * NO SE TOCA NINGUNA FACTURA. El coste guardado en la línea se queda como
 * está —es un dato histórico legítimo: lo que se sabía al emitirla— y de todas
 * formas una factura sellada no se puede modificar. Lo que se devuelve es lo
 * que costó realmente. Sí se corrige el precio medio de la ficha del
 * producto, que no es un dato fiscal y estaba equivocado.
 */
export async function regularizarCostes(
  opciones: { categoria?: string; guardarPmp?: boolean } = {},
): Promise<RentabilidadProducto[]> {
  const [productos, documentos, ajustes] = await Promise.all([
    getProducts(),
    getInvoices(),
    getRegularizaciones(),
  ]);

  const paraCostes: DocumentoParaCostes[] = documentos.map(d => ({
    id: d.id,
    number: d.number,
    issueDate: d.issueDate,
    tipo: d.tipo,
    sentido: d.sentido,
    status: d.status,
    lineItems: (d.lineItems ?? []).map(li => ({
      id: li.id,
      productId: li.productId,
      quantity: li.quantity,
      unitPrice: li.unitPrice,
      discountPercent: li.discountPercent,
      discountPercent2: li.discountPercent2,
      discountPercent3: li.discountPercent3,
    })),
  }));

  // Una factura que nace de un albarán ya expedido no vuelve a sacar género:
  // el albarán lo sacó. Se reconoce porque lleva apuntado su origen.
  const albaranes = new Set(paraCostes.filter(d => d.tipo === 'albaran').map(d => d.id));
  const origenes = new Map(documentos.map(d => [d.id, d.documentoOrigenId]));
  const vieneDeAlbaran = (doc: DocumentoParaCostes) => {
    const origen = origenes.get(doc.id);
    return Boolean(origen && albaranes.has(origen));
  };

  const deAjustes: AjusteParaCostes[] = ajustes.map(a => ({
    id: a.id, fecha: a.fecha, productId: a.productId, diferencia: a.diferencia,
  }));

  const salida: RentabilidadProducto[] = [];

  for (const producto of productos) {
    if (opciones.categoria && producto.category !== opciones.categoria) continue;

    const movimientos = movimientosDeProducto(producto.id, paraCostes, deAjustes, vieneDeAlbaran);
    if (movimientos.length === 0) continue;

    const resultado = reproducirCostes(movimientos);

    // Los ingresos salen de las mismas líneas que las salidas, para que el
    // margen compare exactamente lo mismo arriba y abajo.
    const referencias = new Set(resultado.costes.map(c => c.referencia));
    let ingresos = 0;
    for (const doc of paraCostes) {
      if ((doc.sentido ?? 'venta') === 'compra') continue;
      for (const li of doc.lineItems) {
        if (li.productId !== producto.id) continue;
        if (!referencias.has(`${doc.number}#${li.id}`)) continue;
        ingresos += li.quantity * li.unitPrice
          * (1 - (li.discountPercent || 0) / 100)
          * (1 - (li.discountPercent2 || 0) / 100)
          * (1 - (li.discountPercent3 || 0) / 100);
      }
    }

    const coste = resultado.costes.reduce((s, c) => s + c.costeTotal, 0);
    const unidades = resultado.costes.reduce((s, c) => s + c.cantidad, 0);
    const margen = ingresos - coste;

    if (opciones.guardarPmp && resultado.pmpFinal > 0 && resultado.pmpFinal !== producto.costePmp) {
      await saveProduct({ ...producto, costePmp: resultado.pmpFinal });
    }

    salida.push({
      productId: producto.id,
      ref: producto.ref,
      nombre: producto.name,
      categoria: producto.category,
      unidadesVendidas: unidades,
      ingresos: Math.round(ingresos * 100) / 100,
      coste: Math.round(coste * 100) / 100,
      margen: Math.round(margen * 100) / 100,
      margenPorcentaje: ingresos > 0 ? Math.round((margen / ingresos) * 1000) / 10 : 0,
      pmpFinal: resultado.pmpFinal,
      tieneEstimados: resultado.costes.some(c => c.estimado),
      huboDescubierto: resultado.huboDescubierto,
    });
  }

  return salida.sort((a, b) => b.margen - a.margen);
}

// ============================================================
// GASTOS Y VEHÍCULOS
// ============================================================

export async function getVehiculos(): Promise<Vehiculo[]> {
  const offlineAvail = await isOfflineDbAvailable();
  if (offlineAvail) {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const cached = await getAll<any>('vehiculos');
    if (cached.length > 0) return cached.map(mapVehiculoFromDb);
  }

  if (!navigator.onLine) return [];

  const { data, error } = await supabase().from('vehiculos').select('*').order('matricula', { ascending: true });
  if (error || !data) return [];

  if (await isOfflineDbAvailable()) {
    await clearStore('vehiculos');
    await putMany('vehiculos', data);
  }
  return data.map(mapVehiculoFromDb);
}

export async function saveVehiculo(vehiculo: Vehiculo): Promise<void> {
  const userId = await requireUserId();
  const row = {
    id: vehiculo.id,
    user_id: userId,
    matricula: vehiculo.matricula,
    nombre: vehiculo.nombre || null,
    activo: vehiculo.activo,
    updated_at: new Date().toISOString(),
  };

  if (await isOfflineDbAvailable()) await put('vehiculos', row);

  if (navigator.onLine) {
    try {
      await supabase().from('vehiculos').upsert(row);
    } catch {
      await enqueueSyncAction('upsert', 'vehiculos', row);
    }
  } else {
    await enqueueSyncAction('upsert', 'vehiculos', row);
  }
}

export async function deleteVehiculo(id: string): Promise<void> {
  if (await isOfflineDbAvailable()) await removeFromDb('vehiculos', id);
  if (navigator.onLine) {
    try {
      await supabase().from('vehiculos').delete().eq('id', id);
    } catch {
      await enqueueSyncAction('delete', 'vehiculos', { id });
    }
  } else {
    await enqueueSyncAction('delete', 'vehiculos', { id });
  }
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
function mapVehiculoFromDb(v: any): Vehiculo {
  return {
    id: v.id,
    matricula: v.matricula || '',
    nombre: v.nombre || undefined,
    activo: v.activo ?? true,
    createdAt: v.created_at || v.createdAt || new Date().toISOString(),
    updatedAt: v.updated_at || v.updatedAt || new Date().toISOString(),
  };
}

export async function getGastos(): Promise<Gasto[]> {
  const offlineAvail = await isOfflineDbAvailable();
  if (offlineAvail) {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const cached = await getAll<any>('gastos');
    if (cached.length > 0) return cached.map(mapGastoFromDb).sort((a, b) => b.fecha.localeCompare(a.fecha));
  }

  if (!navigator.onLine) return [];

  const { data, error } = await soloDe(supabase().from('gastos').select('*'), await idParaLeer()).order('fecha', { ascending: false });
  if (error || !data) return [];

  if (await isOfflineDbAvailable()) {
    await clearStore('gastos');
    await putMany('gastos', data);
  }
  return data.map(mapGastoFromDb);
}

export async function saveGasto(gasto: Gasto): Promise<void> {
  const userId = await requireUserId();
  const row = {
    id: gasto.id,
    user_id: userId,
    fecha: gasto.fecha,
    concepto: gasto.concepto,
    categoria: gasto.categoria,
    proveedor_id: gasto.proveedorId || null,
    proveedor_nombre: gasto.proveedorNombre || null,
    base_imponible: gasto.baseImponible,
    tax_rate: gasto.taxRate,
    tax_amount: gasto.taxAmount,
    total: gasto.total,
    payment_method: gasto.paymentMethod,
    vehiculo_id: gasto.vehiculoId || null,
    obra_id: gasto.obraId || null,
    notas: gasto.notas || null,
    deducible: gasto.deducible ?? true,
    tipo_operacion: gasto.tipoOperacion || 'interior_corriente',
    cuota_deducible: gasto.cuotaDeducible ?? null,
    updated_at: new Date().toISOString(),
  };

  if (await isOfflineDbAvailable()) await put('gastos', row);

  if (navigator.onLine) {
    try {
      await supabase().from('gastos').upsert(row);
    } catch {
      await enqueueSyncAction('upsert', 'gastos', row);
    }
  } else {
    await enqueueSyncAction('upsert', 'gastos', row);
  }
}

export async function deleteGasto(id: string): Promise<void> {
  if (await isOfflineDbAvailable()) await removeFromDb('gastos', id);
  if (navigator.onLine) {
    try {
      await supabase().from('gastos').delete().eq('id', id);
    } catch {
      await enqueueSyncAction('delete', 'gastos', { id });
    }
  } else {
    await enqueueSyncAction('delete', 'gastos', { id });
  }
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export function mapGastoFromDb(g: any): Gasto {
  return {
    id: g.id,
    fecha: g.fecha,
    concepto: g.concepto || '',
    categoria: g.categoria || 'otros',
    proveedorId: g.proveedor_id || undefined,
    proveedorNombre: g.proveedor_nombre || undefined,
    baseImponible: Number(g.base_imponible ?? 0),
    taxRate: Number(g.tax_rate ?? 21),
    taxAmount: Number(g.tax_amount ?? 0),
    total: Number(g.total ?? 0),
    paymentMethod: g.payment_method || PaymentMethod.TRANSFERENCIA,
    vehiculoId: g.vehiculo_id || undefined,
    obraId: g.obra_id || undefined,
    notas: g.notas || undefined,
    // Los gastos anteriores a la migración 036 no traen estas columnas:
    // se dan por deducibles e interiores corrientes, que es el caso
    // normal y lo mismo que hace el DEFAULT de la base de datos.
    deducible: g.deducible ?? true,
    tipoOperacion: g.tipo_operacion || 'interior_corriente',
    cuotaDeducible: g.cuota_deducible == null ? undefined : Number(g.cuota_deducible),
    createdAt: g.created_at || g.createdAt || new Date().toISOString(),
    updatedAt: g.updated_at || g.updatedAt || new Date().toISOString(),
  };
}

// ============================================================
// OBRAS Y EXPEDIENTES
// ============================================================

export async function getObras(): Promise<Obra[]> {
  const offlineAvail = await isOfflineDbAvailable();
  if (offlineAvail) {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const cached = await getAll<any>('obras');
    if (cached.length > 0) return cached.map(mapObraFromDb).sort((a, b) => b.fechaApertura.localeCompare(a.fechaApertura));
  }

  if (!navigator.onLine) return [];

  const { data, error } = await supabase().from('obras').select('*').order('fecha_apertura', { ascending: false });
  if (error || !data) return [];

  if (await isOfflineDbAvailable()) {
    await clearStore('obras');
    await putMany('obras', data);
  }
  return data.map(mapObraFromDb);
}

export async function saveObra(obra: Obra): Promise<void> {
  const userId = await requireUserId();
  const row = {
    id: obra.id,
    user_id: userId,
    numero: obra.numero,
    nombre: obra.nombre,
    cliente_id: obra.clienteId || null,
    cliente_nombre: obra.clienteNombre || null,
    estado: obra.estado,
    fecha_apertura: obra.fechaApertura,
    fecha_cierre: obra.fechaCierre || null,
    presupuesto: obra.presupuesto ?? null,
    notas: obra.notas || null,
    updated_at: new Date().toISOString(),
  };

  if (await isOfflineDbAvailable()) await put('obras', row);

  if (navigator.onLine) {
    try {
      await supabase().from('obras').upsert(row);
    } catch {
      await enqueueSyncAction('upsert', 'obras', row);
    }
  } else {
    await enqueueSyncAction('upsert', 'obras', row);
  }
}

export async function deleteObra(id: string): Promise<void> {
  if (await isOfflineDbAvailable()) await removeFromDb('obras', id);
  if (navigator.onLine) {
    try {
      await supabase().from('obras').delete().eq('id', id);
    } catch {
      await enqueueSyncAction('delete', 'obras', { id });
    }
  } else {
    await enqueueSyncAction('delete', 'obras', { id });
  }
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
function mapObraFromDb(o: any): Obra {
  return {
    id: o.id,
    numero: o.numero || '',
    nombre: o.nombre || '',
    clienteId: o.cliente_id || undefined,
    clienteNombre: o.cliente_nombre || undefined,
    estado: o.estado === 'cerrada' ? 'cerrada' : 'abierta',
    fechaApertura: o.fecha_apertura,
    fechaCierre: o.fecha_cierre || undefined,
    presupuesto: o.presupuesto != null ? Number(o.presupuesto) : undefined,
    notas: o.notas || undefined,
    createdAt: o.created_at || o.createdAt || new Date().toISOString(),
    updatedAt: o.updated_at || o.updatedAt || new Date().toISOString(),
  };
}

// ============================================================
// ÓRDENES DE TRABAJO
// ============================================================

export async function getOrdenesTrabajo(): Promise<OrdenTrabajo[]> {
  const offlineAvail = await isOfflineDbAvailable();
  if (offlineAvail) {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const cached = await getAll<any>('ordenes_trabajo');
    if (cached.length > 0) return cached.map(mapOrdenTrabajoFromDb).sort((a, b) => b.fecha.localeCompare(a.fecha));
  }

  if (!navigator.onLine) return [];

  const { data, error } = await supabase().from('ordenes_trabajo').select('*').order('fecha', { ascending: false });
  if (error || !data) return [];

  if (await isOfflineDbAvailable()) {
    await clearStore('ordenes_trabajo');
    await putMany('ordenes_trabajo', data);
  }
  return data.map(mapOrdenTrabajoFromDb);
}

export async function saveOrdenTrabajo(orden: OrdenTrabajo): Promise<void> {
  const userId = await requireUserId();
  const row = {
    id: orden.id,
    user_id: userId,
    numero: orden.numero,
    cliente_id: orden.clienteId || null,
    cliente_nombre: orden.clienteNombre || null,
    descripcion: orden.descripcion,
    estado: orden.estado,
    fecha: orden.fecha,
    tecnico_id: orden.tecnicoId || null,
    horas: orden.horas ?? null,
    materiales: orden.materiales || null,
    obra_id: orden.obraId || null,
    invoice_id: orden.invoiceId || null,
    notas: orden.notas || null,
    updated_at: new Date().toISOString(),
  };

  if (await isOfflineDbAvailable()) await put('ordenes_trabajo', row);

  if (navigator.onLine) {
    try {
      await supabase().from('ordenes_trabajo').upsert(row);
    } catch {
      await enqueueSyncAction('upsert', 'ordenes_trabajo', row);
    }
  } else {
    await enqueueSyncAction('upsert', 'ordenes_trabajo', row);
  }
}

export async function deleteOrdenTrabajo(id: string): Promise<void> {
  if (await isOfflineDbAvailable()) await removeFromDb('ordenes_trabajo', id);
  if (navigator.onLine) {
    try {
      await supabase().from('ordenes_trabajo').delete().eq('id', id);
    } catch {
      await enqueueSyncAction('delete', 'ordenes_trabajo', { id });
    }
  } else {
    await enqueueSyncAction('delete', 'ordenes_trabajo', { id });
  }
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
function mapOrdenTrabajoFromDb(o: any): OrdenTrabajo {
  return {
    id: o.id,
    numero: o.numero || '',
    clienteId: o.cliente_id || undefined,
    clienteNombre: o.cliente_nombre || undefined,
    descripcion: o.descripcion || '',
    estado: ['abierta', 'en_curso', 'cerrada'].includes(o.estado) ? o.estado : 'abierta',
    fecha: o.fecha,
    tecnicoId: o.tecnico_id || undefined,
    horas: o.horas != null ? Number(o.horas) : undefined,
    materiales: o.materiales || undefined,
    obraId: o.obra_id || undefined,
    invoiceId: o.invoice_id || undefined,
    notas: o.notas || undefined,
    createdAt: o.created_at || o.createdAt || new Date().toISOString(),
    updatedAt: o.updated_at || o.updatedAt || new Date().toISOString(),
  };
}

// ============================================================
// LOTES Y TRAZABILIDAD
// ============================================================

export async function getLotes(): Promise<Lote[]> {
  const offlineAvail = await isOfflineDbAvailable();
  if (offlineAvail) {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const cached = await getAll<any>('lotes');
    if (cached.length > 0) return cached.map(mapLoteFromDb);
  }

  if (!navigator.onLine) return [];

  const { data, error } = await supabase().from('lotes').select('*').order('fecha_caducidad', { ascending: true, nullsFirst: false });
  if (error || !data) return [];

  if (await isOfflineDbAvailable()) {
    await clearStore('lotes');
    await putMany('lotes', data);
  }
  return data.map(mapLoteFromDb);
}

export async function getLoteById(id: string): Promise<Lote | null> {
  const lotes = await getLotes();
  return lotes.find(l => l.id === id) ?? null;
}

export async function saveLote(lote: Lote): Promise<void> {
  const userId = await requireUserId();
  const row = {
    id: lote.id,
    user_id: userId,
    product_id: lote.productId,
    product_ref: lote.productRef || null,
    product_name: lote.productName || null,
    codigo: lote.codigo,
    fecha_entrada: lote.fechaEntrada,
    fecha_caducidad: lote.fechaCaducidad || null,
    cantidad_entrada: lote.cantidadEntrada,
    cantidad_disponible: lote.cantidadDisponible,
    proveedor_id: lote.proveedorId || null,
    proveedor_nombre: lote.proveedorNombre || null,
    notas: lote.notas || null,
    // El estado del lote y su motivo: es lo que impide que un lote parado
    // por una alerta sanitaria siga saliendo por la puerta.
    estado: lote.estado || 'disponible',
    motivo_bloqueo: lote.motivoBloqueo || null,
    bloqueado_en: lote.bloqueadoEn || null,
    updated_at: new Date().toISOString(),
  };

  if (await isOfflineDbAvailable()) await put('lotes', row);

  if (navigator.onLine) {
    try {
      await supabase().from('lotes').upsert(row);
    } catch {
      await enqueueSyncAction('upsert', 'lotes', row);
    }
  } else {
    await enqueueSyncAction('upsert', 'lotes', row);
  }
}

export async function deleteLote(id: string): Promise<void> {
  if (await isOfflineDbAvailable()) await removeFromDb('lotes', id);
  if (navigator.onLine) {
    try {
      await supabase().from('lotes').delete().eq('id', id);
    } catch {
      await enqueueSyncAction('delete', 'lotes', { id });
    }
  } else {
    await enqueueSyncAction('delete', 'lotes', { id });
  }
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
function mapLoteFromDb(l: any): Lote {
  return {
    id: l.id,
    productId: l.product_id,
    productRef: l.product_ref || '',
    productName: l.product_name || '',
    codigo: l.codigo || '',
    fechaEntrada: l.fecha_entrada,
    fechaCaducidad: l.fecha_caducidad || undefined,
    cantidadEntrada: Number(l.cantidad_entrada ?? 0),
    cantidadDisponible: Number(l.cantidad_disponible ?? 0),
    proveedorId: l.proveedor_id || undefined,
    proveedorNombre: l.proveedor_nombre || undefined,
    notas: l.notas || undefined,
    // Los lotes guardados antes de que esto existiera vienen sin estado y
    // se leen como disponibles: nadie se encuentra el almacén bloqueado el
    // día que esto se despliega.
    estado: l.estado || 'disponible',
    motivoBloqueo: l.motivo_bloqueo || undefined,
    bloqueadoEn: l.bloqueado_en || undefined,
    createdAt: l.created_at || l.createdAt || new Date().toISOString(),
    updatedAt: l.updated_at || l.updatedAt || new Date().toISOString(),
  };
}

// ============================================================
// OFERTAS DE MOSTRADOR
// ============================================================

export async function getOfertas(): Promise<Oferta[]> {
  const offlineAvail = await isOfflineDbAvailable();
  if (offlineAvail) {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const cached = await getAll<any>('ofertas');
    if (cached.length > 0) return cached.map(mapOfertaFromDb);
  }

  if (!navigator.onLine) return [];

  const { data, error } = await supabase().from('ofertas').select('*').order('nombre', { ascending: true });
  if (error || !data) return [];

  if (await isOfflineDbAvailable()) {
    await clearStore('ofertas');
    await putMany('ofertas', data);
  }
  return data.map(mapOfertaFromDb);
}

export async function saveOferta(oferta: Oferta): Promise<void> {
  const userId = await requireUserId();
  const row = {
    id: oferta.id,
    user_id: userId,
    nombre: oferta.nombre,
    tipo: oferta.tipo,
    alcance: oferta.alcance,
    alcance_ids: oferta.alcanceIds ?? [],
    param_n: oferta.paramN ?? null,
    param_m: oferta.paramM ?? null,
    param_porcentaje: oferta.paramPorcentaje ?? null,
    param_importe: oferta.paramImporte ?? null,
    tramos: oferta.tramos ?? [],
    regalo_product_id: oferta.regaloProductId || null,
    regalo_nombre: oferta.regaloNombre || null,
    regalo_cantidad: oferta.regaloCantidad ?? null,
    desde: oferta.desde || null,
    hasta: oferta.hasta || null,
    dias_semana: oferta.diasSemana ?? null,
    hora_inicio: oferta.horaInicio || null,
    hora_fin: oferta.horaFin || null,
    solo_grupo_cliente_id: oferta.soloGrupoClienteId || null,
    solo_cliente_id: oferta.soloClienteId || null,
    minimo_importe: oferta.minimoImporte ?? null,
    minimo_unidades: oferta.minimoUnidades ?? null,
    activa: oferta.activa,
    acumulable: oferta.acumulable,
    prioridad: oferta.prioridad ?? 0,
    usos_maximos: oferta.usosMaximos ?? null,
    usos: oferta.usos ?? 0,
    updated_at: new Date().toISOString(),
  };

  if (await isOfflineDbAvailable()) await put('ofertas', row);

  if (navigator.onLine) {
    try {
      await supabase().from('ofertas').upsert(row);
    } catch {
      await enqueueSyncAction('upsert', 'ofertas', row);
    }
  } else {
    await enqueueSyncAction('upsert', 'ofertas', row);
  }
}

export async function deleteOferta(id: string): Promise<void> {
  if (await isOfflineDbAvailable()) await removeFromDb('ofertas', id);
  if (navigator.onLine) {
    try {
      await supabase().from('ofertas').delete().eq('id', id);
    } catch {
      await enqueueSyncAction('delete', 'ofertas', { id });
    }
  } else {
    await enqueueSyncAction('delete', 'ofertas', { id });
  }
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
function mapOfertaFromDb(o: any): Oferta {
  const numeroOpcional = (v: unknown) => (v === null || v === undefined ? undefined : Number(v));
  return {
    id: o.id,
    nombre: o.nombre || '',
    tipo: o.tipo,
    alcance: o.alcance || 'todo',
    alcanceIds: Array.isArray(o.alcance_ids) ? o.alcance_ids : [],
    paramN: numeroOpcional(o.param_n),
    paramM: numeroOpcional(o.param_m),
    paramPorcentaje: numeroOpcional(o.param_porcentaje),
    paramImporte: numeroOpcional(o.param_importe),
    tramos: Array.isArray(o.tramos) ? o.tramos : [],
    regaloProductId: o.regalo_product_id || undefined,
    regaloNombre: o.regalo_nombre || undefined,
    regaloCantidad: numeroOpcional(o.regalo_cantidad),
    desde: o.desde || undefined,
    hasta: o.hasta || undefined,
    diasSemana: Array.isArray(o.dias_semana) ? o.dias_semana : undefined,
    horaInicio: o.hora_inicio || undefined,
    horaFin: o.hora_fin || undefined,
    soloGrupoClienteId: o.solo_grupo_cliente_id || undefined,
    soloClienteId: o.solo_cliente_id || undefined,
    minimoImporte: numeroOpcional(o.minimo_importe),
    minimoUnidades: numeroOpcional(o.minimo_unidades),
    activa: o.activa !== false,
    acumulable: o.acumulable === true,
    prioridad: Number(o.prioridad ?? 0),
    usosMaximos: numeroOpcional(o.usos_maximos),
    usos: Number(o.usos ?? 0),
    createdAt: o.created_at || new Date().toISOString(),
    updatedAt: o.updated_at || new Date().toISOString(),
  };
}

// ============================================================
// RAPPELS POR VOLUMEN
// ============================================================

export async function getRappels(): Promise<RappelConfig[]> {
  const offlineAvail = await isOfflineDbAvailable();
  if (offlineAvail) {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const cached = await getAll<any>('rappels');
    if (cached.length > 0) return cached.map(mapRappelFromDb);
  }

  if (!navigator.onLine) return [];

  const { data, error } = await supabase().from('rappels').select('*').order('nombre', { ascending: true });
  if (error || !data) return [];

  if (await isOfflineDbAvailable()) {
    await clearStore('rappels');
    await putMany('rappels', data);
  }
  return data.map(mapRappelFromDb);
}

export async function saveRappel(rappel: RappelConfig): Promise<void> {
  const userId = await requireUserId();
  const row = {
    id: rappel.id,
    user_id: userId,
    nombre: rappel.nombre,
    cliente_id: rappel.clienteId || null,
    cliente_nombre: rappel.clienteNombre || null,
    tramos: rappel.tramos,
    activo: rappel.activo,
    updated_at: new Date().toISOString(),
  };

  if (await isOfflineDbAvailable()) await put('rappels', row);

  if (navigator.onLine) {
    try {
      await supabase().from('rappels').upsert(row);
    } catch {
      await enqueueSyncAction('upsert', 'rappels', row);
    }
  } else {
    await enqueueSyncAction('upsert', 'rappels', row);
  }
}

export async function deleteRappel(id: string): Promise<void> {
  if (await isOfflineDbAvailable()) await removeFromDb('rappels', id);
  if (navigator.onLine) {
    try {
      await supabase().from('rappels').delete().eq('id', id);
    } catch {
      await enqueueSyncAction('delete', 'rappels', { id });
    }
  } else {
    await enqueueSyncAction('delete', 'rappels', { id });
  }
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
function mapRappelFromDb(r: any): RappelConfig {
  return {
    id: r.id,
    nombre: r.nombre || '',
    clienteId: r.cliente_id || undefined,
    clienteNombre: r.cliente_nombre || undefined,
    tramos: Array.isArray(r.tramos) ? r.tramos : [],
    activo: r.activo ?? true,
    createdAt: r.created_at || r.createdAt || new Date().toISOString(),
    updatedAt: r.updated_at || r.updatedAt || new Date().toISOString(),
  };
}

// ============================================================
// GRUPOS Y CADENAS DE CLIENTES
// ============================================================

export async function getGruposClientes(): Promise<GrupoCliente[]> {
  const offlineAvail = await isOfflineDbAvailable();
  if (offlineAvail) {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const cached = await getAll<any>('grupos_clientes');
    if (cached.length > 0) return cached.map(mapGrupoClienteFromDb);
  }

  if (!navigator.onLine) return [];

  const { data, error } = await supabase().from('grupos_clientes').select('*').order('nombre', { ascending: true });
  if (error || !data) return [];

  if (await isOfflineDbAvailable()) {
    await clearStore('grupos_clientes');
    await putMany('grupos_clientes', data);
  }
  return data.map(mapGrupoClienteFromDb);
}

export async function saveGrupoCliente(grupo: GrupoCliente): Promise<void> {
  const userId = await requireUserId();
  const row = {
    id: grupo.id,
    user_id: userId,
    nombre: grupo.nombre,
    notas: grupo.notas || null,
    updated_at: new Date().toISOString(),
  };

  if (await isOfflineDbAvailable()) await put('grupos_clientes', row);

  if (navigator.onLine) {
    try {
      await supabase().from('grupos_clientes').upsert(row);
    } catch {
      await enqueueSyncAction('upsert', 'grupos_clientes', row);
    }
  } else {
    await enqueueSyncAction('upsert', 'grupos_clientes', row);
  }
}

export async function deleteGrupoCliente(id: string): Promise<void> {
  if (await isOfflineDbAvailable()) await removeFromDb('grupos_clientes', id);
  if (navigator.onLine) {
    try {
      await supabase().from('grupos_clientes').delete().eq('id', id);
    } catch {
      await enqueueSyncAction('delete', 'grupos_clientes', { id });
    }
  } else {
    await enqueueSyncAction('delete', 'grupos_clientes', { id });
  }
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
function mapGrupoClienteFromDb(g: any): GrupoCliente {
  return {
    id: g.id,
    nombre: g.nombre || '',
    notas: g.notas || undefined,
    createdAt: g.created_at || g.createdAt || new Date().toISOString(),
    updatedAt: g.updated_at || g.updatedAt || new Date().toISOString(),
  };
}

// ============================================================
// RUTAS DE REPARTO
// ============================================================

export async function getRutasReparto(): Promise<RutaReparto[]> {
  const offlineAvail = await isOfflineDbAvailable();
  if (offlineAvail) {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const cached = await getAll<any>('rutas_reparto');
    if (cached.length > 0) return cached.map(mapRutaFromDb);
  }

  if (!navigator.onLine) return [];

  const { data, error } = await supabase().from('rutas_reparto').select('*').order('nombre', { ascending: true });
  if (error || !data) return [];

  if (await isOfflineDbAvailable()) {
    await clearStore('rutas_reparto');
    await putMany('rutas_reparto', data);
  }
  return data.map(mapRutaFromDb);
}

export async function saveRutaReparto(ruta: RutaReparto): Promise<void> {
  const userId = await requireUserId();
  const row = {
    id: ruta.id,
    user_id: userId,
    nombre: ruta.nombre,
    dia_semana: ruta.diaSemana ?? null,
    notas: ruta.notas || null,
    updated_at: new Date().toISOString(),
  };

  if (await isOfflineDbAvailable()) await put('rutas_reparto', row);

  if (navigator.onLine) {
    try {
      await supabase().from('rutas_reparto').upsert(row);
    } catch {
      await enqueueSyncAction('upsert', 'rutas_reparto', row);
    }
  } else {
    await enqueueSyncAction('upsert', 'rutas_reparto', row);
  }
}

export async function deleteRutaReparto(id: string): Promise<void> {
  if (await isOfflineDbAvailable()) await removeFromDb('rutas_reparto', id);
  if (navigator.onLine) {
    try {
      await supabase().from('rutas_reparto').delete().eq('id', id);
    } catch {
      await enqueueSyncAction('delete', 'rutas_reparto', { id });
    }
  } else {
    await enqueueSyncAction('delete', 'rutas_reparto', { id });
  }
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
function mapRutaFromDb(r: any): RutaReparto {
  return {
    id: r.id,
    nombre: r.nombre || '',
    diaSemana: r.dia_semana != null ? Number(r.dia_semana) : undefined,
    notas: r.notas || undefined,
    createdAt: r.created_at || r.createdAt || new Date().toISOString(),
    updatedAt: r.updated_at || r.updatedAt || new Date().toISOString(),
  };
}

// ============================================================
// NÚMEROS DE SERIE
// ============================================================

export async function getNumerosSerie(): Promise<NumeroSerie[]> {
  const offlineAvail = await isOfflineDbAvailable();
  if (offlineAvail) {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const cached = await getAll<any>('numeros_serie');
    if (cached.length > 0) return cached.map(mapNumeroSerieFromDb);
  }

  if (!navigator.onLine) return [];

  const { data, error } = await supabase().from('numeros_serie').select('*').order('numero_serie', { ascending: true });
  if (error || !data) return [];

  if (await isOfflineDbAvailable()) {
    await clearStore('numeros_serie');
    await putMany('numeros_serie', data);
  }
  return data.map(mapNumeroSerieFromDb);
}

export async function getNumeroSerieById(id: string): Promise<NumeroSerie | null> {
  const numeros = await getNumerosSerie();
  return numeros.find(n => n.id === id) ?? null;
}

export async function saveNumeroSerie(numero: NumeroSerie): Promise<void> {
  const userId = await requireUserId();
  const row = {
    id: numero.id,
    user_id: userId,
    product_id: numero.productId,
    product_ref: numero.productRef || null,
    product_name: numero.productName || null,
    numero_serie: numero.numeroSerie,
    estado: numero.estado,
    fecha_entrada: numero.fechaEntrada,
    proveedor_id: numero.proveedorId || null,
    proveedor_nombre: numero.proveedorNombre || null,
    fecha_venta: numero.fechaVenta || null,
    cliente_id: numero.clienteId || null,
    cliente_nombre: numero.clienteNombre || null,
    invoice_id: numero.invoiceId || null,
    garantia_meses: numero.garantiaMeses ?? null,
    notas: numero.notas || null,
    updated_at: new Date().toISOString(),
  };

  if (await isOfflineDbAvailable()) await put('numeros_serie', row);

  if (navigator.onLine) {
    try {
      await supabase().from('numeros_serie').upsert(row);
    } catch {
      await enqueueSyncAction('upsert', 'numeros_serie', row);
    }
  } else {
    await enqueueSyncAction('upsert', 'numeros_serie', row);
  }
}

export async function deleteNumeroSerie(id: string): Promise<void> {
  if (await isOfflineDbAvailable()) await removeFromDb('numeros_serie', id);
  if (navigator.onLine) {
    try {
      await supabase().from('numeros_serie').delete().eq('id', id);
    } catch {
      await enqueueSyncAction('delete', 'numeros_serie', { id });
    }
  } else {
    await enqueueSyncAction('delete', 'numeros_serie', { id });
  }
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
function mapNumeroSerieFromDb(n: any): NumeroSerie {
  return {
    id: n.id,
    productId: n.product_id,
    productRef: n.product_ref || '',
    productName: n.product_name || '',
    numeroSerie: n.numero_serie || '',
    estado: ['en_stock', 'vendido', 'baja'].includes(n.estado) ? n.estado : 'en_stock',
    fechaEntrada: n.fecha_entrada,
    proveedorId: n.proveedor_id || undefined,
    proveedorNombre: n.proveedor_nombre || undefined,
    fechaVenta: n.fecha_venta || undefined,
    clienteId: n.cliente_id || undefined,
    clienteNombre: n.cliente_nombre || undefined,
    invoiceId: n.invoice_id || undefined,
    garantiaMeses: n.garantia_meses != null ? Number(n.garantia_meses) : undefined,
    notas: n.notas || undefined,
    createdAt: n.created_at || n.createdAt || new Date().toISOString(),
    updatedAt: n.updated_at || n.updatedAt || new Date().toISOString(),
  };
}

// ============================================================
// FABRICACIÓN: ESCANDALLOS
// ============================================================

export async function getEscandallos(): Promise<Escandallo[]> {
  const offlineAvail = await isOfflineDbAvailable();
  if (offlineAvail) {
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const cached = await getAll<any>('escandallos');
    if (cached.length > 0) return cached.map(mapEscandalloFromDb);
  }

  if (!navigator.onLine) return [];

  const { data, error } = await supabase().from('escandallos').select('*');
  if (error || !data) return [];

  if (await isOfflineDbAvailable()) {
    await clearStore('escandallos');
    await putMany('escandallos', data);
  }
  return data.map(mapEscandalloFromDb);
}

export async function saveEscandallo(escandallo: Escandallo): Promise<void> {
  const userId = await requireUserId();
  const row = {
    id: escandallo.id,
    user_id: userId,
    product_id: escandallo.productId,
    product_ref: escandallo.productRef || null,
    product_name: escandallo.productName || null,
    componentes: escandallo.componentes,
    coste_adicional: escandallo.costeAdicional ?? null,
    notas: escandallo.notas || null,
    updated_at: new Date().toISOString(),
  };

  if (await isOfflineDbAvailable()) await put('escandallos', row);

  if (navigator.onLine) {
    try {
      await supabase().from('escandallos').upsert(row);
    } catch {
      await enqueueSyncAction('upsert', 'escandallos', row);
    }
  } else {
    await enqueueSyncAction('upsert', 'escandallos', row);
  }
}

export async function deleteEscandallo(id: string): Promise<void> {
  if (await isOfflineDbAvailable()) await removeFromDb('escandallos', id);
  if (navigator.onLine) {
    try {
      await supabase().from('escandallos').delete().eq('id', id);
    } catch {
      await enqueueSyncAction('delete', 'escandallos', { id });
    }
  } else {
    await enqueueSyncAction('delete', 'escandallos', { id });
  }
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
function mapEscandalloFromDb(e: any): Escandallo {
  return {
    id: e.id,
    productId: e.product_id,
    productRef: e.product_ref || '',
    productName: e.product_name || '',
    componentes: Array.isArray(e.componentes) ? e.componentes : [],
    costeAdicional: e.coste_adicional != null ? Number(e.coste_adicional) : undefined,
    notas: e.notas || undefined,
    createdAt: e.created_at || e.createdAt || new Date().toISOString(),
    updatedAt: e.updated_at || e.updatedAt || new Date().toISOString(),
  };
}

/**
 * Fabrica `cantidad` unidades según un escandallo.
 *
 * Consume los componentes del almacén, da de alta el producto terminado con
 * ese stock, y le pone el coste real —el mismo cálculo del precio medio
 * ponderado que rige una compra, no un número inventado.
 *
 * NO bloquea por falta de existencias: dice la verdad de lo que falta antes
 * (con `componentesFaltantes`, aparte) pero quien fabrica puede decidir
 * seguir igualmente —a lo mejor el componente llega hoy por la tarde—.
 */
export async function fabricar(escandalloId: string, cantidad: number, almacenId?: string): Promise<void> {
  if (cantidad <= 0) return;
  const escandallo = (await getEscandallos()).find(e => e.id === escandalloId);
  if (!escandallo) throw new Error('Escandallo no encontrado.');

  const productos = await getProducts();
  const coste = costeDeEscandallo(escandallo, productos);

  for (const c of escandallo.componentes) {
    await adjustStock(c.productId, -(c.cantidad * cantidad), almacenId);
  }

  const final = productos.find(p => p.id === escandallo.productId);
  if (!final) throw new Error('El producto fabricado no existe en el catálogo.');

  const pmpActual = final.costePmp && final.costePmp > 0 ? final.costePmp : (final.unitPrice || 0);
  const nuevoPmp = nuevoPmpTrasFabricar(final.stockQuantity ?? 0, pmpActual, cantidad, coste);

  await adjustStock(final.id, cantidad, almacenId);
  await saveProduct({ ...final, costePmp: Math.round(nuevoPmp * 10000) / 10000 });
}

// ============================================================
// PORTAL DEL CLIENTE (migración 055)
// ============================================================

function tokenAleatorio(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * El enlace del portal de un cliente: el que ya tenga o uno nuevo. Es lo
 * que se le manda para que vea sus facturas y las pague.
 */
export async function enlacePortal(clientId: string): Promise<string> {
  const userId = await requireUserId();
  const db = supabase();
  const { data: vivo, error } = await db.from('portal_clientes')
    .select('token').eq('user_id', userId).eq('client_id', clientId).is('revocado_en', null).maybeSingle();
  if (error) throw new Error(error.message);
  let token = vivo?.token as string | undefined;
  if (!token) {
    token = tokenAleatorio();
    const { error: e } = await db.from('portal_clientes').insert({ token, user_id: userId, client_id: clientId });
    if (e) throw new Error(e.message);
  }
  return `${window.location.origin}/portal/${token}`;
}

/** Anula el enlace de un cliente (deja de funcionar al momento) y da uno nuevo. */
export async function renovarEnlacePortal(clientId: string): Promise<string> {
  const userId = await requireUserId();
  const { error } = await supabase().from('portal_clientes')
    .update({ revocado_en: new Date().toISOString() })
    .eq('user_id', userId).eq('client_id', clientId).is('revocado_en', null);
  if (error) throw new Error(error.message);
  return enlacePortal(clientId);
}

// ============================================================
// BUZÓN DE FACTURAS DE PROVEEDORES (migración 057)
// ============================================================

export interface DocumentoBuzon {
  id: string;
  recibidoEn: string;
  remitente: string | null;
  asunto: string | null;
  nombre: string;
  mime: string;
}

/** Lo que ha llegado por correo y espera revisión (sin el fichero: pesa). */
export async function getBandejaBuzon(): Promise<DocumentoBuzon[]> {
  if (!navigator.onLine) return [];
  const userId = await requireUserId();
  const { data, error } = await supabase().from('buzon_documentos')
    .select('id, recibido_en, remitente, asunto, nombre, mime')
    .eq('user_id', userId).eq('estado', 'nuevo').order('recibido_en', { ascending: false }).limit(100);
  if (error || !data) return [];
  type Fila = { id: string; recibido_en: string; remitente: string | null; asunto: string | null; nombre: string; mime: string };
  return (data as Fila[]).map(d => ({ id: d.id, recibidoEn: d.recibido_en, remitente: d.remitente, asunto: d.asunto, nombre: d.nombre, mime: d.mime }));
}

export async function contenidoBuzon(id: string): Promise<string> {
  const { data, error } = await supabase().from('buzon_documentos').select('contenido').eq('id', id).single();
  if (error || !data) throw new Error('No se ha podido abrir el documento.');
  return data.contenido as string;
}

export async function marcarBuzon(id: string, estado: 'procesado' | 'descartado', gastoId?: string): Promise<void> {
  const { error } = await supabase().from('buzon_documentos')
    // El fichero se conserva: es la factura del proveedor, y hay que guardarla.
    .update({ estado, gasto_id: gastoId ?? null }).eq('id', id);
  if (error) throw new Error(error.message);
}
