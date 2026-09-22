export type PlanId = 'tpv' | 'basico' | 'pro' | 'sin_limite';

export interface Plan {
  id: PlanId;
  name: string;
  priceMonthly: number;
  priceAnnual: number;
  /** Tope de facturas COMPLETAS al mes; null = sin límite. */
  invoiceLimit: number | null;
  featured: boolean;
  stripePriceEnvMonthly: string;
  stripePriceEnvAnnual: string;
}

/** Los que se comparan entre si en la tabla: se pagan por volumen. */
export type PlanFacturacionId = Exclude<PlanId, 'tpv'>;

export const ANNUAL_MONTHS_FREE = 2;

// OJO: si cambias priceMonthly/invoiceLimit aquí, cambia también
// fn_plan_invoice_limit en migration_005_suscripciones.sql — no hay
// una fuente de verdad única entre Postgres y TypeScript para esto.
export const PLANS: (Plan & { id: PlanFacturacionId })[] = [
  {
    id: 'basico', name: 'Básico',
    priceMonthly: 49, priceAnnual: 490,
    invoiceLimit: 25, featured: false,
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

/**
 * EL PLAN DEL MOSTRADOR
 *
 * Va aparte de `PLANS` a propósito. `PLANS` son los tres planes que se
 * comparan entre sí —se paga por volumen de facturas— y hay código que
 * cuenta con eso: la tabla comparativa los pinta como columnas, el panel
 * de administración reparte los ingresos entre ellos y `planLimits` usa
 * PLANS[0] como plan de reserva. Meter aquí un cuarto los habría roto a
 * los tres de una vez.
 *
 * El TPV no compite con ellos: es para quien sólo tiene mostrador. Por
 * eso lleva tickets ILIMITADOS (facturas simplificadas del punto de
 * venta) y sólo 10 facturas completas al mes, para el cliente que pide
 * factura de vez en cuando. Ese reparto lo aplica la base de datos, no
 * la página: ver migration_043_plan_tpv.sql, donde los tickets no
 * cuentan contra el tope.
 */
export const PLAN_MOSTRADOR: Plan = {
  id: 'tpv', name: 'TPV',
  priceMonthly: 29, priceAnnual: 290,
  invoiceLimit: 10, featured: false,
  stripePriceEnvMonthly: 'STRIPE_PRICE_TPV_MENSUAL',
  stripePriceEnvAnnual: 'STRIPE_PRICE_TPV_ANUAL',
};

/** Todo lo que se puede contratar, para buscar por id. */
export const TODOS_LOS_PLANES: Plan[] = [PLAN_MOSTRADOR, ...PLANS];

export function getPlan(id: string): Plan | undefined {
  return TODOS_LOS_PLANES.find(p => p.id === id);
}
