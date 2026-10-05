/**
 * LEER UNA FACTURA ELECTRÓNICA RECIBIDA
 *
 * Con la factura electrónica obligatoria, los proveedores mandan la factura
 * como datos estructurados y no como PDF. El RD 238/2026 admite cuatro
 * sintaxis que cumplan EN 16931: UBL, UN/CEFACT CII, EDIFACT y Facturae.
 * Aquí se leen las cuatro y se dejan en una forma común, de la que sale el
 * gasto sin teclear nada y sin pasar por la IA: los datos ya vienen
 * escritos por quien emitió la factura.
 *
 * Funciona igual en el navegador y en el servidor (sin DOM). Un fichero
 * con DOCTYPE o entidades propias se rechaza: ninguna factura las necesita
 * y son la puerta de los ataques de expansión de entidades.
 */

import { XMLParser } from 'fast-xml-parser';

export type FormatoFactura = 'ubl' | 'cii' | 'facturae' | 'edifact';

export interface LineaLeida {
  descripcion: string;
  cantidad: number;
  precio: number;
  base: number;
  tipo: number;
}

export interface ImpuestoLeido {
  tipo: number;
  base: number;
  cuota: number;
  /** Categoría EN 16931 si la trae (S, E, AE, K, G, L…). */
  categoria?: string;
}

export interface FacturaLeida {
  formato: FormatoFactura;
  /** Un abono (nota de crédito) resta: se guarda como gasto en negativo. */
  tipo: 'factura' | 'abono';
  numero: string;
  fecha: string;
  vencimiento?: string;
  moneda: string;
  emisor: { nombre: string; nif: string };
  receptor: { nombre: string; nif: string };
  lineas: LineaLeida[];
  impuestos: ImpuestoLeido[];
  base: number;
  cuota: number;
  total: number;
  /** Lo que de verdad se paga: el total menos retenciones y anticipos. */
  aPagar: number;
  retencion?: number;
  iban?: string;
  /** Número de la factura que rectifica, si es una rectificativa. */
  rectifica?: string;
  /** Lo que no cuadra o falta, para que se mire antes de guardar. */
  avisos: string[];
}

export const TAMANO_MAXIMO = 5 * 1024 * 1024;

const r2 = (n: number) => Math.round(n * 100) / 100;
const numero = (v: unknown) => {
  const n = Number(String(texto(v)).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
/* eslint-disable @typescript-eslint/no-explicit-any */
function texto(v: any): string {
  if (v === undefined || v === null) return '';
  if (typeof v === 'object') return texto(v['#text']);
  return String(v).trim();
}
const lista = <T = any>(v: T | T[] | undefined): T[] => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
const nifLimpio = (n: string) => n.toUpperCase().replace(/[^A-Z0-9]/g, '');
/** NIF sin el prefijo ES: así está en las fichas de proveedores. */
export const nifSinPais = (n: string) => {
  const l = nifLimpio(n);
  return /^ES[0-9A-Z]{9}$/.test(l) ? l.slice(2) : l;
};
/** Fechas «2026-10-05», «20261005» o «2026-10-05T10:00:00» → «2026-10-05». */
function fechaIso(v: string): string {
  const s = v.trim();
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return s.slice(0, 10);
}

const lector = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
  htmlEntities: false,
});

/**
 * El texto de un fichero respetando su codificación: algunas Facturae
 * vienen en ISO-8859-1 y, leídas como UTF-8, las tildes saldrían rotas.
 */
export function decodificarFichero(bytes: Uint8Array): string {
  const cabecera = new TextDecoder('latin1').decode(bytes.slice(0, 200));
  const m = /encoding=["']([\w-]+)["']/i.exec(cabecera);
  const codificacion = m && /^(iso-8859-1|latin1|windows-1252|iso-8859-15)$/i.test(m[1]) ? 'windows-1252' : 'utf-8';
  return new TextDecoder(codificacion).decode(bytes).replace(/^\uFEFF/, '');
}

/** ¿Es un fichero de factura electrónica (y no un PDF o una foto)? */
export function pareceFacturaElectronica(contenido: string): FormatoFactura | null {
  const s = contenido.replace(/^﻿/, '').trimStart().slice(0, 20000);
  if (/^(UNA|UNB)/.test(s) || (/UNH\+/.test(s) && /INVOIC/.test(s))) return 'edifact';
  if (!s.startsWith('<')) return null;
  if (/<([\w-]+:)?Facturae[\s>]/.test(s)) return 'facturae';
  if (/<([\w-]+:)?CrossIndustryInvoice[\s>]/.test(s)) return 'cii';
  if (/<([\w-]+:)?(Invoice|CreditNote)[\s>]/.test(s) && /oasis:names:specification:ubl/.test(s)) return 'ubl';
  return null;
}

/**
 * Lee el fichero. Facturae puede traer varias facturas en un lote, así que
 * siempre devuelve una lista. Lanza un error legible si no se puede leer.
 */
export function leerFacturaElectronica(contenido: string): FacturaLeida[] {
  if (contenido.length > TAMANO_MAXIMO) throw new Error('El fichero es demasiado grande para ser una factura.');
  if (/<!DOCTYPE|<!ENTITY/i.test(contenido)) throw new Error('El fichero trae definiciones que una factura no necesita: no se abre por seguridad.');
  const formato = pareceFacturaElectronica(contenido);
  if (!formato) throw new Error('No es una factura electrónica (UBL, Facturae, CII o EDIFACT).');
  const facturas = formato === 'edifact' ? [leerEdifact(contenido)] : leerXml(formato, lector.parse(contenido));
  return facturas.map(revisar);
}

function leerXml(formato: Exclude<FormatoFactura, 'edifact'>, doc: any): FacturaLeida[] {
  if (formato === 'ubl') return [leerUbl(doc.Invoice ?? doc.CreditNote, !!doc.CreditNote)];
  if (formato === 'cii') return [leerCii(doc.CrossIndustryInvoice)];
  return leerFacturae(doc.Facturae);
}

// ------------------------------------------------------------ UBL 2.1 (Invoice / CreditNote)

function parteUbl(p: any): { nombre: string; nif: string } {
  const party = p?.Party ?? {};
  const iva = lista(party.PartyTaxScheme).map(x => texto(x?.CompanyID)).find(Boolean);
  const legal = lista(party.PartyLegalEntity)[0];
  const nombre = texto(legal?.RegistrationName) || texto(lista(party.PartyName)[0]?.Name);
  return { nombre, nif: nifSinPais(iva || texto(legal?.CompanyID) || texto(party.EndpointID)) };
}

function leerUbl(d: any, esAbono: boolean): FacturaLeida {
  const lineas = lista(esAbono ? d.CreditNoteLine : d.InvoiceLine).map((l: any): LineaLeida => ({
    descripcion: texto(l.Item?.Name) || texto(l.Item?.Description) || 'Concepto',
    cantidad: numero(esAbono ? l.CreditedQuantity : l.InvoicedQuantity),
    precio: numero(l.Price?.PriceAmount),
    base: numero(l.LineExtensionAmount),
    tipo: numero(lista(l.Item?.ClassifiedTaxCategory)[0]?.Percent),
  }));
  // Puede venir un TaxTotal por moneda: el que trae el desglose es el de la factura.
  const taxTotal = lista(d.TaxTotal).find((t: any) => t.TaxSubtotal) ?? lista(d.TaxTotal)[0];
  const impuestos = lista(taxTotal?.TaxSubtotal).map((s: any): ImpuestoLeido => ({
    tipo: numero(s.TaxCategory?.Percent), base: numero(s.TaxableAmount), cuota: numero(s.TaxAmount), categoria: texto(s.TaxCategory?.ID) || undefined,
  }));
  const tot = d.LegalMonetaryTotal ?? {};
  const retencion = lista(d.WithholdingTaxTotal).reduce((s: number, w: any) => s + numero(w.TaxAmount), 0);
  const pago = lista(d.PaymentMeans)[0];
  const rectifica = texto(lista(d.BillingReference)[0]?.InvoiceDocumentReference?.ID);
  const total = numero(tot.TaxInclusiveAmount);
  return {
    formato: 'ubl', tipo: esAbono ? 'abono' : 'factura',
    numero: texto(d.ID), fecha: fechaIso(texto(d.IssueDate)),
    vencimiento: fechaIso(texto(d.DueDate) || texto(pago?.PaymentDueDate) || texto(lista(d.PaymentTerms)[0]?.PaymentDueDate)) || undefined,
    moneda: texto(d.DocumentCurrencyCode) || 'EUR',
    emisor: parteUbl(d.AccountingSupplierParty), receptor: parteUbl(d.AccountingCustomerParty),
    lineas, impuestos,
    base: numero(tot.TaxExclusiveAmount), cuota: numero(taxTotal?.TaxAmount), total,
    aPagar: r2((tot.PayableAmount !== undefined ? numero(tot.PayableAmount) : total) - retencion),
    retencion: retencion || undefined,
    iban: texto(pago?.PayeeFinancialAccount?.ID) || undefined,
    rectifica: rectifica || undefined,
    avisos: [],
  };
}

// ------------------------------------------------------------ UN/CEFACT CII (CrossIndustryInvoice)

function parteCii(p: any): { nombre: string; nif: string } {
  const regs = lista(p?.SpecifiedTaxRegistration).map((r: any) => r?.ID);
  const iva = regs.find((id: any) => typeof id === 'object' && id?.['@schemeID'] === 'VA') ?? regs[0];
  return { nombre: texto(p?.Name), nif: nifSinPais(texto(iva) || texto(p?.SpecifiedLegalOrganization?.ID)) };
}

function leerCii(d: any): FacturaLeida {
  const doc = d.ExchangedDocument ?? {};
  const tx = d.SupplyChainTradeTransaction ?? {};
  const acuerdo = tx.ApplicableHeaderTradeAgreement ?? {};
  const liq = tx.ApplicableHeaderTradeSettlement ?? {};
  const sum = liq.SpecifiedTradeSettlementHeaderMonetarySummation ?? {};
  const moneda = texto(liq.InvoiceCurrencyCode) || 'EUR';
  // TaxTotalAmount puede venir dos veces (moneda de la factura y de los impuestos).
  const cuota = lista(sum.TaxTotalAmount).map((x: any) => ({ v: numero(x), m: typeof x === 'object' ? x['@currencyID'] : moneda }))
    .find(x => !x.m || x.m === moneda)?.v ?? 0;
  const lineas = lista(tx.IncludedSupplyChainTradeLineItem).map((l: any): LineaLeida => ({
    descripcion: texto(l.SpecifiedTradeProduct?.Name) || 'Concepto',
    cantidad: numero(l.SpecifiedLineTradeDelivery?.BilledQuantity),
    precio: numero(l.SpecifiedLineTradeAgreement?.NetPriceProductTradePrice?.ChargeAmount),
    base: numero(l.SpecifiedLineTradeSettlement?.SpecifiedTradeSettlementLineMonetarySummation?.LineTotalAmount),
    tipo: numero(lista(l.SpecifiedLineTradeSettlement?.ApplicableTradeTax)[0]?.RateApplicablePercent),
  }));
  const tipoDoc = texto(doc.TypeCode);
  const total = numero(sum.GrandTotalAmount);
  return {
    formato: 'cii', tipo: tipoDoc === '381' ? 'abono' : 'factura',
    numero: texto(doc.ID), fecha: fechaIso(texto(doc.IssueDateTime?.DateTimeString)),
    vencimiento: fechaIso(texto(lista(liq.SpecifiedTradePaymentTerms)[0]?.DueDateDateTime?.DateTimeString)) || undefined,
    moneda,
    emisor: parteCii(acuerdo.SellerTradeParty), receptor: parteCii(acuerdo.BuyerTradeParty),
    lineas,
    impuestos: lista(liq.ApplicableTradeTax).map((t: any) => ({
      tipo: numero(t.RateApplicablePercent), base: numero(t.BasisAmount), cuota: numero(t.CalculatedAmount), categoria: texto(t.CategoryCode) || undefined,
    })),
    base: numero(sum.TaxBasisTotalAmount), cuota, total,
    aPagar: sum.DuePayableAmount !== undefined ? numero(sum.DuePayableAmount) : total,
    iban: texto(lista(liq.SpecifiedTradeSettlementPaymentMeans)[0]?.PayeePartyCreditorFinancialAccount?.IBANID) || undefined,
    rectifica: texto(lista(liq.InvoiceReferencedDocument)[0]?.IssuerAssignedID) || undefined,
    avisos: [],
  };
}

// ------------------------------------------------------------ Facturae 3.2, 3.2.1 y 3.2.2

function parteFacturae(p: any): { nombre: string; nif: string } {
  const nif = nifSinPais(texto(p?.TaxIdentification?.TaxIdentificationNumber));
  if (p?.LegalEntity) return { nombre: texto(p.LegalEntity.CorporateName), nif };
  const i = p?.Individual ?? {};
  return { nombre: [texto(i.Name), texto(i.FirstSurname), texto(i.SecondSurname)].filter(Boolean).join(' '), nif };
}

/** En Facturae el código 01 es el IVA, 03 el IGIC y 02 el IPSI; el resto no son cuotas de IVA. */
const IMPUESTOS_FACTURAE: Record<string, string> = { '01': 'S', '02': 'M', '03': 'L' };

function leerFacturae(d: any): FacturaLeida[] {
  const emisor = parteFacturae(d.Parties?.SellerParty);
  const receptor = parteFacturae(d.Parties?.BuyerParty);
  return lista(d.Invoices?.Invoice).map((f: any): FacturaLeida => {
    const cab = f.InvoiceHeader ?? {};
    const serie = texto(cab.InvoiceSeriesCode);
    const num = texto(cab.InvoiceNumber);
    const tot = f.InvoiceTotals ?? {};
    const impuestos = lista(f.TaxesOutputs?.Tax)
      .filter((t: any) => IMPUESTOS_FACTURAE[texto(t.TaxTypeCode)])
      .map((t: any): ImpuestoLeido => ({
        tipo: numero(t.TaxRate), base: numero(t.TaxableBase?.TotalAmount), cuota: numero(t.TaxAmount?.TotalAmount),
        categoria: IMPUESTOS_FACTURAE[texto(t.TaxTypeCode)],
      }));
    const total = numero(tot.InvoiceTotal);
    const plazo = lista(f.PaymentDetails?.Installment)[0];
    const retencion = numero(tot.TotalTaxesWithheld);
    return {
      formato: 'facturae', tipo: total < 0 ? 'abono' : 'factura',
      numero: serie && !num.startsWith(serie) ? `${serie}${num}` : num,
      fecha: fechaIso(texto(f.InvoiceIssueData?.IssueDate)),
      vencimiento: fechaIso(texto(plazo?.InstallmentDueDate)) || undefined,
      moneda: texto(f.InvoiceIssueData?.InvoiceCurrencyCode) || 'EUR',
      emisor, receptor,
      lineas: lista(f.Items?.InvoiceLine).map((l: any): LineaLeida => ({
        descripcion: texto(l.ItemDescription) || 'Concepto',
        cantidad: numero(l.Quantity),
        precio: numero(l.UnitPriceWithoutTax),
        base: numero(l.GrossAmount),
        tipo: numero(lista(l.TaxesOutputs?.Tax)[0]?.TaxRate),
      })),
      impuestos,
      base: numero(tot.TotalGrossAmountBeforeTaxes), cuota: numero(tot.TotalTaxOutputs), total,
      aPagar: tot.TotalExecutableAmount !== undefined ? numero(tot.TotalExecutableAmount) : r2(total - retencion),
      retencion: retencion || undefined,
      iban: texto(plazo?.AccountToBeCredited?.IBAN) || undefined,
      rectifica: texto(cab.Corrective?.InvoiceNumber) || undefined,
      avisos: [],
    };
  });
}

// ------------------------------------------------------------ EDIFACT INVOIC (D.96A y posteriores)

/**
 * EDIFACT es texto en segmentos («NAD+SU+…'»). Se leen los segmentos que
 * llevan los datos de la factura; el resto (logística, referencias de
 * pedido) no hace falta para el gasto.
 */
function leerEdifact(contenido: string): FacturaLeida {
  let componente = ':', elemento = '+', liberacion = '?', fin = "'";
  const una = /^\s*UNA(.)(.)(.)(.)(.)(.)/.exec(contenido);
  if (una) { componente = una[1]; elemento = una[2]; liberacion = una[4]; fin = una[6]; }
  const partir = (s: string, sep: string) => {
    const out: string[] = [];
    let cur = '';
    for (let i = 0; i < s.length; i++) {
      if (s[i] === liberacion && i + 1 < s.length) { cur += s[++i]; continue; }
      if (s[i] === sep) { out.push(cur); cur = ''; continue; }
      cur += s[i];
    }
    out.push(cur);
    return out;
  };
  const cuerpo = una ? contenido.replace(/^\s*UNA....../, '') : contenido;
  const segmentos = partir(cuerpo.replace(/\r?\n/g, ''), fin).map(s => s.trim()).filter(Boolean)
    .map(s => partir(s, elemento).map(e => partir(e, componente)));

  const f: FacturaLeida = {
    formato: 'edifact', tipo: 'factura', numero: '', fecha: '', moneda: 'EUR',
    emisor: { nombre: '', nif: '' }, receptor: { nombre: '', nif: '' },
    lineas: [], impuestos: [], base: 0, cuota: 0, total: 0, aPagar: 0, avisos: [],
  };
  let parte: 'SU' | 'BY' | '' = '';
  let linea: LineaLeida | null = null;
  let enResumen = false;
  let impuesto: ImpuestoLeido | null = null;
  const fechaEdi = (v: string, formato: string) => (formato === '102' ? fechaIso(v) : formato === '203' ? fechaIso(v.slice(0, 8)) : fechaIso(v));

  for (const seg of segmentos) {
    const tag = seg[0][0];
    const e = (i: number, c = 0) => seg[i]?.[c] ?? '';
    switch (tag) {
      case 'BGM':
        f.numero = e(2);
        if (e(1) === '381') f.tipo = 'abono';
        break;
      case 'DTM':
        if (e(1) === '137') f.fecha = fechaEdi(e(1, 1), e(1, 2));
        if (e(1) === '13') f.vencimiento = fechaEdi(e(1, 1), e(1, 2));
        break;
      case 'CUX':
        if (e(1, 1)) f.moneda = e(1, 1);
        break;
      case 'NAD':
        parte = e(1) === 'SU' || e(1) === 'BY' ? (e(1) as 'SU' | 'BY') : '';
        if (parte) (parte === 'SU' ? f.emisor : f.receptor).nombre = (seg[4] ?? []).filter(Boolean).join(' ') || e(3);
        break;
      case 'RFF':
        if (parte && e(1) === 'VA') (parte === 'SU' ? f.emisor : f.receptor).nif = nifSinPais(e(1, 1));
        if (e(1) === 'OI' || e(1) === 'IV') f.rectifica = e(1, 1) || f.rectifica;
        break;
      case 'FII':
        if (e(1) === 'RB' && e(2)) f.iban = e(2);
        break;
      case 'LIN':
        linea = { descripcion: '', cantidad: 0, precio: 0, base: 0, tipo: 0 };
        f.lineas.push(linea);
        break;
      case 'IMD':
        if (linea) linea.descripcion = [linea.descripcion, ...(seg[3] ?? []).slice(3)].filter(Boolean).join(' ');
        break;
      case 'QTY':
        if (linea && e(1) === '47') linea.cantidad = numero(e(1, 1));
        break;
      case 'PRI':
        if (linea && (e(1) === 'AAA' || !linea.precio)) linea.precio = numero(e(1, 1));
        break;
      case 'UNS':
        enResumen = true;
        linea = null;
        break;
      case 'TAX': {
        const tipo = numero(e(5, 3));
        if (!enResumen && linea) linea.tipo = tipo;
        if (enResumen && e(2) === 'VAT') { impuesto = { tipo, base: 0, cuota: 0, categoria: e(6) || undefined }; f.impuestos.push(impuesto); }
        break;
      }
      case 'MOA': {
        const q = e(1);
        const v = numero(e(1, 1));
        if (!enResumen && linea && q === '203') linea.base = v;
        if (enResumen) {
          if (impuesto && q === '125') impuesto.base = v;
          if (impuesto && (q === '124' || q === '150')) impuesto.cuota = v;
          if (!impuesto && q === '125') f.base = v;
          if (q === '77' || q === '86') f.total = v;
          if (q === '79' && !f.base) f.base = v;
          if (q === '176') f.cuota = v;
          if (q === '9') f.aPagar = v;
        }
        break;
      }
      default:
        break;
    }
  }
  if (!f.base) f.base = r2(f.impuestos.reduce((s, i) => s + i.base, 0));
  if (!f.cuota) f.cuota = r2(f.impuestos.reduce((s, i) => s + i.cuota, 0));
  if (!f.aPagar) f.aPagar = f.total;
  if (f.lineas.some(l => !l.descripcion)) f.lineas.forEach(l => { if (!l.descripcion) l.descripcion = 'Concepto'; });
  return f;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ------------------------------------------------------------ comprobaciones comunes

/** Avisa de lo que falta o no cuadra; no corrige nada (los datos son del proveedor). */
function revisar(f: FacturaLeida): FacturaLeida {
  const avisos: string[] = [];
  if (!f.numero) avisos.push('No trae número de factura.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.fecha)) avisos.push('No trae una fecha válida.');
  if (!f.emisor.nif) avisos.push('No trae el NIF del proveedor.');
  if (f.moneda !== 'EUR') avisos.push(`Está en ${f.moneda}: revisa los importes en euros.`);
  const sumaBases = r2(f.impuestos.reduce((s, i) => s + i.base, 0));
  const sumaCuotas = r2(f.impuestos.reduce((s, i) => s + i.cuota, 0));
  if (!f.impuestos.length) avisos.push('No trae el desglose de impuestos.');
  else if (Math.abs(sumaBases - f.base) > 0.02 || Math.abs(sumaCuotas - f.cuota) > 0.02) avisos.push('El desglose de impuestos no suma lo mismo que los totales.');
  if (Math.abs(r2(f.base + f.cuota) - f.total) > 0.02) avisos.push('Base más cuota no da el total.');
  return { ...f, avisos: [...f.avisos, ...avisos] };
}

/**
 * Un gasto por cada tipo de IVA: los modelos 303 y 420 piden la cuota
 * soportada por tipo, y el gasto del programa lleva un solo tipo.
 */
export function partesPorTipo(f: FacturaLeida): { tipo: number; base: number; cuota: number; total: number }[] {
  const signo = f.tipo === 'abono' ? -1 : 1;
  const grupos = f.impuestos.length ? f.impuestos : [{ tipo: 0, base: f.base, cuota: f.cuota }];
  const porTipo = new Map<number, { base: number; cuota: number }>();
  for (const g of grupos) {
    const a = porTipo.get(g.tipo) ?? { base: 0, cuota: 0 };
    a.base += g.base;
    a.cuota += g.cuota;
    porTipo.set(g.tipo, a);
  }
  return [...porTipo.entries()].map(([tipo, a]) => ({
    tipo, base: r2(a.base * signo), cuota: r2(a.cuota * signo), total: r2((a.base + a.cuota) * signo),
  }));
}
