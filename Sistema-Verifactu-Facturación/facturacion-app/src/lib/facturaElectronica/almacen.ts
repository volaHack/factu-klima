'use client';

/**
 * FACTURAS ELECTRÓNICAS GUARDADAS Y SUS COMUNICACIONES (navegador)
 *
 * Lo que se lee y escribe va con la sesión del usuario (RLS, migración
 * 060). La entrega por el canal la hace el servidor
 * (/api/factura-electronica), porque el día que se conecte la solución
 * pública de la AEAT hará falta el certificado, que sólo se descifra allí.
 */

import { createClient } from '@/lib/supabase/client';
import { getClientById, getCompanySettings } from '@/lib/storage';
import type { Invoice } from '@/lib/types';
import { alcanceDe, leerConfigFe } from './ambito';
import { ESTADO_TRAS, plazoComunicacion, type EstadoFe, type SentidoFe, type TipoComunicacion } from './estados';
import type { FacturaLeida, FormatoFactura } from './leer';
import { generarUbl, limpiarNif, problemasUbl } from './ubl';

const db = () => createClient();

export interface FeFactura {
  id: string;
  sentido: SentidoFe;
  invoiceId?: string;
  gastoIds?: string[];
  formato: FormatoFactura;
  numero: string;
  fecha: string;
  vencimiento?: string;
  nifEmisor: string;
  nombreEmisor?: string;
  nifReceptor?: string;
  nombreReceptor?: string;
  total: number;
  huella: string;
  canal: 'simulado' | 'spfe' | 'manual';
  estado: EstadoFe;
  estadoFecha?: string;
  motivo?: string;
  codigo?: string;
  mensaje?: string;
  creadoEn: string;
}

export interface FeComunicacion {
  id: string;
  feFacturaId: string;
  tipo: TipoComunicacion;
  fechaHecho: string;
  importe?: number;
  motivo?: string;
  plazo: string;
  estado: 'pendiente' | 'enviada' | 'error';
  canal: string;
  enviadaEn?: string;
  mensaje?: string;
  creadoEn: string;
}

const COLUMNAS = 'id, sentido, invoice_id, gasto_ids, formato, numero, fecha, vencimiento, nif_emisor, nombre_emisor, nif_receptor, '
  + 'nombre_receptor, total, huella, canal, estado, estado_fecha, motivo, codigo, respuesta, creado_en';

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
function mapFe(r: any): FeFactura {
  return {
    id: r.id, sentido: r.sentido, invoiceId: r.invoice_id ?? undefined, gastoIds: r.gasto_ids ?? undefined, formato: r.formato,
    numero: r.numero, fecha: r.fecha, vencimiento: r.vencimiento ?? undefined, nifEmisor: r.nif_emisor, nombreEmisor: r.nombre_emisor ?? undefined,
    nifReceptor: r.nif_receptor ?? undefined, nombreReceptor: r.nombre_receptor ?? undefined, total: Number(r.total), huella: r.huella,
    canal: r.canal, estado: r.estado, estadoFecha: r.estado_fecha ?? undefined, motivo: r.motivo ?? undefined, codigo: r.codigo ?? undefined,
    mensaje: r.respuesta?.mensaje ?? undefined, creadoEn: r.creado_en,
  };
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
function mapComunicacion(r: any): FeComunicacion {
  return {
    id: r.id, feFacturaId: r.fe_factura_id, tipo: r.tipo, fechaHecho: r.fecha_hecho, importe: r.importe === null ? undefined : Number(r.importe),
    motivo: r.motivo ?? undefined, plazo: r.plazo, estado: r.estado, canal: r.canal, enviadaEn: r.enviada_en ?? undefined,
    mensaje: r.respuesta?.mensaje ?? undefined, creadoEn: r.creado_en,
  };
}

async function miId(): Promise<string> {
  const { data } = await db().auth.getSession();
  const id = data?.session?.user?.id;
  if (!id) throw new Error('Inicia sesión de nuevo.');
  return id;
}

/** El aviso cuando la base de datos aún no tiene las tablas (migración 060 sin aplicar). */
function traducir(error: { message?: string; code?: string } | null): string {
  const m = error?.message ?? '';
  if (/fe_facturas|fe_comunicaciones/.test(m) && /does not exist|schema cache|Could not find/i.test(m)) {
    return 'La factura electrónica todavía no está activada en tu cuenta. Inténtalo en unos minutos.';
  }
  if (error?.code === '23505') return 'Esta factura electrónica ya está guardada.';
  return m || 'No se ha podido guardar.';
}

export async function huellaSha256(texto: string): Promise<string> {
  const datos = new TextEncoder().encode(texto);
  const resumen = await crypto.subtle.digest('SHA-256', datos);
  return Array.from(new Uint8Array(resumen)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ------------------------------------------------------------ lecturas

export async function getFacturasElectronicas(sentido?: SentidoFe): Promise<FeFactura[]> {
  let q = db().from('fe_facturas').select(COLUMNAS).eq('user_id', await miId()).order('creado_en', { ascending: false }).limit(500);
  if (sentido) q = q.eq('sentido', sentido);
  const { data, error } = await q;
  if (error) throw new Error(traducir(error));
  return (data ?? []).map(mapFe);
}

export async function getFeDeFactura(invoiceId: string): Promise<FeFactura | null> {
  const { data, error } = await db().from('fe_facturas').select(COLUMNAS).eq('invoice_id', invoiceId).maybeSingle();
  if (error) return null;
  return data ? mapFe(data) : null;
}

export async function getContenidoFe(id: string): Promise<{ contenido: string; formato: FormatoFactura; numero: string }> {
  const { data, error } = await db().from('fe_facturas').select('contenido, formato, numero').eq('id', id).maybeSingle();
  if (error || !data) throw new Error(traducir(error));
  return data as { contenido: string; formato: FormatoFactura; numero: string };
}

export async function getComunicaciones(feFacturaId?: string): Promise<FeComunicacion[]> {
  let q = db().from('fe_comunicaciones').select('*').eq('user_id', await miId()).order('creado_en', { ascending: true }).limit(1000);
  if (feFacturaId) q = q.eq('fe_factura_id', feFacturaId);
  const { data, error } = await q;
  if (error) throw new Error(traducir(error));
  return (data ?? []).map(mapComunicacion);
}

// ------------------------------------------------------------ entregar por el canal (servidor)

export interface ResultadoEntrega { ok: boolean; pendiente: boolean; estado: string; mensaje: string; canal: string }

async function entregar(accion: 'enviar' | 'comunicar', id: string): Promise<ResultadoEntrega> {
  const r = await fetch('/api/factura-electronica', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion, id }),
  });
  const cuerpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(cuerpo?.error || 'No se ha podido entregar.');
  return cuerpo as ResultadoEntrega;
}

export const enviarFacturaElectronica = (id: string) => entregar('enviar', id);
export const reintentarComunicacion = (id: string) => entregar('comunicar', id);

// ------------------------------------------------------------ emitidas

export interface ResultadoGenerar { fe?: FeFactura; problemas?: string[]; entrega?: ResultadoEntrega }

/**
 * Genera la factura electrónica de una factura emitida, la guarda y la
 * entrega por el canal. `forzar` la genera aunque el cliente no entre en
 * la obligación (un particular que la pide, por ejemplo).
 */
export async function generarFacturaElectronica(factura: Invoice, opciones: { forzar?: boolean } = {}): Promise<ResultadoGenerar> {
  const existente = await getFeDeFactura(factura.id);
  if (existente) return { fe: existente };

  const [empresa, cliente] = await Promise.all([
    getCompanySettings(),
    factura.clientId ? getClientById(factura.clientId).catch(() => undefined) : Promise.resolve(undefined),
  ]);
  const alcance = alcanceDe(factura, cliente);
  if (!alcance.posible || (!alcance.obligatoria && !opciones.forzar)) return { problemas: [alcance.motivo] };

  let fechaRectificada: string | undefined;
  if (factura.tipo === 'rectificativa' && factura.documentoOrigenId) {
    const { data } = await db().from('invoices').select('issue_date').eq('id', factura.documentoOrigenId).maybeSingle();
    fechaRectificada = data?.issue_date ?? undefined;
  }
  const datos = { factura, empresa, cliente, fechaRectificada };
  const problemas = problemasUbl(datos);
  if (problemas.length) return { problemas };

  const contenido = generarUbl(datos);
  const fila = {
    user_id: await miId(), sentido: 'emitida', invoice_id: factura.id, formato: 'ubl', numero: factura.number,
    fecha: factura.issueDate.slice(0, 10), vencimiento: (factura.dueDate || '').slice(0, 10) || null,
    nif_emisor: limpiarNif(empresa.nif), nombre_emisor: empresa.businessName,
    nif_receptor: limpiarNif(factura.clientNif || cliente?.nif), nombre_receptor: factura.clientName || cliente?.businessName,
    total: factura.total, contenido, huella: await huellaSha256(contenido),
    canal: leerConfigFe(empresa.facturaElectronica).canal, estado: 'generada', estado_fecha: new Date().toISOString().slice(0, 10),
  };
  const { data, error } = await db().from('fe_facturas').insert(fila).select(COLUMNAS).single();
  if (error) {
    if (error.code === '23505') {
      const ya = await getFeDeFactura(factura.id);
      if (ya) return { fe: ya };
    }
    throw new Error(traducir(error));
  }
  const fe = mapFe(data);
  try {
    const entrega = await enviarFacturaElectronica(fe.id);
    return { fe: { ...fe, estado: entrega.estado as EstadoFe, mensaje: entrega.mensaje }, entrega };
  } catch {
    // Queda guardada como «generada»: se puede volver a enviar desde la factura.
    return { fe };
  }
}

/**
 * Al emitir: si la empresa lo tiene en automático y la factura entra en la
 * obligación, se genera sola. Nunca bloquea ni hace fallar la emisión.
 */
export async function prepararAlEmitir(factura: Invoice): Promise<void> {
  try {
    const empresa = await getCompanySettings();
    if (!leerConfigFe(empresa.facturaElectronica).automatica) return;
    await generarFacturaElectronica(factura);
  } catch (e) {
    console.warn('Factura electrónica: no se ha generado al emitir', e instanceof Error ? e.message : e);
  }
}

// ------------------------------------------------------------ recibidas

/** Guarda una factura electrónica recibida (el fichero tal cual) y los gastos que salieron de ella. */
export async function guardarFacturaRecibida(leida: FacturaLeida, contenido: string, gastoIds: string[]): Promise<FeFactura> {
  const total = leida.tipo === 'abono' ? -Math.abs(leida.total) : leida.total;
  const fila = {
    user_id: await miId(), sentido: 'recibida', gasto_ids: gastoIds.length ? gastoIds : null, formato: leida.formato,
    numero: leida.numero || 'SIN-NUMERO', fecha: /^\d{4}-\d{2}-\d{2}$/.test(leida.fecha) ? leida.fecha : new Date().toISOString().slice(0, 10),
    vencimiento: leida.vencimiento && /^\d{4}-\d{2}-\d{2}$/.test(leida.vencimiento) ? leida.vencimiento : null,
    nif_emisor: leida.emisor.nif || 'DESCONOCIDO', nombre_emisor: leida.emisor.nombre || null,
    nif_receptor: leida.receptor.nif || null, nombre_receptor: leida.receptor.nombre || null,
    total, contenido, huella: await huellaSha256(contenido), canal: 'manual', estado: 'recibida',
    estado_fecha: new Date().toISOString().slice(0, 10),
  };
  const { data, error } = await db().from('fe_facturas').insert(fila).select(COLUMNAS).single();
  if (error) throw new Error(traducir(error));
  return mapFe(data);
}

/** Apunta qué gastos salieron de una factura recibida. */
export async function vincularGastos(feId: string, gastoIds: string[]): Promise<void> {
  const { error } = await db().from('fe_facturas').update({ gasto_ids: gastoIds }).eq('id', feId);
  if (error) throw new Error(traducir(error));
}

/** ¿Ya está guardada esta factura recibida? (mismo proveedor, número y fecha). */
export async function yaRecibida(leida: FacturaLeida): Promise<boolean> {
  const { data } = await db().from('fe_facturas').select('id').eq('sentido', 'recibida')
    .eq('nif_emisor', leida.emisor.nif || 'DESCONOCIDO').eq('numero', leida.numero || 'SIN-NUMERO').eq('fecha', leida.fecha).limit(1);
  return !!data?.length;
}

// ------------------------------------------------------------ comunicaciones de estado

/**
 * Registra una comunicación (aceptación, rechazo, pago…), cambia el estado
 * de la factura y la entrega por el canal. El plazo legal queda apuntado:
 * cuatro días hábiles desde `fechaHecho`.
 */
export async function comunicarEstado(
  fe: Pick<FeFactura, 'id' | 'estado'>,
  tipo: TipoComunicacion,
  fechaHecho: string,
  extra: { importe?: number; motivo?: string } = {},
): Promise<{ comunicacion: FeComunicacion; entrega?: ResultadoEntrega }> {
  if (tipo === 'rechazo' && !extra.motivo?.trim()) throw new Error('Di por qué la rechazas: el motivo va en la comunicación.');
  const fila = {
    user_id: await miId(), fe_factura_id: fe.id, tipo, fecha_hecho: fechaHecho, importe: extra.importe ?? null,
    motivo: extra.motivo?.trim() || null, plazo: plazoComunicacion(fechaHecho),
  };
  const { data, error } = await db().from('fe_comunicaciones').insert(fila).select('*').single();
  if (error) throw new Error(traducir(error));
  const nuevoEstado = ESTADO_TRAS[tipo];
  const { error: e2 } = await db().from('fe_facturas').update({
    estado: nuevoEstado, estado_fecha: fechaHecho, motivo: tipo === 'rechazo' ? extra.motivo?.trim() : null,
  }).eq('id', fe.id);
  if (e2) throw new Error(traducir(e2));
  const comunicacion = mapComunicacion(data);
  try {
    const entrega = await reintentarComunicacion(comunicacion.id);
    return { comunicacion: { ...comunicacion, estado: entrega.estado as FeComunicacion['estado'], mensaje: entrega.mensaje }, entrega };
  } catch {
    return { comunicacion };
  }
}

/** Al anular una factura emitida que ya tenía factura electrónica: se comunica la anulación. */
export async function comunicarAnulacion(invoiceId: string, motivo: string): Promise<void> {
  try {
    const fe = await getFeDeFactura(invoiceId);
    if (!fe || fe.estado === 'anulada') return;
    await comunicarEstado(fe, 'anulacion', new Date().toISOString().slice(0, 10), { motivo: motivo || 'Factura anulada' });
  } catch (e) {
    console.warn('Factura electrónica: no se ha comunicado la anulación', e instanceof Error ? e.message : e);
  }
}

/** Al cobrar entera una factura emitida, si la empresa comunica sus cobros. */
export async function comunicarCobroSiProcede(invoiceId: string, fecha: string, importe: number): Promise<void> {
  try {
    const empresa = await getCompanySettings();
    if (!leerConfigFe(empresa.facturaElectronica).comunicarCobros) return;
    const fe = await getFeDeFactura(invoiceId);
    if (!fe || fe.estado === 'pagada' || fe.estado === 'anulada' || fe.estado === 'generada' || fe.estado === 'error') return;
    await comunicarEstado(fe, 'cobro', fecha, { importe });
  } catch (e) {
    console.warn('Factura electrónica: no se ha comunicado el cobro', e instanceof Error ? e.message : e);
  }
}
