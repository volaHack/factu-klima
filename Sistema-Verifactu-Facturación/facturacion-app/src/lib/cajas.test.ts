import { describe, expect, it } from 'vitest';
import { aLineaPorUnidades, cajasTotales, conCajas, conUdsCaja, conUnidades, desgloseLinea, explicarLinea, unidadesTotales } from './cajas';

const l = (o: Partial<{ quantity: number; unitsPerPackage: number; cajas: number | null; unitPrice: number }>) => ({ quantity: 1, unitPrice: 1, ...o });

describe('desgloseLinea', () => {
  it('por unidades: cajas, U/C y unidades tal cual', () => {
    expect(desgloseLinea(l({ quantity: 48, unitsPerPackage: 24, cajas: 2 }))).toEqual({ cajas: 2, udsCaja: 24, unidades: 48, sueltas: 0 });
  });
  it('cajas y sueltas', () => {
    expect(desgloseLinea(l({ quantity: 51, unitsPerPackage: 24, cajas: 2 }))).toMatchObject({ cajas: 2, sueltas: 3, unidades: 51 });
  });
  it('sólo unidades (sin cajas), aunque el producto tenga U/C', () => {
    expect(desgloseLinea(l({ quantity: 15, unitsPerPackage: 24, cajas: 0 }))).toEqual({ cajas: null, udsCaja: 24, unidades: 15, sueltas: 0 });
  });
  it('línea de antes: la cantidad eran cajas', () => {
    expect(desgloseLinea(l({ quantity: 12, unitsPerPackage: 24 }))).toEqual({ cajas: 12, udsCaja: 24, unidades: 288, sueltas: 0 });
  });
  it('sin cajas ni U/C (un servicio, una venta suelta)', () => {
    expect(desgloseLinea(l({ quantity: 3 }))).toEqual({ cajas: null, udsCaja: null, unidades: 3, sueltas: 0 });
  });
});

describe('editar una línea', () => {
  it('poner cajas calcula las unidades', () => {
    expect(conCajas(l({ quantity: 0, unitsPerPackage: 24, cajas: 0 }), 2).quantity).toBe(48);
  });
  it('cambiar cajas conserva las sueltas', () => {
    const r = conCajas(l({ quantity: 51, unitsPerPackage: 24, cajas: 2 }), 3);
    expect(r).toMatchObject({ cajas: 3, quantity: 75 });
  });
  it('sin U/C, las cajas no tocan las unidades', () => {
    expect(conCajas(l({ quantity: 7, cajas: 0 }), 2)).toMatchObject({ cajas: 2, quantity: 7 });
  });
  it('cambiar la U/C recalcula con cajas puestas', () => {
    expect(conUdsCaja(l({ quantity: 48, unitsPerPackage: 24, cajas: 2 }), 12).quantity).toBe(24);
  });
  it('escribir sólo unidades', () => {
    expect(conUnidades(l({ quantity: 0, unitsPerPackage: 24, cajas: 0 }), 15)).toMatchObject({ quantity: 15, cajas: 0 });
  });
  it('unidades por debajo de las cajas: bajan las cajas', () => {
    expect(conUnidades(l({ quantity: 48, unitsPerPackage: 24, cajas: 2 }), 45)).toMatchObject({ quantity: 45, cajas: 1 });
  });
  it('unidades por encima: cajas y sueltas', () => {
    const r = conUnidades(l({ quantity: 48, unitsPerPackage: 24, cajas: 2 }), 51);
    expect(desgloseLinea(r)).toMatchObject({ cajas: 2, sueltas: 3 });
  });
});

describe('líneas de antes', () => {
  it('pasan a unidades sin cambiar el importe', () => {
    const r = aLineaPorUnidades(l({ quantity: 12, unitsPerPackage: 24, unitPrice: 30 }));
    expect(r).toMatchObject({ cajas: 12, quantity: 288, unitPrice: 1.25 });
    expect(r.quantity * r.unitPrice).toBe(360);
  });
  it('las que ya van por unidades no cambian', () => {
    const x = l({ quantity: 48, unitsPerPackage: 24, cajas: 2 });
    expect(aLineaPorUnidades(x)).toBe(x);
  });
});

describe('totales y explicación', () => {
  const lineas = [l({ quantity: 51, unitsPerPackage: 24, cajas: 2 }), l({ quantity: 15, unitsPerPackage: 12, cajas: 0 }), l({ quantity: 3, unitsPerPackage: 6 })];
  it('unidades y cajas', () => {
    expect(unidadesTotales(lineas)).toBe(51 + 15 + 18);
    expect(cajasTotales(lineas)).toBe(2 + 3);
  });
  it('explicación', () => {
    expect(explicarLinea(lineas[0])).toBe('2 cajas × 24 + 3 sueltas = 51 unidades');
    expect(explicarLinea(lineas[1])).toBeNull();
    expect(explicarLinea(l({ quantity: 24, unitsPerPackage: 24, cajas: 1 }))).toBe('1 caja × 24 = 24 unidades');
  });
});
