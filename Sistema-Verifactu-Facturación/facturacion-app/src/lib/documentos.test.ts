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
  } as unknown as CompanySettings;

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

describe('documentoConvertido', () => {
  const settings = {
    seriesDocumentos: {
      pedido_venta: { serie: 'PED', nextNumber: 5 },
      albaran_venta: { serie: 'ALB', nextNumber: 12 },
    },
  } as unknown as CompanySettings;

  it('convierte un presupuesto a pedido manteniendo origen', async () => {
    const { documentoConvertido } = await import('./documentos');
    const original = {
      id: 'pre-123',
      number: 'PRE-2026-0001',
      tipo: 'presupuesto',
      sentido: 'venta',
      lineItems: [],
    } as any;
    const convertido = documentoConvertido(original, 'pedido', settings);
    expect(convertido.id).not.toBe(original.id);
    expect(convertido.tipo).toBe('pedido');
    expect(convertido.documentoOrigenId).toBe('pre-123');
    expect(convertido.documentoOrigenNumber).toBe('PRE-2026-0001');
    expect(convertido.status).toBe(InvoiceStatus.BORRADOR);
    expect(convertido.number).toMatch(/^PED-\d{4}-\d{4}$/);
  });
});

describe('rectificar', () => {
  const settings = {
    seriesDocumentos: {
      rectificativa_venta: { serie: 'FCR', nextNumber: 1 },
    },
  } as unknown as CompanySettings;

  it('crea factura rectificativa con líneas negativas y encadenamiento', async () => {
    const { rectificar } = await import('./documentos');
    const factura = {
      id: 'fac-999',
      number: 'FAC-2026-0099',
      tipo: 'factura',
      sentido: 'venta',
      lineItems: [
        { id: 'li-1', quantity: 2, unitPrice: 50 },
        { id: 'li-2', quantity: -1, unitPrice: 20 },
      ],
    } as any;
    const rect = rectificar(factura, settings);
    expect(rect.tipo).toBe('rectificativa');
    expect(rect.documentoOrigenId).toBe('fac-999');
    expect(rect.documentoOrigenNumber).toBe('FAC-2026-0099');
    expect(rect.lineItems[0].quantity).toBe(-2);
    expect(rect.lineItems[1].quantity).toBe(-1);
    expect(rect.number).toMatch(/^FCR-\d{4}-\d{4}$/);
  });
});

describe('saveDocumento', () => {
  it('rechaza modificar un documento ya sellado', async () => {
    const { saveDocumento } = await import('./storage');
    await expect(saveDocumento({ status: InvoiceStatus.PAGADA, tipo: 'factura', sentido: 'venta', number: 'FAC-2026-0001' } as any))
      .rejects.toThrow(/sellado/);
  });
});

