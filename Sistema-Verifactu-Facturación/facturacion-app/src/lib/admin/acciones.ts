import { getPlan, type PlanId } from '@/lib/plans';

export type AccionAdmin =
  | { tipo: 'cortesia'; planId: PlanId; hasta: string; motivo: string }
  | { tipo: 'quitar_cortesia'; motivo: string }
  | { tipo: 'cambiar_plan'; planId: PlanId; intervalo: 'month' | 'year'; motivo: string }
  | { tipo: 'cancelar'; inmediato: boolean; motivo: string }
  | { tipo: 'reembolsar'; motivo: string };

export function validarAccion(cuerpo: unknown, hoy: Date):
  { ok: true; accion: AccionAdmin } | { ok: false; error: string } {
  if (!cuerpo || typeof cuerpo !== 'object') return { ok: false, error: 'Petición vacía.' };
  const b = cuerpo as Record<string, unknown>;
  const motivo = typeof b.motivo === 'string' ? b.motivo.trim() : '';
  const planValido = typeof b.planId === 'string' && !!getPlan(b.planId);

  switch (b.tipo) {
    case 'cortesia':
    case 'quitar_cortesia':
    case 'cambiar_plan':
    case 'cancelar':
    case 'reembolsar':
      break;
    default:
      return { ok: false, error: 'Acción desconocida.' };
  }
  if (motivo.length < 5) return { ok: false, error: 'Escribe el motivo (queda registrado).' };

  switch (b.tipo) {
    case 'cortesia': {
      const hasta = typeof b.hasta === 'string' ? b.hasta : '';
      if (!planValido) return { ok: false, error: 'Plan no válido.' };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(hasta) || hasta <= hoy.toISOString().slice(0, 10)) {
        return { ok: false, error: 'La cortesía necesita una fecha de fin posterior a hoy.' };
      }
      return { ok: true, accion: { tipo: 'cortesia', planId: b.planId as PlanId, hasta, motivo } };
    }
    case 'cambiar_plan':
      if (!planValido || (b.intervalo !== 'month' && b.intervalo !== 'year')) return { ok: false, error: 'Plan o periodicidad no válidos.' };
      return { ok: true, accion: { tipo: 'cambiar_plan', planId: b.planId as PlanId, intervalo: b.intervalo, motivo } };
    case 'cancelar':
      return { ok: true, accion: { tipo: 'cancelar', inmediato: b.inmediato === true, motivo } };
    default:
      return { ok: true, accion: { tipo: b.tipo as 'quitar_cortesia' | 'reembolsar', motivo } };
  }
}
