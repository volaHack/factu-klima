// Lógica compartida de documentos (factura, presupuesto, pedido, albarán…).
import {
  InvoiceLineItem, InvoiceStatus, UnitOfMeasure, CompanySettings, TipoDocumento, SentidoDocumento,
} from './types';
import { generateInvoiceNumber, calculateLineSubtotal, calculateLineTax } from './utils';
import { serieDeTipo } from './storage';

export interface TotalesDocumento { subtotal: number; totalDiscount: number; totalTax: number; total: number; }

export function lineaVacia(settings: CompanySettings): InvoiceLineItem {
  const tasa = settings.igicEnabled ? (settings.igicRates?.[0] ?? 7) : (settings.ivaRates?.[0] ?? 21);
  return {
    id: crypto.randomUUID(),
    productId: '',
    productName: '',
    productRef: '',
    quantity: 1,
    unitPrice: 0,
    unit: UnitOfMeasure.UNIDAD,
    taxRate: tasa,
    discountPercent: 0,
    subtotal: 0,
    taxAmount: 0,
    total: 0,
  };
}

/** Recalcula una línea (la fórmula duplicada en facturas/nueva, editar y albaranes/nueva). */
export function recalcularLinea(line: InvoiceLineItem): InvoiceLineItem {
  const subtotal = calculateLineSubtotal(line.quantity, line.unitPrice, line.discountPercent);
  const taxAmount = calculateLineTax(subtotal, line.taxRate);
  return { ...line, subtotal, taxAmount, total: Number((subtotal + taxAmount).toFixed(2)) };
}

/** Número y serie para un documento nuevo de un tipo/sentido. */
export function numeroDeDocumento(
  settings: CompanySettings, tipo: TipoDocumento, sentido: SentidoDocumento,
): { series: string; number: string; nextNumber: number } {
  const { serie, nextNumber } = serieDeTipo(settings, tipo, sentido);
  return { series: serie, number: generateInvoiceNumber(serie, nextNumber), nextNumber };
}

/** Estado inicial por tipo (mapeo tipo → estados permitidos). */
export const ESTADOS_POR_TIPO: Record<TipoDocumento, readonly InvoiceStatus[]> = {
  presupuesto: [InvoiceStatus.BORRADOR, InvoiceStatus.EMITIDA, InvoiceStatus.ANULADA],
  pedido: [InvoiceStatus.BORRADOR, InvoiceStatus.PRE_APROBACION, InvoiceStatus.APROBADO, InvoiceStatus.APROBADO_PARCIAL, InvoiceStatus.RECHAZADO, InvoiceStatus.EMITIDA, InvoiceStatus.ANULADA],
  albaran: [InvoiceStatus.BORRADOR, InvoiceStatus.EMITIDA, InvoiceStatus.ANULADA],
  factura: [InvoiceStatus.BORRADOR, InvoiceStatus.PRE_APROBACION, InvoiceStatus.APROBADO, InvoiceStatus.APROBADO_PARCIAL, InvoiceStatus.RECHAZADO, InvoiceStatus.EMITIDA, InvoiceStatus.PENDIENTE, InvoiceStatus.PAGADA, InvoiceStatus.VENCIDA, InvoiceStatus.ANULADA],
  rectificativa: [InvoiceStatus.BORRADOR, InvoiceStatus.EMITIDA, InvoiceStatus.ANULADA],
};

export function etiquetaTipo(tipo: TipoDocumento): string {
  const etiquetas: Record<TipoDocumento, string> = {
    presupuesto: 'Presupuesto', pedido: 'Pedido', albaran: 'Albarán',
    factura: 'Factura', rectificativa: 'Factura rectificativa',
  };
  return etiquetas[tipo];
}

export function numeroOrigen(doc: { tipo?: TipoDocumento; documentoOrigenNumber?: string }): string {
  if (!doc.documentoOrigenNumber) return '';
  return `${etiquetaTipo(doc.tipo ?? 'factura')} ${doc.documentoOrigenNumber}`;
}
