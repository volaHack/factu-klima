import { describe, it, expect } from 'vitest';

import { condicionesDeVenta } from './documentos';
import { descuentoFamiliaDe, leerDescuentosFamilia, leerPreciosEspeciales, precioEspecialDe } from './preciosCliente';

const papas = { id: 'p-papas', category: 'custom_isecan_42', unitPrice: 1.59, tarifaPrices: { isecan_2: 1.43, isecan_10: 1.22 } };
const fregona = { id: 'p-fregona', category: 'custom_isecan_32', unitPrice: 2.1 };
const tarifas = [{ id: 'isecan_2' }, { id: 'isecan_10' }];

describe('leer lo que guarda la base de datos', () => {
  it('se queda con lo que tiene sentido y quita lo que no', () => {
    expect(leerPreciosEspeciales([
      { productId: 'a', precio: 1.49, activo: true },
      { productId: 'b', precio: 0, descuento: 5 },           // ISECAN: precio 0 = «sólo descuento»
      { productId: 'c', precio: 0, descuento: 0 },           // nada que aplicar
      { productId: '', precio: 3 },                          // sin artículo
      { productId: 'd', precio: -2, descuento: 150 },        // imposible
      { productId: 'e', precio: '2,5' },                     // texto que no es número
      'basura', null,
    ])).toEqual([
      { productId: 'a', precio: 1.49, descuento: null, activo: true },
      { productId: 'b', precio: null, descuento: 5, activo: true },
    ]);
  });

  it('un artículo, un apunte: si se repite manda el último', () => {
    expect(leerPreciosEspeciales([{ productId: 'a', precio: 1 }, { productId: 'a', precio: 2, activo: false }]))
      .toEqual([{ productId: 'a', precio: 2, descuento: null, activo: false }]);
  });

  it('descuentos por familia: categoría y porcentaje válido', () => {
    expect(leerDescuentosFamilia([
      { categoria: 'custom_isecan_32', descuento: 5, activo: true },
      { categoria: 'custom_isecan_8', descuento: '5', activo: false },
      { categoria: '', descuento: 5 },
      { categoria: 'x', descuento: 0 },
    ])).toEqual([
      { categoria: 'custom_isecan_32', descuento: 5, activo: true },
      { categoria: 'custom_isecan_8', descuento: 5, activo: false },
    ]);
    expect(leerDescuentosFamilia(undefined)).toEqual([]);
    expect(leerPreciosEspeciales({})).toEqual([]);
  });

  it('sólo cuenta lo encendido', () => {
    const cliente = {
      preciosEspeciales: [{ productId: 'p-papas', precio: 1.49, activo: false }],
      descuentosFamilia: [{ categoria: 'custom_isecan_32', descuento: 5, activo: true }],
    };
    expect(precioEspecialDe(cliente, 'p-papas')).toBeUndefined();
    expect(descuentoFamiliaDe(cliente, 'custom_isecan_32')?.descuento).toBe(5);
    expect(descuentoFamiliaDe(null, 'custom_isecan_32')).toBeUndefined();
  });
});

describe('el precio de la línea al elegir el artículo', () => {
  it('sin nada especial: su tarifa y los descuentos de su ficha, como siempre', () => {
    expect(condicionesDeVenta(papas, { tarifaId: 'isecan_2', tarifas, defaultDiscounts: [3, 2, 0] }))
      .toEqual({ unitPrice: 1.43, descuentos: [3, 2, 0], origen: 'tarifa' });
    expect(condicionesDeVenta(papas, {})).toEqual({ unitPrice: 1.59, descuentos: [0, 0, 0], origen: 'tarifa' });
  });

  it('precio especial: sustituye a la tarifa y a los descuentos de la ficha', () => {
    const cliente = { preciosEspeciales: [{ productId: 'p-papas', precio: 1.49, descuento: null, activo: true }] };
    expect(condicionesDeVenta(papas, { tarifaId: 'isecan_2', tarifas, defaultDiscounts: [3, 2, 0], cliente }))
      .toEqual({ unitPrice: 1.49, descuentos: [0, 0, 0], origen: 'precio_especial' });
  });

  it('precio especial con descuento: los dos, como en ISECAN', () => {
    const cliente = { preciosEspeciales: [{ productId: 'p-papas', precio: 1.49, descuento: 10, activo: true }] };
    expect(condicionesDeVenta(papas, { cliente })).toEqual({ unitPrice: 1.49, descuentos: [10, 0, 0], origen: 'precio_especial' });
  });

  it('descuento del artículo: sobre su tarifa; el pronto pago de la ficha se mantiene', () => {
    const cliente = { preciosEspeciales: [{ productId: 'p-papas', precio: null, descuento: 5, activo: true }] };
    expect(condicionesDeVenta(papas, { tarifaId: 'isecan_10', tarifas, defaultDiscounts: [3, 2, 0], cliente }))
      .toEqual({ unitPrice: 1.22, descuentos: [5, 2, 0], origen: 'descuento_articulo' });
  });

  it('descuento de la familia: para los artículos de esa familia y no para otros', () => {
    const cliente = { descuentosFamilia: [{ categoria: 'custom_isecan_32', descuento: 5, activo: true }] };
    expect(condicionesDeVenta(fregona, { cliente })).toEqual({ unitPrice: 2.1, descuentos: [5, 0, 0], origen: 'descuento_familia' });
    expect(condicionesDeVenta(papas, { cliente }).origen).toBe('tarifa');
  });

  it('lo del artículo gana a lo de la familia', () => {
    const cliente = {
      preciosEspeciales: [{ productId: 'p-fregona', precio: null, descuento: 10, activo: true }],
      descuentosFamilia: [{ categoria: 'custom_isecan_32', descuento: 5, activo: true }],
    };
    expect(condicionesDeVenta(fregona, { cliente }).descuentos[0]).toBe(10);
  });

  it('lo apagado no se aplica', () => {
    const cliente = {
      preciosEspeciales: [{ productId: 'p-papas', precio: 1.0, activo: false }],
      descuentosFamilia: [{ categoria: 'custom_isecan_42', descuento: 5, activo: false }],
    };
    expect(condicionesDeVenta(papas, { cliente, defaultDiscounts: [1, 0, 0] }))
      .toEqual({ unitPrice: 1.59, descuentos: [1, 0, 0], origen: 'tarifa' });
  });
});
