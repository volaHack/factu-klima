import { describe, expect, it } from 'vitest';
import { esCpCanario, esCpValido, limpiarCp, municipiosDeCp, provinciaDeCp, rellenoPorCp } from './codigosPostales';
import { PROVINCES } from './constants';

describe('provinciaDeCp', () => {
  it('saca la provincia de los dos primeros dígitos, en toda España', () => {
    expect(provinciaDeCp('35500')).toBe('Las Palmas');
    expect(provinciaDeCp('38001')).toBe('Santa Cruz de Tenerife');
    expect(provinciaDeCp('28013')).toBe('Madrid');
    expect(provinciaDeCp('07800')).toBe('Illes Balears');
    expect(provinciaDeCp('51001')).toBe('Ceuta');
  });

  it('le bastan dos cifras y acepta espacios o puntos', () => {
    expect(provinciaDeCp('35')).toBe('Las Palmas');
    expect(provinciaDeCp('35 500')).toBe('Las Palmas');
    expect(provinciaDeCp('CP 38.200')).toBe('Santa Cruz de Tenerife');
  });

  it('no inventa provincias', () => {
    expect(provinciaDeCp('')).toBeNull();
    expect(provinciaDeCp('3')).toBeNull();
    expect(provinciaDeCp('00123')).toBeNull();
    expect(provinciaDeCp('53000')).toBeNull();
    expect(provinciaDeCp('99999')).toBeNull();
  });

  it('escribe cada provincia igual que la lista del formulario', () => {
    for (let n = 1; n <= 52; n++) {
      const p = provinciaDeCp(String(n).padStart(2, '0') + '000');
      expect(PROVINCES).toContain(p);
    }
  });
});

describe('municipiosDeCp', () => {
  it('conoce los municipios canarios de un código', () => {
    expect(municipiosDeCp('35500')).toEqual(['Arrecife']);
    expect(municipiosDeCp('35600')).toEqual(['Puerto del Rosario']);
    expect(municipiosDeCp('38900')).toEqual(['Valverde']);
    expect(municipiosDeCp('38800')).toEqual(['San Sebastián de la Gomera']);
    expect(municipiosDeCp('38700')).toContain('Santa Cruz de la Palma');
    expect(municipiosDeCp('35001')).toEqual(['Las Palmas de Gran Canaria']);
    expect(municipiosDeCp('38201')).toEqual(['San Cristóbal de La Laguna']);
  });

  it('da todos cuando el código lo comparten varios municipios', () => {
    expect(municipiosDeCp('35220')).toEqual(expect.arrayContaining(['Telde', 'Las Palmas de Gran Canaria']));
    expect(municipiosDeCp('35220')).toHaveLength(2);
    expect(municipiosDeCp('35414').length).toBe(3);
  });

  it('fuera de Canarias, o a medio escribir, no da ninguno', () => {
    expect(municipiosDeCp('28013')).toEqual([]);
    expect(municipiosDeCp('3550')).toEqual([]);
    expect(municipiosDeCp('')).toEqual([]);
  });

  it('cubre los 88 municipios de las islas', () => {
    const todos = new Set<string>();
    for (const prefijo of ['35', '38']) {
      for (let n = 0; n < 1000; n++) municipiosDeCp(prefijo + String(n).padStart(3, '0')).forEach(m => todos.add(m));
    }
    expect(todos.size).toBe(88);
  });
});

describe('utilidades', () => {
  it('limpia, reconoce y valida', () => {
    expect(limpiarCp(' 35-500 ')).toBe('35500');
    expect(limpiarCp('355001')).toBe('35500');
    expect(esCpCanario('38001')).toBe(true);
    expect(esCpCanario('28001')).toBe(false);
    expect(esCpValido('35500')).toBe(true);
    expect(esCpValido('3550')).toBe(false);
    expect(esCpValido('60000')).toBe(false);
  });
});

describe('rellenoPorCp', () => {
  const vacio = { provincia: '', municipio: '' };

  it('rellena provincia y municipio en blanco', () => {
    expect(rellenoPorCp('35500', vacio)).toEqual({ provincia: 'Las Palmas', municipio: 'Arrecife', elegir: [] });
  });

  it('fuera de Canarias solo la provincia', () => {
    expect(rellenoPorCp('28013', vacio)).toEqual({ provincia: 'Madrid', elegir: [] });
  });

  it('con dos cifras ya pone la provincia', () => {
    expect(rellenoPorCp('38', vacio)).toEqual({ provincia: 'Santa Cruz de Tenerife', elegir: [] });
  });

  it('nunca pisa lo escrito a mano', () => {
    const aMano = { provincia: 'Las Palmas', municipio: 'Playa Honda' };
    expect(rellenoPorCp('35509', aMano)).toEqual({ elegir: [] });
    expect(rellenoPorCp('38001', { provincia: 'Madrid', municipio: 'Getafe' })).toEqual({ elegir: [] });
  });

  it('sí corrige lo que puso él mismo si cambia el código', () => {
    const puesto = { provincia: 'Las Palmas', municipio: 'Arrecife' };
    expect(rellenoPorCp('38900', puesto, puesto)).toEqual({ provincia: 'Santa Cruz de Tenerife', municipio: 'Valverde', elegir: [] });
  });

  it('ofrece elegir cuando hay varios municipios', () => {
    const r = rellenoPorCp('35220', vacio);
    expect(r.provincia).toBe('Las Palmas');
    expect(r.municipio).toBeUndefined();
    expect(r.elegir).toEqual(expect.arrayContaining(['Telde', 'Las Palmas de Gran Canaria']));
  });

  it('no pregunta si el municipio puesto ya es uno de ellos', () => {
    expect(rellenoPorCp('35220', { provincia: 'Las Palmas', municipio: 'telde' }).elegir).toEqual([]);
  });

  it('quita su municipio si el código nuevo no lo confirma', () => {
    const puesto = { provincia: 'Las Palmas', municipio: 'Arrecife' };
    const r = rellenoPorCp('35220', puesto, puesto);
    expect(r.municipio).toBe('');
    expect(r.elegir.length).toBe(2);
  });

  it('al borrar el código quita la provincia que puso, no la escrita a mano', () => {
    const puesto = { provincia: 'Las Palmas', municipio: '' };
    expect(rellenoPorCp('', puesto, puesto).provincia).toBe('');
    expect(rellenoPorCp('', puesto).provincia).toBeUndefined();
  });
});
