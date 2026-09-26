import { describe, expect, it } from 'vitest';
import { aCentimos, pendienteDeCobro, sePuedePagarOnline, trasCobrar } from './calculo';

const f = (over: Record<string, unknown> = {}) => ({ total: 121, subtotal: 100, retencion_pct: null, paid_amount: 0, status: 'emitida', ...over });

describe('pendienteDeCobro', () => {
  it('lo que falta de una factura sin cobrar', () => {
    expect(pendienteDeCobro(f())).toBe(121);
  });
  it('descuenta lo ya cobrado', () => {
    expect(pendienteDeCobro(f({ paid_amount: 21 }))).toBe(100);
  });
  it('con retención de IRPF se paga el total menos la retención', () => {
    // 100 de base, 21 de IVA, 15 % de retención: 106.
    expect(pendienteDeCobro(f({ retencion_pct: 15 }))).toBe(106);
  });
  it('nunca negativo', () => {
    expect(pendienteDeCobro(f({ paid_amount: 200 }))).toBe(0);
  });
});

describe('sePuedePagarOnline', () => {
  it('emitidas, pendientes, vencidas y parciales con algo pendiente', () => {
    for (const status of ['emitida', 'pendiente', 'vencida', 'parcial']) expect(sePuedePagarOnline(f({ status }))).toBe(true);
  });
  it('ni borradores, ni pagadas, ni anuladas, ni restos de céntimos', () => {
    expect(sePuedePagarOnline(f({ status: 'borrador' }))).toBe(false);
    expect(sePuedePagarOnline(f({ status: 'pagada' }))).toBe(false);
    expect(sePuedePagarOnline(f({ status: 'anulada' }))).toBe(false);
    expect(sePuedePagarOnline(f({ paid_amount: 120.8 }))).toBe(false);
  });
});

describe('trasCobrar', () => {
  it('pagada entera', () => {
    expect(trasCobrar(f(), 121)).toEqual({ paidAmount: 121, status: 'pagada', pagadaEntera: true });
  });
  it('pago parcial', () => {
    expect(trasCobrar(f(), 50)).toEqual({ paidAmount: 50, status: 'parcial', pagadaEntera: false });
  });
  it('con retención, pagar lo que toca la deja pagada', () => {
    expect(trasCobrar(f({ retencion_pct: 15 }), 106).status).toBe('pagada');
  });
  it('céntimos para Stripe sin errores de coma flotante', () => {
    expect(aCentimos(19.99)).toBe(1999);
    expect(aCentimos(0.1 + 0.2)).toBe(30);
  });
});
