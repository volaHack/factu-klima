import { describe, expect, it } from 'vitest';
import { problemasDeLineas, tipoImpositivoRaro } from './lineas';

const linea = (o: object) => ({ productName: 'Corn Flakes', quantity: 15, unitPrice: 1.4, taxRate: 7, cajas: 0, ...o });

describe('tipos de impuesto', () => {
  it('21 % con IGIC es un IVA metido por error', () => {
    expect(tipoImpositivoRaro(21, { igicEnabled: true })).toMatch(/IVA, no de IGIC/);
  });
  it('7 % con IGIC está bien; con IVA no', () => {
    expect(tipoImpositivoRaro(7, { igicEnabled: true })).toBeNull();
    expect(tipoImpositivoRaro(7, { igicEnabled: false })).toMatch(/IGIC/);
  });
  it('los tipos propios de Ajustes valen', () => {
    expect(tipoImpositivoRaro(6.5, { igicEnabled: true, igicRates: [6.5] })).toBeNull();
  });
});

describe('problemas de las líneas', () => {
  it('cajas sin U/C: error', () => {
    const p = problemasDeLineas([linea({ cajas: 2 })], { igicEnabled: true });
    expect(p).toEqual([expect.objectContaining({ gravedad: 'error', mensaje: expect.stringMatching(/U\/C/) })]);
  });
  it('sin unidades: error', () => {
    expect(problemasDeLineas([linea({ quantity: 0 })], { igicEnabled: true })[0].gravedad).toBe('error');
  });
  it('IGIC al 21 %: aviso, no error', () => {
    const p = problemasDeLineas([linea({ taxRate: 21 })], { igicEnabled: true });
    expect(p).toEqual([expect.objectContaining({ gravedad: 'aviso' })]);
  });
  it('una línea correcta no da nada', () => {
    expect(problemasDeLineas([linea({ cajas: 2, unitsPerPackage: 24, quantity: 48 })], { igicEnabled: true })).toEqual([]);
  });
});
