import { generateKeyPairSync } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const aplicacion = vi.fn();
vi.mock('./enableBanking', () => ({ aplicacion: () => aplicacion() }));

import { comprobarConfiguracion } from './configuracion';

const CLAVE = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const ORIGEN = 'https://factu.example';

describe('comprobarConfiguracion', () => {
  beforeEach(() => {
    process.env.ENABLE_BANKING_APP_ID = '6f1c2a40-1b2c-4d3e-8f90-123456789abc';
    process.env.ENABLE_BANKING_PRIVATE_KEY = CLAVE;
    aplicacion.mockReset();
  });
  afterEach(() => {
    delete process.env.ENABLE_BANKING_APP_ID;
    delete process.env.ENABLE_BANKING_PRIVATE_KEY;
  });

  it('con id y clave buenos pregunta a Enable Banking y, si todo cuadra, está listo', async () => {
    aplicacion.mockResolvedValue({ nombre: 'FactuKlima', entorno: 'PRODUCTION', redirecciones: [`${ORIGEN}/api/banco/vuelta`], activa: true });
    const r = await comprobarConfiguracion(ORIGEN);
    expect(aplicacion).toHaveBeenCalledOnce();
    expect(r.listo).toBe(true);
    expect(r.entorno).toBe('PRODUCTION');
  });

  it('si Enable Banking no acepta las credenciales, lo dice con su error', async () => {
    aplicacion.mockRejectedValue(new Error('Enable Banking 401: JWT no válido'));
    const r = await comprobarConfiguracion(ORIGEN);
    expect(r.listo).toBe(false);
    expect(r.comprobaciones.find(c => c.id === 'conexion')?.detalle).toContain('401');
  });

  it('sin id de aplicación no llega a preguntar', async () => {
    delete process.env.ENABLE_BANKING_APP_ID;
    const r = await comprobarConfiguracion(ORIGEN);
    expect(aplicacion).not.toHaveBeenCalled();
    expect(r.listo).toBe(false);
  });
});
