import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('@/lib/offlineDb', () => ({
  getAll: vi.fn(async () => []),
  getById: vi.fn(async () => null),
  put: vi.fn(async () => {}),
  putMany: vi.fn(async () => {}),
  remove: vi.fn(async () => {}),
  clearStore: vi.fn(async () => {}),
  enqueueSyncAction: vi.fn(async () => {}),
  isOfflineDbAvailable: vi.fn(async () => false),
  getMeta: vi.fn(async () => null),
  setMeta: vi.fn(async () => {}),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(),
}));

import { createClient } from '@/lib/supabase/client';
import { issueInvoice, saveInvoice } from './storage';
import { Invoice, InvoiceStatus, PaymentMethod, TaxRate, UnitOfMeasure } from './types';

type Row = Record<string, unknown>;
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
  is: () => FakeChain;
  not: () => FakeChain;
  single: () => Promise<{ data: Row | null; error: null }>;
  upsert: (row: Row) => Promise<{ data: null; error: null }>;
  insert: () => Promise<{ data: null; error: null }>;
  delete: () => FakeChain;
  then: (resolve: (v: ChainResult) => unknown) => unknown;
}

function makeSupabase(store: Store) {
  const chain = (table: string): FakeChain => {
    const rows = () => store[table] ?? [];
    const obj: FakeChain = {
      select: () => obj,
      eq: () => obj,
      in: () => obj,
      order: () => obj,
      is: () => obj,
      not: () => obj,
      single: async () => ({ data: rows()[0] ?? null, error: null }),
      upsert: async (row: Row) => {
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
    clientName: 'Cliente Test',
    clientNif: 'B12345678',
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

describe('issueInvoice — emisión', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { onLine: true });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('emite aunque el llamador pase EMITIDA como estado objetivo (persistida como borrador)', async () => {
    (createClient as Mock).mockReturnValue(
      makeSupabase({ invoices: [buildInvoiceRow(InvoiceStatus.BORRADOR)] })
    );

    await expect(issueInvoice(buildInvoice())).resolves.toBeDefined();
  });

  it('rechaza emitir cuando la factura ya está sellada en la base de datos', async () => {
    (createClient as Mock).mockReturnValue(
      makeSupabase({ invoices: [buildInvoiceRow(InvoiceStatus.EMITIDA)] })
    );

    await expect(issueInvoice(buildInvoice())).rejects.toThrow(/ya está emitida/);
  });

  it('persiste el número reasignado al emitir (colisión con otra factura)', async () => {
    // Otra factura (borrador) ya ocupa el número FAC-2026-0025.
    const store: Store = {
      invoices: [{ ...buildInvoiceRow(InvoiceStatus.BORRADOR), id: 'inv-0' }],
    };
    (createClient as Mock).mockReturnValue(makeSupabase(store));

    await issueInvoice(buildInvoice({ id: 'inv-1', number: 'FAC-2026-0025' }));

    const mine = store.invoices.find(r => r.id === 'inv-1')!;
    expect(mine).toBeDefined();
    // La emisión debe sellar con el número libre real, no con el previsto.
    expect(mine.number).toBe('FAC-2026-0026');
    expect(mine.status).toBe(InvoiceStatus.EMITIDA);
  });

  it('no re-numera un borrador que ya tiene su número en BD', async () => {
    const store: Store = {
      invoices: [buildInvoiceRow(InvoiceStatus.BORRADOR)],
    };
    (createClient as Mock).mockReturnValue(makeSupabase(store));

    const saved = await saveInvoice(
      buildInvoice({ status: InvoiceStatus.BORRADOR, number: 'FAC-2026-0025' })
    );

    // Re-guardar un borrador existente debe conservar su número: re-numerarlo
    // era la causa del desfase de contador (FAC-2026-0026 previsto → 0033 real).
    expect(saved.number).toBe('FAC-2026-0025');
    expect(store.invoices.find(r => r.id === 'inv-1')!.number).toBe('FAC-2026-0025');
  });
});
