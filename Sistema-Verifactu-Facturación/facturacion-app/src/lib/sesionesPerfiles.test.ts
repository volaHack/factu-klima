import { describe, expect, it } from 'vitest';
import { CADUCA_MS, EN_LINEA_MS, describirNavegador, estadoSesion } from './sesionesPerfiles';
import { puedeEntrar } from './perfiles';

describe('describirNavegador', () => {
  it('pone nombre a los equipos habituales', () => {
    expect(describirNavegador('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36')).toBe('Chrome en Windows');
    expect(describirNavegador('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0 Safari/537.36 Edg/129.0')).toBe('Edge en Windows');
    expect(describirNavegador('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1')).toBe('Safari en iPhone');
    expect(describirNavegador('Mozilla/5.0 (Linux; Android 14; SM-X200) AppleWebKit/537.36 Chrome/129.0 Safari/537.36')).toBe('Chrome en tableta Android');
    expect(describirNavegador('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36')).toBe('Chrome en Android');
    expect(describirNavegador('Mozilla/5.0 (Macintosh; Intel Mac OS X 14.0; rv:130.0) Gecko/20100101 Firefox/130.0')).toBe('Firefox en Mac');
  });

  it('sin pistas, «Equipo»', () => {
    expect(describirNavegador('')).toBe('Equipo');
  });
});

describe('estadoSesion', () => {
  const ahora = Date.parse('2026-09-25T10:00:00Z');
  const hace = (ms: number) => new Date(ahora - ms).toISOString();

  it('conectado si dio señales hace poco', () => {
    expect(estadoSesion(hace(30_000), ahora)).toBe('en_linea');
    expect(estadoSesion(hace(EN_LINEA_MS), ahora)).toBe('en_linea');
  });

  it('inactiva si lleva un rato sin latir, caducada si lleva horas', () => {
    expect(estadoSesion(hace(EN_LINEA_MS + 1000), ahora)).toBe('inactiva');
    expect(estadoSesion(hace(CADUCA_MS + 1000), ahora)).toBe('caducada');
  });

  it('una fecha rota no se enseña', () => {
    expect(estadoSesion('no-es-fecha', ahora)).toBe('caducada');
  });
});

describe('la pantalla Equipo', () => {
  it('es sólo del titular', () => {
    expect(puedeEntrar('titular', '/equipo')).toBe(true);
    expect(puedeEntrar('empleado', '/equipo')).toBe(false);
    expect(puedeEntrar('cajero', '/equipo')).toBe(false);
  });
});
