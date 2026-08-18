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

import { descuentoEfectivo, unidadesTotales } from '../documentos';
import { Albaran, Client, CompanySettings, Invoice, InvoiceLineItem, InvoiceStatus, PaymentMethod, UnitOfMeasure } from '../types';
import { ALBARAN_STATUSES, INVOICE_STATUSES, PAYMENT_METHODS } from '../constants';
import { calculateInvoiceTotals, formatCurrency, formatDate } from '../utils';
import { CAMPOS, RENGLONES_IMPUESTO, totalDeColumna } from './contrato';

/** Documento imprimible: factura, albarán, presupuesto, pedido o rectificativa. */
export type DocumentoImprimible =
  | { tipo: 'factura'; documento: Invoice }
  | { tipo: 'albaran'; documento: Albaran }
  | { tipo: 'presupuesto'; documento: Invoice }
  | { tipo: 'pedido'; documento: Invoice }
  | { tipo: 'rectificativa'; documento: Invoice };

export interface DatosDocumento {
  /** Un valor por cada clave del contrato. Las claves sin dato van en blanco. */
  campos: Record<string, string>;
  /** Filas de la tabla de líneas, cada una con las claves de COLUMNAS_LINEAS. */
  lineas: Record<string, string>[];
  /** Filas del desglose de impuestos, con las claves de COLUMNAS_IMPUESTOS. */
  impuestos: Record<string, string>[];
  /** Filas de la relación de pagos, con las claves de COLUMNAS_VENCIMIENTOS. */
  vencimientos: Record<string, string>[];
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
  /** Valores para los datos libres/manuales configurados en la plantilla. */
  datosExtras?: Record<string, string>;
}

/**
 * Cliente ocasional (sin ficha): se guarda serializado en una clave reservada
 * de `datosExtras` para no exigir una migración de base de datos. La clave se
 * llama así para que no colisione con los campos `custom_1..5` del contrato.
 */
export const CLAVE_CLIENTE_OCASIONAL = '__cliente';

/**
 * Valores de las columnas personalizadas por línea (`custom_col_N`), en una
 * clave reservada de `datosExtras`: un objeto línea id → columnas, serializado.
 * Igual que el cliente ocasional, viaja en `datosExtras` para no pedir una
 * migración de base de datos.
 */
export const CLAVE_LINEAS_CUSTOM = '__lineas';

export interface ClienteManual {
  nombre: string;
  nif: string;
  direccion: string;
  cp: string;
  ciudad: string;
  provincia: string;
  email: string;
  telefono: string;
}

/**
 * Devuelve el trozo de `datosExtras` que guarda las columnas personalizadas
 * de las líneas. Vacío cuando la factura no las usa.
 */
export function customColsDeLineas(lineItems: { id: string; customCols?: Record<string, string> }[]): Record<string, string> {
  const porLinea: Record<string, Record<string, string>> = {};
  for (const linea of lineItems) {
    const columnas = linea.customCols ?? {};
    if (Object.keys(columnas).length > 0) porLinea[linea.id] = columnas;
  }
  return { [CLAVE_LINEAS_CUSTOM]: JSON.stringify(porLinea) };
}

/**
 * Devuelve el mismo `lineItems` con cada línea tocada por su `customCols`
 * guardado en `datosExtras` (si lo tiene). Es la contrapartida de
 * `customColsDeLineas`.
 */
export function lineasConCustomCols(
  lineItems: InvoiceLineItem[],
  datosExtras?: Record<string, string>,
): InvoiceLineItem[] {
  let porLinea: Record<string, Record<string, string>> = {};
  try {
    const crudo = datosExtras?.[CLAVE_LINEAS_CUSTOM];
    if (crudo) porLinea = JSON.parse(crudo);
  } catch {
    porLinea = {};
  }
  return lineItems.map(linea => {
    const guardadas = porLinea[linea.id];
    return guardadas ? { ...linea, customCols: guardadas } : linea;
  });
}

export function clienteManualDesdeDatosExtras(datosExtras?: Record<string, string>): ClienteManual | null {
  const crudo = datosExtras?.[CLAVE_CLIENTE_OCASIONAL];
  if (!crudo) return null;
  try {
    const parcial = JSON.parse(crudo) as Partial<ClienteManual>;
    if (typeof parcial !== 'object' || parcial === null) return null;
    return {
      nombre: parcial.nombre ?? '',
      nif: parcial.nif ?? '',
      direccion: parcial.direccion ?? '',
      cp: parcial.cp ?? '',
      ciudad: parcial.ciudad ?? '',
      provincia: parcial.provincia ?? '',
      email: parcial.email ?? '',
      telefono: parcial.telefono ?? '',
    };
  } catch {
    return null;
  }
}

export function clienteManualComoDatosExtras(cliente: ClienteManual): Record<string, string> {
  return { [CLAVE_CLIENTE_OCASIONAL]: JSON.stringify(cliente) };
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

/**
 * Lee un número escrito como se escriben en España: «1.234,56».
 * Devuelve null si no hay ninguna cifra, para no sumar texto como si fuera 0.
 */
function comoNumero(valor: string | undefined): number | null {
  if (!valor) return null;
  const limpio = valor.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
  if (!/\d/.test(limpio)) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

/** Un número de recuento: sin decimales si es entero, con dos si no. */
function comoRecuento(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', ',');
}

/**
 * Las casillas de recuento del pie: número de líneas, unidades, peso y el
 * total de cada columna personalizada de la plantilla.
 *
 * `total_col_N` es lo que hace que la casilla «CAJAS» de un impreso de
 * reparto salga sola. La columna «CAJ.» no corresponde a ningún concepto
 * nuestro y se guarda como `custom_col_1`; su recuento al pie es la suma de
 * esa columna. Vale igual para bultos, palés, kilos u horas: no supone nada
 * sobre lo que se factura, así que sirve para cualquier negocio.
 */
function recuentos(
  lineas: { quantity: number; unitsPerPackage?: number; customCols?: Record<string, string> }[],
): Record<string, string> {
  const salida: Record<string, string> = {
    total_lineas: String(lineas.length),
    // Las unidades SUELTAS, contando lo que trae cada bulto: doce cajas de
    // veinticuatro son 288 botellas, y ese es el número que se comprueba al
    // descargar. Quien no vende por cajas no nota el cambio, porque sin
    // unidades por bulto un bulto es una unidad y sale lo mismo de siempre.
    total_unidades: comoRecuento(unidadesTotales(lineas)),
    // Y los bultos aparte, que es lo que se cobra y lo que se apila.
    total_bultos: comoRecuento(lineas.reduce((suma, l) => suma + (l.quantity || 0), 0)),
    total_peso: '',
  };

  const sumas = new Map<string, number>();
  for (const linea of lineas) {
    for (const [columna, valor] of Object.entries(linea.customCols ?? {})) {
      const clave = totalDeColumna(columna);
      const n = comoNumero(valor);
      if (!clave || n === null) continue;
      sumas.set(clave, (sumas.get(clave) ?? 0) + n);
    }
  }
  for (const [clave, suma] of sumas) salida[clave] = comoRecuento(suma);
  return salida;
}

/**
 * La rejilla «IMPUESTO / BASE IMP. / % / CUOTA» del pie, casilla a casilla.
 *
 * Los impresos la traen con un número fijo de renglones pintados, así que
 * cada casilla es un campo con su sitio y no una tabla que crece. El primer
 * tipo impositivo va al primer renglón, el segundo al segundo, y los
 * renglones que sobran se quedan en blanco —como en el papel.
 */
function casillasDeImpuestos(
  tramos: { rate: number; base: number; amount: number }[],
  impuesto: string,
): Record<string, string> {
  const salida: Record<string, string> = {};
  for (let n = 1; n <= RENGLONES_IMPUESTO; n++) {
    const tramo = tramos[n - 1];
    salida[`impuesto_${n}_nombre`] = tramo ? impuesto : '';
    salida[`impuesto_${n}_base`] = tramo ? formatCurrency(tramo.base) : '';
    salida[`impuesto_${n}_pct`] = tramo ? porcentaje(tramo.rate) : '';
    salida[`impuesto_${n}_cuota`] = tramo ? formatCurrency(tramo.amount) : '';
  }
  return salida;
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
  if (entrada.tipo === 'albaran') {
    return ALBARAN_STATUSES.find(e => e.value === entrada.documento.status)?.label ?? '';
  }
  return INVOICE_STATUSES.find(e => e.value === entrada.documento.status)?.label ?? '';
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
  const esFactura = entrada.tipo === 'factura' || entrada.tipo === 'rectificativa';
  const factura = ('dueDate' in doc) ? (doc as Invoice) : null;
  const impuesto = nombreImpuesto(ajustes);
  const cliente = opciones.cliente;
  // Los datos manuales viajan en el propio documento; opciones es la red de
  // seguridad para quien llame sin documento con datosExtras.
  const clienteManual = clienteManualDesdeDatosExtras(opciones.datosExtras ?? doc.datosExtras);

  /**
   * Las casillas de descuento de una línea.
   *
   * La de siempre lleva el EFECTIVO, no el primero de los tres: los
   * descuentos van en cascada y en la factura sólo cabe una casilla. Enseñar
   * el primero decía un 10% donde se había hecho un 19, y el importe de al
   * lado no cuadraba con el porcentaje impreso.
   *
   * Las otras tres están para quien quiera desglosarlos en su plantilla. Un
   * albarán no lleva cascada, así que sólo tiene el primero.
   */
  function descuentosDeLinea(linea: { discountPercent: number; discountPercent2?: number; discountPercent3?: number }) {
    const efectivo = descuentoEfectivo(linea);
    const pct = (n?: number) => (n ?? 0) > 0 ? porcentaje(n!) : '';
    return {
      descuento_pct: efectivo > 0 ? porcentaje(efectivo) : '—',
      descuento_1_pct: pct(linea.discountPercent),
      descuento_2_pct: pct(linea.discountPercent2),
      descuento_3_pct: pct(linea.discountPercent3),
    };
  }

  // --- Líneas ---
  const lineas = doc.lineItems.map((linea, indice) => ({
    indice: String(indice + 1),
    ref: linea.productRef || '',
    descripcion: linea.productName || '',
    cantidad: String(linea.quantity),
    unidad: linea.unit,
    cantidad_unidad: `${linea.quantity} ${linea.unit}`,
    // Las unidades sueltas: doce cajas de veinticuatro son 288 botellas, que
    // es el número que se cuenta al descargar el camión.
    uds_caja: udsPorBulto(linea) > 1 ? String(udsPorBulto(linea)) : '',
    uds_linea: String(linea.quantity * udsPorBulto(linea)),
    precio: formatCurrency(linea.unitPrice),
    // El EFECTIVO, no el primero de los tres. Los descuentos van en cascada y
    // en la factura sólo cabe una casilla: enseñar el primero decía un 10%
    // donde se había hecho un 19, y el importe de al lado no cuadraba con el
    // porcentaje impreso.
    ...descuentosDeLinea(linea),
    impuesto_pct: porcentaje(linea.taxRate),
    importe: formatCurrency(linea.subtotal),
    importe_impuesto: formatCurrency(linea.taxAmount),
    importe_total: formatCurrency(linea.total),
    // Columnas personalizadas de la plantilla: cada una va a su celda.
    ...(linea.customCols ?? {}),
  }));

  // --- Desglose de impuestos ---
  const impuestos = doc.taxBreakdown.map(tramo => ({
    tipo: porcentaje(tramo.rate),
    nombre: `${impuesto} ${porcentaje(tramo.rate)}`,
    base: formatCurrency(tramo.base),
    cuota: formatCurrency(tramo.amount),
    total: formatCurrency(tramo.base + tramo.amount),
  }));

  // --- Relación de pagos ---
  //
  // Casi todos los impresos traen abajo un recuadro de vencimientos y hasta
  // ahora se quedaba en blanco: no había de dónde llenarlo.
  //
  // Un documento sin fecha de vencimiento —un albarán, un presupuesto— no
  // tiene nada que decir aquí y se queda sin renglones, que es distinto de
  // imprimir un cuadro con guiones.
  const vencimientos = filasDeVencimientos(entrada, doc);

  const desgloseEnTexto = doc.taxBreakdown
    .map(t => `${impuesto} ${porcentaje(t.rate)} sobre ${formatCurrency(t.base)} — ${formatCurrency(t.amount)}`)
    .join('\n');

  // --- Campos sueltos ---
  const etiquetasTipoMap: Record<string, string> = {
    factura: 'FACTURA',
    albaran: 'ALBARÁN',
    presupuesto: 'PRESUPUESTO',
    pedido: 'PEDIDO',
    rectificativa: 'FACTURA RECTIFICATIVA',
  };
  const tipoDocumento = etiquetasTipoMap[entrada.tipo] || 'DOCUMENTO';
  // El cliente ocasional no tiene ficha: su nombre, NIF y dirección quedan en
  // la propia factura y el resto (CP, ciudad, provincia, email, teléfono) en
  // `datosExtras.__cliente`. Cuando la factura tiene ficha, la ficha manda y
  // los campos del manual se ignoran.
  const esClienteManual = !cliente && Boolean(clienteManual);
  const direccionCliente = doc.clientAddress || cliente?.address || '';
  const poblacionCliente = poblacion(
    cliente?.postalCode ?? clienteManual?.cp,
    cliente?.city ?? clienteManual?.ciudad,
    cliente?.province ?? clienteManual?.provincia,
  );

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
    cliente_cp: esClienteManual ? (clienteManual?.cp ?? '') : (cliente?.postalCode || ''),
    cliente_ciudad: esClienteManual ? (clienteManual?.ciudad ?? '') : (cliente?.city || ''),
    cliente_provincia: esClienteManual ? (clienteManual?.provincia ?? '') : (cliente?.province || ''),
    cliente_poblacion: poblacionCliente,
    cliente_email: esClienteManual ? (clienteManual?.email ?? '') : (cliente?.email || ''),
    cliente_telefono: esClienteManual ? (clienteManual?.telefono ?? '') : (cliente?.phone || ''),
    cliente_direccion_completa: juntar([direccionCliente, poblacionCliente], '\n'),

    // Documento
    doc_tipo: tipoDocumento,
    doc_titulo: `${tipoDocumento} nº ${doc.number}`,
    doc_numero: doc.number || '',
    doc_serie: doc.series || '',
    doc_fecha: formatDate(doc.issueDate),
    doc_vencimiento: factura && entrada.tipo !== 'presupuesto' && entrada.tipo !== 'albaran' ? formatDate(factura.dueDate) : '',
    doc_fecha_pago: factura?.paidDate ? formatDate(factura.paidDate) : '',
    doc_estado: etiquetaEstado(entrada),
    doc_forma_pago: factura && factura.paymentMethod && entrada.tipo !== 'presupuesto'
      ? (PAYMENT_METHODS.find(p => p.value === factura.paymentMethod)?.label ?? '')
      : '',
    doc_notas: doc.notes || '',
    doc_aviso_legal: entrada.tipo === 'albaran'
      ? 'Este albarán acredita la entrega de la mercancía y no tiene valor fiscal como factura.'
      : (entrada.tipo === 'presupuesto' ? 'Este presupuesto tiene una validez de 30 días.' : ''),
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

    // Recuentos y desglose casilla a casilla, calculados de las líneas.
    ...recuentos(doc.lineItems),
    ...casillasDeImpuestos(doc.taxBreakdown, impuesto),

    // Veri*Factu
    verifactu_huella: factura?.verifactu?.chainedHash || '',
    verifactu_huella_corta: factura?.verifactu?.chainedHash?.slice(0, 16) || '',
    verifactu_fecha: factura?.verifactu?.timestamp ? formatDate(factura.verifactu.timestamp) : '',
    verifactu_leyenda: factura?.verifactu?.chainedHash
      ? 'Factura con registro de facturación encadenado (SHA-256).'
      : '',
    verifactu_qr: opciones.qrCotejo || factura?.verifactu?.qrCodeUrl || '',

    // Datos libres / manuales
    custom_1: opciones.datosExtras?.custom_1 ?? '',
    custom_2: opciones.datosExtras?.custom_2 ?? '',
    custom_3: opciones.datosExtras?.custom_3 ?? '',
    custom_4: opciones.datosExtras?.custom_4 ?? '',
    custom_5: opciones.datosExtras?.custom_5 ?? '',
  };

  // Red de seguridad: cualquier clave del contrato que no se haya rellenado
  // arriba existe igualmente en blanco. Sin esto, pdfme dejaría el campo con
  // su contenido de plantilla (el texto que traía el PDF original) en vez de
  // vaciarlo, y la factura saldría con el dato del PDF de muestra.
  for (const campo of CAMPOS) {
    if (campos[campo.clave] === undefined) campos[campo.clave] = '';
  }

  return { campos, lineas, impuestos, vencimientos };
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

/**
 * Los renglones de la relación de pagos.
 *
 * El sistema guarda un solo vencimiento por documento, así que sale un
 * renglón. El cuadro admite más porque los impresos vienen con sitio para
 * varios —los pagos a 30/60/90 son lo normal en muchos sectores— y el día que
 * se puedan partir, el hueco ya está.
 *
 * Los días se cuentan de la fecha de emisión a la de vencimiento, que es de
 * donde sale el «a 30 días» que va escrito en el propio recuadro.
 */
function filasDeVencimientos(
  entrada: DocumentoImprimible,
  doc: { total: number; paidAmount?: number },
): Record<string, string>[] {
  if (entrada.tipo === 'albaran') return [];
  const factura = entrada.documento;
  if (!factura.dueDate) return [];

  const emision = Date.parse(factura.issueDate ?? '');
  const vence = Date.parse(factura.dueDate);
  const dias = Number.isFinite(emision) && Number.isFinite(vence)
    ? Math.round((vence - emision) / 86_400_000)
    : null;

  const cobrado = doc.paidAmount ?? 0;
  const pendiente = Math.max(0, doc.total - cobrado);

  return [{
    venc_fecha: formatDate(factura.dueDate),
    venc_dias: dias === null ? '' : `${dias} días`,
    venc_importe: formatCurrency(doc.total),
    venc_forma: PAYMENT_METHODS.find(m => m.value === factura.paymentMethod)?.label ?? '',
    // Lo que de verdad importa de un vencimiento: si sigue debiéndose.
    venc_estado: pendiente <= 0.005
      ? 'Cobrado'
      : cobrado > 0 ? `Pendiente ${formatCurrency(pendiente)}` : 'Pendiente',
  }];
}

/** Unidades sueltas que trae cada bulto de una línea; 1 si no se vende por cajas. */
function udsPorBulto(linea: { unitsPerPackage?: number }): number {
  return linea.unitsPerPackage && linea.unitsPerPackage > 0 ? linea.unitsPerPackage : 1;
}
