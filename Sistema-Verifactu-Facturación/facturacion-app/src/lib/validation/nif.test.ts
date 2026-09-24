import { describe, it, expect } from 'vitest';
import { isValidNif, detectNifType, tipoDeEntidad } from './nif';

describe('isValidNif', () => {
  it('DNI y NIE con su letra', () => {
    expect(isValidNif('12345678Z')).toBe(true);
    expect(isValidNif('12345678A')).toBe(false);
    expect(isValidNif('X1234567L')).toBe(true);
    expect(isValidNif('Y1234567X')).toBe(true);
    expect(isValidNif('X1234567A')).toBe(false);
    expect(isValidNif('1234567Z')).toBe(false);
  });

  it('NIF especiales K, L y M', () => {
    expect(detectNifType('K1234567L')).toBe('NIF');
    expect(isValidNif('K1234567L')).toBe(true);
    expect(isValidNif('M1234567A')).toBe(false);
  });

  it('CIF: el control es UNA cifra o letra concreta, no cualquiera', () => {
    // B12345674: suma 1+4+3+8+5+3+7 → control 4.
    expect(isValidNif('B12345674')).toBe(true);
    // Antes pasaba cualquier letra de «JABCDEFGHI».
    expect(isValidNif('B1234567J')).toBe(false);
    expect(isValidNif('B12345678')).toBe(false);
    expect(isValidNif('B-1234567-4')).toBe(true);
  });

  it('las entidades públicas llevan letra y las sociedades cifra', () => {
    // Q2826000H: Agencia Tributaria.
    expect(isValidNif('Q2826000H')).toBe(true);
    expect(isValidNif('Q28260008')).toBe(false);
    // A con letra de control: no vale aunque la letra corresponda.
    expect(isValidNif('A1234567D')).toBe(false);
    // G admite las dos formas.
    expect(isValidNif('G12345674')).toBe(true);
    expect(isValidNif('G1234567D')).toBe(true);
  });

  it('dice qué tipo de entidad es', () => {
    expect(tipoDeEntidad('B12345674')).toBe('sociedad de responsabilidad limitada');
    expect(tipoDeEntidad('12345678Z')).toBeNull();
  });
});
