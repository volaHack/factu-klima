import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('@/lib/offlineDb', () => ({
  getSyncQueue: vi.fn(async () => []),
  removeSyncItem: vi.fn(async () => {}),
  updateSyncItem: vi.fn(async () => {}),
  getSyncQueueCount: vi.fn(async () => 0),
  setMeta: vi.fn(async () => {}),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(),
}));

import { createClient } from '@/lib/supabase/client';
import {
  getSyncQueue,
  removeSyncItem,
  updateSyncItem,
  getSyncQueueCount,
  setMeta,
} from './offlineDb';
import { processSyncQueue, getSyncState, clearSyncRejections } from './syncEngine';

type Row = Record<string, unknown>;

interface RecordedCall {
  table: string;
  method: string;
  args: unknown[];
}

interface FakeChain {
  select: (cols: string) => FakeChain;
  eq: (col: string, val: unknown) => FakeChain;
  maybeSingle: () => Promise<{ data: Row | null; error: null }>;
  upsert: (row: Row) => Promise<{ data: null; error: { code: string; message: string } | null }>;
  update: (row: Row) => FakeChain & { then: FakeChain['then'] };
  insert: (rows: Row[]) => Promise<{ data: null; error: null }>;
  delete: () => FakeChain;
  then: (resolve: (v: { data: Row[]; error: null }) => unknown) => unknown;
}

function makeSupabase(
  initial: { invoices?: Row[]; invoice_line_items?: Row[]; invoice_tax_breakdown?: Row[] } = {},
  failIf?: (table: string, row: Row) => boolean,
) {
  const store: Record<string, Row[]> = {
    invoices: [...(initial.invoices ?? [])],
    invoice_line_items: [...(initial.invoice_line_items ?? [])],
    invoice_tax_breakdown: [...(initial.invoice_tax_breakdown ?? [])],
  };
  const calls: RecordedCall[] = [];
  const record = (table: string, method: string, args: unknown[]) => calls.push({ table, method, args });

  const chain = (table: string): FakeChain => {
    const filters: Array<[string, unknown]> = [];
    const applyFilters = (rows: Row[]) =>
      filters.length === 0
        ? rows
        : rows.filter(r => filters.every(([c, v]) => r[c] === v));

    const obj: FakeChain = {
      select: (cols) => { record(table, 'select', [cols]); return obj; },
      eq: (col, val) => { record(table, 'eq', [col, val]); filters.push([col, val]); return obj; },
      maybeSingle: async () => {
        record(table, 'maybeSingle', []);
        const rows = applyFilters(store[table] ?? []);
        return { data: rows[0] ?? null, error: null };
      },
      upsert: async (row) => {
        record(table, 'upsert', [row]);
        if (failIf?.(table, row)) {
          return { data: null, error: { code: '23514', message: 'ANTIFRAUDE: no se puede emitir la factura sin líneas.' } };
        }
        const arr = (store[table] ??= []);
        const idx = arr.findIndex(r => r.id === row.id);
        if (idx >= 0) arr[idx] = { ...arr[idx], ...row };
        else arr.push({ ...row });
        return { data: null, error: null };
      },
      update: (row) => {
        record(table, 'update', [row]);
        const arr = (store[table] ??= []);
        for (const existente of applyFilters(arr)) Object.assign(existente, row);
        return obj as FakeChain & { then: FakeChain['then'] };
      },
      insert: async (rows) => {
        record(table, 'insert', [rows]);
        const arr = (store[table] ??= []);
        arr.push(...rows);
        return { data: null, error: null };
      },
      delete: () => { record(table, 'delete', []); return obj; },
      then: (resolve) => {
        store[table] = filters.length > 0
          ? (store[table] ?? []).filter(r => !filters.every(([c, v]) => r[c] === v))
          : [];
        return resolve({ data: [], error: null });
      },
    };
    return obj;
  };

  return {
    from: (table: string) => chain(table),
    calls,
    store,
  };
}

function invoiceItem(id: string, status: string): Row {
  return {
    id,
    user_id: 'u1',
    number: status === 'borrador' ? 'TPV-2026-0001-F3K2' : 'TPV-2026-0001',
    series: 'TPV',
    status,
  };
}

function lineItem(invoiceId: string): Row {
  return { id: 'li-1', invoice_id: invoiceId, product_name: 'Prod', quantity: 2, unit_price: 5, total: 10 };
}

function taxRow(invoiceId: string, rate = 21): Row {
  return { invoice_id: invoiceId, rate, base_amount: 100, tax_amount: 21 };
}

function queueItem(table: string, data: Row, suffix = 'a'): { id: string; action: 'upsert'; table: string; data: Row; timestamp: number; retries: number } {
  return { id: `${table}_${data.id || 'x'}_${suffix}`, action: 'upsert', table, data, timestamp: 1, retries: 0 };
}

describe('syncEngine — facturas por grupo (padre→líneas→sellado)', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { onLine: true });
    vi.mocked(getSyncQueue).mockReset();
    vi.mocked(getSyncQueueCount).mockReset();
    vi.mocked(removeSyncItem).mockReset();
    vi.mocked(updateSyncItem).mockReset();
    vi.mocked(setMeta).mockReset();
    clearSyncRejections();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sincroniza un ticket offline completo en el orden borrador→líneas→emitida', async () => {
    const invoiceId = 'inv-1';
    const queue = [
      queueItem('invoices', invoiceItem(invoiceId, 'borrador')),
      queueItem('invoice_line_items', lineItem(invoiceId)),
      queueItem('invoice_tax_breakdown', taxRow(invoiceId)),
      queueItem('invoices', invoiceItem(invoiceId, 'emitida'), 'b'),
    ];
    vi.mocked(getSyncQueue).mockResolvedValue(queue as never);

    const supabase = makeSupabase();
    (createClient as Mock).mockReturnValue(supabase);

    await processSyncQueue();

    const invUpserts = supabase.calls.filter(c => c.method === 'upsert' && c.table === 'invoices');
    expect(invUpserts.map(c => (c.args[0] as Row).status)).toEqual(['borrador', 'borrador', 'emitida']);

    const liUpserts = supabase.calls.filter(c => c.method === 'upsert' && c.table === 'invoice_line_items');
    const taxUpserts = supabase.calls.filter(c => c.method === 'upsert' && c.table === 'invoice_tax_breakdown');
    expect(liUpserts).toHaveLength(1);
    expect(taxUpserts).toHaveLength(1);

    // Las líneas se reescriben (delete + upsert) antes del sellado final.
    const deleteIdx = supabase.calls.findIndex(c => c.method === 'delete' && c.table === 'invoice_line_items');
    const finalSealIdx = supabase.calls.findIndex(
      c => c.method === 'upsert' && c.table === 'invoices' && (c.args[0] as Row).status === 'emitida',
    );
    expect(deleteIdx).toBeGreaterThan(-1);
    expect(finalSealIdx).toBeGreaterThan(deleteIdx);

    // Todo lo de la cola se marca como procesado y no quedan rechazos.
    const removed = (removeSyncItem as Mock).mock.calls.map(c => c[0]);
    expect(removed).toHaveLength(queue.length);
    expect(getSyncState().rejections).toEqual([]);
    expect(getSyncState().lastError).toBeNull();
  });

  it('saca de la cola la factura y sus hijos cuando el sellado falla (rechazo permanente visible)', async () => {
    const invoiceId = 'inv-1';
    const queue = [
      queueItem('invoices', invoiceItem(invoiceId, 'borrador')),
      queueItem('invoice_line_items', lineItem(invoiceId)),
      queueItem('invoice_tax_breakdown', taxRow(invoiceId)),
      queueItem('invoices', invoiceItem(invoiceId, 'emitida'), 'b'),
    ];
    vi.mocked(getSyncQueue).mockResolvedValue(queue as never);

    const supabase = makeSupabase({}, (_table, row) => row.status === 'emitida');
    (createClient as Mock).mockReturnValue(supabase);

    await processSyncQueue();

    const removed = (removeSyncItem as Mock).mock.calls.map(c => c[0]);
    expect(removed).toHaveLength(queue.length);
    expect(getSyncState().rejections.length).toBeGreaterThan(0);
  });

  it('descarta items obsoletos cuando la factura ya está sellada en el servidor', async () => {
    const invoiceId = 'inv-1';
    const queue = [
      queueItem('invoices', invoiceItem(invoiceId, 'emitida')),
      queueItem('invoice_line_items', lineItem(invoiceId)),
    ];
    vi.mocked(getSyncQueue).mockResolvedValue(queue as never);

    const supabase = makeSupabase({ invoices: [{ id: invoiceId, sealed_at: '2026-01-01T00:00:00Z' }] });
    (createClient as Mock).mockReturnValue(supabase);

    await processSyncQueue();

    const upserts = supabase.calls.filter(c => c.method === 'upsert');
    expect(upserts).toHaveLength(0);

    const removed = (removeSyncItem as Mock).mock.calls.map(c => c[0]);
    expect(removed).toHaveLength(queue.length);
    expect(getSyncState().rejections).toEqual([]);
  });

  it('de una factura sellada sube lo cobrado, aunque lo demás se descarte', async () => {
    // Cobrar una factura no es modificarla: lo que se selló es el contenido
    // fiscal, no si el cliente ha pagado. Tirando la cola entera, el cobro se
    // quedaba anotado en el móvil y la factura eternamente pendiente en el
    // servidor.
    const invoiceId = 'inv-1';
    const cobrada = { ...invoiceItem(invoiceId, 'pagada'), paid_amount: 121, paid_date: '2026-06-01' };
    const queue = [
      queueItem('invoices', cobrada),
      queueItem('invoice_line_items', lineItem(invoiceId)),
    ];
    vi.mocked(getSyncQueue).mockResolvedValue(queue as never);

    const supabase = makeSupabase({ invoices: [{ id: invoiceId, sealed_at: '2026-01-01T00:00:00Z' }] });
    (createClient as Mock).mockReturnValue(supabase);

    await processSyncQueue();

    const updates = supabase.calls.filter(c => c.method === 'update');
    expect(updates).toHaveLength(1);
    expect(updates[0].args[0]).toEqual({
      paid_amount: 121,
      paid_date: '2026-06-01',
      status: 'pagada',
    });

    // Las líneas y el contenido fiscal, ni tocarlos.
    expect(supabase.calls.filter(c => c.method === 'upsert')).toHaveLength(0);
    expect(supabase.calls.filter(c => c.table === 'invoice_line_items' && c.method === 'insert')).toHaveLength(0);
    expect(getSyncState().rejections).toEqual([]);
  });

  it('no duplica el desglose de impuestos aunque la cola traiga dos filas idénticas', async () => {
    const invoiceId = 'inv-1';
    const queue = [
      queueItem('invoices', invoiceItem(invoiceId, 'borrador')),
      queueItem('invoice_line_items', lineItem(invoiceId)),
      queueItem('invoice_tax_breakdown', taxRow(invoiceId), 'a'),
      queueItem('invoice_tax_breakdown', taxRow(invoiceId), 'b'),
    ];
    vi.mocked(getSyncQueue).mockResolvedValue(queue as never);

    const supabase = makeSupabase();
    (createClient as Mock).mockReturnValue(supabase);

    await processSyncQueue();

    const taxUpserts = supabase.calls.filter(c => c.method === 'upsert' && c.table === 'invoice_tax_breakdown');
    expect(taxUpserts).toHaveLength(1);
  });

  it('no procesa nada cuando la cola está vacía', async () => {
    vi.mocked(getSyncQueue).mockResolvedValue([] as never);
    vi.mocked(getSyncQueueCount).mockResolvedValue(0);

    const supabase = makeSupabase();
    (createClient as Mock).mockReturnValue(supabase);

    await processSyncQueue();

    expect(supabase.calls).toHaveLength(0);
  });
});
