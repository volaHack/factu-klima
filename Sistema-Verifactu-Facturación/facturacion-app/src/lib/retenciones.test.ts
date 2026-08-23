import { describe, it, expect } from 'vitest';
import { importeRetencion, totalAPagar, resumenModelo111 } from './retenciones';
import { InvoiceStatus, type Invoice } from './types';

const factura = (extra: Partial<Invoice> = {}): Invoice => ({
  id: crypto.randomUUID(), number: 'FAC-1', series: 'FAC',
  clientId: 'c1', clientName: 'Despacho Legal', clientNif: '',
  clientAddress: '', issueDate: '2026-06-10', dueDate: '2026-07-10',
  status: InvoiceStatus.EMITIDA, lineItems: [],
  subtotal: 1000, totalDiscount: 0, totalTax: 210, total: 1210,
  paymentMethod: 'transferencia' as never, notes: '',
  tipo: 'factura', sentido: 'compra',
  createdAt: '2026-06-10T00:00:00Z', updatedAt: '2026-06-10T00:00:00Z',
  ...extra,
} as Invoice);

describe('importeRetencion', () => {
  it('el porcentaje sobre la base, no sobre el total con IVA', () => {
    // 1000 × 15% = 150, no 1210 × 15% = 181,50.
    expect(importeRetencion(1000, 15)).toBe(150);
  });

  it('sin retención configurada, cero', () => {
    expect(importeRetencion(1000, undefined)).toBe(0);
  });

  it('un cero explícito también da cero', () => {
    expect(importeRetencion(1000, 0)).toBe(0);
  });

  it('el 7% del primer año de alta', () => {
    expect(importeRetencion(1000, 7)).toBe(70);
  });
});

describe('totalAPagar', () => {
  it('el total menos la retención', () => {
    // Base 1000, IVA 210, total 1210. Retención 15% de la base = 150.
    expect(totalAPagar(1210, 1000, 15)).toBe(1060);
  });

  it('sin retención, el total a pagar es el total de siempre', () => {
    expect(totalAPagar(1210, 1000, undefined)).toBe(1210);
  });
});

describe('resumenModelo111 — lo que hay que declarar', () => {
  it('sólo cuenta lo que NOSOTROS hemos retenido: facturas de COMPRA', () => {
    // Una de venta con retención es al revés: nos la retienen A NOSOTROS, y
    // la declara el cliente, no nosotros.
    const facturas = [
      factura({ sentido: 'compra', subtotal: 1000, retencionPct: 15 }),
      factura({ sentido: 'venta', subtotal: 1000, retencionPct: 15 }),
    ];
    const resumen = resumenModelo111(facturas);
    expect(resumen.numFacturas).toBe(1);
    expect(resumen.retenido).toBe(150);
  });

  it('una factura sin retención configurada no cuenta', () => {
    const facturas = [factura({ retencionPct: undefined })];
    expect(resumenModelo111(facturas).numFacturas).toBe(0);
  });

  it('un presupuesto o un borrador no cuentan: no se ha pagado nada', () => {
    const facturas = [
      factura({ tipo: 'presupuesto', retencionPct: 15 }),
      factura({ status: InvoiceStatus.BORRADOR, retencionPct: 15 }),
    ];
    expect(resumenModelo111(facturas).numFacturas).toBe(0);
  });

  it('suma varias facturas del periodo', () => {
    const facturas = [
      factura({ subtotal: 1000, retencionPct: 15 }),
      factura({ subtotal: 2000, retencionPct: 15 }),
    ];
    const resumen = resumenModelo111(facturas);
    expect(resumen.baseTotal).toBe(3000);
    expect(resumen.retenido).toBe(450);
  });

  it('se acota por fecha', () => {
    const facturas = [
      factura({ issueDate: '2026-01-10', retencionPct: 15 }),
      factura({ issueDate: '2026-06-10', retencionPct: 15 }),
    ];
    expect(resumenModelo111(facturas, { desde: '2026-04-01' }).numFacturas).toBe(1);
  });

  it('sin facturas, todo a cero', () => {
    expect(resumenModelo111([])).toEqual({ numFacturas: 0, baseTotal: 0, retenido: 0 });
  });
});
