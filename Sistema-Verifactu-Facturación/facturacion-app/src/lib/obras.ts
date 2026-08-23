/**
 * SI UN PROYECTO HA DEJADO DINERO O LO HA COSTADO
 *
 * Una obra o un expediente agrupan lo que se factura y lo que se gasta en un
 * proyecto concreto. Sin esto, la factura de un cliente con tres proyectos
 * abiertos no dice a cuál de los tres corresponde, y «cuánto hemos ganado
 * con la reforma del local» es una pregunta que sólo se puede contestar
 * repasando papeles a mano.
 *
 * Como en el costeo y en las comisiones: no se guarda un total aparte, se
 * SUMA sobre los documentos y los gastos que ya llevan la obra marcada. Si
 * una factura se corrige, la rentabilidad de la obra ya sale bien la
 * próxima vez que se mira.
 */

import type { Gasto, Invoice, Obra } from './types';

export interface RentabilidadObra {
  obraId: string;
  ingresos: number;
  costeGastos: number;
  margen: number;
  numFacturas: number;
  numGastos: number;
}

/**
 * Las facturas de venta que cuentan como ingreso de la obra.
 *
 * Sólo ventas selladas, como en comisiones: un presupuesto o un pedido son
 * una intención, no un ingreso, y un borrador puede cambiar entero. Una
 * factura de compra ligada a la obra —el material que se compró para
 * ella— no es un ingreso: es justo lo contrario, y por eso se deja fuera
 * aquí y se cuenta en el coste si algún día se decide sumar compras.
 */
export function facturasDeObra(invoices: Invoice[], obraId: string): Invoice[] {
  return invoices
    .filter(inv => inv.obraId === obraId)
    .filter(inv => (inv.tipo ?? 'factura') === 'factura' || inv.tipo === 'rectificativa')
    .filter(inv => (inv.sentido ?? 'venta') === 'venta')
    .filter(inv => inv.status !== 'borrador' && inv.status !== 'anulada');
}

/** Lo que ha costado y dejado una obra, sumando sus facturas y sus gastos. */
export function rentabilidadObra(obra: Obra, invoices: Invoice[], gastos: Gasto[]): RentabilidadObra {
  const facturas = facturasDeObra(invoices, obra.id);
  const gastosDeObra = gastos.filter(g => g.obraId === obra.id);

  const ingresos = redondear(facturas.reduce((s, f) => s + f.total, 0));
  const costeGastos = redondear(gastosDeObra.reduce((s, g) => s + g.total, 0));

  return {
    obraId: obra.id,
    ingresos,
    costeGastos,
    margen: redondear(ingresos - costeGastos),
    numFacturas: facturas.length,
    numGastos: gastosDeObra.length,
  };
}

/** La rentabilidad de todas las obras dadas, la que más margen deja primero. */
export function rentabilidadDeObras(obras: Obra[], invoices: Invoice[], gastos: Gasto[]): RentabilidadObra[] {
  return obras
    .map(o => rentabilidadObra(o, invoices, gastos))
    .sort((a, b) => b.margen - a.margen);
}

/** Un número correlativo para la siguiente obra: OBR-2026-0007. */
export function numeroDeObra(existentes: Obra[], fecha = new Date()): string {
  const anyo = fecha.getFullYear();
  const delAnyo = existentes.filter(o => o.numero.includes(`-${anyo}-`));
  const siguiente = delAnyo.length + 1;
  return `OBR-${anyo}-${String(siguiente).padStart(4, '0')}`;
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}
