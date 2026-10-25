import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';

type Row = Record<string, unknown>;
const local = new Map<string, Row>();
vi.mock('@/lib/offlineDb', () => ({
  getAll: vi.fn(async () => []),
  getById: vi.fn(async (_s: string, id: string) => local.get(id)),
  put: vi.fn(async (_s: string, row: Row) => { local.set(String(row.id), row); }),
  putMany: vi.fn(async () => {}),
  remove: vi.fn(async () => {}),
  clearStore: vi.fn(async () => {}),
  enqueueSyncAction: vi.fn(async () => {}),
  isOfflineDbAvailable: vi.fn(async () => true),
  getMeta: vi.fn(async () => null),
  setMeta: vi.fn(async () => {}),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(),
}));

import { createClient } from '@/lib/supabase/client';
import { issueInvoice, EMISION_SIN_CONEXION } from './storage';
import { enqueueSyncAction, put } from '@/lib/offlineDb';
import { Invoice, InvoiceStatus, PaymentMethod, TaxRate, UnitOfMeasure } from './types';

type Store = Record<string, Row[]>;

interface ChainResult {
  data: unknown;
  error: null;
}

interface FakeChain {
  select: () => FakeChain;
  eq: () => FakeChain;
  in: () => FakeChain;
  order: () => FakeChain;
  limit: () => FakeChain;
  range: (desde: number, hasta: number) => Promise<ChainResult>;
  maybeSingle: () => Promise<{ data: Row | null; error: null }>;
  is: () => FakeChain;
  not: () => FakeChain;
  single: () => Promise<{ data: Row | null; error: null }>;
  upsert: (row: Row) => Promise<{ data: null; error: null }>;
  insert: () => Promise<{ data: null; error: null }>;
  delete: () => FakeChain;
  then: (resolve: (v: ChainResult) => unknown) => unknown;
}

/** Lo que la emisión exige de quien emite: NIF bueno, nombre y domicilio. */
const AJUSTES_EMPRESA: Row = {
  user_id: 'u1', business_name: 'Emisora Test S.A.', nif: 'A12345674', address: 'Calle Mayor 1', city: 'Madrid',
  invoice_series: 'FAC', next_invoice_number: 1,
};

let rechazarEmision = false;
function makeSupabase(store: Store) {
  store.company_settings ??= [AJUSTES_EMPRESA];
  const chain = (table: string): FakeChain => {
    const rows = () => store[table] ?? [];
    const obj: FakeChain = {
      select: () => obj,
      eq: () => obj,
      in: () => obj,
      order: () => obj,
      limit: () => obj,
      // Como Supabase: sólo el tramo pedido.
      range: async (desde: number, hasta: number) => ({ data: rows().slice(desde, hasta + 1), error: null }),
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      is: () => obj,
      not: () => obj,
      single: async () => ({ data: rows()[0] ?? null, error: null }),
      upsert: async (row: Row) => {
        if (table === 'invoices' && rechazarEmision && row.status !== 'borrador') {
          return { data: null, error: { code: 'P0001', message: 'SUSCRIPCION: no hay una suscripción activa. Ve a /precios.' } } as never;
        }
        const arr = (store[table] ??= []);
        const idx = arr.findIndex(r => r.id === row.id);
        if (idx >= 0) arr[idx] = { ...arr[idx], ...row };
        else arr.push({ ...row });
        return { data: null, error: null };
      },
      insert: async () => ({ data: null, error: null }),
      delete: () => obj,
      then: (resolve: (v: ChainResult) => unknown) => resolve({ data: rows(), error: null }),
    };
    return obj;
  };
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
    },
    from: (table: string) => chain(table),
  };
}

function buildInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv-1',
    number: 'FAC-2026-0025',
    series: 'FAC',
    clientId: 'c1',
    clientName: 'Cliente Test S.L.',
    clientNif: 'B12345674',
    clientAddress: 'Calle 1, 28000 Madrid',
    issueDate: '2026-01-15',
    dueDate: '2026-02-15',
    status: InvoiceStatus.EMITIDA,
    lineItems: [{
      id: 'li-1',
      productId: 'p1',
      productName: 'Producto',
      productRef: 'P-1',
      quantity: 2,
      unitPrice: 50,
      unit: UnitOfMeasure.UNIDAD,
      taxRate: TaxRate.GENERAL,
      discountPercent: 0,
      subtotal: 100,
      taxAmount: 21,
      total: 121,
    }],
    subtotal: 100,
    totalDiscount: 0,
    taxBreakdown: [{ rate: 21, base: 100, amount: 21 }],
    totalTax: 21,
    total: 121,
    paymentMethod: PaymentMethod.TRANSFERENCIA,
    notes: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function buildInvoiceRow(status: string): Row {
  return {
    id: 'inv-1',
    user_id: 'u1',
    number: 'FAC-2026-0025',
    series: 'FAC',
    client_id: 'c1',
    client_name: 'Cliente Test',
    client_nif: 'B12345678',
    client_address: 'Calle 1, 28000 Madrid',
    issue_date: '2026-01-15',
    due_date: '2026-02-15',
    paid_date: null,
    status,
    subtotal: 100,
    total_discount: 0,
    total_tax: 21,
    total: 121,
    payment_method: 'transferencia',
    notes: '',
    verifactu_hash: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

describe('emisión segura (regresión de la auditoría)', () => {
  beforeEach(() => {
    local.clear();
    rechazarEmision = false;
    vi.mocked(enqueueSyncAction).mockClear();
    vi.mocked(put).mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sin conexión no emite: guarda un borrador local recuperable y lo dice', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    (createClient as Mock).mockReturnValue(makeSupabase({ invoices: [] }));
    await expect(issueInvoice(buildInvoice())).rejects.toThrow(EMISION_SIN_CONEXION);
    const encolados = vi.mocked(enqueueSyncAction).mock.calls.filter(c => c[1] === 'invoices').map(c => c[2].status);
    expect(encolados).toEqual(['borrador']);
    expect(local.get('inv-1')?.status).toBe('borrador');
  });

  it('un ticket del TPV sin conexión no se emite ni se guarda a medias', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    (createClient as Mock).mockReturnValue(makeSupabase({ invoices: [] }));
    await expect(issueInvoice(buildInvoice({ posSessionId: 'caja-1' }))).rejects.toThrow(/Aparca la venta/);
    expect(enqueueSyncAction).not.toHaveBeenCalled();
    expect(local.has('inv-1')).toBe(false);
  });

  it('si el servidor rechaza la emisión (suscripción), avisa y en este equipo NO queda como emitida', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    rechazarEmision = true;
    (createClient as Mock).mockReturnValue(makeSupabase({ invoices: [] }));
    await expect(issueInvoice(buildInvoice())).rejects.toThrow(/suscripci/i);
    const estados = vi.mocked(put).mock.calls.filter(c => c[0] === 'invoices').map(c => (c[1] as Row).status);
    expect(estados).not.toContain('emitida');
    expect(local.get('inv-1')?.status).toBe('borrador');
    expect(enqueueSyncAction).not.toHaveBeenCalled();
  });

  it('con conexión y aceptada, la copia local pasa a emitida DESPUÉS de que el servidor la acepte', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    const store = { invoices: [] as Row[] };
    (createClient as Mock).mockReturnValue(makeSupabase(store));
    await issueInvoice(buildInvoice());
    expect(local.get('inv-1')?.status).toBe('emitida');
    expect(store.invoices.find(r => r.id === 'inv-1')?.status).toBe('emitida');
  });
});
