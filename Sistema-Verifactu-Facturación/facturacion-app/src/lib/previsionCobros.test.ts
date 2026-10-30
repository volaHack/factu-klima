/* eslint-disable @typescript-eslint/no-explicit-any -- datos de prueba a medias */
import { describe, it, expect } from 'vitest';
import { InvoiceStatus, PaymentMethod } from './types';
import { previsionDeCobros } from './previsionCobros';
import { sumarDiasIso } from './perfilPago';

const HOY = '2026-10-27';
const f = (id: string, cliente: string, extra: Record<string, unknown>) => ({
  id, number: id, tipo: 'factura', sentido: 'venta', status: InvoiceStatus.EMITIDA, clientId: cliente, clientName: cliente.toUpperCase(),
  issueDate: '2026-10-01', dueDate: '2026-10-31', total: 100, subtotal: 100, paidAmount: 0, paymentMethod: PaymentMethod.TRANSFERENCIA,
  lineItems: [], ...extra,
}) as any;
/** Tres cobros pasados de un cliente, con `retraso` días sobre el vencimiento. */
const historial = (cliente: string, retraso: number) => [1, 2, 3].map(m => f(`H${cliente}${m}`, cliente, {
  status: InvoiceStatus.PAGADA, issueDate: `2026-0${m}-01`, dueDate: `2026-0${m}-28`, paidDate: sumarDiasIso(`2026-0${m}-28`, retraso),
}));

describe('previsión de cobros', () => {
  it('lo puntual es seguro y cae en la semana del vencimiento', () => {
    const p = previsionDeCobros([...historial('pun', 1), f('F1', 'pun', { dueDate: '2026-10-31', total: 500, subtotal: 500 })], HOY);
    const c = p.cobros.find(x => x.facturaId === 'F1')!;
    expect(c.certeza).toBe('seguro');
    // Suele pagar un día después del vencimiento.
    expect(c.esperado).toBe('2026-11-01');
    expect(p.semanas[0].seguro).toBe(500);
    expect(p.tramos[0]).toEqual({ dias: 30, seguro: 500, probable: 0, total: 500 });
  });

  it('quien suele retrasarse se espera más tarde, como probable', () => {
    const p = previsionDeCobros([...historial('tar', 20), f('F2', 'tar', { dueDate: '2026-11-03', total: 300, subtotal: 300 })], HOY);
    const c = p.cobros.find(x => x.facturaId === 'F2')!;
    expect(c.certeza).toBe('probable');
    expect(c.esperado! > '2026-11-03').toBe(true);
    expect(p.semanas[0].probable).toBe(0);
    expect(p.tramos[0].probable).toBe(300);
  });

  it('domiciliado sin vencer es seguro aunque el cliente sea nuevo', () => {
    const p = previsionDeCobros([f('F3', 'nuevo', { paymentMethod: PaymentMethod.DOMICILIACION, dueDate: '2026-12-01' })], HOY);
    expect(p.cobros[0].certeza).toBe('seguro');
    expect(p.tramos.map(t => t.seguro)).toEqual([0, 100, 100]);
  });

  it('lo que va más allá de su costumbre es de riesgo y no se suma a ninguna semana', () => {
    const p = previsionDeCobros([
      ...historial('pun', 1),
      f('V1', 'pun', { dueDate: '2026-09-30', total: 640, subtotal: 640 }), // 27 días vencida, suele pagar en plazo
      f('V2', 'otro', { dueDate: '2026-07-01', total: 200, subtotal: 200 }), // más de 60 días
      f('V3', 'otro', { dueDate: '2026-10-20', total: 50, subtotal: 50 }), // una semana: aún normal
    ], HOY);
    expect(p.riesgo.map(r => r.facturaId)).toEqual(['V1', 'V2']);
    expect(p.totalRiesgo).toBe(840);
    const v3 = p.cobros.find(x => x.facturaId === 'V3')!;
    expect(v3.certeza).toBe('probable');
    expect(v3.esperado).toBe(HOY);
    expect(p.tramos[2].total).toBe(50);
  });

  it('lo de más allá de 90 días queda fuera de los tramos', () => {
    const p = previsionDeCobros([f('L', 'x', { dueDate: '2027-03-01' })], HOY);
    expect(p.tramos[2].total).toBe(0);
    expect(p.despues).toBe(100);
    expect(p.semanas).toHaveLength(13);
    expect(p.semanas[1].etiqueta).toBe('3 nov.');
  });
});
