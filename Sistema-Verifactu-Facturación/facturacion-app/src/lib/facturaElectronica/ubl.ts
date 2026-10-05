/**
 * FACTURA ELECTRÓNICA ENTRE EMPRESAS — UBL 2.1 CONFORME A EN 16931
 *
 * La factura electrónica obligatoria entre empresarios (Ley 18/2022 «Crea y
 * Crece», RD 238/2026) se intercambia por la solución pública de la AEAT o
 * por plataformas privadas, y la Orden HAC/1028/2026 fija para la solución
 * pública el modelo semántico europeo EN 16931 en sintaxis UBL. Quien use
 * una plataforma privada tiene que mandar además a la AEAT una copia fiel,
 * también en UBL. Así que, sea cual sea el canal, esta es la factura.
 *
 * Aquí sólo se COMPONE el XML. Las reglas de negocio de EN 16931 (las
 * BR-xx del CEN) se cumplen por construcción:
 *  - todo se calcula en céntimos enteros, para que las sumas cuadren
 *    exactamente (BR-CO-10, 13, 14, 15 y 16 no admiten ni un céntimo);
 *  - las bases y cuotas por tipo son las de la factura emitida (las mismas
 *    que van a Veri*Factu). El descuento al pie se reparte por tipo como
 *    un descuento de documento con su categoría;
 *  - si el total de la factura difiere en un céntimo de base + cuota por
 *    cómo se redondeó al emitir, la diferencia va como redondeo (BT-114) y
 *    el importe a pagar es exactamente el total de la factura.
 *
 * Lo que EN 16931 no recoge se dice como se puede:
 *  - la retención de IRPF no cambia el total de la factura (ver
 *    retenciones.ts): va en WithholdingTaxTotal y en una nota con el
 *    importe que de verdad se cobra;
 *  - el IGIC es la categoría «L» de la norma (impuesto general indirecto
 *    canario).
 *
 * Los ficheros generados se validan en desarrollo con el esquema UBL 2.1 y
 * con las reglas oficiales del CEN (EN16931-UBL-validation, versión 1.3.16).
 */

import type { Client, CompanySettings, Invoice, InvoiceLineItem, TaxBreakdown } from '@/lib/types';
import { calculateInvoiceTotals, calculateLineSubtotal } from '@/lib/utils';
import { importeRetencion } from '@/lib/retenciones';

export const NS_INVOICE = 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2';
export const NS_CREDIT_NOTE = 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2';
export const NS_CAC = 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2';
export const NS_CBC = 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2';
/** EN 16931 sin especialización (CIUS): el identificador de la norma. */
export const PERSONALIZACION_EN16931 = 'urn:cen.eu:en16931:2017';
/** Esquema de dirección electrónica de la lista EAS para el NIF-IVA español. */
export const EAS_NIF_ES = '9920';

export interface DatosUbl {
  factura: Invoice;
  empresa: Pick<CompanySettings, 'businessName' | 'nif' | 'address' | 'city' | 'postalCode' | 'province' | 'iban' | 'igicEnabled'>
    & Partial<Pick<CompanySettings, 'tradeName' | 'email' | 'phone'>>;
  cliente?: Pick<Client, 'businessName' | 'nif' | 'address' | 'city' | 'postalCode' | 'province' | 'country'>
    & Partial<Pick<Client, 'vatNumber' | 'email'>>;
  /** Fecha de la factura rectificada, si se conoce (BT-26). */
  fechaRectificada?: string;
}

// ------------------------------------------------------------ utilidades

const esc = (t: unknown) => String(t ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // Caracteres de control: XML 1.0 no los admite y un validador rechaza el fichero entero.
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const cent = (n: number) => Math.round((Number(n) || 0) * 100);
const imp = (c: number) => {
  const s = c < 0 ? '-' : '';
  const a = Math.abs(c);
  return `${s}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`;
};
/** Un número sin ceros de sobra: 21 → «21», 10.5 → «10.5», 2.125 → «2.125». */
const num = (n: number, decimales = 6) => {
  const s = (Number(n) || 0).toFixed(decimales).replace(/\.?0+$/, '');
  return s === '-0' ? '0' : s;
};
const fecha = (f?: string) => (f ?? '').slice(0, 10);
const texto = (t: string | undefined, max: number) => esc(String(t ?? '').trim().slice(0, max));

export const limpiarNif = (nif?: string) => (nif ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const PAISES: Record<string, string> = {
  'españa': 'ES', espana: 'ES', spain: 'ES', esp: 'ES', portugal: 'PT', francia: 'FR', france: 'FR', alemania: 'DE', germany: 'DE',
  italia: 'IT', italy: 'IT', 'reino unido': 'GB', 'united kingdom': 'GB', irlanda: 'IE', 'países bajos': 'NL', 'paises bajos': 'NL',
  holanda: 'NL', 'bélgica': 'BE', belgica: 'BE', andorra: 'AD', marruecos: 'MA', 'méxico': 'MX', mexico: 'MX', 'estados unidos': 'US',
  austria: 'AT', suiza: 'CH', polonia: 'PL', suecia: 'SE', dinamarca: 'DK', grecia: 'GR', luxemburgo: 'LU', 'rumanía': 'RO', rumania: 'RO',
};

/** Código ISO 3166-1 alfa-2 a partir de lo que haya escrito en la ficha. Vacío = España. */
export function paisIso2(pais?: string): string {
  const p = (pais ?? '').trim();
  if (!p) return 'ES';
  if (/^[A-Za-z]{2}$/.test(p)) return p.toUpperCase();
  return PAISES[p.toLowerCase()] ?? 'ES';
}

const NIF_ESPANOL = /^([0-9]{8}[A-Z]|[KLMXYZ][0-9]{7}[A-Z]|[ABCDEFGHJNPQRSUVW][0-9]{7}[0-9A-J])$/;

/** El NIF-IVA: con el prefijo del país (BR-CO-09). «B12345678» → «ESB12345678». */
export function nifIva(nif: string | undefined, pais = 'ES'): string {
  const n = limpiarNif(nif);
  if (!n) return '';
  if (n.startsWith('ES') && NIF_ESPANOL.test(n.slice(2))) return n;
  if (NIF_ESPANOL.test(n)) return `ES${n}`;
  if (/^[A-Z]{2}[0-9A-Z]{2,13}$/.test(n) && n.slice(0, 2) === pais) return n;
  return `${pais}${n}`;
}

/** El NIF sin el prefijo del país, que es como va en el registro mercantil y en Veri*Factu. */
const nifNacional = (nif?: string) => {
  const n = limpiarNif(nif);
  return n.startsWith('ES') && NIF_ESPANOL.test(n.slice(2)) ? n.slice(2) : n;
};

// ------------------------------------------------------------ categorías de impuesto

export type CategoriaIva = 'S' | 'E' | 'AE' | 'K' | 'G' | 'L';

interface Categoria { id: CategoriaIva; codigoExencion?: string; motivoExencion?: string }

/**
 * La categoría de impuesto de EN 16931 (UNCL5305) de una línea.
 * IGIC → L. Con tipo 0: intracomunitaria (K), exportación (G), inversión
 * del sujeto pasivo (AE) o exenta (E). Con tipo: la general (S).
 */
export function categoriaDe(f: Pick<Invoice, 'esIntracomunitaria' | 'claveRegimenIva'>, igic: boolean, tipo: number): Categoria {
  if (igic) return { id: 'L' };
  if (tipo === 0) {
    if (f.esIntracomunitaria || f.claveRegimenIva === '11') {
      return { id: 'K', codigoExencion: 'VATEX-EU-IC', motivoExencion: 'Entrega intracomunitaria exenta (art. 25 LIVA)' };
    }
    if (f.claveRegimenIva === '02') return { id: 'G', codigoExencion: 'VATEX-EU-G', motivoExencion: 'Exportación exenta (art. 21 LIVA)' };
    if (f.claveRegimenIva === '12') {
      return { id: 'AE', codigoExencion: 'VATEX-EU-AE', motivoExencion: 'Inversión del sujeto pasivo (art. 84.Uno.2.º LIVA)' };
    }
    return { id: 'E', motivoExencion: 'Operación exenta de IVA' };
  }
  return { id: 'S' };
}

const UNIDADES: Record<string, string> = {
  ud: 'C62', kg: 'KGM', litro: 'LTR', caja: 'XBX', palet: 'XPX', docena: 'DZN', pack: 'XPK',
};

/** Medios de pago UNCL4461. Transferencia sin IBAN no se puede decir como 58 (BR-61). */
function medioDePago(metodo: string | undefined, iban: string): string {
  switch (metodo) {
    case 'transferencia': return iban ? '58' : '1';
    case 'domiciliacion': return '49';
    case 'efectivo': return '10';
    case 'tarjeta': return '48';
    case 'bizum': return '68';
    case 'pagare': return '60';
    default: return iban ? '58' : '1';
  }
}

// ------------------------------------------------------------ el modelo con los importes ya cuadrados

interface Linea {
  id: number;
  nombre: string;
  referencia?: string;
  cantidad: number;
  unidad: string;
  precio: number;
  /** Céntimos: neto de la línea, bruto (cantidad × precio) y ajuste (descuento > 0, cargo < 0). */
  neto: number;
  bruto: number;
  ajuste: number;
  categoria: Categoria;
  tipo: number;
}

interface Grupo { clave: string; categoria: Categoria; tipo: number; base: number; cuota: number; sumaLineas: number }

export interface ModeloUbl {
  esAbono: boolean;
  signo: 1 | -1;
  lineas: Linea[];
  grupos: Grupo[];
  /** Céntimos, todos con el signo del documento ya aplicado (en un abono, positivos). */
  sumaLineas: number;
  descuentos: number;
  cargos: number;
  baseTotal: number;
  cuotaTotal: number;
  totalConImpuestos: number;
  redondeo: number;
  aPagar: number;
  retenido: number;
}

const claveGrupo = (c: Categoria, tipo: number) => `${c.id}|${tipo}`;

/** El desglose por tipo de la factura; si no lo trae (facturas muy antiguas), se recalcula igual que al emitir. */
function desgloseDe(f: Invoice): TaxBreakdown[] {
  if (f.taxBreakdown?.length) return f.taxBreakdown;
  return calculateInvoiceTotals(f.lineItems, [f.globalDiscountPercent1 ?? 0, f.globalDiscountPercent2 ?? 0, f.globalDiscountPercent3 ?? 0]).taxBreakdown;
}

const netoDeLinea = (l: InvoiceLineItem) => cent(
  Number.isFinite(Number(l.subtotal))
    ? Number(l.subtotal)
    : calculateLineSubtotal(l.quantity, l.unitPrice, l.discountPercent, l.discountPercent2, l.discountPercent3),
);

export function modeloUbl(d: DatosUbl): ModeloUbl {
  const f = d.factura;
  const igic = !!d.empresa.igicEnabled;
  const esAbono = (Number(f.total) || 0) < 0;
  const signo: 1 | -1 = esAbono ? -1 : 1;

  const lineas: Linea[] = f.lineItems.map((l, i) => {
    let cantidad = Number(l.quantity) || 0;
    let precio = Number(l.unitPrice) || 0;
    // EN 16931 no admite precios negativos (BR-27): una línea de «descuento»
    // con precio negativo se dice con cantidad negativa y precio positivo.
    if (precio < 0) { precio = -precio; cantidad = -cantidad; }
    cantidad *= signo;
    const neto = netoDeLinea(l) * signo;
    const bruto = cent(cantidad * precio);
    const tipo = Number(l.taxRate) || 0;
    return {
      id: i + 1, nombre: l.productName || 'Concepto', referencia: l.productRef || undefined,
      cantidad, unidad: UNIDADES[String(l.unit)] ?? 'C62', precio, neto, bruto, ajuste: bruto - neto,
      categoria: categoriaDe(f, igic, tipo), tipo,
    };
  });

  const grupos = new Map<string, Grupo>();
  for (const l of lineas) {
    const k = claveGrupo(l.categoria, l.tipo);
    const g = grupos.get(k) ?? { clave: k, categoria: l.categoria, tipo: l.tipo, base: 0, cuota: 0, sumaLineas: 0 };
    g.sumaLineas += l.neto;
    grupos.set(k, g);
  }
  for (const t of desgloseDe(f)) {
    const tipo = Number(t.rate) || 0;
    const k = claveGrupo(categoriaDe(f, igic, tipo), tipo);
    const g = grupos.get(k);
    if (!g) continue;
    g.base += cent(t.base) * signo;
    g.cuota += cent(t.amount) * signo;
  }

  const lista = [...grupos.values()];
  let descuentos = 0;
  let cargos = 0;
  for (const g of lista) {
    const dif = g.sumaLineas - g.base;
    if (dif > 0) descuentos += dif; else cargos += -dif;
  }
  const sumaLineas = lineas.reduce((s, l) => s + l.neto, 0);
  const baseTotal = sumaLineas - descuentos + cargos;
  const cuotaTotal = lista.reduce((s, g) => s + g.cuota, 0);
  const totalConImpuestos = baseTotal + cuotaTotal;
  const totalFactura = cent(f.total) * signo;
  const redondeo = totalFactura - totalConImpuestos;
  const retenido = cent(importeRetencion(Math.abs(Number(f.subtotal) || 0), f.retencionPct));

  return {
    esAbono, signo, lineas, grupos: lista, sumaLineas, descuentos, cargos, baseTotal, cuotaTotal,
    totalConImpuestos, redondeo, aPagar: totalConImpuestos + redondeo, retenido,
  };
}

// ------------------------------------------------------------ comprobaciones previas

/** Lo que impide generar la factura electrónica tal como está. Vacío = lista. */
export function problemasUbl(d: DatosUbl): string[] {
  const p: string[] = [];
  const f = d.factura;
  if (!['factura', 'rectificativa', undefined].includes(f.tipo)) p.push('Sólo las facturas y las rectificativas llevan factura electrónica.');
  if (f.sentido === 'compra') p.push('Es un documento de compra: la factura electrónica la emite tu proveedor.');
  if (f.status === 'borrador') p.push('La factura tiene que estar emitida.');
  if (f.status === 'anulada') p.push('La factura está anulada.');
  if (f.tipoFacturaFiscal === 'F2') p.push('Es un ticket (factura simplificada): no lleva factura electrónica entre empresas.');
  if (!limpiarNif(d.empresa.nif)) p.push('Falta el NIF de tu empresa.');
  if (!d.empresa.businessName?.trim()) p.push('Falta la razón social de tu empresa.');
  const nifCliente = f.clientNif || d.cliente?.nif || d.cliente?.vatNumber;
  if (!limpiarNif(nifCliente)) p.push('Falta el NIF del cliente: la factura electrónica va siempre a un destinatario identificado.');
  if (!(f.clientName || d.cliente?.businessName)?.trim()) p.push('Falta el nombre del cliente.');
  if (!f.lineItems?.length) p.push('La factura no tiene líneas.');
  if (f.tipo === 'rectificativa' && !f.documentoOrigenNumber) p.push('Una rectificativa tiene que decir qué factura rectifica.');
  if (p.length) return p;

  const m = modeloUbl(d);
  if (Math.abs(m.redondeo) > 2) {
    p.push(`Los importes de la factura no cuadran con sus líneas (diferencia de ${imp(Math.abs(m.redondeo))} €).`);
  }
  const k = m.grupos.find(g => g.categoria.id === 'K');
  if (k && !limpiarNif(d.cliente?.vatNumber || f.clientVatNumber)) {
    p.push('Una entrega intracomunitaria necesita el NIF-IVA europeo del cliente.');
  }
  return p;
}

// ------------------------------------------------------------ el XML

const cat = (c: Categoria, tipo: number, conMotivo: boolean, etiqueta = 'TaxCategory') =>
  `<cac:${etiqueta}><cbc:ID>${c.id}</cbc:ID><cbc:Percent>${num(tipo, 2)}</cbc:Percent>`
  + (conMotivo && c.codigoExencion ? `<cbc:TaxExemptionReasonCode>${c.codigoExencion}</cbc:TaxExemptionReasonCode>` : '')
  + (conMotivo && c.motivoExencion ? `<cbc:TaxExemptionReason>${esc(c.motivoExencion)}</cbc:TaxExemptionReason>` : '')
  + `<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:${etiqueta}>`;

function direccion(dir: { address?: string; city?: string; postalCode?: string; province?: string }, pais: string): string {
  return '<cac:PostalAddress>'
    + (dir.address?.trim() ? `<cbc:StreetName>${texto(dir.address, 200)}</cbc:StreetName>` : '')
    + (dir.city?.trim() ? `<cbc:CityName>${texto(dir.city, 100)}</cbc:CityName>` : '')
    + (dir.postalCode?.trim() ? `<cbc:PostalZone>${texto(dir.postalCode, 20)}</cbc:PostalZone>` : '')
    + (dir.province?.trim() ? `<cbc:CountrySubentity>${texto(dir.province, 100)}</cbc:CountrySubentity>` : '')
    + `<cac:Country><cbc:IdentificationCode>${pais}</cbc:IdentificationCode></cac:Country>`
    + '</cac:PostalAddress>';
}

function parte(o: {
  nombre: string; comercial?: string; nif: string; iva: string; pais: string; email?: string; telefono?: string;
  dir: { address?: string; city?: string; postalCode?: string; province?: string };
}): string {
  // La dirección electrónica (BT-34/BT-49) con el esquema 9920 sólo vale para NIF españoles.
  const endpoint = o.iva.startsWith('ES') ? `<cbc:EndpointID schemeID="${EAS_NIF_ES}">${esc(o.iva)}</cbc:EndpointID>` : '';
  const contacto = o.email || o.telefono
    ? '<cac:Contact>'
      + (o.telefono ? `<cbc:Telephone>${texto(o.telefono, 40)}</cbc:Telephone>` : '')
      + (o.email ? `<cbc:ElectronicMail>${texto(o.email, 120)}</cbc:ElectronicMail>` : '')
      + '</cac:Contact>'
    : '';
  return '<cac:Party>'
    + endpoint
    + (o.comercial && o.comercial.trim() && o.comercial.trim() !== o.nombre.trim() ? `<cac:PartyName><cbc:Name>${texto(o.comercial, 200)}</cbc:Name></cac:PartyName>` : '')
    + direccion(o.dir, o.pais)
    + (o.iva ? `<cac:PartyTaxScheme><cbc:CompanyID>${esc(o.iva)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` : '')
    + `<cac:PartyLegalEntity><cbc:RegistrationName>${texto(o.nombre || '-', 200)}</cbc:RegistrationName>`
    + (o.nif ? `<cbc:CompanyID>${esc(o.nif)}</cbc:CompanyID>` : '')
    + '</cac:PartyLegalEntity>'
    + contacto
    + '</cac:Party>';
}

const ajusteXml = (cargo: boolean, motivo: string, importe: number, base?: number, categoria?: string) =>
  '<cac:AllowanceCharge>'
  + `<cbc:ChargeIndicator>${cargo}</cbc:ChargeIndicator>`
  + `<cbc:AllowanceChargeReason>${esc(motivo)}</cbc:AllowanceChargeReason>`
  + `<cbc:Amount currencyID="EUR">${imp(importe)}</cbc:Amount>`
  + (base !== undefined && base > 0 ? `<cbc:BaseAmount currencyID="EUR">${imp(base)}</cbc:BaseAmount>` : '')
  + (categoria ?? '')
  + '</cac:AllowanceCharge>';

/** La factura en UBL 2.1 (Invoice, o CreditNote si su total es negativo). */
export function generarUbl(d: DatosUbl): string {
  const f = d.factura;
  const m = modeloUbl(d);
  const raiz = m.esAbono ? 'CreditNote' : 'Invoice';
  const ns = m.esAbono ? NS_CREDIT_NOTE : NS_INVOICE;
  const iban = (d.empresa.iban ?? '').replace(/\s/g, '').toUpperCase();
  const paisCliente = paisIso2(d.cliente?.country);
  const nifCliente = f.clientNif || d.cliente?.nif || '';
  const ivaCliente = f.clientVatNumber || d.cliente?.vatNumber
    ? nifIva(f.clientVatNumber || d.cliente?.vatNumber, paisCliente)
    : nifIva(nifCliente, paisCliente);
  const tipoDoc = m.esAbono ? '381' : f.tipo === 'rectificativa' ? '384' : '380';

  const notas: string[] = [];
  if (f.notes?.trim()) notas.push(f.notes.trim());
  if (m.retenido > 0 && f.retencionPct) {
    notas.push(`Retención de IRPF del ${num(f.retencionPct, 2)} %: ${imp(m.retenido).replace('.', ',')} €. `
      + `Importe a cobrar: ${imp(m.aPagar - m.retenido).replace('.', ',')} €.`);
  }

  const lineas = m.lineas.map(l => {
    const etiqueta = m.esAbono ? 'CreditNoteLine' : 'InvoiceLine';
    const cantidad = m.esAbono ? 'CreditedQuantity' : 'InvoicedQuantity';
    const ajuste = l.ajuste === 0 ? ''
      : l.ajuste > 0 ? ajusteXml(false, 'Descuento', l.ajuste, l.bruto)
        : ajusteXml(true, 'Ajuste de redondeo', -l.ajuste);
    return `<cac:${etiqueta}>`
      + `<cbc:ID>${l.id}</cbc:ID>`
      + `<cbc:${cantidad} unitCode="${l.unidad}">${num(l.cantidad, 6)}</cbc:${cantidad}>`
      + `<cbc:LineExtensionAmount currencyID="EUR">${imp(l.neto)}</cbc:LineExtensionAmount>`
      + ajuste
      + '<cac:Item>'
      + `<cbc:Name>${texto(l.nombre, 500)}</cbc:Name>`
      + (l.referencia ? `<cac:SellersItemIdentification><cbc:ID>${texto(l.referencia, 60)}</cbc:ID></cac:SellersItemIdentification>` : '')
      + cat(l.categoria, l.tipo, false, 'ClassifiedTaxCategory')
      + '</cac:Item>'
      + `<cac:Price><cbc:PriceAmount currencyID="EUR">${num(l.precio, 6)}</cbc:PriceAmount></cac:Price>`
      + `</cac:${etiqueta}>`;
  }).join('');

  // Descuento al pie: uno por cada tipo, para que cada base cuadre con sus líneas (BR-S-08).
  const ajustesDocumento = m.grupos.map(g => {
    const dif = g.sumaLineas - g.base;
    if (dif === 0) return '';
    return dif > 0
      ? ajusteXml(false, 'Descuento al pie', dif, undefined, cat(g.categoria, g.tipo, false))
      : ajusteXml(true, 'Ajuste de redondeo', -dif, undefined, cat(g.categoria, g.tipo, false));
  }).join('');

  const desglose = m.grupos.map(g => '<cac:TaxSubtotal>'
    + `<cbc:TaxableAmount currencyID="EUR">${imp(g.base)}</cbc:TaxableAmount>`
    + `<cbc:TaxAmount currencyID="EUR">${imp(g.cuota)}</cbc:TaxAmount>`
    + cat(g.categoria, g.tipo, true)
    + '</cac:TaxSubtotal>').join('');

  const intracomunitaria = m.grupos.some(g => g.categoria.id === 'K');
  const entrega = intracomunitaria
    ? `<cac:Delivery><cbc:ActualDeliveryDate>${fecha(f.issueDate)}</cbc:ActualDeliveryDate>`
      + `<cac:DeliveryLocation><cac:Address><cac:Country><cbc:IdentificationCode>${paisCliente}</cbc:IdentificationCode></cac:Country></cac:Address></cac:DeliveryLocation></cac:Delivery>`
    : '';

  const vencimiento = fecha(f.dueDate || f.issueDate);
  const pago = '<cac:PaymentMeans>'
    + `<cbc:PaymentMeansCode>${medioDePago(String(f.paymentMethod ?? ''), iban)}</cbc:PaymentMeansCode>`
    + (m.esAbono ? `<cbc:PaymentDueDate>${vencimiento}</cbc:PaymentDueDate>` : '')
    + `<cbc:PaymentID>${texto(f.number, 140)}</cbc:PaymentID>`
    + (iban && medioDePago(String(f.paymentMethod ?? ''), iban) === '58'
      ? `<cac:PayeeFinancialAccount><cbc:ID>${esc(iban)}</cbc:ID></cac:PayeeFinancialAccount>` : '')
    + '</cac:PaymentMeans>';

  const retencion = m.retenido > 0 && f.retencionPct
    ? '<cac:WithholdingTaxTotal>'
      + `<cbc:TaxAmount currencyID="EUR">${imp(m.retenido)}</cbc:TaxAmount>`
      + '<cac:TaxSubtotal>'
      + `<cbc:TaxableAmount currencyID="EUR">${imp(cent(Math.abs(Number(f.subtotal) || 0)))}</cbc:TaxableAmount>`
      + `<cbc:TaxAmount currencyID="EUR">${imp(m.retenido)}</cbc:TaxAmount>`
      + `<cac:TaxCategory><cbc:Percent>${num(f.retencionPct, 2)}</cbc:Percent><cac:TaxScheme><cbc:ID>IRPF</cbc:ID></cac:TaxScheme></cac:TaxCategory>`
      + '</cac:TaxSubtotal></cac:WithholdingTaxTotal>'
    : '';

  return '<?xml version="1.0" encoding="UTF-8"?>'
    + `<${raiz} xmlns="${ns}" xmlns:cac="${NS_CAC}" xmlns:cbc="${NS_CBC}">`
    + `<cbc:CustomizationID>${PERSONALIZACION_EN16931}</cbc:CustomizationID>`
    + `<cbc:ID>${texto(f.number, 120)}</cbc:ID>`
    + `<cbc:IssueDate>${fecha(f.issueDate)}</cbc:IssueDate>`
    + (m.esAbono ? '' : `<cbc:DueDate>${vencimiento}</cbc:DueDate>`)
    + `<cbc:${raiz}TypeCode>${tipoDoc}</cbc:${raiz}TypeCode>`
    + notas.map(n => `<cbc:Note>${texto(n, 1000)}</cbc:Note>`).join('')
    + '<cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>'
    + (f.tipo === 'rectificativa' && f.documentoOrigenNumber
      ? '<cac:BillingReference><cac:InvoiceDocumentReference>'
        + `<cbc:ID>${texto(f.documentoOrigenNumber, 120)}</cbc:ID>`
        + (d.fechaRectificada ? `<cbc:IssueDate>${fecha(d.fechaRectificada)}</cbc:IssueDate>` : '')
        + '</cac:InvoiceDocumentReference></cac:BillingReference>'
      : '')
    + '<cac:AccountingSupplierParty>'
    + parte({
      nombre: d.empresa.businessName, comercial: d.empresa.tradeName, nif: nifNacional(d.empresa.nif), iva: nifIva(d.empresa.nif, 'ES'),
      pais: 'ES', email: d.empresa.email, telefono: d.empresa.phone, dir: d.empresa,
    })
    + '</cac:AccountingSupplierParty>'
    + '<cac:AccountingCustomerParty>'
    + parte({
      nombre: d.cliente?.businessName || f.clientName, nif: paisCliente === 'ES' ? nifNacional(nifCliente) : limpiarNif(nifCliente),
      iva: ivaCliente, pais: paisCliente, email: d.cliente?.email,
      dir: d.cliente ?? { address: f.clientAddress },
    })
    + '</cac:AccountingCustomerParty>'
    + entrega
    + pago
    + ajustesDocumento
    + `<cac:TaxTotal><cbc:TaxAmount currencyID="EUR">${imp(m.cuotaTotal)}</cbc:TaxAmount>${desglose}</cac:TaxTotal>`
    + retencion
    + '<cac:LegalMonetaryTotal>'
    + `<cbc:LineExtensionAmount currencyID="EUR">${imp(m.sumaLineas)}</cbc:LineExtensionAmount>`
    + `<cbc:TaxExclusiveAmount currencyID="EUR">${imp(m.baseTotal)}</cbc:TaxExclusiveAmount>`
    + `<cbc:TaxInclusiveAmount currencyID="EUR">${imp(m.totalConImpuestos)}</cbc:TaxInclusiveAmount>`
    + (m.descuentos ? `<cbc:AllowanceTotalAmount currencyID="EUR">${imp(m.descuentos)}</cbc:AllowanceTotalAmount>` : '')
    + (m.cargos ? `<cbc:ChargeTotalAmount currencyID="EUR">${imp(m.cargos)}</cbc:ChargeTotalAmount>` : '')
    + (m.redondeo ? `<cbc:PayableRoundingAmount currencyID="EUR">${imp(m.redondeo)}</cbc:PayableRoundingAmount>` : '')
    + `<cbc:PayableAmount currencyID="EUR">${imp(m.aPagar)}</cbc:PayableAmount>`
    + '</cac:LegalMonetaryTotal>'
    + lineas
    + `</${raiz}>`;
}
