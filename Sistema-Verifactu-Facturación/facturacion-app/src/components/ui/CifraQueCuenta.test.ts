import { describe, expect, it } from 'vitest';
import { escribirCifra, partirCifra } from './CifraQueCuenta';

describe('partirCifra', () => {
  it('lee un importe con miles, decimales y símbolo', () => {
    expect(partirCifra('3.796,16 €')).toEqual({ antes: '', valor: 3796.16, decimales: 2, despues: ' €' });
  });
  it('lee un número entero suelto', () => {
    expect(partirCifra('12')).toEqual({ antes: '', valor: 12, decimales: 0, despues: '' });
  });
  it('lee millones y negativos', () => {
    expect(partirCifra('-1.240.000,50 €')?.valor).toBe(-1240000.5);
  });
  it('sin número no hay nada que contar', () => {
    expect(partirCifra('—')).toBeNull();
  });
});

describe('escribirCifra', () => {
  it('vuelve al mismo formato que la app', () => {
    expect(escribirCifra(3796.16, 2)).toBe('3.796,16');
    expect(escribirCifra(1240000.5, 2)).toBe('1.240.000,50');
    expect(escribirCifra(12, 0)).toBe('12');
    expect(escribirCifra(0, 2)).toBe('0,00');
  });
  it('partir y escribir dan el mismo texto', () => {
    for (const t of ['3.796,16 €', '11.190,37 €', '24 activos', '0,00 €']) {
      const p = partirCifra(t)!;
      expect(`${p.antes}${escribirCifra(p.valor, p.decimales)}${p.despues}`).toBe(t);
    }
  });
});
