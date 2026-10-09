import { describe, expect, it } from 'vitest';
import { claseDe, leerFecha, leerImporte, limpiarPresentacion, presentar, presentacionActiva } from './presentacion';

describe('reconocer el dato', () => {
  it('fechas en español y en ISO', () => {
    expect(leerFecha('05/10/2026')).toEqual({ dia: 5, mes: 10, anio: 2026 });
    expect(leerFecha('2026-10-05T10:00:00Z')).toEqual({ dia: 5, mes: 10, anio: 2026 });
    expect(leerFecha('31/02/2026')).toBeNull();
    expect(leerFecha('Pendiente')).toBeNull();
  });

  it('importes con y sin euro, con miles y negativos', () => {
    expect(leerImporte('1.234,56 €')).toEqual({ valor: 1234.56, moneda: true, decimales: 2 });
    expect(leerImporte('-12,50€')).toEqual({ valor: -12.5, moneda: true, decimales: 2 });
    expect(leerImporte('1 234,56 €')).toBeNull(); // espacio fino como miles no es nuestro formato
    expect(leerImporte('21%')).toBeNull();
    expect(leerImporte('600 123 456')).toBeNull();
  });

  it('clase del dato', () => {
    expect(claseDe('')).toBe('vacio');
    expect(claseDe('05/10/2026')).toBe('fecha');
    expect(claseDe('12,00 €')).toBe('importe');
    expect(claseDe('288')).toBe('numero');
    expect(claseDe('Bar Paco')).toBe('texto');
  });
});

describe('presentar', () => {
  it('sin formato, el dato tal cual', () => {
    expect(presentar('05/10/2026', undefined)).toBe('05/10/2026');
    expect(presentar('05/10/2026', {})).toBe('05/10/2026');
  });

  it('fechas', () => {
    expect(presentar('05/10/2026', { fecha: 'd de mmmm de aaaa' })).toBe('5 de octubre de 2026');
    expect(presentar('05/10/2026', { fecha: 'dd/mm/aa' })).toBe('05/10/26');
    expect(presentar('05/10/2026', { fecha: 'd mmm aaaa' })).toBe('5 oct. 2026');
    expect(presentar('05/10/2026', { fecha: 'aaaa-mm-dd' })).toBe('2026-10-05');
    expect(presentar('05/10/2026', { fecha: 'mmmm de aaaa', letras: 'mayusculas' })).toBe('OCTUBRE DE 2026');
  });

  it('una fecha mal escrita sale como venía', () => {
    expect(presentar('a convenir', { fecha: 'd de mmmm de aaaa' })).toBe('a convenir');
  });

  it('importes: símbolo, decimales, miles y negativos', () => {
    expect(presentar('1.234,56 €', { simbolo: 'sin' })).toBe('1.234,56');
    expect(presentar('1.234,56 €', { simbolo: 'eur' })).toBe('1.234,56 EUR');
    expect(presentar('1.234,56 €', { decimales: 0 })).toBe('1.235 €');
    expect(presentar('1.234,56 €', { miles: false })).toBe('1234,56 €');
    expect(presentar('-12,50 €', { negativoParentesis: true })).toBe('(12,50 €)');
    expect(presentar('288', { decimales: 2 })).toBe('288,00');
  });

  it('ocultar a cero y texto si vacío', () => {
    expect(presentar('0,00 €', { ocultarSiCero: true })).toBe('');
    expect(presentar('0,00 €', { ocultarSiCero: true, siVacio: '—' })).toBe('—');
    expect(presentar('', { siVacio: 'Contado' })).toBe('Contado');
    expect(presentar('12,00 €', { ocultarSiCero: true })).toBe('12,00 €');
  });

  it('prefijo y sufijo sólo si hay dato', () => {
    expect(presentar('600123456', { prefijo: 'Tel. ' })).toBe('Tel. 600123456');
    expect(presentar('', { prefijo: 'Tel. ' })).toBe('');
  });

  it('mayúsculas, minúsculas y título', () => {
    expect(presentar('frutería pepe', { letras: 'mayusculas' })).toBe('FRUTERÍA PEPE');
    expect(presentar('FRUTERÍA PEPE', { letras: 'minusculas' })).toBe('frutería pepe');
    expect(presentar('DISTRIBUCIONES MARTÍN S.L.', { letras: 'titulo' })).toBe('Distribuciones Martín S.L.');
  });
});

describe('guardar limpio', () => {
  it('lo que no hace nada no se guarda', () => {
    expect(limpiarPresentacion({ letras: 'tal', simbolo: 'tal', prefijo: '' })).toBeUndefined();
    expect(limpiarPresentacion({ decimales: 2.7 })).toEqual({ decimales: 3 });
    expect(presentacionActiva({ miles: false })).toBe(true);
  });
});
