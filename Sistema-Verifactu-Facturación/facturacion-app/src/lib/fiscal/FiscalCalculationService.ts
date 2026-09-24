/**
 * FiscalCalculationService — lo que comparten todos los modelos.
 *
 * Aquí van las piezas que se repiten modelo a modelo: acotar un período,
 * decidir si una factura cuenta fiscalmente, y desglosar bases y cuotas
 * por tipo impositivo. Los importes concretos de cada modelo (qué casilla
 * lleva qué) están en el módulo del modelo, no aquí.
 */

import type { Invoice, Gasto } from '../types';
import type { PeriodoFiscal, Trimestre } from './tipos';

export function redondear(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function trimestreDeFecha(fecha: string): Trimestre {
  const mes = Number(fecha.slice(5, 7));
  return (Math.floor((mes - 1) / 3) + 1) as Trimestre;
}

/**
 * ¿Cae esta fecha dentro del período?
 *
 * Sin trimestre = el año entero, que es lo que necesitan los modelos
 * anuales (347, 415, 425).
 */
export function enPeriodo(fecha: string | undefined, periodo: PeriodoFiscal): boolean {
  if (!fecha) return false;
  if (Number(fecha.slice(0, 4)) !== periodo.ejercicio) return false;
  if (!periodo.trimestre) return true;
  return trimestreDeFecha(fecha) === periodo.trimestre;
}

/**
 * ¿Cuenta esta factura para un modelo fiscal?
 *
 * Fuera lo que no existe fiscalmente: borradores (todavía no se han
 * emitido), anuladas, y los documentos que no son factura (albaranes,
 * presupuestos). Un albarán no se declara: se declara la factura que sale
 * de él.
 */
export function facturaCuenta(f: Invoice): boolean {
  if (f.cancelledAt) return false;
  if (f.status === 'borrador' || f.status === 'anulada') return false;
  // Las rectificativas SÍ cuentan: llevan importes negativos y restan de lo
  // que rectifican. Antes se quedaban fuera de todos los modelos, y un 303
  // con devoluciones salía con más IVA a ingresar del que tocaba.
  if (f.tipo && f.tipo !== 'factura' && f.tipo !== 'rectificativa') return false;
  return true;
}

export const esRectificativa = (f: Invoice) => f.tipo === 'rectificativa';

export interface BaseYCuota { base: number; cuota: number }

/**
 * El impuesto soportado en las FACTURAS DE COMPRA (las que registra el
 * programa como documento de compra, no como gasto).
 *
 * Antes el 303 y el 420 sólo miraban los gastos: quien apuntaba sus
 * compras como factura de proveedor no se deducía ese IVA y pagaba de más.
 * Las ordinarias van a interiores corrientes; las rectificativas de compra,
 * a «rectificación de deducciones».
 */
export function impuestoDeCompras(facturas: Invoice[], periodo: PeriodoFiscal): { ordinarias: BaseYCuota; rectificativas: BaseYCuota; numFacturas: number } {
  const compras = facturas.filter(f => f.sentido === 'compra' && facturaCuenta(f) && enPeriodo(f.issueDate, periodo));
  const suma = (lista: Invoice[]) => lista.reduce<BaseYCuota>((t, f) => ({
    base: redondear(t.base + (f.subtotal || 0)),
    cuota: redondear(t.cuota + (f.totalTax || 0)),
  }), { base: 0, cuota: 0 });
  return {
    ordinarias: suma(compras.filter(f => !esRectificativa(f))),
    rectificativas: suma(compras.filter(esRectificativa)),
    numFacturas: compras.length,
  };
}

export interface DesgloseTipo {
  /** Porcentaje de IVA o IGIC. */
  tipo: number;
  base: number;
  cuota: number;
}

/**
 * Suma bases y cuotas agrupando por tipo impositivo.
 *
 * Usa `taxBreakdown`, que es el desglose que ya guarda cada factura, y no
 * recalcula desde las líneas: el desglose es lo que se imprimió en la
 * factura y lo que selló Verifactu. Recalcularlo aquí podría dar un
 * céntimo distinto por redondeos y descuadrar el modelo respecto a la
 * factura que tiene el cliente en la mano.
 */
export function desglosarPorTipo(facturas: Invoice[]): DesgloseTipo[] {
  const porTipo = new Map<number, DesgloseTipo>();
  for (const f of facturas) {
    for (const d of f.taxBreakdown || []) {
      const actual = porTipo.get(d.rate) || { tipo: d.rate, base: 0, cuota: 0 };
      actual.base = redondear(actual.base + d.base);
      actual.cuota = redondear(actual.cuota + d.amount);
      porTipo.set(d.rate, actual);
    }
  }
  return [...porTipo.values()].sort((a, b) => b.tipo - a.tipo);
}

/**
 * La cuota que de verdad se deduce de un gasto.
 *
 * `cuotaDeducible` manda si está puesta (prorrata, afectación parcial del
 * coche…). Si no, se deduce la cuota entera. Y si el gasto está marcado
 * como no deducible, cero: soportar una cuota y poder deducirla son dos
 * cosas distintas, y el modelo las pide separadas.
 */
export function cuotaDeducibleDe(g: Gasto): number {
  if (g.deducible === false) return 0;
  if (typeof g.cuotaDeducible === 'number') return redondear(g.cuotaDeducible);
  return redondear(g.taxAmount || 0);
}

export interface SoportadoPorTipoOperacion {
  interiorCorriente: { base: number; cuota: number };
  interiorInversion: { base: number; cuota: number };
  importacionCorriente: { base: number; cuota: number };
  importacionInversion: { base: number; cuota: number };
  intracomunitariaCorriente: { base: number; cuota: number };
  intracomunitariaInversion: { base: number; cuota: number };
  inversionSujetoPasivo: { base: number; cuota: number };
  /** Suma de todo lo deducible. */
  totalDeducible: number;
  /** Suma de lo soportado, deducible o no. */
  totalSoportado: number;
}

const VACIO = () => ({ base: 0, cuota: 0 });

/**
 * Reparte los gastos por tipo de operación, que es como los pide el 303
 * (y el 420): cada tipo va a una casilla distinta.
 *
 * Un gasto sin clasificar cuenta como interior corriente, que es el caso
 * normal y el valor por defecto de la columna en la base de datos.
 */
export function soportadoPorTipoOperacion(gastos: Gasto[]): SoportadoPorTipoOperacion {
  const r: SoportadoPorTipoOperacion = {
    interiorCorriente: VACIO(),
    interiorInversion: VACIO(),
    importacionCorriente: VACIO(),
    importacionInversion: VACIO(),
    intracomunitariaCorriente: VACIO(),
    intracomunitariaInversion: VACIO(),
    inversionSujetoPasivo: VACIO(),
    totalDeducible: 0,
    totalSoportado: 0,
  };

  const destino: Record<string, keyof SoportadoPorTipoOperacion | null> = {
    interior_corriente: 'interiorCorriente',
    interior_inversion: 'interiorInversion',
    importacion_corriente: 'importacionCorriente',
    importacion_inversion: 'importacionInversion',
    intracomunitaria_corriente: 'intracomunitariaCorriente',
    intracomunitaria_inversion: 'intracomunitariaInversion',
    inversion_sujeto_pasivo: 'inversionSujetoPasivo',
    // No sujetas y exentas no llevan cuota deducible: no se suman a
    // ninguna casilla de deducible.
    no_sujeta: null,
    exenta: null,
  };

  for (const g of gastos) {
    const cuota = g.taxAmount || 0;
    const deducible = cuotaDeducibleDe(g);
    r.totalSoportado = redondear(r.totalSoportado + cuota);
    r.totalDeducible = redondear(r.totalDeducible + deducible);

    const clave = destino[g.tipoOperacion || 'interior_corriente'];
    if (!clave) continue;
    const casilla = r[clave] as { base: number; cuota: number };
    casilla.base = redondear(casilla.base + (g.baseImponible || 0));
    casilla.cuota = redondear(casilla.cuota + deducible);
  }

  return r;
}

/** Etiqueta legible de un período, para títulos y para el historial. */
export function etiquetaPeriodo(periodo: PeriodoFiscal): string {
  return periodo.trimestre ? `${periodo.trimestre}T ${periodo.ejercicio}` : `${periodo.ejercicio}`;
}
