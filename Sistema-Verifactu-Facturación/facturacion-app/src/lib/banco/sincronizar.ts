/**
 * MOTOR DE SINCRONIZACIÓN CON EL BANCO — SOLO SERVIDOR
 *
 * Lee de Enable Banking los movimientos y el saldo de cada cuenta de una
 * conexión y los deja guardados en `banco_movimientos`. Lo llaman el cron
 * diario, el botón «Sincronizar» y la vuelta del banco al conectar.
 *
 * Reglas:
 *   · Nunca duplica: el id de cada movimiento es estable y la inserción
 *     ignora los que ya están (lo que el usuario marcó como ignorado se
 *     queda como estaba).
 *   · Un permiso caducado o retirado deja la conexión «caducada» para
 *     pedir que se renueve; cualquier otro fallo se apunta y se reintenta.
 *   · Una cuenta que falla no impide leer las demás.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { movimientosDesdeBanco } from './conectado';
import { saldos, transacciones } from './enableBanking';
import { desdeParaSincronizar, esPermisoCaducado, saldoPrincipal, type Saldo } from './sincronia';

export interface ConexionGuardada {
  id: string;
  user_id: string;
  banco: string;
  cuentas: { uid: string; iban: string | null; nombre?: string | null }[];
  valido_hasta: string | null;
  ultima_lectura: string | null;
  estado?: string | null;
  saldos?: Record<string, Saldo> | null;
}

export interface ResultadoSincronia {
  /** Movimientos que no estaban guardados. */
  nuevos: number;
  /** Cuentas leídas sin error. */
  cuentas: number;
  caducada: boolean;
  error?: string;
}

const hoy = () => new Date().toISOString().slice(0, 10);

export async function sincronizarConexion(db: SupabaseClient, c: ConexionGuardada): Promise<ResultadoSincronia> {
  const ahora = new Date();
  if (c.valido_hasta && new Date(c.valido_hasta).getTime() < ahora.getTime()) {
    await db.from('bancos_conectados').update({ estado: 'caducada' }).eq('id', c.id);
    return { nuevos: 0, cuentas: 0, caducada: true };
  }

  const desde = desdeParaSincronizar(c.ultima_lectura, hoy());
  const nuevosSaldos: Record<string, Saldo> = { ...(c.saldos ?? {}) };
  let nuevos = 0;
  let leidas = 0;
  let caducada = false;
  const errores: string[] = [];

  for (const cuenta of c.cuentas) {
    try {
      const movimientos = movimientosDesdeBanco(await transacciones(cuenta.uid, desde), cuenta.iban ?? cuenta.uid);
      if (movimientos.length) {
        const filas = movimientos.map(m => ({
          user_id: c.user_id,
          id: m.id,
          conexion_id: c.id,
          cuenta_uid: cuenta.uid,
          iban: cuenta.iban,
          fecha: m.fecha,
          importe: m.importe,
          concepto: m.concepto.slice(0, 500),
          referencia: m.referencia?.slice(0, 200) ?? null,
          saldo: m.saldo ?? null,
        }));
        // De 500 en 500: una primera lectura de 90 días en una cuenta con
        // mucho movimiento no cabe en una sola petición.
        for (let i = 0; i < filas.length; i += 500) {
          const { data, error } = await db.from('banco_movimientos')
            .upsert(filas.slice(i, i + 500), { onConflict: 'user_id,id', ignoreDuplicates: true })
            .select('id');
          if (error) throw new Error(error.message);
          nuevos += data?.length ?? 0;
        }
      }
      // El saldo es un extra: si el banco no lo da, los movimientos valen igual.
      try {
        const saldo = saldoPrincipal(await saldos(cuenta.uid));
        if (saldo) nuevosSaldos[cuenta.uid] = saldo;
      } catch (e) {
        if (esPermisoCaducado(e)) throw e;
      }
      leidas += 1;
    } catch (e) {
      if (esPermisoCaducado(e)) { caducada = true; break; }
      errores.push(`${cuenta.iban ?? cuenta.uid}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300));
    }
  }

  const cambios: Record<string, unknown> = {
    saldos: nuevosSaldos,
    ultimo_error: caducada ? 'El permiso del banco ha caducado o se ha retirado.' : errores.join(' · ') || null,
    estado: caducada ? 'caducada' : 'activa',
  };
  // Sólo se avanza la última lectura si se leyó algo: si todo falló, la
  // próxima vuelve a pedir desde el mismo día.
  if (leidas > 0) cambios.ultima_lectura = ahora.toISOString();
  await db.from('bancos_conectados').update(cambios).eq('id', c.id);

  return { nuevos, cuentas: leidas, caducada, ...(errores.length && !caducada ? { error: errores.join(' · ') } : {}) };
}

/** Todas las conexiones activas de la plataforma (el cron), de una en una. */
export async function sincronizarTodas(db: SupabaseClient): Promise<{ conexiones: number; nuevos: number; caducadas: number; fallidas: number }> {
  const { data } = await db.from('bancos_conectados')
    .select('id, user_id, banco, cuentas, valido_hasta, ultima_lectura, estado, saldos')
    .neq('estado', 'caducada');
  const resumen = { conexiones: 0, nuevos: 0, caducadas: 0, fallidas: 0 };
  for (const c of (data ?? []) as ConexionGuardada[]) {
    resumen.conexiones += 1;
    try {
      const r = await sincronizarConexion(db, c);
      resumen.nuevos += r.nuevos;
      if (r.caducada) resumen.caducadas += 1;
      if (r.error) resumen.fallidas += 1;
    } catch (e) {
      resumen.fallidas += 1;
      console.error('No se ha podido sincronizar una conexión bancaria:', e instanceof Error ? e.message : e);
    }
  }
  return resumen;
}
