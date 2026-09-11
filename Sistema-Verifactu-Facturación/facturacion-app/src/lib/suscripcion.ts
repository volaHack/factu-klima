import type { PlanId } from './plans';

/** Una fila de `public.suscripciones`, con lo que hace falta para decidir. */
export interface FilaSuscripcion {
  origen: 'stripe' | 'cortesia';
  plan_id: PlanId;
  estado: 'active' | 'past_due' | 'canceled' | 'inactive';
  cortesia_hasta: string | null;
  periodo_fin: string | null;
  cancela_al_final: boolean;
}

export interface EstadoSuscripcion {
  activa: boolean;
  planId: PlanId | null;
  origen: 'stripe' | 'cortesia' | null;
  motivoInactiva?: string;
}

/**
 * El mismo criterio que `fn_check_subscription_limit` (migración 041):
 * `past_due` cuenta como activa y una cortesía vale hasta su último día
 * incluido. Si cambia uno, cambia el otro.
 */
export function estadoEfectivo(fila: FilaSuscripcion | null, hoy: Date = new Date()): EstadoSuscripcion {
  if (!fila) return { activa: false, planId: null, origen: null };

  const { origen, plan_id: planId } = fila;
  if (fila.estado !== 'active' && fila.estado !== 'past_due') {
    return { activa: false, planId, origen, motivoInactiva: 'La suscripción está cancelada.' };
  }
  if (origen === 'cortesia' && fila.cortesia_hasta && fila.cortesia_hasta < hoy.toISOString().slice(0, 10)) {
    return { activa: false, planId, origen, motivoInactiva: `La cortesía terminó el ${fila.cortesia_hasta}.` };
  }
  return { activa: true, planId, origen };
}
