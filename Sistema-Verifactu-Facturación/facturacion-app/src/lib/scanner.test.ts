import { describe, it, expect } from 'vitest';
import {
  BarcodeAccumulator,
  isTextEditableTarget,
  isPrintableCharKey,
  SCANNER_BURST_MS,
} from './scanner';

describe('isTextEditableTarget', () => {
  it('detecta inputs, textareas y selects', () => {
    const input = { tagName: 'INPUT' } as HTMLElement;
    const textarea = { tagName: 'TEXTAREA' } as HTMLElement;
    const select = { tagName: 'SELECT' } as HTMLElement;
    const button = { tagName: 'BUTTON' } as HTMLElement;
    expect(isTextEditableTarget(input)).toBe(true);
    expect(isTextEditableTarget(textarea)).toBe(true);
    expect(isTextEditableTarget(select)).toBe(true);
    expect(isTextEditableTarget(button)).toBe(false);
    expect(isTextEditableTarget(null)).toBe(false);
  });

  it('detecta contenido editable', () => {
    const div = { tagName: 'DIV', isContentEditable: true } as HTMLElement;
    expect(isTextEditableTarget(div)).toBe(true);
  });
});

describe('isPrintableCharKey', () => {
  it('acepta un solo carácter imprimible', () => {
    expect(isPrintableCharKey('a')).toBe(true);
    expect(isPrintableCharKey('1')).toBe(true);
    expect(isPrintableCharKey('ñ')).toBe(true);
  });

  it('rechaza Enter, espacios y teclas especiales', () => {
    expect(isPrintableCharKey('Enter')).toBe(false);
    expect(isPrintableCharKey(' ')).toBe(false);
    expect(isPrintableCharKey('F1')).toBe(false);
    expect(isPrintableCharKey('Escape')).toBe(false);
    expect(isPrintableCharKey('Shift')).toBe(false);
  });
});

describe('BarcodeAccumulator', () => {
  it('acumula una ráfaga de teclas rápida', () => {
    const acc = new BarcodeAccumulator();
    '8412345678906'.split('').forEach((ch, i) => acc.push(ch, i * 10));
    expect(acc.code).toBe('8412345678906');
    expect(acc.isScanning).toBe(true);
  });

  it('reinicia el buffer si la pausa supera el umbral de ráfaga', () => {
    const acc = new BarcodeAccumulator();
    acc.push('1', 0);
    acc.push('2', SCANNER_BURST_MS + 10);
    expect(acc.code).toBe('2');
  });

  it('flushes y vacía el buffer', () => {
    const acc = new BarcodeAccumulator();
    acc.push('1', 0);
    acc.push('2', 10);
    expect(acc.flush()).toBe('12');
    expect(acc.isScanning).toBe(false);
  });

  it('detecta pausa con código suficientemente largo (escáner sin Enter)', () => {
    const acc = new BarcodeAccumulator();
    const code = '1234567890';
    code.split('').forEach((ch, i) => acc.push(ch, i * 10));
    expect(acc.isIdleLongEnough(300)).toBe(true);
  });

  it('no lanza flush por pausa con códigos cortos', () => {
    const acc = new BarcodeAccumulator();
    acc.push('1', 0);
    acc.push('2', 10);
    expect(acc.isIdleLongEnough(200)).toBe(false);
  });

  it('no excede la longitud máxima', () => {
    const acc = new BarcodeAccumulator({ maxLen: 8 });
    for (let i = 0; i < 20; i++) acc.push(String(i % 10), i * 10);
    expect(acc.length).toBeLessThanOrEqual(8);
  });
});
