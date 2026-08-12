/**
 * DATOS QUE RELLENAN UNA PLANTILLA
 *
 * Traduce una factura o un albarán reales al vocabulario del contrato
 * (`contrato.ts`): un valor de texto ya formateado por cada clave, más las
 * filas de las dos tablas. La plantilla decide dónde va cada cosa; este
 * fichero decide qué dice.
 *
 * Todo sale ya formateado en español (importes con € y coma decimal, fechas
 * dd/mm/aaaa) porque el generador de PDF sólo sabe pintar texto: no puede
 * aplicar formato numérico por su cuenta.
 */

import { Albaran, Client, CompanySettings, Invoice, InvoiceStatus, PaymentMethod, UnitOfMeasure } from '../types';
import { ALBARAN_STATUSES, INVOICE_STATUSES, PAYMENT_METHODS } from '../constants';
import { calculateInvoiceTotals, formatCurrency, formatDate } from '../utils';
import { CAMPOS } from './contrato';

/** Documento imprimible: hoy factura o albarán, los dos con la misma forma. */
export type DocumentoImprimible =
  | { tipo: 'factura'; documento: Invoice }
  | { tipo: 'albaran'; documento: Albaran };

export interface DatosDocumento {
  /** Un valor por cada clave del contrato. Las claves sin dato van en blanco. */
  campos: Record<string, string>;
  /** Filas de la tabla de líneas, cada una con las claves de COLUMNAS_LINEAS. */
  lineas: Record<string, string>[];
  /** Filas del desglose de impuestos, con las claves de COLUMNAS_IMPUESTOS. */
  impuestos: Record<string, string>[];
}

export interface OpcionesDatos {
  /** Ficha del cliente, si está disponible: aporta CP, ciudad y provincia. */
  cliente?: Client;
  /**
   * QR de cotejo ya generado. No se inventa aquí: mientras el envío a la AEAT
   * no esté operativo, una factura no tiene QR oficial y pintar uno falso
   * daría al cliente una garantía que no existe.
   */
  qrCotejo?: string;
}

// ============================================================
// AYUDAS DE FORMATO
// ============================================================

function porcentaje(valor: number): string {
  if (!Number.isFinite(valor)) return '';
  const texto = Number(valor.toFixed(2)).toString().replace('.', ',');
  return `${texto}%`;
}

function juntar(partes: (string | undefined)[], separador = ' '): string {
  return partes.map(p => (p ?? '').trim()).filter(Boolean).join(separador);
}

function poblacion(cp?: string, ciudad?: string, provincia?: string): string {
  const base = juntar([cp, ciudad]);
  const prov = (provincia ?? '').trim();
  if (base && prov && prov.toLowerCase() !== (ciudad ?? '').trim().toLowerCase()) {
    return `${base} (${prov})`;
  }
  return base || prov;
}

function etiquetaEstado(entrada: DocumentoImprimible): string {
  if (entrada.tipo === 'factura') {
    return INVOICE_STATUSES.find(e => e.value === entrada.documento.status)?.label ?? '';
  }
  return ALBARAN_STATUSES.find(e => e.value === entrada.documento.status)?.label ?? '';
}

/** IVA o IGIC, según el régimen fiscal configurado en Ajustes. */
export function nombreImpuesto(ajustes: CompanySettings): string {
  return ajustes.igicEnabled ? 'IGIC' : 'IVA';
}

// ============================================================
// CONSTRUCCIÓN
// ============================================================

export function construirDatos(
  entrada: DocumentoImprimible,
  ajustes: CompanySettings,
  opciones: OpcionesDatos = {},
): DatosDocumento {
  const doc = entrada.documento;
  const esFactura = entrada.tipo === 'factura';
  const factura = esFactura ? (doc as Invoice) : null;
  const impuesto = nombreImpuesto(ajustes);
  const cliente = opciones.cliente;

  // --- Líneas ---
  const lineas = doc.lineItems.map((linea, indice) => ({
    indice: String(indice + 1),
    ref: linea.productRef || '',
    descripcion: linea.productName || '',
    cantidad: String(linea.quantity),
    unidad: linea.unit,
    cantidad_unidad: `${linea.quantity} ${linea.unit}`,
    precio: formatCurrency(linea.unitPrice),
    descuento_pct: linea.discountPercent > 0 ? porcentaje(linea.discountPercent) : '—',
    impuesto_pct: porcentaje(linea.taxRate),
    importe: formatCurrency(linea.subtotal),
    importe_impuesto: formatCurrency(linea.taxAmount),
    importe_total: formatCurrency(linea.total),
  }));

  // --- Desglose de impuestos ---
  const impuestos = doc.taxBreakdown.map(tramo => ({
    tipo: porcentaje(tramo.rate),
    nombre: `${impuesto} ${porcentaje(tramo.rate)}`,
    base: formatCurrency(tramo.base),
    cuota: formatCurrency(tramo.amount),
    total: formatCurrency(tramo.base + tramo.amount),
  }));

  const desgloseEnTexto = doc.taxBreakdown
    .map(t => `${impuesto} ${porcentaje(t.rate)} sobre ${formatCurrency(t.base)} — ${formatCurrency(t.amount)}`)
    .join('\n');

  // --- Campos sueltos ---
  const tipoDocumento = esFactura ? 'FACTURA' : 'ALBARÁN';
  const direccionCliente = doc.clientAddress || cliente?.address || '';
  const poblacionCliente = poblacion(cliente?.postalCode, cliente?.city, cliente?.province);

  const campos: Record<string, string> = {
    // Emisor
    empresa_nombre: ajustes.tradeName || ajustes.businessName || '',
    empresa_razon_social: ajustes.businessName || '',
    empresa_nif: ajustes.nif || '',
    empresa_direccion: ajustes.address || '',
    empresa_cp: ajustes.postalCode || '',
    empresa_ciudad: ajustes.city || '',
    empresa_provincia: ajustes.province || '',
    empresa_poblacion: poblacion(ajustes.postalCode, ajustes.city, ajustes.province),
    empresa_email: ajustes.email || '',
    empresa_telefono: ajustes.phone || '',
    empresa_web: ajustes.website || '',
    empresa_iban: ajustes.iban || '',
    empresa_banco: ajustes.bankName || '',
    empresa_pie: ajustes.invoiceFooterText || '',
    empresa_logo: ajustes.logoUrl || '',

    // Receptor
    cliente_nombre: doc.clientName || '',
    cliente_nif: doc.clientNif || '',
    cliente_direccion: direccionCliente,
    cliente_cp: cliente?.postalCode || '',
    cliente_ciudad: cliente?.city || '',
    cliente_provincia: cliente?.province || '',
    cliente_poblacion: poblacionCliente,
    cliente_email: cliente?.email || '',
    cliente_telefono: cliente?.phone || '',
    cliente_direccion_completa: juntar([direccionCliente, poblacionCliente], '\n'),

    // Documento
    doc_tipo: tipoDocumento,
    doc_titulo: `${tipoDocumento} nº ${doc.number}`,
    doc_numero: doc.number || '',
    doc_serie: doc.series || '',
    doc_fecha: formatDate(doc.issueDate),
    doc_vencimiento: factura ? formatDate(factura.dueDate) : '',
    doc_fecha_pago: factura?.paidDate ? formatDate(factura.paidDate) : '',
    doc_estado: etiquetaEstado(entrada),
    doc_forma_pago: factura
      ? (PAYMENT_METHODS.find(p => p.value === factura.paymentMethod)?.label ?? '')
      : '',
    doc_notas: doc.notes || '',
    doc_aviso_legal: esFactura
      ? ''
      : 'Este albarán acredita la entrega de la mercancía y no tiene valor fiscal como factura.',
    // La cabecera y el pie que se repiten en todas las páginas resuelven este
    // campo con los contadores reales de pdfme; aquí sólo queda el valor de
    // reserva para una previsualización de una sola página.
    doc_pagina: 'Página {currentPage} de {totalPages}',

    // Importes
    total_base: formatCurrency(doc.subtotal),
    total_descuento: formatCurrency(doc.totalDiscount),
    total_impuestos: formatCurrency(doc.totalTax),
    total_general: formatCurrency(doc.total),
    total_impuesto_nombre: impuesto,
    total_desglose: desgloseEnTexto,

    // Veri*Factu
    verifactu_huella: factura?.verifactu?.chainedHash || '',
    verifactu_huella_corta: factura?.verifactu?.chainedHash?.slice(0, 16) || '',
    verifactu_fecha: factura?.verifactu?.timestamp ? formatDate(factura.verifactu.timestamp) : '',
    verifactu_leyenda: factura?.verifactu?.chainedHash
      ? 'Factura con registro de facturación encadenado (SHA-256).'
      : '',
    verifactu_qr: opciones.qrCotejo || factura?.verifactu?.qrCodeUrl || '',
  };

  // Red de seguridad: cualquier clave del contrato que no se haya rellenado
  // arriba existe igualmente en blanco. Sin esto, pdfme dejaría el campo con
  // su contenido de plantilla (el texto que traía el PDF original) en vez de
  // vaciarlo, y la factura saldría con el dato del PDF de muestra.
  for (const campo of CAMPOS) {
    if (campos[campo.clave] === undefined) campos[campo.clave] = '';
  }

  return { campos, lineas, impuestos };
}

/**
 * Factura de mentira para previsualizar una plantilla cuando la empresa
 * todavía no ha emitido ninguna. Lleva nombres largos y varias líneas a
 * propósito: es donde se ve si una caja se queda corta.
 */
export function facturaDeMuestra(): Invoice {
  const lineas = [
    { nombre: 'Caja de tomate rama primera categoría', ref: 'REF-001', cantidad: 12, precio: 14.9 },
    { nombre: 'Saco de patata nueva 10 kg', ref: 'REF-002', cantidad: 8, precio: 9.5 },
    { nombre: 'Malla de cebolla dulce 2 kg', ref: 'REF-003', cantidad: 24, precio: 3.2 },
  ].map((linea, indice) => {
    const subtotal = Number((linea.cantidad * linea.precio).toFixed(2));
    const taxAmount = Number((subtotal * 0.21).toFixed(2));
    return {
      id: `muestra-${indice}`,
      productId: `muestra-${indice}`,
      productName: linea.nombre,
      productRef: linea.ref,
      quantity: linea.cantidad,
      unitPrice: linea.precio,
      unit: UnitOfMeasure.UNIDAD,
      taxRate: 21,
      discountPercent: 0,
      subtotal,
      taxAmount,
      total: Number((subtotal + taxAmount).toFixed(2)),
    };
  });

  const totales = calculateInvoiceTotals(lineas);
  const hoy = new Date().toISOString().split('T')[0];

  return {
    id: 'muestra',
    number: 'FAC-0000-0000',
    series: 'FAC',
    clientId: 'muestra',
    clientName: 'Comercial Hermanos Rodríguez e Hijos S.L.',
    clientNif: 'A87654321',
    clientAddress: 'Avenida del Puerto 45',
    issueDate: hoy,
    dueDate: hoy,
    status: InvoiceStatus.PENDIENTE,
    lineItems: lineas,
    ...totales,
    paymentMethod: PaymentMethod.TRANSFERENCIA,
    notes: 'Entregar en horario de mañana.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/** Si un albarán o factura está anulada conviene avisarlo al imprimir. */
export function esDocumentoAnulado(entrada: DocumentoImprimible): boolean {
  return entrada.tipo === 'factura'
    ? entrada.documento.status === InvoiceStatus.ANULADA
    : entrada.documento.status === 'anulado';
}
