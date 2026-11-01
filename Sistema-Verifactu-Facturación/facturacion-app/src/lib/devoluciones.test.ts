import { describe, it, expect } from 'vitest';
import { InvoiceStatus, type Albaran, type CompanySettings, type Devolucion, type Invoice, type InvoiceLineItem } from './types';
import {
  baseDevuelta, cantidadesARectificar, importeConImpuesto, lineasDevolubles, origenesDevolvibles, problemasDevolucion,
} from './devoluciones';
import { rectificar } from './documentos';

function linea(over: Partial<InvoiceLineItem> = {}): InvoiceLineItem {
  return {
    id: crypto.randomUUID(), productId: 'ron', productName: 'Ron 70cl', productRef: 'R9', quantity: 6, unitPrice: 10,
    unit: 'ud' as InvoiceLineItem['unit'], taxRate: 7, discountPercent: 10, subtotal: 54, taxAmount: 3.78, total: 57.78, ...over,
  };
}
function doc(over: Partial<Invoice>): Invoice {
  return {
    id: 'f1', number: 'F-2026-0001', series: 'F', tipo: 'factura', sentido: 'venta', clientId: 'c1', clientName: 'Bar La Ola',
    clientNif: 'B35000001', clientAddress: '', issueDate: '2026-10-01', dueDate: '2026-10-31', status: InvoiceStatus.EMITIDA,
    lineItems: [linea({ id: 'l1' })], subtotal: 54, totalDiscount: 6, taxBreakdown: [], totalTax: 3.78, total: 57.78,
    paymentMethod: 'efectivo' as Invoice['paymentMethod'], notes: '', createdAt: '', updatedAt: '', ...over,
  };
}
function devolucion(originId: string, quantity: number): Devolucion {
  return {
    id: crypto.randomUUID(), number: 'DEV-1', series: 'DEV', origin: 'factura', originId, clientId: 'c1', clientName: 'Bar La Ola',
    clientNif: '', issueDate: '2026-10-05', reason: 'rotura', reasonNote: '', status: 'registrada',
    lineItems: [{ id: 'x', productId: 'ron', productName: 'Ron 70cl', productRef: 'R9', quantity, unitPrice: 9, unit: 'ud' as never, taxRate: 7, total: 9 * quantity, restock: true }],
    total: 9 * quantity, notes: '', createdAt: '', updatedAt: '',
  };
}

describe('de qué se puede devolver', () => {
  const docs = [
    doc({ id: 'f1' }),
    doc({ id: 'ped', tipo: 'pedido' }),
    doc({ id: 'pre', tipo: 'presupuesto' }),
    doc({ id: 'rec', tipo: 'rectificativa' }),
    doc({ id: 'compra', sentido: 'compra' }),
    doc({ id: 'borr', status: InvoiceStatus.BORRADOR }),
    doc({ id: 'alb', tipo: 'albaran', status: InvoiceStatus.EXPEDIDO }),
    doc({ id: 'albBorr', tipo: 'albaran', status: InvoiceStatus.BORRADOR }),
  ];
  const antiguo = { ...doc({ id: 'albViejo' }), status: 'expedido' } as unknown as Albaran;
  const o = origenesDevolvibles(docs, [antiguo], []);

  it('como factura solo las de venta emitidas; ni pedidos, ni compras, ni rectificativas', () => {
    expect(o.facturas.map(f => f.id)).toEqual(['f1']);
  });
  it('como albarán también los de ahora, no solo los de la pantalla antigua', () => {
    expect(o.albaranes.map(a => a.id).sort()).toEqual(['alb', 'albViejo']);
  });
  it('una factura devuelta entera deja de salir', () => {
    expect(origenesDevolvibles(docs, [], [devolucion('f1', 6)]).facturas).toEqual([]);
  });
});

describe('las líneas que se devuelven', () => {
  it('van al precio cobrado (con los descuentos de línea y de pie), no al de tarifa', () => {
    const f = doc({ globalDiscountPercent1: 5 });
    const [l] = lineasDevolubles(f, []);
    expect(l.unitPrice).toBe(8.55);
    expect(l.total).toBe(51.3);
  });
  it('quitan lo que ya se devolvió', () => {
    expect(lineasDevolubles(doc({}), [devolucion('f1', 2)])[0].quantity).toBe(4);
  });
  it('no se devuelve más de lo que queda', () => {
    const f = doc({});
    const origen = origenesDevolvibles([f], [], [devolucion('f1', 2)]).facturas[0];
    const pide = { origin: 'factura' as const, originId: 'f1', lineItems: [{ ...origen.lineas[0], quantity: 5 }] };
    expect(problemasDevolucion(pide, origen)).toEqual(['De «Ron 70cl» solo quedan 4 por devolver de F-2026-0001.']);
    expect(problemasDevolucion({ ...pide, lineItems: [{ ...origen.lineas[0], quantity: 4 }] }, origen)).toEqual([]);
  });
});

describe('el importe', () => {
  const lineas = lineasDevolubles(doc({}), []);
  it('el abono lleva el impuesto: es lo que pagó el cliente', () => {
    expect(baseDevuelta(lineas)).toBe(54);
    expect(importeConImpuesto(lineas)).toBe(57.78);
  });
  it('la rectificativa de la devolución resta exactamente lo devuelto', () => {
    const f = doc({});
    const settings = {} as CompanySettings;
    const r = rectificar(f, settings, { cantidades: cantidadesARectificar(f, [{ ...lineas[0], quantity: 2 }]), motivo: 'Devolución DEV-1' });
    expect(r.lineItems).toHaveLength(1);
    expect(r.lineItems[0]).toMatchObject({ quantity: -2, subtotal: -18, taxAmount: -1.26 });
  });
});
