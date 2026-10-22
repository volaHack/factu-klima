import 'server-only';

/**
 * LO QUE COMPARTEN LAS RUTAS DEL BANCO
 *
 * Las conexiones de una empresa tal como se enseñan (sin el `session_id`,
 * que no sale del servidor) y qué movimientos guardados están ya
 * conciliados: la marca `[banco:id]` vive en las notas de cobros, pagos y
 * gastos (ver `conciliar.ts`), así que vale venga de donde venga.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { idsMarcados } from './conciliar';
import { todasLasFilas } from '../porTandas';
import { diasParaCaducar, type Saldo } from './sincronia';
import type { ConexionGuardada } from './sincronizar';

export interface CuentaVista {
  uid: string;
  iban: string | null;
  nombre: string | null;
  saldo: Saldo | null;
}

export interface ConexionVista {
  id: string;
  banco: string;
  cuentas: CuentaVista[];
  validoHasta: string | null;
  diasParaCaducar: number | null;
  ultimaLectura: string | null;
  caducada: boolean;
  ultimoError: string | null;
}

export const CAMPOS_CONEXION = 'id, user_id, banco, cuentas, valido_hasta, ultima_lectura, estado, saldos, ultimo_error, creado_en';

export function vistaDeConexion(c: ConexionGuardada & { ultimo_error?: string | null }, ahora = new Date()): ConexionVista {
  const dias = diasParaCaducar(c.valido_hasta, ahora);
  const saldos = (c.saldos ?? {}) as Record<string, Saldo>;
  return {
    id: c.id,
    banco: c.banco,
    cuentas: (c.cuentas ?? []).map(x => ({ uid: x.uid, iban: x.iban, nombre: x.nombre ?? null, saldo: saldos[x.uid] ?? null })),
    validoHasta: c.valido_hasta,
    diasParaCaducar: dias,
    ultimaLectura: c.ultima_lectura,
    caducada: c.estado === 'caducada' || (dias != null && dias < 0),
    ultimoError: c.ultimo_error ?? null,
  };
}

export async function conexionesDe(db: SupabaseClient, userId: string): Promise<(ConexionGuardada & { ultimo_error?: string | null })[]> {
  const { data } = await db.from('bancos_conectados').select(CAMPOS_CONEXION)
    .eq('user_id', userId).order('creado_en', { ascending: false });
  return (data ?? []) as (ConexionGuardada & { ultimo_error?: string | null })[];
}

/** Los movimientos que la empresa ya ha conciliado con un cobro, un pago o un gasto. */
export async function conciliadosDe(db: SupabaseClient, userId: string): Promise<Map<string, string>> {
  const [cobros, gastos] = await Promise.all([
    todasLasFilas((desde, hasta) => db.from('cobros_pagos').select('tipo, number, notas').eq('user_id', userId)
      .like('notas', '%[banco:%').order('id').range(desde, hasta)),
    todasLasFilas((desde, hasta) => db.from('gastos').select('concepto, notas').eq('user_id', userId)
      .like('notas', '%[banco:%').order('id').range(desde, hasta)),
  ]);
  const hechos = new Map<string, string>();
  for (const c of (cobros.data ?? []) as { tipo: string; number: string; notas: string }[]) {
    for (const id of idsMarcados([c.notas])) hechos.set(id, `${c.tipo === 'cobro' ? 'Cobro' : 'Pago'} ${c.number ?? ''}`.trim());
  }
  for (const g of (gastos.data ?? []) as { concepto: string; notas: string }[]) {
    for (const id of idsMarcados([g.notas])) hechos.set(id, `Gasto: ${g.concepto}`);
  }
  return hechos;
}

/** Cuántos movimientos de los últimos 90 días quedan por conciliar. */
export async function sinConciliarDe(db: SupabaseClient, userId: string): Promise<number> {
  const desde = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const [{ data }, hechos] = await Promise.all([
    db.from('banco_movimientos').select('id').eq('user_id', userId).eq('ignorado', false).gte('fecha', desde).limit(5000),
    conciliadosDe(db, userId),
  ]);
  return ((data ?? []) as { id: string }[]).filter(m => !hechos.has(m.id)).length;
}
