import { describe, it, expect } from 'vitest';
import { PLANS, getPlan, ANNUAL_MONTHS_FREE } from './plans';

describe('plans', () => {
  it('el precio anual es 10x el mensual (2 meses gratis) en los tres planes', () => {
    for (const plan of PLANS) {
      expect(plan.priceAnnual).toBe(plan.priceMonthly * 10);
    }
  });

  it('getPlan devuelve el plan por id', () => {
    expect(getPlan('pro')?.invoiceLimit).toBe(100);
  });

  it('getPlan devuelve undefined para un id desconocido', () => {
    expect(getPlan('inventado')).toBeUndefined();
  });

  it('"sin_limite" no tiene tope de facturas', () => {
    expect(getPlan('sin_limite')?.invoiceLimit).toBeNull();
  });

  it('ANNUAL_MONTHS_FREE es 2, consistente con el 10x', () => {
    expect(ANNUAL_MONTHS_FREE).toBe(2);
  });
});
