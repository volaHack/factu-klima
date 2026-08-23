import { describe, it, expect } from 'vitest';
import { facturasComisionables, comisionDeVendedor, resumenComisiones } from './comisiones';
import { InvoiceStatus, type Invoice, type Vendedor } from './types';

const vendedor = (extra: Partial<Vendedor> = {}): Vendedor => ({
  id: 'v1', nombre: 'Marta', activo: true, series: {},
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  ...extra,
});

const factura = (extra: Partial<Invoice> = {}): Invoice => ({
  id: crypto.randomUUID(), number: 'FAC-1', series: 'FAC',
  clientId: 'c1', clientName: 'Cliente', clientNif: '',
  clientAddress: '', issueDate: '2026-06-10', dueDate: '2026-07-10',
  status: InvoiceStatus.EMITIDA, lineItems: [],
  subtotal: 100, totalDiscount: 0, totalTax: 21, total: 121,
  paymentMethod: 'transferencia' as never, notes: '',
  tipo: 'factura', sentido: 'venta', vendedorId: 'v1',
  createdAt: '2026-06-10T00:00:00Z', updatedAt: '2026-06-10T00:00:00Z',
  ...extra,
} as Invoice);

describe('facturasComisionables', () => {
  it('sólo las del vendedor que se pregunta', () => {
    const facturas = [factura({ vendedorId: 'v1' }), factura({ vendedorId: 'v2' })];
    expect(facturasComisionables(facturas, 'v1', 'facturado')).toHaveLength(1);
  });

  it('un presupuesto o un pedido no cuentan: no son una venta todavía', () => {
    const facturas = [factura({ tipo: 'presupuesto' }), factura({ tipo: 'pedido' }), factura({ tipo: 'factura' })];
    expect(facturasComisionables(facturas, 'v1', 'facturado')).toHaveLength(1);
  });

  it('un borrador no cuenta: puede cambiar entero', () => {
    const facturas = [factura({ status: InvoiceStatus.BORRADOR })];
    expect(facturasComisionables(facturas, 'v1', 'facturado')).toHaveLength(0);
  });

  it('una anulada no cuenta: no vendió nada', () => {
    const facturas = [factura({ status: InvoiceStatus.ANULADA })];
    expect(facturasComisionables(facturas, 'v1', 'facturado')).toHaveLength(0);
  });

  it('una compra no genera comisión de venta', () => {
    const facturas = [factura({ sentido: 'compra' })];
    expect(facturasComisionables(facturas, 'v1', 'facturado')).toHaveLength(0);
  });

  it('con base facturado, pendiente de cobro cuenta igual', () => {
    const facturas = [factura({ status: InvoiceStatus.PENDIENTE })];
    expect(facturasComisionables(facturas, 'v1', 'facturado')).toHaveLength(1);
  });

  it('con base cobrado, sólo cuenta lo pagado del todo', () => {
    const facturas = [
      factura({ status: InvoiceStatus.PENDIENTE }),
      factura({ status: InvoiceStatus.PARCIAL }),
      factura({ status: InvoiceStatus.PAGADA }),
    ];
    expect(facturasComisionables(facturas, 'v1', 'cobrado')).toHaveLength(1);
  });

  it('se acota por fecha de emisión', () => {
    const facturas = [factura({ issueDate: '2026-01-10' }), factura({ issueDate: '2026-06-10' })];
    expect(facturasComisionables(facturas, 'v1', 'facturado', { desde: '2026-05-01' })).toHaveLength(1);
  });
});

describe('comisionDeVendedor', () => {
  it('la comisión es el porcentaje sobre la base, no sobre el total con IVA', () => {
    // 100 de base × 5% = 5, no 121 × 5% = 6,05.
    const v = vendedor({ comisionPct: 5 });
    const resumen = comisionDeVendedor([factura({ subtotal: 100, total: 121 })], v, 'facturado');
    expect(resumen.importeComision).toBe(5);
  });

  it('suma varias facturas', () => {
    const v = vendedor({ comisionPct: 10 });
    const facturas = [factura({ subtotal: 100 }), factura({ subtotal: 200 })];
    const resumen = comisionDeVendedor(facturas, v, 'facturado');
    expect(resumen.baseCalculo).toBe(300);
    expect(resumen.importeComision).toBe(30);
  });

  it('sin porcentaje configurado, la comisión es cero', () => {
    const v = vendedor({ comisionPct: undefined });
    const resumen = comisionDeVendedor([factura()], v, 'facturado');
    expect(resumen.importeComision).toBe(0);
  });

  it('trae el detalle de qué factura generó cada comisión', () => {
    const v = vendedor({ comisionPct: 10 });
    const f = factura({ number: 'FAC-2026-0042', subtotal: 50 });
    const resumen = comisionDeVendedor([f], v, 'facturado');
    expect(resumen.facturas).toHaveLength(1);
    expect(resumen.facturas[0]).toMatchObject({ number: 'FAC-2026-0042', importe: 50, comision: 5 });
  });

  it('redondea al céntimo', () => {
    const v = vendedor({ comisionPct: 3.33 });
    const resumen = comisionDeVendedor([factura({ subtotal: 77.77 })], v, 'facturado');
    expect(Number.isInteger(resumen.importeComision * 100)).toBe(true);
  });
});

describe('resumenComisiones', () => {
  it('sólo entran los vendedores con comisión configurada', () => {
    const vendedores = [vendedor({ id: 'v1', comisionPct: 5 }), vendedor({ id: 'v2', comisionPct: undefined })];
    const resumen = resumenComisiones([factura({ vendedorId: 'v1' }), factura({ vendedorId: 'v2' })], vendedores, 'facturado');
    expect(resumen.map(r => r.vendedorId)).toEqual(['v1']);
  });

  it('un vendedor con comisión cero tampoco entra', () => {
    // Cero no es «se lleva algo»: es lo mismo que no tener comisión.
    const vendedores = [vendedor({ comisionPct: 0 })];
    expect(resumenComisiones([factura()], vendedores, 'facturado')).toHaveLength(0);
  });

  it('ordena de quien más se lleva a quien menos', () => {
    const vendedores = [
      vendedor({ id: 'v1', comisionPct: 5 }),
      vendedor({ id: 'v2', comisionPct: 20 }),
    ];
    const facturas = [factura({ vendedorId: 'v1', subtotal: 100 }), factura({ vendedorId: 'v2', subtotal: 100 })];
    const resumen = resumenComisiones(facturas, vendedores, 'facturado');
    expect(resumen.map(r => r.vendedorId)).toEqual(['v2', 'v1']);
  });

  it('sin ventas ni vendedores no revienta', () => {
    expect(resumenComisiones([], [], 'facturado')).toEqual([]);
  });
});
