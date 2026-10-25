// ============================================================
// SYNC ENGINE — Background sync between IndexedDB and Supabase
// Processes the sync queue when online, handles retries
// ============================================================

import { createClient } from '@/lib/supabase/client';
import { faltaSegundoFactor } from '@/lib/seguridad/sesionCliente';
import { escribirQuitandoColumnasQueFaltan } from './columnasQueFaltan';
import { porTrozos, todasLasFilas } from './porTandas';
import { generateInvoiceNumber } from './utils';
import {
  getSyncQueue,
  removeSyncItem,
  updateSyncItem,
  getSyncQueueCount,
  getSyncErrores,
  moverAErrores,
  getById,
  put,
  getMeta,
  setMeta,
  EVENTO_COLA,
  type SyncQueueItem,
  type SyncTable,
} from './offlineDb';

/**
 * Reintento exponencial: 1 s, 2 s, 4 s … hasta 64 s entre pasadas. Los
 * fallos pasajeros nunca se descartan: el item se queda en la cola y se
 * vuelve a intentar solo, sin molestar al usuario.
 */
const RETRY_DELAY_BASE_MS = 1000;
const BACKOFF_MAX_POWER = 6;

let isSyncing = false;
let syncListeners: Array<(state: SyncState) => void> = [];

export interface SyncRejection {
  table: string;
  /** Id del registro rechazado, para poder marcarlo en su ficha/listado. */
  id: string | null;
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
  /** Lo que hay en la bandeja de errores (rechazado, guardado, sin subir). */
  errores: number;
}

let currentState: SyncState = {
  isSyncing: false,
  pendingCount: 0,
  lastSyncTime: null,
  lastError: null,
  rejections: [],
  errores: 0,
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
  if (message.includes('SUSCRIPCION:')) return `Suscripción: ${message.split('SUSCRIPCION:')[1].trim()}`;
  if (err?.code === '23505') return 'Registro duplicado: ya existe otro con la misma numeración.';
  return message;
}

/**
 * El error de un grupo de factura lleva consigo lo que iba con ella (sus
 * líneas y su desglose), aunque ya hubieran salido de la cola, y si en el
 * servidor llegó a quedar como borrador: la bandeja lo guarda todo.
 */
interface ErrorDeGrupo extends Error {
  hijos?: SyncQueueItem[];
  enServidor?: 'nada' | 'borrador';
}

// ============================================================
// NÚMEROS REPETIDOS EN LO QUE AÚN NO ES FISCAL
// ============================================================
//
// Un borrador, un albarán o un pedido hecho sin conexión coge el siguiente
// número que ve ESTE equipo; si otro equipo ya lo usó, el servidor lo
// rechaza (23505). Nada de eso está emitido ni sellado, así que se le da el
// siguiente número libre de su serie y sube. Una factura ya emitida NUNCA
// se renumera (su número está impreso y en el registro): esa va a la bandeja.

const esDuplicado = (e: unknown) => (e as { code?: string })?.code === '23505';

/** ¿Se puede cambiar el número de esta fila sin tocar nada fiscal? */
export function renumerable(table: string, row: Record<string, unknown>): boolean {
  if (table === 'albaranes') return true;
  if (table !== 'invoices') return false;
  const sellable = ['factura', 'rectificativa'].includes(String(row.tipo ?? 'factura')) && (row.sentido ?? 'venta') === 'venta';
  return !sellable || row.status === 'borrador';
}

/** El siguiente número de la serie que no usa ningún otro documento en el servidor. */
export function siguienteLibre(numero: string, serie: string, usados: Set<string>): string {
  let candidato = numero;
  for (let i = 0; i < 5000 && usados.has(candidato); i++) {
    const m = /^(.*)-(\d{4})-(\d+)$/.exec(candidato);
    candidato = m ? generateInvoiceNumber(serie, Number(m[3]) + 1, Number(m[2])) : generateInvoiceNumber(serie, 1);
  }
  if (usados.has(candidato)) throw new Error('No se ha encontrado un número libre en la serie.');
  return candidato;
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
async function renumerar(supabase: any, table: string, row: Record<string, unknown>): Promise<Record<string, unknown>> {
  const serie = String(row.series ?? '');
  let q = supabase.from(table).select('id, number').eq('series', serie);
  if (row.user_id) q = q.eq('user_id', row.user_id);
  const { data, error } = await q;
  if (error) throw error;
  const usados = new Set<string>((data ?? []).filter((r: { id: string }) => r.id !== row.id).map((r: { number: string }) => r.number));
  const nuevo = siguienteLibre(String(row.number ?? ''), serie, usados);
  const renumerada = { ...row, number: nuevo };
  // La copia de este equipo también, para que lo que se ve sea lo que hay.
  const local = await getById<Record<string, unknown>>(table, String(row.id)).catch(() => undefined);
  if (local) await put(table, { ...local, number: nuevo });
  renumerados.push({ table, id: String(row.id), de: String(row.number), a: nuevo });
  return renumerada;
}

/** Lo renumerado en la última pasada (para avisar de que cambió el número). */
let renumerados: Array<{ table: string; id: string; de: string; a: string }> = [];
export function ultimosRenumerados() { return renumerados; }

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
async function upsertConNumeroLibre(supabase: any, table: string, row: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { error } = await supabase.from(table).upsert(row);
  if (!error) return row;
  if (!esDuplicado(error) || !renumerable(table, row)) throw error;
  const otra = await renumerar(supabase, table, row);
  const { error: e2 } = await supabase.from(table).upsert(otra);
  if (e2) throw e2;
  return otra;
}

/** Retardo de reintento según los intentos fallidos acumulados. */
function backoffDelayMs(retries: number): number {
  return RETRY_DELAY_BASE_MS * 2 ** Math.min(retries - 1, BACKOFF_MAX_POWER);
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
  ofertas: 'ofertas',
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
  document_templates: 'document_templates',
  vendedores: 'vendedores',
  almacenes: 'almacenes',
  traspasos: 'traspasos',
  traspaso_line_items: 'traspaso_line_items',
  regularizaciones_stock: 'regularizaciones_stock',
  cobros_pagos: 'cobros_pagos',
  gastos: 'gastos',
  vehiculos: 'vehiculos',
  obras: 'obras',
  ordenes_trabajo: 'ordenes_trabajo',
  lotes: 'lotes',
  rappels: 'rappels',
  grupos_clientes: 'grupos_clientes',
  rutas_reparto: 'rutas_reparto',
  numeros_serie: 'numeros_serie',
  escandallos: 'escandallos',
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
  let row = item.data as Record<string, unknown>;
  const invoiceId = row.id as string;
  const children = await collectInvoiceChildren(queue, invoiceId, processedIds);

  const { data: existing } = await supabase.from('invoices').select('id, sealed_at').eq('id', invoiceId).maybeSingle();
  if (existing?.sealed_at) {
    // Sellada: el contenido fiscal no se toca y las líneas se descartan.
    //
    // Pero lo que se le haya COBRADO mientras no había conexión sí sube. Que
    // una factura de marzo se cobre en junio no cambia nada de lo que se
    // declaró en marzo, y tirarlo dejaba el cobro anotado en el móvil y la
    // factura eternamente pendiente en el servidor.
    const cobro: Record<string, unknown> = {};
    for (const columna of ['paid_amount', 'paid_date', 'status', 'payment_record_ids']) {
      if (columna in row) cobro[columna] = row[columna];
    }
    if (Object.keys(cobro).length > 0) {
      const { error } = await supabase.from('invoices').update(cobro).eq('id', invoiceId);
      if (error) throw error;
    }

    for (const c of children) { await removeSyncItem(c.id); processedIds.add(c.id); }
    await removeSyncItem(item.id);
    processedIds.add(item.id);
    return;
  }

  let enServidor: 'nada' | 'borrador' = existing ? 'borrador' : 'nada';
  try {
    // 1. Garantizar que la fila padre exista antes de tocar las líneas.
    if (!existing) {
      const { error } = await supabase.from('invoices').upsert({ ...row, status: 'borrador' });
      if (error) {
        // Número ya usado por otro equipo: si la fila aún no es fiscal (un
        // borrador, un albarán, un pedido) se le da el siguiente libre.
        if (!esDuplicado(error) || !renumerable('invoices', row)) throw error;
        row = await renumerar(supabase, 'invoices', row);
        const { error: e2 } = await supabase.from('invoices').upsert({ ...row, status: 'borrador' });
        if (e2) throw e2;
      }
      enServidor = 'borrador';
    }

    // 2. Reescribir el detalle completo (mismo patrón que el path online de
    //    saveInvoice: delete + insert) → idempotente entre pasadas.
    if (children.length > 0) {
      for (const table of CHILD_TABLES.invoices) {
        const { error } = await supabase.from(table).delete().eq('invoice_id', invoiceId);
        if (error) throw error;
      }
      // Las líneas NO salen de la cola hasta que el grupo entero ha subido:
      // si algo falla a mitad, la siguiente pasada borra el detalle en el
      // servidor y lo vuelve a escribir COMPLETO. Antes cada línea salía de
      // la cola al subir, y un corte a mitad dejaba la factura con sólo las
      // que quedaban en la cola (y el sellado calculaba el total con ellas).
      for (const child of children) {
        await processItem(supabase, child);
      }
    }

    // 3. Estado real → el trigger de sellado ya encuentra las líneas.
    row = await upsertConNumeroLibre(supabase, 'invoices', row);
  } catch (err) {
    // Lo que iba con la factura viaja con el error, aunque ya haya salido de
    // la cola: si el rechazo es definitivo, la bandeja lo guarda entero.
    const e = (err instanceof Error ? err : Object.assign(new Error(String((err as { message?: string })?.message ?? err)), err)) as ErrorDeGrupo;
    e.hijos = children;
    e.enServidor = enServidor;
    throw e;
  }
  for (const child of children) {
    await removeSyncItem(child.id);
    processedIds.add(child.id);
  }
  await removeSyncItem(item.id);
  processedIds.add(item.id);
}

// ============================================================
// PROCESS SYNC QUEUE
// ============================================================

export async function processSyncQueue(): Promise<void> {
  if (isSyncing || !navigator.onLine) return;
  // Sin el código de la verificación en dos pasos la base de datos lo
  // rechazaría todo (42501) y la cola lo daría por perdido: se espera a
  // que se ponga el código. Lo pendiente sigue en este equipo.
  if (await faltaSegundoFactor()) {
    updateState({ lastError: 'Falta el código de la verificación en dos pasos' });
    return;
  }

  isSyncing = true;
  updateState({ isSyncing: true, lastError: null });

  const supabase = createClient();
  const queue = await getSyncQueue();

  if (queue.length === 0) {
    isSyncing = false;
    updateState({ isSyncing: false, pendingCount: 0, lastSyncTime: Date.now() });
    return;
  }

  const rejections: SyncRejection[] = [];
  const processedIds = new Set<string>();
  renumerados = [];

  // Facturas que esperan en la cola: sus líneas y su desglose viajan CON
  // ellas (syncInvoiceGroup), nunca sueltas antes. Subidas sueltas salían
  // de la cola aunque la factura luego fallara, y se perdían.
  const facturasEnCola = new Set(
    queue.filter(q => q.table === 'invoices' && q.action === 'upsert').map(q => q.data.id as string),
  );

  for (const item of queue) {
    if (processedIds.has(item.id)) continue;
    if (CHILD_TABLES.invoices.includes(item.table)
      && facturasEnCola.has((item.data as { invoice_id?: string }).invoice_id ?? '')) continue;

    // Backoff: un item que acaba de fallar no se reintenta hasta que pase
    // su retardo (hasta 64 s). Se queda en la cola, así que no se pierde
    // nada: el contador de pendientes lo sigue reflejando.
    if (item.retries > 0 && item.lastAttemptAt) {
      if (Date.now() - item.lastAttemptAt < backoffDelayMs(item.retries)) continue;
    }

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
        // El servidor no lo va a aceptar nunca tal cual. NO se tira: pasa a
        // la bandeja de errores con todo lo que llevaba (la factura y sus
        // líneas), de donde sólo sale si alguien lo reintenta o lo descarta.
        const grupo = err as ErrorDeGrupo;
        const hijos = item.table === 'invoices'
          ? (grupo.hijos ?? await collectInvoiceChildren(queue, item.data.id as string, processedIds))
          : [];
        for (const h of hijos) processedIds.add(h.id);
        const motivo = readableReason(err)
          + (grupo.enServidor === 'borrador' && item.table === 'invoices' && item.data.status !== 'borrador'
            ? ' En el servidor ha quedado como BORRADOR, sin emitir: revísala y emítela de nuevo.'
            : '');
        await moverAErrores({
          id: `error_${item.id}`,
          item,
          hijos,
          motivo,
          codigo: (err as { code?: string })?.code ?? null,
          at: Date.now(),
          ...(item.owner ? { owner: item.owner } : {}),
        });
        rejections.push({
          table: item.table,
          id: (item.data.id as string) ?? null,
          reason: motivo,
          at: Date.now(),
        });
        continue;
      }

      // Fallo pasajero (red, servidor…): no se enseña ningún error ni se
      // descarta nada. El item se queda en la cola con un reintento más y
      // el motor volverá a intentarlo solo, con backoff.
      await updateSyncItem({ ...item, retries: item.retries + 1, lastAttemptAt: Date.now() });
    }
  }

  const remaining = await getSyncQueueCount();
  const errores = (await getSyncErrores()).length;
  const now = Date.now();
  const allRejections = [...currentState.rejections, ...rejections].slice(-20);

  // Los rechazos se guardan en el dispositivo para que la marca del
  // documento siga apareciendo tras recargar la página.
  await setMeta('lastSyncTime', now);
  await setMeta('syncRejections', allRejections);

  isSyncing = false;
  updateState({
    isSyncing: false,
    pendingCount: remaining,
    lastSyncTime: now,
    lastError: null,
    rejections: allRejections,
    errores,
  });
}

/** Descarta los avisos de rechazo. Los items en espera de reintento NO se
 *  tocan: un fallo pasajero se queda en la cola hasta sincronizarse. */
export async function clearSyncRejections(): Promise<void> {
  await setMeta('syncRejections', []);
  const remaining = await getSyncQueueCount();
  updateState({ rejections: [], lastError: null, pendingCount: remaining });
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
      const { data: ses } = await supabase.auth.getSession();
      const propio = ses?.session?.user?.id;
      let q = supabase.from(table).select('id');
      if (propio) q = q.eq('user_id', propio);
      const { data } = await q.order('updated_at', { ascending: false }).limit(1);
      // Si falta alguna columna (migración sin aplicar), se quita ésa y se
      // sigue: si no, el reintento fallaría para siempre y no se guardaría
      // nada de lo demás.
      const { error } = await escribirQuitandoColumnasQueFaltan(
        payload => (data?.length
          ? supabase.from(table).update(payload).eq('id', data[0].id)
          : supabase.from(table).insert(payload)),
        item.data,
      );
      if (error) throw error;
    } else {
      await upsertConNumeroLibre(supabase, table, item.data);
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
  // Sólo lo propio: una gestoría también puede leer lo de sus clientes.
  const { data: sesion } = await supabase.auth.getSession();
  const uid = sesion?.session?.user?.id;
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const mio = <Q extends { eq: (c: string, v: string) => any }>(q: Q): Q => (uid ? q.eq('user_id', uid) : q);

  try {
    // Download all entities
    const [
      { data: invoices },
      { data: clients },
      { data: products },
      { data: settings },
    ] = await Promise.all([
      todasLasFilas((desde, hasta) => mio(supabase.from('invoices').select('*'))
        .order('issue_date', { ascending: false }).order('id').range(desde, hasta)),
      todasLasFilas((desde, hasta) => mio(supabase.from('clients').select('*'))
        .order('business_name', { ascending: true }).order('id').range(desde, hasta)),
      todasLasFilas((desde, hasta) => supabase.from('products').select('*')
        .order('name', { ascending: true }).order('id').range(desde, hasta)),
      mio(supabase.from('company_settings').select('*')).order('updated_at', { ascending: false }).limit(1),
    ]);

    // LO QUE AÚN NO HA SUBIDO NO SE PISA
    //
    // Antes se vaciaba cada tabla y se volvía a llenar con lo del servidor.
    // Si en este equipo había una factura hecha sin conexión que aún no
    // había subido (o que el servidor rechazó y está en la bandeja), esa
    // limpieza la borraba de aquí. Ahora, si hay algo pendiente, no se
    // vacía nada: se escribe lo del servidor por encima, saltándose las
    // fichas que tienen cambios locales sin subir.
    const pendientes = await idsConCambiosLocales();
    const conservar = pendientes.total > 0;
    const reemplazar = async (store: string, filas: Record<string, unknown>[], ids: Set<string>) => {
      if (!conservar) {
        await clearStore(store);
        await putMany(store, filas);
        return;
      }
      await putMany(store, filas.filter(f => !ids.has(String(f.id))));
    };

    if (invoices?.length) {
      // Also fetch line items and tax breakdowns
      const invoiceIds = invoices.map((i: { id: string }) => i.id);
      const [{ data: lineItems }, { data: taxBreakdown }] = await Promise.all([
        porTrozos(invoiceIds, trozo => todasLasFilas((desde, hasta) => supabase.from('invoice_line_items').select('*')
          .in('invoice_id', trozo).order('invoice_id').order('sort_order', { ascending: true }).order('id').range(desde, hasta))),
        porTrozos(invoiceIds, trozo => todasLasFilas((desde, hasta) => supabase.from('invoice_tax_breakdown').select('*')
          .in('invoice_id', trozo).order('invoice_id').order('id').range(desde, hasta))),
      ]);

      // Store invoices with embedded line items and tax breakdown
      const enrichedInvoices = invoices.map((inv: Record<string, unknown>) => ({
        ...inv,
        _lineItems: (lineItems || []).filter((li: { invoice_id: string }) => li.invoice_id === inv.id),
        _taxBreakdown: (taxBreakdown || []).filter((tb: { invoice_id: string }) => tb.invoice_id === inv.id),
      }));

      await reemplazar('invoices', enrichedInvoices, pendientes.invoices);
    }

    if (clients?.length) {
      await reemplazar('clients', clients, pendientes.clients);
    }

    if (products?.length) {
      await reemplazar('products', products, pendientes.products);
    }

    if (settings?.length && !pendientes.ajustes) {
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

/**
 * Las fichas con cambios de este equipo que el servidor aún no tiene: en
 * la cola o en la bandeja de errores. Una línea o un desglose cuentan
 * como cambio de su factura.
 */
export async function idsConCambiosLocales(): Promise<{
  invoices: Set<string>; clients: Set<string>; products: Set<string>; ajustes: boolean; total: number;
}> {
  const cola = await getSyncQueue();
  const bandeja = await getSyncErrores();
  const items = [...cola, ...bandeja.flatMap(e => [e.item, ...e.hijos])];
  const r = { invoices: new Set<string>(), clients: new Set<string>(), products: new Set<string>(), ajustes: false, total: items.length };
  for (const it of items) {
    const d = it.data as { id?: string; invoice_id?: string };
    if (it.table === 'invoices' && d.id) r.invoices.add(d.id);
    else if ((it.table === 'invoice_line_items' || it.table === 'invoice_tax_breakdown') && d.invoice_id) r.invoices.add(d.invoice_id);
    else if (it.table === 'clients' && d.id) r.clients.add(d.id);
    else if (it.table === 'products' && d.id) r.products.add(d.id);
    else if (it.table === 'company_settings') r.ajustes = true;
  }
  return r;
}

// ============================================================
// AUTO SYNC SETUP — Listen for online events
// ============================================================

let autoSyncSetup = false;

export function initAutoSync(): void {
  if (autoSyncSetup || typeof window === 'undefined') return;
  autoSyncSetup = true;

  // Recupera los rechazos guardados para que la marca del documento
  // siga visible después de recargar.
  getMeta('syncRejections').then(v => {
    if (Array.isArray(v) && v.length) updateState({ rejections: v as SyncRejection[] });
  });

  // SUBIR EN CUANTO HAYA CONEXIÓN, NO «CUANDO SALTE EL EVENTO»
  //
  // Sólo se escuchaba el evento `online`. En Android no es fiable: salta al
  // conectarse a una wifi aunque esa wifi aún no dé internet (la del bar
  // que pide aceptar condiciones), y no vuelve a saltar cuando por fin lo
  // da; y con la app en segundo plano el sistema congela los temporizadores
  // y el evento se pierde. Lo hecho sin conexión se quedaba en el teléfono
  // hasta la siguiente recarga.
  //
  // Ahora se intenta en cuatro momentos: al volver la red, al volver a la
  // app (pantalla encendida o pestaña visible), al recuperar el foco y,
  // mientras quede algo pendiente, cada 15 segundos. `processSyncQueue`
  // no hace nada si ya está trabajando o si no hay red, así que llamarlo
  // de más no cuesta nada.
  const intentar = () => { if (navigator.onLine) void processSyncQueue(); };

  window.addEventListener('online', () => setTimeout(intentar, 500));
  window.addEventListener('focus', intentar);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') intentar();
  });
  // El service worker también avisa (sincronización en segundo plano).
  navigator.serviceWorker?.addEventListener('message', (e: MessageEvent) => {
    if (e.data?.type === 'SYNC_REQUESTED') intentar();
  });
  setInterval(() => {
    if (currentState.pendingCount > 0) intentar();
  }, 15_000);
  // Cada cambio que entra en la cola, en cuanto entra. Se agrupan los de
  // un mismo guardado (la factura y sus líneas llegan seguidas).
  let agrupar: ReturnType<typeof setTimeout> | null = null;
  window.addEventListener(EVENTO_COLA, () => {
    if (agrupar) clearTimeout(agrupar);
    agrupar = setTimeout(() => { agrupar = null; avisarCambioPendiente(); }, 250);
  });

  // Update pending count on load
  getSyncQueueCount().then(count => {
    updateState({ pendingCount: count });
  });
  getSyncErrores().then(e => updateState({ errores: e.length })).catch(() => {});

  // Initial sync if online
  intentar();
}

/**
 * Avisa de que hay algo nuevo en la cola: si hay red, se sube ya; si no,
 * se pide al service worker una sincronización en segundo plano, que
 * Chrome lanza en cuanto vuelve la conexión aunque la app esté cerrada.
 */
export function avisarCambioPendiente(): void {
  if (typeof window === 'undefined') return;
  void getSyncQueueCount().then(n => updateState({ pendingCount: n }));
  if (navigator.onLine) {
    void processSyncQueue();
    return;
  }
  navigator.serviceWorker?.ready
    .then(reg => (reg as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }).sync?.register('sync-queue'))
    .catch(() => { /* sin Background Sync: lo cubren los otros avisos */ });
}
