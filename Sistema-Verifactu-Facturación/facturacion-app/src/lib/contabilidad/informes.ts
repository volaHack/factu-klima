/**
 * LOS LIBROS Y LAS CUENTAS, A PARTIR DE LOS ASIENTOS
 *
 * Todo sale de la lista de asientos que genera el motor: el diario del
 * ejercicio (con su asiento de apertura), el mayor de cada cuenta, las
 * sumas y saldos, la cuenta de pérdidas y ganancias y el balance, con la
 * estructura de los modelos abreviados del PGC de PYMES.
 *
 * Y los cuadres: comprobaciones automáticas que una gestoría hace a mano
 * al cerrar un trimestre (que el diario cuadre, que lo que deben los
 * clientes coincida con las facturas pendientes, que el IVA de la
 * contabilidad sea el del modelo 303, que la caja no quede en negativo).
 */

import type { Asiento, LineaAsiento } from './motor';
import { r2 } from './motor';
import { CUENTAS, grupo, masaDe } from './plan';

export type Periodo = { ejercicio: number; desde?: string; hasta?: string };

const inicio = (e: number) => `${e}-01-01`;
const fin = (e: number) => `${e}-12-31`;

/** Saldo deudor (debe − haber) por cuenta. */
export function saldos(asientos: Asiento[]): Map<string, { debe: number; haber: number }> {
  const m = new Map<string, { debe: number; haber: number }>();
  for (const a of asientos) {
    for (const l of a.lineas) {
      const s = m.get(l.cuenta) ?? { debe: 0, haber: 0 };
      s.debe = r2(s.debe + l.debe);
      s.haber = r2(s.haber + l.haber);
      m.set(l.cuenta, s);
    }
  }
  return m;
}

/**
 * Los asientos de un ejercicio, numerados, empezando por el de apertura.
 *
 * La apertura arrastra los saldos de balance (grupos 1 a 5) de los años
 * anteriores y lleva el resultado acumulado de aquellos años a remanente.
 * Así el balance de cada año es completo aunque la empresa lleve varios
 * facturando con el programa.
 */
export function diarioDelEjercicio(todos: Asiento[], ejercicio: number): Asiento[] {
  const previos = todos.filter(a => a.fecha < inicio(ejercicio));
  const delAnio = todos.filter(a => a.fecha >= inicio(ejercicio) && a.fecha <= fin(ejercicio));
  const salida: Asiento[] = [];

  if (previos.length > 0) {
    const s = saldos(previos);
    const lineas: LineaAsiento[] = [];
    let resultadoPrevio = 0;
    for (const [cuenta, { debe, haber }] of s) {
      const saldo = r2(debe - haber);
      if (saldo === 0) continue;
      if (grupo(cuenta) >= 6) { resultadoPrevio = r2(resultadoPrevio + saldo); continue; }
      lineas.push({ cuenta, debe: saldo > 0 ? saldo : 0, haber: saldo < 0 ? -saldo : 0 });
    }
    // Un resultado positivo (ingresos > gastos) tiene saldo acreedor: va al haber.
    if (resultadoPrevio !== 0) {
      lineas.push({ cuenta: CUENTAS.remanente, debe: resultadoPrevio > 0 ? resultadoPrevio : 0, haber: resultadoPrevio < 0 ? -resultadoPrevio : 0 });
    }
    if (lineas.length) {
      lineas.sort((a, b) => a.cuenta.localeCompare(b.cuenta));
      salida.push({ numero: 0, fecha: inicio(ejercicio), concepto: `Asiento de apertura ${ejercicio}`, origen: 'apertura', lineas });
    }
  }
  salida.push(...delAnio);
  return salida.map((a, i) => ({ ...a, numero: i + 1 }));
}

export function enPeriodo(a: Asiento, p: Periodo): boolean {
  return a.fecha >= (p.desde ?? inicio(p.ejercicio)) && a.fecha <= (p.hasta ?? fin(p.ejercicio));
}

export interface MovimientoMayor {
  numero: number;
  fecha: string;
  concepto: string;
  documentoId?: string;
  origen: Asiento['origen'];
  debe: number;
  haber: number;
  saldo: number;
}

/** El mayor de una cuenta (o de todas las que empiezan por un prefijo). */
export function libroMayor(diario: Asiento[], prefijo: string): MovimientoMayor[] {
  let saldo = 0;
  const out: MovimientoMayor[] = [];
  for (const a of diario) {
    for (const l of a.lineas) {
      if (!l.cuenta.startsWith(prefijo)) continue;
      saldo = r2(saldo + l.debe - l.haber);
      out.push({ numero: a.numero, fecha: a.fecha, concepto: a.concepto, documentoId: a.documentoId, origen: a.origen, debe: l.debe, haber: l.haber, saldo });
    }
  }
  return out;
}

export interface FilaSumasSaldos {
  cuenta: string;
  debe: number;
  haber: number;
  saldoDeudor: number;
  saldoAcreedor: number;
}

export function sumasYSaldos(diario: Asiento[]): { filas: FilaSumasSaldos[]; totales: FilaSumasSaldos } {
  const filas = [...saldos(diario).entries()]
    .map(([cuenta, { debe, haber }]) => {
      const s = r2(debe - haber);
      return { cuenta, debe, haber, saldoDeudor: s > 0 ? s : 0, saldoAcreedor: s < 0 ? -s : 0 };
    })
    .sort((a, b) => a.cuenta.localeCompare(b.cuenta));
  const suma = (k: keyof Omit<FilaSumasSaldos, 'cuenta'>) => r2(filas.reduce((s, f) => s + f[k], 0));
  return { filas, totales: { cuenta: 'Total', debe: suma('debe'), haber: suma('haber'), saldoDeudor: suma('saldoDeudor'), saldoAcreedor: suma('saldoAcreedor') } };
}

// ------------------------------------------------------------------
// Pérdidas y ganancias (modelo abreviado del PGC de PYMES)
// ------------------------------------------------------------------

export interface PartidaPyG {
  clave: string;
  nombre: string;
  /** Positivo = ingreso; negativo = gasto (como se presenta en el PGC). */
  importe: number;
  cuentas: string[];
}

export interface PerdidasYGanancias {
  partidas: PartidaPyG[];
  resultadoExplotacion: number;
  resultadoAntesDeImpuestos: number;
  ingresos: number;
  gastos: number;
}

const PARTIDAS: { clave: string; nombre: string; prefijos: string[] }[] = [
  { clave: '1', nombre: 'Importe neto de la cifra de negocios', prefijos: ['70'] },
  { clave: '4', nombre: 'Aprovisionamientos', prefijos: ['60', '61'] },
  { clave: '5', nombre: 'Otros ingresos de explotación', prefijos: ['75'] },
  { clave: '6', nombre: 'Gastos de personal', prefijos: ['64'] },
  { clave: '7', nombre: 'Otros gastos de explotación', prefijos: ['62', '63', '65'] },
  { clave: '8', nombre: 'Amortización del inmovilizado', prefijos: ['68'] },
];

export function perdidasYGanancias(diario: Asiento[], p?: Periodo): PerdidasYGanancias {
  const movs = p ? diario.filter(a => a.origen !== 'apertura' && enPeriodo(a, p)) : diario.filter(a => a.origen !== 'apertura');
  const s = saldos(movs);
  const partidas: PartidaPyG[] = PARTIDAS.map(x => {
    const cuentas = [...s.keys()].filter(c => x.prefijos.some(pr => c.startsWith(pr)));
    // Ingresos con saldo acreedor en positivo, gastos con saldo deudor en negativo.
    const importe = r2(cuentas.reduce((t, c) => t + (s.get(c)!.haber - s.get(c)!.debe), 0));
    return { clave: x.clave, nombre: x.nombre, importe, cuentas };
  });
  const resultadoExplotacion = r2(partidas.reduce((t, x) => t + x.importe, 0));
  const ingresos = r2([...s.entries()].filter(([c]) => grupo(c) === 7).reduce((t, [, v]) => t + v.haber - v.debe, 0));
  const gastos = r2([...s.entries()].filter(([c]) => grupo(c) === 6).reduce((t, [, v]) => t + v.debe - v.haber, 0));
  return { partidas, resultadoExplotacion, resultadoAntesDeImpuestos: resultadoExplotacion, ingresos, gastos };
}

// ------------------------------------------------------------------
// Balance de situación (abreviado)
// ------------------------------------------------------------------

export interface LineaBalance { nombre: string; importe: number; cuentas: string[] }

export interface Balance {
  activoNoCorriente: LineaBalance[];
  activoCorriente: LineaBalance[];
  patrimonioNeto: LineaBalance[];
  pasivoCorriente: LineaBalance[];
  totalActivo: number;
  totalPatrimonioNetoYPasivo: number;
  cuadra: boolean;
}

function linea(s: Map<string, { debe: number; haber: number }>, nombre: string, filtro: (c: string) => boolean, deudor: boolean): LineaBalance {
  const cuentas = [...s.keys()].filter(filtro);
  const importe = r2(cuentas.reduce((t, c) => t + (deudor ? 1 : -1) * (s.get(c)!.debe - s.get(c)!.haber), 0));
  return { nombre, importe, cuentas };
}

/** El balance a la fecha de cierre del periodo (por defecto, fin de año). */
export function balance(diario: Asiento[], hasta?: string): Balance {
  const movs = hasta ? diario.filter(a => a.fecha <= hasta) : diario;
  const s = saldos(movs);
  const empieza = (...p: string[]) => (c: string) => p.some(x => c.startsWith(x));
  const resultado = r2([...s.entries()].filter(([c]) => grupo(c) >= 6).reduce((t, [, v]) => t + v.haber - v.debe, 0));

  const activoNoCorriente = [linea(s, 'Inmovilizado material', empieza('21'), true)];
  const activoCorriente = [
    linea(s, 'Clientes por ventas y prestaciones de servicios', empieza('430', '431', '438'), true),
    linea(s, 'Hacienda Pública deudora (IVA soportado, retenciones)', empieza('472', '473'), true),
    linea(s, 'Efectivo y otros activos líquidos', empieza('57'), true),
  ];
  const patrimonioNeto = [
    linea(s, 'Remanente y resultados de ejercicios anteriores', empieza('12'), false),
    { nombre: 'Resultado del ejercicio', importe: resultado, cuentas: [] },
  ];
  const pasivoCorriente = [
    linea(s, 'Proveedores', empieza('400'), false),
    linea(s, 'Acreedores varios', empieza('410'), false),
    linea(s, 'Hacienda Pública acreedora (IVA repercutido, retenciones)', empieza('475', '477'), false),
  ];
  // Lo que no encaja en ninguna línea (no debería haber nada) se suma a su
  // masa, para que el balance no pierda dinero por el camino.
  const clasificadas = new Set([...activoNoCorriente, ...activoCorriente, ...patrimonioNeto, ...pasivoCorriente].flatMap(l => l.cuentas));
  for (const c of s.keys()) {
    if (grupo(c) >= 6 || clasificadas.has(c)) continue;
    const m = masaDe(c);
    const destino = m === 'activo_no_corriente' ? activoNoCorriente : m === 'activo_corriente' ? activoCorriente : m === 'patrimonio_neto' ? patrimonioNeto : pasivoCorriente;
    destino.push(linea(s, `Otras (${c})`, x => x === c, m.startsWith('activo')));
  }

  const suma = (ls: LineaBalance[]) => r2(ls.reduce((t, l) => t + l.importe, 0));
  const totalActivo = r2(suma(activoNoCorriente) + suma(activoCorriente));
  const totalPatrimonioNetoYPasivo = r2(suma(patrimonioNeto) + suma(pasivoCorriente));
  return {
    activoNoCorriente, activoCorriente, patrimonioNeto, pasivoCorriente,
    totalActivo, totalPatrimonioNetoYPasivo, cuadra: Math.abs(totalActivo - totalPatrimonioNetoYPasivo) < 0.01,
  };
}

// ------------------------------------------------------------------
// Cuadres automáticos
// ------------------------------------------------------------------

export type EstadoCuadre = 'ok' | 'aviso' | 'error';

export interface Cuadre {
  id: string;
  titulo: string;
  estado: EstadoCuadre;
  detalle: string;
}

export function asientosDescuadrados(diario: Asiento[]): Asiento[] {
  return diario.filter(a => Math.abs(r2(a.lineas.reduce((t, l) => t + l.debe - l.haber, 0))) >= 0.01);
}

export interface DatosCuadre {
  /** IVA/IGIC devengado del ejercicio según el modelo trimestral (suma de los 4). */
  impuestoDevengadoModelo?: number;
  /** Lo que las facturas dicen que falta por cobrar (neto de retenciones). */
  pendienteDeCobro?: number;
  impuesto: 'IVA' | 'IGIC';
  /** Por qué pueden no coincidir el modelo y la contabilidad. */
  explicacionDiferenciaImpuesto?: string;
}

export function cuadres(diario: Asiento[], ejercicio: number, extra: DatosCuadre): Cuadre[] {
  const out: Cuadre[] = [];
  const mal = asientosDescuadrados(diario);
  const ss = sumasYSaldos(diario).totales;
  out.push(mal.length === 0 && Math.abs(ss.debe - ss.haber) < 0.01
    ? { id: 'diario', titulo: 'El diario cuadra', estado: 'ok', detalle: `Debe y haber suman lo mismo: ${fmt(ss.debe)}.` }
    : { id: 'diario', titulo: 'Hay asientos que no cuadran', estado: 'error', detalle: `${mal.length} asiento(s) con debe distinto del haber: ${mal.slice(0, 5).map(a => a.concepto).join('; ')}.` });

  const b = balance(diario);
  out.push(b.cuadra
    ? { id: 'balance', titulo: 'El balance cuadra', estado: 'ok', detalle: `Activo = patrimonio neto + pasivo = ${fmt(b.totalActivo)}.` }
    : { id: 'balance', titulo: 'El balance no cuadra', estado: 'error', detalle: `Activo ${fmt(b.totalActivo)} frente a ${fmt(b.totalPatrimonioNetoYPasivo)}.` });

  const s = saldos(diario);
  const suma = (pref: string, deudor: boolean) => r2([...s.entries()].filter(([c]) => c.startsWith(pref)).reduce((t, [, v]) => t + (deudor ? v.debe - v.haber : v.haber - v.debe), 0));

  if (typeof extra.pendienteDeCobro === 'number') {
    const clientes = suma('430', true);
    const dif = r2(clientes - extra.pendienteDeCobro);
    out.push(Math.abs(dif) < 0.01
      ? { id: 'clientes', titulo: 'Lo que deben los clientes cuadra con las facturas', estado: 'ok', detalle: `Saldo de clientes (430): ${fmt(clientes)}, igual que lo pendiente de cobro.` }
      : { id: 'clientes', titulo: 'Los clientes no cuadran con las facturas pendientes', estado: 'aviso', detalle: `Saldo de clientes (430): ${fmt(clientes)}; facturas pendientes: ${fmt(extra.pendienteDeCobro)}. Diferencia de ${fmt(dif)}: suele ser un cobro apuntado en tesorería sin marcar la factura, o al revés.` });
  }

  if (typeof extra.impuestoDevengadoModelo === 'number') {
    const movsAnio = diario.filter(a => a.origen !== 'apertura');
    const s477 = saldos(movsAnio);
    const devengado = r2([...s477.entries()].filter(([c]) => c.startsWith('477')).reduce((t, [, v]) => t + v.haber - v.debe, 0));
    const dif = r2(devengado - extra.impuestoDevengadoModelo);
    const modelo = extra.impuesto === 'IGIC' ? '420' : '303';
    out.push(Math.abs(dif) < 0.01
      ? { id: 'impuesto', titulo: `El ${extra.impuesto} coincide con el modelo ${modelo}`, estado: 'ok', detalle: `${extra.impuesto} repercutido en ${ejercicio}: ${fmt(devengado)} en la contabilidad y en los cuatro ${modelo}.` }
      : { id: 'impuesto', titulo: `El ${extra.impuesto} de la contabilidad y el del ${modelo} no coinciden`, estado: 'aviso', detalle: `Contabilidad: ${fmt(devengado)}; modelos ${modelo}: ${fmt(extra.impuestoDevengadoModelo)} (diferencia ${fmt(dif)}). ${extra.explicacionDiferenciaImpuesto ?? ''}`.trim() });
  }

  const caja = suma('570', true);
  out.push(caja < -0.009
    ? { id: 'caja', titulo: 'La caja queda en negativo', estado: 'aviso', detalle: `Según lo apuntado, en caja habría ${fmt(caja)}. Faltan entradas de efectivo (una aportación, una retirada del banco) o hay pagos en efectivo que salieron de otra cuenta.` }
    : { id: 'caja', titulo: 'La caja no queda en negativo', estado: 'ok', detalle: `Saldo de caja según lo apuntado: ${fmt(caja)}.` });

  return out;
}

const fmt = (n: number) => `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

// ------------------------------------------------------------------
// Exportación para la gestoría
// ------------------------------------------------------------------

const csv = (filas: (string | number)[][]) =>
  filas.map(f => f.map(c => {
    const t = typeof c === 'number' ? c.toFixed(2).replace('.', ',') : c;
    return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  }).join(';')).join('\r\n');

/** Libro diario en CSV: una fila por apunte, como lo importan A3, Sage o ContaSol. */
export function diarioCsv(diario: Asiento[], nombreCuenta: (c: string) => string): string {
  const filas: (string | number)[][] = [['Asiento', 'Fecha', 'Cuenta', 'Nombre de la cuenta', 'Concepto', 'Documento', 'Debe', 'Haber']];
  for (const a of diario) {
    const fecha = a.fecha.split('-').reverse().join('/');
    for (const l of a.lineas) filas.push([a.numero, fecha, l.cuenta, nombreCuenta(l.cuenta), a.concepto, a.documento ?? '', l.debe, l.haber]);
  }
  return csv(filas);
}

export function sumasYSaldosCsv(diario: Asiento[], nombreCuenta: (c: string) => string): string {
  const { filas, totales } = sumasYSaldos(diario);
  return csv([
    ['Cuenta', 'Nombre', 'Debe', 'Haber', 'Saldo deudor', 'Saldo acreedor'],
    ...filas.map(f => [f.cuenta, nombreCuenta(f.cuenta), f.debe, f.haber, f.saldoDeudor, f.saldoAcreedor]),
    ['', 'Total', totales.debe, totales.haber, totales.saldoDeudor, totales.saldoAcreedor],
  ]);
}
