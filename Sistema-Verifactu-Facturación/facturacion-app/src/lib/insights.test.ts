import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/offlineDb', () => ({
  getMeta: vi.fn(async () => 0),
  setMeta: vi.fn(async () => {}),
}));

import {
  getStockAlerts,
  getStockProjection,
  getProductTrends,
  getBestWorstDay,
  getRiskClients,
  buildAvisosData,
  getLastSeenAvisoCount,
  setAvisosSeen,
} from './insights';
import { Invoice, InvoiceStatus, PaymentMethod, Product, TaxRate, UnitOfMeasure } from './types';

function makeProduct(over: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    ref: 'PRD-001',
    name: 'Producto A',
    description: '',
    category: 'otros',
    unitPrice: 10,
    defaultTaxRate: TaxRate.GENERAL,
    unit: UnitOfMeasure.UNIDAD,
    active: true,
    createdAt: '',
    updatedAt: '',
    stockQuantity: 10,
    lowStockThreshold: 3,
    ...over,
  };
}

function makeLine(productId: string, productName: string, quantity: number, total: number) {
  return {
    id: 'li',
    productId,
    productName,
    productRef: 'REF',
    quantity,
    unitPrice: total / quantity,
    unit: UnitOfMeasure.UNIDAD,
    taxRate: TaxRate.GENERAL,
    discountPercent: 0,
    subtotal: total,
    taxAmount: 0,
    total,
  };
}

function makeInvoice(over: Partial<Invoice> = {}): Invoice {
  return {
    id: 'inv1',
    number: 'FAC-0001',
    series: 'A',
    clientId: 'c1',
    clientName: 'Cliente Uno',
    clientNif: 'B12345678',
    clientAddress: '',
    issueDate: new Date().toISOString(),
    dueDate: new Date(Date.now() + 30 * 86400000).toISOString(),
    status: InvoiceStatus.PAGADA,
    lineItems: [],
    subtotal: 0,
    totalDiscount: 0,
    taxBreakdown: [],
    totalTax: 0,
    total: 0,
    paymentMethod: PaymentMethod.TRANSFERENCIA,
    notes: '',
    createdAt: '',
    updatedAt: '',
    ...over,
  };
}

describe('getStockAlerts', () => {
  it('marca como crítico el stock agotado', () => {
    const { critical, low } = getStockAlerts([makeProduct({ stockQuantity: 0 })]);
    expect(critical).toHaveLength(1);
    expect(critical[0].stock).toBe(0);
    expect(low).toHaveLength(0);
  });

  it('marca como bajo el stock por debajo o igual al umbral', () => {
    const { critical, low } = getStockAlerts([makeProduct({ stockQuantity: 3 })]);
    expect(low).toHaveLength(1);
    expect(critical).toHaveLength(0);
  });

  it('ignora productos inactivos o sin umbral configurado', () => {
    const { critical, low } = getStockAlerts([
      makeProduct({ stockQuantity: 0, active: false }),
      makeProduct({ stockQuantity: 0, lowStockThreshold: undefined }),
    ]);
    expect(critical).toHaveLength(0);
    expect(low).toHaveLength(0);
  });
});

describe('getStockProjection', () => {
  const activeProduct = makeProduct({
    id: 'fast',
    name: 'Venta rápida',
    stockQuantity: 6,
  });
  const slowProduct = makeProduct({
    id: 'slow',
    name: 'Venta lenta',
    stockQuantity: 6,
  });
  const invoice = makeInvoice({
    status: InvoiceStatus.PAGADA,
    lineItems: [makeLine('fast', 'Venta rápida', 30, 300)],
  });

  it('estima días hasta agotar y ordena de menor a mayor', () => {
    const result = getStockProjection([activeProduct, slowProduct], [invoice]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('fast');
    expect(result[0].daysLeft).toBe(6);
  });

  it('excluye productos sin ventas recientes', () => {
    const result = getStockProjection([slowProduct], [invoice]);
    expect(result).toHaveLength(0);
  });
});

describe('getProductTrends', () => {
  const now = new Date();
  const current = new Date(now.getFullYear(), now.getMonth(), 10);
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 10);

  it('detecta crecimiento y declive mes a mes', () => {
    const invoices = [
      makeInvoice({
        issueDate: current.toISOString(),
        lineItems: [
          makeLine('up', 'En alza', 12, 120),
          makeLine('down', 'En baja', 4, 40),
          makeLine('flat', 'Plano', 3, 30),
        ],
      }),
      makeInvoice({
        issueDate: previous.toISOString(),
        lineItems: [
          makeLine('up', 'En alza', 6, 60),
          makeLine('down', 'En baja', 10, 100),
          makeLine('flat', 'Plano', 3, 30),
        ],
      }),
    ];
    const { growing, declining } = getProductTrends(invoices);
    expect(growing.map(g => g.name)).toEqual(['En alza']);
    expect(declining.map(d => d.name)).toEqual(['En baja']);
  });
});

describe('getBestWorstDay', () => {
  it('encuentra el día con más y menos facturación', () => {
    const invoices = [
      makeInvoice({ issueDate: '2026-08-07', total: 100 }),
      makeInvoice({ issueDate: '2026-08-08', total: 300 }),
    ];
    const { best, worst } = getBestWorstDay(invoices);
    expect(best?.total).toBe(300);
    expect(worst?.total).toBe(100);
  });

  it('devuelve null sin facturas válidas', () => {
    const { best, worst } = getBestWorstDay([makeInvoice({ status: InvoiceStatus.ANULADA })]);
    expect(best).toBeNull();
    expect(worst).toBeNull();
  });
});

describe('getRiskClients', () => {
  it('agrupa pendientes y vencidas por cliente y ordena por importe', () => {
    const invoices = [
      makeInvoice({ id: 'a', clientId: 'c1', clientName: 'Cliente Uno', status: InvoiceStatus.PENDIENTE, total: 100 }),
      makeInvoice({ id: 'b', clientId: 'c1', clientName: 'Cliente Uno', status: InvoiceStatus.VENCIDA, total: 50 }),
      makeInvoice({ id: 'c', clientId: 'c2', clientName: 'Cliente Dos', status: InvoiceStatus.PENDIENTE, total: 200 }),
      makeInvoice({ id: 'd', clientId: 'c3', clientName: 'Cliente Tres', status: InvoiceStatus.PAGADA, total: 999 }),
    ];
    const result = getRiskClients(invoices);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('c2');
    expect(result[0].pendingTotal).toBe(200);
    expect(result[1].id).toBe('c1');
    expect(result[1].pendingTotal).toBe(150);
    expect(result[1].overdueTotal).toBe(50);
  });
});

describe('buildAvisosData', () => {
  it('suma el total de avisos combinando todas las fuentes', () => {
    const products = [
      makeProduct({ id: 'crit', name: 'Agotado', stockQuantity: 0 }),
      makeProduct({ id: 'low', name: 'Bajo', stockQuantity: 1 }),
    ];
    const invoices = [
      makeInvoice({ id: 'o', clientId: 'c1', clientName: 'Cliente Uno', status: InvoiceStatus.VENCIDA, total: 50 }),
      makeInvoice({
        id: 's',
        clientId: 'c2',
        clientName: 'Cliente Dos',
        status: InvoiceStatus.PENDIENTE,
        total: 80,
        dueDate: new Date(Date.now() + 3 * 86400000).toISOString(),
      }),
    ];
    const data = buildAvisosData(products, invoices);
    expect(data.critical).toHaveLength(1);
    expect(data.low).toHaveLength(1);
    expect(data.overdueCount).toBe(1);
    expect(data.dueSoonCount).toBe(1);
    expect(data.riskClients).toHaveLength(2);
    expect(data.totalCount).toBe(6);
  });
});

describe('meta de avisos vistos', () => {
  it('expone helpers para el estado visto', async () => {
    await expect(getLastSeenAvisoCount()).resolves.toBe(0);
    await expect(setAvisosSeen(5)).resolves.toBeUndefined();
  });
});
