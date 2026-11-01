/**
 * QUÉ BOTONES SALEN EN LA FICHA DE UN DOCUMENTO
 *
 * La ficha (documentos/[id]) sirve a la venta y a la compra, y cada una
 * tiene sus reglas: las de la venta en flujoVenta.ts y las de la compra en
 * compras.ts, rectificativas.ts y anulacion.ts. Esto sólo decide qué se
 * enseña, con qué palabras y por qué no se puede, para que la pantalla no
 * repita reglas y se pueda probar sin montarla.
 *
 * LO QUE NO TIENE SENTIDO PULSAR, NO SALE
 *
 * «Facturar albarán» en un albarán sin expedir (o sin recibir) o ya
 * facturado no es un paso que falte, es un paso que no toca: no se enseña.
 * El siguiente paso de verdad (expedir, recibir) ya está a la vista, y lo
 * facturado sale en la cadena del documento. Lo que sí se enseña bloqueado
 * es lo que alguien espera poder hacer y conviene saber por qué no (un
 * presupuesto que ya se pasó a pedido, un pedido servido entero).
 */

import { InvoiceStatus, type Invoice, type TipoDocumento } from './types';
import { esSellable } from './storage';
import { DESTINOS, derivadosDe, motivoParaNoConvertir } from './flujoVenta';
import { porQueNoSeConvierte } from './compras';
import { porQueNoSeRectifica } from './rectificativas';
import { anulacionVaPorLaFicha } from './anulacion';

export interface BotonConversion {
  destino: TipoDocumento;
  rotulo: string;
  /** Por qué no se puede ahora, o null. */
  motivo: string | null;
  /** Una factura recibida: antes de crearla se piden el número y las fechas de la factura del proveedor. */
  datosProveedor: boolean;
}

const DESTINOS_COMPRA: Partial<Record<TipoDocumento, readonly TipoDocumento[]>> = {
  pedido: ['albaran', 'factura'],
  albaran: ['factura'],
};

function rotulo(origen: TipoDocumento, destino: TipoDocumento, compra: boolean): string {
  if (compra) return destino === 'albaran' ? 'Recibir lo pendiente' : 'Registrar factura del proveedor';
  if (destino === 'factura') return origen === 'albaran' ? 'Facturar albarán' : 'Facturar';
  if (destino === 'pedido') return 'Pasar a pedido';
  return origen === 'pedido' ? 'Convertir en albarán' : 'Pasar a albarán';
}

/** Un albarán que aún no ha salido (o entrado), o que ya tiene factura: no se factura. */
function albaranSinFacturable(doc: Invoice, documentos: readonly Invoice[]): boolean {
  return doc.status === InvoiceStatus.BORRADOR
    || doc.status === InvoiceStatus.FACTURADO
    || derivadosDe(doc.id, documentos).some(d => d.tipo === 'factura');
}

/** Los botones de convertir de la ficha, en orden. */
export function conversionesDeFicha(doc: Invoice, documentos: readonly Invoice[]): BotonConversion[] {
  if (doc.status === InvoiceStatus.ANULADA) return [];
  const tipo = doc.tipo ?? 'factura';
  const compra = doc.sentido === 'compra';
  if (tipo === 'albaran' && albaranSinFacturable(doc, documentos)) return [];
  const destinos = compra ? (DESTINOS_COMPRA[tipo] ?? []) : DESTINOS[tipo];
  return destinos.map(destino => ({
    destino,
    rotulo: rotulo(tipo, destino, compra),
    motivo: compra ? porQueNoSeConvierte(doc, destino, documentos) : motivoParaNoConvertir(doc, destino, documentos),
    datosProveedor: compra && destino === 'factura',
  }));
}

/** El botón que mueve el stock de un albarán: en compras entra, en venta sale. */
export function rotuloRecepcion(doc: Pick<Invoice, 'sentido'>): string {
  return doc.sentido === 'compra' ? 'Recibir mercancía (+stock)' : 'Expedir albarán (−stock)';
}

/** «Rectificar» sólo donde rectificativas.ts lo deja: nunca en un borrador. */
export function puedeRectificarAqui(doc: Invoice, documentos: readonly Invoice[]): boolean {
  return (doc.tipo === 'factura') && porQueNoSeRectifica(doc, documentos) === null;
}

/**
 * Lo que se edita: sólo un borrador, de venta o de compra. Un albarán
 * expedido, recibido o facturado no vuelve al formulario: guardarlo lo
 * devolvía a borrador y el stock que movió volvía atrás sin que nadie lo
 * pidiera.
 */
export function sePuedeEditar(doc: Pick<Invoice, 'status' | 'tipo' | 'sentido'>): boolean {
  return doc.status === InvoiceStatus.BORRADOR;
}

/** Una factura (o rectificativa) recibida de un proveedor: lleva su número y la fecha de registro. */
export function esFacturaRecibida(doc: Pick<Invoice, 'tipo' | 'sentido'>): boolean {
  return doc.sentido === 'compra' && (doc.tipo === 'factura' || doc.tipo === 'rectificativa');
}

/**
 * «Anular» en la ficha: no en lo ya anulado, no en una factura de venta
 * emitida (se anula en Facturas, con el registro de Veri*Factu) y no en un
 * borrador de factura de venta, que no se anula: se elimina.
 */
export function puedeAnularAqui(doc: Invoice): boolean {
  if (doc.status === InvoiceStatus.ANULADA) return false;
  if (anulacionVaPorLaFicha(doc)) return false;
  return !(esSellable(doc) && doc.status === InvoiceStatus.BORRADOR);
}
