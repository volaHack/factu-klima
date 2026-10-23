'use client';

/**
 * HISTORIAL DEL PROGRAMA ANTERIOR
 *
 * Lo que una empresa emitió en su programa de antes (ISECAN…), guardado en
 * `historico_documentos` (migración 068) para consultarlo en la ficha del
 * cliente o del proveedor. No son facturas de Klima: no pasan por
 * Veri*Factu ni cuentan en los modelos ni en la contabilidad.
 */

import { createClient } from './supabase/client';
import { todasLasFilas } from './porTandas';
import { faltaLaTabla } from './recordatorios/filas';

export type TipoHistorico = 'factura_venta' | 'albaran_venta' | 'pedido_venta' | 'factura_compra' | 'albaran_compra';

export interface DocumentoHistorico {
  id: string;
  origen: string;
  tipo: TipoHistorico;
  serie: string;
  numero: string;
  fecha: string | null;
  /** La ficha de aquí; sin ella, el código que tenía en el otro programa. */
  clientId: string | null;
  codigoTercero: string | null;
  base: number;
  impuestos: number;
  total: number;
  bases: { tipo: number; base: number; cuota: number }[];
  formaPago: string | null;
  observaciones: string | null;
  pasaA: string[];
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export function documentoDeFila(f: any): DocumentoHistorico {
  return {
    id: f.id,
    origen: f.origen,
    tipo: f.tipo,
    serie: f.serie ?? '',
    numero: f.numero,
    fecha: f.fecha ?? null,
    clientId: f.client_id ?? null,
    codigoTercero: f.codigo_tercero ?? null,
    base: Number(f.base) || 0,
    impuestos: Number(f.impuestos) || 0,
    total: Number(f.total) || 0,
    bases: Array.isArray(f.bases) ? f.bases : [],
    formaPago: f.forma_pago ?? null,
    observaciones: f.observaciones ?? null,
    pasaA: f.pasa_a ?? [],
  };
}

/** Los documentos de una ficha, el más reciente primero. Sin la tabla (migración 068), ninguno. */
export async function getHistoricoDeFicha(clientId: string): Promise<DocumentoHistorico[]> {
  const db = createClient();
  const { data, error } = await todasLasFilas((desde, hasta) => db.from('historico_documentos').select('*')
    .eq('client_id', clientId)
    .order('fecha', { ascending: false, nullsFirst: false }).order('id').range(desde, hasta));
  if (error) {
    if (faltaLaTabla(error)) return [];
    throw new Error((error as { message: string }).message);
  }
  return (data ?? []).map(documentoDeFila);
}

export const NOMBRE_TIPO: Record<TipoHistorico, string> = {
  factura_venta: 'Factura',
  albaran_venta: 'Albarán',
  pedido_venta: 'Pedido',
  factura_compra: 'Factura',
  albaran_compra: 'Albarán',
};

/** En una lista que mezcla ventas y compras, la compra se dice. */
export const ETIQUETA_TIPO: Record<TipoHistorico, string> = {
  factura_venta: 'Factura',
  albaran_venta: 'Albarán',
  pedido_venta: 'Pedido',
  factura_compra: 'Factura de compra',
  albaran_compra: 'Albarán de compra',
};

export const NOMBRE_ORIGEN: Record<string, string> = { isecan: 'ISECAN' };

// ------------------------------------------------------------
// La pantalla del historial entero
// ------------------------------------------------------------

/** Una fila de `resumen_historico()` (migración 069): un tipo en un año. */
export interface FilaResumenHistorico {
  anio: number | null;
  tipo: TipoHistorico;
  documentos: number;
  total: number;
  pendientes: number;
  totalPendiente: number;
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export function filaResumenDe(f: any): FilaResumenHistorico {
  return {
    anio: f.anio == null ? null : Number(f.anio),
    tipo: f.tipo,
    documentos: Number(f.documentos) || 0,
    total: Number(f.total) || 0,
    pendientes: Number(f.pendientes) || 0,
    totalPendiente: Number(f.total_pendiente) || 0,
  };
}

/** Lo sumado por la base de datos: diecisiete mil documentos no caben en un teléfono. */
export async function getResumenHistorico(): Promise<FilaResumenHistorico[]> {
  const { data, error } = await createClient().rpc('resumen_historico');
  if (error) {
    if (faltaLaTabla(error) || /resumen_historico/.test(error.message ?? '')) return [];
    throw new Error(error.message);
  }
  return ((data ?? []) as unknown[]).map(filaResumenDe);
}

/** ¿Hay historial de otro programa? Devuelve de cuál, para el menú. */
export async function origenDelHistorico(): Promise<string | null> {
  const { data, error } = await createClient().from('historico_documentos').select('origen').limit(1);
  if (error) return null;
  return data?.[0]?.origen ?? null;
}

/** Compras apuntadas sin importe: en ISECAN muchas se guardaban a 0 €. */
export async function comprasSinImporte(): Promise<number> {
  const { count, error } = await createClient().from('historico_documentos').select('id', { count: 'exact', head: true })
    .in('tipo', ['factura_compra', 'albaran_compra']).eq('total', 0);
  return error ? 0 : count ?? 0;
}

export interface FiltroHistorico {
  /** Lo que se escribe en el buscador: número, código o texto de las observaciones. */
  texto?: string;
  /** Fichas cuyo nombre, NIF o código casa con el texto (se buscan aquí, en el teléfono). */
  clientIds?: string[];
  tipo?: TipoHistorico | '';
  anio?: string;
  soloPendientes?: boolean;
}

/** Fichas que se mandan como mucho en una búsqueda: van en la dirección de la petición. */
export const FICHAS_POR_BUSQUEDA = 100;

/** En minúsculas y sin tildes: «García» se encuentra escribiendo «garcia». */
const plano = (t: string) => Array.from(t.toLowerCase().normalize('NFD'))
  .filter(c => c.charCodeAt(0) < 0x300 || c.charCodeAt(0) > 0x36f).join('');

/** Las fichas cuyo nombre, nombre comercial, NIF o código contiene el texto. */
export function fichasQueCasan(
  fichas: readonly { id: string; businessName?: string; tradeName?: string; nif?: string; codigo?: string }[],
  texto: string,
): string[] {
  const t = plano(texto.trim());
  if (t.length < 2) return [];
  return fichas
    .filter(f => [f.businessName, f.tradeName, f.nif, f.codigo].some(v => v && plano(v).includes(t)))
    .map(f => f.id);
}

/**
 * Los caracteres que en un filtro `or` de PostgREST separan o agrupan
 * condiciones: escritos en el buscador, partirían la petición.
 */
export function textoParaFiltro(texto: string): string {
  return texto.replace(/[,()*%\\"]/g, ' ').trim();
}

/** Las condiciones `or` del buscador; vacío si no hay nada que buscar. */
export function condicionesDeBusqueda(texto: string, clientIds: readonly string[] = []): string[] {
  const t = textoParaFiltro(texto);
  const ids = clientIds.slice(0, FICHAS_POR_BUSQUEDA);
  if (!t && ids.length === 0) return [];
  const condiciones: string[] = [];
  if (t) {
    // «T24/100269» es como se ve un pedido, pero el número guardado es 100269.
    const numero = t.includes('/') ? t.slice(t.lastIndexOf('/') + 1).trim() || t : t;
    condiciones.push(`numero.ilike.*${numero}*`, `codigo_tercero.ilike.*${t}*`, `observaciones.ilike.*${t}*`);
  }
  if (ids.length) condiciones.push(`client_id.in.(${ids.join(',')})`);
  return condiciones;
}

/** Una página de documentos con los filtros puestos, el más reciente primero. */
export async function buscarHistorico(
  filtro: FiltroHistorico, desde: number, cuantos: number,
): Promise<{ docs: DocumentoHistorico[]; total: number }> {
  let q = createClient().from('historico_documentos').select('*', { count: 'exact' });
  if (filtro.tipo) q = q.eq('tipo', filtro.tipo);
  if (filtro.anio) q = q.gte('fecha', `${filtro.anio}-01-01`).lte('fecha', `${filtro.anio}-12-31`);
  if (filtro.soloPendientes) q = q.not('tipo', 'in', '(factura_venta,factura_compra)').eq('pasa_a', '{}');
  const condiciones = condicionesDeBusqueda(filtro.texto ?? '', filtro.clientIds);
  if (condiciones.length) q = q.or(condiciones.join(','));
  const { data, error, count } = await q
    .order('fecha', { ascending: false, nullsFirst: false }).order('numero', { ascending: false }).order('id')
    .range(desde, desde + cuantos - 1);
  if (error) {
    if (faltaLaTabla(error)) return { docs: [], total: 0 };
    throw new Error(error.message);
  }
  return { docs: (data ?? []).map(documentoDeFila), total: count ?? 0 };
}

export interface ResumenGeneral {
  ventas: { facturas: number; total: number };
  compras: { facturas: number; total: number };
  albaranesSinFactura: { documentos: number; total: number };
  pedidosSinServir: { documentos: number; total: number };
  /** Por año, del más reciente al más antiguo; los documentos sin fecha, al final. */
  anios: { anio: number | null; ventas: number; facturado: number; compras: number; comprado: number }[];
}

export function resumenGeneral(filas: readonly FilaResumenHistorico[]): ResumenGeneral {
  const r: ResumenGeneral = {
    ventas: { facturas: 0, total: 0 },
    compras: { facturas: 0, total: 0 },
    albaranesSinFactura: { documentos: 0, total: 0 },
    pedidosSinServir: { documentos: 0, total: 0 },
    anios: [],
  };
  const porAnio = new Map<number | null, ResumenGeneral['anios'][number]>();
  const delAnio = (anio: number | null) => {
    let a = porAnio.get(anio);
    if (!a) { a = { anio, ventas: 0, facturado: 0, compras: 0, comprado: 0 }; porAnio.set(anio, a); }
    return a;
  };
  for (const f of filas) {
    if (f.tipo === 'factura_venta') {
      r.ventas.facturas += f.documentos;
      r.ventas.total = r2(r.ventas.total + f.total);
      const a = delAnio(f.anio); a.ventas += f.documentos; a.facturado = r2(a.facturado + f.total);
    } else if (f.tipo === 'factura_compra') {
      r.compras.facturas += f.documentos;
      r.compras.total = r2(r.compras.total + f.total);
      const a = delAnio(f.anio); a.compras += f.documentos; a.comprado = r2(a.comprado + f.total);
    } else if (f.tipo === 'albaran_venta') {
      r.albaranesSinFactura.documentos += f.pendientes;
      r.albaranesSinFactura.total = r2(r.albaranesSinFactura.total + f.totalPendiente);
    } else if (f.tipo === 'pedido_venta') {
      r.pedidosSinServir.documentos += f.pendientes;
      r.pedidosSinServir.total = r2(r.pedidosSinServir.total + f.totalPendiente);
    }
  }
  r.anios = [...porAnio.values()].sort((a, b) => (b.anio ?? -1) - (a.anio ?? -1));
  return r;
}

/**
 * El número como lo conocían: ISECAN ya mete el año en el número de las
 * facturas (serie 24, número 24000001), pero no en el de los pedidos
 * (serie T24, número 3203).
 */
export function numeroVisible(d: Pick<DocumentoHistorico, 'serie' | 'numero'>): string {
  if (!d.serie || d.numero.startsWith(d.serie)) return d.numero;
  return `${d.serie.toUpperCase()}/${d.numero}`;
}

/** Un albarán o pedido que no llegó a ningún documento posterior. */
export function quedoPendiente(d: Pick<DocumentoHistorico, 'tipo' | 'pasaA'>): boolean {
  return d.tipo !== 'factura_venta' && d.tipo !== 'factura_compra' && d.pasaA.length === 0;
}

export interface AnioHistorico {
  anio: string;
  facturas: number;
  total: number;
}

export interface ResumenHistorico {
  /** Facturas por año, del más reciente al más antiguo. */
  anios: AnioHistorico[];
  ultimaFactura: string | null;
  pendientes: { albaranes: number; pedidos: number; total: number };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function resumenHistorico(docs: readonly DocumentoHistorico[]): ResumenHistorico {
  const porAnio = new Map<string, AnioHistorico>();
  let ultimaFactura: string | null = null;
  const pendientes = { albaranes: 0, pedidos: 0, total: 0 };
  for (const d of docs) {
    if (d.tipo === 'factura_venta' || d.tipo === 'factura_compra') {
      const anio = d.fecha?.slice(0, 4) ?? 'Sin fecha';
      const a = porAnio.get(anio) ?? { anio, facturas: 0, total: 0 };
      a.facturas++;
      a.total = r2(a.total + d.total);
      porAnio.set(anio, a);
      if (d.fecha && (!ultimaFactura || d.fecha > ultimaFactura)) ultimaFactura = d.fecha;
    } else if (quedoPendiente(d)) {
      if (d.tipo === 'pedido_venta') pendientes.pedidos++;
      else pendientes.albaranes++;
      pendientes.total = r2(pendientes.total + d.total);
    }
  }
  const anios = [...porAnio.values()].sort((a, b) => b.anio.localeCompare(a.anio));
  return { anios, ultimaFactura, pendientes };
}
