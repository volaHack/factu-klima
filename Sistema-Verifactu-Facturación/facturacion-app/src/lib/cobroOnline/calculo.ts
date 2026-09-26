/**
 * COBRO ONLINE — LAS CUENTAS, SIN STRIPE NI BASE DE DATOS
 *
 * Qué queda por cobrar de una factura y en qué estado se queda al entrar un
 * pago. Es lo mismo que hace `saveCobroPago` al apuntar un cobro a mano, en
 * una función pura para que el servidor (el webhook de Stripe) apunte los
 * cobros online exactamente igual.
 */

import { totalAPagar } from '@/lib/retenciones';

export interface FacturaCobrable {
  total: number;
  subtotal: number;
  retencion_pct?: number | null;
  paid_amount?: number | null;
  status: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Estados en los que una factura se puede pagar online. */
export const COBRABLES = ['emitida', 'pendiente', 'vencida', 'parcial'];

/** Lo que falta por cobrar (con retención de IRPF, lo que de verdad hay que pagar). */
export function pendienteDeCobro(f: FacturaCobrable): number {
  const aPagar = totalAPagar(Number(f.total) || 0, Number(f.subtotal) || 0, f.retencion_pct ?? undefined);
  return Math.max(0, r2(aPagar - (Number(f.paid_amount) || 0)));
}

export function sePuedePagarOnline(f: FacturaCobrable): boolean {
  return COBRABLES.includes(f.status) && pendienteDeCobro(f) >= 0.5;
}

/** Cómo queda la factura tras entrar `importe`. */
export function trasCobrar(f: FacturaCobrable, importe: number): { paidAmount: number; status: 'pagada' | 'parcial'; pagadaEntera: boolean } {
  const paidAmount = r2((Number(f.paid_amount) || 0) + importe);
  const aPagar = totalAPagar(Number(f.total) || 0, Number(f.subtotal) || 0, f.retencion_pct ?? undefined);
  const pagadaEntera = paidAmount >= aPagar - 0.01;
  return { paidAmount, status: pagadaEntera ? 'pagada' : 'parcial', pagadaEntera };
}

/** Céntimos para Stripe. */
export const aCentimos = (euros: number) => Math.round(euros * 100);
