import { describe, it, expect } from 'vitest';
import { botonesPagina, esTamanoPagina, paginaValida, rango, totalPaginas, trozo } from './paginacion';

describe('paginación', () => {
  it('cuenta las páginas, con una como mínimo aunque la lista esté vacía', () => {
    expect(totalPaginas(0, 25)).toBe(1);
    expect(totalPaginas(25, 25)).toBe(1);
    expect(totalPaginas(26, 25)).toBe(2);
    expect(totalPaginas(240, 50)).toBe(5);
  });

  it('devuelve una página válida cuando la lista encoge al filtrar', () => {
    expect(paginaValida(8, 30, 25)).toBe(2);
    expect(paginaValida(0, 30, 25)).toBe(1);
    expect(paginaValida(Number.NaN, 30, 25)).toBe(1);
    expect(paginaValida(3, 0, 25)).toBe(1);
  });

  it('corta el trozo de la página, también si la página ya no existe', () => {
    const lista = Array.from({ length: 60 }, (_, i) => i + 1);
    expect(trozo(lista, 1, 25)).toEqual(lista.slice(0, 25));
    expect(trozo(lista, 3, 25)).toEqual([51, 52, 53, 54, 55, 56, 57, 58, 59, 60]);
    expect(trozo(lista, 9, 25)).toEqual(lista.slice(50));
  });

  it('dice qué filas se están viendo', () => {
    expect(rango(1, 240, 25)).toEqual({ desde: 1, hasta: 25 });
    expect(rango(10, 240, 25)).toEqual({ desde: 226, hasta: 240 });
    expect(rango(1, 0, 25)).toEqual({ desde: 0, hasta: 0 });
  });

  it('enseña todas las páginas cuando son pocas', () => {
    expect(botonesPagina(1, 1)).toEqual([1]);
    expect(botonesPagina(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('salta páginas con un hueco y mantiene primera, última y vecinas', () => {
    expect(botonesPagina(1, 20)).toEqual([1, 2, 3, 4, 'hueco', 20]);
    expect(botonesPagina(10, 20)).toEqual([1, 'hueco', 9, 10, 11, 'hueco', 20]);
    expect(botonesPagina(20, 20)).toEqual([1, 'hueco', 17, 18, 19, 20]);
  });

  it('no pone un hueco que sólo escondería una página', () => {
    expect(botonesPagina(4, 20)).toEqual([1, 2, 3, 4, 5, 'hueco', 20]);
    expect(botonesPagina(17, 20)).toEqual([1, 'hueco', 16, 17, 18, 19, 20]);
  });

  it('sólo acepta los tamaños que se ofrecen', () => {
    expect(esTamanoPagina(50)).toBe(true);
    expect(esTamanoPagina(30)).toBe(false);
    expect(esTamanoPagina('25')).toBe(false);
  });
});
