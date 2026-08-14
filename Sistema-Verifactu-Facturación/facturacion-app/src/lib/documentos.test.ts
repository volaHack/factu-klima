import { describe, it, expect } from 'vitest';
import { esSellable, tipoDocumento } from './storage';
import { lineaVacia, numeroDeDocumento, ESTADOS_POR_TIPO } from './documentos';
import { InvoiceStatus, type CompanySettings } from './types';

describe('esSellable', () => {
  it('factura de venta sellable', () => expect(esSellable({ tipo: 'factura', sentido: 'venta' })).toBe(true));
  it('rectificativa de venta sellable', () => expect(esSellable({ tipo: 'rectificativa', sentido: 'venta' })).toBe(true));
  it('presupuesto no sellable', () => expect(esSellable({ tipo: 'presupuesto' })).toBe(false));
  it('pedido no sellable', () => expect(esSellable({ tipo: 'pedido' })).toBe(false));
  it('albarán no sellable', () => expect(esSellable({ tipo: 'albaran' })).toBe(false));
  it('compra no sellable aunque sea factura', () => expect(esSellable({ tipo: 'factura', sentido: 'compra' })).toBe(false));
  it('por defecto es factura de venta', () => expect(esSellable({})).toBe(true));
  it('tipoDocumento por defecto factura', () => expect(tipoDocumento({})).toBe('factura'));
});

describe('lineaVacia', () => {
  it('usa la tasa máxima configurada (IVA)', () => {
    const settings = { ivaRates: [10, 21], igicEnabled: false } as CompanySettings;
    expect(lineaVacia(settings).taxRate).toBe(21);
  });
  it('usa la tasa máxima configurada (IGIC)', () => {
    const settings = { igicRates: [7, 3, 13, 0], igicEnabled: true } as CompanySettings;
    expect(lineaVacia(settings).taxRate).toBe(13);
  });
});

describe('ESTADOS_POR_TIPO', () => {
  it('albarán usa sus estados reales (expedido/facturado)', () => {
    expect(ESTADOS_POR_TIPO.albaran).toContain(InvoiceStatus.EXPEDIDO);
    expect(ESTADOS_POR_TIPO.albaran).toContain(InvoiceStatus.FACTURADO);
  });
  it('factura conserva el ciclo completo de cobro', () => {
    expect(ESTADOS_POR_TIPO.factura).toContain(InvoiceStatus.PAGADA);
    expect(ESTADOS_POR_TIPO.factura).toContain(InvoiceStatus.PENDIENTE);
  });
});

describe('numeroDeDocumento', () => {
  const settings = {
    seriesDocumentos: {
      factura_venta: { serie: 'FAC', nextNumber: 27 },
      presupuesto_venta: { serie: 'PRE', nextNumber: 3 },
    },
  } as CompanySettings;

  it('genera SERIE-AÑO-NNNN a partir de la serie por tipo', () => {
    const res = numeroDeDocumento(settings, 'factura', 'venta');
    expect(res.series).toBe('FAC');
    expect(res.number).toMatch(/^FAC-\d{4}-\d{4}$/);
    expect(res.nextNumber).toBe(27);
  });
  it('respeta la serie de presupuesto', () => {
    const res = numeroDeDocumento(settings, 'presupuesto', 'venta');
    expect(res.series).toBe('PRE');
    expect(res.number).toMatch(/^PRE-\d{4}-\d{4}$/);
  });
});
