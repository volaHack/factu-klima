/* eslint-disable @typescript-eslint/no-explicit-any -- datos de prueba a medias */
import { describe, it, expect } from 'vitest';
import { InvoiceStatus } from './types';
import {
  diasEntreDias, perfilDePago, perfilesDePago, restarMesesIso, riesgoDeCliente, sumarDiasIso,
} from './perfilPago';

const f = (id: string, extra: Record<string, unknown>) => ({
  id, number: id, tipo: 'factura', sentido: 'venta', status: InvoiceStatus.PAGADA, clientId: 'c1',
  issueDate: '2026-01-01', dueDate: '2026-01-31', total: 100, subtotal: 100, paidAmount: 0, lineItems: [], ...extra,
}) as any;

const HOY = '2026-10-27';
/** Intl separa el importe del «€» con un espacio duro. */
const plano = (s: string) => s.replace(/\u00a0/g, ' ');

describe('días de calendario', () => {
  it('no se come un día con el cambio de hora ni con meses cortos', () => {
    expect(diasEntreDias('2026-03-28', '2026-03-30')).toBe(2);
    expect(diasEntreDias('2026-10-24', '2026-10-26')).toBe(2);
    expect(sumarDiasIso('2026-02-27', 3)).toBe('2026-03-02');
    expect(restarMesesIso('2026-08-31', 6)).toBe('2026-02-28');
    expect(restarMesesIso('2026-03-15', 6)).toBe('2025-09-15');
  });
});

describe('perfil de pago', () => {
  it('días medios reales, puntualidad y retraso típico', () => {
    const docs = [
      // Paga a 40 días con 30 de plazo: 10 de retraso.
      f('A', { issueDate: '2026-01-01', dueDate: '2026-01-31', paidDate: '2026-02-10' }),
      // En plazo.
      f('B', { issueDate: '2026-02-01', dueDate: '2026-03-03', paidDate: '2026-03-01' }),
      // 20 días tarde.
      f('C', { issueDate: '2026-03-01', dueDate: '2026-03-31', paidDate: '2026-04-20' }),
      f('X', { clientId: 'otro', paidDate: '2026-01-02' }),
      f('P', { status: InvoiceStatus.EMITIDA }),
    ];
    const p = perfilDePago(docs, 'c1', HOY)!;
    expect(p.cobradas).toBe(3);
    expect(p.diasMedios).toBe(Math.round((40 + 28 + 50) / 3));
    expect(p.puntualidad).toBe(33);
    expect(p.retrasoMedio).toBe(10);
    expect(p.fiable).toBe(true);
    expect(p.etiqueta).toBe('Paga a 39 días · suele retrasarse 10');
  });

  it('el margen del banco no cuenta como retraso', () => {
    const p = perfilDePago([f('A', { dueDate: '2026-01-31', paidDate: '2026-02-02' })], 'c1', HOY)!;
    expect(p.puntualidad).toBe(100);
    expect(p.etiqueta).toBe('Paga a 32 días · suele pagar en plazo');
    expect(p.fiable).toBe(false);
  });

  it('un cobro con hora (Stripe) se lee como su día local', () => {
    const p = perfilDePago([f('A', { issueDate: '2026-01-01', dueDate: '2026-01-31', paidDate: undefined, paidAt: '2026-01-11T10:00:00' })], 'c1', HOY)!;
    expect(p.diasMedios).toBe(10);
  });

  it('tendencia: tarda más en los últimos seis meses que antes', () => {
    const docs = [
      f('1', { issueDate: '2025-10-01', dueDate: '2025-10-31', paidDate: '2025-10-21' }), // 20
      f('2', { issueDate: '2025-11-01', dueDate: '2025-12-01', paidDate: '2025-11-21' }), // 20
      f('3', { issueDate: '2026-06-01', dueDate: '2026-07-01', paidDate: '2026-07-16' }), // 45
      f('4', { issueDate: '2026-07-01', dueDate: '2026-07-31', paidDate: '2026-08-10' }), // 40
    ];
    const p = perfilDePago(docs, 'c1', HOY)!;
    expect(p.tendencia).toBe('empeora');
    expect(p.diasAntes).toBe(20);
    expect(p.diasRecientes).toBe(43);
  });

  it('sin datos en las dos mitades no hay tendencia, y sin cobros no hay perfil', () => {
    expect(perfilDePago([f('1', { paidDate: '2026-02-01' })], 'c1', HOY)!.tendencia).toBeNull();
    expect(perfilDePago([f('1', { status: InvoiceStatus.EMITIDA })], 'c1', HOY)).toBeNull();
  });

  it('los de toda la cartera, de una pasada', () => {
    const m = perfilesDePago([f('1', { paidDate: '2026-02-01' }), f('2', { clientId: 'c2', paidDate: '2026-01-05' })], HOY);
    expect([...m.keys()].sort()).toEqual(['c1', 'c2']);
  });
});

describe('riesgo vivo', () => {
  const pend = (id: string, extra: Record<string, unknown>) => f(id, { status: InvoiceStatus.EMITIDA, ...extra });

  it('verde: debe, pero nada vencido', () => {
    const r = riesgoDeCliente([pend('1', { dueDate: '2026-11-15', total: 300, subtotal: 300 })], 'c1', HOY);
    expect(r.semaforo).toBe('verde');
    expect(plano(r.texto)).toBe('Te debe 300,00 € · nada vencido');
  });

  it('rojo: una deuda vieja, con lo pendiente y lo vencido', () => {
    const r = riesgoDeCliente([
      pend('1', { dueDate: '2026-09-12', total: 640, subtotal: 640 }),
      pend('2', { dueDate: '2026-11-15', total: 600, subtotal: 600 }),
    ], 'c1', HOY);
    expect(r.semaforo).toBe('rojo');
    expect(r.pendiente).toBe(1240);
    expect(r.vencido).toBe(640);
    expect(r.diasMasAntigua).toBe(45);
    expect(plano(r.texto)).toBe('Te debe 1.240,00 € · 640,00 € vencidos hace 45 días');
  });

  it('ámbar: vencida hace poco; lo cobrado a medias y la retención no se cuentan', () => {
    const r = riesgoDeCliente([
      pend('1', { dueDate: '2026-10-20', total: 121, subtotal: 100, retencionPct: 15, paidAmount: 6, status: InvoiceStatus.PARCIAL }),
      pend('2', { status: InvoiceStatus.ANULADA, dueDate: '2026-01-01' }),
      pend('3', { tipo: 'albaran', dueDate: '2026-01-01' }),
    ], 'c1', HOY);
    expect(r.semaforo).toBe('ambar');
    expect(r.pendiente).toBe(100);
    expect(r.facturasVencidas).toBe(1);
  });

  it('nada pendiente', () => {
    expect(riesgoDeCliente([f('1', { paidDate: '2026-02-01' })], 'c1', HOY).texto).toBe('No te debe nada');
  });
});
