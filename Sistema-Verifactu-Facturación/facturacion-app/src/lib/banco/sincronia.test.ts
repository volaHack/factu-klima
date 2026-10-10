import { describe, expect, it } from 'vitest';
import { desdeParaSincronizar, diasParaCaducar, esPermisoCaducado, mismaConexion, saldoPrincipal } from './sincronia';

describe('desdeParaSincronizar', () => {
  it('la primera vez, 90 días atrás', () => {
    expect(desdeParaSincronizar(null, '2026-10-09')).toBe('2026-07-11');
  });
  it('después, desde la última lectura menos 5 días (los bancos apuntan con retraso)', () => {
    expect(desdeParaSincronizar('2026-10-08T06:40:00Z', '2026-10-09')).toBe('2026-10-03');
  });
  it('nunca más de 90 días atrás aunque la última sea muy vieja', () => {
    expect(desdeParaSincronizar('2025-01-01T00:00:00Z', '2026-10-09')).toBe('2026-07-11');
  });
});

describe('saldoPrincipal', () => {
  it('prefiere el disponible (ITAV) al contable', () => {
    const s = saldoPrincipal([
      { balance_type: 'CLBD', balance_amount: { amount: '1200.00', currency: 'EUR' }, reference_date: '2026-10-08' },
      { balance_type: 'ITAV', balance_amount: { amount: '1150.50', currency: 'EUR' }, last_change_date_time: '2026-10-09T08:00:00Z' },
    ]);
    expect(s).toEqual({ importe: 1150.5, fecha: '2026-10-09', tipo: 'ITAV' });
  });
  it('si sólo hay uno raro, ése', () => {
    expect(saldoPrincipal([{ balance_type: 'OTHR', balance_amount: { amount: -20, currency: 'EUR' } }])).toEqual({ importe: -20, fecha: null, tipo: 'OTHR' });
  });
  it('sin saldos en euros, nada', () => {
    expect(saldoPrincipal([{ balance_type: 'ITAV', balance_amount: { amount: '10', currency: 'USD' } }])).toBeNull();
    expect(saldoPrincipal([])).toBeNull();
  });
});

describe('esPermisoCaducado', () => {
  it('401/403 o los códigos de sesión caducada', () => {
    expect(esPermisoCaducado({ estado: 401, cuerpo: '' })).toBe(true);
    expect(esPermisoCaducado({ estado: 422, cuerpo: '{"error":"EXPIRED_SESSION"}' })).toBe(true);
    expect(esPermisoCaducado({ estado: 400, cuerpo: 'Session is REVOKED' })).toBe(true);
  });
  it('un fallo pasajero no', () => {
    expect(esPermisoCaducado({ estado: 502, cuerpo: 'bad gateway' })).toBe(false);
    expect(esPermisoCaducado({ estado: 429, cuerpo: 'ASPSP_RATE_LIMIT_EXCEEDED' })).toBe(false);
    expect(esPermisoCaducado(new Error('fetch failed'))).toBe(false);
  });
});

describe('diasParaCaducar', () => {
  it('días que quedan, redondeando hacia abajo', () => {
    expect(diasParaCaducar('2026-10-19T12:00:00Z', new Date('2026-10-09T10:00:00Z'))).toBe(10);
    expect(diasParaCaducar('2026-10-08T00:00:00Z', new Date('2026-10-09T10:00:00Z'))).toBeLessThan(0);
    expect(diasParaCaducar(null, new Date())).toBeNull();
  });
});

describe('mismaConexion', () => {
  const vieja = { banco: 'Banco Santander', cuentas: [{ uid: 'a', iban: 'ES11 0049 0001 5000 0000 0001' }] };
  it('mismo banco y algún IBAN en común (con o sin espacios)', () => {
    expect(mismaConexion(vieja, { banco: 'Banco Santander', cuentas: [{ uid: 'z', iban: 'ES1100490001500000000001' }] })).toBe(true);
  });
  it('otro banco o ninguna cuenta en común, no', () => {
    expect(mismaConexion(vieja, { banco: 'BBVA', cuentas: [{ uid: 'z', iban: 'ES1100490001500000000001' }] })).toBe(false);
    expect(mismaConexion(vieja, { banco: 'Banco Santander', cuentas: [{ uid: 'z', iban: 'ES9900490001500000000099' }] })).toBe(false);
  });
});
