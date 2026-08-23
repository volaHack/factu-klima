/**
 * RETENCIÓN DE IRPF
 *
 * En una factura de profesionales o de obra, el cliente no paga el total
 * entero: retiene un porcentaje y lo ingresa él mismo en Hacienda a cuenta
 * del IRPF del que factura. Lo que de verdad cambia de manos es el total
 * menos esa retención.
 *
 * A PROPÓSITO no toca `calculateInvoiceTotals` ni el campo `total` de la
 * factura. El total de una factura española es base + IVA —es lo que
 * Hacienda espera ver impreso, y es lo que el disparador de sellado de la
 * base de datos recalcula por su cuenta desde las líneas en el instante de
 * emitir—. Meter la retención ahí dentro competiría con ese cálculo y
 * perdería, silenciosamente, en el peor momento posible: al sellar.
 *
 * La retención vive aparte, como lo que es: un descuento en el COBRO, no en
 * la factura.
 */

import type { Invoice } from './types';

/** Lo que se retiene: el porcentaje sobre la BASE, nunca sobre el total con IVA. */
export function importeRetencion(subtotal: number, retencionPct: number | undefined): number {
  if (!retencionPct) return 0;
  return redondear(subtotal * (retencionPct / 100));
}

/** Lo que de verdad cambia de manos: el total de la factura menos la retención. */
export function totalAPagar(total: number, subtotal: number, retencionPct: number | undefined): number {
  return redondear(total - importeRetencion(subtotal, retencionPct));
}

export interface ResumenRetenciones {
  numFacturas: number;
  baseTotal: number;
  retenido: number;
}

/**
 * El resumen para el modelo 111: lo que la empresa ha RETENIDO a otros y
 * tiene que ingresar en Hacienda.
 *
 * Sólo cuenta en el sentido de COMPRA. Cuando alguien nos factura a
 * nosotros con retención, somos NOSOTROS quienes restamos ese porcentaje al
 * pagar y quienes lo declaramos —el 111 lo presenta quien retiene, no a
 * quien se le retiene—. Una factura de VENTA con retención es la misma
 * mecánica al revés: el que nos retiene a NOSOTROS es el cliente, y es él
 * quien la declara, no nosotros.
 */
export function resumenModelo111(
  invoices: Invoice[],
  opciones: { desde?: string; hasta?: string } = {},
): ResumenRetenciones {
  const facturas = invoices
    .filter(inv => inv.sentido === 'compra')
    .filter(inv => (inv.tipo ?? 'factura') === 'factura' || inv.tipo === 'rectificativa')
    .filter(inv => inv.status !== 'borrador' && inv.status !== 'anulada')
    .filter(inv => (inv.retencionPct ?? 0) > 0)
    .filter(inv => !opciones.desde || inv.issueDate >= opciones.desde)
    .filter(inv => !opciones.hasta || inv.issueDate <= opciones.hasta);

  const baseTotal = redondear(facturas.reduce((s, f) => s + f.subtotal, 0));
  const retenido = redondear(facturas.reduce((s, f) => s + importeRetencion(f.subtotal, f.retencionPct), 0));

  return { numFacturas: facturas.length, baseTotal, retenido };
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}
