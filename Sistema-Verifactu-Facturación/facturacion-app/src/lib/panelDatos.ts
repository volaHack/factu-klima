/**
 * LAS CIFRAS DE LAS FICHAS DEL PANEL
 *
 * Una función por ficha, sin estado y sin leer nada: el panel le pasa los
 * datos que ya tiene y pinta lo que devuelve. Así cada número se puede
 * probar solo, y el panel no hace cuentas en medio del marcado.
 *
 * Las fechas van como texto AAAA-MM-DD, comparadas como texto: con fechas de
 * JavaScript, una factura del día 1 a las 00:30 en Madrid caía en el mes
 * anterior al pasarla a UTC.
 */

import {
  InvoiceStatus, type Albaran, type Gasto, type Invoice, type Lote, type Obra, type OrdenTrabajo, type Product,
  type TipoDocumento,
} from './types';
import { facturadoYCobrado } from './analitica';

const r2 = (n: number) => Math.round(n * 100) / 100;

/** «2026-09» del día dado. */
export const mesDe = (hoy: string) => hoy.slice(0, 7);

export function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(hasta.slice(0, 10)) - Date.parse(desde.slice(0, 10))) / 86_400_000);
}

const esVentaViva = (f: Invoice) =>
  f.sentido !== 'compra' && (!f.tipo || f.tipo === 'factura' || f.tipo === 'rectificativa')
  && f.status !== InvoiceStatus.ANULADA && f.status !== InvoiceStatus.BORRADOR && !f.cancelledAt;

// ------------------------------------------------------------------
// Cobrado y margen del mes
// ------------------------------------------------------------------

/** Lo cobrado en el mes en curso (el mismo criterio que «Facturado y cobrado»). */
export function cobradoMes(facturas: Invoice[], hoy: string): number {
  const [a, m, d] = hoy.split('-').map(Number);
  return facturadoYCobrado(facturas, new Date(a, m - 1, d), 1)[0]?.series2 ?? 0;
}

export interface Margen { ventas: number; coste: number; margen: number; porcentaje: number | null; lineasSinCoste: number }

/**
 * Lo vendido este mes sin impuestos menos lo que costó. El coste es el que
 * se guardó en la línea al emitir; si no lo tiene, el precio medio de
 * compra del artículo o, si no, el de su última compra. Las líneas sin
 * ningún coste conocido cuentan en la venta y se avisa de cuántas son.
 */
export function margenMes(facturas: Invoice[], productos: Product[], hoy: string): Margen {
  const mes = mesDe(hoy);
  // El programa guarda «sin coste» como 0: un 0 no es un coste, es no saberlo.
  const util = (n?: number) => (n != null && n > 0 ? n : undefined);
  const coste = new Map(productos.map(p => [p.id, util(p.costePmp) ?? util(p.costeUltimaCompra)]));
  let ventas = 0;
  let costeTotal = 0;
  let lineasSinCoste = 0;
  for (const f of facturas) {
    if (!esVentaViva(f) || !f.issueDate?.startsWith(mes)) continue;
    const signo = f.tipo === 'rectificativa' ? -1 : 1;
    for (const li of f.lineItems ?? []) {
      ventas += signo * (li.subtotal ?? 0);
      const c = util(li.costPrice) ?? (li.productId ? coste.get(li.productId) : undefined);
      if (c == null) { lineasSinCoste++; continue; }
      costeTotal += signo * c * (li.quantity ?? 0) * (li.unitsPerPackage && li.unitsPerPackage > 1 ? li.unitsPerPackage : 1);
    }
  }
  ventas = r2(ventas);
  costeTotal = r2(costeTotal);
  const margen = r2(ventas - costeTotal);
  // Sin ningún coste conocido no hay margen que dar: saldría el 100 %.
  if (lineasSinCoste > 0 && costeTotal === 0) return { ventas, coste: 0, margen: 0, porcentaje: null, lineasSinCoste };
  return { ventas, coste: costeTotal, margen, porcentaje: ventas ? Math.round((margen / ventas) * 1000) / 10 : null, lineasSinCoste };
}

// ------------------------------------------------------------------
// Documentos que esperan algo
// ------------------------------------------------------------------

export interface Pendiente { id: string; numero: string; quien: string; importe: number; dias: number; href: string }

const NOMBRE_TIPO: Record<TipoDocumento, string> = {
  presupuesto: 'Presupuesto', pedido: 'Pedido', albaran: 'Albarán', factura: 'Factura', rectificativa: 'Rectificativa',
};

export function borradores(docs: Invoice[], hoy: string): { total: number; lista: (Pendiente & { tipo: string })[] } {
  const lista = docs
    .filter(d => d.status === InvoiceStatus.BORRADOR)
    .map(d => ({
      id: d.id, numero: d.number, quien: d.clientName || 'Sin cliente', importe: d.total,
      dias: diasEntre(d.updatedAt || d.createdAt || d.issueDate, hoy),
      tipo: NOMBRE_TIPO[d.tipo ?? 'factura'],
      href: !d.tipo || d.tipo === 'factura' || d.tipo === 'rectificativa' ? `/facturas/${d.id}` : `/documentos/${d.id}`,
    }))
    .sort((a, b) => b.dias - a.dias);
  return { total: r2(lista.reduce((t, d) => t + d.importe, 0)), lista };
}

/**
 * Presupuestos enviados sin respuesta, pedidos sin servir y pedidos a
 * proveedores sin recibir. Uno deja de estar abierto al convertirse en otro
 * documento (el nuevo lo apunta como origen) o al anularse o facturarse.
 */
export function abiertos(docs: Invoice[], tipo: 'presupuesto' | 'pedido', sentido: 'venta' | 'compra', hoy: string): Pendiente[] {
  const convertidos = new Set(docs.map(d => d.documentoOrigenId).filter(Boolean));
  const cerrados = new Set<string>([
    InvoiceStatus.BORRADOR, InvoiceStatus.ANULADA, InvoiceStatus.FACTURADO, InvoiceStatus.RECHAZADO, InvoiceStatus.EXPEDIDO,
  ]);
  return docs
    .filter(d => d.tipo === tipo && (sentido === 'compra' ? d.sentido === 'compra' : d.sentido !== 'compra'))
    .filter(d => !cerrados.has(d.status) && !convertidos.has(d.id) && !d.cancelledAt)
    .map(d => ({ id: d.id, numero: d.number, quien: d.clientName || '—', importe: d.total, dias: diasEntre(d.issueDate, hoy), href: `/documentos/${d.id}` }))
    .sort((a, b) => b.dias - a.dias);
}

export function albaranesSinFacturar(albaranes: Albaran[], hoy: string): Pendiente[] {
  return albaranes
    .filter(a => a.status === 'expedido' && !a.invoiceId)
    .map(a => ({ id: a.id, numero: a.number, quien: a.clientName || '—', importe: a.total, dias: diasEntre(a.issueDate, hoy), href: `/albaranes/${a.id}` }))
    .sort((a, b) => b.dias - a.dias);
}

// ------------------------------------------------------------------
// Almacén
// ------------------------------------------------------------------

export interface Articulo { id: string; nombre: string; stock: number; detalle: string; valor?: number }

export function bajoMinimos(productos: Product[]): Articulo[] {
  return productos
    .filter(p => p.active && p.lowStockThreshold != null && p.lowStockThreshold > 0 && (p.stockQuantity ?? 0) <= p.lowStockThreshold)
    .map(p => ({ id: p.id, nombre: p.name, stock: p.stockQuantity ?? 0, detalle: `mínimo ${p.lowStockThreshold}` }))
    .sort((a, b) => a.stock - b.stock);
}

/** Artículos con existencias que no se han vendido en `dias` días, por el dinero que tienen parado. */
export function paradoEnAlmacen(productos: Product[], facturas: Invoice[], hoy: string, dias = 90): Articulo[] {
  const ultimaVenta = new Map<string, string>();
  for (const f of facturas) {
    if (!esVentaViva(f)) continue;
    for (const li of f.lineItems ?? []) {
      if (!li.productId) continue;
      const u = ultimaVenta.get(li.productId);
      if (!u || f.issueDate > u) ultimaVenta.set(li.productId, f.issueDate);
    }
  }
  return productos
    .filter(p => p.active && (p.stockQuantity ?? 0) > 0)
    .filter(p => { const u = ultimaVenta.get(p.id); return !u || diasEntre(u, hoy) >= dias; })
    .map(p => {
      const u = ultimaVenta.get(p.id);
      const coste = (p.costePmp || undefined) ?? (p.costeUltimaCompra || undefined);
      return {
        id: p.id, nombre: p.name, stock: p.stockQuantity ?? 0,
        detalle: u ? `sin venderse desde hace ${diasEntre(u, hoy)} días` : 'nunca vendido',
        valor: coste != null ? r2(coste * (p.stockQuantity ?? 0)) : undefined,
      };
    })
    .sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0));
}

export function lotesCaducando(lotes: Lote[], hoy: string, dias = 7): Articulo[] {
  return lotes
    .filter(l => l.fechaCaducidad && l.cantidadDisponible > 0)
    .map(l => ({ l, quedan: diasEntre(hoy, l.fechaCaducidad!) }))
    .filter(x => x.quedan <= dias)
    .sort((a, b) => a.quedan - b.quedan)
    .map(({ l, quedan }) => ({
      id: l.id, nombre: `${l.productName} · lote ${l.codigo}`, stock: l.cantidadDisponible,
      detalle: quedan < 0 ? `caducado hace ${-quedan} ${-quedan === 1 ? 'día' : 'días'}` : quedan === 0 ? 'caduca hoy' : `caduca en ${quedan} ${quedan === 1 ? 'día' : 'días'}`,
    }));
}

// ------------------------------------------------------------------
// Impuestos, gastos, obras y órdenes
// ------------------------------------------------------------------

export interface TipoImpuesto { tipo: number; base: number; cuota: number }

/** Bases y cuotas repercutidas por tipo en el trimestre en curso. */
export function impuestosTrimestre(facturas: Invoice[], hoy: string): { trimestre: number; tipos: TipoImpuesto[] } {
  const anio = hoy.slice(0, 4);
  const trimestre = Math.floor((Number(hoy.slice(5, 7)) - 1) / 3) + 1;
  const desde = `${anio}-${String((trimestre - 1) * 3 + 1).padStart(2, '0')}-01`;
  const porTipo = new Map<number, TipoImpuesto>();
  for (const f of facturas) {
    if (!esVentaViva(f) || f.issueDate < desde || f.issueDate > hoy || f.issueDate.slice(0, 4) !== anio) continue;
    for (const t of f.taxBreakdown ?? []) {
      const x = porTipo.get(t.rate) ?? { tipo: t.rate, base: 0, cuota: 0 };
      x.base = r2(x.base + t.base);
      x.cuota = r2(x.cuota + t.amount);
      porTipo.set(t.rate, x);
    }
  }
  return { trimestre, tipos: [...porTipo.values()].sort((a, b) => b.tipo - a.tipo) };
}

export function gastosMes(gastos: Gasto[], hoy: string): { total: number; numero: number } {
  const mes = mesDe(hoy);
  const delMes = gastos.filter(g => g.fecha?.startsWith(mes));
  return { total: r2(delMes.reduce((t, g) => t + g.total, 0)), numero: delMes.length };
}

export function obrasAbiertas(obras: Obra[], hoy: string): Pendiente[] {
  return obras
    .filter(o => o.estado === 'abierta')
    .map(o => ({ id: o.id, numero: o.numero, quien: o.nombre + (o.clienteNombre ? ` · ${o.clienteNombre}` : ''), importe: o.presupuesto ?? 0, dias: diasEntre(o.fechaApertura, hoy), href: '/obras' }))
    .sort((a, b) => b.dias - a.dias);
}

/** Órdenes sin cerrar con más de `dias` días. */
export function ordenesAtrasadas(ordenes: OrdenTrabajo[], hoy: string, dias = 7): Pendiente[] {
  return ordenes
    .filter(o => o.estado !== 'cerrada' && diasEntre(o.fecha, hoy) > dias)
    .map(o => ({ id: o.id, numero: o.numero, quien: o.descripcion + (o.clienteNombre ? ` · ${o.clienteNombre}` : ''), importe: 0, dias: diasEntre(o.fecha, hoy), href: '/ordenes-trabajo' }))
    .sort((a, b) => b.dias - a.dias);
}
