/**
 * MODELO 420 — Autoliquidación trimestral del IGIC (régimen general)
 *
 * EL IGIC NO ES EL IVA
 * --------------------
 * Se parecen en la mecánica (repercutido menos soportado) y en nada más:
 *
 *  - Lo recauda la **Agencia Tributaria Canaria**, no la AEAT.
 *  - Los tipos son otros: 0 %, 3 % (reducido), 7 % (general), 15 % y 20 %
 *    (incrementados), además de tipos especiales. Este programa deja los
 *    tipos configurables en Ajustes (`igicRates`), así que aquí no se
 *    dan por supuestos: se agrupa por el tipo que traiga cada factura.
 *  - Hay un mínimo exento por volumen de negocio que no existe en IVA.
 *  - Las operaciones con la Península son EXPORTACIONES/IMPORTACIONES a
 *    efectos de IGIC, no operaciones interiores ni intracomunitarias.
 *
 * Por eso este módulo no reutiliza el del 303: comparte las funciones de
 * agregación (que son aritmética), pero no las casillas ni las reglas.
 *
 * PRESENTACIÓN
 * ------------
 * La ATC no publica un diseño de registro abierto para el 420: se
 * presenta en su Sede electrónica o con su programa de ayuda
 * (https://sede.gobiernodecanarias.org/sede/tramites/4015). Por eso este
 * módulo calcula, valida y prepara la vista previa, pero NO genera un
 * fichero de presentación: inventarse uno sería peor que no tenerlo.
 */

import type { Invoice, Gasto, CompanySettings } from '../../types';
import type { ErrorValidacion, PeriodoFiscal, ResultadoValidacion } from '../tipos';
import {
  desglosarPorTipo,
  enPeriodo,
  facturaCuenta,
  redondear,
  soportadoPorTipoOperacion,
  type DesgloseTipo,
  type SoportadoPorTipoOperacion,
} from '../FiscalCalculationService';
import { isValidNif } from '../../validation/nif';

export interface LineaIgicSoportado {
  tipo: number;
  base: number;
  /** Lo que se soportó. */
  cuotaSoportada: number;
  /** Lo que se puede deducir, que puede ser menos. */
  cuotaDeducible: number;
}

export interface Resultado420 {
  periodo: PeriodoFiscal;
  /** IGIC repercutido por tipo. */
  repercutido: DesgloseTipo[];
  baseRepercutida: number;
  totalRepercutido: number;
  /** IGIC soportado por tipo, separando soportado de deducible. */
  soportadoPorTipo: LineaIgicSoportado[];
  soportadoPorOperacion: SoportadoPorTipoOperacion;
  totalSoportado: number;
  totalDeducible: number;
  /** Cuotas a compensar que vienen de trimestres anteriores. */
  compensacionesAnteriores: number;
  /** Repercutido − deducible − compensaciones. */
  resultado: number;
  /** Base al 0 %: exentas y no sujetas juntas — el programa no las
   *  distingue todavía. Ver `baseSinCuota`. */
  baseSinCuota: number;
  numFacturas: number;
  numGastos: number;
}

export interface DatosModelo420 {
  facturas: Invoice[];
  gastos: Gasto[];
  /** Resultado negativo arrastrado de trimestres anteriores, si lo hay. */
  compensacionesAnteriores?: number;
}

/**
 * Base facturada al 0 %: no lleva cuota, pero el 420 la pide informada.
 *
 * NO SE SEPARA EXENTA DE NO SUJETA, y es a propósito. El 420 las pide en
 * casillas distintas, pero el programa no guarda hoy ningún campo que
 * las distinga: `tipoFacturaFiscal` es F1–F3/R1–R5 (el tipo de factura de
 * Verifactu) y `claveRegimenIva` tampoco lo dice. Repartirlas «a ojo»
 * —dando por exenta toda base al 0 %— colocaría importes en una casilla
 * que quizá no les toca, y en un modelo que se presenta eso no es una
 * aproximación: es un dato falso. Se informa el total y la pantalla dice
 * que hay que repartirlo a mano.
 */
function baseSinCuota(facturas: Invoice[]): number {
  let total = 0;
  for (const f of facturas) {
    for (const d of f.taxBreakdown || []) {
      if (d.rate === 0) total = redondear(total + d.base);
    }
  }
  return total;
}

export function calcularModelo420(datos: DatosModelo420, periodo: PeriodoFiscal): Resultado420 {
  const emitidas = datos.facturas.filter(
    f => facturaCuenta(f) && f.sentido !== 'compra' && enPeriodo(f.issueDate, periodo),
  );
  const gastos = datos.gastos.filter(g => enPeriodo(g.fecha, periodo));

  // El repercutido con cuota: el 0 % se informa aparte, no suma cuota.
  const repercutido = desglosarPorTipo(emitidas).filter(d => d.tipo > 0);
  const baseRepercutida = redondear(repercutido.reduce((s, d) => s + d.base, 0));
  const totalRepercutido = redondear(repercutido.reduce((s, d) => s + d.cuota, 0));

  // Soportado por tipo: los gastos guardan un solo tipo por gasto.
  const porTipo = new Map<number, LineaIgicSoportado>();
  for (const g of gastos) {
    const tipo = g.taxRate ?? 0;
    const linea = porTipo.get(tipo) || { tipo, base: 0, cuotaSoportada: 0, cuotaDeducible: 0 };
    linea.base = redondear(linea.base + (g.baseImponible || 0));
    linea.cuotaSoportada = redondear(linea.cuotaSoportada + (g.taxAmount || 0));
    if (g.deducible !== false) {
      const deducible = typeof g.cuotaDeducible === 'number' ? g.cuotaDeducible : (g.taxAmount || 0);
      linea.cuotaDeducible = redondear(linea.cuotaDeducible + deducible);
    }
    porTipo.set(tipo, linea);
  }
  const soportadoPorTipo = [...porTipo.values()].sort((a, b) => b.tipo - a.tipo);
  const soportadoPorOperacion = soportadoPorTipoOperacion(gastos);

  const totalSoportado = redondear(soportadoPorTipo.reduce((s, l) => s + l.cuotaSoportada, 0));
  const totalDeducible = redondear(soportadoPorTipo.reduce((s, l) => s + l.cuotaDeducible, 0));
  const compensacionesAnteriores = redondear(datos.compensacionesAnteriores || 0);

  const sinCuota = baseSinCuota(emitidas);

  return {
    periodo,
    repercutido,
    baseRepercutida,
    totalRepercutido,
    soportadoPorTipo,
    soportadoPorOperacion,
    totalSoportado,
    totalDeducible,
    compensacionesAnteriores,
    resultado: redondear(totalRepercutido - totalDeducible - compensacionesAnteriores),
    baseSinCuota: sinCuota,
    numFacturas: emitidas.length,
    numGastos: gastos.length,
  };
}

export function validarModelo420(
  r: Resultado420,
  empresa: Pick<CompanySettings, 'nif' | 'businessName' | 'igicEnabled' | 'igicRates'> | null,
): ResultadoValidacion {
  const errores: ErrorValidacion[] = [];
  const avisos: ErrorValidacion[] = [];
  const refEmpresa = { tipo: 'empresa' as const, id: 'empresa', etiqueta: 'Ajustes de la empresa' };

  if (!empresa?.nif || !isValidNif(empresa.nif)) {
    errores.push({
      gravedad: 'critico', campo: 'nif',
      mensaje: `El NIF de la empresa (${empresa?.nif || 'vacío'}) no es válido.`,
      referencia: refEmpresa,
    });
  }
  if (!empresa?.businessName?.trim()) {
    errores.push({
      gravedad: 'critico', campo: 'nombre',
      mensaje: 'La empresa no tiene razón social configurada.',
      referencia: refEmpresa,
    });
  }
  // Presentar un 420 sin estar en IGIC es el modelo equivocado, igual que
  // al revés con el 303.
  if (!empresa?.igicEnabled) {
    errores.push({
      gravedad: 'critico', campo: 'regimen',
      mensaje: 'La empresa no está configurada en IGIC: el 420 es de la Agencia Tributaria Canaria. Si tributas en IVA, te corresponde el 303.',
      referencia: refEmpresa,
    });
  }
  if (!r.periodo.trimestre) {
    errores.push({
      gravedad: 'critico', campo: 'periodo',
      mensaje: 'El modelo 420 es trimestral: hay que elegir un trimestre.',
    });
  }

  // Un tipo que no está entre los configurados de la empresa casi
  // siempre es una factura mal grabada, no un tipo nuevo del IGIC.
  const configurados = new Set(empresa?.igicRates || []);
  if (configurados.size > 0) {
    for (const d of r.repercutido) {
      if (!configurados.has(d.tipo)) {
        avisos.push({
          gravedad: 'aviso', campo: 'tipo_igic',
          mensaje: `Hay ${d.base.toFixed(2)} € repercutidos al ${d.tipo}%, que no es uno de los tipos de IGIC configurados en Ajustes.`,
          referencia: refEmpresa,
        });
      }
    }
  }

  // Deducir más de lo soportado es imposible: si sale, es un dato mal
  // grabado (una cuota deducible mayor que la cuota).
  if (r.totalDeducible - r.totalSoportado > 0.01) {
    errores.push({
      gravedad: 'critico', campo: 'deducible',
      mensaje: `La cuota deducible (${r.totalDeducible} €) es mayor que la soportada (${r.totalSoportado} €).`,
    });
  }

  const suma = redondear(r.totalRepercutido - r.totalDeducible - r.compensacionesAnteriores);
  if (Math.abs(suma - r.resultado) > 0.01) {
    errores.push({
      gravedad: 'critico', campo: 'cuadre',
      mensaje: 'El resultado no cuadra con repercutido − deducible − compensaciones.',
    });
  }

  if (r.numGastos === 0 && r.numFacturas > 0) {
    avisos.push({
      gravedad: 'aviso', campo: 'sin_soportado',
      mensaje: 'No hay gastos registrados en el trimestre: el IGIC soportado sale a cero.',
    });
  }
  if (r.baseSinCuota > 0) {
    avisos.push({
      gravedad: 'aviso', campo: 'sin_cuota',
      mensaje: `Hay ${r.baseSinCuota} € facturados al 0 %. El 420 pide separar exentas de no sujetas y el programa todavía no las distingue: repártelas a mano al rellenar el modelo.`,
    });
  }
  if (r.resultado < 0) {
    avisos.push({
      gravedad: 'aviso', campo: 'resultado',
      mensaje: `Resultado negativo (${r.resultado} €): queda a compensar en el trimestre siguiente.`,
    });
  }

  return { valido: errores.length === 0, errores, avisos };
}

/**
 * Exportación de los datos del 420 en CSV.
 *
 * No es un fichero de presentación —la ATC no publica ese formato— sino
 * el detalle para cotejar, archivar o pasárselo a la gestoría. Se dice
 * así en la pantalla para que nadie intente subirlo a la Sede.
 */
export function exportarCsv420(r: Resultado420): string {
  const filas: string[][] = [
    ['Modelo 420 — IGIC', `${r.periodo.trimestre}T ${r.periodo.ejercicio}`],
    [],
    ['IGIC REPERCUTIDO'],
    ['Tipo %', 'Base imponible', 'Cuota'],
    ...r.repercutido.map(d => [`${d.tipo}`, d.base.toFixed(2), d.cuota.toFixed(2)]),
    ['Total', r.baseRepercutida.toFixed(2), r.totalRepercutido.toFixed(2)],
    [],
    ['IGIC SOPORTADO'],
    ['Tipo %', 'Base', 'Cuota soportada', 'Cuota deducible'],
    ...r.soportadoPorTipo.map(l => [
      `${l.tipo}`, l.base.toFixed(2), l.cuotaSoportada.toFixed(2), l.cuotaDeducible.toFixed(2),
    ]),
    ['Total', '', r.totalSoportado.toFixed(2), r.totalDeducible.toFixed(2)],
    [],
    ['LIQUIDACIÓN'],
    ['IGIC repercutido', r.totalRepercutido.toFixed(2)],
    ['IGIC soportado deducible', r.totalDeducible.toFixed(2)],
    ['Compensaciones de periodos anteriores', r.compensacionesAnteriores.toFixed(2)],
    ['Resultado', r.resultado.toFixed(2)],
    [],
    ['OPERACIONES SIN CUOTA (al 0 %)'],
    ['Base total (repartir a mano entre exentas y no sujetas)', r.baseSinCuota.toFixed(2)],
  ];
  return filas.map(f => f.map(c => `"${(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
}
