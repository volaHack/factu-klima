/* eslint-disable @typescript-eslint/no-explicit-any -- datos de prueba a medias */
import { describe, it, expect } from 'vitest';
import { InvoiceStatus, PaymentMethod } from './types';
import { planCobroLote, registrosDeLote } from './cobroLote';

const f = (id: string, extra: Record<string, unknown> = {}) => ({
  id, number: id, tipo: 'factura', sentido: 'venta', status: InvoiceStatus.EMITIDA, clientId: 'c1', clientName: 'Bar Pepe', clientNif: 'B1',
  issueDate: '2026-10-01', dueDate: '2026-10-31', total: 100, subtotal: 100, paidAmount: 0, lineItems: [], ...extra,
}) as any;

describe('cobro en lote', () => {
  const facturas = [
    f('F1'),
    f('F2', { total: 121, subtotal: 100, retencionPct: 15 }), // con retención entra 106
    f('F3', { status: InvoiceStatus.PARCIAL, paidAmount: 40 }),
    f('F4', { clientId: 'c2', clientName: 'Asesoría Luna', total: 500, subtotal: 500 }),
    f('F5', { status: InvoiceStatus.PAGADA, paidAmount: 100 }),
    f('F6', { status: InvoiceStatus.BORRADOR }),
    f('F7', { sentido: 'compra' }),
  ];

  it('un cobro por cliente, con lo que de verdad falta de cada factura', () => {
    const plan = planCobroLote(facturas, ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'NO']);
    expect(plan.facturas).toBe(4);
    expect(plan.total).toBe(766);
    expect(plan.grupos.map(g => [g.cliente, g.importe])).toEqual([['Asesoría Luna', 500], ['Bar Pepe', 266]]);
    expect(plan.grupos[1].desglose.map(d => d.importeAplicado)).toEqual([100, 106, 60]);
    expect(plan.descartadas).toEqual([
      { numero: 'F5', motivo: 'ya está cobrada' },
      { numero: 'F6', motivo: 'es un borrador' },
      { numero: 'F7', motivo: 'no es una factura de venta' },
    ]);
  });

  it('los registros van numerados seguidos con la serie de cobros', () => {
    let n = 0;
    const regs = registrosDeLote(planCobroLote(facturas, ['F1', 'F4']), {
      fecha: '2026-10-27', forma: PaymentMethod.BIZUM, serie: 'COB', siguiente: 7, ahora: 'T', nuevoId: () => `id${++n}`,
    });
    expect(regs.map(r => [r.number, r.contraparteNombre, r.importeTotal, r.paymentMethod])).toEqual([
      ['COB-2026-0007', 'Asesoría Luna', 500, PaymentMethod.BIZUM],
      ['COB-2026-0008', 'Bar Pepe', 100, PaymentMethod.BIZUM],
    ]);
    expect(regs[0]).toMatchObject({ tipo: 'cobro', fecha: '2026-10-27', contraparteId: 'c2', id: 'id1' });
  });
});
