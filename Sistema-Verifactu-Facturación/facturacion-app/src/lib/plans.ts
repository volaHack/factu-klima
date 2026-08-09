export type PlanId = 'basico' | 'pro' | 'sin_limite';

export interface Plan {
  id: PlanId;
  name: string;
  priceMonthly: number;
  priceAnnual: number;
  invoiceLimit: number | null; // null = sin límite
  featured: boolean;
  stripePriceEnvMonthly: string;
  stripePriceEnvAnnual: string;
}

export const ANNUAL_MONTHS_FREE = 2;

// OJO: si cambias priceMonthly/invoiceLimit aquí, cambia también
// fn_plan_invoice_limit en migration_005_suscripciones.sql — no hay
// una fuente de verdad única entre Postgres y TypeScript para esto.
export const PLANS: Plan[] = [
  {
    id: 'basico', name: 'Básico',
    priceMonthly: 49, priceAnnual: 490,
    invoiceLimit: 15, featured: false,
    stripePriceEnvMonthly: 'STRIPE_PRICE_BASICO_MENSUAL',
    stripePriceEnvAnnual: 'STRIPE_PRICE_BASICO_ANUAL',
  },
  {
    id: 'pro', name: 'Pro',
    priceMonthly: 79, priceAnnual: 790,
    invoiceLimit: 100, featured: true,
    stripePriceEnvMonthly: 'STRIPE_PRICE_PRO_MENSUAL',
    stripePriceEnvAnnual: 'STRIPE_PRICE_PRO_ANUAL',
  },
  {
    id: 'sin_limite', name: 'Sin límite',
    priceMonthly: 119, priceAnnual: 1190,
    invoiceLimit: null, featured: false,
    stripePriceEnvMonthly: 'STRIPE_PRICE_SINLIMITE_MENSUAL',
    stripePriceEnvAnnual: 'STRIPE_PRICE_SINLIMITE_ANUAL',
  },
];

export function getPlan(id: string): Plan | undefined {
  return PLANS.find(p => p.id === id);
}
