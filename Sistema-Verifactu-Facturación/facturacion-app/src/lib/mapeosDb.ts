/**
 * DE LA FILA DE LA BASE DE DATOS AL OBJETO DE LA APP
 *
 * Vivían en `storage.ts`, que es del navegador (IndexedDB, cliente de
 * Supabase del navegador). Aquí no dependen de nada de eso, así que los
 * puede usar también el servidor —el resumen del mes y los avisos por
 * correo— con exactamente el mismo resultado que la pantalla.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { PaymentMethod, type Gasto, type Invoice, type InvoiceLineItem, type SentidoDocumento, type TipoDocumento } from './types';
import { lineasConCustomCols } from './plantillas/datos';

export function mapInvoiceFromDb(inv: any, lineItems: any[], taxBreakdown: any[]): Invoice {
  return {
    id: inv.id,
    number: inv.number,
    series: inv.series,
    clientId: inv.client_id || '',
    clientName: inv.client_name,
    clientNif: inv.client_nif || '',
    clientAddress: inv.client_address || '',
    issueDate: inv.issue_date,
    dueDate: inv.due_date,
    paidDate: inv.paid_date || undefined,
    status: inv.status,
    cancelReason: inv.cancel_reason || undefined,
    cancelledAt: inv.cancelled_at || undefined,
    tipo: (inv.tipo as TipoDocumento) ?? 'factura',
    sentido: (inv.sentido as SentidoDocumento) ?? 'venta',
    documentoOrigenId: inv.documento_origen_id ?? undefined,
    documentoOrigenNumber: inv.documento_origen_number ?? undefined,
    vendedorId: inv.vendedor_id ?? undefined,
    tarifaId: inv.tarifa_id || undefined,
    almacenId: inv.almacen_id || undefined,
    obraId: inv.obra_id || undefined,
    retencionPct: inv.retencion_pct != null ? Number(inv.retencion_pct) : undefined,
    paidAmount: Number(inv.paid_amount || 0),
    paymentRecordIds: Array.isArray(inv.payment_record_ids) ? inv.payment_record_ids : [],
    globalDiscountPercent1: Number(inv.global_discount_percent_1 || 0),
    globalDiscountPercent2: Number(inv.global_discount_percent_2 || 0),
    globalDiscountPercent3: Number(inv.global_discount_percent_3 || 0),
    lineItems: lineasConCustomCols(lineItems.map(mapLineItemFromDb), inv.datos_extras ?? {}),
    subtotal: Number(inv.subtotal),
    totalDiscount: Number(inv.total_discount),
    taxBreakdown: taxBreakdown.map(tb => ({
      rate: tb.rate,
      base: Number(tb.base_amount),
      amount: Number(tb.tax_amount),
    })),
    totalTax: Number(inv.total_tax),
    total: Number(inv.total),
    paymentMethod: inv.payment_method,
    notes: inv.notes || '',
    datosExtras: inv.datos_extras ?? {},
    verifactu: inv.verifactu_hash ? {
      chainedHash: inv.verifactu_hash,
      qrCodeUrl: inv.verifactu_qr_url || '',
      timestamp: inv.verifactu_timestamp || '',
      signatureStatus: inv.verifactu_signature_status || 'PENDING',
    } : undefined,
    createdAt: inv.created_at,
    updatedAt: inv.updated_at,
    posSessionId: inv.pos_session_id || undefined,
    numberTemporary: !!inv.number_temporary,
    siiStatus: inv.sii_status || undefined,
    tipoFacturaFiscal: inv.tipo_factura_fiscal || undefined,
    claveRegimenIva: inv.clave_regimen_iva || undefined,
    esIntracomunitaria: !!inv.es_intracomunitaria,
    tipoOperacion349: inv.tipo_operacion_349 || undefined,
    clientVatNumber: inv.client_vat_number || undefined,
  };
}

export function mapLineItemFromDb(li: any): InvoiceLineItem {
  return {
    id: li.id,
    productId: li.product_id ?? li.productId ?? '',
    productName: li.product_name ?? li.productName ?? '',
    productRef: li.product_ref ?? li.productRef ?? '',
    quantity: Number(li.quantity ?? 0),
    unitPrice: Number(li.unit_price ?? li.unitPrice ?? 0),
    unit: li.unit ?? 'ud',
    taxRate: Number(li.tax_rate ?? li.taxRate ?? 21),
    discountPercent: Number(li.discount_percent ?? li.discountPercent ?? 0),
    discountPercent2: Number(li.discount_percent_2 ?? li.discountPercent2 ?? 0),
    discountPercent3: Number(li.discount_percent_3 ?? li.discountPercent3 ?? 0),
    unitsPerPackage: li.units_per_package != null ? Number(li.units_per_package) : undefined,
    loteId: li.lote_id || undefined,
    loteCodigo: li.lote_codigo || undefined,
    numeroSerieId: li.numero_serie_id || undefined,
    numeroSerie: li.numero_serie || undefined,
    costPrice: Number(li.cost_price ?? li.costPrice ?? 0),
    subtotal: Number(li.subtotal ?? 0),
    taxAmount: Number(li.tax_amount ?? li.taxAmount ?? 0),
    total: Number(li.total ?? 0),
  };
}

export function mapGastoFromDb(g: any): Gasto {
  return {
    id: g.id,
    fecha: g.fecha,
    concepto: g.concepto || '',
    categoria: g.categoria || 'otros',
    proveedorId: g.proveedor_id || undefined,
    proveedorNombre: g.proveedor_nombre || undefined,
    baseImponible: Number(g.base_imponible ?? 0),
    taxRate: Number(g.tax_rate ?? 21),
    taxAmount: Number(g.tax_amount ?? 0),
    total: Number(g.total ?? 0),
    paymentMethod: g.payment_method || PaymentMethod.TRANSFERENCIA,
    vehiculoId: g.vehiculo_id || undefined,
    obraId: g.obra_id || undefined,
    notas: g.notas || undefined,
    // Los gastos anteriores a la migración 036 no traen estas columnas:
    // se dan por deducibles e interiores corrientes, que es el caso
    // normal y lo mismo que hace el DEFAULT de la base de datos.
    deducible: g.deducible ?? true,
    tipoOperacion: g.tipo_operacion || 'interior_corriente',
    cuotaDeducible: g.cuota_deducible == null ? undefined : Number(g.cuota_deducible),
    createdAt: g.created_at || g.createdAt || new Date().toISOString(),
    updatedAt: g.updated_at || g.updatedAt || new Date().toISOString(),
  };
}
