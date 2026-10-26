/**
 * LO QUE SE OFRECE PARA FILTRAR EL LISTADO DE FACTURAS
 *
 * `INVOICE_STATUSES` es la lista de todos los estados que puede llevar un
 * documento, y al pintarla tal cual en Facturas salían chips de pedido y
 * de presupuesto («En revisión», «Aprobado», «Rechazado»…) que una factura
 * normal no tiene nunca. Un filtro que no encuentra nada es ruido.
 */

import { INVOICE_STATUSES } from './constants';
import { InvoiceStatus } from './types';

/**
 * Los estados que de verdad recorre una factura de venta en esta app:
 * se guarda en borrador, al emitirla queda «Emitida» (es el estado que
 * escriben `issueInvoice` y la anulación de un cobro), con los cobros
 * pasa a «Cobro parcial» o «Pagada», y si se rectifica, «Anulada».
 * «Vencida» se queda porque es la pregunta que más se le hace al listado.
 *
 * «Pendiente» no está: la app no la escribe nunca (lo que está por cobrar
 * es «Emitida»), y dos chips para lo mismo obligaban a marcar los dos.
 */
const ESTADOS_DE_FACTURA: readonly InvoiceStatus[] = [
  InvoiceStatus.BORRADOR,
  InvoiceStatus.EMITIDA,
  InvoiceStatus.PARCIAL,
  InvoiceStatus.PAGADA,
  InvoiceStatus.VENCIDA,
  InvoiceStatus.ANULADA,
];

/**
 * Los chips de estado del listado, en el orden de `INVOICE_STATUSES`.
 *
 * Además de los de factura, sale cualquier estado que tenga alguna
 * factura cargada (una «Pendiente» importada de otro programa, o una que
 * se mandó a aprobar desde su ficha y está «En revisión»): si no, esas
 * facturas no se podrían encontrar filtrando. Y también los que estén
 * marcados, para que un filtro activo no se quede sin su chip para
 * quitarlo cuando la última factura con ese estado cambia.
 */
export function estadosParaFiltrar(
  presentes: Iterable<InvoiceStatus>,
  marcados: readonly InvoiceStatus[] = [],
): typeof INVOICE_STATUSES {
  const ademas = new Set<InvoiceStatus>([...presentes, ...marcados]);
  return INVOICE_STATUSES.filter(s => ESTADOS_DE_FACTURA.includes(s.value) || ademas.has(s.value));
}

/** Ticket del TPV (factura simplificada) y no factura ordinaria. */
export function esTicketTpv(inv: { series?: string; number?: string; posSessionId?: string }): boolean {
  return inv.series === 'TPV' || (inv.number ?? '').startsWith('TPV') || !!inv.posSessionId;
}

/**
 * La pestaña de tickets sólo tiene sentido si hay alguno o si el TPV está
 * encendido (aunque hoy no haya vendido nada). Sin ella, «Todos» y
 * «Facturas ordinarias» cuentan lo mismo, así que tampoco se enseña la
 * fila de pestañas: dos botones que muestran la misma lista no ayudan.
 */
export function mostrarPestanaTickets(tickets: number, tpvActivo: boolean): boolean {
  return tickets > 0 || tpvActivo;
}
