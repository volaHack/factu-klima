/**
 * MODELO 415 — Declaración anual de operaciones con terceras personas (IGIC)
 *
 * Es el equivalente canario del 347: se declara cada tercero con el que
 * se ha superado 3.005,06 € en el año natural. Pero lo presenta la
 * **Agencia Tributaria Canaria**, no la AEAT, y quien está en IGIC
 * presenta este y no el 347 por sus operaciones interiores.
 *
 * PRESENTACIÓN
 * ------------
 * El fichero `.dec` que sube a la Sede de la ATC lo genera **su propio
 * programa de ayuda**; la ATC no publica el diseño como especificación
 * abierta (https://sede.gobiernodecanarias.org/sede/tramites/4010).
 * Así que aquí se calcula, se valida y se exporta el detalle, y la
 * presentación se hace con el programa de la ATC. No se inventa el
 * formato del `.dec`.
 */

import type { Invoice, Gasto, Client, CompanySettings } from '../../types';
import type { ErrorValidacion, PeriodoFiscal, ResultadoValidacion, Trimestre } from '../tipos';
import { enPeriodo, facturaCuenta, redondear, trimestreDeFecha } from '../FiscalCalculationService';
import { isValidNif } from '../../validation/nif';

/** Mismo umbral que el 347: 3.005,06 € por tercero y año natural. */
export const UMBRAL_415 = 3005.06;

export type TipoOperacion415 = 'entrega' | 'adquisicion';

export interface Declarado415 {
  nif: string;
  nombre: string;
  tipo: TipoOperacion415;
  importe: number;
  trimestres: Record<Trimestre, number>;
  documentos: { id: string; numero: string; fecha: string; importe: number }[];
}

export interface Resultado415 {
  ejercicio: number;
  declarados: Declarado415[];
  descartadosPorUmbral: number;
  numDeclarados: number;
  numOperaciones: number;
  importeTotal: number;
  importeEntregas: number;
  importeAdquisiciones: number;
}

export interface DatosModelo415 {
  facturas: Invoice[];
  gastos: Gasto[];
  clientes: Client[];
}

export function calcularModelo415(datos: DatosModelo415, periodo: PeriodoFiscal): Resultado415 {
  const ejercicio = periodo.ejercicio;
  const acc = new Map<string, Declarado415>();
  const nombrePorNif = new Map<string, string>();
  const nifPorId = new Map<string, string>();

  for (const c of datos.clientes) {
    if (!c.nif) continue;
    const nif = c.nif.trim().toUpperCase();
    if (!nombrePorNif.has(nif)) nombrePorNif.set(nif, c.businessName || '');
    if (c.id) nifPorId.set(c.id, nif);
  }

  const sumar = (
    nif: string, nombre: string, tipo: TipoOperacion415,
    fecha: string, importe: number, doc: { id: string; numero: string },
  ) => {
    const k = `${nif}|${tipo}`;
    let d = acc.get(k);
    if (!d) {
      d = {
        nif, nombre: nombrePorNif.get(nif) || nombre, tipo,
        importe: 0, trimestres: { 1: 0, 2: 0, 3: 0, 4: 0 }, documentos: [],
      };
      acc.set(k, d);
    }
    const t = trimestreDeFecha(fecha);
    d.importe = redondear(d.importe + importe);
    d.trimestres[t] = redondear(d.trimestres[t] + importe);
    d.documentos.push({ id: doc.id, numero: doc.numero, fecha, importe });
  };

  for (const f of datos.facturas) {
    if (!facturaCuenta(f) || !enPeriodo(f.issueDate, { ejercicio })) continue;
    const nif = (f.clientNif || '').trim().toUpperCase();
    if (!nif) continue;
    const tipo: TipoOperacion415 = f.sentido === 'compra' ? 'adquisicion' : 'entrega';
    sumar(nif, f.clientName || '', tipo, f.issueDate, f.total, { id: f.id, numero: f.number });
  }

  for (const g of datos.gastos) {
    if (!enPeriodo(g.fecha, { ejercicio })) continue;
    const nif = g.proveedorId ? nifPorId.get(g.proveedorId) : undefined;
    if (!nif) continue;
    sumar(nif, g.proveedorNombre || '', 'adquisicion', g.fecha, g.total, {
      id: g.id, numero: g.concepto,
    });
  }

  const todos = [...acc.values()];
  const declarados = todos
    .filter(d => Math.abs(d.importe) > UMBRAL_415)
    .sort((a, b) => b.importe - a.importe);

  let importeEntregas = 0;
  let importeAdquisiciones = 0;
  let numOperaciones = 0;
  for (const d of declarados) {
    if (d.tipo === 'entrega') importeEntregas = redondear(importeEntregas + d.importe);
    else importeAdquisiciones = redondear(importeAdquisiciones + d.importe);
    numOperaciones += d.documentos.length;
  }

  return {
    ejercicio,
    declarados,
    descartadosPorUmbral: todos.length - declarados.length,
    numDeclarados: declarados.length,
    numOperaciones,
    importeTotal: redondear(importeEntregas + importeAdquisiciones),
    importeEntregas,
    importeAdquisiciones,
  };
}

export function validarModelo415(
  r: Resultado415,
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
      mensaje: 'El 415 es el modelo del IGIC. Si la empresa tributa en IVA, le corresponde el 347 ante la AEAT.',
      referencia: refEmpresa,
    });
  }

  for (const d of r.declarados) {
    const ref = { tipo: 'cliente' as const, id: d.nif, etiqueta: `${d.nombre || d.nif} (${d.nif})` };
    if (!isValidNif(d.nif)) {
      errores.push({
        gravedad: 'critico', campo: 'nif_declarado',
        mensaje: `NIF ${d.nif} no válido (${d.nombre || 'sin nombre'}).`,
        referencia: ref,
      });
    }
    if (!d.nombre.trim()) {
      errores.push({
        gravedad: 'critico', campo: 'nombre_declarado',
        mensaje: `El tercero con NIF ${d.nif} no tiene razón social.`,
        referencia: ref,
      });
    }
    const suma = redondear(d.trimestres[1] + d.trimestres[2] + d.trimestres[3] + d.trimestres[4]);
    if (Math.abs(suma - d.importe) > 0.01) {
      errores.push({
        gravedad: 'critico', campo: 'cuadre_trimestres',
        mensaje: `En ${d.nombre || d.nif} los trimestres suman ${suma} € y el total es ${d.importe} €.`,
        referencia: ref,
      });
    }
  }

  if (r.declarados.length === 0) {
    avisos.push({
      gravedad: 'aviso', campo: 'sin_datos',
      mensaje: `Ningún tercero supera los ${UMBRAL_415.toLocaleString('es-ES')} € en ${r.ejercicio}: no hay obligación de presentar el 415.`,
    });
  }

  return { valido: errores.length === 0, errores, avisos };
}

/** Detalle en CSV para archivar o pasar a la gestoría. No es el `.dec`. */
export function exportarCsv415(r: Resultado415): string {
  const filas: string[][] = [
    ['Modelo 415 — Operaciones con terceros (IGIC)', String(r.ejercicio)],
    [],
    ['NIF', 'Nombre', 'Tipo', 'Importe', '1T', '2T', '3T', '4T'],
    ...r.declarados.map(d => [
      d.nif, d.nombre, d.tipo === 'entrega' ? 'Entrega' : 'Adquisición',
      d.importe.toFixed(2),
      d.trimestres[1].toFixed(2), d.trimestres[2].toFixed(2),
      d.trimestres[3].toFixed(2), d.trimestres[4].toFixed(2),
    ]),
    [],
    ['Declarados', String(r.numDeclarados)],
    ['Operaciones', String(r.numOperaciones)],
    ['Importe total', r.importeTotal.toFixed(2)],
  ];
  return filas.map(f => f.map(c => `"${(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
}
