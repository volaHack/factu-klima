import { describe, expect, it } from 'vitest';
import { codigoValido, estadoInvitacion } from './invitaciones';

const ahora = new Date('2026-11-01T12:00:00Z');
const base = { caduca_en: '2026-11-08T12:00:00Z', usado_en: null, revocado_en: null };

describe('codigoValido', () => {
  it('acepta 43 caracteres base64url', () => {
    expect(codigoValido('a'.repeat(40) + '_-9')).toBe(true);
  });
  it('rechaza lo que no tiene esa forma', () => {
    expect(codigoValido('corto')).toBe(false);
    expect(codigoValido('a'.repeat(42) + '/')).toBe(false);
    expect(codigoValido(undefined)).toBe(false);
    expect(codigoValido('a'.repeat(44))).toBe(false);
  });
});

describe('estadoInvitacion', () => {
  it('sin usar, sin anular y en plazo: activa', () => {
    expect(estadoInvitacion(base, ahora)).toBe('activa');
  });
  it('pasada la fecha: caducada', () => {
    expect(estadoInvitacion({ ...base, caduca_en: '2026-11-01T11:59:59Z' }, ahora)).toBe('caducada');
  });
  it('usada, aunque esté en plazo', () => {
    expect(estadoInvitacion({ ...base, usado_en: '2026-11-01T10:00:00Z' }, ahora)).toBe('usada');
  });
  it('anulada pesa más que usada', () => {
    expect(estadoInvitacion({ ...base, usado_en: '2026-11-01T10:00:00Z', revocado_en: '2026-11-01T09:00:00Z' }, ahora)).toBe('anulada');
  });
});
