// REGRESIÓN DE LA AUDITORÍA: ninguna factura hecha en este equipo se pierde
// por un rechazo del servidor, una descarga completa, cerrar sesión, una
// sesión revocada o que entre otra cuenta. Con IndexedDB de verdad
// (fake-indexeddb), no con la base local simulada.
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = Record<string, unknown>;
let usuario: string | null = 'u1';

// Servidor: índice único (user_id, series, number) también para borradores,
// como uq_invoices_user_series_number en producción.
let servidor: Record<string, Row[]>;
function chain(table: string) {
  const filtros: Array<(r: Row) => boolean> = [];
  let modo: 'select' | 'delete' = 'select';
  const filas = () => (servidor[table] ?? []).filter(r => filtros.every(f => f(r)));
  const q: Record<string, unknown> = {
    select: () => q, order: () => q, limit: () => q, range: () => q,
    eq: (c: string, v: unknown) => { filtros.push(r => r[c] === v); return q; },
    in: (c: string, v: unknown[]) => { filtros.push(r => v.includes(r[c])); return q; },
    maybeSingle: async () => ({ data: filas()[0] ?? null, error: null }),
    delete: () => { modo = 'delete'; return q; },
    upsert: async (row: Row) => {
      if (table === 'invoices' && servidor.invoices.some(r => r.id !== row.id && r.series === row.series && r.number === row.number)) {
        return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "uq_invoices_user_series_number"' } };
      }
      const arr = (servidor[table] ??= []); const i = arr.findIndex(r => r.id === row.id);
      if (i >= 0) arr[i] = { ...arr[i], ...row }; else arr.push({ ...row });
      return { data: null, error: null };
    },
    then: (res: (v: { data: Row[]; error: null }) => unknown) => {
      if (modo === 'delete') { servidor[table] = (servidor[table] ?? []).filter(r => !filtros.every(f => f(r))); return res({ data: [], error: null }); }
      return res({ data: filas(), error: null });
    },
  };
  return q;
}
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (t: string) => chain(t),
    auth: {
      getSession: async () => ({ data: { session: usuario ? { user: { id: usuario } } : null } }),
      mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: 'aal1', nextLevel: 'aal1' } }) },
    },
  }),
}));

import * as db from './offlineDb';
import { processSyncQueue, fullDownloadToOffline } from './syncEngine';

async function nuevaBase() {
  // Una base nueva por prueba: se borra la anterior.
  db._olvidarDuenioComprobado();
  const { IDBFactory } = await import('fake-indexeddb');
  globalThis.indexedDB = new IDBFactory();
  db._cerrarParaPruebas();
}

/** Una factura emitida en este equipo (con su línea), como la deja saveInvoice. */
async function facturaLocal(id: string, numero: string) {
  const fila = { id, user_id: 'u1', series: 'F', number: numero, status: 'emitida', issue_date: '2026-10-20', total: 121 };
  await db.put('invoices', { ...fila, _lineItems: [{ id: `${id}-l1` }] });
  await db.enqueueSyncAction('upsert', 'invoice_line_items', { id: `${id}-l1`, invoice_id: id, quantity: 1, total: 121 });
  await db.enqueueSyncAction('upsert', 'invoices', fila);
}

beforeEach(async () => {
  usuario = 'u1';
  servidor = {
    invoices: [{ id: 'del-portatil', user_id: 'u1', series: 'F', number: 'F-2026-0101', status: 'emitida', sealed_at: '2026-10-20', issue_date: '2026-10-20' }],
    invoice_line_items: [], invoice_tax_breakdown: [], clients: [], products: [], company_settings: [],
  };
  vi.stubGlobal('navigator', { onLine: true });
  await nuevaBase();
});

describe('sin pérdidas de facturas', () => {
  it('número repetido: la factura pasa a la bandeja con su línea y la descarga completa no la borra del equipo', async () => {
    await facturaLocal('del-sobremesa', 'F-2026-0101');

    await processSyncQueue();
    expect(await db.getSyncQueue()).toHaveLength(0);
    const bandeja = await db.getSyncErrores();
    expect(bandeja).toHaveLength(1);
    expect(bandeja[0].item.data).toMatchObject({ id: 'del-sobremesa', number: 'F-2026-0101', total: 121 });
    expect(bandeja[0].hijos.map(h => h.data.id)).toEqual(['del-sobremesa-l1']);
    expect(bandeja[0].codigo).toBe('23505');

    await fullDownloadToOffline();
    expect(await db.getById('invoices', 'del-sobremesa')).toBeTruthy();
    // Lo del servidor también llega.
    expect(await db.getById('invoices', 'del-portatil')).toBeTruthy();
  });

  it('reintentar devuelve la factura entera a la cola; descartar es lo único que la quita', async () => {
    await facturaLocal('del-sobremesa', 'F-2026-0101');
    await processSyncQueue();
    const [e] = await db.getSyncErrores();

    await db.reintentarError(e.id);
    expect(await db.getSyncErrores()).toHaveLength(0);
    expect((await db.getSyncQueue()).map(i => i.table).sort()).toEqual(['invoice_line_items', 'invoices']);

    await processSyncQueue();
    const [otra] = await db.getSyncErrores();
    await db.descartarError(otra.id);
    expect(await db.getSyncErrores()).toHaveLength(0);
  });

  it('con pendientes, la descarga completa no vacía: lo local sin subir se queda', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    await facturaLocal('sin-subir', 'F-2026-0200');
    vi.stubGlobal('navigator', { onLine: true });
    await fullDownloadToOffline();
    expect(await db.getById('invoices', 'sin-subir')).toBeTruthy();
    expect(await db.getSyncQueueCount()).toBe(2);
  });

  it('cerrar sesión o revocarla vacía la caché pero NO la cola ni la bandeja', async () => {
    await facturaLocal('pendiente', 'F-2026-0300');
    await db.clearOfflineCache();
    expect(await db.getById('invoices', 'pendiente')).toBeUndefined();
    expect(await db.getSyncQueueCount()).toBe(2);
  });

  it('si entra otra cuenta: no ve ni sube lo de la anterior, y al volver la anterior sigue ahí', async () => {
    await facturaLocal('de-u1', 'F-2026-0400');
    usuario = 'u2';
    db._olvidarDuenioComprobado();
    expect(await db.getSyncQueueCount()).toBe(0);
    await processSyncQueue();
    expect(servidor.invoices.some(r => r.id === 'de-u1')).toBe(false);

    usuario = 'u1';
    db._olvidarDuenioComprobado();
    expect(await db.getSyncQueueCount()).toBe(2);
    await processSyncQueue();
    expect(servidor.invoices.find(r => r.id === 'de-u1')).toMatchObject({ number: 'F-2026-0400', status: 'emitida' });
  });

  it('un borrador con número repetido se renumera solo (no es fiscal) y la copia local se actualiza', async () => {
    const fila = { id: 'borr', user_id: 'u1', series: 'F', number: 'F-2026-0101', status: 'borrador', issue_date: '2026-10-20', total: 10 };
    await db.put('invoices', fila);
    await db.enqueueSyncAction('upsert', 'invoices', fila);
    await processSyncQueue();
    expect(await db.getSyncErrores()).toHaveLength(0);
    expect(servidor.invoices.find(r => r.id === 'borr')?.number).toBe('F-2026-0102');
    expect((await db.getById<Row>('invoices', 'borr'))?.number).toBe('F-2026-0102');
  });

  it('un albarán (no fiscal) con número repetido también se renumera', async () => {
    servidor.invoices.push({ id: 'alb-otro', user_id: 'u1', series: 'ALB', number: 'ALB-2026-0005', status: 'expedido', tipo: 'albaran' });
    const fila = { id: 'alb-mio', user_id: 'u1', series: 'ALB', number: 'ALB-2026-0005', status: 'expedido', tipo: 'albaran', issue_date: '2026-10-20', total: 10 };
    await db.enqueueSyncAction('upsert', 'invoices', fila);
    await processSyncQueue();
    expect(servidor.invoices.find(r => r.id === 'alb-mio')?.number).toBe('ALB-2026-0006');
  });
});
