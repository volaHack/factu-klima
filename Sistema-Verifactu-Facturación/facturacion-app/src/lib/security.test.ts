import { describe, it, expect } from 'vitest';
import { isSafeRedirectPath } from './security';

describe('isSafeRedirectPath', () => {
  it('acepta una ruta interna simple', () => {
    expect(isSafeRedirectPath('/dashboard')).toBe(true);
  });

  it('acepta una ruta interna con query string', () => {
    expect(isSafeRedirectPath('/facturas/123?paid=true')).toBe(true);
  });

  it('rechaza una URL absoluta a otro dominio', () => {
    expect(isSafeRedirectPath('https://sitio-malicioso.com')).toBe(false);
  });

  it('rechaza un protocol-relative URL (bypass clásico de "empieza por /")', () => {
    expect(isSafeRedirectPath('//sitio-malicioso.com')).toBe(false);
  });

  it('rechaza rutas con backslash usadas para confundir parsers', () => {
    expect(isSafeRedirectPath('/\\sitio-malicioso.com')).toBe(false);
  });

  it('rechaza cadenas vacías o no-string', () => {
    expect(isSafeRedirectPath('')).toBe(false);
    expect(isSafeRedirectPath(null)).toBe(false);
    expect(isSafeRedirectPath(undefined)).toBe(false);
  });
});
