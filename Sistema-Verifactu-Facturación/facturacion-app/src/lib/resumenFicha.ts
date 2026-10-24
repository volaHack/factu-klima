/**
 * LO QUE CONVIENE SABER DE UN CLIENTE AL HACERLE UN DOCUMENTO
 *
 * Al elegirlo en una factura, un albarán o un pedido se ve de un vistazo lo
 * que se iría a buscar a su ficha: lo que debe (y si hay algo vencido), lo
 * facturado este año y su último documento.
 */

import { InvoiceStatus, type Invoice } from './types';

export interface ResumenFicha {
  pendiente: number;
  facturasPendientes: number;
  vencidas: number;
  importeVencido: number;
  facturadoAnio: number;
  ultimo: { tipo: string; numero: string; fecha: string; total: number } | null;
}

const NOMBRE: Record<string, string> = { factura: 'Factura', albaran: 'Albarán', pedido: 'Pedido', presupuesto: 'Presupuesto', rectificativa: 'Rectificativa' };
const SIN_COBRAR: readonly string[] = [InvoiceStatus.EMITIDA, InvoiceStatus.PENDIENTE, InvoiceStatus.VENCIDA, InvoiceStatus.PARCIAL, InvoiceStatus.APROBADO, InvoiceStatus.APROBADO_PARCIAL];

export function resumenDeFicha(docs: readonly Invoice[], clienteId: string, hoy = new Date().toISOString().slice(0, 10)): ResumenFicha {
  const suyos = docs.filter(d => d.clientId === clienteId);
  let pendiente = 0, facturasPendientes = 0, vencidas = 0, importeVencido = 0, facturadoAnio = 0;
  const anio = hoy.slice(0, 4);
  for (const d of suyos) {
    if ((d.tipo ?? 'factura') !== 'factura') continue;
    if (d.status !== InvoiceStatus.BORRADOR && d.status !== InvoiceStatus.ANULADA && (d.issueDate ?? '').startsWith(anio)) facturadoAnio += d.total || 0;
    if (!SIN_COBRAR.includes(d.status)) continue;
    const falta = (d.total || 0) - (d.paidAmount || 0);
    if (falta <= 0.004) continue;
    pendiente += falta;
    facturasPendientes += 1;
    if (d.status === InvoiceStatus.VENCIDA || (d.dueDate && d.dueDate < hoy)) { vencidas += 1; importeVencido += falta; }
  }
  const ultimoDoc = suyos
    .filter(d => d.status !== InvoiceStatus.ANULADA)
    .sort((a, b) => (b.issueDate ?? '').localeCompare(a.issueDate ?? '') || (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))[0];
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    pendiente: r2(pendiente), facturasPendientes, vencidas, importeVencido: r2(importeVencido), facturadoAnio: r2(facturadoAnio),
    ultimo: ultimoDoc ? { tipo: NOMBRE[ultimoDoc.tipo ?? 'factura'] ?? 'Documento', numero: ultimoDoc.number, fecha: ultimoDoc.issueDate, total: ultimoDoc.total } : null,
  };
}
