import { describe, it, expect } from 'vitest';
import { articulosHabituales, lineaDeHabitual } from './pedidoHabitual';
import { UnitOfMeasure, type Invoice, type InvoiceLineItem, type Product } from './types';

const linea = (o: Partial<InvoiceLineItem>): InvoiceLineItem => ({
  id: Math.random().toString(36), productId: 'agua', productName: 'Agua 1,5 L', productRef: 'A1', quantity: 24,
  unitPrice: 0.5, unit: UnitOfMeasure.UNIDAD, taxRate: 10, discountPercent: 0, subtotal: 12, taxAmount: 1.2, total: 13.2, ...o,
});

const doc = (o: Partial<Invoice>): Invoice => ({
  id: Math.random().toString(36), number: 'F-1', series: 'F', clientId: 'bar', clientName: 'Bar de la esquina', status: 'emitida',
  tipo: 'factura', sentido: 'venta', total: 13.2, issueDate: '2026-10-01', createdAt: '2026-10-01T10:00:00Z',
  lineItems: [linea({})], taxBreakdown: [], ...o,
} as unknown as Invoice);

describe('lo que suele pedir este cliente', () => {
  const historia = [
    doc({ issueDate: '2026-09-01', lineItems: [linea({ quantity: 12, unitPrice: 0.45 }), linea({ productId: 'cerveza', productName: 'Cerveza', quantity: 6, unitPrice: 0.9 })] }),
    doc({ issueDate: '2026-09-15', lineItems: [linea({ quantity: 24, unitPrice: 0.48 }), linea({ productId: 'cerveza', productName: 'Cerveza', quantity: 12, unitPrice: 0.95 })] }),
    doc({ issueDate: '2026-10-01', lineItems: [linea({ quantity: 36, unitPrice: 0.5, discountPercent: 5 }), linea({ productId: 'vermu', productName: 'Vermú', quantity: 2, unitPrice: 8 })] }),
  ];

  it('ordena por veces y da la cantidad y el precio de la última vez', () => {
    const r = articulosHabituales(historia, 'bar');
    expect(r.map(a => a.productId)).toEqual(['agua', 'cerveza', 'vermu']);
    expect(r[0]).toMatchObject({ veces: 3, ultimaCantidad: 36, ultimoPrecio: 0.5, ultimaFecha: '2026-10-01', ultimosDescuentos: [5, 0, 0] });
    expect(r[1]).toMatchObject({ veces: 2, ultimaCantidad: 12, ultimoPrecio: 0.95 });
  });

  it('a igualdad de veces, primero lo más reciente', () => {
    const r = articulosHabituales([
      doc({ issueDate: '2026-08-01', lineItems: [linea({ productId: 'viejo' })] }),
      doc({ issueDate: '2026-10-01', lineItems: [linea({ productId: 'nuevo' })] }),
    ], 'bar');
    expect(r.map(a => a.productId)).toEqual(['nuevo', 'viejo']);
  });

  it('cuenta documentos, no líneas: dos líneas del mismo artículo son una vez', () => {
    const r = articulosHabituales([doc({ lineItems: [linea({ quantity: 5 }), linea({ quantity: 7 })] })], 'bar');
    expect(r[0].veces).toBe(1);
    expect(r[0].ultimaCantidad).toBe(5);
  });

  it('deja fuera borradores, anulados, presupuestos, rectificativas, otras fichas y compras', () => {
    const docs = [
      doc({ status: 'borrador' as Invoice['status'], lineItems: [linea({ productId: 'a' })] }),
      doc({ status: 'anulada' as Invoice['status'], lineItems: [linea({ productId: 'b' })] }),
      doc({ tipo: 'presupuesto', lineItems: [linea({ productId: 'c' })] }),
      doc({ tipo: undefined, number: 'PRE-3', lineItems: [linea({ productId: 'c2' })] }),
      doc({ tipo: 'rectificativa', total: -10, lineItems: [linea({ productId: 'd' })] }),
      doc({ clientId: 'hotel', lineItems: [linea({ productId: 'e' })] }),
      doc({ sentido: 'compra', lineItems: [linea({ productId: 'f' })] }),
      doc({ id: 'yo', lineItems: [linea({ productId: 'g' })] }),
      doc({ tipo: 'albaran', lineItems: [linea({ productId: 'bueno' }), linea({ productId: 'cero', quantity: 0 }), linea({ productId: '' })] }),
    ];
    expect(articulosHabituales(docs, 'bar', 'venta', { excluirId: 'yo' }).map(a => a.productId)).toEqual(['bueno']);
    expect(articulosHabituales(docs, 'bar', 'compra').map(a => a.productId)).toEqual(['f']);
    expect(articulosHabituales(docs, null)).toEqual([]);
  });

  it('no pasa del máximo', () => {
    const muchos = Array.from({ length: 12 }, (_, i) => doc({ lineItems: [linea({ productId: `p${i}` })] }));
    expect(articulosHabituales(muchos, 'bar')).toHaveLength(8);
    expect(articulosHabituales(muchos, 'bar', 'venta', { max: 6 })).toHaveLength(6);
  });

  it('la línea que se añade lleva la cantidad, las cajas y el precio de la última vez', () => {
    const [h] = articulosHabituales([doc({ lineItems: [linea({ quantity: 48, cajas: 4, unitsPerPackage: 12, unitPrice: 0.5, discountPercent: 10 })] })], 'bar');
    const producto = { id: 'agua', name: 'Agua 1,5 L', ref: 'A1', unit: UnitOfMeasure.UNIDAD, unitsPerPackage: 12, defaultTaxRate: 10 } as Product;
    const base = linea({ productId: '', productName: '', quantity: 1, unitPrice: 0, cajas: 0, taxRate: 21 });
    const l = lineaDeHabitual(h, producto, base);
    expect(l).toMatchObject({ productId: 'agua', quantity: 48, cajas: 4, unitsPerPackage: 12, unitPrice: 0.5, discountPercent: 10, taxRate: 10 });
    expect(l.subtotal).toBeCloseTo(21.6);
    expect(l.id).toBe(base.id);

    // Sin casilla de cajas en la línea vacía (un oficio que no va por cajas), no se añade.
    const sinCajas: InvoiceLineItem = { ...base };
    delete sinCajas.cajas;
    expect('cajas' in lineaDeHabitual(h, producto, sinCajas)).toBe(false);
  });
});
