/**
 * MODELO 111 — Retenciones e ingresos a cuenta (trimestral)
 *
 * Lo presenta quien RETIENE: la empresa que paga a un profesional o a un
 * empresario que le factura con retención de IRPF. Lo retenido no es dinero
 * de la empresa: lo ingresa en Hacienda a cuenta del IRPF del otro.
 *
 * DE DÓNDE SALE
 * -------------
 * De las facturas de COMPRA con retención (las que nos hacen a nosotros).
 * Una factura de venta con retención es el caso contrario: nos retienen a
 * nosotros y lo declara el cliente. Es el mismo criterio que
 * `resumenModelo111` en `retenciones.ts`, aquí con las casillas.
 *
 * Las nóminas (rendimientos del trabajo, casillas [01]–[06]) no se
 * registran en el programa: se enseñan como pendientes, no a cero, para no
 * declarar un cero que nadie ha comprobado.
 *
 * PRESENTACIÓN
 * ------------
 * La AEAT publica diseño de registro, pero aquí no se genera todavía el
 * fichero: se calcula, se valida y se exportan las casillas.
 */

import type { Invoice, CompanySettings } from '../../types';
import type { ErrorValidacion, PeriodoFiscal, ResultadoValidacion, Trimestre } from '../tipos';
import { enPeriodo, facturaCuenta, redondear } from '../FiscalCalculationService';
import { importeRetencion } from '../../retenciones';
import { isValidNif } from '../../validation/nif';

export interface Percepcion111 {
  /** NIF del perceptor (el que nos facturó). */
  nif: string;
  nombre: string;
  base: number;
  retencion: number;
  numFacturas: number;
  /** Para enlazar desde un error a una de sus facturas. */
  facturaId: string;
}

export interface Resultado111 {
  periodo: PeriodoFiscal;
  /** [07] Número de perceptores (actividades económicas). */
  perceptores: number;
  /** [08] Importe de las percepciones. */
  base: number;
  /** [09] Importe de las retenciones. */
  retenciones: number;
  /** [28] Suma de retenciones del periodo. */
  totalLiquidacion: number;
  /** [29] A deducir, sólo en una complementaria. */
  aDeducir: number;
  /** [30] Resultado a ingresar. */
  resultado: number;
  detalle: Percepcion111[];
  numFacturas: number;
}

/** Facturas de compra con retención dentro del periodo. */
export function comprasConRetencion(facturas: Invoice[], periodo: PeriodoFiscal): Invoice[] {
  return facturas.filter(f =>
    f.sentido === 'compra' && facturaCuenta(f) && (f.retencionPct ?? 0) > 0 && enPeriodo(f.issueDate, periodo),
  );
}

/** Agrupa por perceptor: el 111 cuenta personas, no facturas. */
export function percepcionesPorPerceptor(facturas: Invoice[]): Percepcion111[] {
  const porNif = new Map<string, Percepcion111>();
  for (const f of facturas) {
    const clave = (f.clientNif || f.clientId || f.clientName).toUpperCase().replace(/[\s-]/g, '');
    const actual = porNif.get(clave) ?? {
      nif: (f.clientNif || '').toUpperCase().replace(/[\s-]/g, ''),
      nombre: f.clientName, base: 0, retencion: 0, numFacturas: 0, facturaId: f.id,
    };
    actual.base += f.subtotal;
    actual.retencion += importeRetencion(f.subtotal, f.retencionPct);
    actual.numFacturas += 1;
    porNif.set(clave, actual);
  }
  return [...porNif.values()]
    .map(p => ({ ...p, base: redondear(p.base), retencion: redondear(p.retencion) }))
    .sort((a, b) => b.retencion - a.retencion);
}

export function calcularModelo111(
  datos: { facturas: Invoice[]; aDeducir?: number },
  periodo: PeriodoFiscal,
): Resultado111 {
  const trimestre = (periodo.trimestre ?? 1) as Trimestre;
  const p = { ejercicio: periodo.ejercicio, trimestre };
  const compras = comprasConRetencion(datos.facturas, p);
  const detalle = percepcionesPorPerceptor(compras);
  const base = redondear(detalle.reduce((s, d) => s + d.base, 0));
  const retenciones = redondear(detalle.reduce((s, d) => s + d.retencion, 0));
  const aDeducir = redondear(datos.aDeducir || 0);
  return {
    periodo: p,
    perceptores: detalle.length,
    base,
    retenciones,
    totalLiquidacion: retenciones,
    aDeducir,
    resultado: redondear(retenciones - aDeducir),
    detalle,
    numFacturas: compras.length,
  };
}

export function validarModelo111(
  r: Resultado111,
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
  for (const p of r.detalle) {
    if (!p.nif || !isValidNif(p.nif)) {
      avisos.push({
        gravedad: 'aviso', campo: 'nif_perceptor',
        mensaje: `${p.nombre}: el NIF (${p.nif || 'vacío'}) no es válido. En el 111 no hace falta, pero en el resumen anual (190) sí.`,
        referencia: { tipo: 'factura', id: p.facturaId, etiqueta: p.nombre },
      });
    }
  }
  if (r.numFacturas === 0) {
    avisos.push({
      gravedad: 'aviso', campo: 'sin_datos',
      mensaje: 'No hay facturas de compra con retención en el trimestre. Si tampoco hay nóminas, el 111 se presenta sin actividad (o no se presenta, según tu caso).',
    });
  }
  return { valido: errores.length === 0, errores, avisos };
}

export function casillas111(r: Resultado111): { casilla: string; concepto: string; importe: number | null }[] {
  return [
    { casilla: '01', concepto: 'Rendimientos del trabajo · nº de perceptores (no se registran nóminas)', importe: null },
    { casilla: '02', concepto: 'Rendimientos del trabajo · importe de las percepciones', importe: null },
    { casilla: '03', concepto: 'Rendimientos del trabajo · importe de las retenciones', importe: null },
    { casilla: '07', concepto: `Actividades económicas · nº de perceptores (${r.perceptores})`, importe: r.perceptores },
    { casilla: '08', concepto: 'Actividades económicas · importe de las percepciones', importe: r.base },
    { casilla: '09', concepto: 'Actividades económicas · importe de las retenciones', importe: r.retenciones },
    { casilla: '28', concepto: 'Suma de retenciones e ingresos a cuenta', importe: r.totalLiquidacion },
    { casilla: '29', concepto: 'A deducir (sólo complementaria)', importe: r.aDeducir },
    { casilla: '30', concepto: 'Resultado a ingresar', importe: r.resultado },
  ];
}
