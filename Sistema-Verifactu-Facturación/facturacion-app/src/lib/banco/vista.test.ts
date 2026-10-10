import { describe, expect, it } from 'vitest';
import { estadoPermiso, filtrarMovimientos, ibanCorto, totalSaldos } from './vista';

describe('ibanCorto', () => {
  it('enseña el país y los 4 últimos', () => {
    expect(ibanCorto('ES1100490001500000001234')).toBe('ES11 ···· 1234');
    expect(ibanCorto(null)).toBe('Cuenta');
  });
});

describe('estadoPermiso', () => {
  it('activa, por caducar y caducada', () => {
    expect(estadoPermiso({ caducada: false, diasParaCaducar: 120 })).toEqual({ tono: 'ok', texto: 'Conectado' });
    expect(estadoPermiso({ caducada: false, diasParaCaducar: 6 })).toEqual({ tono: 'aviso', texto: 'Renueva en 6 días' });
    expect(estadoPermiso({ caducada: false, diasParaCaducar: 0 })).toEqual({ tono: 'aviso', texto: 'Caduca hoy' });
    expect(estadoPermiso({ caducada: true, diasParaCaducar: -3 })).toEqual({ tono: 'peligro', texto: 'Permiso caducado' });
  });
});

describe('totalSaldos', () => {
  it('suma los saldos conocidos de las conexiones activas', () => {
    expect(totalSaldos([
      { caducada: false, cuentas: [{ saldo: { importe: 100.5 } }, { saldo: null }] },
      { caducada: false, cuentas: [{ saldo: { importe: -20.25 } }] },
      { caducada: true, cuentas: [{ saldo: { importe: 999 } }] },
    ])).toBe(80.25);
  });
});

describe('filtrarMovimientos', () => {
  const movs = [
    { id: 'a', fecha: '2026-10-05', importe: 120, concepto: 'Bar Paco · Pago FAC-12', conciliado: 'Cobro C-1', ignorado: false },
    { id: 'b', fecha: '2026-10-04', importe: -35.5, concepto: 'Iberdrola recibo', conciliado: null, ignorado: false },
    { id: 'c', fecha: '2026-10-03', importe: -5, concepto: 'Traspaso propio', conciliado: null, ignorado: true },
  ];
  it('por estado', () => {
    expect(filtrarMovimientos(movs, 'pendientes', '').map(m => m.id)).toEqual(['b']);
    expect(filtrarMovimientos(movs, 'conciliados', '').map(m => m.id)).toEqual(['a']);
    expect(filtrarMovimientos(movs, 'apartados', '').map(m => m.id)).toEqual(['c']);
    expect(filtrarMovimientos(movs, 'todos', '').map(m => m.id)).toEqual(['a', 'b', 'c']);
  });
  it('busca sin acentos ni mayúsculas, también por importe', () => {
    expect(filtrarMovimientos(movs, 'todos', 'IBERDROLA').map(m => m.id)).toEqual(['b']);
    expect(filtrarMovimientos(movs, 'todos', '35,50').map(m => m.id)).toEqual(['b']);
  });
});
