/**
 * ANULAR SIN DEJAR NADA COLGANDO
 *
 * El botón «Anular» de la ficha de un documento cambiaba el estado a
 * anulado y punto, fuera lo que fuera. Con un albarán ya facturado eso es
 * un descuadre seguro: la base de datos devuelve al almacén lo que movió el
 * albarán (un anulado no mueve stock), pero la factura que salió de él
 * sigue viva y no mueve nada porque «ya lo movió el albarán». El género
 * vuelve a la estantería en el programa y no en la nave.
 *
 * Aquí se decide qué se puede anular y qué hay que deshacer antes:
 *
 *   · Una factura emitida de venta se anula desde su ficha, con motivo y
 *     con conexión (Veri*Factu registra la anulación). Si tiene
 *     rectificativas vivas, primero esas.
 *   · Un albarán facturado, no: primero la factura.
 *   · Un pedido o presupuesto servido entero, no: no queda nada que anular.
 *     Uno servido a medias sí: anularlo cierra lo que faltaba por servir.
 */

import { InvoiceStatus, type Invoice } from './types';
import { albaranesDeFacturaCompra, derivadosDe, pendienteDePedido } from './compras';
import { rectificativasDe } from './rectificativas';

const SELLADA: readonly InvoiceStatus[] = [InvoiceStatus.EMITIDA, InvoiceStatus.PENDIENTE, InvoiceStatus.PARCIAL, InvoiceStatus.PAGADA, InvoiceStatus.VENCIDA];
const esFacturaDeVenta = (d: Pick<Invoice, 'tipo' | 'sentido'>) =>
  (d.tipo === 'factura' || d.tipo === 'rectificativa' || !d.tipo) && (d.sentido ?? 'venta') === 'venta';

const lista = (docs: readonly Invoice[]) => docs.map(d => d.number).join(', ');

/**
 * Por qué no se puede anular este documento ahora (o null si se puede).
 * `docs` son todos los documentos: hace falta ver lo que salió de él.
 */
export function porQueNoSeAnula(doc: Invoice, docs: readonly Invoice[]): string | null {
  if (doc.status === InvoiceStatus.ANULADA) return `${doc.number} ya está anulado.`;
  const tipo = doc.tipo ?? 'factura';

  if (tipo === 'factura' || tipo === 'rectificativa') {
    const rectificativas = tipo === 'factura' ? rectificativasDe(doc, docs) : [];
    if (rectificativas.length) {
      return `La factura ${doc.number} tiene la rectificativa ${lista(rectificativas)}: anula antes la rectificativa (o elimínala si está en borrador).`;
    }
    return null;
  }

  if (tipo === 'albaran') {
    const facturas = derivadosDe(doc.id, docs).filter(d => d.tipo === 'factura');
    if (facturas.length) {
      return `El albarán ${doc.number} ya está facturado en ${lista(facturas)}: anula o rectifica antes la factura.`;
    }
    if (doc.status === InvoiceStatus.FACTURADO) {
      return `El albarán ${doc.number} ya está facturado: anula o rectifica antes la factura.`;
    }
    return null;
  }

  // Pedido o presupuesto.
  const hijos = derivadosDe(doc.id, docs);
  if (doc.status === InvoiceStatus.FACTURADO || (hijos.length && tipo === 'pedido' && pendienteDePedido(doc, docs).length === 0)) {
    return `${tipo === 'pedido' ? 'El pedido' : 'El presupuesto'} ${doc.number} ya se ha servido entero (${lista(hijos) || 'facturado'}): no queda nada que anular. Si no se llegó a hacer, anula antes esos documentos.`;
  }
  if (tipo === 'presupuesto' && hijos.length) {
    return `El presupuesto ${doc.number} ya se pasó a ${lista(hijos)}: anula antes esos documentos.`;
  }
  return null;
}

/**
 * La anulación de una factura emitida de venta no va por aquí: la hace
 * `cancelInvoice`, con motivo y conexión. Esto lo dice antes de intentarlo.
 */
export function anulacionVaPorLaFicha(doc: Invoice): string | null {
  return esFacturaDeVenta(doc) && SELLADA.includes(doc.status)
    ? `La factura ${doc.number} está emitida: anúlala desde su ficha, indicando el motivo (queda registrado en Veri*Factu).`
    : null;
}

/** Los albaranes que vuelven a quedar por facturar al anular (o borrar) la factura de compra que los agrupaba. */
export function albaranesQueVuelven(factura: Invoice, docs: readonly Invoice[]): Invoice[] {
  return albaranesDeFacturaCompra(factura, docs).filter(a => a.status === InvoiceStatus.FACTURADO);
}
