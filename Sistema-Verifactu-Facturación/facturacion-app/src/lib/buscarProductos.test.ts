import { describe, it, expect } from 'vitest';

import { buscarProductos, plano, puntuacion, unicoProducto } from './buscarProductos';

const p = (id: string, ref: string, name: string, extra: Record<string, unknown> = {}) =>
  ({ id, ref, name, active: true, ...extra });

const catalogo = [
  p('1', '10111', 'CHOCOLATE CON LECHE 500 G', { barcode: '8410000000011', category: 'Chocolates' }),
  p('2', '10110', 'Chocolate negro 70%', { supplierRef: 'PROV-77' }),
  p('3', '2001', 'Jamón serrano loncheado'),
  p('4', '2002', 'Leche entera 1 L', { active: false }),
  p('5', '101', 'Galletas maría'),
];

describe('buscar productos', () => {
  it('sin tildes ni mayúsculas', () => {
    expect(plano('  Jamón ')).toBe('jamon');
    expect(buscarProductos(catalogo, 'jamon').map(x => x.id)).toEqual(['3']);
    expect(buscarProductos(catalogo, 'MARIA').map(x => x.id)).toEqual(['5']);
  });

  it('cada palabra en algún sitio, en cualquier orden', () => {
    expect(buscarProductos(catalogo, 'leche choco').map(x => x.id)).toEqual(['1']);
    expect(buscarProductos(catalogo, 'choco 500').map(x => x.id)).toEqual(['1']);
  });

  it('la referencia o el código de barras exactos van primero', () => {
    expect(buscarProductos(catalogo, '101')[0].id).toBe('5');
    expect(buscarProductos(catalogo, '8410000000011').map(x => x.id)).toEqual(['1']);
    expect(puntuacion(catalogo[1], 'prov-77')).toBe(90);
  });

  it('los dados de baja, detrás', () => {
    expect(buscarProductos(catalogo, 'leche').map(x => x.id)).toEqual(['1', '4']);
  });

  it('nada escrito, nada', () => {
    expect(buscarProductos(catalogo, '   ')).toEqual([]);
    expect(buscarProductos(catalogo, 'zzz')).toEqual([]);
  });

  it('Intro coge solo si no hay duda', () => {
    expect(unicoProducto(catalogo, '8410000000011')?.id).toBe('1');
    expect(unicoProducto(catalogo, '10110')?.id).toBe('2');
    expect(unicoProducto(catalogo, 'serrano')?.id).toBe('3');
    expect(unicoProducto(catalogo, 'chocolate')).toBeNull();
  });
});
