import { describe, expect, it } from 'vitest';
import { codigoDesdeBytes, correoParaEmpresaNueva, normalizarCodigo, planDeUnion } from './grupo';

describe('códigos para unir cuentas', () => {
  it('salen con guion y sin letras confusas', () => {
    const c = codigoDesdeBytes(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]));
    expect(c).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(c).not.toMatch(/[01OIL]/);
  });
  it('se aceptan escritos de cualquier manera', () => {
    expect(normalizarCodigo(' k7pm 3qxa ')).toBe('K7PM-3QXA');
    expect(normalizarCodigo('K7PM-3QX')).toBeNull();
    expect(normalizarCodigo('K7PM-3QX0')).toBeNull();
  });
});

describe('correoParaEmpresaNueva', () => {
  it('etiqueta el correo del titular con el nombre de la empresa', () => {
    expect(correoParaEmpresaNueva('Ana.Lopez@Gmail.com', 'Bar La Esquina, S.L.', 'a1b2'))
      .toBe('ana.lopez+bar-la-esquina-s-l-a1b2@gmail.com');
  });
  it('quita tildes y no apila etiquetas', () => {
    expect(correoParaEmpresaNueva('ana+otra@x.es', 'Panadería Ñandú', 'z9')).toBe('ana+panaderia-nandu-z9@x.es');
  });
  it('sin nombre usable, «empresa»', () => {
    expect(correoParaEmpresaNueva('a@b.es', '***', 'q')).toBe('a+empresa-q@b.es');
  });
});

describe('planDeUnion', () => {
  const G = 'g-nuevo';
  it('dos sueltas forman un grupo nuevo', () => {
    expect(planDeUnion({ id: 'a', grupo: null }, { id: 'b', grupo: null }, G)).toEqual({ tipo: 'nuevo', grupo: G, entran: ['a', 'b'] });
  });
  it('la suelta entra en el grupo de la otra', () => {
    expect(planDeUnion({ id: 'a', grupo: 'g1' }, { id: 'b', grupo: null }, G)).toEqual({ tipo: 'entra', grupo: 'g1', entran: ['b'] });
    expect(planDeUnion({ id: 'a', grupo: null }, { id: 'b', grupo: 'g2' }, G)).toEqual({ tipo: 'entra', grupo: 'g2', entran: ['a'] });
  });
  it('dos grupos distintos se funden', () => {
    expect(planDeUnion({ id: 'a', grupo: 'g1' }, { id: 'b', grupo: 'g2' }, G)).toEqual({ tipo: 'fundir', grupo: 'g1', desde: 'g2' });
  });
  it('ya juntas, o la misma cuenta: nada', () => {
    expect(planDeUnion({ id: 'a', grupo: 'g1' }, { id: 'b', grupo: 'g1' }, G)).toEqual({ tipo: 'nada' });
    expect(planDeUnion({ id: 'a', grupo: null }, { id: 'a', grupo: null }, G)).toEqual({ tipo: 'nada' });
  });
});
