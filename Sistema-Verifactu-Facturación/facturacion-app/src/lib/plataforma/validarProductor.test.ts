import { describe, expect, it } from 'vitest';
import {
  avisoNombreProductor, columnasDelProductor, pendientesDeclaracion, erroresDelProductor, productorDesdeJson, type ProductorFormulario,
} from './validarProductor';

const base: ProductorFormulario = {
  nombre: 'GARCIA LOPEZ ALEXANDER', nif: '78837942Z', domicilio: '', email: '', soporte_email: '',
  sistema_nombre: 'FactuKlima', sistema_id: 'FK', sistema_version: '1.0', lugar: '', fecha: '',
};

describe('erroresDelProductor', () => {
  it('con un NIF bueno no hay nada que decir', () => {
    expect(erroresDelProductor(base)).toEqual({});
  });
  it('avisa de un NIF con la letra mal, del correo y del código', () => {
    const e = erroresDelProductor({ ...base, nif: '78837942A', email: 'no-es-correo', sistema_id: 'F' });
    expect(Object.keys(e).sort()).toEqual(['email', 'nif', 'sistema_id']);
  });
  it('vacío se puede guardar (se va rellenando poco a poco)', () => {
    expect(erroresDelProductor({ ...base, nombre: '', nif: '' })).toEqual({});
  });
});

describe('avisoNombreProductor', () => {
  it('con DNI y sólo el nombre de pila avisa: es el rechazo 1110', () => {
    expect(avisoNombreProductor({ nombre: 'Alexander', nif: '78837942Z' })).toMatch(/apellidos/);
  });
  it('con apellidos y nombre, nada', () => {
    expect(avisoNombreProductor({ nombre: 'GARCIA LOPEZ ALEXANDER', nif: '78837942Z' })).toBeNull();
  });
  it('una sociedad puede tener una sola palabra', () => {
    expect(avisoNombreProductor({ nombre: 'KLIMASOFT', nif: 'B12345674' })).toBeNull();
  });
});

describe('columnasDelProductor', () => {
  it('limpia el NIF y pone los valores por defecto del sistema', () => {
    const c = columnasDelProductor({ ...base, nif: ' 78837942-z ', sistema_nombre: '', sistema_id: '', sistema_version: '' });
    expect(c.productor_nif).toBe('78837942Z');
    expect(c.sistema_nombre).toBe('FactuKlima');
    expect(c.sistema_id).toBe('FK');
    expect(c.declaracion_fecha).toBeNull();
  });
  it('lo que llega por la API se lee como texto', () => {
    expect(productorDesdeJson({ nombre: 'X', nif: 5 })?.nif).toBe('');
    expect(productorDesdeJson(null)).toBeNull();
  });
});

describe('pendientesDeclaracion', () => {
  const firmada = { nombre: 'KLIMASOFT SL', nif: 'B12345674', domicilio: 'Calle Mayor 10, 35001 Las Palmas de Gran Canaria', lugar: 'Las Palmas de Gran Canaria', fecha: '2026-10-05' };
  it('con todo puesto, nada pendiente', () => {
    expect(pendientesDeclaracion(firmada)).toEqual([]);
  });
  it('una calle sin código postal ni municipio no es una dirección completa', () => {
    expect(pendientesDeclaracion({ ...firmada, domicilio: 'Calle la cuesta n10' })).toEqual([expect.stringMatching(/código postal/)]);
  });
  it('sin lugar no está firmada aunque tenga fecha', () => {
    expect(pendientesDeclaracion({ ...firmada, lugar: '' })).toEqual(['el lugar de firma']);
  });
});
