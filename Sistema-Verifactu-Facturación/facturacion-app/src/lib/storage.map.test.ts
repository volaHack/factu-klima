import { describe, it, expect } from 'vitest';
import { mapProductFromDb } from './storage';
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
