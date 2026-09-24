/**
 * APUNTES A MANO Y PERIÓDICOS
 *
 * Lo que la contabilidad no puede sacar de las facturas: las nóminas con su
 * Seguridad Social, la amortización de lo que se compró para durar, las
 * cuotas de un préstamo, o cualquier asiento suelto que diga la gestoría.
 *
 * Un apunte periódico no se guarda repetido: se guarda una vez, con su
 * calendario, y el motor genera el asiento de cada mes (o trimestre, o año)
 * hasta hoy. Cambiarlo cambia todos, que es justo lo que se quiere cuando
 * sube el sueldo a partir de una fecha (se cierra uno y se abre otro).
 *
 * El préstamo va aparte: cada cuota tiene distinta parte de capital y de
 * intereses (sistema francés), así que se guarda el préstamo y cada asiento
 * se calcula con su cuadro de amortización.
 */

import { CUENTAS } from './plan';
import type { Asiento, LineaAsiento } from './motor';

export type Plantilla = 'libre' | 'nomina' | 'amortizacion' | 'prestamo';
export type Periodicidad = 'unico' | 'mes' | 'trimestre' | 'anio';

export interface LineaApunte { cuenta: string; debe: number; haber: number }

export interface Prestamo {
  principal: number;
  /** Tipo de interés nominal anual, en %. */
  interesAnual: number;
  /** Número de cuotas mensuales. */
  meses: number;
  /** Apuntar la entrada del dinero en el banco el día de la firma. */
  conIngreso: boolean;
}

export interface ApunteContable {
  id: string;
  concepto: string;
  plantilla: Plantilla;
  periodicidad: Periodicidad;
  /** Fecha del apunte, o de la primera vez si se repite. */
  fecha: string;
  /** Última fecha en que se repite (incluida). */
  hasta?: string;
  lineas: LineaApunte[];
  prestamo?: Prestamo;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export const PERIODICIDADES: { id: Periodicidad; nombre: string; meses: number }[] = [
  { id: 'unico', nombre: 'Una sola vez', meses: 0 },
  { id: 'mes', nombre: 'Cada mes', meses: 1 },
  { id: 'trimestre', nombre: 'Cada trimestre', meses: 3 },
  { id: 'anio', nombre: 'Cada año', meses: 12 },
];

/** «640» → «64000000»; «4751» → «47510000». Las subcuentas de 8 cifras pasan tal cual. */
export function normalizarCuenta(c: string): string {
  const d = c.replace(/\D/g, '');
  if (d.length < 3 || d.length > 8) return '';
  return d.padEnd(8, '0');
}

/** Suma meses conservando el día (el 31 cae en el último día del mes corto). */
export function sumarMeses(fecha: string, meses: number, dia = Number(fecha.slice(8, 10))): string {
  const [a, m] = fecha.split('-').map(Number);
  const total = (m - 1) + meses;
  const anio = a + Math.floor(total / 12);
  const mes = (total % 12) + 1;
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return `${anio}-${String(mes).padStart(2, '0')}-${String(Math.min(dia, ultimo)).padStart(2, '0')}`;
}

/** Las fechas en que toca el apunte, hasta hoy. */
export function fechasDe(a: ApunteContable, hoy: string): string[] {
  if (a.plantilla === 'prestamo' && a.prestamo) {
    const out: string[] = [];
    for (let k = 1; k <= a.prestamo.meses; k++) {
      const f = sumarMeses(a.fecha, k, Number(a.fecha.slice(8, 10)));
      if (f > hoy) break;
      out.push(f);
    }
    return out;
  }
  if (a.periodicidad === 'unico') return [a.fecha];
  const paso = PERIODICIDADES.find(p => p.id === a.periodicidad)!.meses;
  const dia = Number(a.fecha.slice(8, 10));
  const out: string[] = [];
  for (let k = 0; k < 600; k++) {
    const f = sumarMeses(a.fecha, k * paso, dia);
    if (f > hoy || (a.hasta && f > a.hasta)) break;
    out.push(f);
  }
  return out;
}

/** Cuota del sistema francés. */
export function cuotaPrestamo(p: Prestamo): number {
  const r = p.interesAnual / 100 / 12;
  if (!r) return r2(p.principal / p.meses);
  return r2(p.principal * r / (1 - Math.pow(1 + r, -p.meses)));
}

/** El cuadro de amortización: capital e intereses de cada cuota, y lo que queda. */
export function cuadroPrestamo(p: Prestamo): { capital: number; intereses: number; pendiente: number }[] {
  const r = p.interesAnual / 100 / 12;
  const cuota = cuotaPrestamo(p);
  let pendiente = p.principal;
  const out: { capital: number; intereses: number; pendiente: number }[] = [];
  for (let k = 1; k <= p.meses; k++) {
    const intereses = r2(pendiente * r);
    // La última cuota cierra lo que quede, para que no sobre ni falte un céntimo.
    const capital = k === p.meses ? r2(pendiente) : r2(cuota - intereses);
    pendiente = r2(pendiente - capital);
    out.push({ capital, intereses, pendiente });
  }
  return out;
}

// ------------------------------------------------------------------
// Plantillas
// ------------------------------------------------------------------

export interface DatosNomina { bruto: number; irpf: number; ssTrabajador: number; ssEmpresa: number }

/** Nómina pagada por banco: gasto de personal y SS de la empresa; retenciones y SS a pagar; neto al banco. */
export function lineasNomina(n: DatosNomina): LineaApunte[] {
  const neto = r2(n.bruto - n.irpf - n.ssTrabajador);
  return [
    { cuenta: CUENTAS.sueldos, debe: r2(n.bruto), haber: 0 },
    { cuenta: CUENTAS.seguridadSocialEmpresa, debe: r2(n.ssEmpresa), haber: 0 },
    { cuenta: CUENTAS.retencionesPracticadas, debe: 0, haber: r2(n.irpf) },
    { cuenta: CUENTAS.seguridadSocialAcreedora, debe: 0, haber: r2(n.ssTrabajador + n.ssEmpresa) },
    { cuenta: CUENTAS.bancos, debe: 0, haber: neto },
  ].filter(l => l.debe || l.haber);
}

/** Amortización lineal: valor ÷ años, repartido por la periodicidad. */
export function cuotaAmortizacion(valor: number, anios: number, periodicidad: Periodicidad): number {
  const porAnio = valor / Math.max(1, anios);
  const div = periodicidad === 'mes' ? 12 : periodicidad === 'trimestre' ? 4 : 1;
  return r2(porAnio / div);
}

export function lineasAmortizacion(cuota: number): LineaApunte[] {
  return [
    { cuenta: CUENTAS.amortizacionInmovilizado, debe: r2(cuota), haber: 0 },
    { cuenta: CUENTAS.amortizacionAcumulada, debe: 0, haber: r2(cuota) },
  ];
}

// ------------------------------------------------------------------
// Validación y asientos
// ------------------------------------------------------------------

/** Qué le falta a un apunte para poder guardarse, o null si está bien. */
export function problemaDe(a: ApunteContable): string | null {
  if (!a.concepto.trim()) return 'Falta el concepto.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a.fecha)) return 'Falta la fecha.';
  if (a.hasta && a.hasta < a.fecha) return 'La fecha final es anterior a la primera.';
  if (a.plantilla === 'prestamo') {
    const p = a.prestamo;
    if (!p || !(p.principal > 0) || !(p.meses > 0) || p.interesAnual < 0) return 'Faltan el importe, el plazo o el interés del préstamo.';
    return null;
  }
  if (a.lineas.length < 2) return 'Un asiento necesita al menos dos líneas.';
  for (const l of a.lineas) {
    if (!/^\d{8}$/.test(l.cuenta)) return `La cuenta «${l.cuenta || '(vacía)'}» no es válida: de 3 a 8 cifras del Plan General.`;
    if (l.debe < 0 || l.haber < 0) return 'No se admiten importes negativos: usa la otra columna.';
    if (l.debe && l.haber) return `La cuenta ${l.cuenta} tiene importe en el debe y en el haber: sepáralo en dos líneas.`;
    if (!l.debe && !l.haber) return `La cuenta ${l.cuenta} no tiene importe.`;
  }
  const debe = r2(a.lineas.reduce((t, l) => t + l.debe, 0));
  const haber = r2(a.lineas.reduce((t, l) => t + l.haber, 0));
  const eur = (n: number) => n.toFixed(2).replace('.', ',') + ' €';
  if (Math.abs(debe - haber) >= 0.01) return `No cuadra: el debe suma ${eur(debe)} y el haber ${eur(haber)}.`;
  return null;
}

/** Importe de referencia (lo que suma el debe de cada asiento, o la cuota del préstamo). */
export function importeDe(a: ApunteContable): number {
  if (a.plantilla === 'prestamo' && a.prestamo) return cuotaPrestamo(a.prestamo);
  return r2(a.lineas.reduce((t, l) => t + l.debe, 0));
}

function compactarLineas(ls: LineaApunte[]): LineaAsiento[] {
  return ls.filter(l => l.debe || l.haber).map(l => ({ cuenta: l.cuenta, debe: r2(l.debe), haber: r2(l.haber) }));
}

/** Los asientos que generan los apuntes, hasta hoy. */
export function asientosDeApuntes(apuntes: ApunteContable[], hoy: string): Asiento[] {
  const out: Asiento[] = [];
  for (const a of apuntes) {
    if (problemaDe(a)) continue; // uno mal guardado no descuadra la contabilidad entera
    if (a.plantilla === 'prestamo' && a.prestamo) {
      const p = a.prestamo;
      const largo = p.meses > 12;
      const deuda = largo ? CUENTAS.deudasLargoPlazoBanco : CUENTAS.deudasCortoPlazoBanco;
      if (p.conIngreso && a.fecha <= hoy) {
        out.push({
          numero: 0, fecha: a.fecha, origen: 'manual', concepto: `${a.concepto} · entrada del préstamo`, documentoId: a.id,
          lineas: compactarLineas([{ cuenta: CUENTAS.bancos, debe: p.principal, haber: 0 }, { cuenta: deuda, debe: 0, haber: p.principal }]),
        });
      }
      const cuadro = cuadroPrestamo(p);
      fechasDe(a, hoy).forEach((f, i) => {
        const c = cuadro[i];
        out.push({
          numero: 0, fecha: f, origen: 'periodico', concepto: `${a.concepto} · cuota ${i + 1} de ${p.meses}`, documentoId: a.id,
          lineas: compactarLineas([
            { cuenta: deuda, debe: c.capital, haber: 0 },
            { cuenta: CUENTAS.interesesDeudas, debe: c.intereses, haber: 0 },
            { cuenta: CUENTAS.bancos, debe: 0, haber: r2(c.capital + c.intereses) },
          ]),
        });
      });
      continue;
    }
    const fechas = fechasDe(a, hoy);
    for (const f of fechas) {
      out.push({
        numero: 0, fecha: f, origen: a.periodicidad === 'unico' ? 'manual' : 'periodico', concepto: a.concepto, documentoId: a.id,
        lineas: compactarLineas(a.lineas),
      });
    }
  }
  return out;
}
