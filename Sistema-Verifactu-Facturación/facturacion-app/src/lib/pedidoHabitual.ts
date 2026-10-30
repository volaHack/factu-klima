/**
 * «LO QUE SUELE PEDIR ESTE CLIENTE»
 *
 * «Lo mismo que la última vez» (repetirPedido.ts) copia un documento
 * entero, y sirve cuando el pedido se repite tal cual. Lo normal es otra
 * cosa: el bar pide agua todas las semanas, cerveza casi todas y el vermú
 * por Navidad. Aquí se cuentan los artículos que más veces aparecen en los
 * documentos de la ficha y, de cada uno, la cantidad y el precio de la
 * última vez, para ponerlos de un toque uno a uno.
 *
 *   · Cuentan facturas, albaranes y pedidos que llegaron a salir: ni
 *     borradores, ni anulados, ni rechazados, ni presupuestos, ni
 *     rectificativas (son devoluciones, no pedidos).
 *   · Las veces son documentos, no líneas: el mismo artículo en dos líneas
 *     de una factura cuenta una vez.
 *   · A igualdad de veces va antes lo que se pidió más recientemente.
 */

import { InvoiceStatus, type Invoice, type InvoiceLineItem, type Product, type SentidoDocumento } from './types';
import { recalcularLinea } from './documentos';

const NO_CUENTAN = new Set<string>([InvoiceStatus.BORRADOR, InvoiceStatus.ANULADA, InvoiceStatus.RECHAZADO]);

export interface ArticuloHabitual {
  productId: string;
  nombre: string;
  /** En cuántos documentos aparece. */
  veces: number;
  ultimaFecha: string;
  ultimaCantidad: number;
  ultimasCajas?: number | null;
  unitsPerPackage?: number;
  ultimoPrecio: number;
  ultimosDescuentos: [number, number, number];
}

function cuenta(d: Invoice, clienteId: string, sentido: SentidoDocumento, excluirId?: string): boolean {
  if (d.clientId !== clienteId || d.id === excluirId || NO_CUENTAN.has(d.status)) return false;
  if ((d.sentido ?? 'venta') !== sentido) return false;
  if (d.tipo === 'presupuesto' || d.tipo === 'rectificativa' || (Number(d.total) || 0) < 0) return false;
  // Documentos de antes de que existiera `tipo`: un presupuesto lo dice el número.
  if (!d.tipo && (d.number ?? '').toUpperCase().startsWith('PRE-')) return false;
  return true;
}

/** Los artículos que más pide esta ficha, con lo de la última vez. */
export function articulosHabituales(
  docs: readonly Invoice[],
  clienteId: string | null | undefined,
  sentido: SentidoDocumento = 'venta',
  opts: { max?: number; excluirId?: string } = {},
): ArticuloHabitual[] {
  if (!clienteId) return [];
  const veces = new Map<string, number>();
  const ultima = new Map<string, { linea: InvoiceLineItem; fecha: string; orden: string }>();

  for (const d of docs) {
    if (!cuenta(d, clienteId, sentido, opts.excluirId)) continue;
    const orden = `${d.issueDate ?? ''}|${d.createdAt ?? ''}`;
    const vistos = new Set<string>();
    for (const l of d.lineItems ?? []) {
      if (!l.productId || !(Number(l.quantity) > 0) || vistos.has(l.productId)) continue;
      vistos.add(l.productId);
      veces.set(l.productId, (veces.get(l.productId) ?? 0) + 1);
      const previa = ultima.get(l.productId);
      if (!previa || orden > previa.orden) ultima.set(l.productId, { linea: l, fecha: d.issueDate ?? '', orden });
    }
  }

  return [...ultima.entries()]
    .sort(([a, ua], [b, ub]) => (veces.get(b) ?? 0) - (veces.get(a) ?? 0) || ub.orden.localeCompare(ua.orden))
    .slice(0, opts.max ?? 8)
    .map(([productId, { linea: l, fecha }]) => ({
      productId,
      nombre: l.productName,
      veces: veces.get(productId) ?? 0,
      ultimaFecha: fecha,
      ultimaCantidad: Number(l.quantity) || 0,
      ultimasCajas: l.cajas ?? null,
      unitsPerPackage: l.unitsPerPackage,
      ultimoPrecio: Number(l.unitPrice) || 0,
      ultimosDescuentos: [l.discountPercent || 0, l.discountPercent2 || 0, l.discountPercent3 || 0],
    }));
}

/**
 * La línea que se añade al tocar un habitual: el artículo con la cantidad
 * (y las cajas) y el precio de la última vez, que es lo que enseña el
 * botón. Si hoy le tocara otro precio, el editor ya ofrece «Recalcular».
 * `base` es una línea vacía con lo de la empresa (impuesto, casilla de
 * cajas); el impuesto, el del artículo.
 */
export function lineaDeHabitual(
  h: ArticuloHabitual,
  producto: Pick<Product, 'id' | 'name' | 'ref' | 'unit' | 'unitsPerPackage' | 'defaultTaxRate'>,
  base: InvoiceLineItem,
): InvoiceLineItem {
  const [d1, d2, d3] = h.ultimosDescuentos;
  return recalcularLinea({
    ...base,
    productId: producto.id,
    productName: producto.name,
    productRef: producto.ref,
    unit: producto.unit,
    taxRate: producto.defaultTaxRate,
    quantity: h.ultimaCantidad,
    // Las cajas sólo en los oficios que las llevan (la línea vacía trae la casilla).
    ...(h.ultimasCajas != null && 'cajas' in base ? { cajas: h.ultimasCajas } : {}),
    unitsPerPackage: h.unitsPerPackage || producto.unitsPerPackage,
    unitPrice: h.ultimoPrecio,
    discountPercent: d1,
    discountPercent2: d2,
    discountPercent3: d3,
  });
}
