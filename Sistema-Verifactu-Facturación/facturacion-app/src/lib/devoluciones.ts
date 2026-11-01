/**
 * DEVOLUCIONES: QUÉ SE PUEDE DEVOLVER Y POR CUÁNTO
 *
 * La pantalla de devoluciones dejaba elegir como «factura de origen»
 * cualquier documento que no fuera borrador: pedidos, presupuestos,
 * albaranes, rectificativas y hasta facturas de compra. Y como «albarán»
 * solo los de la pantalla antigua, no los albaranes de ahora. Copiaba las
 * líneas con el precio sin descuentos (el total de la línea salía con
 * descuento, pero en cuanto se tocaba la cantidad volvía al precio bruto),
 * dejaba devolver más de lo vendido y devolver dos veces el mismo
 * documento, y cada vez reponía el stock.
 *
 * Aquí: solo se devuelve de lo que salió de verdad hacia un cliente, al
 * precio que se cobró, y como mucho lo que queda por devolver.
 *
 * Y el abono iba sin impuesto: quien pagó 107 € (100 + 7 % de IGIC) por lo
 * que devuelve recibía un abono de 100. El abono es lo que se le debe, con
 * su impuesto.
 */

import { InvoiceStatus, type Albaran, type Devolucion, type DevolucionLineItem, type Invoice } from './types';
import { precioNetoDe } from './documentos';

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Lo que se puede devolver: un documento de venta que salió, con sus líneas. */
export interface OrigenDevolucion {
  id: string;
  number: string;
  clientId: string;
  clientName: string;
  issueDate: string;
  clase: 'albaran' | 'factura';
  /** Lo que queda por devolver de cada línea, al precio cobrado. */
  lineas: DevolucionLineItem[];
}

const FACTURA_QUE_SALIO: readonly InvoiceStatus[] = [
  InvoiceStatus.EMITIDA, InvoiceStatus.PENDIENTE, InvoiceStatus.PARCIAL, InvoiceStatus.PAGADA, InvoiceStatus.VENCIDA,
];
const ALBARAN_QUE_SALIO: readonly string[] = [InvoiceStatus.EXPEDIDO, InvoiceStatus.FACTURADO, InvoiceStatus.EMITIDA];

/** Factor de los descuentos al pie (solo los tienen las facturas). */
function factorPie(doc: Albaran | Invoice): number {
  const f = doc as Invoice;
  return (1 - (f.globalDiscountPercent1 || 0) / 100) * (1 - (f.globalDiscountPercent2 || 0) / 100) * (1 - (f.globalDiscountPercent3 || 0) / 100);
}

/** Lo ya devuelto de un documento, por artículo. */
export function devueltoDe(origenId: string, previas: readonly Devolucion[]): Map<string, number> {
  const devuelto = new Map<string, number>();
  for (const d of previas) {
    if (d.originId !== origenId) continue;
    for (const l of d.lineItems) devuelto.set(l.productId, (devuelto.get(l.productId) ?? 0) + Number(l.quantity || 0));
  }
  return devuelto;
}

/** Las líneas que aún se pueden devolver de un documento, al precio que se cobró. */
export function lineasDevolubles(doc: Albaran | Invoice, previas: readonly Devolucion[]): DevolucionLineItem[] {
  const queda = devueltoDe(doc.id, previas);
  const pie = factorPie(doc);
  const salida: DevolucionLineItem[] = [];
  for (const li of doc.lineItems) {
    if (!li.productId || Number(li.quantity) <= 0) continue;
    const ya = Math.min(queda.get(li.productId) ?? 0, li.quantity);
    queda.set(li.productId, (queda.get(li.productId) ?? 0) - ya);
    const cantidad = Math.round((li.quantity - ya) * 1000) / 1000;
    if (cantidad <= 0) continue;
    const unitPrice = Math.round(precioNetoDe(li) * pie * 10000) / 10000;
    salida.push({
      id: crypto.randomUUID(), productId: li.productId, productName: li.productName, productRef: li.productRef,
      quantity: cantidad, unitPrice, unit: li.unit, taxRate: li.taxRate, total: r2(cantidad * unitPrice), restock: true,
    });
  }
  return salida;
}

/**
 * Los documentos de los que se puede devolver: facturas de venta emitidas y
 * albaranes de venta que salieron (los de ahora y los de la pantalla
 * antigua), con algo que quede por devolver.
 */
export function origenesDevolvibles(
  invoices: readonly Invoice[],
  albaranesAntiguos: readonly Albaran[],
  previas: readonly Devolucion[],
): { albaranes: OrigenDevolucion[]; facturas: OrigenDevolucion[] } {
  const origen = (d: Albaran | Invoice, clase: OrigenDevolucion['clase']): OrigenDevolucion => ({
    id: d.id, number: d.number, clientId: d.clientId, clientName: d.clientName, issueDate: d.issueDate, clase,
    lineas: lineasDevolubles(d, previas),
  });
  const deVenta = (d: Invoice) => (d.sentido ?? 'venta') === 'venta';
  const facturas = invoices
    .filter(d => deVenta(d) && (d.tipo ?? 'factura') === 'factura' && FACTURA_QUE_SALIO.includes(d.status))
    .map(d => origen(d, 'factura'));
  const albaranes = [
    ...invoices.filter(d => deVenta(d) && d.tipo === 'albaran' && ALBARAN_QUE_SALIO.includes(d.status)),
    ...albaranesAntiguos.filter(a => a.status === 'expedido' || a.status === 'facturado'),
  ].map(d => origen(d, 'albaran'));
  const conAlgo = (o: OrigenDevolucion) => o.lineas.length > 0;
  const recientes = (a: OrigenDevolucion, b: OrigenDevolucion) => b.issueDate.localeCompare(a.issueDate);
  return { albaranes: albaranes.filter(conAlgo).sort(recientes), facturas: facturas.filter(conAlgo).sort(recientes) };
}

/** Lo que no cuadra en una devolución antes de registrarla. */
export function problemasDevolucion(
  dev: Pick<Devolucion, 'origin' | 'originId' | 'lineItems'>,
  origen: OrigenDevolucion | undefined,
): string[] {
  const problemas: string[] = [];
  const lineas = dev.lineItems.filter(l => l.productId && l.quantity > 0);
  if (lineas.length === 0) problemas.push('Añade al menos un producto a devolver.');
  if (dev.origin === 'manual') return problemas;
  if (!origen) return [...problemas, 'Ese documento ya se ha devuelto entero o no admite devoluciones.'];
  const queda = new Map<string, number>();
  for (const l of origen.lineas) queda.set(l.productId, (queda.get(l.productId) ?? 0) + l.quantity);
  const pide = new Map<string, { nombre: string; cantidad: number }>();
  for (const l of lineas) {
    const p = pide.get(l.productId) ?? { nombre: l.productName, cantidad: 0 };
    p.cantidad += l.quantity;
    pide.set(l.productId, p);
  }
  for (const [id, p] of pide) {
    const max = queda.get(id) ?? 0;
    if (max === 0) problemas.push(`«${p.nombre}» no está en ${origen.number} o ya se devolvió entero.`);
    else if (p.cantidad > max + 1e-9) problemas.push(`De «${p.nombre}» solo quedan ${max} por devolver de ${origen.number}.`);
  }
  return problemas;
}

/** La base devuelta (sin impuesto). */
export function baseDevuelta(lineas: readonly DevolucionLineItem[]): number {
  return r2(lineas.reduce((s, l) => s + l.quantity * l.unitPrice, 0));
}

/** Lo devuelto con su impuesto: lo que se le debe al cliente. */
export function importeConImpuesto(lineas: readonly DevolucionLineItem[]): number {
  return r2(lineas.reduce((s, l) => {
    const base = r2(l.quantity * l.unitPrice);
    return s + base + r2(base * (Number(l.taxRate) || 0) / 100);
  }, 0));
}

/**
 * Cuánto de cada línea de la factura se rectifica por una devolución
 * (id de línea → unidades), para `rectificar(…, { cantidades })`.
 */
export function cantidadesARectificar(factura: Invoice, lineas: readonly DevolucionLineItem[]): Record<string, number> {
  const quedan = new Map<string, number>();
  for (const l of lineas) quedan.set(l.productId, (quedan.get(l.productId) ?? 0) + l.quantity);
  const salida: Record<string, number> = {};
  for (const li of factura.lineItems) {
    const q = Math.min(quedan.get(li.productId) ?? 0, Math.max(0, li.quantity));
    if (q <= 0) continue;
    salida[li.id] = q;
    quedan.set(li.productId, (quedan.get(li.productId) ?? 0) - q);
  }
  return salida;
}
