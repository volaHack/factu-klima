// Lógica compartida de documentos (factura, presupuesto, pedido, albarán…).
import {
  Invoice, InvoiceLineItem, InvoiceStatus, UnitOfMeasure, CompanySettings, TipoDocumento, SentidoDocumento,
} from './types';
import { generateInvoiceNumber, calculateLineSubtotal, calculateLineTax } from './utils';
import { getDefaultTaxRate } from './constants';
import { serieDeTipo } from './storage';

export interface TotalesDocumento { subtotal: number; totalDiscount: number; totalTax: number; total: number; }

export function lineaVacia(settings: CompanySettings): InvoiceLineItem {
  return {
    id: crypto.randomUUID(),
    productId: '',
    productName: '',
    productRef: '',
    quantity: 1,
    unitPrice: 0,
    unit: UnitOfMeasure.UNIDAD,
    taxRate: getDefaultTaxRate(settings),
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
  albaran: [InvoiceStatus.BORRADOR, InvoiceStatus.EXPEDIDO, InvoiceStatus.FACTURADO, InvoiceStatus.ANULADA],
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

/** Genera un nuevo documento convertido a partir de uno original (presupuesto -> pedido -> albarán -> factura). */
export function documentoConvertido(
  original: Invoice,
  nuevoTipo: TipoDocumento,
  settings: CompanySettings,
): Invoice {
  const { series, number } = numeroDeDocumento(settings, nuevoTipo, original.sentido ?? 'venta');
  const now = new Date().toISOString();
  return {
    ...original,
    id: crypto.randomUUID(),
    tipo: nuevoTipo,
    number,
    series,
    status: InvoiceStatus.BORRADOR,
    documentoOrigenId: original.documentoOrigenId ?? original.id,
    documentoOrigenNumber: original.documentoOrigenNumber ?? original.number,
    createdAt: now,
    updatedAt: now,
  };
}

/** Actualiza el contador de la serie tras crear un documento nuevo. */
export async function actualizarContadorSerie(
  settings: CompanySettings,
  clave: string,
  numeroUsado: string,
): Promise<void> {
  const { sequenceFromNumber } = await import('./utils');
  const { saveCompanySettings } = await import('./storage');
  const seq = sequenceFromNumber(numeroUsado);
  const seriesDoc = { ...(settings.seriesDocumentos ?? {}) };
  const prev = seriesDoc[clave] ?? { serie: clave.split('_')[0].toUpperCase(), nextNumber: 1 };
  seriesDoc[clave] = {
    ...prev,
    nextNumber: Math.max(prev.nextNumber, seq + 1),
  };
  await saveCompanySettings({
    ...settings,
    seriesDocumentos: seriesDoc,
  });
}

/** Crea una factura rectificativa con importes negativos a partir de una factura emitida. */
export function rectificar(original: Invoice, settings: CompanySettings): Invoice {
  const { series, number } = numeroDeDocumento(settings, 'rectificativa', original.sentido ?? 'venta');
  const now = new Date().toISOString();
  const lineItems = original.lineItems.map((li: InvoiceLineItem) => ({
    ...li,
    id: crypto.randomUUID(),
    quantity: -Math.abs(li.quantity),
  }));
  return {
    ...original,
    id: crypto.randomUUID(),
    tipo: 'rectificativa',
    number,
    series,
    status: InvoiceStatus.BORRADOR,
    documentoOrigenId: original.id,
    documentoOrigenNumber: original.number,
    lineItems,
    createdAt: now,
    updatedAt: now,
  };
}

/** Resuelve la serie asignada al vendedor del cliente, si existe. */
export async function serieParaCliente(
  clientId: string | undefined,
  tipo: TipoDocumento,
  sentido: SentidoDocumento,
): Promise<{ serie: string; nextNumber: number } | null> {
  if (!clientId) return null;
  const { getClientById, getVendedores, getInvoices } = await import('./storage');
  const client = await getClientById(clientId);
  if (!client?.vendedorId) return null;
  const vendedores = await getVendedores();
  const vendedor = vendedores.find(v => v.id === client.vendedorId);
  const serie = vendedor?.series?.[`${tipo}_${sentido}`];
  if (!serie) return null;
  const invoices = await getInvoices();
  const usadas = invoices
    .filter(i => i.series === serie)
    .map(i => Number(i.number.match(/-(\d+)$/)?.[1] ?? 0));
  return { serie, nextNumber: usadas.length ? Math.max(...usadas) + 1 : 1 };
}


