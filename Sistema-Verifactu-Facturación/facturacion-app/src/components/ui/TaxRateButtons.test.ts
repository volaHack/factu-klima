import { describe, expect, it } from 'vitest';
import { indiceTrasTecla, opcionesDeTipo, textoTipo } from './TaxRateButtons';

describe('opcionesDeTipo', () => {
  it('los tipos configurados, de menor a mayor y sin repetir', () => {
    expect(opcionesDeTipo([7, 3, 13, 0, 7], 7)).toEqual([
      { valor: 0, fuera: false },
      { valor: 3, fuera: false },
      { valor: 7, fuera: false },
      { valor: 13, fuera: false },
    ]);
  });

  it('un tipo que no está configurado sale como uno más, marcado como fuera', () => {
    const o = opcionesDeTipo([0, 3, 7, 15], 5);
    expect(o.map(x => x.valor)).toEqual([0, 3, 5, 7, 15]);
    expect(o.find(x => x.valor === 5)?.fuera).toBe(true);
    expect(o.filter(x => x.fuera)).toHaveLength(1);
  });

  it('el tipo con el que se abrió la línea se queda aunque se cambie', () => {
    // Abierta con un 20 % y cambiada al 7: el 20 sigue ahí para volver.
    expect(opcionesDeTipo([0, 3, 7], 7, 20).map(x => x.valor)).toEqual([0, 3, 7, 20]);
  });

  it('decimales como el 9,5 % del IGIC no se confunden ni se duplican', () => {
    expect(opcionesDeTipo([0, 9.5], 9.5).map(x => x.valor)).toEqual([0, 9.5]);
  });

  it('descarta lo que no es un porcentaje', () => {
    expect(opcionesDeTipo([NaN, -1, 7], 7).map(x => x.valor)).toEqual([7]);
  });
});

describe('indiceTrasTecla', () => {
  it('las flechas avanzan y retroceden dando la vuelta', () => {
    expect(indiceTrasTecla('ArrowRight', 0, 4)).toBe(1);
    expect(indiceTrasTecla('ArrowDown', 3, 4)).toBe(0);
    expect(indiceTrasTecla('ArrowLeft', 0, 4)).toBe(3);
    expect(indiceTrasTecla('ArrowUp', 2, 4)).toBe(1);
  });
  it('Inicio y Fin van a los extremos', () => {
    expect(indiceTrasTecla('Home', 2, 4)).toBe(0);
    expect(indiceTrasTecla('End', 0, 4)).toBe(3);
  });
  it('sin ninguno marcado, la flecha entra por el primero o el último', () => {
    expect(indiceTrasTecla('ArrowRight', -1, 4)).toBe(0);
    expect(indiceTrasTecla('ArrowLeft', -1, 4)).toBe(3);
  });
  it('el resto de teclas no hacen nada', () => {
    expect(indiceTrasTecla('Enter', 1, 4)).toBeNull();
    expect(indiceTrasTecla('ArrowRight', 0, 0)).toBeNull();
  });
});

describe('textoTipo', () => {
  it('con coma decimal y espacio fijo antes del %', () => {
    expect(textoTipo(7)).toBe('7 %');
    expect(textoTipo(9.5)).toBe('9,5 %');
  });
});
