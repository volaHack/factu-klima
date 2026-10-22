'use client';

/**
 * HISTORIAL DEL PROGRAMA ANTERIOR
 *
 * Lo que una empresa emitió en su programa de antes (ISECAN…), guardado en
 * `historico_documentos` (migración 068) para consultarlo en la ficha del
 * cliente o del proveedor. No son facturas de Klima: no pasan por
 * Veri*Factu ni cuentan en los modelos ni en la contabilidad.
 */

import { createClient } from './supabase/client';
import { todasLasFilas } from './porTandas';
import { faltaLaTabla } from './recordatorios/filas';

export type TipoHistorico = 'factura_venta' | 'albaran_venta' | 'pedido_venta' | 'factura_compra' | 'albaran_compra';

export interface DocumentoHistorico {
  id: string;
  origen: string;
  tipo: TipoHistorico;
  serie: string;
  numero: string;
  fecha: string | null;
  base: number;
  impuestos: number;
  total: number;
  bases: { tipo: number; base: number; cuota: number }[];
  formaPago: string | null;
  observaciones: string | null;
  pasaA: string[];
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export function documentoDeFila(f: any): DocumentoHistorico {
  return {
    id: f.id,
    origen: f.origen,
    tipo: f.tipo,
    serie: f.serie ?? '',
    numero: f.numero,
    fecha: f.fecha ?? null,
    base: Number(f.base) || 0,
    impuestos: Number(f.impuestos) || 0,
    total: Number(f.total) || 0,
    bases: Array.isArray(f.bases) ? f.bases : [],
    formaPago: f.forma_pago ?? null,
    observaciones: f.observaciones ?? null,
    pasaA: f.pasa_a ?? [],
  };
}

/** Los documentos de una ficha, el más reciente primero. Sin la tabla (migración 068), ninguno. */
export async function getHistoricoDeFicha(clientId: string): Promise<DocumentoHistorico[]> {
  const db = createClient();
  const { data, error } = await todasLasFilas((desde, hasta) => db.from('historico_documentos').select('*')
    .eq('client_id', clientId)
    .order('fecha', { ascending: false, nullsFirst: false }).order('id').range(desde, hasta));
  if (error) {
    if (faltaLaTabla(error)) return [];
    throw new Error((error as { message: string }).message);
  }
  return (data ?? []).map(documentoDeFila);
}

export const NOMBRE_TIPO: Record<TipoHistorico, string> = {
  factura_venta: 'Factura',
  albaran_venta: 'Albarán',
  pedido_venta: 'Pedido',
  factura_compra: 'Factura',
  albaran_compra: 'Albarán',
};

export const NOMBRE_ORIGEN: Record<string, string> = { isecan: 'ISECAN' };

/**
 * El número como lo conocían: ISECAN ya mete el año en el número de las
 * facturas (serie 24, número 24000001), pero no en el de los pedidos
 * (serie T24, número 3203).
 */
export function numeroVisible(d: Pick<DocumentoHistorico, 'serie' | 'numero'>): string {
  if (!d.serie || d.numero.startsWith(d.serie)) return d.numero;
  return `${d.serie.toUpperCase()}/${d.numero}`;
}

/** Un albarán o pedido que no llegó a ningún documento posterior. */
export function quedoPendiente(d: Pick<DocumentoHistorico, 'tipo' | 'pasaA'>): boolean {
  return d.tipo !== 'factura_venta' && d.tipo !== 'factura_compra' && d.pasaA.length === 0;
}

export interface AnioHistorico {
  anio: string;
  facturas: number;
  total: number;
}

export interface ResumenHistorico {
  /** Facturas por año, del más reciente al más antiguo. */
  anios: AnioHistorico[];
  ultimaFactura: string | null;
  pendientes: { albaranes: number; pedidos: number; total: number };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function resumenHistorico(docs: readonly DocumentoHistorico[]): ResumenHistorico {
  const porAnio = new Map<string, AnioHistorico>();
  let ultimaFactura: string | null = null;
  const pendientes = { albaranes: 0, pedidos: 0, total: 0 };
  for (const d of docs) {
    if (d.tipo === 'factura_venta' || d.tipo === 'factura_compra') {
      const anio = d.fecha?.slice(0, 4) ?? 'Sin fecha';
      const a = porAnio.get(anio) ?? { anio, facturas: 0, total: 0 };
      a.facturas++;
      a.total = r2(a.total + d.total);
      porAnio.set(anio, a);
      if (d.fecha && (!ultimaFactura || d.fecha > ultimaFactura)) ultimaFactura = d.fecha;
    } else if (quedoPendiente(d)) {
      if (d.tipo === 'pedido_venta') pendientes.pedidos++;
      else pendientes.albaranes++;
      pendientes.total = r2(pendientes.total + d.total);
    }
  }
  const anios = [...porAnio.values()].sort((a, b) => b.anio.localeCompare(a.anio));
  return { anios, ultimaFactura, pendientes };
}
