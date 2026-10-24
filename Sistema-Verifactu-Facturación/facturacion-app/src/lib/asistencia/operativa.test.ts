/* eslint-disable @typescript-eslint/no-explicit-any -- datos de prueba a medias */
import { describe, it, expect } from 'vitest';
import { InvoiceStatus } from '../types';
import { operativaEnPalabras, fichasParaLaPregunta, palabrasClave, documentosDeVenta, ventasPorArticulo } from './operativa';

const ahora = new Date('2026-10-24T12:00:00Z');
const prod = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id, ref: id.toUpperCase(), name, description: '', category: 'aceites', unitPrice: 10, defaultTaxRate: 7, unit: 'ud',
  active: true, createdAt: '', updatedAt: '', stockQuantity: 5, costePmp: 6, ...extra,
});
const doc = (id: string, extra: Record<string, unknown>, lineas: Array<[string, number, number]>) => ({
  id, number: id.toUpperCase(), tipo: 'factura', sentido: 'venta', status: InvoiceStatus.EMITIDA,
  clientId: 'c1', clientName: 'Bar Pepe', issueDate: '2026-10-01', dueDate: '2026-10-31', subtotal: 0, total: 0,
  lineItems: lineas.map(([productId, quantity, unitPrice], i) => ({ id: `${id}-${i}`, productId, productName: productId, quantity, unitPrice, subtotal: quantity * unitPrice, discountPercent: 0 })),
  ...extra,
});

const productos = [
  prod('p1', 'Aceite de oliva 1L', { stockQuantity: -3 }),
  prod('p2', 'Queso curado', { stockQuantity: 40, lowStockThreshold: 50 }),
  prod('p3', 'Vino tinto', { stockQuantity: 12 }),
] as any;
const facturas = [
  doc('f1', { subtotal: 100, total: 107 }, [['p1', 10, 10]]),
  doc('a1', { tipo: 'albaran', status: InvoiceStatus.FACTURADO, subtotal: 50 }, [['p2', 5, 10]]),
  doc('f2', { documentoOrigenId: 'a1', subtotal: 50, total: 53.5 }, [['p2', 5, 10]]),
  doc('pv', { tipo: 'pedido', status: InvoiceStatus.APROBADO, subtotal: 80 }, [['p2', 8, 10]]),
  doc('fc', { sentido: 'compra', clientId: 'prov', clientName: 'Almazara Sur', subtotal: 60 }, [['p1', 10, 6]]),
] as any;
const clientes = [
  { id: 'c1', nif: 'B12345678', businessName: 'Pepe SL', tradeName: 'Bar Pepe', city: 'Arrecife', active: true, defaultPaymentMethod: 'transferencia', paymentDays: 30 },
  { id: 'prov', nif: 'B87654321', businessName: 'Almazara Sur', tradeName: '', esProveedor: true, active: true, defaultPaymentMethod: 'transferencia', paymentDays: 0 },
] as any;

describe('lo operativo que sabe el asistente', () => {
  it('no cuenta dos veces la factura de un albarán', () => {
    expect(documentosDeVenta(facturas).map(d => d.id).sort()).toEqual(['a1', 'f1']);
    const v = ventasPorArticulo(documentosDeVenta(facturas), productos, '2025-10-24');
    expect(v.find(a => a.productId === 'p2')).toMatchObject({ unidades: 5, importe: 50, coste: 30 });
  });

  it('dice el stock negativo, lo bajo del mínimo, lo pendiente y las compras por proveedor', () => {
    const texto = operativaEnPalabras({ facturas, productos, clientes, ahora }).join('\n');
    expect(texto).toMatch(/EN NEGATIVO: Aceite de oliva 1L \[P1\] -3/);
    expect(texto).toMatch(/BAJO EL MÍNIMO.*Queso curado 40 \(mín. 50\)/);
    expect(texto).toMatch(/Por ENTREGAR.*Queso curado 8 \(stock 40, disponible 32\)/);
    expect(texto).toMatch(/Por PROVEEDOR: Almazara Sur 60,00\s€/);
    expect(texto).toMatch(/Valor del almacén a precio de coste: 312,00\s€/);
  });

  it('la pregunta trae la ficha de lo que nombra', () => {
    expect(palabrasClave('¿Cuánto stock queda de aceite?')).toEqual(['aceite']);
    const texto = fichasParaLaPregunta('¿a cuánto le vendí el aceite a Bar Pepe?', { facturas, productos, clientes, ahora }).join('\n');
    expect(texto).toMatch(/Aceite de oliva 1L: ref. P1 .*STOCK -3 ud/);
    expect(texto).toMatch(/CLIENTE Bar Pepe \(Pepe SL\): NIF B12345678/);
    expect(texto).toMatch(/Aceite de oliva 1L|p1 10 ud \(último 10,00\s€/);
    expect(fichasParaLaPregunta('hola', { facturas, productos, clientes, ahora })).toEqual([]);
  });
});
