import { describe, expect, it } from 'vitest';
import { ajustarACuadricula, calcularImanes } from './editor';
import { esquemaDeForma } from './plantilla';
import type { FormaDibujo } from './tipos';

const PAGINA = { ancho: 210, alto: 297 };

describe('cuadrícula', () => {
  it('lleva al múltiplo más cercano sin decimales sueltos', () => {
    expect(ajustarACuadricula(12.4, 5)).toBe(10);
    expect(ajustarACuadricula(12.6, 5)).toBe(15);
    expect(ajustarACuadricula(0.36, 0.1)).toBe(0.4);
    expect(ajustarACuadricula(12.37, 0)).toBe(12.37);
  });

  it('sin imán cerca, la caja cae en el cruce de la cuadrícula', () => {
    const r = calcularImanes({ x: 41.3, y: 63.8, ancho: 30, alto: 6 }, [], PAGINA, 0.5, { cuadricula: 2 });
    expect(r).toMatchObject({ x: 42, y: 64 });
    expect(r.guias).toEqual([]);
  });
});

describe('guías del usuario', () => {
  it('una guía agarra la caja y se dibuja', () => {
    const r = calcularImanes({ x: 119.6, y: 50, ancho: 30, alto: 6 }, [], PAGINA, 1, {
      guias: [{ eje: 'x', valor: 120 }],
    });
    expect(r.x).toBe(120);
    expect(r.guias).toContainEqual({ eje: 'x', valor: 120 });
  });

  it('también por el borde derecho de la caja', () => {
    const r = calcularImanes({ x: 89.7, y: 50, ancho: 30, alto: 6 }, [], PAGINA, 1, {
      guias: [{ eje: 'x', valor: 120 }],
    });
    expect(r.x + 30).toBeCloseTo(120);
  });

  it('el imán gana a la cuadrícula', () => {
    const r = calcularImanes({ x: 119.6, y: 50.3, ancho: 30, alto: 6 }, [], PAGINA, 1, {
      guias: [{ eje: 'x', valor: 120 }], cuadricula: 5,
    });
    expect(r.x).toBe(120);
    expect(r.y).toBe(50);
  });
});

describe('formas en el PDF', () => {
  const forma = (cambios: Partial<FormaDibujo>): FormaDibujo => ({
    id: 'f', tipo: 'rectangulo', x: 10, y: 20, ancho: 100, alto: 30, color: '#111111', grosor: 0.3, relleno: '', radio: 0, ...cambios,
  });

  it('una línea horizontal es una barra del grueso exacto centrada en su caja', () => {
    const e = esquemaDeForma(forma({ tipo: 'linea', alto: 2, grosor: 0.5 }), 0) as unknown as Record<string, unknown>;
    expect(e).toMatchObject({ type: 'rectangle', position: { x: 10, y: 20.75 }, width: 100, height: 0.5, color: '#111111', borderWidth: 0 });
  });

  it('y una vertical, igual de pie', () => {
    const e = esquemaDeForma(forma({ tipo: 'linea', ancho: 2, alto: 80, grosor: 0.4 }), 1) as unknown as Record<string, unknown>;
    expect(e).toMatchObject({ position: { x: 10.8, y: 20 }, width: 0.4, height: 80 });
  });

  it('recuadro con borde, relleno y esquinas redondeadas', () => {
    const e = esquemaDeForma(forma({ relleno: '#f5f5f5', radio: 2 }), 2) as unknown as Record<string, unknown>;
    expect(e).toMatchObject({ type: 'rectangle', color: '#f5f5f5', borderWidth: 0.3, borderColor: '#111111', radius: 2, name: '__forma_2', readOnly: true });
  });

  it('óvalo', () => {
    const e = esquemaDeForma(forma({ tipo: 'elipse' }), 3) as unknown as Record<string, unknown>;
    expect(e.type).toBe('ellipse');
    expect(e.radius).toBeUndefined();
  });
});
