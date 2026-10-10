import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

// El cliente de Enable Banking es de servidor y habla con la red: aquí se
// sustituye por uno que devuelve lo que diga cada prueba.
const banco = vi.hoisted(() => ({
  transacciones: vi.fn(),
  saldos: vi.fn(),
}));
vi.mock('./enableBanking', () => ({ transacciones: banco.transacciones, saldos: banco.saldos }));

import { sincronizarConexion, sincronizarTodas, type ConexionGuardada } from './sincronizar';

/** Una base de datos en memoria que entiende lo que usa el motor. */
function baseDeDatos() {
  const movimientos = new Map<string, Record<string, unknown>>();
  const conexiones = new Map<string, Record<string, unknown>>();
  const db = {
    from(tabla: string) {
      return {
        upsert(filas: Record<string, unknown>[]) {
          const nuevas = filas.filter(f => !movimientos.has(`${f.user_id}|${f.id}`));
          for (const f of nuevas) movimientos.set(`${f.user_id}|${f.id}`, { ignorado: false, ...f });
          return { select: async () => ({ data: nuevas.map(f => ({ id: f.id })), error: null }) };
        },
        update(cambios: Record<string, unknown>) {
          return { eq: async (_c: string, id: string) => { conexiones.set(id, { ...(conexiones.get(id) ?? {}), ...cambios }); return { error: null }; } };
        },
        select() {
          return { neq: async () => ({ data: [...conexiones.values()].filter(c => c.estado !== 'caducada'), error: null }) };
        },
        _tabla: tabla,
      };
    },
  };
  return { db: db as unknown as SupabaseClient, movimientos, conexiones };
}

const tx = (ref: string, importe: number, fecha = '2026-10-05') => ({
  entry_reference: ref, status: 'BOOK', booking_date: fecha,
  transaction_amount: { amount: String(Math.abs(importe)), currency: 'EUR' },
  credit_debit_indicator: importe < 0 ? 'DBIT' : 'CRDT',
  remittance_information: ['Pago factura FAC-2026-0012'], debtor: { name: 'Bar Paco' },
});

const conexion = (c: Partial<ConexionGuardada> = {}): ConexionGuardada => ({
  id: 'con-1', user_id: 'u-1', banco: 'Banco Ejemplo', valido_hasta: '2099-01-01T00:00:00Z', ultima_lectura: null,
  cuentas: [{ uid: 'acc-1', iban: 'ES1100490001500000000001' }], ...c,
});

beforeEach(() => {
  banco.transacciones.mockReset();
  banco.saldos.mockReset();
});

describe('sincronizarConexion', () => {
  it('guarda los movimientos y el saldo, y avanza la última lectura', async () => {
    const { db, movimientos, conexiones } = baseDeDatos();
    banco.transacciones.mockResolvedValue([tx('R1', 120), tx('R2', -35.5)]);
    banco.saldos.mockResolvedValue([{ balance_type: 'ITAV', balance_amount: { amount: '1500.25', currency: 'EUR' }, reference_date: '2026-10-09' }]);

    const r = await sincronizarConexion(db, conexion());
    expect(r).toEqual({ nuevos: 2, cuentas: 1, caducada: false });
    expect(movimientos.size).toBe(2);
    const c = conexiones.get('con-1')!;
    expect(c.estado).toBe('activa');
    expect(c.ultimo_error).toBeNull();
    expect(c.ultima_lectura).toBeTruthy();
    expect((c.saldos as Record<string, { importe: number }>)['acc-1'].importe).toBe(1500.25);
  });

  it('leer otra vez no duplica', async () => {
    const { db, movimientos } = baseDeDatos();
    banco.transacciones.mockResolvedValue([tx('R1', 120)]);
    banco.saldos.mockResolvedValue([]);
    await sincronizarConexion(db, conexion());
    const r = await sincronizarConexion(db, conexion({ ultima_lectura: new Date().toISOString() }));
    expect(r.nuevos).toBe(0);
    expect(movimientos.size).toBe(1);
  });

  it('un permiso caducado deja la conexión caducada y no avanza la lectura', async () => {
    const { db, conexiones } = baseDeDatos();
    banco.transacciones.mockRejectedValue(Object.assign(new Error('Enable Banking 401'), { estado: 401, cuerpo: 'EXPIRED_SESSION' }));
    const r = await sincronizarConexion(db, conexion());
    expect(r.caducada).toBe(true);
    expect(conexiones.get('con-1')?.estado).toBe('caducada');
    expect(conexiones.get('con-1')?.ultima_lectura).toBeUndefined();
  });

  it('un permiso que ya pasó su fecha no llega ni a preguntar', async () => {
    const { db, conexiones } = baseDeDatos();
    const r = await sincronizarConexion(db, conexion({ valido_hasta: '2020-01-01T00:00:00Z' }));
    expect(r.caducada).toBe(true);
    expect(banco.transacciones).not.toHaveBeenCalled();
    expect(conexiones.get('con-1')?.estado).toBe('caducada');
  });

  it('una cuenta que falla no impide leer la otra', async () => {
    const { db, movimientos, conexiones } = baseDeDatos();
    banco.transacciones
      .mockRejectedValueOnce(Object.assign(new Error('Enable Banking 502'), { estado: 502, cuerpo: 'bad gateway' }))
      .mockResolvedValueOnce([tx('R9', 10)]);
    banco.saldos.mockResolvedValue([]);
    const r = await sincronizarConexion(db, conexion({
      cuentas: [{ uid: 'acc-1', iban: 'ES11' }, { uid: 'acc-2', iban: 'ES22' }],
    }));
    expect(r.cuentas).toBe(1);
    expect(r.nuevos).toBe(1);
    expect(r.error).toMatch(/ES11/);
    expect(movimientos.size).toBe(1);
    expect(conexiones.get('con-1')?.estado).toBe('activa');
  });

  it('si el banco no da saldo, los movimientos se guardan igual', async () => {
    const { db, movimientos } = baseDeDatos();
    banco.transacciones.mockResolvedValue([tx('R1', 5)]);
    banco.saldos.mockRejectedValue(Object.assign(new Error('Enable Banking 501'), { estado: 501, cuerpo: 'not supported' }));
    const r = await sincronizarConexion(db, conexion());
    expect(r).toMatchObject({ nuevos: 1, cuentas: 1, caducada: false });
    expect(movimientos.size).toBe(1);
  });
});

describe('sincronizarTodas', () => {
  it('pasa por todas las activas y resume', async () => {
    const { db, conexiones } = baseDeDatos();
    conexiones.set('a', { ...conexion({ id: 'a' }), estado: 'activa' });
    conexiones.set('b', { ...conexion({ id: 'b', user_id: 'u-2' }), estado: 'activa' });
    conexiones.set('c', { ...conexion({ id: 'c' }), estado: 'caducada' });
    banco.transacciones.mockResolvedValue([tx('R1', 1)]);
    banco.saldos.mockResolvedValue([]);
    const r = await sincronizarTodas(db);
    expect(r).toEqual({ conexiones: 2, nuevos: 2, caducadas: 0, fallidas: 0 });
  });
});
