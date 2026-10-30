/**
 * LO QUE SE HA VENDIDO Y COMPRADO DE CADA ARTÍCULO
 *
 * La base de «Repón esto», de «Sin movimiento» y de la ficha que aconseja:
 * las líneas de los documentos, ya contadas en unidades sueltas (que es lo
 * que lleva el stock) y con su precio por unidad.
 *
 * Ventas: solo facturas de venta de verdad (también las rectificativas, que
 * restan), ni borradores ni anuladas. Un albarán sin facturar ya ha sacado
 * la mercancía, pero contarlo además de su factura la contaría dos veces.
 * Compras: facturas y albaranes de proveedor, que son los que traen el
 * precio al que entró la mercancía.
 */

import type { Invoice, InvoiceLineItem } from './types';
import { isFactura, precioNetoDe } from './documentos';
import { desgloseLinea, vaPorUnidades } from './cajas';

export interface Movimiento {
  docId: string;
  fecha: string;
  clientId: string;
  clientName: string;
  /** Unidades sueltas (negativas en una rectificativa). */
  unidades: number;
  /** Importe de la línea, sin impuestos y con sus descuentos. */
  importe: number;
  /** Precio de tarifa por unidad, antes de descuentos. */
  precioUnidad: number;
  /** Precio por unidad después de los descuentos de la línea. */
  netoUnidad: number;
}

const NO_CUENTAN = new Set(['borrador', 'anulada', 'rechazado', 'pre_aprobacion']);

/** El precio de una línea, por unidad suelta: en las de antes iba por caja. */
function porUnidad(l: InvoiceLineItem, precio: number): number {
  const uc = l.unitsPerPackage ?? 0;
  return !vaPorUnidades(l) && uc > 1 ? precio / uc : precio;
}

function movimiento(d: Invoice, l: InvoiceLineItem): Movimiento {
  const unidades = desgloseLinea(l).unidades;
  return {
    docId: d.id,
    fecha: d.issueDate,
    clientId: d.clientId,
    clientName: d.clientName,
    unidades,
    importe: Number.isFinite(l.subtotal) ? l.subtotal : unidades * precioNetoDe(l),
    precioUnidad: porUnidad(l, l.unitPrice),
    netoUnidad: porUnidad(l, precioNetoDe(l)),
  };
}

function agrupar(docs: readonly Invoice[], cuenta: (d: Invoice) => boolean): Map<string, Movimiento[]> {
  const por = new Map<string, Movimiento[]>();
  for (const d of docs) {
    if (NO_CUENTAN.has(d.status) || !cuenta(d)) continue;
    for (const l of d.lineItems ?? []) {
      if (!l.productId) continue;
      const lista = por.get(l.productId);
      if (lista) lista.push(movimiento(d, l)); else por.set(l.productId, [movimiento(d, l)]);
    }
  }
  for (const lista of por.values()) lista.sort((a, b) => a.fecha.localeCompare(b.fecha));
  return por;
}

/** Lo vendido de cada artículo, de lo más antiguo a lo más reciente. */
export function ventasPorArticulo(docs: readonly Invoice[]): Map<string, Movimiento[]> {
  return agrupar(docs, isFactura);
}

/** Lo comprado de cada artículo, de lo más antiguo a lo más reciente. */
export function comprasPorArticulo(docs: readonly Invoice[]): Map<string, Movimiento[]> {
  return agrupar(docs, d => d.sentido === 'compra' && (d.tipo === 'factura' || d.tipo === 'albaran'));
}

const DIA = 86_400_000;

/** Días enteros entre dos fechas «AAAA-MM-DD» (o ISO), sin líos de hora. */
export function diasEntre(desde: string, hasta: Date): number {
  const a = Date.parse(desde.slice(0, 10) + 'T00:00:00Z');
  const b = Date.UTC(hasta.getFullYear(), hasta.getMonth(), hasta.getDate());
  return Number.isFinite(a) ? Math.floor((b - a) / DIA) : Infinity;
}

/** «AAAA-MM-DD» de hace `dias` días. */
export function haceDias(hoy: Date, dias: number): string {
  return new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()) - dias * DIA).toISOString().slice(0, 10);
}
