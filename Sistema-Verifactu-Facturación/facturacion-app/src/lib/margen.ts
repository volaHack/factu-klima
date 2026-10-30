/**
 * EL MARGEN DE CADA LÍNEA, MIENTRAS SE ESCRIBE
 *
 * Hasta ahora la línea sólo avisaba cuando se vendía por debajo del coste,
 * y para entonces ya se pierde dinero. Lo que de verdad hace falta saber al
 * poner un precio es cuánto queda: un 3 % de margen no es una pérdida, pero
 * tampoco paga el reparto. Aquí se calcula el margen de la línea con su
 * precio neto (los tres descuentos en cascada ya aplicados) y se dice en
 * qué punto está:
 *
 *   · `perdida`: el neto no cubre el coste;
 *   · `bajo`: lo cubre, pero queda menos del MARGEN_BAJO;
 *   · `normal`: el resto.
 *
 * El margen es sobre la venta (lo que queda de cada euro vendido), el mismo
 * que enseña el panel en «Margen del mes». El coste es el de `costeDe`: el
 * precio medio y, sin él, la última compra o el precio de compra. Sin coste
 * no hay margen que enseñar: saldría un 100 % que no es verdad.
 */

import type { InvoiceLineItem, Product } from './types';
import { costeDe, precioNetoDe } from './documentos';

/** Por debajo de esto el margen se enseña como aviso. */
export const MARGEN_BAJO = 10;
/** El margen que se propone al pulsar «Subir el precio». */
export const MARGEN_PROPUESTO = 20;

export type NivelMargen = 'perdida' | 'bajo' | 'normal';

export interface MargenLinea {
  coste: number;
  /** El precio de cada unidad con los descuentos ya aplicados. */
  neto: number;
  /** Lo que se gana (o se pierde, en negativo) por unidad. */
  porUnidad: number;
  /** Margen sobre la venta, en %, con un decimal. */
  porcentaje: number;
  nivel: NivelMargen;
}

type LineaConPrecio = Pick<InvoiceLineItem, 'productId' | 'unitPrice' | 'discountPercent' | 'discountPercent2' | 'discountPercent3'>;

/** El margen de una línea de venta, o `null` si no hay con qué calcularlo. */
export function margenDeLinea(
  linea: LineaConPrecio,
  producto: Pick<Product, 'costePmp' | 'costeUltimaCompra' | 'purchasePrice'> | undefined,
  umbralBajo = MARGEN_BAJO,
): MargenLinea | null {
  if (!linea.productId || !producto) return null;
  const coste = costeDe(producto);
  // Sin precio ya avisa la línea («Sin precio: la línea sale a 0 €»).
  if (coste <= 0 || !(linea.unitPrice > 0)) return null;
  const neto = precioNetoDe(linea);
  const porUnidad = neto - coste;
  const porcentaje = neto > 0 ? Math.round((porUnidad / neto) * 1000) / 10 : -100;
  const nivel: NivelMargen = porUnidad < -0.00005 ? 'perdida' : porcentaje < umbralBajo ? 'bajo' : 'normal';
  return { coste, neto, porUnidad, porcentaje, nivel };
}

/**
 * El precio por unidad (antes de los descuentos de la línea) que deja ese
 * margen sobre la venta. Se redondea al céntimo hacia arriba: al céntimo
 * hacia abajo se quedaría una décima por debajo de lo pedido.
 */
export function precioParaMargen(
  coste: number,
  margen: number,
  descuentos: readonly [number?, number?, number?] = [],
): number | null {
  if (!(coste > 0) || !(margen < 100)) return null;
  const neto = coste / (1 - margen / 100);
  const factor = descuentos.reduce<number>((f, d) => f * (1 - (d || 0) / 100), 1);
  if (!(factor > 0)) return null;
  return Math.ceil(Math.round((neto / factor) * 1e6) / 1e4) / 100;
}

/** El margen en una frase corta: «Margen 32 %» o «Margen −8 %». */
export function textoMargen(m: Pick<MargenLinea, 'porcentaje'>): string {
  const p = m.porcentaje.toLocaleString('es-ES', { maximumFractionDigits: 1 });
  return `Margen ${p.replace('-', '−')} %`;
}
