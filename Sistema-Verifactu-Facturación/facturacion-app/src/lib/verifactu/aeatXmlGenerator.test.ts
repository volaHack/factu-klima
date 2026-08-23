import { describe, it, expect } from 'vitest';
import { generateVerifactuSoapXml } from './aeatXmlGenerator';
import type { Invoice, CompanySettings } from '@/lib/types';

const baseSettings: CompanySettings = {
  businessName: 'Test S.L.',
  nif: 'B12345678',
  tradeName: 'Test',
  sector: 'informatica',
  accentTheme: 'rose',
  email: '',
  phone: '',
  website: '',
  address: 'Calle Test 1',
  city: 'Madrid',
  postalCode: '28001',
  province: 'Madrid',
  invoiceSeries: 'F',
  nextInvoiceNumber: 1,
  defaultPaymentDays: 30,
  defaultPaymentMethod: 'transferencia' as any,
  invoiceFooterText: '',
  tpvSeries: 'T',
  nextTpvNumber: 1,
  iban: '',
  bankName: '',
  verifactuEnabled: true,
  logoUrl: '',
};

const baseInvoice: Invoice = {
  id: 'inv-1',
  number: 'F-2026-0001',
  series: 'F',
  clientId: 'c1',
  clientName: 'Cliente Test',
  clientNif: '12345678Z',
  clientAddress: 'Calle Cliente 1',
  issueDate: '2026-08-01',
  dueDate: '2026-09-01',
  status: 'emitida' as any,
  lineItems: [],
  subtotal: 1000,
  totalDiscount: 0,
  taxBreakdown: [{ rate: 21, base: 1000, amount: 210 }],
  totalTax: 210,
  total: 1210,
  paymentMethod: 'transferencia' as any,
  notes: '',
  createdAt: '2026-08-01',
  updatedAt: '2026-08-01',
};

describe('generateVerifactuSoapXml', () => {
  it('genera TipoFactura F1 para factura normal', () => {
    const xml = generateVerifactuSoapXml(baseInvoice, baseSettings);
    expect(xml).toContain('<ver:TipoFactura>F1</ver:TipoFactura>');
  });

  it('genera TipoFactura F2 para ticket TPV (factura simplificada)', () => {
    const tpvInvoice: Invoice = { ...baseInvoice, posSessionId: 'session-1' };
    const xml = generateVerifactuSoapXml(tpvInvoice, baseSettings);
    expect(xml).toContain('<ver:TipoFactura>F2</ver:TipoFactura>');
  });

  it('genera TipoFactura R1 para factura rectificativa', () => {
    const rectInvoice: Invoice = {
      ...baseInvoice,
      tipo: 'rectificativa',
      documentoOrigenId: 'orig-1',
      documentoOrigenNumber: 'F-2026-0001',
    };
    const xml = generateVerifactuSoapXml(rectInvoice, baseSettings);
    expect(xml).toContain('<ver:TipoFactura>R1</ver:TipoFactura>');
    expect(xml).toContain('<ver:FacturasRectificadas>');
    expect(xml).toContain('<ver:TipoRectificativa>I</ver:TipoRectificativa>');
  });

  it('genera TipoFactura R5 para rectificativa de ticket TPV', () => {
    const rectTpv: Invoice = {
      ...baseInvoice,
      tipo: 'rectificativa',
      posSessionId: 'session-1',
    };
    const xml = generateVerifactuSoapXml(rectTpv, baseSettings);
    expect(xml).toContain('<ver:TipoFactura>R5</ver:TipoFactura>');
  });

  it('incluye ClaveRegimenIvaEspecial (campo obligatorio)', () => {
    const xml = generateVerifactuSoapXml(baseInvoice, baseSettings);
    expect(xml).toContain('<ver:ClaveRegimenIvaEspecial>01</ver:ClaveRegimenIvaEspecial>');
  });

  it('usa ClaveRegimenIva 11 para entregas intracomunitarias', () => {
    const intraInvoice: Invoice = {
      ...baseInvoice,
      esIntracomunitaria: true,
      clientVatNumber: 'FR12345678901',
      sentido: 'venta',
    };
    const xml = generateVerifactuSoapXml(intraInvoice, baseSettings);
    expect(xml).toContain('<ver:ClaveRegimenIvaEspecial>11</ver:ClaveRegimenIvaEspecial>');
  });

  it('usa ClaveRegimenIva 10 para adquisiciones intracomunitarias', () => {
    const intraCompra: Invoice = {
      ...baseInvoice,
      esIntracomunitaria: true,
      clientVatNumber: 'DE123456789',
      sentido: 'compra',
    };
    const xml = generateVerifactuSoapXml(intraCompra, baseSettings);
    expect(xml).toContain('<ver:ClaveRegimenIvaEspecial>10</ver:ClaveRegimenIvaEspecial>');
  });

  it('usa IDOtro con CodigoPais para destinatarios intracomunitarios', () => {
    const intraInvoice: Invoice = {
      ...baseInvoice,
      esIntracomunitaria: true,
      clientVatNumber: 'FR12345678901',
    };
    const xml = generateVerifactuSoapXml(intraInvoice, baseSettings);
    expect(xml).toContain('<ver:IDOtro>');
    expect(xml).toContain('<ver:CodigoPais>FR</ver:CodigoPais>');
    expect(xml).toContain('<ver:IDType>02</ver:IDType>');
    expect(xml).toContain('<ver:ID>12345678901</ver:ID>');
    expect(xml).not.toContain('<ver:NIF>12345678Z</ver:NIF>');
  });

  it('usa NIF para destinatarios nacionales', () => {
    const xml = generateVerifactuSoapXml(baseInvoice, baseSettings);
    expect(xml).toContain('<ver:NIF>12345678Z</ver:NIF>');
    expect(xml).not.toContain('<ver:IDOtro>');
  });

  it('respeta tipoFacturaFiscal forzado manualmente', () => {
    const forced: Invoice = { ...baseInvoice, tipoFacturaFiscal: 'F3' };
    const xml = generateVerifactuSoapXml(forced, baseSettings);
    expect(xml).toContain('<ver:TipoFactura>F3</ver:TipoFactura>');
  });

  it('usa ClaveRegimenIva 09 cuando IGIC está activo', () => {
    const igicSettings = { ...baseSettings, igicEnabled: true };
    const xml = generateVerifactuSoapXml(baseInvoice, igicSettings);
    expect(xml).toContain('<ver:ClaveRegimenIvaEspecial>09</ver:ClaveRegimenIvaEspecial>');
  });

  it('usa taxBreakdown agregado en el desglose, no las líneas', () => {
    const multiTaxInvoice: Invoice = {
      ...baseInvoice,
      taxBreakdown: [
        { rate: 21, base: 800, amount: 168 },
        { rate: 10, base: 200, amount: 20 },
      ],
    };
    const xml = generateVerifactuSoapXml(multiTaxInvoice, baseSettings);
    // Debe tener dos DetalleIVA
    const count = (xml.match(/<ver:DetalleIVA>/g) || []).length;
    expect(count).toBe(2);
    expect(xml).toContain('<ver:TipoImpositivo>21.00</ver:TipoImpositivo>');
    expect(xml).toContain('<ver:TipoImpositivo>10.00</ver:TipoImpositivo>');
  });

  it('escapa caracteres especiales XML en nombres', () => {
    const specialInvoice: Invoice = {
      ...baseInvoice,
      clientName: 'Empresa & Cía <S.L.>',
    };
    const xml = generateVerifactuSoapXml(specialInvoice, baseSettings);
    expect(xml).toContain('Empresa &amp; Cía &lt;S.L.&gt;');
  });
});
