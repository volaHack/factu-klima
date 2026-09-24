import { describe, it, expect } from 'vitest';
import { comprobarNifYNombre, formaJuridicaDelNombre, problemasParaEmitir, resumenDeErrores } from './identidad';

const errores = (p: ReturnType<typeof comprobarNifYNombre>) => p.filter(x => x.gravedad === 'error');
const avisos = (p: ReturnType<typeof comprobarNifYNombre>) => p.filter(x => x.gravedad === 'aviso');

const EMISOR = { businessName: 'Ejemplo S.L.', nif: 'B12345674', address: 'Calle Mayor 1, Valencia' };

describe('formaJuridicaDelNombre', () => {
  it.each([
    ['Distribuciones Pepe S.L.', 'SL'], ['Distribuciones Pepe SL', 'SL'], ['Pepe, S. L. U.', 'SL'],
    ['Pepe Sociedad Limitada', 'SL'], ['Supermercados Sol y Luna S.A.', 'SA'], ['Hierros SAU', 'SA'],
    ['Frutas del Sur S.Coop.', 'COOP'], ['Hermanos García C.B.', 'CB'], ['Taller Ruiz S.C.', 'SC'],
    ['Comunidad de Propietarios Calle Sol 3', 'COM_PROPIETARIOS'], ['Asociación Cultural Los Amigos', 'ASOCIACION'],
    ['Ayuntamiento de Valencia', 'AYUNTAMIENTO'], ['Naranjas SAT nº 123', 'SAT'],
  ])('«%s» → %s', (nombre, forma) => {
    expect(formaJuridicaDelNombre(nombre)).toBe(forma);
  });

  it.each(['María Fernández García', 'Bar La Esquina', 'Casals Obres', 'Juan Salas', 'Frutería Pepe'])(
    '«%s» no declara forma', nombre => {
      expect(formaJuridicaDelNombre(nombre)).toBeNull();
    },
  );
});

describe('comprobarNifYNombre', () => {
  it('un par correcto no da problemas', () => {
    expect(comprobarNifYNombre('B12345674', 'Distribuciones Pepe S.L.')).toEqual([]);
    expect(comprobarNifYNombre('12345678Z', 'María Fernández García')).toEqual([]);
    expect(comprobarNifYNombre('A12345674', 'Hierros del Norte S.A.')).toEqual([]);
  });

  it('NIF con la letra mal', () => {
    expect(errores(comprobarNifYNombre('12345678A', 'María'))[0].mensaje).toMatch(/control/);
  });

  it('DNI con nombre de sociedad: error', () => {
    const e = errores(comprobarNifYNombre('12345678Z', 'Distribuciones Pepe S.L.'));
    expect(e).toHaveLength(1);
    expect(e[0].mensaje).toMatch(/persona física/);
  });

  it('«Sa» como apellido no se toma por anónima', () => {
    expect(comprobarNifYNombre('12345678Z', 'María Sa')).toEqual([]);
  });

  it('S.A. con NIF de limitada (y al revés): error', () => {
    expect(errores(comprobarNifYNombre('B12345674', 'Hierros del Norte S.A.'))).toHaveLength(1);
    expect(errores(comprobarNifYNombre('A12345674', 'Pepe S.L.'))).toHaveLength(1);
  });

  it('otras formas que no cuadran con la letra: aviso', () => {
    const p = comprobarNifYNombre('B12345674', 'Asociación Vecinal del Barrio');
    expect(errores(p)).toHaveLength(0);
    expect(avisos(p)).toHaveLength(1);
  });

  it('limitada sin «S.L.» en el nombre: aviso de que parece el comercial', () => {
    const p = comprobarNifYNombre('B12345674', 'Bar La Esquina');
    expect(errores(p)).toHaveLength(0);
    expect(avisos(p)[0].mensaje).toMatch(/razón social/);
  });

  it('faltan datos', () => {
    expect(errores(comprobarNifYNombre('', 'Pepe'))[0].campo).toBe('nif');
    expect(errores(comprobarNifYNombre('B12345674', ''))[0].campo).toBe('nombre');
  });
});

describe('problemasParaEmitir', () => {
  const completa = { clientName: 'Distribuciones Pepe S.L.', clientNif: 'B12345674', clientAddress: 'C/ Sol 1' };

  it('una factura correcta se puede emitir', () => {
    expect(resumenDeErrores(problemasParaEmitir(completa, EMISOR))).toBeNull();
  });

  it('el NIF de la empresa mal bloquea todas las facturas, también los tickets', () => {
    const p = problemasParaEmitir({ posSessionId: 's1' }, { ...EMISOR, nif: 'B12345678' });
    expect(resumenDeErrores(p)).toMatch(/tu empresa.*Ajustes/);
  });

  it('un ticket sin cliente no pide domicilio a nadie', () => {
    expect(problemasParaEmitir({ posSessionId: 's1' }, { ...EMISOR, address: '' })).toEqual([]);
  });

  it('factura completa sin domicilio del cliente: error', () => {
    const p = problemasParaEmitir({ ...completa, clientAddress: '' }, EMISOR);
    expect(p.some(x => x.gravedad === 'error' && x.campo === 'domicilio')).toBe(true);
  });

  it('cliente extranjero de fuera de la UE: no se le pide NIF español', () => {
    const p = problemasParaEmitir({ clientName: 'ACME Inc.', clientNif: '98-7654321', clientAddress: 'NY' }, EMISOR, 'Estados Unidos');
    expect(resumenDeErrores(p)).toBeNull();
  });

  it('intracomunitaria: se valida el NIF-IVA', () => {
    const bien = problemasParaEmitir({ clientName: 'Client FR', clientVatNumber: 'FR12345678901', esIntracomunitaria: true, clientAddress: 'Paris' }, EMISOR, 'Francia');
    expect(resumenDeErrores(bien)).toBeNull();
    const mal = problemasParaEmitir({ clientName: 'Client FR', clientVatNumber: 'FR12', esIntracomunitaria: true, clientAddress: 'Paris' }, EMISOR, 'Francia');
    expect(resumenDeErrores(mal)).not.toBeNull();
  });

  it('el mensaje explica por qué se para', () => {
    const r = resumenDeErrores(problemasParaEmitir({ ...completa, clientNif: '12345678Z' }, EMISOR));
    expect(r).toMatch(/ya no se puede cambiar/);
    expect(r).toMatch(/persona física/);
  });
});
