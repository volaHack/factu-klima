import { describe, expect, it } from 'vitest';
import { huellaDe, normalizarMensaje, normalizarRuta } from './huella';
import { agruparErrores, type FilaError } from './agrupar';
import { esRuido } from './cliente';

describe('huella de un error', () => {
  it('quita lo que cambia de una vez a otra', () => {
    expect(normalizarMensaje('La factura 3f2a1b4c-1111-4222-8333-444455556666 no existe (total 12,50)'))
      .toBe('La factura <id> no existe (total <n>)');
    expect(normalizarRuta('/facturas/3f2a1b4c-1111-4222-8333-444455556666/editar?x=1')).toBe('/facturas/[id]/editar');
  });

  it('el mismo fallo con distinto id da la misma huella; otro fallo, otra', () => {
    const a = huellaDe('navegador', 'No existe 3f2a1b4c-1111-4222-8333-444455556666', '/facturas/3f2a1b4c-1111-4222-8333-444455556666');
    const b = huellaDe('navegador', 'No existe 9c1b2d3e-1111-4222-8333-444455556666', '/facturas/9c1b2d3e-1111-4222-8333-444455556666');
    expect(a).toBe(b);
    expect(huellaDe('servidor', 'No existe x', '/facturas')).not.toBe(a);
  });
});

describe('agrupar', () => {
  const f = (over: Partial<FilaError>): FilaError => ({
    id: 1, creado_en: '2026-09-20T10:00:00Z', origen: 'navegador', mensaje: 'Fallo', pila: null, ruta: '/x',
    huella: 'h1', user_id: 'u1', navegador: null, version: null, resuelto: false, ...over,
  });

  it('cuenta veces, cuentas distintas, primera y última', () => {
    const g = agruparErrores([
      f({ id: 1, creado_en: '2026-09-20T10:00:00Z' }),
      f({ id: 2, creado_en: '2026-09-22T10:00:00Z', user_id: 'u2' }),
      f({ id: 3, creado_en: '2026-09-21T10:00:00Z' }),
      f({ id: 4, huella: 'h2', creado_en: '2026-09-23T10:00:00Z', resuelto: true }),
    ]);
    expect(g.map(x => x.huella)).toEqual(['h2', 'h1']);
    expect(g[1]).toMatchObject({ veces: 3, cuentas: 2, primera: '2026-09-20T10:00:00Z', ultima: '2026-09-22T10:00:00Z', resuelto: false });
    expect(g[0].resuelto).toBe(true);
  });
});

describe('ruido del navegador', () => {
  it('no se apuntan extensiones, ResizeObserver ni peticiones canceladas', () => {
    expect(esRuido('ResizeObserver loop completed with undelivered notifications.')).toBe(true);
    expect(esRuido('Script error.')).toBe(true);
    expect(esRuido('x is undefined', 'at chrome-extension://abc/content.js:1')).toBe(true);
    expect(esRuido('The user aborted a request.')).toBe(true);
    expect(esRuido('')).toBe(true);
    expect(esRuido("Cannot read properties of undefined (reading 'total')")).toBe(false);
  });
});
