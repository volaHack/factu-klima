import { describe, it, expect } from 'vitest';

import { normalizarSugerencias } from './sugerencias';

const PERMITIDAS = new Set([
  'doc_numero',
  'cliente_nombre',
  'cliente_nif',
  'doc_fecha',
  'total_general',
]);

describe('las tres formas en que contesta un modelo', () => {
  it('la que se le pide: un objeto con la lista dentro', () => {
    const analisis = {
      sugerencias: [
        { id: 'c1', clave: 'doc_numero', motivo: 'Número de factura' },
        { id: 'c2', clave: null, motivo: 'No está claro' },
      ],
    };
    expect(normalizarSugerencias(analisis, PERMITIDAS)).toEqual([
      { id: 'c1', clave: 'doc_numero', motivo: 'Número de factura' },
      { id: 'c2', clave: null, motivo: 'No está claro' },
    ]);
  });

  it('la lista a pelo, sin el envoltorio', () => {
    const analisis = [{ id: 'c1', clave: 'cliente_nif', motivo: 'NIF' }];
    expect(normalizarSugerencias(analisis, PERMITIDAS)).toEqual([
      { id: 'c1', clave: 'cliente_nif', motivo: 'NIF' },
    ]);
  });

  it('el mapa plano, que es lo que devolvió Qwen 3 4B de verdad', () => {
    // Éste es el caso que tiraba la respuesta entera y devolvía cero
    // sugerencias sin un solo error: el usuario veía que la IA «no había
    // encontrado nada» cuando en realidad lo había acertado todo.
    const analisis = {
      c1: 'doc_numero',
      c2: 'cliente_nombre',
      c3: 'cliente_nif',
      c4: 'total_general',
    };
    expect(normalizarSugerencias(analisis, PERMITIDAS)).toEqual([
      { id: 'c1', clave: 'doc_numero', motivo: '' },
      { id: 'c2', clave: 'cliente_nombre', motivo: '' },
      { id: 'c3', clave: 'cliente_nif', motivo: '' },
      { id: 'c4', clave: 'total_general', motivo: '' },
    ]);
  });

  it('en el mapa plano, «no sé» se respeta', () => {
    const analisis = { c1: null, c2: 'null', c3: '' };
    expect(normalizarSugerencias(analisis, PERMITIDAS)).toEqual([
      { id: 'c1', clave: null, motivo: '' },
      { id: 'c2', clave: null, motivo: '' },
      { id: 'c3', clave: null, motivo: '' },
    ]);
  });
});

describe('lo que nunca debe pasar del filtro', () => {
  it('una clave inventada se tira, venga como venga', () => {
    // Es la regla que no se negocia: un campo equivocado imprime el NIF
    // de un cliente donde va el total.
    expect(normalizarSugerencias({ sugerencias: [{ id: 'c1', clave: 'iban_secreto', motivo: 'x' }] }, PERMITIDAS))
      .toEqual([]);
    expect(normalizarSugerencias({ c1: 'iban_secreto' }, PERMITIDAS)).toEqual([]);
  });

  it('una sugerencia sin id no sirve para nada', () => {
    expect(normalizarSugerencias({ sugerencias: [{ clave: 'doc_numero', motivo: 'x' }] }, PERMITIDAS))
      .toEqual([]);
  });

  it('el motivo se recorta y lo que no sea texto se ignora', () => {
    const largo = 'a'.repeat(400);
    const [s] = normalizarSugerencias({ sugerencias: [{ id: 'c1', clave: 'doc_numero', motivo: largo }] }, PERMITIDAS);
    expect(s.motivo).toHaveLength(120);

    const [s2] = normalizarSugerencias({ sugerencias: [{ id: 'c1', clave: 'doc_numero', motivo: 42 }] }, PERMITIDAS);
    expect(s2.motivo).toBe('');
  });

  it('una respuesta con forma imposible no revienta, devuelve nada', () => {
    expect(normalizarSugerencias(null, PERMITIDAS)).toEqual([]);
    expect(normalizarSugerencias('texto suelto', PERMITIDAS)).toEqual([]);
    expect(normalizarSugerencias(42, PERMITIDAS)).toEqual([]);
    expect(normalizarSugerencias({}, PERMITIDAS)).toEqual([]);
    expect(normalizarSugerencias({ sugerencias: 'no es una lista' }, PERMITIDAS)).toEqual([]);
  });

  it('sin claves permitidas no pasa ninguna', () => {
    expect(normalizarSugerencias({ c1: 'doc_numero' }, new Set())).toEqual([]);
  });
});
