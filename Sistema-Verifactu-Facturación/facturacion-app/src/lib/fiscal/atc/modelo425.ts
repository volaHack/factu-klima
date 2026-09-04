/**
 * MODELO 425 — Declaración resumen anual del IGIC
 *
 * Es al 420 lo que el 390 es al 303: recoge los cuatro trimestres del
 * año y tiene que CUADRAR con ellos. Por eso este módulo no vuelve a
 * leer las facturas por su cuenta — calcula los cuatro 420 y los suma.
 * Si el resumen anual y los trimestrales no cuadran, la ATC lo ve
 * inmediatamente, y la causa casi siempre es haber calculado el anual
 * con criterios distintos de los trimestrales.
 *
 * PRESENTACIÓN
 * ------------
 * Por la Sede de la Agencia Tributaria Canaria. No hay diseño de
 * registro público, así que aquí no se genera fichero de presentación.
 */

import type { Invoice, Gasto, CompanySettings } from '../../types';
import type { ErrorValidacion, PeriodoFiscal, ResultadoValidacion, Trimestre } from '../tipos';
import { redondear } from '../FiscalCalculationService';
import { calcularModelo420, type Resultado420 } from './modelo420';
import { isValidNif } from '../../validation/nif';

export interface Resultado425 {
  ejercicio: number;
  /** Los cuatro trimestres, calculados con el mismo motor que el 420. */
  trimestres: Record<Trimestre, Resultado420>;
  baseRepercutidaAnual: number;
  repercutidoAnual: number;
  soportadoAnual: number;
  deducibleAnual: number;
  /** Suma de los cuatro resultados trimestrales. */
  resultadoAnual: number;
  baseSinCuotaAnual: number;
  numFacturas: number;
  numGastos: number;
}

export interface DatosModelo425 {
  facturas: Invoice[];
  gastos: Gasto[];
}

export function calcularModelo425(datos: DatosModelo425, periodo: PeriodoFiscal): Resultado425 {
  const ejercicio = periodo.ejercicio;
  const trimestres = {} as Record<Trimestre, Resultado420>;

  for (const t of [1, 2, 3, 4] as Trimestre[]) {
    trimestres[t] = calcularModelo420(
      { facturas: datos.facturas, gastos: datos.gastos },
      { ejercicio, trimestre: t },
    );
  }

  const suma = (f: (r: Resultado420) => number) =>
    redondear(([1, 2, 3, 4] as Trimestre[]).reduce((s, t) => s + f(trimestres[t]), 0));

  return {
    ejercicio,
    trimestres,
    baseRepercutidaAnual: suma(r => r.baseRepercutida),
    repercutidoAnual: suma(r => r.totalRepercutido),
    soportadoAnual: suma(r => r.totalSoportado),
    deducibleAnual: suma(r => r.totalDeducible),
    resultadoAnual: suma(r => r.resultado),
    baseSinCuotaAnual: suma(r => r.baseSinCuota),
    numFacturas: suma(r => r.numFacturas),
    numGastos: suma(r => r.numGastos),
  };
}

export function validarModelo425(
  r: Resultado425,
  empresa: Pick<CompanySettings, 'nif' | 'businessName' | 'igicEnabled'> | null,
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
  if (!empresa?.igicEnabled) {
    errores.push({
      gravedad: 'critico', campo: 'regimen',
      mensaje: 'El 425 es el resumen anual del IGIC: la empresa no está configurada en IGIC.',
      referencia: refEmpresa,
    });
  }

  // El cuadre que de verdad importa: el anual tiene que ser la suma de
  // los cuatro trimestres, al céntimo.
  const sumaTrimestral = redondear(
    ([1, 2, 3, 4] as Trimestre[]).reduce((s, t) => s + r.trimestres[t].totalRepercutido, 0),
  );
  if (Math.abs(sumaTrimestral - r.repercutidoAnual) > 0.01) {
    errores.push({
      gravedad: 'critico', campo: 'cuadre_anual',
      mensaje: `El repercutido anual (${r.repercutidoAnual} €) no cuadra con la suma de los cuatro trimestres (${sumaTrimestral} €).`,
    });
  }

  const trimestresVacios = ([1, 2, 3, 4] as Trimestre[]).filter(
    t => r.trimestres[t].numFacturas === 0 && r.trimestres[t].numGastos === 0,
  );
  if (trimestresVacios.length > 0 && trimestresVacios.length < 4) {
    avisos.push({
      gravedad: 'aviso', campo: 'trimestre_vacio',
      mensaje: `Sin movimientos en ${trimestresVacios.map(t => `${t}T`).join(', ')}. Comprueba que esos trimestres se presentaron a cero.`,
    });
  }
  if (r.numFacturas === 0 && r.numGastos === 0) {
    avisos.push({
      gravedad: 'aviso', campo: 'sin_datos',
      mensaje: `No hay actividad registrada en ${r.ejercicio}.`,
    });
  }

  return { valido: errores.length === 0, errores, avisos };
}

export function exportarCsv425(r: Resultado425): string {
  const t = (n: Trimestre) => r.trimestres[n];
  const filas: string[][] = [
    ['Modelo 425 — Resumen anual del IGIC', String(r.ejercicio)],
    [],
    ['Trimestre', 'Base repercutida', 'IGIC repercutido', 'IGIC deducible', 'Resultado'],
    ...([1, 2, 3, 4] as Trimestre[]).map(n => [
      `${n}T`,
      t(n).baseRepercutida.toFixed(2),
      t(n).totalRepercutido.toFixed(2),
      t(n).totalDeducible.toFixed(2),
      t(n).resultado.toFixed(2),
    ]),
    [
      'Anual',
      r.baseRepercutidaAnual.toFixed(2),
      r.repercutidoAnual.toFixed(2),
      r.deducibleAnual.toFixed(2),
      r.resultadoAnual.toFixed(2),
    ],
    [],
    ['Operaciones al 0 % (exentas + no sujetas)', r.baseSinCuotaAnual.toFixed(2)],
  ];
  return filas.map(f => f.map(c => `"${(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
}
