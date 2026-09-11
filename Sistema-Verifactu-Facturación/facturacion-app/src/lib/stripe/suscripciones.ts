import type Stripe from 'stripe';
import { PLANS, type PlanId } from '@/lib/plans';
import type { FilaSuscripcion } from '@/lib/suscripcion';

export function estadoDesdeStripe(status: Stripe.Subscription.Status): FilaSuscripcion['estado'] {
  switch (status) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
      return 'past_due';
    case 'canceled':
    case 'unpaid':
    case 'incomplete_expired':
      return 'canceled';
    default:
      return 'inactive';
  }
}

/**
 * El plan sale del PRECIO. Los metadatos se ponen al suscribirse, pero si
 * el cliente cambia de plan en el portal de Stripe, lo que cambia es el
 * precio y los metadatos se quedan con el plan viejo.
 */
export function planDesdePrecio(
  priceId: string,
  env: Record<string, string | undefined> = process.env,
): { planId: PlanId; intervalo: 'month' | 'year' } | null {
  for (const plan of PLANS) {
    if (env[plan.stripePriceEnvMonthly] === priceId) return { planId: plan.id, intervalo: 'month' };
    if (env[plan.stripePriceEnvAnnual] === priceId) return { planId: plan.id, intervalo: 'year' };
  }
  return null;
}

export function filaDesdeSuscripcion(sub: Stripe.Subscription, env: Record<string, string | undefined> = process.env) {
  const userId = sub.metadata?.userId;
  const elemento = sub.items.data[0];
  const plan = elemento ? planDesdePrecio(elemento.price.id, env) : null;
  if (!userId || !plan) return null;

  const finPeriodo = Math.max(...sub.items.data.map(i => i.current_period_end));
  return {
    user_id: userId,
    origen: 'stripe' as const,
    plan_id: plan.planId,
    intervalo: plan.intervalo,
    estado: estadoDesdeStripe(sub.status),
    stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
    stripe_subscription_id: sub.id,
    periodo_fin: new Date(finPeriodo * 1000).toISOString(),
    cancela_al_final: sub.cancel_at_period_end,
    cortesia_hasta: null,
    motivo: null,
  };
}
