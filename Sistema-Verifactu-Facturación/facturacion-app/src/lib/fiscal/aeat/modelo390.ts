/**
 * MODELO 390 — Declaración resumen anual del IVA
 *
 * Recoge los cuatro 303 del año y tiene que cuadrar con ellos. Igual que
 * el 425 con el 420: no vuelve a leer las facturas con otro criterio,
 * calcula los cuatro 303 con el mismo motor y los suma.
 *
 * Además del total, el 390 pide el devengado desglosado por tipo (21, 10,
 * 4 %…) de todo el año: se suma el desglose de cada trimestre.
 */

import type { Invoice, Gasto, CompanySettings } from '../../types';
import type { ErrorValidacion, PeriodoFiscal, ResultadoValidacion, Trimestre } from '../tipos';
import { redondear, type DesgloseTipo } from '../FiscalCalculationService';
import { calcularModelo303, type Resultado303 } from './modelo303';
import { isValidNif } from '../../validation/nif';

export interface Resultado390 {
  ejercicio: number;
  trimestres: Record<Trimestre, Resultado303>;
  /** Devengado del año por tipo impositivo. */
  devengado: DesgloseTipo[];
  baseDevengada: number;
  cuotaDevengada: number;
  cuotaDeducible: number;
  /** Suma de los resultados del régimen general de los cuatro trimestres. */
  resultadoAnual: number;
  numFacturas: number;
  numGastos: number;
}

const TRIMESTRES: Trimestre[] = [1, 2, 3, 4];

export function calcularModelo390(datos: { facturas: Invoice[]; gastos: Gasto[] }, periodo: PeriodoFiscal): Resultado390 {
  const ejercicio = periodo.ejercicio;
  const trimestres = {} as Record<Trimestre, Resultado303>;
  for (const t of TRIMESTRES) trimestres[t] = calcularModelo303(datos, { ejercicio, trimestre: t });

  const porTipo = new Map<number, DesgloseTipo>();
  for (const t of TRIMESTRES) {
    for (const d of trimestres[t].devengado) {
      const a = porTipo.get(d.tipo) ?? { tipo: d.tipo, base: 0, cuota: 0 };
      a.base += d.base;
      a.cuota += d.cuota;
      porTipo.set(d.tipo, a);
    }
  }
  const devengado = [...porTipo.values()]
    .map(d => ({ tipo: d.tipo, base: redondear(d.base), cuota: redondear(d.cuota) }))
    .sort((a, b) => b.tipo - a.tipo);

  const suma = (f: (r: Resultado303) => number) => redondear(TRIMESTRES.reduce((s, t) => s + f(trimestres[t]), 0));
  return {
    ejercicio,
    trimestres,
    devengado,
    baseDevengada: suma(r => r.baseDevengada),
    cuotaDevengada: suma(r => r.cuotaDevengada),
    cuotaDeducible: suma(r => r.cuotaDeducible),
    resultadoAnual: suma(r => r.resultadoRegimenGeneral),
    numFacturas: suma(r => r.numFacturas),
    numGastos: suma(r => r.numGastos),
  };
}

export function validarModelo390(
  r: Resultado390,
  empresa: Pick<CompanySettings, 'nif' | 'businessName' | 'igicEnabled'> | null,
): ResultadoValidacion {
  const errores: ErrorValidacion[] = [];
  const avisos: ErrorValidacion[] = [];
  const refEmpresa = { tipo: 'empresa' as const, id: 'empresa', etiqueta: 'Ajustes de la empresa' };

  if (!empresa?.nif || !isValidNif(empresa.nif)) {
    errores.push({ gravedad: 'critico', campo: 'nif', mensaje: `El NIF de la empresa (${empresa?.nif || 'vacío'}) no es válido.`, referencia: refEmpresa });
  }
  if (empresa?.igicEnabled) {
    errores.push({ gravedad: 'critico', campo: 'regimen', mensaje: 'La empresa tributa en IGIC: su resumen anual es el 425, no el 390.', referencia: refEmpresa });
  }
  const sumaPorTipo = redondear(r.devengado.reduce((s, d) => s + d.cuota, 0));
  if (Math.abs(sumaPorTipo - r.cuotaDevengada) > 0.01) {
    errores.push({
      gravedad: 'critico', campo: 'cuadre_anual',
      mensaje: `El devengado por tipos (${sumaPorTipo} €) no cuadra con la suma de los cuatro 303 (${r.cuotaDevengada} €).`,
    });
  }
  const vacios = TRIMESTRES.filter(t => r.trimestres[t].numFacturas === 0 && r.trimestres[t].numGastos === 0);
  if (vacios.length > 0 && vacios.length < 4) {
    avisos.push({ gravedad: 'aviso', campo: 'trimestre_vacio', mensaje: `Sin movimientos en ${vacios.map(t => `${t}T`).join(', ')}. Comprueba que esos 303 se presentaron sin actividad.` });
  }
  if (r.numFacturas === 0 && r.numGastos === 0) {
    avisos.push({ gravedad: 'aviso', campo: 'sin_datos', mensaje: `No hay actividad registrada en ${r.ejercicio}.` });
  }
  return { valido: errores.length === 0, errores, avisos };
}

export function exportarCsv390(r: Resultado390): string {
  const q = (t: Trimestre) => r.trimestres[t];
  const filas: string[][] = [
    ['Modelo 390 — Resumen anual del IVA', String(r.ejercicio)],
    [],
    ['IVA devengado por tipo', 'Base', 'Cuota'],
    ...r.devengado.map(d => [`${d.tipo} %`, d.base.toFixed(2), d.cuota.toFixed(2)]),
    [],
    ['Trimestre', 'Base devengada', 'IVA devengado', 'IVA deducible', 'Resultado'],
    ...TRIMESTRES.map(t => [`${t}T`, q(t).baseDevengada.toFixed(2), q(t).cuotaDevengada.toFixed(2), q(t).cuotaDeducible.toFixed(2), q(t).resultadoRegimenGeneral.toFixed(2)]),
    ['Anual', r.baseDevengada.toFixed(2), r.cuotaDevengada.toFixed(2), r.cuotaDeducible.toFixed(2), r.resultadoAnual.toFixed(2)],
  ];
  return filas.map(f => f.map(c => `"${(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
}
