import { describe, it, expect } from 'vitest';

import { repartoPorFormaDePago, textoPorcentaje } from './repartoFormasPago';

describe('porcentajes de la cartera', () => {
  it('con espacio, redondeado, y lo muy pequeño no es cero', () => {
    expect(textoPorcentaje(242, 414)).toBe('58 %');
    expect(textoPorcentaje(1, 414)).toBe('<1 %');
    expect(textoPorcentaje(0, 414)).toBe('0 %');
    expect(textoPorcentaje(3, 0)).toBe('0 %');
    expect(textoPorcentaje(12, 12)).toBe('100 %');
  });
});

describe('reparto por forma de pago', () => {
  const de = (m: string | undefined, n: number) => Array.from({ length: n }, () => ({ defaultPaymentMethod: m }));

  it('de más a menos, con el nombre de la app y su porcentaje', () => {
    const r = repartoPorFormaDePago([...de('tarjeta', 1), ...de('efectivo', 242), ...de('domiciliacion', 7), ...de('transferencia', 164)]);
    expect(r.map(p => [p.nombre, p.cuantos, p.porcentaje])).toEqual([
      ['Efectivo', 242, '58 %'],
      ['Transferencia bancaria', 164, '40 %'],
      ['Domiciliación bancaria', 7, '2 %'],
      ['Tarjeta de crédito/débito', 1, '<1 %'],
    ]);
  });

  it('sin forma de pago cuenta como transferencia, y una desconocida se enseña tal cual', () => {
    const r = repartoPorFormaDePago([...de(undefined, 2), ...de('transferencia', 1), ...de('confirming', 1)]);
    expect(r).toEqual([
      { clave: 'transferencia', nombre: 'Transferencia bancaria', cuantos: 3, porcentaje: '75 %' },
      { clave: 'confirming', nombre: 'Confirming', cuantos: 1, porcentaje: '25 %' },
    ]);
  });

  it('sin contactos, nada', () => {
    expect(repartoPorFormaDePago([])).toEqual([]);
  });
});
