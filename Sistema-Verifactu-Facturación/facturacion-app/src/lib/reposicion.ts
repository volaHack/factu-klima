/**
 * «REPÓN ESTO» Y «SIN MOVIMIENTO»
 *
 * El aviso de stock bajo de siempre mira un mínimo puesto a mano, y casi
 * nadie lo pone (o lo pone una vez y no lo vuelve a tocar). Aquí se mira lo
 * que de verdad pasa: a qué ritmo se vende cada artículo y cuántos días le
 * quedan al stock a ese ritmo. Se avisa antes de quedarse sin nada, con la
 * cantidad que conviene pedir para cubrir unas semanas, en cajas si el
 * artículo va por cajas.
 *
 * El ritmo sale de las facturas de los últimos 90 días (o desde que existe
 * el artículo, si es más nuevo, pero nunca menos de 60: con dos semanas de
 * historia, una venta grande parecería una costumbre). Lo pendiente de
 * recibir en pedidos de compra ya cuenta como stock que viene.
 *
 * La otra cara: lo que lleva más de 90 días sin venderse y sigue en el
 * almacén. Es dinero parado, y se ordena por cuánto.
 */

import type { Product, Invoice } from './types';
import { costeDe } from './documentos';
import { ventasPorArticulo, diasEntre, haceDias, type Movimiento } from './ventasArticulos';

export const VENTANA_MAX = 90;
export const VENTANA_MIN = 60;

export type Urgencia = 'agotado' | 'urgente' | 'pronto';

export interface Reposicion {
  id: string;
  nombre: string;
  ref: string;
  unidad: string;
  stock: number;
  /** Unidades que llegan en pedidos de compra pendientes. */
  porRecibir: number;
  /** Unidades vendidas por día, de media. */
  porDia: number;
  /** Días que aguanta el stock (más lo que viene) a ese ritmo. */
  diasQuedan: number;
  /** Unidades que conviene pedir para cubrir los días pedidos. */
  sugerido: number;
  /** Lo mismo en cajas, si el artículo va por cajas. */
  cajas: number | null;
  udsCaja: number | null;
  urgencia: Urgencia;
}

export interface OpcionesReposicion {
  hoy?: Date;
  /** Se avisa cuando quedan estos días o menos. */
  avisarConDias?: number;
  /** Para cuántos días se sugiere pedir. */
  cubrirDias?: number;
  /** Pendiente de recibir por artículo (lib/documentos → pendientesPorProducto). */
  pendientes?: ReadonlyMap<string, { pendienteRecibir: number }>;
}

/** Los días sobre los que se calcula el ritmo de este artículo. */
export function ventanaDe(p: Pick<Product, 'createdAt'>, hoy: Date): number {
  const edad = p.createdAt ? diasEntre(p.createdAt, hoy) : Infinity;
  return Math.max(VENTANA_MIN, Math.min(VENTANA_MAX, Number.isFinite(edad) ? edad : VENTANA_MAX));
}

function vendidoDesde(ventas: readonly Movimiento[] | undefined, desde: string): number {
  if (!ventas) return 0;
  return ventas.reduce((n, v) => (v.fecha >= desde ? n + v.unidades : n), 0);
}

export function calcularReposicion(productos: readonly Product[], docs: readonly Invoice[], opciones: OpcionesReposicion = {}): Reposicion[] {
  const { hoy = new Date(), avisarConDias = 14, cubrirDias = 30, pendientes } = opciones;
  const ventas = ventasPorArticulo(docs);
  const salida: Reposicion[] = [];

  for (const p of productos) {
    if (p.active === false) continue;
    const ventana = ventanaDe(p, hoy);
    const vendido = vendidoDesde(ventas.get(p.id), haceDias(hoy, ventana));
    if (vendido <= 0) continue;

    const porDia = vendido / ventana;
    const stock = p.stockQuantity ?? 0;
    const porRecibir = Math.max(0, pendientes?.get(p.id)?.pendienteRecibir ?? 0);
    const disponible = stock + porRecibir;
    const diasQuedan = disponible <= 0 ? 0 : Math.floor(disponible / porDia);
    if (diasQuedan > avisarConDias) continue;

    const uc = (p.unitsPerPackage ?? 0) > 1 ? p.unitsPerPackage! : null;
    let sugerido = Math.max(0, Math.ceil(porDia * cubrirDias - disponible));
    let cajas: number | null = null;
    if (uc && sugerido > 0) {
      cajas = Math.ceil(sugerido / uc);
      sugerido = cajas * uc;
    }
    salida.push({
      id: p.id, nombre: p.name, ref: p.ref, unidad: p.unit, stock, porRecibir,
      porDia, diasQuedan, sugerido, cajas, udsCaja: uc,
      urgencia: stock <= 0 ? 'agotado' : diasQuedan <= Math.min(7, avisarConDias) ? 'urgente' : 'pronto',
    });
  }

  return salida.sort((a, b) => a.diasQuedan - b.diasQuedan || b.porDia - a.porDia);
}

export interface SinMovimiento {
  id: string;
  nombre: string;
  ref: string;
  unidad: string;
  stock: number;
  /** La última venta, o null si nunca se ha vendido. */
  ultimaVenta: string | null;
  /** Días desde la última venta (o desde el alta, si nunca se vendió). */
  dias: number;
  /** Lo que vale lo que hay, a coste (o a precio de venta si no hay coste). */
  valorParado: number;
}

export function sinMovimiento(productos: readonly Product[], docs: readonly Invoice[], opciones: { hoy?: Date; dias?: number } = {}): SinMovimiento[] {
  const { hoy = new Date(), dias = 90 } = opciones;
  const ventas = ventasPorArticulo(docs);
  const salida: SinMovimiento[] = [];

  for (const p of productos) {
    if (p.active === false) continue;
    const stock = p.stockQuantity ?? 0;
    if (stock <= 0) continue;
    const suyas = ventas.get(p.id)?.filter(v => v.unidades > 0);
    const ultimaVenta = suyas?.length ? suyas[suyas.length - 1].fecha : null;
    const desde = ultimaVenta ?? p.createdAt;
    const pasados = desde ? diasEntre(desde, hoy) : Infinity;
    // Recién dado de alta y sin vender aún: no es mercancía parada todavía.
    if (!(pasados > dias)) continue;
    const coste = costeDe(p);
    salida.push({
      id: p.id, nombre: p.name, ref: p.ref, unidad: p.unit, stock, ultimaVenta,
      dias: Number.isFinite(pasados) ? pasados : dias + 1,
      valorParado: Math.round(stock * (coste > 0 ? coste : p.unitPrice) * 100) / 100,
    });
  }

  return salida.sort((a, b) => b.valorParado - a.valorParado || b.dias - a.dias);
}
