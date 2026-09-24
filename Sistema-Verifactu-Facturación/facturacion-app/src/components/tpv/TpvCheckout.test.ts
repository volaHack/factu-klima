import { describe, it, expect } from 'vitest';

import { billetesSugeridos } from './TpvCheckout';

describe('billetes que sugiere el cobro en efectivo', () => {
  it('los que de verdad entrega la gente, por encima del total', () => {
    expect(billetesSugeridos(12.4)).toEqual([13, 15, 20, 50]);
  });

  it('sin repetir ni el importe exacto', () => {
    expect(billetesSugeridos(20)).toEqual([50, 100]);
    expect(billetesSugeridos(4.5)).toEqual([5, 10, 20, 50]);
  });

  it('con importes grandes sigue ofreciendo algo útil', () => {
    expect(billetesSugeridos(87.3)).toEqual([88, 90, 100]);
  });
});
