/**
 * FACTURAE 3.2.2 — LA FACTURA ELECTRÓNICA ESPAÑOLA
 *
 * Es el formato que exigen las Administraciones Públicas (FACe) desde 2015
 * y el que usará la factura electrónica obligatoria entre empresas (Ley
 * 18/2022, «Crea y Crece»). Aquí sólo se COMPONE el XML; la firma XAdES va
 * aparte (lib/facturae/firmar.ts), porque necesita el certificado.
 *
 * El orden de los elementos importa: el esquema oficial (Facturaev3_2_2.xsd)
 * es una secuencia estricta y un validador rechaza un elemento fuera de
 * sitio aunque el dato sea correcto.
 *
 * Importes: los totales con 2 decimales; precios unitarios y costes de
 * línea con 6, que es lo que admite el esquema.
 */

import type { Client, CompanySettings, Invoice } from '@/lib/types';
import { desgloseDescuentos } from '@/lib/utils';
import { importeRetencion } from '@/lib/retenciones';

export const NS_FACTURAE = 'http://www.facturae.gob.es/formato/Versiones/Facturaev3_2_2.xml';
export const NS_DS = 'http://www.w3.org/2000/09/xmldsig#';

export interface Dir3 {
  oficinaContable?: string;
  organoGestor?: string;
  unidadTramitadora?: string;
}

export interface DatosFacturae {
  factura: Invoice;
  empresa: Pick<CompanySettings, 'businessName' | 'nif' | 'address' | 'city' | 'postalCode' | 'province' | 'iban' | 'igicEnabled'>;
  cliente?: Pick<Client, 'businessName' | 'nif' | 'address' | 'city' | 'postalCode' | 'province' | 'country'> & { dir3?: Dir3 };
}

/**
 * Escapado de texto en su forma canónica (C14N): sólo &, < y >, y el \r
 * como referencia. Las comillas son válidas en el texto y la canonización
 * las deja tal cual; escaparlas aquí haría que la huella de la firma no
 * coincidiera con la que calcula quien la verifica.
 */
const esc = (t: unknown) => String(t ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r/g, '&#xD;');
const d2 = (n: number) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);
const d6 = (n: number) => (Number(n) || 0).toFixed(6);
const r2 = (n: number) => Math.round(n * 100) / 100;
const recortar = (t: string, max: number) => esc(String(t ?? '').trim().slice(0, max));

/** DNI/NIE: persona física. Todo lo demás, jurídica. */
const esPersonaFisica = (nif: string) => /^([0-9]{8}|[KLMXYZ][0-9]{7})[A-Z]$/.test(nif);
const limpiarNif = (nif: string) => (nif ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * Nombre y apellidos de una persona física. En España el nombre fiscal va
 * como en el censo, «APELLIDO1 APELLIDO2 NOMBRE», y así lo guarda el
 * programa (es lo que exige Veri*Factu). Con menos de tres palabras no hay
 * forma de separarlo bien: va todo como nombre y el primer apellido repite.
 */
export function partirNombre(completo: string): { nombre: string; apellido1: string; apellido2?: string } {
  const p = completo.trim().split(/\s+/).filter(Boolean);
  if (p.length >= 3) return { apellido1: p[0], apellido2: p[1], nombre: p.slice(2).join(' ') };
  if (p.length === 2) return { apellido1: p[0], nombre: p[1] };
  return { apellido1: p[0] ?? '', nombre: p[0] ?? '' };
}

/** Código ISO 3166-1 alfa-3 del país a partir de lo que haya escrito. */
function codigoPais(pais?: string): string {
  const p = (pais ?? '').trim().toLowerCase();
  if (!p || /espa|spain|^es$|^esp$/.test(p)) return 'ESP';
  const tabla: Record<string, string> = {
    portugal: 'PRT', francia: 'FRA', france: 'FRA', alemania: 'DEU', germany: 'DEU', italia: 'ITA', italy: 'ITA',
    'reino unido': 'GBR', 'united kingdom': 'GBR', irlanda: 'IRL', 'países bajos': 'NLD', holanda: 'NLD', bélgica: 'BEL',
    andorra: 'AND', marruecos: 'MAR', méxico: 'MEX', 'estados unidos': 'USA',
  };
  return tabla[p] ?? 'ESP';
}

function direccion(d: { address?: string; city?: string; postalCode?: string; province?: string; country?: string }): string {
  const pais = codigoPais(d.country);
  if (pais === 'ESP') {
    return '<AddressInSpain>'
      + `<Address>${recortar(d.address || '-', 80)}</Address>`
      + `<PostCode>${recortar((d.postalCode || '00000').replace(/\D/g, '').padStart(5, '0').slice(0, 5), 5)}</PostCode>`
      + `<Town>${recortar(d.city || '-', 50)}</Town>`
      + `<Province>${recortar(d.province || d.city || '-', 20)}</Province>`
      + '<CountryCode>ESP</CountryCode>'
      + '</AddressInSpain>';
  }
  return '<OverseasAddress>'
    + `<Address>${recortar(d.address || '-', 80)}</Address>`
    + `<PostCodeAndTown>${recortar([d.postalCode, d.city].filter(Boolean).join(' ') || '-', 50)}</PostCodeAndTown>`
    + `<Province>${recortar(d.province || d.city || '-', 20)}</Province>`
    + `<CountryCode>${pais}</CountryCode>`
    + '</OverseasAddress>';
}

function parte(nombre: string, nif: string, dir: Parameters<typeof direccion>[0], dir3?: Dir3): string {
  const limpio = limpiarNif(nif);
  const extranjero = codigoPais(dir.country) !== 'ESP';
  const fisica = esPersonaFisica(limpio);
  const identificacion = '<TaxIdentification>'
    + `<PersonTypeCode>${fisica ? 'F' : 'J'}</PersonTypeCode>`
    + `<ResidenceTypeCode>${extranjero ? 'U' : 'R'}</ResidenceTypeCode>`
    + `<TaxIdentificationNumber>${esc((extranjero || /^[A-Z]{2}/.test(limpio) ? '' : 'ES') + limpio)}</TaxIdentificationNumber>`
    + '</TaxIdentification>';

  // Las tres unidades DIR3 que pide FACe para facturar a una Administración.
  const centros = dir3 && (dir3.oficinaContable || dir3.organoGestor || dir3.unidadTramitadora)
    ? '<AdministrativeCentres>' + ([
      ['01', dir3.oficinaContable], ['02', dir3.organoGestor], ['03', dir3.unidadTramitadora],
    ] as const).filter(([, c]) => c).map(([rol, c]) =>
      `<AdministrativeCentre><CentreCode>${recortar(c!, 10)}</CentreCode><RoleTypeCode>${rol}</RoleTypeCode>${direccion(dir)}</AdministrativeCentre>`,
    ).join('') + '</AdministrativeCentres>'
    : '';

  const quien = fisica
    ? (() => {
      const n = partirNombre(nombre);
      return '<Individual>'
        + `<Name>${recortar(n.nombre, 40)}</Name>`
        + `<FirstSurname>${recortar(n.apellido1, 40)}</FirstSurname>`
        + (n.apellido2 ? `<SecondSurname>${recortar(n.apellido2, 40)}</SecondSurname>` : '')
        + direccion(dir)
        + '</Individual>';
    })()
    : `<LegalEntity><CorporateName>${recortar(nombre || '-', 80)}</CorporateName>${direccion(dir)}</LegalEntity>`;

  return identificacion + centros + quien;
}

const UNIDADES: Record<string, string> = { ud: '01', kg: '03', litro: '04', caja: '06', palet: '05', docena: '05', pack: '05' };
const MEDIOS_PAGO: Record<string, string> = {
  efectivo: '01', domiciliacion: '02', transferencia: '04', pagare: '09', tarjeta: '19', bizum: '13',
};

function impuesto(codigo: string, tipo: number, base: number, cuota: number): string {
  return '<Tax>'
    + `<TaxTypeCode>${codigo}</TaxTypeCode>`
    + `<TaxRate>${d2(tipo)}</TaxRate>`
    + `<TaxableBase><TotalAmount>${d2(base)}</TotalAmount></TaxableBase>`
    + `<TaxAmount><TotalAmount>${d2(cuota)}</TotalAmount></TaxAmount>`
    + '</Tax>';
}

/** Lo que no se puede facturar en Facturae tal como está. Vacío = listo. */
export function problemasFacturae(d: DatosFacturae): string[] {
  const p: string[] = [];
  const f = d.factura;
  if (!['factura', 'rectificativa', undefined].includes(f.tipo)) p.push('Sólo se generan facturas y rectificativas.');
  if (f.status === 'borrador') p.push('La factura tiene que estar emitida.');
  if (!limpiarNif(d.empresa.nif)) p.push('Falta el NIF de tu empresa.');
  if (!limpiarNif(f.clientNif || d.cliente?.nif || '')) p.push('Falta el NIF del cliente: una factura electrónica no puede ir sin destinatario identificado.');
  if (!f.lineItems?.length) p.push('La factura no tiene líneas.');
  return p;
}

export function generarFacturae(d: DatosFacturae): string {
  const f = d.factura;
  const codigoImpuesto = d.empresa.igicEnabled ? '03' : '01';
  const { alPie } = desgloseDescuentos(f);

  const lineas = f.lineItems.map(l => {
    const coste = (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0);
    const bruto = Number(l.subtotal) || 0;
    const descuento = r2(coste - bruto);
    return '<InvoiceLine>'
      + `<ItemDescription>${recortar(l.productName || '-', 2500)}</ItemDescription>`
      + `<Quantity>${(Number(l.quantity) || 0).toString()}</Quantity>`
      + `<UnitOfMeasure>${UNIDADES[String(l.unit)] ?? '01'}</UnitOfMeasure>`
      + `<UnitPriceWithoutTax>${d6(l.unitPrice)}</UnitPriceWithoutTax>`
      + `<TotalCost>${d6(coste)}</TotalCost>`
      + (descuento > 0.004
        ? `<DiscountsAndRebates><Discount><DiscountReason>Descuento</DiscountReason><DiscountAmount>${d6(descuento)}</DiscountAmount></Discount></DiscountsAndRebates>`
        : '')
      + `<GrossAmount>${d6(bruto)}</GrossAmount>`
      + `<TaxesOutputs>${impuesto(codigoImpuesto, l.taxRate, bruto, Number(l.taxAmount) || bruto * (l.taxRate / 100))}</TaxesOutputs>`
      + (l.productRef ? `<ArticleCode>${recortar(l.productRef, 20)}</ArticleCode>` : '')
      + '</InvoiceLine>';
  }).join('');

  const totalBruto = r2(f.lineItems.reduce((s, l) => s + (Number(l.subtotal) || 0), 0));
  const descuentosGenerales = r2(Math.max(0, alPie));
  const baseTotal = r2(Number(f.subtotal) || totalBruto - descuentosGenerales);
  const cuotas = r2(Number(f.totalTax) || 0);
  const retenido = r2(importeRetencion(Number(f.subtotal) || 0, f.retencionPct));
  const total = r2(Number(f.total) || baseTotal + cuotas);
  const aPagar = r2(total - retenido);

  const numero = String(f.number);
  const serie = f.series && numero.startsWith(f.series) ? f.series : '';
  const numeroSinSerie = serie ? numero.slice(serie.length).replace(/^[-/\s]+/, '') || numero : numero;

  const rectificativa = f.tipo === 'rectificativa'
    ? '<Corrective>'
      + (f.documentoOrigenNumber ? `<InvoiceNumber>${recortar(f.documentoOrigenNumber, 20)}</InvoiceNumber>` : '')
      + '<ReasonCode>10</ReasonCode><ReasonDescription>Detalle Operación</ReasonDescription>'
      + `<TaxPeriod><StartDate>${f.issueDate.slice(0, 7)}-01</StartDate><EndDate>${f.issueDate.slice(0, 10)}</EndDate></TaxPeriod>`
      + '<CorrectionMethod>01</CorrectionMethod><CorrectionMethodDescription>Rectificación íntegra</CorrectionMethodDescription>'
      + '</Corrective>'
    : '';

  const cliente = d.cliente;
  const pago = d.empresa.iban || f.dueDate
    ? '<PaymentDetails><Installment>'
      + `<InstallmentDueDate>${(f.dueDate || f.issueDate).slice(0, 10)}</InstallmentDueDate>`
      + `<InstallmentAmount>${d2(aPagar)}</InstallmentAmount>`
      + `<PaymentMeans>${MEDIOS_PAGO[String(f.paymentMethod)] ?? '04'}</PaymentMeans>`
      + (d.empresa.iban && String(f.paymentMethod) === 'transferencia'
        ? `<AccountToBeCredited><IBAN>${esc(d.empresa.iban.replace(/\s/g, '').toUpperCase())}</IBAN></AccountToBeCredited>`
        : '')
      + '</Installment></PaymentDetails>'
    : '';

  return '<?xml version="1.0" encoding="UTF-8"?>'
    // Espacios de nombres en orden alfabético, como los deja la canonización.
    + `<fe:Facturae xmlns:ds="${NS_DS}" xmlns:fe="${NS_FACTURAE}">`
    + '<FileHeader>'
    + '<SchemaVersion>3.2.2</SchemaVersion><Modality>I</Modality><InvoiceIssuerType>EM</InvoiceIssuerType>'
    + '<Batch>'
    + `<BatchIdentifier>${recortar(`${limpiarNif(d.empresa.nif)}${numero}`, 70)}</BatchIdentifier>`
    + '<InvoicesCount>1</InvoicesCount>'
    + `<TotalInvoicesAmount><TotalAmount>${d2(total)}</TotalAmount></TotalInvoicesAmount>`
    + `<TotalOutstandingAmount><TotalAmount>${d2(aPagar)}</TotalAmount></TotalOutstandingAmount>`
    + `<TotalExecutableAmount><TotalAmount>${d2(aPagar)}</TotalAmount></TotalExecutableAmount>`
    + '<InvoiceCurrencyCode>EUR</InvoiceCurrencyCode>'
    + '</Batch>'
    + '</FileHeader>'
    + '<Parties>'
    + `<SellerParty>${parte(d.empresa.businessName, d.empresa.nif, d.empresa)}</SellerParty>`
    + `<BuyerParty>${parte(cliente?.businessName || f.clientName, f.clientNif || cliente?.nif || '', cliente ?? { address: f.clientAddress }, cliente?.dir3)}</BuyerParty>`
    + '</Parties>'
    + '<Invoices><Invoice>'
    + '<InvoiceHeader>'
    + `<InvoiceNumber>${recortar(numeroSinSerie, 20)}</InvoiceNumber>`
    + (serie ? `<InvoiceSeriesCode>${recortar(serie, 20)}</InvoiceSeriesCode>` : '')
    + '<InvoiceDocumentType>FC</InvoiceDocumentType>'
    + `<InvoiceClass>${f.tipo === 'rectificativa' ? 'OR' : 'OO'}</InvoiceClass>`
    + rectificativa
    + '</InvoiceHeader>'
    + '<InvoiceIssueData>'
    + `<IssueDate>${f.issueDate.slice(0, 10)}</IssueDate>`
    + '<InvoiceCurrencyCode>EUR</InvoiceCurrencyCode><TaxCurrencyCode>EUR</TaxCurrencyCode><LanguageName>es</LanguageName>'
    + '</InvoiceIssueData>'
    + `<TaxesOutputs>${(f.taxBreakdown ?? []).map(t => impuesto(codigoImpuesto, t.rate, t.base, t.amount)).join('')}</TaxesOutputs>`
    + (retenido > 0 && f.retencionPct
      ? `<TaxesWithheld>${impuesto('04', f.retencionPct, Number(f.subtotal) || baseTotal, retenido)}</TaxesWithheld>`
      : '')
    + '<InvoiceTotals>'
    + `<TotalGrossAmount>${d2(totalBruto)}</TotalGrossAmount>`
    + (descuentosGenerales > 0.004
      ? `<GeneralDiscounts><Discount><DiscountReason>Descuento</DiscountReason><DiscountAmount>${d2(descuentosGenerales)}</DiscountAmount></Discount></GeneralDiscounts>`
      : '')
    + `<TotalGeneralDiscounts>${d2(descuentosGenerales)}</TotalGeneralDiscounts>`
    + '<TotalGeneralSurcharges>0.00</TotalGeneralSurcharges>'
    + `<TotalGrossAmountBeforeTaxes>${d2(baseTotal)}</TotalGrossAmountBeforeTaxes>`
    + `<TotalTaxOutputs>${d2(cuotas)}</TotalTaxOutputs>`
    + `<TotalTaxesWithheld>${d2(retenido)}</TotalTaxesWithheld>`
    + `<InvoiceTotal>${d2(total)}</InvoiceTotal>`
    + `<TotalOutstandingAmount>${d2(aPagar)}</TotalOutstandingAmount>`
    + `<TotalExecutableAmount>${d2(aPagar)}</TotalExecutableAmount>`
    + '</InvoiceTotals>'
    + `<Items>${lineas}</Items>`
    + pago
    + (f.notes?.trim() ? `<AdditionalData><InvoiceAdditionalInformation>${recortar(f.notes, 2500)}</InvoiceAdditionalInformation></AdditionalData>` : '')
    + '</Invoice></Invoices>'
    + '</fe:Facturae>';
}
