import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { diagnosticar, normalizarClave, todoBien } from './diagnostico';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const APP = '3f2b1c4e-1111-4222-8333-444455556666';
const VUELTA = 'https://factuklima.es/api/banco/vuelta';

const app = (c: Partial<{ nombre: string; entorno: string; redirecciones: string[]; activa: boolean }> = {}) => ({
  nombre: 'FactuKlima', entorno: 'PRODUCTION', redirecciones: [VUELTA], activa: true, ...c,
});
const ok = (r: ReturnType<typeof diagnosticar>, id: string) => r.find(c => c.id === id)?.ok;

describe('normalizarClave', () => {
  it('convierte los \\n literales en saltos de línea', () => {
    expect(normalizarClave(PEM.replace(/\n/g, '\\n'))).toBe(PEM.trim());
  });
  it('rehace una clave pegada en una sola línea', () => {
    const plana = PEM.replace(/\n/g, ' ');
    expect(normalizarClave(plana)).toBe(PEM.trim());
  });
});

describe('diagnosticar', () => {
  it('sin nada configurado, lo dice y no sigue', () => {
    const r = diagnosticar({ appId: undefined, clave: undefined, urlVuelta: VUELTA });
    expect(ok(r, 'app_id')).toBe(false);
    expect(ok(r, 'clave')).toBe(false);
    expect(r.find(c => c.id === 'app_id')?.arreglo).toMatch(/ENABLE_BANKING_APP_ID/);
    expect(todoBien(r)).toBe(false);
  });

  it('una clave que no es una clave privada', () => {
    const r = diagnosticar({ appId: APP, clave: '-----BEGIN PRIVATE KEY-----\nbasura\n-----END PRIVATE KEY-----', urlVuelta: VUELTA });
    expect(ok(r, 'clave')).toBe(false);
  });

  it('si Enable Banking no responde, se dice con su error', () => {
    const r = diagnosticar({ appId: APP, clave: PEM, urlVuelta: VUELTA, errorApi: 'Enable Banking 401: wrong kid' });
    expect(ok(r, 'clave')).toBe(true);
    expect(ok(r, 'conexion')).toBe(false);
    expect(r.find(c => c.id === 'conexion')?.detalle).toMatch(/401/);
  });

  it('la dirección de vuelta no registrada: dice cuál hay que añadir', () => {
    const r = diagnosticar({ appId: APP, clave: PEM, urlVuelta: VUELTA, app: app({ redirecciones: ['http://localhost:3000/api/banco/vuelta'] }) });
    const c = r.find(x => x.id === 'redireccion');
    expect(c?.ok).toBe(false);
    expect(c?.arreglo).toContain(VUELTA);
  });

  it('la aplicación sin activar', () => {
    const r = diagnosticar({ appId: APP, clave: PEM, urlVuelta: VUELTA, app: app({ activa: false }) });
    expect(ok(r, 'activa')).toBe(false);
  });

  it('en pruebas avisa de que sólo hay bancos de mentira, sin fallar', () => {
    const r = diagnosticar({ appId: APP, clave: PEM, urlVuelta: VUELTA, app: app({ entorno: 'SANDBOX' }) });
    const c = r.find(x => x.id === 'entorno');
    expect(c?.ok).toBe(true);
    expect(c?.detalle).toMatch(/pruebas/i);
    expect(todoBien(r)).toBe(true);
  });

  it('todo bien', () => {
    const r = diagnosticar({ appId: APP, clave: PEM, urlVuelta: VUELTA, app: app() });
    expect(r.every(c => c.ok)).toBe(true);
    expect(todoBien(r)).toBe(true);
  });
});
