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
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(),
}));

import { createClient } from '@/lib/supabase/client';
import { convertirAlbaranesAFactura, expedirAlbaran, createDevolucion, applyAbonoToInvoice } from './storage';
import { DEFAULT_COMPANY_SETTINGS } from './constants';
import { Devolucion, DevolucionReason, InvoiceStatus, TaxRate, UnitOfMeasure } from './types';

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
  limit: () => FakeChain;
  single: () => Promise<{ data: Row | null; error: null }>;
  maybeSingle: () => Promise<{ data: Row | null; error: null }>;
  upsert: (row: Row) => Promise<{ data: null; error: null }>;
  insert: (rows?: Row | Row[]) => Promise<{ data: null; error: null }>;
  delete: () => FakeChain;
  rpc: (fn: string, args: Row) => Promise<{ data: number | null; error: null }>;
  then: (resolve: (v: ChainResult) => unknown) => unknown;
}

function makeSupabase(store: Store, rpcCalls: Array<{ fn: string; args: Row }> = []) {
  const chain = (table: string): FakeChain => {
    const rows = () => store[table] ?? [];
    const obj: FakeChain = {
      select: () => obj,
      eq: () => obj,
      in: () => obj,
      order: () => obj,
      limit: () => obj,
      single: async () => ({ data: rows()[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
  upsert: async (row: Row) => {
    const arr = (store[table] ??= []);
    const idx = arr.findIndex(r => r.id === row.id);
    if (idx >= 0) arr[idx] = { ...arr[idx], ...row };
    else arr.push({ ...row });
    return { data: null, error: null };
  },
  insert: async (rows?: Row | Row[]) => {
    const arr = (store[table] ??= []);
    if (Array.isArray(rows)) arr.push(...rows);
    else if (rows) arr.push(rows);
    return { data: null, error: null };
  },
      delete: () => obj,
      rpc: async (fn: string, args: Row) => {
        rpcCalls.push({ fn, args });
        return { data: 42, error: null };
      },
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
    rpc: async (fn: string, args: Row) => {
      rpcCalls.push({ fn, args });
      return { data: 42, error: null };
    },
  };
}

function lineRow(albaranId: string, sort: number, qty = 2, price = 50): Row {
  return {
    id: `li-${albaranId}-${sort}`,
    albaran_id: albaranId,
    product_id: `p-${sort}`,
    product_name: `Producto ${sort}`,
    product_ref: `P-${sort}`,
    quantity: qty,
    unit_price: price,
    unit: UnitOfMeasure.UNIDAD,
    tax_rate: TaxRate.GENERAL,
    discount_percent: 0,
    subtotal: qty * price,
    tax_amount: qty * price * 0.21,
    total: qty * price * 1.21,
    sort_order: sort,
  };
}

function albaranRow(id: string, clientId: string, status = 'expedido'): Row {
  return {
    id,
    user_id: 'u1',
    number: `ALB-2026-000${id.slice(-1)}`,
    series: 'ALB',
    client_id: clientId,
    client_name: clientId === 'c1' ? 'Cliente Uno' : 'Cliente Dos',
    client_nif: 'B12345678',
    client_address: 'Calle 1',
    issue_date: '2026-01-10',
    status,
    subtotal: 100,
    total_discount: 0,
    total_tax: 21,
    total: 121,
    notes: '',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

function devolucion(overrides: Partial<Devolucion> = {}): Devolucion {
  return {
    id: 'dev-1',
    number: 'DEV-2026-0001',
    series: 'DEV',
    origin: 'manual',
    clientId: 'c1',
    clientName: 'Cliente Uno',
    clientNif: 'B12345678',
    issueDate: '2026-01-20',
    reason: 'defecto' as DevolucionReason,
    reasonNote: '',
    status: 'registrada',
    lineItems: [{
      id: 'dli-1',
      productId: 'p-1',
      productName: 'Producto 1',
      productRef: 'P-1',
      quantity: 3,
      unitPrice: 10,
      unit: UnitOfMeasure.UNIDAD,
      taxRate: TaxRate.GENERAL,
      total: 30,
      restock: true,
    }],
    total: 30,
    notes: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const year = new Date().getFullYear();

describe('Albaranes', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { onLine: true });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('expide el albarán, lo persiste y descuenta stock por línea', async () => {
    const rpcCalls: Array<{ fn: string; args: Row }> = [];
    const store: Store = {
      albaranes: [albaranRow('a1', 'c1', 'borrador')],
      albaran_line_items: [lineRow('a1', 1, 2, 50)],
    };
    (createClient as Mock).mockReturnValue(makeSupabase(store, rpcCalls));

    const result = await expedirAlbaran('a1');

    expect(result.status).toBe('expedido');
    expect(store.albaranes[0].status).toBe('expedido');
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].fn).toBe('fn_pos_adjust_stock');
    expect(rpcCalls[0].args).toMatchObject({ p_product_id: 'p-1', p_delta: -2 });
  });

  it('agrupa albaranes expedidos por cliente en facturas borrador', async () => {
    const store: Store = {
      albaranes: [
        albaranRow('a1', 'c1'),
        albaranRow('a2', 'c1'),
        albaranRow('a3', 'c2'),
      ],
      albaran_line_items: [
        lineRow('a1', 1),
        lineRow('a2', 1),
        lineRow('a3', 1),
      ],
    };
    (createClient as Mock).mockReturnValue(makeSupabase(store));

    const invoices = await convertirAlbaranesAFactura(['a1', 'a2', 'a3']);

    expect(invoices).toHaveLength(2);
    expect(new Set(invoices.map(i => i.clientId))).toEqual(new Set(['c1', 'c2']));
    expect(invoices.every(i => i.status === InvoiceStatus.BORRADOR)).toBe(true);

    const facturas = store.invoices;
    expect(facturas).toHaveLength(2);
    const base = DEFAULT_COMPANY_SETTINGS.nextInvoiceNumber;
    expect(facturas.map(f => f.number)).toEqual([`FAC-${year}-${String(base).padStart(4, '0')}`, `FAC-${year}-${String(base + 1).padStart(4, '0')}`]);

    const a1 = store.albaranes.find(a => a.id === 'a1')!;
    const a2 = store.albaranes.find(a => a.id === 'a2')!;
    const a3 = store.albaranes.find(a => a.id === 'a3')!;
    expect(a1.status).toBe('facturado');
    expect(a2.status).toBe('facturado');
    expect(a3.status).toBe('facturado');
    expect(a1.invoice_id).toBe(a2.invoice_id);
    expect(a3.invoice_id).not.toBe(a1.invoice_id);

    const settings = store.company_settings[0];
    expect(settings.next_invoice_number).toBe(base + 2);
  });

  it('rechaza convertir cuando no hay albaranes expedidos en la selección', async () => {
    const store: Store = {
      albaranes: [albaranRow('a1', 'c1', 'borrador')],
      albaran_line_items: [lineRow('a1', 1)],
    };
    (createClient as Mock).mockReturnValue(makeSupabase(store));

    await expect(convertirAlbaranesAFactura(['a1'])).rejects.toThrow(/expedidos/);
  });
});

describe('Devoluciones', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { onLine: true });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('registra la devolución y genera el abono con numeración propia', async () => {
    const store: Store = {};
    (createClient as Mock).mockReturnValue(makeSupabase(store));

    const final = await createDevolucion(devolucion(), { restock: false, generateAbono: true });

    expect(final.status).toBe('abonada');
    expect(final.abonoId).toBeDefined();
    expect(store.abonos).toHaveLength(1);
    expect(store.abonos[0].number).toBe(`ABO-${year}-0001`);
    expect(store.abonos[0].total).toBe(30);
    expect(store.abonos[0].devolucion_id).toBe('dev-1');
    expect(store.devoluciones[0].status).toBe('abonada');
    expect(store.company_settings[0].next_abono_number).toBe(2);
  });

  it('reponer stock llama al RPC de ajuste con delta positivo', async () => {
    const rpcCalls: Array<{ fn: string; args: Row }> = [];
    const store: Store = {};
    (createClient as Mock).mockReturnValue(makeSupabase(store, rpcCalls));

    await createDevolucion(devolucion(), { restock: true, generateAbono: false });

    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].args).toMatchObject({ p_product_id: 'p-1', p_delta: 3 });
  });
});

describe('Abonos', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { onLine: true });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function abonoRow(used: number, status: string): Row {
    return {
      id: 'ab-1',
      user_id: 'u1',
      number: 'ABO-2026-0001',
      series: 'ABO',
      client_id: 'c1',
      client_name: 'Cliente Uno',
      client_nif: 'B12345678',
      issue_date: '2026-01-20',
      total: 100,
      used_amount: used,
      status,
      reason: 'Abono de la devolución',
      notes: '',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    };
  }

  it('aplica un abono a una factura y pasa a parcial', async () => {
    const store: Store = { abonos: [abonoRow(0, 'emitido')] };
    (createClient as Mock).mockReturnValue(makeSupabase(store));

    await applyAbonoToInvoice('ab-1', 'inv-1', 'FAC-2026-0040', 60);

    expect(store.abono_aplicaciones).toHaveLength(1);
    expect(store.abono_aplicaciones[0]).toMatchObject({ abono_id: 'ab-1', invoice_id: 'inv-1', amount: 60 });
    expect(store.abonos[0].used_amount).toBe(60);
    expect(store.abonos[0].status).toBe('parcial');
  });

  it('marca el abono como usado cuando cubre todo el importe', async () => {
    const store: Store = { abonos: [abonoRow(60, 'parcial')] };
    (createClient as Mock).mockReturnValue(makeSupabase(store));

    await applyAbonoToInvoice('ab-1', 'inv-1', 'FAC-2026-0040', 40);

    expect(store.abonos[0].used_amount).toBe(100);
    expect(store.abonos[0].status).toBe('usado');
  });

  it('rechaza aplicar más de lo disponible', async () => {
    const store: Store = { abonos: [abonoRow(80, 'parcial')] };
    (createClient as Mock).mockReturnValue(makeSupabase(store));

    await expect(applyAbonoToInvoice('ab-1', 'inv-1', 'FAC-2026-0040', 50)).rejects.toThrow(/sólo tiene/);
  });

  it('rechaza aplicar un abono anulado', async () => {
    const store: Store = { abonos: [abonoRow(0, 'anulado')] };
    (createClient as Mock).mockReturnValue(makeSupabase(store));

    await expect(applyAbonoToInvoice('ab-1', 'inv-1', 'FAC-2026-0040', 10)).rejects.toThrow(/anulado/);
  });
});
