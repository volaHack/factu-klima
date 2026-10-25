/**
 * LOS AVISOS DE LA CAMPANA
 *
 * Lo que sale al pulsar la campana de la cabecera y el número que lleva
 * encima. Antes la campana contaba de una manera y el panel listaba de
 * otra (borradores con vencimiento, facturas de compra, albaranes…), y el
 * número no cuadraba con la lista. Aquí se decide una sola vez.
 *
 *   · Cobros: facturas de venta emitidas sin cobrar entero, vencidas o que
 *     vencen en 7 días. Con lo que de verdad falta por cobrar.
 *   · Stock: artículos activos que llevan existencias, agotados o por
 *     debajo de su mínimo (5 si no tienen uno puesto).
 */

import { isFactura } from './documentos';
import { InvoiceStatus, type Invoice, type Product } from './types';

export const DIAS_AVISO_VENCIMIENTO = 7;
const MINIMO_POR_DEFECTO = 5;
const SIN_COBRAR = new Set<string>([InvoiceStatus.EMITIDA, InvoiceStatus.PENDIENTE, InvoiceStatus.PARCIAL, InvoiceStatus.VENCIDA]);

export type TipoAviso = 'vencida' | 'vence' | 'agotado' | 'stock_bajo';

export interface Aviso {
  id: string;
  tipo: TipoAviso;
  grupo: 'cobros' | 'stock';
  gravedad: 'peligro' | 'atencion';
  titulo: string;
  detalle: string;
  /** Importe pendiente (cobros) o existencias (stock). */
  cifra: number;
  /** Días de retraso (vencida), días que faltan (vence); 0 en stock. */
  dias: number;
  href: string;
}

export interface ResumenAvisos {
  avisos: Aviso[];
  vencidas: number;
  importeVencido: number;
  vencen: number;
  stock: number;
}

const DIA = 24 * 60 * 60 * 1000;

/** Días enteros de hoy al vencimiento (negativo: ya pasó). Por fecha, sin horas. */
export function diasHasta(fecha: string, hoy: Date): number {
  const [a, m, d] = fecha.slice(0, 10).split('-').map(Number);
  if (!a || !m || !d) return Number.NaN;
  const vence = Date.UTC(a, m - 1, d);
  const base = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.round((vence - base) / DIA);
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function avisosDeLaCampana(facturas: readonly Invoice[], articulos: readonly Product[], hoy = new Date()): ResumenAvisos {
  const avisos: Aviso[] = [];

  for (const f of facturas) {
    if (!SIN_COBRAR.has(f.status) || !isFactura(f)) continue;
    const pendiente = Math.round(((Number(f.total) || 0) - (Number(f.paidAmount) || 0)) * 100) / 100;
    if (pendiente <= 0) continue;
    const dias = f.dueDate ? diasHasta(f.dueDate, hoy) : Number.NaN;
    const vencida = f.status === InvoiceStatus.VENCIDA || dias < 0;
    if (!vencida && !(dias <= DIAS_AVISO_VENCIMIENTO)) continue;
    const retraso = vencida ? Math.max(0, -dias || 0) : 0;
    avisos.push({
      id: `factura-${f.id}`,
      tipo: vencida ? 'vencida' : 'vence',
      grupo: 'cobros',
      gravedad: vencida ? 'peligro' : 'atencion',
      titulo: f.clientName || 'Sin cliente',
      detalle: vencida
        ? `${f.number} · ${retraso > 0 ? `vencida hace ${plural(retraso, 'día', 'días')}` : 'vencida'}`
        : `${f.number} · ${dias === 0 ? 'vence hoy' : dias === 1 ? 'vence mañana' : `vence en ${dias} días`}`,
      cifra: pendiente,
      dias: vencida ? retraso : dias,
      href: `/facturas/${f.id}`,
    });
  }

  for (const p of articulos) {
    if (!p.active || p.stockQuantity == null) continue;
    const stock = p.stockQuantity;
    const minimo = p.lowStockThreshold ?? MINIMO_POR_DEFECTO;
    if (stock > minimo) continue;
    const agotado = stock <= 0;
    avisos.push({
      id: `stock-${p.id}`,
      tipo: agotado ? 'agotado' : 'stock_bajo',
      grupo: 'stock',
      gravedad: agotado ? 'peligro' : 'atencion',
      titulo: p.name,
      detalle: agotado
        ? `${p.ref ? `${p.ref} · ` : ''}mínimo ${minimo.toLocaleString('es-ES')}`
        : `${p.ref ? `${p.ref} · ` : ''}quedan ${stock.toLocaleString('es-ES')} · mínimo ${minimo.toLocaleString('es-ES')}`,
      cifra: stock,
      dias: 0,
      href: '/productos',
    });
  }

  // Lo más grave primero: vencidas (la más antigua arriba), las que vencen
  // (la más cercana arriba), agotados y stock bajo (el que menos tiene).
  const orden: Record<TipoAviso, number> = { vencida: 0, vence: 1, agotado: 2, stock_bajo: 3 };
  avisos.sort((a, b) =>
    orden[a.tipo] - orden[b.tipo]
    || (a.tipo === 'vencida' ? b.dias - a.dias : a.tipo === 'vence' ? a.dias - b.dias : a.cifra - b.cifra)
    || a.titulo.localeCompare(b.titulo, 'es'));

  const vencidas = avisos.filter(a => a.tipo === 'vencida');
  return {
    avisos,
    vencidas: vencidas.length,
    importeVencido: Math.round(vencidas.reduce((s, a) => s + a.cifra, 0) * 100) / 100,
    vencen: avisos.filter(a => a.tipo === 'vence').length,
    stock: avisos.filter(a => a.grupo === 'stock').length,
  };
}
