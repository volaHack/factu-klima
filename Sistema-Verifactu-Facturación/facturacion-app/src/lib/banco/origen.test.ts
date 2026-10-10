import { afterEach, describe, expect, it } from 'vitest';
import { origenPublico } from './origen';

const peticion = (url: string, cabeceras: Record<string, string> = {}) => new Request(url, { headers: cabeceras });

describe('origenPublico', () => {
  afterEach(() => { delete process.env.NEXT_PUBLIC_APP_URL; });

  it('manda NEXT_PUBLIC_APP_URL, sin barra final', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://klimafacturas.com/';
    expect(origenPublico(peticion('http://localhost:3000/api/banco/conectar'))).toBe('https://klimafacturas.com');
  });

  it('detrás de un proxy (nginx en un VPS) usa las cabeceras reenviadas', () => {
    const r = peticion('http://localhost:3000/api/banco/conectar', { 'x-forwarded-host': 'klimafacturas.com', 'x-forwarded-proto': 'https' });
    expect(origenPublico(r)).toBe('https://klimafacturas.com');
  });

  it('con sólo Host, un dominio de verdad va por https', () => {
    expect(origenPublico(peticion('http://127.0.0.1:3000/x', { host: 'klimafacturas.com' }))).toBe('https://klimafacturas.com');
  });

  it('en local se queda como está', () => {
    expect(origenPublico(peticion('http://localhost:3000/x', { host: 'localhost:3000' }))).toBe('http://localhost:3000');
  });

  it('no se fía de una cabecera con basura', () => {
    expect(origenPublico(peticion('http://localhost:3000/x', { 'x-forwarded-host': 'evil.com/ruta?x=1' }))).toBe('http://localhost:3000');
  });
});
