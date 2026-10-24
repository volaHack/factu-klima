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

export type TipoHistorico =
  'factura_venta' | 'albaran_venta' | 'pedido_venta' | 'presupuesto_venta' | 'factura_compra' | 'albaran_compra';

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

/**
 * Quién mira. Las listas son las de su propia cuenta, como las de los
 * documentos de Klima: una gestoría también puede leer el historial de las
 * empresas que lleva (política de la 068), y no debe salirle mezclado.
 */
async function cuentaDeLaSesion(): Promise<string | null> {
  try {
    const { data } = await createClient().auth.getSession();
    return data?.session?.user?.id ?? null;
  } catch {
    return null;
  }
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
  presupuesto_venta: 'Presupuesto',
  factura_compra: 'Factura',
  albaran_compra: 'Albarán',
};

/** En una lista que mezcla ventas y compras, la compra se dice. */
export const ETIQUETA_TIPO: Record<TipoHistorico, string> = {
  factura_venta: 'Factura',
  albaran_venta: 'Albarán',
  pedido_venta: 'Pedido',
  presupuesto_venta: 'Presupuesto',
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
  let q = createClient().from('historico_documentos').select('origen');
  const cuenta = await cuentaDeLaSesion();
  if (cuenta) q = q.eq('user_id', cuenta);
  const { data, error } = await q.limit(1);
  if (error) return null;
  return data?.[0]?.origen ?? null;
}

/** Compras apuntadas sin importe: en ISECAN muchas se guardaban a 0 €. */
export async function comprasSinImporte(): Promise<number> {
  let q = createClient().from('historico_documentos').select('id', { count: 'exact', head: true });
  const cuenta = await cuentaDeLaSesion();
  if (cuenta) q = q.eq('user_id', cuenta);
  const { count, error } = await q.in('tipo', ['factura_compra', 'albaran_compra']).eq('total', 0);
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
  const cuenta = await cuentaDeLaSesion();
  if (cuenta) q = q.eq('user_id', cuenta);
  if (filtro.tipo) q = q.eq('tipo', filtro.tipo);
  if (filtro.anio) q = q.gte('fecha', `${filtro.anio}-01-01`).lte('fecha', `${filtro.anio}-12-31`);
  if (filtro.soloPendientes) q = q.not('tipo', 'in', '(factura_venta,factura_compra,presupuesto_venta)').eq('pasa_a', '{}');
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
  presupuestos: { documentos: number; total: number };
  /** Por año, del más reciente al más antiguo; los documentos sin fecha, al final. */
  anios: { anio: number | null; ventas: number; facturado: number; compras: number; comprado: number }[];
}

export function resumenGeneral(filas: readonly FilaResumenHistorico[]): ResumenGeneral {
  const r: ResumenGeneral = {
    ventas: { facturas: 0, total: 0 },
    compras: { facturas: 0, total: 0 },
    albaranesSinFactura: { documentos: 0, total: 0 },
    pedidosSinServir: { documentos: 0, total: 0 },
    presupuestos: { documentos: 0, total: 0 },
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
    } else if (f.tipo === 'presupuesto_venta') {
      r.presupuestos.documentos += f.documentos;
      r.presupuestos.total = r2(r.presupuestos.total + f.total);
    }
  }
  r.anios = [...porAnio.values()].sort((a, b) => (b.anio ?? -1) - (a.anio ?? -1));
  return r;
}

/**
 * El número como lo conocían: ISECAN ya mete el año en el número de las
 * facturas (serie 24, número 24000001), pero no en el de los albaranes ni
 * en el de los pedidos (serie T24, número 3203). Que empiece por la serie
 * no basta: el albarán 25 de la serie 25 es «25/25», no «25».
 */
export function numeroVisible(d: Pick<DocumentoHistorico, 'serie' | 'numero'>): string {
  if (!d.serie || (d.numero.startsWith(d.serie) && d.numero.length - d.serie.length >= CIFRAS_TRAS_EL_ANIO)) return d.numero;
  return `${d.serie.toUpperCase()}/${d.numero}`;
}

/** Las facturas llevan seis cifras tras el año; con cuatro ya no puede ser un albarán (llegan a tres). */
const CIFRAS_TRAS_EL_ANIO = 4;

/**
 * Un albarán o pedido que no llegó a ningún documento posterior. Un
 * presupuesto no: que no se aceptara no deja nada sin facturar.
 */
export function quedoPendiente(d: Pick<DocumentoHistorico, 'tipo' | 'pasaA'>): boolean {
  return (d.tipo === 'albaran_venta' || d.tipo === 'albaran_compra' || d.tipo === 'pedido_venta') && d.pasaA.length === 0;
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

// ------------------------------------------------------------
// En la lista de Documentos
// ------------------------------------------------------------

/**
 * Un documento del historial con las columnas de la lista de Documentos
 * (vista `historico_listado`, migración 070).
 */
export interface FilaListadoHistorico {
  id: string;
  origen: string;
  tipo: 'factura' | 'albaran' | 'pedido' | 'presupuesto';
  sentido: 'venta' | 'compra';
  /** Como se conocía: «T24/100269» en los pedidos. */
  numero: string;
  fecha: string | null;
  clientId: string | null;
  cliente: string | null;
  clienteNif: string | null;
  codigoTercero: string | null;
  total: number;
  /** emitida (facturas), facturado (pasó a otro documento) o pendiente. */
  estado: 'emitida' | 'facturado' | 'pendiente';
  observaciones: string | null;
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export function filaListadoDe(f: any): FilaListadoHistorico {
  return {
    id: f.id,
    origen: f.origen,
    tipo: f.tipo,
    sentido: f.sentido,
    numero: f.numero,
    fecha: f.fecha ?? null,
    clientId: f.client_id ?? null,
    cliente: f.cliente ?? null,
    clienteNif: f.cliente_nif ?? null,
    codigoTercero: f.codigo_tercero ?? null,
    total: Number(f.total) || 0,
    estado: f.estado,
    observaciones: f.observaciones ?? null,
  };
}

/** Lo que dice la columna Estado de un documento del historial. */
export function estadoDeHistorico(d: Pick<FilaListadoHistorico, 'tipo' | 'estado'>): string {
  if (d.estado === 'emitida') return d.tipo === 'presupuesto' ? 'Emitido' : 'Emitida';
  if (d.tipo === 'pedido') return d.estado === 'facturado' ? 'Servido' : 'Sin servir';
  return d.estado === 'facturado' ? 'Facturado' : 'Sin facturar';
}

/** El tipo y el estado de la lista de Documentos, como los calcula la vista (070). */
export function tipoYEstado(d: Pick<DocumentoHistorico, 'tipo' | 'pasaA'>): Pick<FilaListadoHistorico, 'tipo' | 'estado'> {
  const tipo = d.tipo.startsWith('factura') ? 'factura' : d.tipo.startsWith('albaran') ? 'albaran'
    : d.tipo.startsWith('presupuesto') ? 'presupuesto' : 'pedido';
  const estado = tipo === 'factura' || tipo === 'presupuesto' ? 'emitida' : d.pasaA.length > 0 ? 'facturado' : 'pendiente';
  return { tipo, estado };
}

/** Los desplegables de Documentos; «todos» es no filtrar. */
export interface FiltroDocumentos {
  tipo: string;
  sentido: string;
  estado: string;
  texto: string;
}

/** Las columnas por las que se ordena la lista de Documentos. */
export type CampoDocumentos =
  'number' | 'tipo' | 'sentido' | 'issueDate' | 'clientName' | 'documentoOrigenNumber' | 'total' | 'status';

/** La columna de la vista que va con cada una. Ninguno del historial tiene origen: van por fecha. */
export const COLUMNA_DE_ORDEN: Record<CampoDocumentos, string> = {
  number: 'numero',
  tipo: 'tipo',
  sentido: 'sentido',
  issueDate: 'fecha',
  clientName: 'cliente',
  documentoOrigenNumber: 'fecha',
  total: 'total',
  status: 'estado',
};

const TIPOS_DEL_HISTORIAL = ['factura', 'albaran', 'pedido', 'presupuesto'];
const ESTADOS_DEL_HISTORIAL = ['emitida', 'facturado', 'pendiente'];

/**
 * ¿Puede salir algo del historial con estos filtros? Borradores no venían
 * en la copia; las rectificativas van como facturas con el total en
 * negativo, y pagadas no se sabe cuáles (en ISECAN lo cobrado estaba
 * siempre a 0).
 */
export function filtroAlcanzaHistorial(f: Pick<FiltroDocumentos, 'tipo' | 'estado'>): boolean {
  return (f.tipo === 'todos' || TIPOS_DEL_HISTORIAL.includes(f.tipo))
    && (f.estado === 'todos' || ESTADOS_DEL_HISTORIAL.includes(f.estado));
}

/** Las condiciones `or` del buscador de Documentos sobre la vista; vacío si no hay nada que buscar. */
export function busquedaEnListado(texto: string): string[] {
  const t = textoParaFiltro(texto);
  if (!t) return [];
  return ['numero', 'cliente', 'razon_social', 'cliente_nif', 'codigo_tercero', 'observaciones']
    .map(c => `${c}.ilike.*${t}*`);
}

/**
 * Una página del historial para la lista de Documentos, con sus filtros y
 * en su orden. La base de datos filtra y ordena: son miles.
 */
export async function listarHistorico(
  filtro: FiltroDocumentos,
  orden: { campo: CampoDocumentos; asc: boolean },
  desde: number,
  cuantos: number,
): Promise<{ filas: FilaListadoHistorico[]; total: number }> {
  if (!filtroAlcanzaHistorial(filtro)) return { filas: [], total: 0 };
  let q = createClient().from('historico_listado').select('*', { count: 'exact' });
  const cuenta = await cuentaDeLaSesion();
  if (cuenta) q = q.eq('user_id', cuenta);
  if (filtro.tipo !== 'todos') q = q.eq('tipo', filtro.tipo);
  if (filtro.sentido !== 'todos') q = q.eq('sentido', filtro.sentido);
  if (filtro.estado !== 'todos') q = q.eq('estado', filtro.estado);
  const condiciones = busquedaEnListado(filtro.texto);
  if (condiciones.length) q = q.or(condiciones.join(','));
  const columna = COLUMNA_DE_ORDEN[orden.campo];
  q = q.order(columna, { ascending: orden.asc, nullsFirst: orden.asc });
  if (columna !== 'fecha') q = q.order('fecha', { ascending: false, nullsFirst: false });
  const { data, error, count } = await q.order('id').range(desde, desde + cuantos - 1);
  if (error) {
    if (faltaLaTabla(error)) return { filas: [], total: 0 };
    throw new Error(error.message);
  }
  return { filas: (data ?? []).map(filaListadoDe), total: count ?? 0 };
}

/**
 * Junta dos listas ya ordenadas sin reordenar ninguna: la del historial
 * llega en el orden de la base de datos y así se queda, aunque ordene las
 * tildes o las mayúsculas un poco distinto que el teléfono.
 */
export function mezclarOrdenadas<A, B>(a: readonly A[], b: readonly B[], va: (x: A, y: B) => number): (A | B)[] {
  const r: (A | B)[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) r.push(va(a[i], b[j]) <= 0 ? a[i++] : b[j++]);
  for (; i < a.length; i++) r.push(a[i]);
  for (; j < b.length; j++) r.push(b[j]);
  return r;
}

// ------------------------------------------------------------
// Un documento
// ------------------------------------------------------------

/** Cómo lo nombra `pasa_a` de los demás: «factura_venta:26/26003518». */
export function claveDeDocumento(d: Pick<DocumentoHistorico, 'tipo' | 'serie' | 'numero'>): string {
  return `${d.tipo}:${d.serie}/${d.numero}`;
}

/** «factura_venta:26/26003518» → sus partes; null si no tiene esa forma. */
export function partesDeClave(clave: string): { tipo: TipoHistorico; serie: string; numero: string } | null {
  const m = /^(factura_venta|albaran_venta|pedido_venta|presupuesto_venta|factura_compra|albaran_compra):([^/]*)\/(.+)$/.exec(clave);
  return m ? { tipo: m[1] as TipoHistorico, serie: m[2], numero: m[3] } : null;
}

export interface DetalleHistorico {
  doc: DocumentoHistorico;
  cliente: string | null;
  clienteNif: string | null;
  /** Los documentos a los que pasó (el albarán, a su factura). */
  pasoA: DocumentoHistorico[];
  /** Los que pasaron a este (los albaranes de una factura). */
  vieneDe: DocumentoHistorico[];
}

/** Un documento del historial con su ficha y los documentos con los que se enlaza; null si no está. */
export async function getDetalleHistorico(id: string): Promise<DetalleHistorico | null> {
  const db = createClient();
  const { data, error } = await db.from('historico_documentos').select('*').eq('id', id).maybeSingle();
  if (error) {
    if (faltaLaTabla(error)) return null;
    throw new Error(error.message);
  }
  if (!data) return null;
  const doc = documentoDeFila(data);

  const [nombre, siguientes, anteriores] = await Promise.all([
    db.from('historico_listado').select('cliente, cliente_nif').eq('id', id).maybeSingle(),
    Promise.all(doc.pasaA.map(partesDeClave).filter((p): p is NonNullable<typeof p> => p !== null).map(p => db.from('historico_documentos')
      .select('*').eq('user_id', data.user_id).eq('origen', doc.origen)
      .eq('tipo', p.tipo).eq('serie', p.serie).eq('numero', p.numero).limit(1))),
    db.from('historico_documentos').select('*').eq('user_id', data.user_id).eq('origen', doc.origen)
      .contains('pasa_a', [claveDeDocumento(doc)])
      .order('fecha', { ascending: true, nullsFirst: false }).order('numero').limit(200),
  ]);

  return {
    doc,
    cliente: nombre.data?.cliente ?? null,
    clienteNif: nombre.data?.cliente_nif ?? null,
    pasoA: siguientes.flatMap(r => r.data ?? []).map(documentoDeFila),
    vieneDe: (anteriores.data ?? []).map(documentoDeFila),
  };
}

/**
 * Cuántas facturas (o albaranes) del programa anterior hay, y de cuál:
 * para avisar en Facturas y en Albaranes de que están en Documentos.
 * null si no hay ninguno o no se pudo saber.
 */
export async function contarHistorico(tipo: FilaListadoHistorico['tipo']): Promise<{ origen: string; total: number } | null> {
  let q = createClient().from('historico_listado').select('origen', { count: 'exact' }).eq('tipo', tipo);
  const cuenta = await cuentaDeLaSesion();
  if (cuenta) q = q.eq('user_id', cuenta);
  const { data, count, error } = await q.limit(1);
  if (error || !count || !data?.[0]) return null;
  return { origen: data[0].origen, total: count };
}

/**
 * Los documentos del historial entre dos fechas, para el listado de
 * Histórico. Llegan por tandas de mil (lo más que da la base de datos de una
 * vez) hasta `maximo`: un listado de diecisiete mil filas no lo imprime nadie.
 */
export async function historicoParaListado(
  filtro: { desde?: string; hasta?: string; clientId?: string },
  maximo = 5000,
): Promise<{ filas: FilaListadoHistorico[]; total: number }> {
  const db = createClient();
  const cuenta = await cuentaDeLaSesion();
  const filas: FilaListadoHistorico[] = [];
  let total = 0;
  for (let desde = 0; desde < maximo; desde += 1000) {
    let q = db.from('historico_listado').select('*', { count: 'exact' });
    if (cuenta) q = q.eq('user_id', cuenta);
    if (filtro.desde) q = q.gte('fecha', filtro.desde);
    if (filtro.hasta) q = q.lte('fecha', filtro.hasta);
    if (filtro.clientId) q = q.eq('client_id', filtro.clientId);
    const { data, error, count } = await q
      .order('fecha', { ascending: true, nullsFirst: true }).order('numero').order('id')
      .range(desde, Math.min(desde + 999, maximo - 1));
    if (error) {
      if (faltaLaTabla(error)) return { filas: [], total: 0 };
      throw new Error(error.message);
    }
    total = count ?? total;
    filas.push(...(data ?? []).map(filaListadoDe));
    if (!data || data.length < 1000) break;
  }
  return { filas, total };
}
