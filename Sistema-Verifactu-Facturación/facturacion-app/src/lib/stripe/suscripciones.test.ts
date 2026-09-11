import { describe, it, expect } from 'vitest';
import type Stripe from 'stripe';
import { estadoDesdeStripe, planDesdePrecio, filaDesdeSuscripcion } from './suscripciones';

const env = {
  STRIPE_PRICE_BASICO_MENSUAL: 'price_bm', STRIPE_PRICE_BASICO_ANUAL: 'price_ba',
  STRIPE_PRICE_PRO_MENSUAL: 'price_pm', STRIPE_PRICE_PRO_ANUAL: 'price_pa',
  STRIPE_PRICE_SINLIMITE_MENSUAL: 'price_sm', STRIPE_PRICE_SINLIMITE_ANUAL: 'price_sa',
};

function sub(parcial: Record<string, unknown>): Stripe.Subscription {
  return {
    id: 'sub_1', status: 'active', customer: 'cus_1', cancel_at_period_end: false,
    metadata: { userId: 'u1', planId: 'basico' },
    items: { data: [{ price: { id: 'price_pa', recurring: { interval: 'year' } }, current_period_end: 1790000000 }] },
    ...parcial,
  } as unknown as Stripe.Subscription;
}

describe('estadoDesdeStripe', () => {
  it.each([
    ['active', 'active'], ['trialing', 'active'], ['past_due', 'past_due'],
    ['canceled', 'canceled'], ['unpaid', 'canceled'], ['incomplete_expired', 'canceled'],
    ['incomplete', 'inactive'], ['paused', 'inactive'],
  ])('%s → %s', (stripe, local) => {
    expect(estadoDesdeStripe(stripe as Stripe.Subscription.Status)).toBe(local);
  });
});

describe('planDesdePrecio', () => {
  it('sale del precio, no de los metadatos (el portal cambia el precio)', () => {
    expect(planDesdePrecio('price_pa', env)).toEqual({ planId: 'pro', intervalo: 'year' });
    expect(planDesdePrecio('price_sm', env)).toEqual({ planId: 'sin_limite', intervalo: 'month' });
  });
  it('un precio desconocido no es un plan', () => {
    expect(planDesdePrecio('price_otro', env)).toBeNull();
  });
});

describe('filaDesdeSuscripcion', () => {
  it('toma usuario de metadatos, plan del precio y fin de periodo del elemento', () => {
    expect(filaDesdeSuscripcion(sub({}), env)).toMatchObject({
      user_id: 'u1', origen: 'stripe', plan_id: 'pro', intervalo: 'year', estado: 'active',
      stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_1',
      periodo_fin: new Date(1790000000 * 1000).toISOString(), cancela_al_final: false,
      cortesia_hasta: null, motivo: null,
    });
  });
  it('sin userId no se puede asignar a nadie', () => {
    expect(filaDesdeSuscripcion(sub({ metadata: {} }), env)).toBeNull();
  });
});
