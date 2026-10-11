import { describe, expect, it } from 'vitest';
import type { SesionGuardada } from './memoria';
import { cambiadas, fusionarSesiones, huellaSesion } from './nube';

function sesion(id: string, ultimo: number, mensajes = 1): SesionGuardada {
  return {
    id, titulo: `t-${id}`, creadaEn: 1, ultimoMensaje: ultimo,
    mensajes: Array.from({ length: mensajes }, (_, i) => ({ id: `${id}-${i}`, deQuien: 'persona' as const, texto: 'hola', hora: ultimo })),
  };
}

describe('fusionarSesiones', () => {
  it('junta las de la nube y las del navegador sin repetir', () => {
    const r = fusionarSesiones([sesion('a', 5)], [sesion('b', 3)]);
    expect(r.map(s => s.id)).toEqual(['a', 'b']);
  });

  it('de una misma conversación se queda con la más reciente', () => {
    const r = fusionarSesiones([sesion('a', 5, 2)], [sesion('a', 9, 4)]);
    expect(r).toHaveLength(1);
    expect(r[0].mensajes).toHaveLength(4);
  });

  it('con la misma fecha manda la de la nube', () => {
    const nube = sesion('a', 5, 2);
    const r = fusionarSesiones([nube], [sesion('a', 5, 1)]);
    expect(r[0]).toBe(nube);
  });

  it('ordena de la más reciente a la más vieja', () => {
    const r = fusionarSesiones([sesion('a', 1), sesion('b', 7)], [sesion('c', 4)]);
    expect(r.map(s => s.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('cambiadas', () => {
  it('sólo devuelve las que no se han subido o han cambiado desde la última vez', () => {
    const a = sesion('a', 1), b = sesion('b', 2);
    const subidas = new Map([[a.id, huellaSesion(a)], [b.id, huellaSesion(b)]]);
    const b2 = { ...b, ultimoMensaje: 3, mensajes: [...b.mensajes, { id: 'x', deQuien: 'asistente' as const, texto: 'ok', hora: 3 }] };
    const c = sesion('c', 4);
    expect(cambiadas([a, b2, c], subidas).map(s => s.id)).toEqual(['b', 'c']);
  });

  it('cambiar el título también cuenta', () => {
    const a = sesion('a', 1);
    const subidas = new Map([[a.id, huellaSesion(a)]]);
    expect(cambiadas([{ ...a, titulo: 'otro' }], subidas)).toHaveLength(1);
  });
});
