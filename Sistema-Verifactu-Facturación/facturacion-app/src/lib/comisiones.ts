/**
 * LO QUE SE LLEVA CADA COMERCIAL
 *
 * No hay una tabla de comisiones aparte: se calculan sobre las facturas que
 * ya existen. Guardar el importe de la comisión por su lado es la manera
 * segura de que se desincronice el día que una factura se corrige, se
 * cobra tarde o se anula —y una comisión que no cuadra con las facturas de
 * las que sale es peor que no tener el informe.
 *
 * SOBRE QUÉ SE CALCULA
 *
 * Cada empresa tiene su costumbre: unas pagan en cuanto se emite la factura
 * (`facturado`), otras esperan a que el cliente pague de verdad (`cobrado`).
 * Pagar comisión de algo luego impagado es exactamente el disgusto que la
 * segunda opción evita.
 */

import type { Invoice, Vendedor } from './types';

export type BaseComision = 'facturado' | 'cobrado';

export interface LineaComision {
  invoiceId: string;
  number: string;
  fecha: string;
  clientName: string;
  importe: number;
  comision: number;
}

export interface ResumenComisionVendedor {
  vendedorId: string;
  vendedorNombre: string;
  comisionPct: number;
  baseCalculo: number;
  importeComision: number;
  facturas: LineaComision[];
}

/**
 * Las facturas que cuentan para comisión.
 *
 * Sólo ventas selladas —factura o rectificativa emitida, pendiente, vencida
 * o pagada—: un presupuesto o un pedido no son una venta todavía, un
 * borrador puede cambiar entero, y una anulada no vendió nada. Con base
 * 'cobrado' se exige además que esté pagada del todo: cobrada a medias no
 * cuenta, porque pagar la comisión entera de algo cobrado a medias es
 * adelantar dinero que igual no llega.
 */
export function facturasComisionables(
  invoices: Invoice[],
  vendedorId: string,
  base: BaseComision,
  opciones: { desde?: string; hasta?: string } = {},
): Invoice[] {
  return invoices
    .filter(inv => inv.vendedorId === vendedorId)
    .filter(inv => (inv.tipo ?? 'factura') === 'factura' || inv.tipo === 'rectificativa')
    .filter(inv => (inv.sentido ?? 'venta') === 'venta')
    .filter(inv => inv.status !== 'borrador' && inv.status !== 'anulada')
    .filter(inv => base !== 'cobrado' || inv.status === 'pagada')
    .filter(inv => !opciones.desde || inv.issueDate >= opciones.desde)
    .filter(inv => !opciones.hasta || inv.issueDate <= opciones.hasta);
}

/** Lo que se lleva un vendedor concreto, con el detalle de qué factura la generó. */
export function comisionDeVendedor(
  invoices: Invoice[],
  vendedor: Vendedor,
  base: BaseComision,
  opciones: { desde?: string; hasta?: string } = {},
): ResumenComisionVendedor {
  const pct = vendedor.comisionPct ?? 0;
  const facturas = facturasComisionables(invoices, vendedor.id, base, opciones).map(inv => ({
    invoiceId: inv.id,
    number: inv.number,
    fecha: inv.issueDate,
    clientName: inv.clientName,
    importe: inv.subtotal,
    comision: redondear(inv.subtotal * (pct / 100)),
  }));

  const baseCalculo = redondear(facturas.reduce((s, f) => s + f.importe, 0));
  const importeComision = redondear(facturas.reduce((s, f) => s + f.comision, 0));

  return { vendedorId: vendedor.id, vendedorNombre: vendedor.nombre, comisionPct: pct, baseCalculo, importeComision, facturas };
}

/** El resumen de todos los vendedores con comisión configurada, el que más se lleva primero. */
export function resumenComisiones(
  invoices: Invoice[],
  vendedores: Vendedor[],
  base: BaseComision,
  opciones: { desde?: string; hasta?: string } = {},
): ResumenComisionVendedor[] {
  return vendedores
    .filter(v => (v.comisionPct ?? 0) > 0)
    .map(v => comisionDeVendedor(invoices, v, base, opciones))
    .sort((a, b) => b.importeComision - a.importeComision);
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}
