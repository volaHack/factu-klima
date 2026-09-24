/**
 * CONCILIACIÓN BANCARIA
 *
 * Empareja cada movimiento del banco con lo que ya está en el programa:
 *
 * - lo que entra, con facturas de venta pendientes de cobro;
 * - lo que sale, con facturas de compra pendientes de pago o con gastos ya
 *   apuntados.
 *
 * Aquí sólo se PROPONE. Confirmar crea el cobro o el pago (que marca la
 * factura y genera su asiento) o deja el gasto marcado; eso lo hace la
 * pantalla con `storage.ts`. Lo conciliado se reconoce después por una
 * marca en las notas del cobro, del pago o del gasto: así vale en cualquier
 * dispositivo y sin tabla nueva en la base de datos.
 */

import type { CobroPago, Gasto, Invoice } from '../types';
import { totalAPagar } from '../retenciones';
import type { MovimientoBanco } from './extracto';

const r2 = (n: number) => Math.round(n * 100) / 100;

export const marcaBanco = (movId: string) => `[banco:${movId}]`;
const RE_MARCA = /\[banco:([a-z0-9]+)\]/g;

/** Los movimientos ya conciliados, por las marcas en las notas. */
export function movimientosConciliados(cobrosPagos: CobroPago[], gastos: Gasto[]): Map<string, string> {
  const hechos = new Map<string, string>();
  for (const c of cobrosPagos) {
    for (const m of (c.notas ?? '').matchAll(RE_MARCA)) hechos.set(m[1], `${c.tipo === 'cobro' ? 'Cobro' : 'Pago'} ${c.number}`);
  }
  for (const g of gastos) {
    for (const m of (g.notas ?? '').matchAll(RE_MARCA)) hechos.set(m[1], `Gasto: ${g.concepto}`);
  }
  return hechos;
}

export interface FacturaAplicada {
  factura: Invoice;
  importe: number;
}

export type Propuesta =
  | { tipo: 'cobro' | 'pago'; facturas: FacturaAplicada[]; confianza: number; motivo: string }
  | { tipo: 'gasto'; gasto: Gasto; confianza: number; motivo: string };

export interface Linea {
  mov: MovimientoBanco;
  /** Conciliado antes: el cobro, pago o gasto con el que se casó. */
  hecho?: string;
  ignorado?: boolean;
  /** La mejor propuesta y las alternativas, de más a menos probable. */
  propuestas: Propuesta[];
}

const ESTADOS_PENDIENTES = new Set(['emitida', 'pendiente', 'vencida', 'parcial']);

/** Lo que falta por cobrar o pagar de una factura, ya descontada la retención. */
export function pendienteDe(f: Invoice): number {
  return r2(totalAPagar(f.total, f.subtotal, f.retencionPct) - (f.paidAmount || 0));
}

export function facturasPendientes(facturas: Invoice[], sentido: 'venta' | 'compra'): Invoice[] {
  return facturas.filter(f =>
    (sentido === 'compra' ? f.sentido === 'compra' : f.sentido !== 'compra') &&
    (!f.tipo || f.tipo === 'factura') &&
    !f.cancelledAt &&
    ESTADOS_PENDIENTES.has(String(f.status)) &&
    pendienteDe(f) > 0.009,
  );
}

const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const compacto = (s: string) => normal(s).replace(/[^A-Z0-9]/g, '');

const PALABRAS_VACIAS = new Set([
  'SL', 'SA', 'SLU', 'SAU', 'SLL', 'SCOOP', 'CB', 'SC', 'DE', 'DEL', 'LA', 'LAS', 'LOS', 'EL', 'Y', 'E', 'EN',
  'SOCIEDAD', 'LIMITADA', 'ANONIMA', 'EMPRESA', 'SERVICIOS', 'GRUPO', 'HNOS', 'HERMANOS', 'CIA',
]);

/** Las palabras de un nombre que sirven para reconocerlo en un concepto de banco. */
function palabrasDe(nombre: string | undefined): string[] {
  if (!nombre) return [];
  return normal(nombre).split(/[^A-Z0-9]+/).filter(p => p.length >= 4 && !PALABRAS_VACIAS.has(p));
}

function pistas(concepto: string, nombre?: string, nif?: string, numero?: string): { puntos: number; por: string[] } {
  const c = normal(concepto);
  const cc = compacto(concepto);
  let puntos = 0;
  const por: string[] = [];
  if (numero) {
    const n = compacto(numero);
    // El número completo, o su parte final si es largo (FAC-2025-0012 → 20250012, 0012 no basta).
    if (n.length >= 4 && (cc.includes(n) || (n.length > 8 && cc.includes(n.slice(-8))))) {
      puntos += 40; por.push('el número de factura');
    }
  }
  if (nif && nif.length >= 8 && cc.includes(compacto(nif))) { puntos += 25; por.push('el NIF'); }
  const palabras = palabrasDe(nombre);
  const coinciden = palabras.filter(p => c.includes(p));
  if (coinciden.length) {
    puntos += Math.min(25, 12 * coinciden.length);
    por.push('el nombre');
  }
  return { puntos, por };
}

function dias(a: string, b: string): number {
  return Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000);
}

function motivo(base: string, por: string[]): string {
  return por.length ? `${base}; coinciden ${por.join(', ')}` : base;
}

function propuestasFacturas(mov: MovimientoBanco, pendientes: Invoice[], tipo: 'cobro' | 'pago'): Propuesta[] {
  const importe = Math.abs(mov.importe);
  const salida: Propuesta[] = [];

  for (const f of pendientes) {
    const pend = pendienteDe(f);
    const exacto = Math.abs(pend - importe) <= 0.01;
    const p = pistas(mov.concepto + ' ' + (mov.referencia ?? ''), f.clientName, f.clientNif, f.number);
    const tieneNumero = p.por.includes('el número de factura');
    // Sin el importe exacto sólo vale si el concepto nombra la factura y es
    // un cobro parcial (no más de lo que falta).
    if (!exacto && !(tieneNumero && importe < pend)) continue;
    let confianza = (exacto ? 50 : 20) + p.puntos;
    const d = dias(mov.fecha, f.issueDate);
    if (d < 0) confianza -= 30; // cobrada antes de emitirla: raro
    else if (d > 365) confianza -= 15;
    else if (f.dueDate && Math.abs(dias(mov.fecha, f.dueDate)) <= 10) confianza += 5;
    if (confianza < 40) continue;
    salida.push({
      tipo,
      facturas: [{ factura: f, importe: exacto ? pend : r2(importe) }],
      confianza: Math.min(100, confianza),
      motivo: motivo(exacto ? 'Mismo importe que lo pendiente' : 'Cobro parcial de la factura', p.por),
    });
  }

  // Un solo movimiento que liquida varias facturas del mismo tercero.
  const porTercero = new Map<string, Invoice[]>();
  for (const f of pendientes) {
    const k = f.clientId || f.clientNif || f.clientName;
    if (!k) continue;
    porTercero.set(k, [...(porTercero.get(k) ?? []), f]);
  }
  for (const lista of porTercero.values()) {
    if (lista.length < 2 || lista.length > 6) continue;
    const suma = r2(lista.reduce((t, f) => t + pendienteDe(f), 0));
    if (Math.abs(suma - importe) > 0.01) continue;
    const p = pistas(mov.concepto, lista[0].clientName, lista[0].clientNif);
    const confianza = 40 + p.puntos;
    if (confianza < 40) continue;
    salida.push({
      tipo,
      facturas: lista.map(f => ({ factura: f, importe: pendienteDe(f) })),
      confianza: Math.min(100, confianza),
      motivo: motivo(`Suma de sus ${lista.length} facturas pendientes`, p.por),
    });
  }
  return salida;
}

function propuestasGastos(mov: MovimientoBanco, gastos: Gasto[]): Propuesta[] {
  const importe = Math.abs(mov.importe);
  const salida: Propuesta[] = [];
  for (const g of gastos) {
    if (Math.abs(g.total - importe) > 0.01) continue;
    const d = Math.abs(dias(mov.fecha, g.fecha));
    if (d > 10) continue;
    const p = pistas(mov.concepto, g.proveedorNombre || g.concepto);
    const confianza = 60 + (d === 0 ? 15 : d <= 3 ? 8 : 0) + p.puntos;
    salida.push({ tipo: 'gasto', gasto: g, confianza: Math.min(100, confianza), motivo: motivo('Gasto ya apuntado por el mismo importe', p.por) });
  }
  return salida;
}

export interface DatosConciliacion {
  facturas: Invoice[];
  gastos: Gasto[];
  cobrosPagos: CobroPago[];
  ignorados?: Set<string>;
}

/**
 * Las propuestas de todo el extracto. Cada factura y cada gasto se proponen
 * a un solo movimiento: el que mejor encaja se lo queda, y los demás pasan
 * a su siguiente opción.
 */
export function conciliar(movs: MovimientoBanco[], d: DatosConciliacion): Linea[] {
  const hechos = movimientosConciliados(d.cobrosPagos, d.gastos);
  const ventas = facturasPendientes(d.facturas, 'venta');
  const compras = facturasPendientes(d.facturas, 'compra');
  const gastosLibres = d.gastos.filter(g => !(g.notas ?? '').includes('[banco:'));

  const lineas: Linea[] = movs.map(mov => {
    if (hechos.has(mov.id)) return { mov, hecho: hechos.get(mov.id), propuestas: [] };
    const ignorado = d.ignorados?.has(mov.id);
    const propuestas = mov.importe > 0
      ? propuestasFacturas(mov, ventas, 'cobro')
      : [...propuestasFacturas(mov, compras, 'pago'), ...propuestasGastos(mov, gastosLibres)];
    propuestas.sort((a, b) => b.confianza - a.confianza);
    return { mov, ignorado, propuestas };
  });

  // Reparto: de la propuesta más segura a la menos, sin repetir documento.
  const usados = new Set<string>();
  const claves = (p: Propuesta) => (p.tipo === 'gasto' ? [`g:${p.gasto.id}`] : p.facturas.map(x => `f:${x.factura.id}`));
  const todas = lineas.flatMap((l, i) => (l.ignorado ? [] : l.propuestas.map(p => ({ i, p }))))
    .sort((a, b) => b.p.confianza - a.p.confianza);
  const elegida = new Map<number, Propuesta>();
  for (const { i, p } of todas) {
    if (elegida.has(i)) continue;
    const k = claves(p);
    if (k.some(x => usados.has(x))) continue;
    k.forEach(x => usados.add(x));
    elegida.set(i, p);
  }
  return lineas.map((l, i) => {
    const e = elegida.get(i);
    if (!e) return { ...l, propuestas: l.propuestas.filter(p => !claves(p).some(x => usados.has(x))) };
    return { ...l, propuestas: [e, ...l.propuestas.filter(p => p !== e && !claves(p).some(x => usados.has(x)))] };
  });
}

/** Seguro = muy probable y sin otra opción que se le acerque. */
export function esSegura(l: Linea): boolean {
  const [a, b] = l.propuestas;
  return !!a && a.confianza >= 80 && (!b || b.confianza <= a.confianza - 20);
}

export interface Resumen {
  total: number;
  conciliados: number;
  seguras: number;
  conPropuesta: number;
  sinPareja: number;
  ignorados: number;
  entradas: number;
  salidas: number;
}

export function resumen(lineas: Linea[]): Resumen {
  const r: Resumen = { total: lineas.length, conciliados: 0, seguras: 0, conPropuesta: 0, sinPareja: 0, ignorados: 0, entradas: 0, salidas: 0 };
  for (const l of lineas) {
    if (l.mov.importe > 0) r.entradas = r2(r.entradas + l.mov.importe); else r.salidas = r2(r.salidas - l.mov.importe);
    if (l.hecho) r.conciliados++;
    else if (l.ignorado) r.ignorados++;
    else if (esSegura(l)) r.seguras++;
    else if (l.propuestas.length) r.conPropuesta++;
    else r.sinPareja++;
  }
  return r;
}
