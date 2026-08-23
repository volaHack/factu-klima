// ============================================================
// OFFLINE DATABASE — IndexedDB Storage Layer
// Stores: invoices, clients, products, settings, syncQueue
// No external dependencies — uses native IndexedDB API
// ============================================================

const DB_NAME = 'facturacion-offline';
const DB_VERSION = 12;

export type SyncAction = 'upsert' | 'delete';
export type SyncTable = 'invoices' | 'clients' | 'products' | 'company_settings' |
  'invoice_line_items' | 'invoice_tax_breakdown' | 'order_approvals' |
  'order_approval_items' | 'user_profiles' | 'pos_sessions' |
  'albaranes' | 'albaran_line_items' |
  'devoluciones' | 'devolucion_line_items' |
  'abonos' | 'abono_aplicaciones' | 'document_templates' | 'vendedores' |
  'almacenes' | 'traspasos' | 'traspaso_line_items' | 'regularizaciones_stock' |
  'cobros_pagos' | 'gastos' | 'vehiculos' | 'obras' | 'ordenes_trabajo' | 'lotes' | 'rappels';

export interface SyncQueueItem {
  id: string;
  action: SyncAction;
  table: SyncTable;
  data: Record<string, unknown>;
  timestamp: number;
  retries: number;
  /** Último intento fallido: se usa para espaciar los reintentos (backoff). */
  lastAttemptAt?: number;
}

// ============================================================
// DB CONNECTION
// ============================================================

let dbInstance: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Entity stores (keyed by id)
      if (!db.objectStoreNames.contains('invoices')) {
        db.createObjectStore('invoices', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('clients')) {
        db.createObjectStore('clients', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('products')) {
        db.createObjectStore('products', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('userProfiles')) {
        db.createObjectStore('userProfiles', { keyPath: 'id' });
      }

      // Sync queue
      if (!db.objectStoreNames.contains('syncQueue')) {
        const syncStore = db.createObjectStore('syncQueue', { keyPath: 'id' });
        syncStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // Metadata store for last sync times, etc.
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }

      // Stores nuevas (v2) — migración no destructiva: sólo se crean si faltan.
      if (!db.objectStoreNames.contains('pos_sessions')) {
        db.createObjectStore('pos_sessions', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('open_checks')) {
        db.createObjectStore('open_checks', { keyPath: 'id' });
      }

      // Stores nuevas (v3) — albaranes, devoluciones y abonos (offline-first).
      for (const storeName of [
        'albaranes',
        'albaran_line_items',
        'devoluciones',
        'devolucion_line_items',
        'abonos',
        'abono_aplicaciones',
      ]) {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: 'id' });
        }
      }

      // Store nueva (v4) — plantillas de documento. Guardarlas en local es lo
      // que permite descargar el PDF de una factura sin conexión: el diseño
      // ya está en el dispositivo.
      if (!db.objectStoreNames.contains('document_templates')) {
        db.createObjectStore('document_templates', { keyPath: 'id' });
      }

      // Store nueva (v5) — vendedores
      if (!db.objectStoreNames.contains('vendedores')) {
        db.createObjectStore('vendedores', { keyPath: 'id' });
      }

      // Stores nuevas (v6) — almacenes, traspasos, regularizaciones
      for (const storeName of [
        'almacenes',
        'traspasos',
        'traspaso_line_items',
        'regularizaciones_stock',
      ]) {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: 'id' });
        }
      }

      // Store nueva (v7) — cobros y pagos (tesorería)
      if (!db.objectStoreNames.contains('cobros_pagos')) {
        db.createObjectStore('cobros_pagos', { keyPath: 'id' });
      }

      // Stores nuevas (v8) — gastos y vehículos
      for (const storeName of ['gastos', 'vehiculos']) {
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: 'id' });
        }
      }

      // Store nueva (v9) — obras y expedientes
      if (!db.objectStoreNames.contains('obras')) {
        db.createObjectStore('obras', { keyPath: 'id' });
      }

      // Store nueva (v10) — órdenes de trabajo
      if (!db.objectStoreNames.contains('ordenes_trabajo')) {
        db.createObjectStore('ordenes_trabajo', { keyPath: 'id' });
      }

      // Store nueva (v11) — lotes y trazabilidad
      if (!db.objectStoreNames.contains('lotes')) {
        db.createObjectStore('lotes', { keyPath: 'id' });
      }

      // Store nueva (v12) — rappels por volumen
      if (!db.objectStoreNames.contains('rappels')) {
        db.createObjectStore('rappels', { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result;
      resolve(dbInstance);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

// ============================================================
// GENERIC CRUD HELPERS
// ============================================================

async function getStore(storeName: string, mode: IDBTransactionMode = 'readonly'): Promise<IDBObjectStore> {
  const db = await openDB();
  const tx = db.transaction(storeName, mode);
  return tx.objectStore(storeName);
}

function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ============================================================
// ENTITY OPERATIONS
// ============================================================

export async function getAll<T>(storeName: string): Promise<T[]> {
  const store = await getStore(storeName);
  return promisifyRequest<T[]>(store.getAll());
}

export async function getById<T>(storeName: string, id: string): Promise<T | undefined> {
  const store = await getStore(storeName);
  const result = await promisifyRequest<T | undefined>(store.get(id));
  return result;
}

export async function put<T>(storeName: string, data: T): Promise<void> {
  const store = await getStore(storeName, 'readwrite');
  await promisifyRequest(store.put(data));
}

export async function putMany<T>(storeName: string, items: T[]): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);
  for (const item of items) {
    store.put(item);
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function remove(storeName: string, id: string): Promise<void> {
  const store = await getStore(storeName, 'readwrite');
  await promisifyRequest(store.delete(id));
}

const ALL_STORE_NAMES = ['invoices', 'clients', 'products', 'settings', 'userProfiles', 'syncQueue', 'meta', 'pos_sessions', 'open_checks', 'albaranes', 'albaran_line_items', 'devoluciones', 'devolucion_line_items', 'abonos', 'abono_aplicaciones', 'document_templates'];

/**
 * Limpia toda la caché local de IndexedDB. Se llama al cerrar sesión para
 * que un dispositivo compartido entre varias empresas no siga mostrando
 * datos de la sesión anterior mientras está offline.
 */
export async function clearOfflineCache(): Promise<void> {
  await Promise.all(ALL_STORE_NAMES.map(name => clearStore(name)));
}

export async function clearStore(storeName: string): Promise<void> {
  const store = await getStore(storeName, 'readwrite');
  await promisifyRequest(store.clear());
}

// ============================================================
// SYNC QUEUE OPERATIONS
// ============================================================

export async function enqueueSyncAction(
  action: SyncAction,
  table: SyncTable,
  data: Record<string, unknown>,
): Promise<void> {
  const item: SyncQueueItem = {
    id: `${table}_${data.id || 'settings'}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    action,
    table,
    data,
    timestamp: Date.now(),
    retries: 0,
  };
  await put('syncQueue', item);
}

export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  const db = await openDB();
  const tx = db.transaction('syncQueue', 'readonly');
  const store = tx.objectStore('syncQueue');
  const index = store.index('timestamp');
  return promisifyRequest<SyncQueueItem[]>(index.getAll());
}

export async function removeSyncItem(id: string): Promise<void> {
  await remove('syncQueue', id);
}

export async function updateSyncItem(item: SyncQueueItem): Promise<void> {
  await put('syncQueue', item);
}

export async function getSyncQueueCount(): Promise<number> {
  const store = await getStore('syncQueue');
  return promisifyRequest<number>(store.count());
}

// ============================================================
// METADATA (last sync, etc.)
// ============================================================

export async function getMeta(key: string): Promise<unknown | undefined> {
  const store = await getStore('meta');
  const result = await promisifyRequest<{ key: string; value: unknown } | undefined>(store.get(key));
  return result?.value;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await put('meta', { key, value });
}

// ============================================================
// DEVICE SUFFIX (numeración offline)
// ============================================================

let cachedDeviceSuffix: string | null = null;

/**
 * Sufijo corto y estable por dispositivo (4 caracteres, ej. `F3K2`), usado
 * para numerar tickets offline sin colisionar entre varias cajas: el número
 * es SERIE-AÑO-0000-SUFIJO. El servidor lo descarta al renumerar si el
 * correlativo ya lo ocupa otro dispositivo. Se persiste en `meta` para que
 * todas las ventas offline del mismo terminal compartan sufijo.
 */
export async function getDeviceSuffix(): Promise<string> {
  if (cachedDeviceSuffix) return cachedDeviceSuffix;
  const existing = await getMeta('deviceSuffix');
  if (typeof existing === 'string' && existing) {
    cachedDeviceSuffix = existing;
    return existing;
  }
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  await setMeta('deviceSuffix', suffix);
  cachedDeviceSuffix = suffix;
  return suffix;
}

// ============================================================
// FULL DB INIT CHECK
// ============================================================

export async function isOfflineDbAvailable(): Promise<boolean> {
  try {
    if (typeof indexedDB === 'undefined') return false;
    await openDB();
    return true;
  } catch {
    return false;
  }
}
