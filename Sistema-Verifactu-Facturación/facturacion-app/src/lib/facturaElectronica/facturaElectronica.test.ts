import { describe, expect, it } from 'vitest';
import { generarFacturae } from '@/lib/facturae/generar';
import { CASOS } from './casos.fixture';
import { generarUbl, modeloUbl, nifIva, paisIso2, problemasUbl } from './ubl';
import { leerFacturaElectronica, nifSinPais, partesPorTipo, pareceFacturaElectronica } from './leer';

const r2 = (n: number) => Math.round(n * 100) / 100;

describe('UBL EN 16931: generación', () => {
  it.each(Object.keys(CASOS))('%s: sin problemas y con los totales de la factura', (k) => {
    const d = CASOS[k];
    expect(problemasUbl(d)).toEqual([]);
    const m = modeloUbl(d);
    // Lo que se paga es exactamente el total de la factura emitida.
    expect(m.aPagar * m.signo).toBe(Math.round(d.factura.total * 100));
    // Las sumas cuadran al céntimo (BR-CO-10, 13, 14 y 15).
    expect(m.sumaLineas).toBe(m.lineas.reduce((s, l) => s + l.neto, 0));
    expect(m.baseTotal).toBe(m.grupos.reduce((s, g) => s + g.base, 0));
    expect(m.totalConImpuestos).toBe(m.baseTotal + m.cuotaTotal);
    expect(Math.abs(m.redondeo)).toBeLessThanOrEqual(2);
  });

  it('una rectificativa en negativo sale como abono (CreditNote 381) con importes positivos', () => {
    const xml = generarUbl(CASOS.rectificativaNegativa);
    expect(xml).toContain('<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"');
    expect(xml).toContain('<cbc:CreditNoteTypeCode>381</cbc:CreditNoteTypeCode>');
    expect(xml).toContain('<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>F-2026-0001</cbc:ID>');
    expect(xml).not.toMatch(/currencyID="EUR">-/);
  });

  it('una rectificativa en positivo es una factura correctiva (384)', () => {
    expect(generarUbl(CASOS.rectificativaPositiva)).toContain('<cbc:InvoiceTypeCode>384</cbc:InvoiceTypeCode>');
  });

  it('el IGIC va como categoría L, y la exenta, intracomunitaria e ISP con su motivo', () => {
    expect(generarUbl(CASOS.igic)).toContain('<cbc:ID>L</cbc:ID><cbc:Percent>7</cbc:Percent>');
    expect(generarUbl(CASOS.exenta)).toContain('<cbc:TaxExemptionReason>Operación exenta de IVA</cbc:TaxExemptionReason>');
    const ic = generarUbl(CASOS.intracomunitaria);
    expect(ic).toContain('<cbc:TaxExemptionReasonCode>VATEX-EU-IC</cbc:TaxExemptionReasonCode>');
    expect(ic).toContain('<cbc:IdentificationCode>FR</cbc:IdentificationCode>');
    expect(ic).toContain('<cac:Delivery><cbc:ActualDeliveryDate>2026-10-05</cbc:ActualDeliveryDate>');
    expect(generarUbl(CASOS.inversionSujetoPasivo)).toContain('<cbc:ID>AE</cbc:ID>');
  });

  it('la retención no cambia el total: va aparte y en una nota con lo que se cobra', () => {
    const xml = generarUbl(CASOS.retencion);
    expect(xml).toContain('<cbc:PayableAmount currencyID="EUR">1815.00</cbc:PayableAmount>');
    expect(xml).toContain('<cac:WithholdingTaxTotal><cbc:TaxAmount currencyID="EUR">225.00</cbc:TaxAmount>');
    expect(xml).toContain('Importe a cobrar: 1590,00 €.');
  });

  it('el descuento al pie se reparte por tipo para que cada base cuadre', () => {
    const m = modeloUbl(CASOS.descuentoPie);
    expect(m.descuentos).toBeGreaterThan(0);
    for (const g of m.grupos) {
      const tb = CASOS.descuentoPie.factura.taxBreakdown.find(t => t.rate === g.tipo)!;
      expect(g.base).toBe(Math.round(tb.base * 100));
    }
  });

  it('escapa lo que rompería el XML', () => {
    const xml = generarUbl(CASOS.caracteresRaros);
    expect(xml).toContain('Tornillo &lt;M8&gt; &amp; tuerca &quot;inox&quot;');
    expect(xml).toContain('Hermanos O\'Neill &amp; Cía SL');
  });

  it('transferencia sin IBAN no se declara como transferencia SEPA (BR-61)', () => {
    expect(generarUbl(CASOS.sinIbanEfectivo)).toContain('<cbc:PaymentMeansCode>10</cbc:PaymentMeansCode>');
    const sinIban = { ...CASOS.sencilla, empresa: { ...CASOS.sencilla.empresa, iban: '' } };
    expect(generarUbl(sinIban)).toContain('<cbc:PaymentMeansCode>1</cbc:PaymentMeansCode>');
  });

  it('dice lo que falta antes de generar', () => {
    const d = CASOS.sencilla;
    expect(problemasUbl({ ...d, factura: { ...d.factura, clientNif: '' }, cliente: { ...d.cliente!, nif: '' } }).join(' ')).toMatch(/NIF del cliente/);
    expect(problemasUbl({ ...d, factura: { ...d.factura, tipoFacturaFiscal: 'F2' } }).join(' ')).toMatch(/ticket/);
    expect(problemasUbl({ ...d, factura: { ...d.factura, tipo: 'rectificativa', documentoOrigenNumber: undefined } }).join(' ')).toMatch(/qué factura rectifica/);
    expect(problemasUbl({ ...d, factura: { ...d.factura, total: d.factura.total + 1 } }).join(' ')).toMatch(/no cuadran/);
  });

  it('NIF-IVA y país', () => {
    expect(nifIva('B12345674')).toBe('ESB12345674');
    expect(nifIva('ESB12345674')).toBe('ESB12345674');
    expect(nifIva('12345678Z')).toBe('ES12345678Z');
    expect(nifIva('FR40303265045', 'FR')).toBe('FR40303265045');
    expect(paisIso2('Francia')).toBe('FR');
    expect(paisIso2('')).toBe('ES');
    expect(paisIso2('pt')).toBe('PT');
  });
});

describe('Lectura de facturas recibidas', () => {
  it.each(Object.keys(CASOS))('%s: lo que se genera en UBL se vuelve a leer igual', (k) => {
    const d = CASOS[k];
    const [f] = leerFacturaElectronica(generarUbl(d));
    const signo = d.factura.total < 0 ? -1 : 1;
    expect(f.formato).toBe('ubl');
    expect(f.tipo).toBe(signo < 0 ? 'abono' : 'factura');
    expect(f.numero).toBe(d.factura.number);
    expect(f.fecha).toBe('2026-10-05');
    expect(f.emisor.nif).toBe('B12345674');
    expect(f.total * signo).toBeCloseTo(d.factura.total, 2);
    expect(r2(f.cuota * signo)).toBeCloseTo(d.factura.totalTax, 2);
    expect(f.lineas).toHaveLength(d.factura.lineItems.length);
    expect(f.avisos).toEqual([]);
  });

  it('la retención se descuenta de lo que hay que pagar', () => {
    const [f] = leerFacturaElectronica(generarUbl(CASOS.retencion));
    expect(f.retencion).toBe(225);
    expect(f.aPagar).toBe(1590);
  });

  it('lee la Facturae que genera el programa, firmada o no', () => {
    for (const k of ['sencilla', 'descuentoPie', 'igic', 'retencion'] as const) {
      const d = CASOS[k];
      const [f] = leerFacturaElectronica(generarFacturae({ factura: d.factura, empresa: d.empresa, cliente: d.cliente }));
      expect(f.formato).toBe('facturae');
      expect(f.total).toBeCloseTo(d.factura.total, 2);
      expect(f.base).toBeCloseTo(d.factura.subtotal, 2);
      expect(f.emisor).toEqual({ nombre: 'Ferretería Martín SL', nif: 'B12345674' });
      expect(f.receptor.nif).toBe('B87654321');
      expect(f.impuestos.map(i => i.tipo).sort()).toEqual(d.factura.taxBreakdown.map(t => t.rate).sort());
      if (k === 'igic') expect(f.impuestos.every(i => i.categoria === 'L')).toBe(true);
      if (k === 'retencion') expect(f.aPagar).toBe(1590);
    }
  });

  it('lee UN/CEFACT CII', () => {
    const [f] = leerFacturaElectronica(CII);
    expect(f).toMatchObject({
      formato: 'cii', tipo: 'factura', numero: 'A-551', fecha: '2026-10-01', vencimiento: '2026-10-31',
      emisor: { nombre: 'Papelería López SL', nif: 'B76543210' }, receptor: { nif: 'B12345674' },
      base: 49.5, cuota: 10.4, total: 59.9, aPagar: 59.9, iban: 'ES7620770024003102575766', avisos: [],
    });
    expect(f.lineas[0]).toEqual({ descripcion: 'Papel A4', cantidad: 10, precio: 4.95, base: 49.5, tipo: 21 });
  });

  it('lee EDIFACT INVOIC', () => {
    const [f] = leerFacturaElectronica(EDIFACT);
    expect(f).toMatchObject({
      formato: 'edifact', tipo: 'factura', numero: 'FAC-77', fecha: '2026-10-05', vencimiento: '2026-11-04',
      emisor: { nombre: 'Distribuciones Canarias SL', nif: 'B35111222' }, receptor: { nif: 'B12345674' },
      base: 17, cuota: 3.57, total: 20.57, avisos: [],
    });
    expect(f.lineas).toEqual([
      { descripcion: 'Tornillos 4x40', cantidad: 100, precio: 0.12, base: 12, tipo: 21 },
      { descripcion: 'Tacos 6mm', cantidad: 50, precio: 0.1, base: 5, tipo: 21 },
    ]);
    expect(f.impuestos).toEqual([{ tipo: 21, base: 17, cuota: 3.57, categoria: undefined }]);
  });

  it('avisa si los importes no cuadran, y no corrige nada', () => {
    const [f] = leerFacturaElectronica(CII.replace('<ram:GrandTotalAmount>59.90', '<ram:GrandTotalAmount>69.90'));
    expect(f.total).toBe(69.9);
    expect(f.avisos).toContain('Base más cuota no da el total.');
  });

  it('rechaza lo que no es una factura y los ficheros con entidades', () => {
    expect(() => leerFacturaElectronica('<html><body>hola</body></html>')).toThrow(/No es una factura electrónica/);
    expect(() => leerFacturaElectronica('<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa">]><Invoice/>')).toThrow(/seguridad/);
    expect(pareceFacturaElectronica('%PDF-1.7')).toBeNull();
  });

  it('un gasto por cada tipo de IVA, en negativo si es un abono', () => {
    const [f] = leerFacturaElectronica(generarUbl(CASOS.variosTipos));
    const partes = partesPorTipo(f);
    expect(partes.map(p => p.tipo).sort((a, b) => a - b)).toEqual([4, 10, 21]);
    expect(r2(partes.reduce((s, p) => s + p.total, 0))).toBeCloseTo(CASOS.variosTipos.factura.total, 2);
    const [abono] = leerFacturaElectronica(generarUbl(CASOS.rectificativaNegativa));
    expect(partesPorTipo(abono)[0].total).toBeLessThan(0);
  });

  it('nifSinPais', () => {
    expect(nifSinPais('ESB12345674')).toBe('B12345674');
    expect(nifSinPais('es-b12345674')).toBe('B12345674');
    expect(nifSinPais('FR40303265045')).toBe('FR40303265045');
  });
});

const CII = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
 <rsm:ExchangedDocument><ram:ID>A-551</ram:ID><ram:TypeCode>380</ram:TypeCode><ram:IssueDateTime><udt:DateTimeString format="102">20261001</udt:DateTimeString></ram:IssueDateTime></rsm:ExchangedDocument>
 <rsm:SupplyChainTradeTransaction>
  <ram:IncludedSupplyChainTradeLineItem>
   <ram:AssociatedDocumentLineDocument><ram:LineID>1</ram:LineID></ram:AssociatedDocumentLineDocument>
   <ram:SpecifiedTradeProduct><ram:Name>Papel A4</ram:Name></ram:SpecifiedTradeProduct>
   <ram:SpecifiedLineTradeAgreement><ram:NetPriceProductTradePrice><ram:ChargeAmount>4.95</ram:ChargeAmount></ram:NetPriceProductTradePrice></ram:SpecifiedLineTradeAgreement>
   <ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="C62">10</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>
   <ram:SpecifiedLineTradeSettlement><ram:ApplicableTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>S</ram:CategoryCode><ram:RateApplicablePercent>21</ram:RateApplicablePercent></ram:ApplicableTradeTax><ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>49.50</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation></ram:SpecifiedLineTradeSettlement>
  </ram:IncludedSupplyChainTradeLineItem>
  <ram:ApplicableHeaderTradeAgreement>
   <ram:SellerTradeParty><ram:Name>Papelería López SL</ram:Name><ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">ESB76543210</ram:ID></ram:SpecifiedTaxRegistration></ram:SellerTradeParty>
   <ram:BuyerTradeParty><ram:Name>Ferretería Martín SL</ram:Name><ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">ESB12345674</ram:ID></ram:SpecifiedTaxRegistration></ram:BuyerTradeParty>
  </ram:ApplicableHeaderTradeAgreement>
  <ram:ApplicableHeaderTradeDelivery/>
  <ram:ApplicableHeaderTradeSettlement>
   <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
   <ram:SpecifiedTradeSettlementPaymentMeans><ram:TypeCode>58</ram:TypeCode><ram:PayeePartyCreditorFinancialAccount><ram:IBANID>ES7620770024003102575766</ram:IBANID></ram:PayeePartyCreditorFinancialAccount></ram:SpecifiedTradeSettlementPaymentMeans>
   <ram:ApplicableTradeTax><ram:CalculatedAmount>10.40</ram:CalculatedAmount><ram:TypeCode>VAT</ram:TypeCode><ram:BasisAmount>49.50</ram:BasisAmount><ram:CategoryCode>S</ram:CategoryCode><ram:RateApplicablePercent>21</ram:RateApplicablePercent></ram:ApplicableTradeTax>
   <ram:SpecifiedTradePaymentTerms><ram:DueDateDateTime><udt:DateTimeString format="102">20261031</udt:DateTimeString></ram:DueDateDateTime></ram:SpecifiedTradePaymentTerms>
   <ram:SpecifiedTradeSettlementHeaderMonetarySummation><ram:LineTotalAmount>49.50</ram:LineTotalAmount><ram:TaxBasisTotalAmount>49.50</ram:TaxBasisTotalAmount><ram:TaxTotalAmount currencyID="EUR">10.40</ram:TaxTotalAmount><ram:GrandTotalAmount>59.90</ram:GrandTotalAmount><ram:DuePayableAmount>59.90</ram:DuePayableAmount></ram:SpecifiedTradeSettlementHeaderMonetarySummation>
  </ram:ApplicableHeaderTradeSettlement>
 </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;

const EDIFACT = "UNA:+.? 'UNB+UNOC:3+8412345678901:14+8498765432109:14+261005:1200+1'UNH+1+INVOIC:D:96A:UN:EAN008'"
  + "BGM+380+FAC-77+9'DTM+137:20261005:102'DTM+13:20261104:102'"
  + "NAD+SU+8412345678901::9++Distribuciones Canarias SL+C/ Puerto 3+Las Palmas++35008+ES'RFF+VA:ESB35111222'"
  + "NAD+BY+8498765432109::9++Ferreteria Martin SL'RFF+VA:ESB12345674'CUX+2:EUR:4'"
  + "LIN+1++8410000000017:EN'IMD+F++:::Tornillos 4x40'QTY+47:100'MOA+203:12.00'PRI+AAA:0.12'TAX+7+VAT+++:::21'"
  + "LIN+2++8410000000024:EN'IMD+F++:::Tacos 6mm'QTY+47:50'MOA+203:5.00'PRI+AAA:0.10'TAX+7+VAT+++:::21'"
  + "UNS+S'MOA+77:20.57'MOA+79:17.00'MOA+125:17.00'MOA+176:3.57'TAX+7+VAT+++:::21'MOA+124:3.57'MOA+125:17.00'UNT+30+1'UNZ+1+1'";
