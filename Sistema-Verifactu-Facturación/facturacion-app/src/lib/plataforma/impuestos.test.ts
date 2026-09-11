import { describe, it, expect } from 'vitest';
import { zonaFiscal, tratamiento, baseQueCuadra } from './impuestos';

describe('zonaFiscal', () => {
  it.each([
    ['35001', 'canarias'], ['38400', 'canarias'], ['41001', 'peninsula_baleares'], ['07001', 'peninsula_baleares'],
    ['51001', 'ceuta_melilla'], ['52001', 'ceuta_melilla'], ['', 'desconocida'], ['1234', 'desconocida'], ['99000', 'desconocida'],
  ])('%s → %s', (cp, zona) => expect(zonaFiscal(cp)).toBe(zona));
});

describe('tratamiento', () => {
  it('Canarias en régimen general: IGIC 7 %', () => {
    expect(tratamiento('canarias', 'general')).toMatchObject({ tipo: 7, calificacion: null });
  });
  it('península: sin impuesto, no sujeta por localización (N2) y con mención', () => {
    const t = tratamiento('peninsula_baleares', 'general')!;
    expect(t).toMatchObject({ tipo: 0, calificacion: 'N2' });
    expect(t.mencion).toContain('inversión del sujeto pasivo');
  });
  it('pequeño empresario: exenta en Canarias', () => {
    expect(tratamiento('canarias', 'pequeno_empresario')).toMatchObject({ tipo: 0, calificacion: null });
  });
  it('Ceuta, Melilla y desconocida no se facturan solas', () => {
    expect(tratamiento('ceuta_melilla', 'general')).toBeNull();
    expect(tratamiento('desconocida', 'general')).toBeNull();
  });
});

describe('baseQueCuadra', () => {
  it('5 € al 7 %', () => expect(baseQueCuadra(5, 7)).toEqual({ base: 4.67, cuota: 0.33 }));
  it('79 € al 7 %', () => expect(baseQueCuadra(79, 7)).toEqual({ base: 73.83, cuota: 5.17 }));
  it('siempre cuadra al céntimo, de 1 € a 1.500 €', () => {
    for (let c = 100; c <= 150000; c++) {
      const total = c / 100;
      const { base, cuota } = baseQueCuadra(total, 7);
      expect(Math.round((base + cuota) * 100)).toBe(c);
    }
  });
});
