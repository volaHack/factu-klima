import { describe, it, expect } from 'vitest';
import { lineasDeOtraVez, lineasEnBlanco, ultimoDocumentoDe } from './repetirPedido';
import { UnitOfMeasure, type Albaran, type Invoice, type InvoiceLineItem, type Product } from './types';

const linea = (o: Partial<InvoiceLineItem>): InvoiceLineItem => ({
  id: Math.random().toString(36), productId: 'agua', productName: 'Agua 1,5 L', productRef: 'A1', quantity: 24,
  unitPrice: 0.5, unit: UnitOfMeasure.UNIDAD, taxRate: 7, discountPercent: 0, subtotal: 12, taxAmount: 0.84, total: 12.84, ...o,
});

const doc = (o: Partial<Invoice>): Invoice => ({
  id: 'd', number: 'F-1', series: 'F', clientId: 'bar', clientName: 'Bar Pepe', status: 'emitida', tipo: 'factura', sentido: 'venta',
  total: 12.84, issueDate: '2026-10-01', createdAt: '2026-10-01T10:00:00Z', lineItems: [linea({})], taxBreakdown: [],
  ...o,
} as unknown as Invoice);

const albaran = (o: Partial<Albaran>): Albaran => ({
  id: 'alb', number: 'ALB-9', series: 'ALB', clientId: 'bar', clientName: 'Bar Pepe', status: 'expedido',
  issueDate: '2026-10-05', createdAt: '2026-10-05T09:00:00Z', lineItems: [linea({ productId: 'cola', productName: 'Cola 33cl' })], total: 10,
  ...o,
} as unknown as Albaran);

const articulo = (o: Partial<Product>): Product => ({
  id: 'agua', ref: 'A1', name: 'Agua 1,5 L', active: true, unit: UnitOfMeasure.UNIDAD, unitPrice: 0.6, defaultTaxRate: 7, ...o,
} as unknown as Product);

describe('lo mismo que la última vez', () => {
  it('coge el documento más reciente de la ficha, también de los albaranes antiguos', () => {
    const r = ultimoDocumentoDe([doc({ id: 'a', issueDate: '2026-09-01' }), doc({ id: 'b', issueDate: '2026-10-01' })], [albaran({})], 'bar', 'venta');
    expect(r?.id).toBe('alb');
    expect(r?.tipo).toBe('albaran');
    expect(ultimoDocumentoDe([doc({ id: 'b' })], [], 'bar', 'venta')?.numero).toBe('F-1');
  });

  it('deja fuera borradores, anulados, presupuestos, rectificativas, otras fichas y el propio documento', () => {
    const docs = [
      doc({ id: 'borr', status: 'borrador' as Invoice['status'], issueDate: '2026-10-20' }),
      doc({ id: 'anul', status: 'anulada' as Invoice['status'], issueDate: '2026-10-19' }),
      doc({ id: 'pres', tipo: 'presupuesto', issueDate: '2026-10-18' }),
      doc({ id: 'rect', tipo: 'rectificativa', issueDate: '2026-10-17' }),
      doc({ id: 'neg', tipo: undefined, total: -5, issueDate: '2026-10-16' }),
      doc({ id: 'otro', clientId: 'hotel', issueDate: '2026-10-15' }),
      doc({ id: 'yo', issueDate: '2026-10-14' }),
      doc({ id: 'compra', sentido: 'compra', issueDate: '2026-10-13' }),
      doc({ id: 'bueno', issueDate: '2026-10-02' }),
    ];
    expect(ultimoDocumentoDe(docs, [albaran({ status: 'anulado' })], 'bar', 'venta', 'yo')?.id).toBe('bueno');
    expect(ultimoDocumentoDe(docs, [], 'bar', 'compra')?.id).toBe('compra');
    expect(ultimoDocumentoDe(docs, [], null, 'venta')).toBeNull();
  });

  it('copia artículos y cantidades con el precio de hoy, y dice qué artículos ya no están', () => {
    const anterior = ultimoDocumentoDe([doc({
      lineItems: [
        linea({ quantity: 48, cajas: 4, unitsPerPackage: 12, loteId: 'L1', loteCodigo: 'L1' }),
        linea({ productId: 'viejo', productName: 'Zumo descatalogado' }),
        linea({ productId: '', productName: 'Portes', quantity: 1, unitPrice: 15 }),
        linea({ productId: 'cero', quantity: 0 }),
      ],
    })], [], 'bar', 'venta')!;
    let n = 0;
    const { lineas, sinFicha } = lineasDeOtraVez(
      anterior,
      [articulo({}), articulo({ id: 'viejo', active: false })],
      () => ({ unitPrice: 0.55, descuentos: [5, 0, 0], taxRate: 7 }),
      () => linea({ id: `nueva-${++n}`, productId: '', productName: '', quantity: 1, unitPrice: 0 }),
    );
    expect(sinFicha).toEqual(['Zumo descatalogado']);
    expect(lineas).toHaveLength(2);
    expect(lineas[0]).toMatchObject({ id: 'nueva-1', productId: 'agua', quantity: 48, cajas: 4, unitsPerPackage: 12, unitPrice: 0.55, discountPercent: 5 });
    expect(lineas[0].loteId).toBeUndefined();
    expect(lineas[0].subtotal).toBeCloseTo(48 * 0.55 * 0.95, 2);
    expect(lineas[1]).toMatchObject({ productId: '', productName: 'Portes', unitPrice: 15, quantity: 1 });
  });

  it('sabe si el documento está en blanco', () => {
    expect(lineasEnBlanco([linea({ productId: '', productName: ' ' })])).toBe(true);
    expect(lineasEnBlanco([linea({})])).toBe(false);
  });
});
