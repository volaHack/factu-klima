import { describe, it, expect } from 'vitest';
import {
  generarXmlSiiEmitidas, generarXmlSiiRecibidas,
  calcularResumenSii, facturasSinEstadoSii,
} from './sii';
import type { Invoice, CompanySettings } from './types';

const settings: CompanySettings = {
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
  notes: 'Servicios de consultoría',
  createdAt: '2026-08-01',
  updatedAt: '2026-08-01',
  tipo: 'factura',
  sentido: 'venta',
};

describe('generarXmlSiiEmitidas', () => {
  it('genera XML válido con cabecera y registro', () => {
    const xml = generarXmlSiiEmitidas([baseInvoice], settings);
    expect(xml).toContain('SuministroLRFacturasEmitidas');
    expect(xml).toContain('<sii:NombreRazon>Test S.L.</sii:NombreRazon>');
    expect(xml).toContain('<sii:NIF>B12345678</sii:NIF>');
    expect(xml).toContain('<sii:TipoComunicacion>A0</sii:TipoComunicacion>');
    expect(xml).toContain('RegistroLRFacturasEmitidas');
    expect(xml).toContain('<sii:TipoFactura>F1</sii:TipoFactura>');
    expect(xml).toContain('<sii:ClaveRegimenEspecialOTrascendencia>01</sii:ClaveRegimenEspecialOTrascendencia>');
  });

  it('incluye PeriodoLiquidacion correcto', () => {
    const xml = generarXmlSiiEmitidas([baseInvoice], settings);
    expect(xml).toContain('<sii:Ejercicio>2026</sii:Ejercicio>');
    expect(xml).toContain('<sii:Periodo>08</sii:Periodo>');
  });

  it('maneja múltiples facturas en un solo envío', () => {
    const inv2: Invoice = { ...baseInvoice, id: 'inv-2', number: 'F-2026-0002' };
    const xml = generarXmlSiiEmitidas([baseInvoice, inv2], settings);
    const count = (xml.match(/RegistroLRFacturasEmitidas/g) || []).length;
    expect(count).toBe(4); // 2 apertura + 2 cierre
  });

  it('usa IDOtro para operaciones intracomunitarias', () => {
    const intra: Invoice = {
      ...baseInvoice,
      esIntracomunitaria: true,
      clientVatNumber: 'FR12345678901',
    };
    const xml = generarXmlSiiEmitidas([intra], settings);
    expect(xml).toContain('<sii:CodigoPais>FR</sii:CodigoPais>');
    expect(xml).toContain('<sii:IDType>02</sii:IDType>');
    expect(xml).toContain('<sii:ClaveRegimenEspecialOTrascendencia>11</sii:ClaveRegimenEspecialOTrascendencia>');
  });
});

describe('generarXmlSiiRecibidas', () => {
  it('genera XML válido para facturas de compra', () => {
    const compra: Invoice = { ...baseInvoice, sentido: 'compra' };
    const xml = generarXmlSiiRecibidas([compra], settings);
    expect(xml).toContain('SuministroLRFacturasRecibidas');
    expect(xml).toContain('RegistroLRFacturasRecibidas');
    expect(xml).toContain('<sii:CuotaSoportada>210.00</sii:CuotaSoportada>');
  });
});

describe('calcularResumenSii', () => {
  it('cuenta pendientes y calcula días hasta vencimiento', () => {
    const hoy = new Date().toISOString().substring(0, 10);
    const pendiente: Invoice = {
      ...baseInvoice,
      issueDate: hoy,
      siiStatus: 'pendiente_sii',
    };
    const resumen = calcularResumenSii([pendiente]);
    expect(resumen.pendientes).toBe(1);
    expect(resumen.diasHastaVencimiento).toBeLessThanOrEqual(4);
    expect(resumen.diasHastaVencimiento).toBeGreaterThanOrEqual(3);
  });

  it('ignora presupuestos y pedidos', () => {
    const presupuesto: Invoice = { ...baseInvoice, tipo: 'presupuesto', siiStatus: 'pendiente_sii' };
    const resumen = calcularResumenSii([presupuesto]);
    expect(resumen.pendientes).toBe(0);
  });

  it('devuelve null si no hay pendientes', () => {
    const resumen = calcularResumenSii([{ ...baseInvoice, siiStatus: 'aceptado_sii' }]);
    expect(resumen.diasHastaVencimiento).toBeNull();
    expect(resumen.aceptadas).toBe(1);
  });
});

describe('facturasSinEstadoSii', () => {
  it('detecta facturas emitidas sin estado SII', () => {
    const sinSii: Invoice = { ...baseInvoice, siiStatus: undefined };
    const resultado = facturasSinEstadoSii([sinSii]);
    expect(resultado).toHaveLength(1);
  });

  it('no incluye borradores ni anuladas', () => {
    const borrador: Invoice = { ...baseInvoice, status: 'borrador' as any, siiStatus: undefined };
    const anulada: Invoice = { ...baseInvoice, status: 'anulada' as any, siiStatus: undefined };
    const resultado = facturasSinEstadoSii([borrador, anulada]);
    expect(resultado).toHaveLength(0);
  });
});
