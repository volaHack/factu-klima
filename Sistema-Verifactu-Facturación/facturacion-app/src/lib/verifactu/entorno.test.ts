import { describe, expect, it } from 'vitest';
import { hayAceptadosEnProduccion, pendienteEn, soloEnviadosAPruebas } from './entorno';

describe('pendienteEn', () => {
  it('en Pruebas sólo lo pendiente, lo fallido y lo rechazado', () => {
    expect(pendienteEn('pruebas', { estado: 'pendiente', entorno: null })).toBe(true);
    expect(pendienteEn('pruebas', { estado: 'rechazado', entorno: 'pruebas' })).toBe(true);
    // Lo aceptado en Pruebas no se vuelve a mandar mientras se sigue probando.
    expect(pendienteEn('pruebas', { estado: 'aceptado', entorno: 'pruebas' })).toBe(false);
  });

  it('en Producción, lo aceptado sólo en Pruebas también está pendiente', () => {
    expect(pendienteEn('produccion', { estado: 'aceptado', entorno: 'pruebas' })).toBe(true);
    expect(pendienteEn('produccion', { estado: 'aceptado', entorno: 'produccion' })).toBe(false);
    expect(pendienteEn('produccion', { estado: 'error_envio', entorno: 'produccion' })).toBe(true);
  });
});

describe('volver a Pruebas', () => {
  it('se puede mientras nada haya sido aceptado por la AEAT real', () => {
    expect(hayAceptadosEnProduccion([{ estado: 'aceptado', entorno: 'pruebas' }, { estado: 'rechazado', entorno: 'produccion' }])).toBe(false);
  });
  it('no se puede con algo aceptado en Producción', () => {
    expect(hayAceptadosEnProduccion([{ estado: 'aceptado_con_errores', entorno: 'produccion' }])).toBe(true);
  });
  it('cuenta lo que sólo llegó a Pruebas', () => {
    expect(soloEnviadosAPruebas([{ estado: 'aceptado', entorno: 'pruebas' }, { estado: 'pendiente', entorno: null }])).toBe(1);
  });
});
