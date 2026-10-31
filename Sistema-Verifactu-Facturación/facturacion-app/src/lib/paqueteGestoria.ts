/**
 * EL PAQUETE DEL TRIMESTRE PARA LA GESTORÍA
 *
 * Cada trimestre la gestoría pide lo mismo: las facturas emitidas, las
 * recibidas, los gastos, el resumen del impuesto y lo cobrado. Hasta ahora
 * se sacaba pantalla a pantalla y se renombraba a mano. Aquí sale todo de
 * una vez, del trimestre elegido, con nombres que se entienden solos:
 *
 *   Rogar_3T2026_facturas_emitidas.csv
 *   Rogar_3T2026_facturas_recibidas.csv
 *   Rogar_3T2026_gastos.csv
 *   Rogar_3T2026_resumen_igic.csv   (o _resumen_iva en la península)
 *   Rogar_3T2026_cobros.csv
 *
 * Los libros son los mismos de la copia de seguridad (`exportar.ts`), con
 * punto y coma, BOM y la defensa contra fórmulas de `csvSeguro.ts`. El
 * resumen del impuesto sale del cálculo del modelo (420 en Canarias, 303
 * en la península): lo que se manda cuadra con lo que se ve en Listados
 * fiscales. No es un fichero para subir a ninguna Sede.
 *
 * Van como CSV sueltos: el programa no lleva ninguna librería de ZIP y no
 * se añade una sólo para esto.
 */

import type { CobroPago, CompanySettings, Gasto, Invoice } from './types';
import { construirCsv, importeCsv, libroDeFacturas, libroDeGastos, type FicheroExportado } from './exportar';
import type { NombreImpuesto } from './impuesto';
import { enPeriodo, facturaCuenta } from './fiscal/FiscalCalculationService';
import type { PeriodoFiscal, Trimestre } from './fiscal/tipos';
import { calcularModelo420, exportarCsv420 } from './fiscal/atc/modelo420';
import { calcularModelo303 } from './fiscal/aeat/modelo303';

/** Lo que queda de la forma jurídica al final del nombre, y sobra en un fichero. */
const FORMA_JURIDICA = /\b(s\.?\s?l\.?\s?u\.?|s\.?\s?l\.?\s?l\.?|s\.?\s?l\.?|s\.?\s?a\.?\s?u\.?|s\.?\s?a\.?|s\.?\s?c\.?\s?p\.?|c\.?\s?b\.?|s\.?\s?coop\.?)$/i;

/**
 * El nombre de la empresa para los ficheros: el comercial si lo hay, sin
 * tildes, sin la forma jurídica y con guiones bajos («Distribuciones Rogar,
 * S.L.» → «Distribuciones_Rogar»).
 */
export function nombreParaFicheros(empresa: Pick<CompanySettings, 'tradeName' | 'businessName'> | null | undefined): string {
  const base = (empresa?.tradeName?.trim() || empresa?.businessName?.trim() || 'empresa')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim();
  const sinForma = base.replace(/[\s,]+$/, '').replace(FORMA_JURIDICA, '').replace(/[\s,.]+$/, '');
  return (sinForma || base).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'empresa';
}

/** El trimestre de una fecha y el anterior: el que se suele presentar. */
export function trimestrePropuesto(hoy = new Date()): { ejercicio: number; trimestre: Trimestre } {
  const t = Math.floor(hoy.getMonth() / 3) + 1;
  // En el primer mes de un trimestre se está presentando el anterior.
  if (hoy.getMonth() % 3 === 0) return t === 1 ? { ejercicio: hoy.getFullYear() - 1, trimestre: 4 } : { ejercicio: hoy.getFullYear(), trimestre: (t - 1) as Trimestre };
  return { ejercicio: hoy.getFullYear(), trimestre: t as Trimestre };
}

/** Las facturas recibidas (de compra) que cuentan: ni borradores ni anuladas. */
export function libroDeRecibidas(facturas: readonly Invoice[], impuesto: NombreImpuesto = 'IVA'): string {
  const recibidas = facturas
    .filter(f => f.sentido === 'compra' && facturaCuenta(f))
    .slice()
    .sort((a, b) => a.issueDate.localeCompare(b.issueDate) || a.number.localeCompare(b.number));
  return construirCsv(
    ['Número', 'Fecha', 'Proveedor', 'NIF', 'Base imponible', impuesto, 'Total', 'Estado', 'Forma de pago', 'Tipo'],
    recibidas.map(f => [
      f.number, f.issueDate, f.clientName, f.clientNif ?? '', importeCsv(f.subtotal), importeCsv(f.totalTax),
      importeCsv(f.total), f.status, f.paymentMethod ?? '', f.tipo ?? 'factura',
    ]),
  );
}

/** Lo cobrado a clientes: cada cobro con las facturas a las que se aplicó. */
export function libroDeCobros(cobros: readonly CobroPago[]): string {
  return construirCsv(
    ['Fecha', 'Número', 'Cliente', 'NIF', 'Forma de pago', 'Cuenta', 'Importe', 'Facturas'],
    cobros
      .filter(c => c.tipo === 'cobro')
      .slice()
      .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.number.localeCompare(b.number))
      .map(c => [
        c.fecha, c.number, c.contraparteNombre, c.contraparteNif ?? '', c.paymentMethod, c.cuentaBancaria ?? '',
        importeCsv(c.importeTotal),
        (c.desglose ?? []).map(d => `${d.invoiceNumber} (${importeCsv(d.importeAplicado)})`).join(', '),
      ]),
  );
}

/** El resumen del IVA del trimestre, con lo que lleva el 303. */
function resumenIva(facturas: Invoice[], gastos: Gasto[], periodo: PeriodoFiscal): string {
  const r = calcularModelo303({ facturas, gastos }, periodo);
  return construirCsv(['Concepto', 'Base', 'Cuota'], [
    ...r.devengado.map(d => [`IVA repercutido al ${d.tipo} %`, importeCsv(d.base), importeCsv(d.cuota)]),
    ['Rectificativas de venta', importeCsv(r.modificacion.base), importeCsv(r.modificacion.cuota)],
    ['Total devengado', importeCsv(r.baseDevengada), importeCsv(r.cuotaDevengada)],
    ['IVA soportado en facturas de compra', importeCsv(r.compras.base), importeCsv(r.compras.cuota)],
    ['Total a deducir', '', importeCsv(r.cuotaDeducible)],
    ['Resultado', '', importeCsv(r.resultadoLiquidacion)],
  ]);
}

export interface DatosPaquete {
  empresa: CompanySettings;
  /** Todos los documentos: el paquete se queda con los del trimestre. */
  facturas: Invoice[];
  gastos: Gasto[];
  cobros: CobroPago[];
}

export interface ContenidoPaquete {
  ficheros: FicheroExportado[];
  emitidas: number;
  recibidas: number;
  gastos: number;
  cobros: number;
}

/** Los cinco ficheros del trimestre, con lo que lleva cada uno. */
export function prepararPaquete(datos: DatosPaquete, periodo: { ejercicio: number; trimestre: Trimestre }): ContenidoPaquete {
  const impuesto: NombreImpuesto = datos.empresa.igicEnabled ? 'IGIC' : 'IVA';
  const prefijo = `${nombreParaFicheros(datos.empresa)}_${periodo.trimestre}T${periodo.ejercicio}`;
  const enElTrimestre = (fecha?: string) => enPeriodo(fecha, periodo);

  const facturas = datos.facturas.filter(f => enElTrimestre(f.issueDate));
  const gastos = datos.gastos.filter(g => enElTrimestre(g.fecha));
  const cobros = datos.cobros.filter(c => c.tipo === 'cobro' && enElTrimestre(c.fecha));
  // Las de venta, como en el libro: emitidas o anuladas, nunca borradores ni albaranes.
  const ventas = facturas.filter(f => (f.sentido ?? 'venta') === 'venta' && f.status !== 'borrador' && ((f.tipo ?? 'factura') === 'factura' || f.tipo === 'rectificativa'));
  const compras = facturas.filter(f => f.sentido === 'compra' && facturaCuenta(f));

  const csv = (nombre: string, contenido: string): FicheroExportado => ({ nombre: `${prefijo}_${nombre}.csv`, contenido, tipo: 'text/csv' });
  const resumen = impuesto === 'IGIC'
    ? `﻿${exportarCsv420(calcularModelo420({ facturas, gastos }, periodo))}\r\n`
    : resumenIva(facturas, gastos, periodo);

  return {
    ficheros: [
      csv('facturas_emitidas', libroDeFacturas(ventas, impuesto)),
      csv('facturas_recibidas', libroDeRecibidas(compras, impuesto)),
      csv('gastos', libroDeGastos(gastos, impuesto)),
      csv(`resumen_${impuesto.toLowerCase()}`, resumen),
      csv('cobros', libroDeCobros(cobros)),
    ],
    emitidas: ventas.length,
    recibidas: compras.length,
    gastos: gastos.length,
    cobros: cobros.length,
  };
}
