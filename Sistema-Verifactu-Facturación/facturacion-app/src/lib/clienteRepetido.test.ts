import { describe, expect, it } from 'vitest';
import { fichasParecidas, nombreEnAviso, nombreParaComparar, parecidoDeLetras, parecidoDeNombres } from './clienteRepetido';

// Fichas inventadas: ningún NIF ni nombre es de nadie real.
const fichas = [
  { id: 'c1', nif: 'B35123454', businessName: 'Bar Pepe S.L.', tradeName: '' },
  { id: 'c2', nif: '12345678Z', businessName: 'Ana Rivero Déniz', tradeName: 'Frutería La Plaza' },
  { id: 'c3', nif: 'B38000014', businessName: 'Distribuciones Hermanos Suárez SL', tradeName: '' },
  { id: 'c4', nif: '', businessName: 'Hotel Sol Playa', tradeName: '' },
  { id: 'c5', nif: 'B35777770', businessName: 'Supermercados Dino Teror S.L.U.', tradeName: 'Dino Teror' },
];

describe('nombreParaComparar', () => {
  it('quita la forma jurídica, se escriba como se escriba', () => {
    for (const n of ['Bar Pepe S.L.', 'BAR PEPE SL', 'Bar Pepe, S. L.', 'bar pepe s.l.u.', 'Bar Pepe Sociedad Limitada']) {
      expect(nombreParaComparar(n)).toBe('pepe');
    }
  });

  it('quita tildes, mayúsculas y el tipo de local', () => {
    expect(nombreParaComparar('BAR-RESTAURANTE PEPÉ')).toBe('pepe');
    expect(nombreParaComparar('Cafetería El Puerto')).toBe('puerto');
    expect(nombreParaComparar('Restaurante Casa Pepe')).toBe('casa pepe');
  });

  it('entiende abreviaturas y plurales', () => {
    expect(nombreParaComparar('Distrib. Hnos. Suárez')).toBe(nombreParaComparar('Distribuciones Hermanos Suarez'));
    expect(nombreParaComparar('Supermercados Dino')).toBe('dino');
  });

  it('no deja nada de un nombre que solo es el tipo de local', () => {
    expect(nombreParaComparar('Bar')).toBe('');
    expect(nombreParaComparar('')).toBe('');
  });

  it('no confunde «sa» o «sl» dentro de otra palabra', () => {
    expect(nombreParaComparar('Casa Salvador')).toBe('casa salvador');
  });
});

describe('parecido', () => {
  it('aguanta erratas', () => {
    expect(parecidoDeLetras('suarez', 'suares')).toBeGreaterThan(0.7);
    expect(parecidoDeNombres('Distribuciones Hermanos Suárez', 'Distribuciones Hermanos Suares')).toBeGreaterThan(0.85);
  });

  it('las palabras del nombre corto dentro del largo cuentan', () => {
    expect(parecidoDeNombres('Frutería La Plaza', 'La Plaza Frutas y Verduras')).toBeLessThan(0.8);
    expect(parecidoDeNombres('Pepe Hermanos', 'Bar Pepe Hermanos Arucas')).toBeGreaterThanOrEqual(0.85);
  });

  it('una palabra corta suelta no basta', () => {
    expect(parecidoDeNombres('Sol', 'Hotel Sol Playa')).toBeLessThan(0.8);
  });

  it('nombres distintos se parecen poco', () => {
    expect(parecidoDeNombres('Bar Pepe', 'Bar Pepa')).toBeLessThan(0.8);
    expect(parecidoDeNombres('Bar Pepe', 'Ferretería Ramírez')).toBeLessThan(0.3);
  });
});

describe('fichasParecidas', () => {
  it('avisa por el mismo NIF aunque se escriba con guiones o con ES delante', () => {
    const r = fichasParecidas({ nif: 'b-35123454', nombre: 'Otro nombre' }, fichas);
    expect(r).toEqual([{ ficha: fichas[0], motivo: 'nif', parecido: 1 }]);
    expect(fichasParecidas({ nif: 'ESB35123454' }, fichas)[0]?.ficha.id).toBe('c1');
  });

  it('avisa por un nombre muy parecido', () => {
    const r = fichasParecidas({ nombre: 'BAR PEPE SL' }, fichas);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ motivo: 'nombre', parecido: 1 });
    expect(r[0].ficha.id).toBe('c1');
    expect(fichasParecidas({ nombre: 'Restaurante Pepe' }, fichas)[0]?.ficha.id).toBe('c1');
  });

  it('mira también el nombre comercial, en los dos lados', () => {
    expect(fichasParecidas({ nombre: 'Frutería la plaza' }, fichas)[0]?.ficha.id).toBe('c2');
    expect(fichasParecidas({ nombre: 'Comercial Teror SL', nombreComercial: 'Supermercado Dino Teror' }, fichas)[0]?.ficha.id).toBe('c5');
  });

  it('pone primero el NIF y luego el más parecido', () => {
    const r = fichasParecidas({ nif: 'B38000014', nombre: 'Bar Pepe' }, fichas);
    expect(r.map(x => x.ficha.id)).toEqual(['c3', 'c1']);
  });

  it('no avisa de la propia ficha al editarla', () => {
    expect(fichasParecidas({ nif: 'B35123454', nombre: 'Bar Pepe S.L.' }, fichas, { excluirId: 'c1' })).toEqual([]);
  });

  it('sin nada que comparar, no avisa', () => {
    expect(fichasParecidas({ nif: '', nombre: '' }, fichas)).toEqual([]);
    expect(fichasParecidas({ nombre: 'Bar' }, fichas)).toEqual([]);
    expect(fichasParecidas({ nif: '123' }, [{ id: 'x', nif: '123', businessName: 'X' }])).toEqual([]);
  });

  it('un nombre nuevo de verdad no avisa', () => {
    expect(fichasParecidas({ nif: '45678912S', nombre: 'Panadería Los Hornos' }, fichas)).toEqual([]);
  });
});

describe('nombreEnAviso', () => {
  it('enseña el nombre fiscal y el principio del NIF', () => {
    expect(nombreEnAviso(fichas[0])).toBe('Bar Pepe S.L. (B35…)');
    expect(nombreEnAviso(fichas[3])).toBe('Hotel Sol Playa');
  });
});
