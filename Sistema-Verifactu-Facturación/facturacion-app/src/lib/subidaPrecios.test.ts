/* eslint-disable @typescript-eslint/no-explicit-any -- datos de prueba a medias */
import { describe, it, expect } from 'vitest';
import {
  redondearPrecio, precioSubido, margenSobreVenta, previsualizarSubida, resumirSubida, conPrecioSubido, conPreciosDeAntes,
} from './subidaPrecios';

describe('subida de precios en bloque', () => {
  it('redondea los céntimos hacia arriba a la terminación pedida', () => {
    expect(redondearPrecio(2.31, 'x9')).toBe(2.39);
    expect(redondearPrecio(2.39, 'x9')).toBe(2.39);
    expect(redondearPrecio(2.31, 'x5')).toBe(2.35);
    expect(redondearPrecio(2.36, 'x5')).toBe(2.45);
    expect(redondearPrecio(2.31, 'x0')).toBe(2.4);
    expect(redondearPrecio(2.3, 'x0')).toBe(2.3);
    expect(redondearPrecio(2.314, 'ninguno')).toBe(2.31);
  });

  it('sube en porcentaje o en euros, y también baja', () => {
    expect(precioSubido(10, { modo: 'porcentaje', valor: 5, redondeo: 'ninguno' })).toBe(10.5);
    expect(precioSubido(2.2, { modo: 'porcentaje', valor: 5, redondeo: 'x9' })).toBe(2.39);
    expect(precioSubido(2.2, { modo: 'euros', valor: 0.2, redondeo: 'ninguno' })).toBe(2.4);
    expect(precioSubido(10, { modo: 'porcentaje', valor: -10, redondeo: 'ninguno' })).toBe(9);
    expect(precioSubido(0.1, { modo: 'euros', valor: -1, redondeo: 'ninguno' })).toBe(0);
    expect(precioSubido(0, { modo: 'porcentaje', valor: 10, redondeo: 'x9' })).toBe(0);
  });

  it('el margen es sobre la venta y solo si hay coste', () => {
    expect(margenSobreVenta(10, 6)).toBeCloseTo(40);
    expect(margenSobreVenta(10, 0)).toBeNull();
  });

  it('la vista previa usa el coste medio, la última compra o el precio de compra, y avisa por debajo de coste', () => {
    const productos = [
      { id: 'a', ref: 'A', name: 'A', unitPrice: 10, costePmp: 6 },
      { id: 'b', ref: 'B', name: 'B', unitPrice: 10, costeUltimaCompra: 8 },
      { id: 'c', ref: 'C', name: 'C', unitPrice: 10, purchasePrice: 11 },
      { id: 'd', ref: 'D', name: 'D', unitPrice: 10 },
    ] as any;
    const filas = previsualizarSubida(productos, { modo: 'porcentaje', valor: 5, redondeo: 'ninguno' });
    expect(filas.map(f => f.coste)).toEqual([6, 8, 11, 0]);
    expect(filas[0].margenDespues).toBeCloseTo((10.5 - 6) / 10.5 * 100);
    expect(filas[3].margenDespues).toBeNull();
    expect(filas.map(f => f.bajoCoste)).toEqual([false, false, true, false]);
    expect(resumirSubida(filas)).toMatchObject({ cambian: 4, bajoCoste: 1 });
    expect(resumirSubida(filas).mediaPct).toBeCloseTo(5);
  });

  it('las tarifas de la ficha suben solo si se pide', () => {
    const p = { id: 'a', unitPrice: 10, tarifaPrices: { t1: 9 } } as any;
    const s = { modo: 'euros', valor: 1, redondeo: 'ninguno' } as const;
    expect(conPrecioSubido(p, s, 'ya').tarifaPrices).toEqual({ t1: 9 });
    expect(conPrecioSubido(p, { ...s, tambienTarifas: true }, 'ya')).toMatchObject({ unitPrice: 11, tarifaPrices: { t1: 10 }, updatedAt: 'ya' });
  });

  it('deshacer devuelve los precios sin pisar lo demás', () => {
    const actual = { id: 'a', unitPrice: 11, tarifaPrices: { t1: 10 }, stockQuantity: 3, name: 'Nuevo nombre' } as any;
    expect(conPreciosDeAntes(actual, { unitPrice: 10, tarifaPrices: { t1: 9 } }, 'ya'))
      .toEqual({ ...actual, unitPrice: 10, tarifaPrices: { t1: 9 }, updatedAt: 'ya' });
  });
});
