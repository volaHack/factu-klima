/**
 * El flujo entero de facturar albaranes, con la base de datos de mentira
 * pero con sus filtros de verdad (eq, in, is, update condicionado): lo que
 * se prueba aquí es justo lo que depende de qué filas toca cada consulta.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';

// La base de datos local: en memoria, y sólo «disponible» cuando la
// prueba lo pide (sin conexión).
const local = vi.hoisted(() => ({
  disponible: false,
  tablas: {} as Record<string, Map<string, Record<string, unknown>>>,
  cola: [] as Array<{ action: string; table: string; data: Record<string, unknown> }>,
}));
const tablaLocal = (t: string) => (local.tablas[t] ??= new Map());

vi.mock('@/lib/offlineDb', () => ({
  getAll: vi.fn(async (t: string) => [...tablaLocal(t).values()]),
  getById: vi.fn(async (t: string, id: string) => tablaLocal(t).get(id) ?? null),
  put: vi.fn(async (t: string, row: Record<string, unknown>) => { tablaLocal(t).set(String(row.key ?? row.id), row); }),
  putMany: vi.fn(async (t: string, rows: Record<string, unknown>[]) => { for (const r of rows) tablaLocal(t).set(String(r.key ?? r.id), r); }),
  remove: vi.fn(async (t: string, id: string) => { tablaLocal(t).delete(id); }),
  clearStore: vi.fn(async (t: string) => { tablaLocal(t).clear(); }),
  enqueueSyncAction: vi.fn(async (action: string, table: string, data: Record<string, unknown>) => { local.cola.push({ action, table, data }); }),
  isOfflineDbAvailable: vi.fn(async () => local.disponible),
}));

vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn() }));

import { createClient } from '@/lib/supabase/client';
import {
  convertirAlbaranesAFactura, convertirDocumentosAlbaranAFactura, cancelInvoice, deleteInvoice,
} from '../storage';
import { albaranesDeLaFactura } from './aFactura';

type Row = Record<string, unknown>;
type Store = Record<string, Row[]>;

const year = new Date().getFullYear();

interface Ganchos {
  /** Se llama tras cada upsert, para simular lo que hace otro equipo entre medias. */
  trasUpsert?: (tabla: string, fila: Row, store: Store) => void;
}

function fakeSupabase(store: Store, rpc: string[] = [], ganchos: Ganchos = {}) {
  const chain = (table: string) => {
    const filtros: Array<(r: Row) => boolean> = [];
    let op: 'select' | 'update' | 'delete' = 'select';
    let valores: Row = {};
    let devolver = false;
    let tope: number | undefined;
    const filas = () => (store[table] ??= []);
    const casan = () => filas().filter(r => filtros.every(f => f(r)));
    const ejecutar = (): { data: Row[] | null; error: null } => {
      if (op === 'update') {
        const tocadas = casan();
        for (const r of tocadas) Object.assign(r, valores);
        return { data: devolver ? tocadas.map(r => ({ ...r })) : null, error: null };
      }
      if (op === 'delete') {
        store[table] = filas().filter(r => !filtros.every(f => f(r)));
        return { data: null, error: null };
      }
      const r = casan();
      return { data: (tope ? r.slice(0, tope) : r).map(x => ({ ...x })), error: null };
    };
    const obj = {
      select: () => { if (op !== 'select') devolver = true; return obj; },
      eq: (c: string, v: unknown) => { filtros.push(r => r[c] === v); return obj; },
      neq: (c: string, v: unknown) => { filtros.push(r => r[c] !== v); return obj; },
      in: (c: string, vs: unknown[]) => { filtros.push(r => vs.includes(r[c])); return obj; },
      is: (c: string, v: unknown) => { filtros.push(r => (r[c] ?? null) === v); return obj; },
      not: () => obj,
      order: () => obj,
      limit: (n: number) => { tope = n; return obj; },
      range: async (d: number, h: number) => { const res = ejecutar(); return { data: (res.data ?? []).slice(d, h + 1), error: null }; },
      single: async () => ({ data: ejecutar().data?.[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: ejecutar().data?.[0] ?? null, error: null }),
      update: (v: Row) => { op = 'update'; valores = v; return obj; },
      delete: () => { op = 'delete'; return obj; },
      upsert: async (row: Row) => {
        const arr = filas();
        const i = arr.findIndex(r => r.id === row.id);
        if (i >= 0) arr[i] = { ...arr[i], ...row }; else arr.push({ ...row });
        ganchos.trasUpsert?.(table, row, store);
        return { data: null, error: null };
      },
      insert: async (rows: Row | Row[]) => {
        filas().push(...(Array.isArray(rows) ? rows : [rows]).map(r => ({ ...r })));
        return { data: null, error: null };
      },
      then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(ejecutar()).then(ok, ko),
    };
    return obj;
  };
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }),
      getSession: async () => ({ data: { session: { user: { id: 'u1' } } }, error: null }),
    },
    from: (t: string) => chain(t),
    rpc: async (fn: string) => { rpc.push(fn); return { data: null, error: null }; },
  };
}

// ---- Datos inventados ----

function linea(albaranId: string, n: number, extra: Row = {}): Row {
  return {
    id: `li-${albaranId}-${n}`, albaran_id: albaranId, product_id: `p${n}`, product_name: `Artículo ${n}`,
    product_ref: `R${n}`, quantity: 2, unit_price: 50, unit: 'ud', tax_rate: 7, discount_percent: 0,
    subtotal: 100, tax_amount: 7, total: 107, sort_order: n, ...extra,
  };
}

function albaran(id: string, clientId: string, status = 'expedido', extra: Row = {}): Row {
  return {
    id, user_id: 'u1', number: `ALB-${year}-${id.replace(/\D/g, '').padStart(4, '0')}`, series: 'ALB',
    client_id: clientId, client_name: `Nombre en el albarán ${clientId}`, client_nif: 'B00000000', client_address: 'Dirección vieja',
    issue_date: `${year}-01-1${id.replace(/\D/g, '').slice(-1)}`, status, subtotal: 100, total_discount: 0, total_tax: 7, total: 107,
    notes: '', invoice_id: null, created_at: '', updated_at: '', ...extra,
  };
}

function cliente(id: string, extra: Row = {}): Row {
  return {
    id, user_id: 'u1', nif: `B3500000${id.slice(-1)}`, business_name: `Bar ${id} S.L.`, trade_name: `Bar ${id}`,
    address: 'C/ Real 1', postal_code: '35500', city: 'Arrecife', country: 'España',
    payment_days: 60, default_payment_method: 'domiciliacion', active: true, ...extra,
  };
}

function ajustes(extra: Row = {}): Row {
  return {
    id: 'cs1', user_id: 'u1', business_name: 'Distribuciones de prueba S.L.', nif: 'B35999999', igic_enabled: true,
    invoice_series: 'FAC', next_invoice_number: 5, default_payment_days: 30, default_payment_method: 'transferencia',
    updated_at: '2026-01-01', ...extra,
  };
}

/** Un albarán de venta como documento (invoices, tipo 'albaran'). */
function docAlbaran(id: string, clientId: string, status = 'expedido', extra: Row = {}): Row {
  return {
    id, user_id: 'u1', number: `ALB-${year}-${id.replace(/\D/g, '').padStart(4, '0')}`, series: 'ALB', tipo: 'albaran', sentido: 'venta',
    client_id: clientId, client_name: `Bar ${clientId}`, client_nif: 'B35000001', client_address: 'C/ Real 1',
    issue_date: `${year}-02-0${id.replace(/\D/g, '').slice(-1)}`, due_date: `${year}-02-28`, status, subtotal: 100, total_discount: 0,
    total_tax: 7, total: 107, payment_method: 'transferencia', notes: '', datos_extras: {},
    global_discount_percent_1: 0, global_discount_percent_2: 0, global_discount_percent_3: 0, retencion_pct: null,
    created_at: '', updated_at: '', ...extra,
  };
}

function lineaDoc(invoiceId: string, n: number, extra: Row = {}): Row {
  return {
    id: `dl-${invoiceId}-${n}`, invoice_id: invoiceId, product_id: `p${n}`, product_name: `Artículo ${n}`, product_ref: `R${n}`,
    quantity: 2, unit_price: 50, unit: 'ud', tax_rate: 7, discount_percent: 0, subtotal: 100, tax_amount: 7, total: 107,
    sort_order: n, ...extra,
  };
}

const facturas = (store: Store) => (store.invoices ?? []).filter(i => (i.tipo ?? 'factura') === 'factura');

describe('facturar albaranes de la pantalla Albaranes', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { onLine: true });
    local.disponible = false;
    local.tablas = {};
    local.cola = [];
  });
  afterEach(() => vi.unstubAllGlobals());

  it('si en la selección hay uno que no se puede facturar, avisa y no factura ninguno', async () => {
    // Antes el borrador se quitaba callado y salía la factura del otro:
    // quien había marcado dos creía haber facturado dos.
    const store: Store = {
      company_settings: [ajustes()],
      albaranes: [albaran('a1', 'c1'), albaran('a2', 'c1', 'borrador')],
      albaran_line_items: [linea('a1', 1), linea('a2', 1)],
    };
    (createClient as Mock).mockReturnValue(fakeSupabase(store));

    await expect(convertirAlbaranesAFactura(['a1', 'a2'])).rejects.toThrow(/ALB-\d{4}-0002 aún no se ha expedido/);
    expect(facturas(store)).toHaveLength(0);
    expect(store.albaranes.map(a => a.status)).toEqual(['expedido', 'borrador']);
  });

  it('la factura lleva los datos fiscales, los días y la forma de pago de la ficha del cliente', async () => {
    const store: Store = {
      company_settings: [ajustes()],
      clients: [cliente('c1')],
      albaranes: [albaran('a1', 'c1')],
      albaran_line_items: [linea('a1', 1)],
    };
    (createClient as Mock).mockReturnValue(fakeSupabase(store));

    const [f] = await convertirAlbaranesAFactura(['a1']);

    const hoy = new Date().toISOString().slice(0, 10);
    const en60 = new Date(Date.parse(hoy) + 60 * 864e5).toISOString().slice(0, 10);
    expect(f).toMatchObject({ clientName: 'Bar c1', clientNif: 'B35000001', clientAddress: 'C/ Real 1, 35500 Arrecife', issueDate: hoy, dueDate: en60, paymentMethod: 'domiciliacion' });
  });

  it('un cliente de contado (0 días) vence el mismo día, no a los 30', async () => {
    const store: Store = {
      company_settings: [ajustes()],
      clients: [cliente('c1', { payment_days: 0 })],
      albaranes: [albaran('a1', 'c1')],
      albaran_line_items: [linea('a1', 1)],
    };
    (createClient as Mock).mockReturnValue(fakeSupabase(store));

    const [f] = await convertirAlbaranesAFactura(['a1']);
    expect(f.dueDate).toBe(f.issueDate);
  });

  it('numera con el mayor de los dos contadores y sin repetir uno que ya existe, y avanza los dos', async () => {
    const store: Store = {
      company_settings: [ajustes({ next_invoice_number: 5, series_documentos: { factura_venta: { serie: 'FAC', nextNumber: 9 } } })],
      invoices: [{ id: 'f-vieja', user_id: 'u1', number: `FAC-${year}-0012`, series: 'FAC', tipo: 'factura', status: 'emitida', issue_date: `${year}-01-02` }],
      albaranes: [albaran('a1', 'c1'), albaran('a2', 'c2')],
      albaran_line_items: [linea('a1', 1), linea('a2', 1)],
    };
    (createClient as Mock).mockReturnValue(fakeSupabase(store));

    const creadas = await convertirAlbaranesAFactura(['a1', 'a2']);

    expect(creadas.map(f => f.number).sort()).toEqual([`FAC-${year}-0013`, `FAC-${year}-0014`]);
    const cs = store.company_settings[0];
    expect(cs.next_invoice_number).toBe(15);
    expect((cs.series_documentos as Record<string, { nextNumber: number }>).factura_venta.nextNumber).toBe(15);
  });

  it('un doble clic no crea dos facturas', async () => {
    const store: Store = {
      company_settings: [ajustes()],
      albaranes: [albaran('a1', 'c1'), albaran('a2', 'c1')],
      albaran_line_items: [linea('a1', 1), linea('a2', 1)],
    };
    (createClient as Mock).mockReturnValue(fakeSupabase(store));

    const r = await Promise.allSettled([convertirAlbaranesAFactura(['a1', 'a2']), convertirAlbaranesAFactura(['a1', 'a2'])]);

    expect(r.filter(x => x.status === 'fulfilled')).toHaveLength(1);
    expect(facturas(store)).toHaveLength(1);
  });

  it('si otro equipo lo factura mientras tanto, no queda una segunda factura ni se pisa su enlace', async () => {
    const store: Store = {
      company_settings: [ajustes()],
      albaranes: [albaran('a1', 'c1')],
      albaran_line_items: [linea('a1', 1)],
    };
    // Justo cuando se guarda nuestra factura, el otro equipo se lleva el albarán.
    const ganchos: Ganchos = {
      trasUpsert: (t, fila, s) => {
        if (t === 'invoices' && fila.tipo === 'factura') Object.assign(s.albaranes[0], { status: 'facturado', invoice_id: 'f-del-otro' });
      },
    };
    (createClient as Mock).mockReturnValue(fakeSupabase(store, [], ganchos));

    await expect(convertirAlbaranesAFactura(['a1'])).rejects.toThrow(/otro equipo/);
    expect(facturas(store)).toHaveLength(0);
    expect(store.albaranes[0]).toMatchObject({ status: 'facturado', invoice_id: 'f-del-otro' });
  });

  it('cada albarán queda enlazado y la factura cita cada uno con su fecha y sus líneas', async () => {
    const store: Store = {
      company_settings: [ajustes()],
      albaranes: [albaran('a1', 'c1'), albaran('a2', 'c1')],
      albaran_line_items: [linea('a1', 1), linea('a1', 2), linea('a2', 1)],
    };
    (createClient as Mock).mockReturnValue(fakeSupabase(store));

    const [f] = await convertirAlbaranesAFactura(['a2', 'a1']);

    expect(store.albaranes.every(a => a.status === 'facturado' && a.invoice_id === f.id)).toBe(true);
    expect(f.notes).toContain(`ALB-${year}-0001 del 11/01/${year} (líneas 1-2`);
    expect(f.notes).toContain(`ALB-${year}-0002 del 12/01/${year} (línea 3`);
    const refs = albaranesDeLaFactura(f);
    expect(refs.map(r => r.numero)).toEqual([`ALB-${year}-0001`, `ALB-${year}-0002`]);
    expect(refs[0].lineas).toEqual(f.lineItems.slice(0, 2).map(l => l.id));
    expect(f.status).toBe('borrador');
  });

  it('las líneas se recalculan con los tres descuentos y el desglose por tipo cuadra al céntimo', async () => {
    const store: Store = {
      company_settings: [ajustes()],
      albaranes: [albaran('a1', 'c1'), albaran('a2', 'c1')],
      albaran_line_items: [
        // Guardada con el subtotal de una versión que sólo aplicaba el primer descuento.
        linea('a1', 1, { quantity: 3, unit_price: 12.35, tax_rate: 7, discount_percent: 10, discount_percent_2: 5, discount_percent_3: 2, subtotal: 33.35 }),
        linea('a2', 1, { quantity: 7, unit_price: 1.99, tax_rate: 3, discount_percent: 0, subtotal: 13.93 }),
      ],
    };
    (createClient as Mock).mockReturnValue(fakeSupabase(store));

    const [f] = await convertirAlbaranesAFactura(['a1', 'a2']);

    // 3 × 12,35 = 37,05 → −10 % → −5 % → −2 % = 31,04
    expect(f.lineItems[0]).toMatchObject({ subtotal: 31.04, taxAmount: 2.17, discountPercent2: 5, discountPercent3: 2 });
    expect(f.taxBreakdown).toEqual(expect.arrayContaining([
      { rate: 7, base: 31.04, amount: 2.17 },
      { rate: 3, base: 13.93, amount: 0.42 },
    ]));
    expect([f.subtotal, f.totalTax, f.total]).toEqual([44.97, 2.59, 47.56]);
  });

  it('no toca el stock desde el navegador: ya salió al expedir', async () => {
    const rpc: string[] = [];
    const store: Store = {
      company_settings: [ajustes()],
      albaranes: [albaran('a1', 'c1')],
      albaran_line_items: [linea('a1', 1)],
    };
    (createClient as Mock).mockReturnValue(fakeSupabase(store, rpc));

    await convertirAlbaranesAFactura(['a1']);
    expect(rpc.filter(fn => /stock/i.test(fn))).toEqual([]);
  });

  it('al anular la factura los albaranes vuelven a poder facturarse', async () => {
    const store: Store = {
      company_settings: [ajustes()],
      albaranes: [albaran('a1', 'c1'), albaran('a2', 'c1')],
      albaran_line_items: [linea('a1', 1), linea('a2', 1)],
    };
    (createClient as Mock).mockReturnValue(fakeSupabase(store));
    const [f] = await convertirAlbaranesAFactura(['a1', 'a2']);

    await cancelInvoice(f.id, 'Emitida a otro cliente por error');

    expect(store.albaranes.map(a => [a.status, a.invoice_id])).toEqual([['expedido', null], ['expedido', null]]);
    const [otra] = await convertirAlbaranesAFactura(['a1', 'a2']);
    expect(otra.id).not.toBe(f.id);
  });

  it('al borrar el borrador de la factura, también', async () => {
    const store: Store = {
      company_settings: [ajustes()],
      albaranes: [albaran('a1', 'c1')],
      albaran_line_items: [linea('a1', 1)],
    };
    (createClient as Mock).mockReturnValue(fakeSupabase(store));
    const [f] = await convertirAlbaranesAFactura(['a1']);
    // La clave ajena pone invoice_id a NULL al borrar la factura.
    const supa = fakeSupabase(store);
    const borrarOriginal = supa.from;
    supa.from = (t: string) => {
      const c = borrarOriginal(t);
      if (t !== 'invoices') return c;
      const del = c.delete;
      c.delete = () => { for (const a of store.albaranes) if (a.invoice_id === f.id) a.invoice_id = null; return del(); };
      return c;
    };
    (createClient as Mock).mockReturnValue(supa);

    await deleteInvoice(f.id);
    expect(store.albaranes[0]).toMatchObject({ status: 'expedido', invoice_id: null });
  });

  it('sin conexión: crea el borrador en este equipo, lo encola y el albarán ya no se puede volver a facturar', async () => {
    local.disponible = true;
    vi.stubGlobal('navigator', { onLine: false });
    const store: Store = {};
    (createClient as Mock).mockReturnValue(fakeSupabase(store));
    tablaLocal('settings').set('company', { ...ajustes(), key: 'company' });
    tablaLocal('albaranes').set('a1', { ...albaran('a1', 'c1'), _lineItems: [linea('a1', 1)] });

    const [f] = await convertirAlbaranesAFactura(['a1']);

    expect(f.status).toBe('borrador');
    expect(local.cola.some(q => q.table === 'invoices' && q.data.id === f.id)).toBe(true);
    expect(local.cola.some(q => q.table === 'albaranes' && q.data.invoice_id === f.id && q.data.status === 'facturado')).toBe(true);
    await expect(convertirAlbaranesAFactura(['a1'])).rejects.toThrow(/ya está facturado/);
  });
});

describe('facturar albaranes de venta de Documentos', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { onLine: true });
    local.disponible = false;
    local.tablas = {};
    local.cola = [];
  });
  afterEach(() => vi.unstubAllGlobals());

  it('junta los del mismo cliente con su descuento de pie y su retención, y los marca facturados', async () => {
    const pie = { global_discount_percent_1: 5, global_discount_percent_2: 2, retencion_pct: 1 };
    const store: Store = {
      company_settings: [ajustes()],
      clients: [cliente('c1')],
      invoices: [docAlbaran('d1', 'c1', 'expedido', pie), docAlbaran('d2', 'c1', 'expedido', pie)],
      invoice_line_items: [lineaDoc('d1', 1), lineaDoc('d2', 1, { tax_rate: 3, subtotal: 100, tax_amount: 3, total: 103 })],
    };
    (createClient as Mock).mockReturnValue(fakeSupabase(store));

    const creadas = await convertirDocumentosAlbaranAFactura(['d1', 'd2']);

    expect(creadas).toHaveLength(1);
    const f = creadas[0];
    expect(f).toMatchObject({ globalDiscountPercent1: 5, globalDiscountPercent2: 2, retencionPct: 1, tipo: 'factura', status: 'borrador' });
    // 200 de base −5 % −2 % = 186,20; IGIC 7 % de 93,10 y 3 % de 93,10.
    expect([f.subtotal, f.totalTax, f.total]).toEqual([186.2, 9.31, 195.51]);
    // El origen es un albarán: la base de datos no vuelve a descontar el stock.
    expect(f.documentoOrigenId).toBe('d1');
    const docs = store.invoices.filter(i => i.tipo === 'albaran');
    expect(docs.map(d => d.status)).toEqual(['facturado', 'facturado']);
    expect(albaranesDeLaFactura(f).map(r => r.id)).toEqual(['d1', 'd2']);
  });

  it('dos descuentos de pie distintos no se mezclan en una factura', async () => {
    const store: Store = {
      company_settings: [ajustes()],
      invoices: [docAlbaran('d1', 'c1'), docAlbaran('d2', 'c1', 'expedido', { global_discount_percent_1: 10 })],
      invoice_line_items: [lineaDoc('d1', 1), lineaDoc('d2', 1)],
    };
    (createClient as Mock).mockReturnValue(fakeSupabase(store));

    const creadas = await convertirDocumentosAlbaranAFactura(['d1', 'd2']);
    expect(creadas).toHaveLength(2);
  });

  it('no deja facturar otra vez uno que ya pasó a factura desde su ficha', async () => {
    const store: Store = {
      company_settings: [ajustes()],
      invoices: [
        docAlbaran('d1', 'c1'),
        { id: 'f1', user_id: 'u1', number: `FAC-${year}-0003`, series: 'FAC', tipo: 'factura', sentido: 'venta', status: 'borrador', documento_origen_id: 'd1', issue_date: `${year}-02-10` },
      ],
      invoice_line_items: [lineaDoc('d1', 1)],
    };
    (createClient as Mock).mockReturnValue(fakeSupabase(store));

    await expect(convertirDocumentosAlbaranAFactura(['d1'])).rejects.toThrow(new RegExp(`ya está facturado en FAC-${year}-0003`));
  });

  it('un albarán de compra no se factura desde aquí', async () => {
    const store: Store = {
      company_settings: [ajustes()],
      invoices: [docAlbaran('d1', 'c1', 'expedido', { sentido: 'compra' })],
      invoice_line_items: [lineaDoc('d1', 1)],
    };
    (createClient as Mock).mockReturnValue(fakeSupabase(store));

    await expect(convertirDocumentosAlbaranAFactura(['d1'])).rejects.toThrow(/compra/);
  });

  it('un albarán hecho con IVA no sale en una factura de IGIC', async () => {
    const store: Store = {
      company_settings: [ajustes({ igic_enabled: true })],
      invoices: [docAlbaran('d1', 'c1', 'expedido', { impuesto: 'IVA' })],
      invoice_line_items: [lineaDoc('d1', 1)],
    };
    (createClient as Mock).mockReturnValue(fakeSupabase(store));

    await expect(convertirDocumentosAlbaranAFactura(['d1'])).rejects.toThrow(/IVA/);
    expect(facturas(store)).toHaveLength(0);
  });

  it('al anular la factura vuelven a quedar expedidos', async () => {
    const store: Store = {
      company_settings: [ajustes()],
      invoices: [docAlbaran('d1', 'c1'), docAlbaran('d2', 'c1')],
      invoice_line_items: [lineaDoc('d1', 1), lineaDoc('d2', 1)],
    };
    (createClient as Mock).mockReturnValue(fakeSupabase(store));
    const [f] = await convertirDocumentosAlbaranAFactura(['d1', 'd2']);

    await cancelInvoice(f.id, 'Error en el cliente');

    expect(store.invoices.filter(i => i.tipo === 'albaran').map(d => d.status)).toEqual(['expedido', 'expedido']);
  });
});
