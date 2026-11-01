import { describe, it, expect } from 'vitest';
import { InvoiceStatus, type Invoice, type InvoiceLineItem } from './types';
import { albaranesQueVuelven, anulacionVaPorLaFicha, porQueNoSeAnula } from './anulacion';

function linea(quantity: number): InvoiceLineItem {
  return {
    id: crypto.randomUUID(), productId: 'gofio', productName: 'Gofio 1kg', productRef: 'R8', quantity, unitPrice: 2,
    unit: 'ud' as InvoiceLineItem['unit'], taxRate: 3, discountPercent: 0, subtotal: 2 * quantity, taxAmount: 0, total: 0,
  };
}
function doc(over: Partial<Invoice>): Invoice {
  return {
    id: 'd', number: 'D-1', series: 'D', tipo: 'albaran', sentido: 'venta', clientId: 'c1', clientName: 'Bar Pepe', clientNif: 'B1',
    clientAddress: '', issueDate: '2026-10-01', dueDate: '2026-10-01', status: InvoiceStatus.EXPEDIDO, lineItems: [linea(10)],
    subtotal: 20, totalDiscount: 0, taxBreakdown: [], totalTax: 0, total: 20, paymentMethod: 'efectivo' as Invoice['paymentMethod'],
    notes: '', createdAt: '', updatedAt: '', ...over,
  };
}

describe('el estado que se ve', () => {
  it('un albarán recibido o facturado no sale como «Borrador»', async () => {
    // getStatusInfo caía en el primero de la lista (Borrador) con los dos
    // estados de albarán, y tras recibir o facturar parecía sin hacer.
    const { getStatusInfo } = await import('./utils');
    expect(getStatusInfo(InvoiceStatus.EXPEDIDO).label).toBe('Expedido');
    expect(getStatusInfo(InvoiceStatus.FACTURADO).label).toBe('Facturado');
  });
});

describe('anular un albarán', () => {
  const alb = doc({ id: 'alb', number: 'ALB-7' });
  it('ya facturado, no: primero la factura (si no, el stock vuelve y la factura sigue)', () => {
    const fac = doc({ id: 'fac', number: 'F-9', tipo: 'factura', status: InvoiceStatus.EMITIDA, documentoOrigenId: 'alb' });
    expect(porQueNoSeAnula(alb, [alb, fac])).toMatch(/ya está facturado en F-9/);
    expect(porQueNoSeAnula({ ...alb, status: InvoiceStatus.FACTURADO }, [])).toMatch(/ya está facturado/);
  });
  it('si su factura está anulada, sí', () => {
    const fac = doc({ id: 'fac', tipo: 'factura', status: InvoiceStatus.ANULADA, documentoOrigenId: 'alb' });
    expect(porQueNoSeAnula(alb, [alb, fac])).toBeNull();
  });
  it('sin facturar, sí', () => expect(porQueNoSeAnula(alb, [alb])).toBeNull());
});

describe('anular un pedido', () => {
  const ped = doc({ id: 'ped', number: 'PED-3', tipo: 'pedido', status: InvoiceStatus.EMITIDA });
  it('servido entero, no', () => {
    const alb = doc({ id: 'alb', number: 'ALB-1', documentoOrigenId: 'ped' });
    expect(porQueNoSeAnula(ped, [ped, alb])).toMatch(/servido entero \(ALB-1\)/);
  });
  it('servido a medias, sí: cierra lo que faltaba', () => {
    const alb = doc({ id: 'alb', documentoOrigenId: 'ped', lineItems: [linea(4)] });
    expect(porQueNoSeAnula(ped, [ped, alb])).toBeNull();
  });
  it('sin servir, sí', () => expect(porQueNoSeAnula(ped, [ped])).toBeNull());
});

describe('anular una factura', () => {
  const fac = doc({ id: 'fac', number: 'F-1', tipo: 'factura', status: InvoiceStatus.PAGADA });
  it('emitida de venta: va por su ficha, con motivo', () => {
    expect(anulacionVaPorLaFicha(fac)).toMatch(/desde su ficha/);
    expect(anulacionVaPorLaFicha({ ...fac, sentido: 'compra' })).toBeNull();
  });
  it('con una rectificativa viva, no', () => {
    const rect = doc({ id: 'r', number: 'FCR-1', tipo: 'rectificativa', status: InvoiceStatus.EMITIDA, documentoOrigenId: 'fac' });
    expect(porQueNoSeAnula(fac, [fac, rect])).toMatch(/rectificativa FCR-1/);
  });
  it('la factura de compra anulada devuelve sus albaranes a «por facturar»', () => {
    const a1 = doc({ id: 'a1', number: 'ALBC-1', sentido: 'compra', status: InvoiceStatus.FACTURADO });
    const a2 = doc({ id: 'a2', number: 'ALBC-2', sentido: 'compra', status: InvoiceStatus.FACTURADO });
    const fc = doc({ id: 'fc', tipo: 'factura', sentido: 'compra', status: InvoiceStatus.EMITIDA, documentoOrigenId: 'a1', documentoOrigenNumber: 'ALBC-1, ALBC-2' });
    expect(albaranesQueVuelven(fc, [a1, a2, fc]).map(a => a.id)).toEqual(['a1', 'a2']);
  });
});
