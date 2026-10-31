/* eslint-disable @typescript-eslint/no-explicit-any -- datos de prueba a medias */
import { describe, it, expect } from 'vitest';
import {
  unidadesPorCaja, palabrasClave, categoriaParecida, impuestoHabitual, margenHabitual,
  precioConMargen, sugerenciasFicha, type CampoSugerido,
} from './fichaProducto';

const producto = (id: string, name: string, category: string, extra: Record<string, unknown> = {}) => ({
  id, name, category, ref: id, unit: 'ud', unitPrice: 1, defaultTaxRate: 7, active: true, ...extra,
}) as any;

describe('unidades por caja que dice el nombre', () => {
  it.each([
    ['Agua Fuente Alta 6x1,5L', 6],
    ['Cerveza 24 x 33cl', 24],
    ['Leche entera caja 6', 6],
    ['Galletas pack de 12', 12],
    ['Refresco lata x24', 24],
    ['Yogur natural c/8', 8],
    ['Pañuelos 10 uds', 10],
    ['Huevos bandeja 30', 30],
  ])('«%s» → %i', (nombre, uc) => {
    expect(unidadesPorCaja(nombre)).toBe(uc);
  });

  it.each([
    'Aceite de oliva 1 L',
    'Agua 1,5L',
    'Queso tierno 500 g',
    'Café molido',
    'Caja 1',
    'Vino tinto 2024',
    'Arroz x1,5kg',
  ])('«%s» no dice cajas', nombre => {
    expect(unidadesPorCaja(nombre)).toBeNull();
  });
});

describe('familia por parecido', () => {
  const catalogo = [
    producto('a', 'Agua Fuente Alta 1,5L', 'bebidas'),
    producto('b', 'Agua con gas 50cl', 'bebidas'),
    producto('c', 'Aceite de oliva virgen 1L', 'aceites'),
    producto('d', 'Atún en aceite pack 3', 'conservas'),
  ];

  it('se queda con las palabras que dicen qué es', () => {
    expect(palabrasClave('Agua Fuente Alta 6x1,5L caja')).toEqual(['agua', 'fuente', 'alta']);
  });

  it('propone la familia de los de nombre parecido, con el más parecido de ejemplo', () => {
    expect(categoriaParecida('Agua Fuente Alta 6x1,5L', catalogo)).toEqual({ categoria: 'bebidas', ejemplo: 'Agua Fuente Alta 1,5L' });
  });

  it('la primera palabra pesa más: un aceite es aceite aunque otro lleve aceite detrás', () => {
    expect(categoriaParecida('Aceite girasol 5L', catalogo)?.categoria).toBe('aceites');
  });

  it('sin nada en común no propone nada', () => {
    expect(categoriaParecida('Escoba de barrer', catalogo)).toBeNull();
  });

  it('no se compara consigo mismo al editar', () => {
    expect(categoriaParecida('Agua con gas 50cl', [catalogo[1]], 'b')).toBeNull();
  });
});

describe('impuesto y margen de la familia', () => {
  const catalogo = [
    producto('a', 'Agua 1', 'bebidas', { defaultTaxRate: 3, unitPrice: 1, purchasePrice: 0.6 }),
    producto('b', 'Agua 2', 'bebidas', { defaultTaxRate: 3, unitPrice: 2, purchasePrice: 1.5 }),
    producto('c', 'Zumo', 'bebidas', { defaultTaxRate: 7, unitPrice: 2, purchasePrice: 1 }),
    producto('d', 'Gancho', 'bebidas', { defaultTaxRate: 7, unitPrice: 1, purchasePrice: 1 }),
  ];

  it('el impuesto que más se repite', () => {
    expect(impuestoHabitual('bebidas', catalogo.slice(0, 3))).toBe(3);
    expect(impuestoHabitual('lacteos', catalogo)).toBeNull();
  });

  it('el margen es la mediana sobre la venta; lo vendido a coste no cuenta', () => {
    // 40 %, 25 % y 50 % → mediana 40 %.
    expect(margenHabitual('bebidas', catalogo)).toBeCloseTo(0.4);
  });

  it('con un solo artículo no hay costumbre', () => {
    expect(margenHabitual('bebidas', [catalogo[0]])).toBeNull();
  });

  it('el precio que deja ese margen', () => {
    expect(precioConMargen(0.9, 0.4)).toBe(1.5);
    expect(precioConMargen(0, 0.4)).toBe(0);
  });
});

describe('sugerencias de la ficha', () => {
  const catalogo = [
    producto('a', 'Agua Fuente Alta 1,5L', 'bebidas', { defaultTaxRate: 3, unitPrice: 1, purchasePrice: 0.6 }),
    producto('b', 'Agua mineral 50cl', 'bebidas', { defaultTaxRate: 3, unitPrice: 0.5, purchasePrice: 0.3 }),
  ];
  const ficha = { name: 'Agua Fuente Alta 6x1,5L', category: 'otros', defaultTaxRate: 7, unitPrice: 0, unitsPerPackage: '', coste: 0.9 };

  it('propone las cuatro cosas, cuadradas con la familia propuesta', () => {
    const s = sugerenciasFicha(ficha, catalogo, { nombreCategoria: id => (id === 'bebidas' ? 'Bebidas' : id) });
    expect(s.map(x => [x.campo, x.valor])).toEqual([
      ['unitsPerPackage', 6], ['category', 'bebidas'], ['defaultTaxRate', 3], ['unitPrice', 1.5],
    ]);
    expect(s[1].motivo).toBe('como «Agua Fuente Alta 1,5L»');
  });

  it('nunca propone sobre lo escrito a mano', () => {
    const tocados = new Set<CampoSugerido>(['unitsPerPackage', 'unitPrice']);
    const s = sugerenciasFicha(ficha, catalogo, { tocados });
    expect(s.map(x => x.campo)).toEqual(['category', 'defaultTaxRate']);
  });

  it('con la familia elegida a mano, el impuesto y el precio salen de esa familia', () => {
    const s = sugerenciasFicha({ ...ficha, category: 'otros' }, catalogo, { tocados: new Set<CampoSugerido>(['category']) });
    expect(s.map(x => x.campo)).toEqual(['unitsPerPackage']);
  });

  it('lo que ya coincide no se vuelve a proponer', () => {
    const s = sugerenciasFicha({ ...ficha, category: 'bebidas', defaultTaxRate: 3, unitPrice: 1.5, unitsPerPackage: '6' }, catalogo);
    expect(s).toEqual([]);
  });

  it('sin nombre no hay nada que proponer', () => {
    expect(sugerenciasFicha({ ...ficha, name: '  ' }, catalogo)).toEqual([]);
  });
});
