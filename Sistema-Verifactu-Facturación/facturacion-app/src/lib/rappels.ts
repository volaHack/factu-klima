/**
 * EL PREMIO POR COMPRAR MUCHO
 *
 * No es un descuento de cada factura: es lo que se gana por llegar a un
 * volumen a lo largo de un periodo, y se liquida al cerrarlo —con un abono,
 * normalmente—. Igual que las comisiones, no se guarda un importe aparte:
 * se calcula en vivo sobre las facturas del periodo, así que si una se
 * corrige el rappel sale bien la próxima vez que se mira.
 */

import type { Invoice, RappelConfig, TramoRappel } from './types';

export interface ResultadoRappel {
  configId: string;
  nombre: string;
  clienteId?: string;
  clienteNombre?: string;
  baseCalculo: number;
  tramo: TramoRappel | null;
  importeRappel: number;
}

/** Las ventas que cuentan para el cálculo, igual que en comisiones: sólo lo sellado. */
export function facturasParaRappel(
  invoices: Invoice[],
  clienteId: string | undefined,
  opciones: { desde?: string; hasta?: string } = {},
): Invoice[] {
  return invoices
    .filter(inv => !clienteId || inv.clientId === clienteId)
    .filter(inv => (inv.tipo ?? 'factura') === 'factura' || inv.tipo === 'rectificativa')
    .filter(inv => (inv.sentido ?? 'venta') === 'venta')
    .filter(inv => inv.status !== 'borrador' && inv.status !== 'anulada')
    .filter(inv => !opciones.desde || inv.issueDate >= opciones.desde)
    .filter(inv => !opciones.hasta || inv.issueDate <= opciones.hasta);
}

/**
 * El tramo que corresponde a un importe.
 *
 * Los tramos no son acumulativos: quien llega a 10.000 € no cobra el
 * porcentaje del primer tramo sobre los primeros 5.000 y el del segundo
 * sobre el resto —cobra el porcentaje del tramo más alto que alcanza,
 * sobre TODO lo facturado. Es como se hace en la práctica: «a partir de
 * 10.000 €, el 3% de todo lo comprado», no un cálculo por escalones.
 */
export function tramoAplicable(base: number, tramos: TramoRappel[]): TramoRappel | null {
  const ordenados = [...tramos].sort((a, b) => a.desde - b.desde);
  let aplicable: TramoRappel | null = null;
  for (const t of ordenados) {
    if (base >= t.desde) aplicable = t;
  }
  return aplicable;
}

/** Lo que corresponde a una regla de rappel, en el periodo dado. */
export function calcularRappel(
  config: RappelConfig,
  invoices: Invoice[],
  opciones: { desde?: string; hasta?: string } = {},
): ResultadoRappel {
  const facturas = facturasParaRappel(invoices, config.clienteId, opciones);
  const baseCalculo = redondear(facturas.reduce((s, f) => s + f.subtotal, 0));
  const tramo = tramoAplicable(baseCalculo, config.tramos);
  const importeRappel = tramo ? redondear(baseCalculo * (tramo.porcentaje / 100)) : 0;

  return {
    configId: config.id,
    nombre: config.nombre,
    clienteId: config.clienteId,
    clienteNombre: config.clienteNombre,
    baseCalculo,
    tramo,
    importeRappel,
  };
}

/** El resumen de todas las reglas activas, el que más importa deja primero. */
export function resumenRappels(
  configs: RappelConfig[],
  invoices: Invoice[],
  opciones: { desde?: string; hasta?: string } = {},
): ResultadoRappel[] {
  return configs
    .filter(c => c.activo)
    .map(c => calcularRappel(c, invoices, opciones))
    .sort((a, b) => b.importeRappel - a.importeRappel);
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}
