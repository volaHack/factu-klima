/**
 * MODELO 190 — Resumen anual de retenciones del trabajo y de actividades
 * económicas.
 *
 * Es al 111 lo que el 390 es al 303: el año entero, pero ahora POR
 * PERCEPTOR, con su NIF. Y tiene que cuadrar con la suma de los cuatro 111
 * presentados: se calcula con el mismo motor trimestre a trimestre y se
 * suma, para que no haya dos criterios.
 *
 * Todas las percepciones que salen del programa son facturas de
 * profesionales o empresarios con retención: clave G (actividades
 * económicas, profesionales). Las nóminas (clave A) no se registran.
 *
 * El NIF del perceptor es obligatorio en el 190: sin él, es un error, no
 * un aviso.
 */

import type { Invoice, CompanySettings } from '../../types';
import type { ErrorValidacion, PeriodoFiscal, ResultadoValidacion, Trimestre } from '../tipos';
import { redondear } from '../FiscalCalculationService';
import { isValidNif } from '../../validation/nif';
import { calcularModelo111, comprasConRetencion, percepcionesPorPerceptor, type Percepcion111, type Resultado111 } from './modelo111';

export interface Perceptor190 extends Percepcion111 {
  /** Clave de percepción del 190. G = actividades económicas profesionales. */
  clave: 'G';
}

export interface Resultado190 {
  ejercicio: number;
  perceptores: Perceptor190[];
  base: number;
  retenciones: number;
  /** Los cuatro 111, para comprobar el cuadre. */
  trimestres: Record<Trimestre, Resultado111>;
  numFacturas: number;
}

export function calcularModelo190(datos: { facturas: Invoice[] }, periodo: PeriodoFiscal): Resultado190 {
  const ejercicio = periodo.ejercicio;
  const trimestres = {} as Record<Trimestre, Resultado111>;
  for (const t of [1, 2, 3, 4] as Trimestre[]) {
    trimestres[t] = calcularModelo111({ facturas: datos.facturas }, { ejercicio, trimestre: t });
  }
  const compras = comprasConRetencion(datos.facturas, { ejercicio });
  const perceptores = percepcionesPorPerceptor(compras).map(p => ({ ...p, clave: 'G' as const }));
  return {
    ejercicio,
    perceptores,
    base: redondear(perceptores.reduce((s, p) => s + p.base, 0)),
    retenciones: redondear(perceptores.reduce((s, p) => s + p.retencion, 0)),
    trimestres,
    numFacturas: compras.length,
  };
}

export function validarModelo190(
  r: Resultado190,
  empresa: Pick<CompanySettings, 'nif' | 'businessName'> | null,
): ResultadoValidacion {
  const errores: ErrorValidacion[] = [];
  const avisos: ErrorValidacion[] = [];

  if (!empresa?.nif || !isValidNif(empresa.nif)) {
    errores.push({
      gravedad: 'critico', campo: 'nif',
      mensaje: `El NIF de la empresa (${empresa?.nif || 'vacío'}) no es válido.`,
      referencia: { tipo: 'empresa', id: 'empresa', etiqueta: 'Ajustes de la empresa' },
    });
  }
  for (const p of r.perceptores) {
    if (!p.nif || !isValidNif(p.nif)) {
      errores.push({
        gravedad: 'critico', campo: 'nif_perceptor',
        mensaje: `${p.nombre}: el 190 exige el NIF de cada perceptor y el que tiene (${p.nif || 'vacío'}) no es válido.`,
        referencia: { tipo: 'factura', id: p.facturaId, etiqueta: p.nombre },
      });
    }
  }
  const sumaTrimestral = redondear(([1, 2, 3, 4] as Trimestre[]).reduce((s, t) => s + r.trimestres[t].retenciones, 0));
  if (Math.abs(sumaTrimestral - r.retenciones) > 0.01) {
    errores.push({
      gravedad: 'critico', campo: 'cuadre_anual',
      mensaje: `Las retenciones del año (${r.retenciones} €) no cuadran con la suma de los cuatro 111 (${sumaTrimestral} €).`,
    });
  }
  if (r.numFacturas === 0) {
    avisos.push({
      gravedad: 'aviso', campo: 'sin_datos',
      mensaje: `No hay facturas de compra con retención en ${r.ejercicio}. Si hubo nóminas, se declaran igualmente, pero no están en el programa.`,
    });
  }
  return { valido: errores.length === 0, errores, avisos };
}

export function exportarCsv190(r: Resultado190): string {
  const filas: string[][] = [
    ['Modelo 190 — Resumen anual de retenciones', String(r.ejercicio)],
    [],
    ['NIF perceptor', 'Nombre', 'Clave', 'Percepciones', 'Retenciones', 'Facturas'],
    ...r.perceptores.map(p => [p.nif, p.nombre, p.clave, p.base.toFixed(2), p.retencion.toFixed(2), String(p.numFacturas)]),
    [],
    ['Total', '', '', r.base.toFixed(2), r.retenciones.toFixed(2), String(r.numFacturas)],
  ];
  return filas.map(f => f.map(c => `"${(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
}
