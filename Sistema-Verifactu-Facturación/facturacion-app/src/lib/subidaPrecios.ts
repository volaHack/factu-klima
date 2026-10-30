/**
 * SUBIR PRECIOS EN BLOQUE
 *
 * En enero, o cuando el proveedor manda la tarifa nueva, toca subir los
 * precios de una familia entera. Uno a uno son doscientas fichas; aquí se
 * eligen (a mano o la categoría entera), se dice cuánto (+5 % o +0,20 €) y
 * se ve antes de aplicar cómo queda cada uno y con qué margen.
 *
 * El redondeo es el de las etiquetas de toda la vida: que el precio acabe
 * en 5, en 9 o en 0 céntimos. Siempre hacia arriba, para que redondear no
 * se coma la subida: 2,31 con «,x9» es 2,39, nunca 2,29.
 *
 * Las facturas ya emitidas no cambian: guardan el precio de su día. Lo que
 * cambia es lo que proponen las líneas nuevas.
 */

import type { Product } from './types';
import { costeDe } from './documentos';

export type ModoSubida = 'porcentaje' | 'euros';
/** En qué céntimo acaba el precio: «x5» → 2,35; «x9» → 2,39; «x0» → 2,40. */
export type Redondeo = 'ninguno' | 'x5' | 'x9' | 'x0';

export interface Subida {
  modo: ModoSubida;
  /** 5 = +5 % o +5 €; en negativo, una bajada. */
  valor: number;
  redondeo: Redondeo;
  /** Subir igual los precios fijados por tarifa de la ficha. */
  tambienTarifas?: boolean;
}

const ULTIMA_CIFRA: Record<Exclude<Redondeo, 'ninguno'>, number> = { x5: 5, x9: 9, x0: 0 };

/** Lleva los céntimos a la terminación pedida, hacia arriba. */
export function redondearPrecio(precio: number, redondeo: Redondeo): number {
  const centimos = Math.round(precio * 100);
  if (redondeo === 'ninguno' || centimos <= 0) return Math.max(0, centimos) / 100;
  const cifra = ULTIMA_CIFRA[redondeo];
  return (centimos + ((cifra - (centimos % 10) + 10) % 10)) / 100;
}

export function precioSubido(precio: number, subida: Subida): number {
  const base = subida.modo === 'porcentaje' ? precio * (1 + subida.valor / 100) : precio + subida.valor;
  // Una subida sobre un precio en blanco no inventa precio: se queda en 0.
  if (precio <= 0 && subida.modo === 'porcentaje') return 0;
  return redondearPrecio(Math.max(0, base), subida.redondeo);
}

/** Margen sobre la venta, en %. Null si falta el precio o el coste. */
export function margenSobreVenta(precio: number, coste: number): number | null {
  return precio > 0 && coste > 0 ? ((precio - coste) / precio) * 100 : null;
}

export interface FilaSubida {
  id: string;
  ref: string;
  nombre: string;
  antes: number;
  despues: number;
  coste: number;
  margenAntes: number | null;
  margenDespues: number | null;
  /** El precio nuevo queda por debajo de lo que cuesta. */
  bajoCoste: boolean;
}

export function previsualizarSubida(productos: readonly Product[], subida: Subida): FilaSubida[] {
  return productos.map(p => {
    const coste = costeDe(p);
    const despues = precioSubido(p.unitPrice, subida);
    return {
      id: p.id, ref: p.ref, nombre: p.name,
      antes: p.unitPrice, despues, coste,
      margenAntes: margenSobreVenta(p.unitPrice, coste),
      margenDespues: margenSobreVenta(despues, coste),
      bajoCoste: coste > 0 && despues > 0 && despues < coste,
    };
  });
}

export interface ResumenSubida {
  /** Cuántos cambian de precio de verdad. */
  cambian: number;
  /** Cuánto suben de media, en %, los que cambian. */
  mediaPct: number | null;
  bajoCoste: number;
}

export function resumirSubida(filas: readonly FilaSubida[]): ResumenSubida {
  const cambian = filas.filter(f => f.despues !== f.antes);
  const antes = cambian.reduce((n, f) => n + f.antes, 0);
  const despues = cambian.reduce((n, f) => n + f.despues, 0);
  return {
    cambian: cambian.length,
    mediaPct: antes > 0 ? ((despues - antes) / antes) * 100 : null,
    bajoCoste: filas.filter(f => f.bajoCoste).length,
  };
}

/** La ficha con su precio nuevo (y los de tarifa, si se pidió), lista para guardar. */
export function conPrecioSubido(p: Product, subida: Subida, ahora = new Date().toISOString()): Product {
  const tarifas = subida.tambienTarifas && p.tarifaPrices
    ? Object.fromEntries(Object.entries(p.tarifaPrices).map(([k, v]) => [k, precioSubido(Number(v) || 0, subida)]))
    : p.tarifaPrices;
  return { ...p, unitPrice: precioSubido(p.unitPrice, subida), tarifaPrices: tarifas, updatedAt: ahora };
}

/**
 * Para deshacer: la ficha tal como está AHORA, con los precios de antes. No
 * se devuelve la copia vieja entera, que pisaría lo que se haya tocado en
 * esos segundos (el stock lo mueven los documentos).
 */
export function conPreciosDeAntes(actual: Product, antes: Pick<Product, 'unitPrice' | 'tarifaPrices'>, ahora = new Date().toISOString()): Product {
  return { ...actual, unitPrice: antes.unitPrice, tarifaPrices: antes.tarifaPrices, updatedAt: ahora };
}
