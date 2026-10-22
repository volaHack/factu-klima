import { describe, it, expect } from 'vitest';

import { porTrozos, todasLasFilas } from './porTandas';

/** Un servidor que, como Supabase, no devuelve más de `tope` filas por petición. */
function servidor(total: number, tope: number) {
  const filas = Array.from({ length: total }, (_, i) => i);
  const pedidas: [number, number][] = [];
  const pedir = async (desde: number, hasta: number) => {
    pedidas.push([desde, hasta]);
    return { data: filas.slice(desde, Math.min(hasta + 1, desde + tope)), error: null };
  };
  return { pedir, pedidas };
}

describe('leer más de mil filas', () => {
  it('1.469 artículos llegan todos, en dos tandas', async () => {
    const s = servidor(1469, 1000);
    const { data } = await todasLasFilas(s.pedir);
    expect(data).toHaveLength(1469);
    expect(data?.[1468]).toBe(1468);
    expect(s.pedidas).toEqual([[0, 999], [1000, 1999]]);
  });

  it('con menos de mil basta una petición', async () => {
    const s = servidor(414, 1000);
    expect((await todasLasFilas(s.pedir)).data).toHaveLength(414);
    expect(s.pedidas).toHaveLength(1);
  });

  it('justo mil: la segunda tanda llega vacía y ahí se para', async () => {
    const s = servidor(1000, 1000);
    expect((await todasLasFilas(s.pedir)).data).toHaveLength(1000);
    expect(s.pedidas).toHaveLength(2);
  });

  it('un error en cualquier tanda es un error, no una lista a medias', async () => {
    let n = 0;
    const r = await todasLasFilas(async () => (n++ === 0
      ? { data: Array(1000).fill(0), error: null }
      : { data: null, error: new Error('caído') }));
    expect(r.data).toBeNull();
    expect(r.error).toBeInstanceOf(Error);
  });
});

describe('listas largas de ids, por trozos', () => {
  it('3.000 facturas se piden en 20 trozos de 150 y no se pierde ninguna línea', async () => {
    const ids = Array.from({ length: 3000 }, (_, i) => `f${i}`);
    const trozos: number[] = [];
    const { data } = await porTrozos(ids, async t => {
      trozos.push(t.length);
      return { data: t.map(id => ({ invoice_id: id })), error: null };
    });
    expect(trozos).toHaveLength(20);
    expect(data).toHaveLength(3000);
  });

  it('sin ids no se pide nada', async () => {
    let pedidas = 0;
    const { data } = await porTrozos([], async () => { pedidas++; return { data: [], error: null }; });
    expect(data).toEqual([]);
    expect(pedidas).toBe(0);
  });
});
