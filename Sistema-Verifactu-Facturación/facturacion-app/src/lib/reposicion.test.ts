/* eslint-disable @typescript-eslint/no-explicit-any -- datos de prueba a medias */
import { describe, it, expect } from 'vitest';
import { calcularReposicion, sinMovimiento, ventanaDe } from './reposicion';

const hoy = new Date(2026, 9, 30); // 30 de octubre de 2026

const producto = (id: string, extra: Record<string, unknown> = {}) => ({
  id, name: `Artículo ${id}`, ref: id, unit: 'ud', unitPrice: 2, active: true, stockQuantity: 10,
  createdAt: '2025-01-01', ...extra,
}) as any;

const factura = (fecha: string, lineas: { productId: string; quantity: number; unitsPerPackage?: number; cajas?: number | null }[], extra: Record<string, unknown> = {}) => ({
  id: `f-${fecha}-${Math.random()}`, number: 'F-1', tipo: 'factura', sentido: 'venta', status: 'emitida',
  clientId: 'c1', clientName: 'Bar Pepe', issueDate: fecha,
  lineItems: lineas.map(l => ({ unitPrice: 2, discountPercent: 0, subtotal: l.quantity * 2, ...l })),
  ...extra,
}) as any;

describe('repón esto', () => {
  it('calcula el ritmo de 90 días, los días que quedan y lo que conviene pedir', () => {
    // 90 unidades en 90 días = 1 al día; con 10 en stock quedan 10 días.
    const docs = [factura('2026-09-15', [{ productId: 'a', quantity: 90 }])];
    const [r] = calcularReposicion([producto('a')], docs, { hoy, cubrirDias: 30 });
    expect(r).toMatchObject({ id: 'a', porDia: 1, diasQuedan: 10, sugerido: 20, urgencia: 'pronto', cajas: null });
  });

  it('redondea a cajas completas si el artículo va por cajas', () => {
    const docs = [factura('2026-09-15', [{ productId: 'a', quantity: 90, cajas: 0 }])];
    const [r] = calcularReposicion([producto('a', { unitsPerPackage: 12 })], docs, { hoy, cubrirDias: 30 });
    expect(r).toMatchObject({ cajas: 2, udsCaja: 12, sugerido: 24 });
  });

  it('las líneas de antes iban en cajas: 3 cajas de 10 son 30 unidades', () => {
    const docs = [factura('2026-10-01', [{ productId: 'a', quantity: 9, unitsPerPackage: 10 }])];
    const [r] = calcularReposicion([producto('a')], docs, { hoy });
    expect(r.porDia).toBe(1);
  });

  it('lo que ya viene en pedidos de compra cuenta', () => {
    const docs = [factura('2026-09-15', [{ productId: 'a', quantity: 90 }])];
    const pendientes = new Map([['a', { pendienteRecibir: 30 }]]);
    expect(calcularReposicion([producto('a')], docs, { hoy, pendientes })).toEqual([]);
  });

  it('agotado y vendiendo es lo primero', () => {
    const docs = [factura('2026-09-15', [{ productId: 'a', quantity: 90 }, { productId: 'b', quantity: 9 }])];
    const lista = calcularReposicion([producto('b', { stockQuantity: 1 }), producto('a', { stockQuantity: 0 })], docs, { hoy });
    expect(lista.map(r => [r.id, r.urgencia])).toEqual([['a', 'agotado'], ['b', 'pronto']]);
  });

  it('no avisa de lo que aguanta, ni de borradores, anuladas, compras o artículos de baja', () => {
    const docs = [
      factura('2026-09-15', [{ productId: 'a', quantity: 9 }]),
      factura('2026-09-15', [{ productId: 'b', quantity: 900 }], { status: 'borrador' }),
      factura('2026-09-15', [{ productId: 'b', quantity: 900 }], { status: 'anulada' }),
      factura('2026-09-15', [{ productId: 'b', quantity: 900 }], { sentido: 'compra' }),
      factura('2026-09-15', [{ productId: 'c', quantity: 900 }]),
    ];
    expect(calcularReposicion([producto('a', { stockQuantity: 100 }), producto('b'), producto('c', { active: false })], docs, { hoy })).toEqual([]);
  });

  it('un artículo nuevo se mide desde su alta, pero nunca con menos de 60 días', () => {
    expect(ventanaDe({ createdAt: '2026-10-20' }, hoy)).toBe(60);
    expect(ventanaDe({ createdAt: '2026-08-01' }, hoy)).toBe(90);
    expect(ventanaDe({ createdAt: '2026-08-21' }, hoy)).toBe(70);
  });
});

describe('sin movimiento', () => {
  it('lo que lleva más de 90 días sin venderse, ordenado por el dinero parado', () => {
    const docs = [
      factura('2026-05-01', [{ productId: 'a', quantity: 1 }]),
      factura('2026-10-01', [{ productId: 'b', quantity: 1 }]),
    ];
    const lista = sinMovimiento([
      producto('a', { stockQuantity: 5, costePmp: 1 }),
      producto('b'),
      producto('c', { stockQuantity: 100, costePmp: 3 }),
      producto('d', { stockQuantity: 0 }),
      producto('e', { createdAt: '2026-10-01' }),
    ], docs, { hoy });
    expect(lista.map(s => s.id)).toEqual(['c', 'a']);
    expect(lista[0]).toMatchObject({ ultimaVenta: null, valorParado: 300 });
    expect(lista[1]).toMatchObject({ ultimaVenta: '2026-05-01', dias: 182, valorParado: 5 });
  });
});
