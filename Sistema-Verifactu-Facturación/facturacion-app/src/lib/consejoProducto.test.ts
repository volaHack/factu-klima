/* eslint-disable @typescript-eslint/no-explicit-any -- datos de prueba a medias */
import { describe, it, expect } from 'vitest';
import { consejoDeProducto } from './consejoProducto';

const hoy = new Date(2026, 9, 30);
const producto = (extra: Record<string, unknown> = {}) => ({ id: 'p', name: 'Queso', ref: 'Q', unit: 'ud', unitPrice: 10, active: true, ...extra }) as any;

let n = 0;
const doc = (fecha: string, cliente: string, quantity: number, unitPrice: number, extra: Record<string, unknown> = {}, linea: Record<string, unknown> = {}) => ({
  id: `d${n++}`, number: `F-${n}`, tipo: 'factura', sentido: 'venta', status: 'emitida', clientId: cliente, clientName: `Cliente ${cliente}`,
  issueDate: fecha, lineItems: [{ productId: 'p', quantity, unitPrice, discountPercent: 0, subtotal: quantity * unitPrice, ...linea }],
  ...extra,
}) as any;
const compra = (fecha: string, precio: number) => doc(fecha, 'prov', 10, precio, { sentido: 'compra', tipo: 'albaran' });

describe('ficha de producto que aconseja', () => {
  it('suma las ventas de los últimos doce meses, mes a mes', () => {
    const c = consejoDeProducto(producto(), [
      doc('2026-10-05', 'a', 2, 10),
      doc('2026-10-20', 'a', 1, 10),
      doc('2025-11-03', 'b', 4, 10),
      doc('2025-10-31', 'b', 100, 10), // fuera del año
      doc('2026-09-01', 'b', 5, 10, { status: 'anulada' }),
    ], hoy);
    expect(c.meses).toHaveLength(12);
    expect(c.meses[0]).toMatchObject({ mes: '2025-11', etiqueta: 'nov', unidades: 4 });
    expect(c.meses[11]).toMatchObject({ mes: '2026-10', unidades: 3, importe: 30 });
    expect(c.unidades).toBe(7);
  });

  it('los mejores clientes, por lo que han pagado', () => {
    const c = consejoDeProducto(producto(), [doc('2026-10-05', 'a', 1, 10), doc('2026-10-06', 'b', 5, 10), doc('2026-10-07', 'a', 1, 10)], hoy);
    expect(c.mejoresClientes.map(x => [x.id, x.importe])).toEqual([['b', 50], ['a', 20]]);
  });

  it('el precio medio real frente al de la ficha, y los dos márgenes', () => {
    const c = consejoDeProducto(producto({ costePmp: 6 }), [
      doc('2026-10-05', 'a', 10, 10, {}, { discountPercent: 20, subtotal: 80 }),
      doc('2026-10-06', 'b', 10, 10),
    ], hoy);
    expect(c.precioMedio).toBe(9);
    expect(c.diferenciaPct).toBeCloseTo(-10);
    expect(c.margenFicha).toBeCloseTo(40);
    expect(c.margenReal).toBeCloseTo((9 - 6) / 9 * 100);
  });

  it('avisa si el precio lleva más de un año igual y el coste ha subido', () => {
    const c = consejoDeProducto(producto({ costeUltimaCompra: 7 }), [
      doc('2025-03-01', 'a', 1, 9),
      doc('2025-06-01', 'a', 1, 10),
      doc('2026-10-01', 'a', 1, 10),
      compra('2025-05-01', 6),
      compra('2026-09-01', 7),
    ], hoy);
    expect(c.avisoPrecio).toMatchObject({ desde: '2025-06-01', costeAntes: 6, costeAhora: 7, meses: 16 });
    expect(c.avisoPrecio!.subidaCostePct).toBeCloseTo(16.67, 1);
  });

  it('sin compras anotadas, compara la última entrada con el coste medio', () => {
    const c = consejoDeProducto(producto({ costePmp: 5, costeUltimaCompra: 6 }), [doc('2025-01-10', 'a', 1, 10), doc('2026-10-01', 'a', 1, 10)], hoy);
    expect(c.avisoPrecio).toMatchObject({ costeAntes: 5, costeAhora: 6 });
  });

  it('no avisa si el precio cambió hace poco, si el coste no subió o si no hay historia', () => {
    const conCompras = [compra('2025-01-01', 6), compra('2026-09-01', 7)];
    expect(consejoDeProducto(producto({ costeUltimaCompra: 7 }), [doc('2025-01-10', 'a', 1, 9), doc('2026-10-01', 'a', 1, 10), ...conCompras], hoy).avisoPrecio).toBeNull();
    expect(consejoDeProducto(producto({ costeUltimaCompra: 6 }), [doc('2025-01-10', 'a', 1, 10), compra('2025-01-01', 6)], hoy).avisoPrecio).toBeNull();
    expect(consejoDeProducto(producto(), [], hoy)).toMatchObject({ avisoPrecio: null, precioMedio: null, margenFicha: null, unidades: 0 });
  });
});
