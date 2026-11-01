import { describe, it, expect } from 'vitest';
import { conversionesDeFicha, esFacturaRecibida, puedeAnularAqui, puedeRectificarAqui, rotuloRecepcion, sePuedeEditar } from './fichaDocumento';
import { InvoiceStatus, UnitOfMeasure, type Invoice, type InvoiceLineItem } from './types';

// Datos inventados: un proveedor de Canarias y el pedido de Rogar.
const linea = (extra: Partial<InvoiceLineItem> = {}): InvoiceLineItem => ({
  id: crypto.randomUUID(), productId: 'gofio', productName: 'Gofio de millo 1kg', productRef: 'R107',
  quantity: 100, unitPrice: 1.4, unit: UnitOfMeasure.UNIDAD, taxRate: 3, discountPercent: 0,
  subtotal: 140, taxAmount: 4.2, total: 144.2, ...extra,
});
let n = 0;
const doc = (extra: Partial<Invoice> = {}): Invoice => ({
  id: `d${++n}`, number: `PEDC-2026-${String(n).padStart(4, '0')}`, series: 'PEDC',
  clientId: 'p1', clientName: 'Molinos del Atlántico', clientNif: 'B35300000', clientAddress: 'Arinaga',
  issueDate: '2026-10-20', dueDate: '2026-11-19', status: InvoiceStatus.EMITIDA, lineItems: [linea()],
  subtotal: 140, totalDiscount: 0, taxBreakdown: [], totalTax: 4.2, total: 144.2,
  paymentMethod: 'transferencia' as never, notes: '', tipo: 'pedido', sentido: 'compra',
  createdAt: '2026-10-20T08:00:00Z', updatedAt: '2026-10-20T08:00:00Z', ...extra,
});

describe('las conversiones de la ficha, en compras', () => {
  it('un pedido de compra se recibe (lo pendiente) o se factura con los datos del proveedor', () => {
    const ped = doc({ id: 'ped' });
    expect(conversionesDeFicha(ped, [ped]).map(c => [c.destino, c.rotulo, c.motivo, c.datosProveedor])).toEqual([
      ['albaran', 'Recibir lo pendiente', null, false],
      ['factura', 'Registrar factura del proveedor', null, true],
    ]);
  });

  it('recibido entero, ya no se recibe más (y lo dice)', () => {
    const ped = doc({ id: 'ped' });
    const alb = doc({ tipo: 'albaran', status: InvoiceStatus.EXPEDIDO, documentoOrigenId: 'ped', lineItems: [linea()] });
    expect(conversionesDeFicha(ped, [ped, alb])[0].motivo).toMatch(/recibido entero/);
  });

  it('«Facturar albarán» no sale si el albarán no está recibido o ya está facturado', () => {
    const borrador = doc({ tipo: 'albaran', status: InvoiceStatus.BORRADOR });
    expect(conversionesDeFicha(borrador, [borrador])).toEqual([]);
    const facturado = doc({ tipo: 'albaran', status: InvoiceStatus.FACTURADO });
    expect(conversionesDeFicha(facturado, [facturado])).toEqual([]);
    const recibido = doc({ id: 'alb', tipo: 'albaran', status: InvoiceStatus.EXPEDIDO });
    const fac = doc({ tipo: 'factura', status: InvoiceStatus.BORRADOR, documentoOrigenId: 'alb' });
    expect(conversionesDeFicha(recibido, [recibido, fac])).toEqual([]);
    expect(conversionesDeFicha(recibido, [recibido]).map(c => [c.rotulo, c.datosProveedor])).toEqual([['Registrar factura del proveedor', true]]);
  });

  it('en venta igual: el albarán sin expedir o ya facturado no enseña «Facturar albarán»', () => {
    const v = (extra: Partial<Invoice>) => doc({ sentido: 'venta', tipo: 'albaran', ...extra });
    expect(conversionesDeFicha(v({ status: InvoiceStatus.BORRADOR }), [])).toEqual([]);
    expect(conversionesDeFicha(v({ status: InvoiceStatus.FACTURADO }), [])).toEqual([]);
    expect(conversionesDeFicha(v({ status: InvoiceStatus.EXPEDIDO }), []).map(c => c.rotulo)).toEqual(['Facturar albarán']);
  });

  it('en venta, lo bloqueado sigue a la vista con su motivo (un presupuesto ya pasado a pedido)', () => {
    const pre = doc({ id: 'pre', sentido: 'venta', tipo: 'presupuesto' });
    const ped = doc({ sentido: 'venta', tipo: 'pedido', status: InvoiceStatus.BORRADOR, documentoOrigenId: 'pre' });
    expect(conversionesDeFicha(pre, [pre, ped])[0]).toMatchObject({ destino: 'pedido', rotulo: 'Pasar a pedido', motivo: expect.stringMatching(/Ya se pasó/) });
  });

  it('anulado, ninguna', () => {
    expect(conversionesDeFicha(doc({ status: InvoiceStatus.ANULADA }), [])).toEqual([]);
  });
});

describe('recibir o expedir', () => {
  it('en compras el albarán se recibe; en venta, se expide', () => {
    expect(rotuloRecepcion(doc({ tipo: 'albaran' }))).toBe('Recibir mercancía (+stock)');
    expect(rotuloRecepcion(doc({ tipo: 'albaran', sentido: 'venta' }))).toBe('Expedir albarán (−stock)');
  });
});

describe('rectificar', () => {
  it('sólo cuando se puede: nunca un borrador', () => {
    const fac = doc({ tipo: 'factura', status: InvoiceStatus.BORRADOR });
    expect(puedeRectificarAqui(fac, [fac])).toBe(false);
    const emitida = { ...fac, status: InvoiceStatus.EMITIDA };
    expect(puedeRectificarAqui(emitida, [emitida])).toBe(true);
    expect(puedeRectificarAqui(doc({ tipo: 'albaran', status: InvoiceStatus.EXPEDIDO }), [])).toBe(false);
  });
});

describe('editar', () => {
  it('sólo borradores, también en compras: nada expedido, recibido o facturado', () => {
    expect(sePuedeEditar(doc({ tipo: 'albaran', status: InvoiceStatus.BORRADOR }))).toBe(true);
    for (const status of [InvoiceStatus.EXPEDIDO, InvoiceStatus.FACTURADO, InvoiceStatus.EMITIDA, InvoiceStatus.ANULADA]) {
      expect(sePuedeEditar(doc({ tipo: 'albaran', status }))).toBe(false);
    }
  });
  it('la factura recibida lleva los datos del proveedor; la de venta, no', () => {
    expect(esFacturaRecibida({ tipo: 'factura', sentido: 'compra' })).toBe(true);
    expect(esFacturaRecibida({ tipo: 'factura', sentido: 'venta' })).toBe(false);
    expect(esFacturaRecibida({ tipo: 'albaran', sentido: 'compra' })).toBe(false);
  });
});

describe('anular desde la ficha', () => {
  it('no una factura de venta emitida (va por Facturas) ni un borrador fiscal (se elimina)', () => {
    expect(puedeAnularAqui(doc({ sentido: 'venta', tipo: 'factura', status: InvoiceStatus.EMITIDA }))).toBe(false);
    expect(puedeAnularAqui(doc({ sentido: 'venta', tipo: 'factura', status: InvoiceStatus.BORRADOR }))).toBe(false);
    expect(puedeAnularAqui(doc({ tipo: 'factura', status: InvoiceStatus.EMITIDA }))).toBe(true);
    expect(puedeAnularAqui(doc({ status: InvoiceStatus.ANULADA }))).toBe(false);
    expect(puedeAnularAqui(doc({}))).toBe(true);
  });
});
