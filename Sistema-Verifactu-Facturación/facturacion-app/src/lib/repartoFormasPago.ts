/**
 * CÓMO PAGAN LOS CLIENTES (O A LOS PROVEEDORES)
 *
 * El reparto de la cartera por forma de pago, para la gráfica de Clientes:
 * de más a menos, con su porcentaje ya escrito. Uno de cuatrocientos no es
 * «0 %»: es «<1 %».
 */

import { PAYMENT_METHODS } from './constants';

export interface PorcionFormaPago {
  clave: string;
  nombre: string;
  cuantos: number;
  porcentaje: string;
}

/** «58 %», «<1 %» o «0 %»: con espacio, como se escribe en español. */
export function textoPorcentaje(parte: number, total: number): string {
  if (total <= 0 || parte <= 0) return '0 %';
  const p = (parte / total) * 100;
  if (p < 1) return '<1 %';
  return `${Math.round(p)} %`;
}

/** Sin forma de pago en la ficha, la factura sale por transferencia: se cuenta así. */
const POR_DEFECTO = 'transferencia';

export function repartoPorFormaDePago(contactos: readonly { defaultPaymentMethod?: string | null }[]): PorcionFormaPago[] {
  const cuenta = new Map<string, number>();
  for (const c of contactos) {
    const clave = c.defaultPaymentMethod || POR_DEFECTO;
    cuenta.set(clave, (cuenta.get(clave) ?? 0) + 1);
  }
  return [...cuenta.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([clave, cuantos]) => ({
      clave,
      nombre: PAYMENT_METHODS.find(m => m.value === clave)?.label ?? clave.charAt(0).toUpperCase() + clave.slice(1),
      cuantos,
      porcentaje: textoPorcentaje(cuantos, contactos.length),
    }));
}
