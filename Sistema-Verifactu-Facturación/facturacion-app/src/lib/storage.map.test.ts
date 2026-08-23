import { describe, it, expect } from 'vitest';
import { mapProductFromDb, mapInvoiceFromDb } from './storage';
import { UnitOfMeasure, TaxRate } from './types';

describe('mapProductFromDb', () => {
  it('expone unitsSold desde units_sold', () => {
    const product = mapProductFromDb({
      id: 'p1',
      ref: 'REF1',
      name: 'Manzana',
      category: 'frutas',
      unit_price: 2,
      default_tax_rate: 10,
      unit: UnitOfMeasure.KG,
      active: true,
      units_sold: 42,
    });
    expect(product.unitsSold).toBe(42);
  });

  it('asume 0 cuando units_sold no viene (columna previa a migración 011)', () => {
    const product = mapProductFromDb({
      id: 'p2',
      ref: 'REF2',
      name: 'Pan',
      category: 'panaderia',
      unit_price: 1,
      default_tax_rate: TaxRate.EXENTO,
      unit: UnitOfMeasure.UNIDAD,
      active: true,
    });
    expect(product.unitsSold).toBe(0);
  });

  it('conserva el resto de campos de stock', () => {
    const product = mapProductFromDb({
      id: 'p3',
      ref: 'REF3',
      name: 'Leche',
      category: 'lacteos',
      unit_price: 1.2,
      default_tax_rate: TaxRate.REDUCIDO,
      unit: UnitOfMeasure.PACK,
      active: true,
      stock_quantity: 9,
      low_stock_threshold: 5,
      units_sold: 3,
    });
    expect(product.stockQuantity).toBe(9);
    expect(product.lowStockThreshold).toBe(5);
    expect(product.unitsSold).toBe(3);
  });
});

describe('mapInvoiceFromDb · anulación', () => {
  // El motivo de la anulación se guardaba desde siempre en la columna
  // `cancel_reason`, pero el mapeador no lo leía: nunca llegaba a la
  // interfaz, así que quien anulaba una factura no podía volver a ver por
  // qué lo hizo.
  const filaBase = {
    id: 'f1',
    number: 'FAC-2026-0001',
    series: 'FAC',
    client_name: 'Cliente S.L.',
    issue_date: '2026-08-01',
    due_date: '2026-08-31',
    status: 'anulada',
    subtotal: 100,
    total_discount: 0,
    total_tax: 21,
    total: 121,
    payment_method: 'transferencia',
    created_at: '2026-08-01T10:00:00Z',
    updated_at: '2026-08-02T10:00:00Z',
  };

  it('expone el motivo y la fecha de anulación', () => {
    const factura = mapInvoiceFromDb(
      { ...filaBase, cancel_reason: 'NIF del cliente equivocado', cancelled_at: '2026-08-02T10:00:00Z' },
      [], [],
    );
    expect(factura.cancelReason).toBe('NIF del cliente equivocado');
    expect(factura.cancelledAt).toBe('2026-08-02T10:00:00Z');
  });

  it('no inventa un motivo cuando la factura no está anulada', () => {
    const factura = mapInvoiceFromDb({ ...filaBase, status: 'emitida' }, [], []);
    expect(factura.cancelReason).toBeUndefined();
    expect(factura.cancelledAt).toBeUndefined();
  });
});
