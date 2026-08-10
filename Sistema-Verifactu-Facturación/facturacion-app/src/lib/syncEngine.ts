// ============================================================
// SYNC ENGINE — Background sync between IndexedDB and Supabase
// Processes the sync queue when online, handles retries
// ============================================================

import { createClient } from '@/lib/supabase/client';
import {
  getSyncQueue,
  removeSyncItem,
  updateSyncItem,
  getSyncQueueCount,
  setMeta,
  type SyncQueueItem,
  type SyncTable,
} from './offlineDb';

const MAX_RETRIES = 5;
const RETRY_DELAY_BASE_MS = 1000;

let isSyncing = false;
let syncListeners: Array<(state: SyncState) => void> = [];

export interface SyncRejection {
  table: string;
  reason: string;
  at: number;
}

export interface SyncState {
  isSyncing: boolean;
  pendingCount: number;
  lastSyncTime: number | null;
  lastError: string | null;
  /** Cambios que el servidor rechazó de forma definitiva (reglas antifraude). */
  rejections: SyncRejection[];
}

let currentState: SyncState = {
  isSyncing: false,
  pendingCount: 0,
  lastSyncTime: null,
  lastError: null,
  rejections: [],
};

/**
 * Distingue un rechazo definitivo de un fallo pasajero.
 *
 * Reintentar 5 veces algo que el servidor nunca va a aceptar (una factura
 * sellada, un número duplicado) sólo sirve para acabar descartándolo en
 * silencio, y el usuario se queda creyendo que se guardó.
 */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
function isPermanentRejection(err: any): boolean {
  const code: string | undefined = err?.code;
  const message: string = err?.message ?? '';

  // 23505 unique_violation · 23514 check_violation (nuestros triggers)
  // 23503 foreign_key_violation · 42501 insufficient_privilege
  if (code && ['23505', '23514', '23503', '42501', 'P0001'].includes(code)) return true;
  return message.includes('ANTIFRAUDE:');
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
function readableReason(err: any): string {
  const message: string = err?.message ?? 'Rechazado por el servidor';
  if (message.includes('ANTIFRAUDE:')) return message.split('ANTIFRAUDE:')[1].trim();
  if (err?.code === '23505') return 'Registro duplicado: ya existe otro con la misma numeración.';
  return message;
}

// ============================================================
// STATE MANAGEMENT
// ============================================================

function updateState(partial: Partial<SyncState>) {
  currentState = { ...currentState, ...partial };
  syncListeners.forEach(fn => fn(currentState));
}

export function getSyncState(): SyncState {
  return currentState;
}

export function onSyncStateChange(listener: (state: SyncState) => void): () => void {
  syncListeners.push(listener);
  return () => {
    syncListeners = syncListeners.filter(fn => fn !== listener);
  };
}

// ============================================================
// TABLE → SUPABASE MAPPING
// ============================================================

const TABLE_MAP: Record<SyncTable, string> = {
  invoices: 'invoices',
  clients: 'clients',
  products: 'products',
  company_settings: 'company_settings',
  invoice_line_items: 'invoice_line_items',
  invoice_tax_breakdown: 'invoice_tax_breakdown',
  order_approvals: 'order_approvals',
  order_approval_items: 'order_approval_items',
  user_profiles: 'user_profiles',
  pos_sessions: 'pos_sessions',
  albaranes: 'albaranes',
  albaran_line_items: 'albaran_line_items',
  devoluciones: 'devoluciones',
  devolucion_line_items: 'devolucion_line_items',
  abonos: 'abonos',
  abono_aplicaciones: 'abono_aplicaciones',
};

/**
 * Tablas hijas que deben sincronizarse ANTES que su padre.
 * Una factura se emite con un trigger (fn_invoice_seal) que recalcula los
 * totales desde invoice_line_items: si la factura llega antes que sus líneas,
 * el servidor la rechaza (ANTIFRAUDE: no se puede emitir sin líneas).
 */
const CHILD_TABLES: Record<string, string[]> = {
  invoices: ['invoice_line_items', 'invoice_tax_breakdown'],
};

/**
 * Colecciona los hijos pendientes de una factura en la cola, SIN duplicados:
 * las líneas se identifican por su id; el desglose de impuestos por
 * (invoice_id, rate), porque el desglose no lleva id propio. Los duplicados
 * (p.ej. el desglose encolado dos veces por el guardado borrador + emitida)
 * se descartan de la cola para que la siguiente pasada no los re-procese.
 */
async function collectInvoiceChildren(
  queue: SyncQueueItem[],
  invoiceId: string,
  processedIds: Set<string>,
): Promise<SyncQueueItem[]> {
  const seen = new Set<string>();
  const children: SyncQueueItem[] = [];
  for (const q of queue) {
    if (processedIds.has(q.id)) continue;
    if (!CHILD_TABLES.invoices.includes(q.table)) continue;
    if ((q.data as { invoice_id?: string }).invoice_id !== invoiceId) continue;
    const key = q.table === 'invoice_line_items'
      ? `li:${q.data.id}`
      : `tb:${(q.data as { rate?: number }).rate}`;
    if (seen.has(key)) {
      processedIds.add(q.id);
      await removeSyncItem(q.id);
      continue;
    }
    seen.add(key);
    children.push(q);
  }
  return children;
}

/**
 * Sincroniza una factura y su detalle en el orden que exige el servidor:
 * 1) la fila padre como BORRADOR (si aún no existe), 2) líneas y desglose,
 * 3) la fila con su estado real (EMITIDA → el trigger la sella con líneas).
 * Si el padre ya está sellado, los items pendientes son copias obsoletas y
 * se descartan. Ante cualquier error se aborta el grupo (nada se marca como
 * procesado salvo lo ya sincronizado) para reintentarlo en la siguiente pasada.
 */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
async function syncInvoiceGroup(supabase: any, item: SyncQueueItem, queue: SyncQueueItem[], processedIds: Set<string>): Promise<void> {
  const row = item.data as Record<string, unknown>;
  const invoiceId = row.id as string;
  const children = await collectInvoiceChildren(queue, invoiceId, processedIds);

  const { data: existing } = await supabase.from('invoices').select('id, sealed_at').eq('id', invoiceId).maybeSingle();
  if (existing?.sealed_at) {
    for (const c of children) { await removeSyncItem(c.id); processedIds.add(c.id); }
    await removeSyncItem(item.id);
    processedIds.add(item.id);
    return;
  }

  // 1. Garantizar que la fila padre exista antes de tocar las líneas.
  if (!existing) {
    const { error } = await supabase.from('invoices').upsert({ ...row, status: 'borrador' });
    if (error) throw error;
  }

  // 2. Reescribir el detalle completo (mismo patrón que el path online de
  //    saveInvoice: delete + insert) → idempotente entre pasadas.
  if (children.length > 0) {
    for (const table of CHILD_TABLES.invoices) {
      const { error } = await supabase.from(table).delete().eq('invoice_id', invoiceId);
      if (error) throw error;
    }
    for (const child of children) {
      await processItem(supabase, child);
      await removeSyncItem(child.id);
      processedIds.add(child.id);
    }
  }

  // 3. Estado real → el trigger de sellado ya encuentra las líneas.
  const { error } = await supabase.from('invoices').upsert(row);
  if (error) throw error;
  await removeSyncItem(item.id);
  processedIds.add(item.id);
}

// ============================================================
// PROCESS SYNC QUEUE
// ============================================================

export async function processSyncQueue(): Promise<void> {
  if (isSyncing || !navigator.onLine) return;

  isSyncing = true;
  updateState({ isSyncing: true, lastError: null });

  const supabase = createClient();
  const queue = await getSyncQueue();

  if (queue.length === 0) {
    isSyncing = false;
    updateState({ isSyncing: false, pendingCount: 0, lastSyncTime: Date.now() });
    return;
  }

  let errored = false;
  const rejections: SyncRejection[] = [];
  const processedIds = new Set<string>();

  for (const item of queue) {
    if (processedIds.has(item.id)) continue;
    try {
      // Las facturas se sincronizan como grupo (padre + líneas + desglose)
      // en el orden que exige el servidor; el resto, item a item.
      if (item.action === 'upsert' && item.table === 'invoices') {
        await syncInvoiceGroup(supabase, item, queue, processedIds);
      } else {
        await processItem(supabase, item);
        await removeSyncItem(item.id);
      }
    } catch (err) {
      console.error(`[SyncEngine] Failed to sync item ${item.id}:`, err);

      if (isPermanentRejection(err)) {
        // El servidor no lo va a aceptar nunca. Se saca de la cola y se
        // deja constancia para poder enseñárselo al usuario.
        rejections.push({ table: item.table, reason: readableReason(err), at: Date.now() });
        await removeSyncItem(item.id);
        // Si la factura se rechaza, sus hijos huérfanos también se descartan.
        if (item.table === 'invoices') {
          for (const c of await collectInvoiceChildren(queue, item.data.id as string, processedIds)) {
            await removeSyncItem(c.id);
            processedIds.add(c.id);
          }
        }
        continue;
      }

      errored = true;
      if (item.retries >= MAX_RETRIES) {
        rejections.push({
          table: item.table,
          reason: 'No se pudo sincronizar tras varios intentos. Revisa la conexión.',
          at: Date.now(),
        });
        await removeSyncItem(item.id);
      } else {
        await updateSyncItem({ ...item, retries: item.retries + 1 });
      }
    }
  }

  const remaining = await getSyncQueueCount();
  const now = Date.now();
  await setMeta('lastSyncTime', now);

  isSyncing = false;
  updateState({
    isSyncing: false,
    pendingCount: remaining,
    lastSyncTime: now,
    lastError: errored ? 'Algunos cambios no se pudieron sincronizar' : null,
    rejections: [...currentState.rejections, ...rejections].slice(-20),
  });
}

/** Descarta los rechazos ya mostrados al usuario. */
export function clearSyncRejections(): void {
  updateState({ rejections: [] });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processItem(supabase: any, item: SyncQueueItem): Promise<void> {
  const table = TABLE_MAP[item.table];
  if (!table) {
    console.warn(`[SyncEngine] Unknown table: ${item.table}`);
    return;
  }

  if (item.action === 'upsert') {
    if (item.table === 'company_settings') {
      // company_settings NO tiene índice único por user_id: un upsert sin id
      // (los guardados offline no llevan id de BD) insertaría una fila nueva
      // en cada pasada, acumulando duplicados que rompen las lecturas .single()
      // y reinician los contadores de numeración (choques de número). Por eso
      // se resuelve la fila existente y se actualiza.
      const { data } = await supabase.from(table).select('id').order('updated_at', { ascending: false }).limit(1);
      if (data?.length) {
        const { error } = await supabase.from(table).update(item.data).eq('id', data[0].id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from(table).insert(item.data);
        if (error) throw error;
      }
    } else {
      const { error } = await supabase.from(table).upsert(item.data);
      if (error) throw error;
    }
  } else if (item.action === 'delete') {
    const id = item.data.id as string;
    if (id) {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
    }
  }
}

// ============================================================
// FULL DOWNLOAD (Online → IndexedDB)
// ============================================================

import {
  putMany,
  clearStore,
} from './offlineDb';

export async function fullDownloadToOffline(): Promise<void> {
  if (!navigator.onLine) return;

  const supabase = createClient();

  try {
    // Download all entities
    const [
      { data: invoices },
      { data: clients },
      { data: products },
      { data: settings },
    ] = await Promise.all([
      supabase.from('invoices').select('*').order('issue_date', { ascending: false }),
      supabase.from('clients').select('*').order('business_name', { ascending: true }),
      supabase.from('products').select('*').order('name', { ascending: true }),
      supabase.from('company_settings').select('*').limit(1),
    ]);

    if (invoices?.length) {
      // Also fetch line items and tax breakdowns
      const invoiceIds = invoices.map((i: { id: string }) => i.id);
      const [{ data: lineItems }, { data: taxBreakdown }] = await Promise.all([
        supabase.from('invoice_line_items').select('*').in('invoice_id', invoiceIds),
        supabase.from('invoice_tax_breakdown').select('*').in('invoice_id', invoiceIds),
      ]);

      // Store invoices with embedded line items and tax breakdown
      const enrichedInvoices = invoices.map((inv: Record<string, unknown>) => ({
        ...inv,
        _lineItems: (lineItems || []).filter((li: { invoice_id: string }) => li.invoice_id === inv.id),
        _taxBreakdown: (taxBreakdown || []).filter((tb: { invoice_id: string }) => tb.invoice_id === inv.id),
      }));

      await clearStore('invoices');
      await putMany('invoices', enrichedInvoices);
    }

    if (clients?.length) {
      await clearStore('clients');
      await putMany('clients', clients);
    }

    if (products?.length) {
      await clearStore('products');
      await putMany('products', products);
    }

    if (settings?.length) {
      await clearStore('settings');
      // Store with a stable key
      await putMany('settings', settings.map((s: Record<string, unknown>) => ({ ...s, key: 'company' })));
    }

    await setMeta('lastFullSync', Date.now());
    updateState({ lastSyncTime: Date.now() });
  } catch (err) {
    console.error('[SyncEngine] Full download failed:', err);
  }
}

// ============================================================
// AUTO SYNC SETUP — Listen for online events
// ============================================================

let autoSyncSetup = false;

export function initAutoSync(): void {
  if (autoSyncSetup || typeof window === 'undefined') return;
  autoSyncSetup = true;

  // Process queue when coming back online
  window.addEventListener('online', () => {
    setTimeout(() => processSyncQueue(), 500);
  });

  // Update pending count on load
  getSyncQueueCount().then(count => {
    updateState({ pendingCount: count });
  });

  // Initial sync if online
  if (navigator.onLine) {
    processSyncQueue();
  }
}
