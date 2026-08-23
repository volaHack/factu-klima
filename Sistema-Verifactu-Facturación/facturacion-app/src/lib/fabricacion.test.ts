import { describe, it, expect } from 'vitest';
import { costeDeEscandallo, componentesFaltantes, nuevoPmpTrasFabricar } from './fabricacion';
import type { Escandallo, Product } from './types';

const producto = (extra: Partial<Product> = {}): Product => ({
  id: 'p1', ref: 'REF1', name: 'Componente', description: '', category: 'otros',
  unitPrice: 10, defaultTaxRate: 21, unit: 'ud' as never, active: true,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  ...extra,
});

const escandallo = (extra: Partial<Escandallo> = {}): Escandallo => ({
  id: 'e1', productId: 'final', productRef: 'FIN', productName: 'Mueble terminado',
  componentes: [], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  ...extra,
});

describe('costeDeEscandallo', () => {
  it('suma cada componente a su coste, multiplicado por lo que hace falta', () => {
    const products = [producto({ id: 'tabla', costePmp: 5 }), producto({ id: 'tornillo', costePmp: 0.1 })];
    const e = escandallo({
      componentes: [
        { productId: 'tabla', productRef: 'T', productName: 'Tabla', cantidad: 2 },
        { productId: 'tornillo', productRef: 'TO', productName: 'Tornillo', cantidad: 8 },
      ],
    });
    // 2×5 + 8×0,1 = 10 + 0,8 = 10,8
    expect(costeDeEscandallo(e, products)).toBe(10.8);
  });

  it('sin PMP todavía, usa el precio de venta como mejor estimación', () => {
    const products = [producto({ id: 'tabla', costePmp: 0, unitPrice: 6 })];
    const e = escandallo({ componentes: [{ productId: 'tabla', productRef: 'T', productName: 'Tabla', cantidad: 1 }] });
    expect(costeDeEscandallo(e, products)).toBe(6);
  });

  it('suma el coste adicional (mano de obra, energía)', () => {
    const products = [producto({ id: 'tabla', costePmp: 5 })];
    const e = escandallo({
      componentes: [{ productId: 'tabla', productRef: 'T', productName: 'Tabla', cantidad: 1 }],
      costeAdicional: 3,
    });
    expect(costeDeEscandallo(e, products)).toBe(8);
  });

  it('un escandallo sin componentes cuesta lo que el coste adicional, nada más', () => {
    expect(costeDeEscandallo(escandallo({ costeAdicional: 2.5 }), [])).toBe(2.5);
  });

  it('un componente que ya no existe en el catálogo no revienta, cuenta coste cero', () => {
    const e = escandallo({ componentes: [{ productId: 'fantasma', productRef: 'X', productName: 'Borrado', cantidad: 5 }] });
    expect(costeDeEscandallo(e, [])).toBe(0);
  });
});

describe('componentesFaltantes', () => {
  it('lista vacía cuando hay existencias de sobra', () => {
    const products = [producto({ id: 'tabla', stockQuantity: 100 })];
    const e = escandallo({ componentes: [{ productId: 'tabla', productRef: 'T', productName: 'Tabla', cantidad: 2 }] });
    expect(componentesFaltantes(e, products, 10)).toEqual([]);
  });

  it('avisa de lo que falta, multiplicado por la cantidad a fabricar', () => {
    const products = [producto({ id: 'tabla', stockQuantity: 5 })];
    const e = escandallo({ componentes: [{ productId: 'tabla', productRef: 'T', productName: 'Tabla', cantidad: 2 }] });
    // Fabricar 10 unidades pide 20 tablas, hay 5: faltan 15.
    const faltantes = componentesFaltantes(e, products, 10);
    expect(faltantes).toHaveLength(1);
    expect(faltantes[0]).toMatchObject({ necesario: 20, disponible: 5, faltan: 15 });
  });

  it('un componente sin ficha de producto cuenta con cero existencias', () => {
    const e = escandallo({ componentes: [{ productId: 'fantasma', productRef: 'X', productName: 'Borrado', cantidad: 1 }] });
    expect(componentesFaltantes(e, [], 1)).toHaveLength(1);
  });

  it('justo lo que hay alcanza, no falta nada', () => {
    const products = [producto({ id: 'tabla', stockQuantity: 20 })];
    const e = escandallo({ componentes: [{ productId: 'tabla', productRef: 'T', productName: 'Tabla', cantidad: 2 }] });
    expect(componentesFaltantes(e, products, 10)).toEqual([]);
  });
});

describe('nuevoPmpTrasFabricar', () => {
  it('pondera el coste de lo fabricado con lo que ya había', () => {
    // 10 a 5€ y se fabrican 10 más a 8€: (10×5 + 10×8) / 20 = 6,5
    expect(nuevoPmpTrasFabricar(10, 5, 10, 8)).toBe(6.5);
  });

  it('sin existencias previas, el coste es el de lo recién fabricado', () => {
    expect(nuevoPmpTrasFabricar(0, 0, 5, 12)).toBe(12);
  });

  it('fabricar cero unidades no cambia el coste', () => {
    expect(nuevoPmpTrasFabricar(10, 5, 0, 999)).toBe(5);
  });
});
