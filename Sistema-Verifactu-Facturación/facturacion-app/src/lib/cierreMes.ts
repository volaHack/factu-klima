/**
 * EL CIERRE DEL MES, PUNTO POR PUNTO
 *
 * A final de mes la oficina repasa siempre lo mismo antes de dar el mes
 * por cerrado y mandárselo a la gestoría: que no quede un borrador
 * olvidado, que todo lo entregado esté facturado, quién debe, que el banco
 * cuadre, que estén todas las facturas de los proveedores de siempre y
 * cuánto sale de impuesto. Cada cosa estaba en su pantalla y nada decía
 * «ya está». Aquí se juntan en una lista, cada punto en verde o en ámbar y
 * con lo que hay que hacer a un toque.
 *
 * Ninguna cuenta es nueva: las vencidas son las de los recordatorios, el
 * banco usa las marcas de la conciliación y el impuesto sale del cálculo
 * del modelo (420 o 303) con sólo las operaciones del mes. Aquí no se emite
 * ni se borra nada: eso lo hace la pantalla cuando se le pide.
 *
 * Lo que se da por revisado a mano («este mes Fulano no nos ha facturado,
 * y está bien») se recuerda en este navegador, por cuenta y por mes.
 */

import { InvoiceStatus, type Albaran, type Gasto, type Invoice } from './types';
import { periodoDelMes } from './albaranes/facturacionPeriodo';
import { porCliente, vencidas, type Deudor } from './recordatorios/textos';
import { calcularModelo420 } from './fiscal/atc/modelo420';
import { calcularModelo303 } from './fiscal/aeat/modelo303';
import { trimestreDeFecha } from './fiscal/FiscalCalculationService';
import { etiquetaTipo } from './documentos';

const DIA = 86_400_000;
const r2 = (n: number) => Math.round(n * 100) / 100;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** «2026-10» del mes en que cae una fecha. */
export const mesDe = (d: Date) => iso(d).slice(0, 7);

/** «2026-10» un número de meses antes (o después). */
export function mesMas(mes: string, delta: number): string {
  const [a, m] = mes.split('-').map(Number);
  return mesDe(new Date(a, m - 1 + delta, 1));
}

/** «Octubre de 2026». */
export function nombreMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  const t = new Date(a, m - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * El mes que se propone cerrar: en los diez primeros días, el anterior
 * —es cuando se cierra—; después, el que corre.
 */
export function mesPropuesto(hoy = new Date()): string {
  return hoy.getDate() <= 10 ? mesMas(mesDe(hoy), -1) : mesDe(hoy);
}

// ------------------------------------------------------------
// BORRADORES OLVIDADOS
// ------------------------------------------------------------

export interface BorradorOlvidado {
  id: string;
  origen: 'documento' | 'albaran';
  numero: string;
  tipo: string;
  tercero: string;
  fecha: string;
  total: number;
  /** Días desde que se tocó por última vez. */
  dias: number;
  /** Factura de venta: se emite desde su ficha, con el repaso de siempre. */
  esFacturaVenta: boolean;
  href: string;
}

export const DIAS_OLVIDADO = 3;

const diasDesde = (fecha: string | undefined, hoy: Date) =>
  fecha ? Math.floor((hoy.getTime() - new Date(fecha).getTime()) / DIA) : Infinity;

/**
 * Los borradores del mes (o de antes) que llevan más de tres días sin
 * tocarse. Lo de después del mes no es de este cierre.
 */
export function borradoresOlvidados(
  docs: readonly Invoice[],
  albaranes: readonly Albaran[],
  mes: string,
  hoy = new Date(),
  dias = DIAS_OLVIDADO,
): BorradorOlvidado[] {
  const { hasta } = periodoDelMes(mes);
  const salida: BorradorOlvidado[] = [];
  for (const d of docs) {
    if (d.status !== InvoiceStatus.BORRADOR || (d.issueDate ?? '') > hasta) continue;
    const sinTocar = diasDesde(d.updatedAt || d.createdAt, hoy);
    if (!(sinTocar > dias)) continue;
    const tipo = d.tipo ?? 'factura';
    const esFacturaVenta = tipo === 'factura' && (d.sentido ?? 'venta') === 'venta';
    salida.push({
      id: d.id, origen: 'documento', numero: d.number, tercero: d.clientName, fecha: d.issueDate, total: d.total,
      tipo: `${etiquetaTipo(tipo)}${d.sentido === 'compra' ? ' de compra' : ''}`,
      dias: Number.isFinite(sinTocar) ? sinTocar : dias + 1, esFacturaVenta,
      href: esFacturaVenta ? `/facturas/${d.id}` : `/documentos/${d.id}`,
    });
  }
  for (const a of albaranes) {
    if (a.status !== 'borrador' || (a.issueDate ?? '') > hasta) continue;
    const sinTocar = diasDesde(a.updatedAt || a.createdAt, hoy);
    if (!(sinTocar > dias)) continue;
    salida.push({
      id: a.id, origen: 'albaran', numero: a.number, tipo: 'Albarán', tercero: a.clientName, fecha: a.issueDate,
      total: a.total, dias: Number.isFinite(sinTocar) ? sinTocar : dias + 1, esFacturaVenta: false, href: `/albaranes/${a.id}`,
    });
  }
  return salida.sort((a, b) => b.dias - a.dias || a.fecha.localeCompare(b.fecha));
}

// ------------------------------------------------------------
// ALBARANES ENTREGADOS SIN FACTURAR
// ------------------------------------------------------------

export interface AlbaranPendiente {
  id: string;
  numero: string;
  cliente: string;
  fecha: string;
  total: number;
  /** Los de la pantalla de albaranes se facturan por periodo; los otros, desde su documento. */
  origen: 'albaran' | 'documento';
}

/** Lo entregado hasta fin de mes que sigue sin factura. */
export function albaranesSinFacturar(albaranes: readonly Albaran[], docs: readonly Invoice[], mes: string): AlbaranPendiente[] {
  const { hasta } = periodoDelMes(mes);
  return [
    ...albaranes
      .filter(a => a.status === 'expedido' && !a.invoiceId && a.issueDate <= hasta)
      .map(a => ({ id: a.id, numero: a.number, cliente: a.clientName, fecha: a.issueDate, total: a.total, origen: 'albaran' as const })),
    ...docs
      .filter(d => d.tipo === 'albaran' && (d.sentido ?? 'venta') === 'venta' && d.status === InvoiceStatus.EXPEDIDO && d.issueDate <= hasta)
      .map(d => ({ id: d.id, numero: d.number, cliente: d.clientName, fecha: d.issueDate, total: d.total, origen: 'documento' as const })),
  ].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// ------------------------------------------------------------
// VENCIDAS
// ------------------------------------------------------------

/**
 * Lo que está vencido y sin cobrar al cerrar el mes, por cliente. Se mira
 * a fin de mes, o a hoy si el mes aún no ha terminado.
 */
export function vencidasAlCierre(docs: readonly Invoice[], mes: string, hoy = new Date()): Deudor[] {
  const corteMes = iso(new Date(new Date(`${periodoDelMes(mes).hasta}T12:00:00`).getTime() + DIA));
  const corte = iso(hoy) < corteMes ? iso(hoy) : corteMes;
  return porCliente(vencidas(docs as Invoice[], corte));
}

// ------------------------------------------------------------
// BANCO
// ------------------------------------------------------------

export interface MovimientoDelBanco {
  id: string;
  fecha: string;
  importe: number;
  concepto: string;
  ignorado: boolean;
  conciliado: string | null;
}

/** Los movimientos del mes que no se han casado con nada ni se han apartado. */
export function movimientosPorConciliar<T extends MovimientoDelBanco>(movimientos: readonly T[], mes: string): T[] {
  const { desde, hasta } = periodoDelMes(mes);
  return movimientos.filter(m => m.fecha >= desde && m.fecha <= hasta && !m.ignorado && !m.conciliado);
}

// ------------------------------------------------------------
// PROVEEDORES HABITUALES QUE ESTE MES FALTAN
// ------------------------------------------------------------

export interface ProveedorQueFalta {
  clave: string;
  nombre: string;
  proveedorId?: string;
  /** En cuántos de los meses anteriores mirados hubo algo suyo. */
  meses: number;
  /** Lo que se le suele apuntar al mes, de media. */
  importeMedio: number;
  ultimaFecha: string;
}

const plano = (t?: string) => (t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Los proveedores que han facturado en al menos dos de los tres meses
 * anteriores y en éste todavía no. Cuentan los gastos y las facturas de
 * compra. Suele ser una factura que no ha llegado o que llegó y no se
 * apuntó; a veces, simplemente, un mes sin compras.
 */
export function proveedoresQueFaltan(
  gastos: readonly Gasto[],
  docs: readonly Invoice[],
  mes: string,
  opciones: { mesesAtras?: number; minimo?: number } = {},
): ProveedorQueFalta[] {
  const { mesesAtras = 3, minimo = 2 } = opciones;
  const anteriores = new Set(Array.from({ length: mesesAtras }, (_, i) => mesMas(mes, -(i + 1))));
  const registros: { clave: string; nombre: string; id?: string; mes: string; fecha: string; base: number }[] = [];
  for (const g of gastos) {
    const nombre = g.proveedorNombre?.trim();
    if (!g.proveedorId && !nombre) continue;
    registros.push({ clave: g.proveedorId ? `id:${g.proveedorId}` : `nombre:${plano(nombre)}`, nombre: nombre || 'Proveedor', id: g.proveedorId, mes: g.fecha.slice(0, 7), fecha: g.fecha, base: g.baseImponible || 0 });
  }
  for (const d of docs) {
    if (d.sentido !== 'compra' || (d.tipo ?? 'factura') !== 'factura' || d.status === InvoiceStatus.ANULADA || d.status === InvoiceStatus.BORRADOR) continue;
    if (!d.clientId && !d.clientName?.trim()) continue;
    registros.push({ clave: d.clientId ? `id:${d.clientId}` : `nombre:${plano(d.clientName)}`, nombre: d.clientName, id: d.clientId || undefined, mes: d.issueDate.slice(0, 7), fecha: d.issueDate, base: d.subtotal || 0 });
  }

  const porProveedor = new Map<string, { nombre: string; id?: string; meses: Set<string>; base: number; ultima: string; esteMes: boolean }>();
  for (const r of registros) {
    const p = porProveedor.get(r.clave) ?? { nombre: r.nombre, id: r.id, meses: new Set<string>(), base: 0, ultima: '', esteMes: false };
    if (r.mes === mes) p.esteMes = true;
    if (anteriores.has(r.mes)) { p.meses.add(r.mes); p.base += r.base; }
    if (r.fecha > p.ultima) { p.ultima = r.fecha; p.nombre = r.nombre; }
    porProveedor.set(r.clave, p);
  }

  return [...porProveedor.entries()]
    .filter(([, p]) => !p.esteMes && p.meses.size >= minimo)
    .map(([clave, p]) => ({ clave, nombre: p.nombre, proveedorId: p.id, meses: p.meses.size, importeMedio: r2(p.base / p.meses.size), ultimaFecha: p.ultima }))
    .sort((a, b) => b.importeMedio - a.importeMedio);
}

// ------------------------------------------------------------
// EL IMPUESTO DEL MES
// ------------------------------------------------------------

export interface ResumenImpuestoMes {
  impuesto: 'IGIC' | 'IVA';
  /** Lo repercutido por tipo (sin el 0 %). */
  porTipo: { tipo: number; base: number; cuota: number }[];
  repercutido: number;
  deducible: number;
  /** Repercutido − deducible: a ingresar si es positivo. */
  resultado: number;
  numFacturas: number;
  numGastos: number;
}

/**
 * El impuesto del mes con el mismo cálculo que el modelo trimestral: se le
 * pasan sólo las operaciones del mes. Es orientativo —se declara por
 * trimestre—, pero dice a fin de mes cuánto hay que ir apartando.
 */
export function resumenImpuestoMes(docs: readonly Invoice[], gastos: readonly Gasto[], mes: string, igic: boolean): ResumenImpuestoMes {
  const { desde, hasta } = periodoDelMes(mes);
  const enMes = (f?: string) => !!f && f >= desde && f <= hasta;
  const facturas = docs.filter(d => enMes(d.issueDate));
  const delMes = gastos.filter(g => enMes(g.fecha));
  const periodo = { ejercicio: Number(mes.slice(0, 4)), trimestre: trimestreDeFecha(desde) };

  if (igic) {
    const r = calcularModelo420({ facturas, gastos: delMes }, periodo);
    return {
      impuesto: 'IGIC', porTipo: r.repercutido, repercutido: r.totalRepercutido, deducible: r.totalDeducible,
      resultado: r2(r.totalRepercutido - r.totalDeducible), numFacturas: r.numFacturas, numGastos: r.numGastos,
    };
  }
  const r = calcularModelo303({ facturas, gastos: delMes }, periodo);
  return {
    impuesto: 'IVA', porTipo: r.devengado.filter(d => d.tipo > 0), repercutido: r.cuotaDevengada, deducible: r.cuotaDeducible,
    resultado: r.resultadoRegimenGeneral, numFacturas: r.numFacturas, numGastos: r.numGastos,
  };
}

// ------------------------------------------------------------
// LA LISTA
// ------------------------------------------------------------

export type IdPunto = 'borradores' | 'albaranes' | 'vencidas' | 'banco' | 'gastos' | 'impuesto';

/** Los puntos que se pueden dar por buenos sin hacer nada (un mes sin luz, una deuda pactada). */
export const REVISABLES: readonly IdPunto[] = ['vencidas', 'banco', 'gastos', 'impuesto'];

export type EstadoPunto = 'listo' | 'pendiente' | 'sin_datos';

export interface PuntoCierre {
  id: IdPunto;
  estado: EstadoPunto;
  /** Cuántas cosas quedan (0 si está listo por sí mismo). */
  cuenta: number;
  /** Se ha dado por revisado a mano. */
  revisado: boolean;
}

export interface Cierre {
  puntos: PuntoCierre[];
  hechos: number;
  /** Los puntos que cuentan: sin los que no tienen datos (no hay banco). */
  total: number;
  /** 0–100. */
  progreso: number;
}

/**
 * La lista con su estado. El impuesto no tiene «cuenta»: está listo cuando
 * alguien lo ha mirado. El banco, sin banco conectado, no cuenta.
 */
export function montarCierre(c: {
  borradores: number;
  albaranes: number;
  vencidas: number;
  /** null: no hay banco conectado. */
  banco: number | null;
  gastos: number;
  revisados: ReadonlySet<IdPunto>;
}): Cierre {
  const punto = (id: IdPunto, cuenta: number | null): PuntoCierre => {
    const revisado = REVISABLES.includes(id) && c.revisados.has(id);
    if (cuenta === null) return { id, estado: 'sin_datos', cuenta: 0, revisado: false };
    return { id, cuenta, revisado, estado: cuenta === 0 || revisado ? 'listo' : 'pendiente' };
  };
  const puntos = [
    punto('borradores', c.borradores),
    punto('albaranes', c.albaranes),
    punto('vencidas', c.vencidas),
    punto('banco', c.banco),
    punto('gastos', c.gastos),
    // El impuesto siempre queda por mirar hasta que alguien lo da por visto.
    { ...punto('impuesto', 1), cuenta: 0 },
  ];
  const cuentan = puntos.filter(p => p.estado !== 'sin_datos');
  const hechos = cuentan.filter(p => p.estado === 'listo').length;
  return { puntos, hechos, total: cuentan.length, progreso: cuentan.length ? Math.round((hechos / cuentan.length) * 100) : 0 };
}

// ------------------------------------------------------------
// LO DADO POR REVISADO, EN ESTE NAVEGADOR
// ------------------------------------------------------------

export interface AlmacenTexto {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
}

function almacenDelNavegador(): AlmacenTexto | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export const claveRevisados = (cuenta: string | null) => `klima-cierre:${cuenta ?? 'sin-sesion'}`;

type Guardado = Record<string, IdPunto[]>;

function leerTodo(cuenta: string | null, almacen: AlmacenTexto | null): Guardado {
  try {
    const v = JSON.parse(almacen?.getItem(claveRevisados(cuenta)) ?? '{}');
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    const limpio: Guardado = {};
    for (const [mes, ids] of Object.entries(v)) {
      if (/^\d{4}-\d{2}$/.test(mes) && Array.isArray(ids)) limpio[mes] = ids.filter((x): x is IdPunto => REVISABLES.includes(x as IdPunto));
    }
    return limpio;
  } catch {
    return {};
  }
}

/** Lo que se dio por revisado ese mes. Sin almacenamiento, nada. */
export function leerRevisados(cuenta: string | null, mes: string, almacen: AlmacenTexto | null = almacenDelNavegador()): Set<IdPunto> {
  return new Set(leerTodo(cuenta, almacen)[mes] ?? []);
}

/** Da un punto por revisado (o lo quita). Se guardan los últimos doce meses. */
export function marcarRevisado(
  cuenta: string | null, mes: string, id: IdPunto, revisado: boolean,
  almacen: AlmacenTexto | null = almacenDelNavegador(),
): Set<IdPunto> {
  const todo = leerTodo(cuenta, almacen);
  const ids = new Set(todo[mes] ?? []);
  if (revisado && REVISABLES.includes(id)) ids.add(id); else ids.delete(id);
  todo[mes] = [...ids];
  const recientes = Object.fromEntries(Object.entries(todo).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12));
  try {
    almacen?.setItem(claveRevisados(cuenta), JSON.stringify(recientes));
  } catch {
    // Lleno o bloqueado: se queda en pantalla y no se recuerda.
  }
  return ids;
}

/** Los meses que se ofrecen: el que corre y los once anteriores. */
export function mesesElegibles(hoy = new Date()): string[] {
  return Array.from({ length: 12 }, (_, i) => mesMas(mesDe(hoy), -i));
}
