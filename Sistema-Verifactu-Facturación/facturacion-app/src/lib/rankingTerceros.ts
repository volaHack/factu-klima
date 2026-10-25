/**
 * LOS MEJORES CLIENTES Y PROVEEDORES, POR TIPO DE DOCUMENTO
 *
 * La gráfica de Clientes y proveedores sumaba sólo las facturas de venta de
 * Klima. Ahora se elige qué documento contar (facturas, albaranes, pedidos o
 * presupuestos de venta; facturas o albaranes de compra) y de dónde: los
 * hechos en Klima o el historial del programa anterior (ISECAN), que se suma
 * en la base de datos (`top_historico`, migración 073).
 *
 * Aquí la cuenta de lo de Klima, sin React, para poder probarla.
 */

import { isFactura } from './documentos';
import type { FilaTopHistorico, TipoHistorico } from './historico';
import type { Invoice } from './types';

export const TIPOS_RANKING: { id: TipoHistorico; nombre: string; compra: boolean }[] = [
  { id: 'factura_venta', nombre: 'Facturas de venta', compra: false },
  { id: 'albaran_venta', nombre: 'Albaranes de venta', compra: false },
  { id: 'pedido_venta', nombre: 'Pedidos de venta', compra: false },
  { id: 'presupuesto_venta', nombre: 'Presupuestos', compra: false },
  { id: 'factura_compra', nombre: 'Facturas de compra', compra: true },
  { id: 'albaran_compra', nombre: 'Albaranes de compra', compra: true },
];

export const esDeCompra = (tipo: TipoHistorico) => tipo === 'factura_compra' || tipo === 'albaran_compra';

export interface FilaRanking {
  id: string;
  name: string;
  total: number;
  count: number;
}

/** ¿Este documento de Klima es del tipo que se cuenta? */
export function casaConTipo(doc: Pick<Invoice, 'tipo' | 'sentido' | 'number' | 'series' | 'status'>, tipo: TipoHistorico): boolean {
  if (doc.status === 'anulada' || doc.status === 'borrador') return false;
  const compra = (doc.sentido ?? 'venta') === 'compra';
  if (compra !== esDeCompra(tipo)) return false;
  switch (tipo) {
    case 'factura_venta':
      return isFactura(doc);
    case 'factura_compra':
      // isFactura sólo reconoce ventas: se le pregunta como si lo fuera.
      return isFactura({ ...doc, sentido: 'venta' });
    case 'albaran_venta':
    case 'albaran_compra':
      return doc.tipo === 'albaran';
    case 'pedido_venta':
      return doc.tipo === 'pedido';
    case 'presupuesto_venta':
      return doc.tipo === 'presupuesto';
  }
}

/** Los `limite` terceros con más importe en ese tipo de documento de Klima. */
export function rankingDeKlima(
  documentos: readonly Invoice[],
  nombreDe: (clientId: string) => string | undefined,
  tipo: TipoHistorico,
  limite = 6,
): FilaRanking[] {
  const suma = new Map<string, FilaRanking>();
  for (const d of documentos) {
    if (!d.clientId || !casaConTipo(d, tipo)) continue;
    const fila = suma.get(d.clientId) ?? { id: d.clientId, name: nombreDe(d.clientId) ?? d.clientName ?? 'Sin nombre', total: 0, count: 0 };
    fila.total += d.total;
    fila.count += 1;
    suma.set(d.clientId, fila);
  }
  return [...suma.values()]
    .map(f => ({ ...f, total: Math.round(f.total * 100) / 100 }))
    .filter(f => f.total !== 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, limite);
}

/** Las filas del historial, con el nombre de la ficha de aquí si la tienen. */
export function rankingDelHistorico(
  filas: readonly FilaTopHistorico[],
  nombreDe: (clientId: string) => string | undefined,
): FilaRanking[] {
  return filas
    .filter(f => f.total !== 0)
    .map((f, i) => ({
      id: f.clientId ?? `cod-${f.codigo ?? i}`,
      name: (f.clientId && nombreDe(f.clientId)) || f.nombre || (f.codigo ? `Cód. ${f.codigo}` : 'Sin ficha'),
      total: Math.round(f.total * 100) / 100,
      count: f.documentos,
    }));
}
