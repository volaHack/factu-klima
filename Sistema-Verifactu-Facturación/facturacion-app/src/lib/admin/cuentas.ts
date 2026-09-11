import { getPlan, type PlanId } from '@/lib/plans';
import { estadoEfectivo, type EstadoSuscripcion, type FilaSuscripcion } from '@/lib/suscripcion';

export interface UsuarioAuth { id: string; email?: string | null; created_at: string; last_sign_in_at?: string | null; }
export interface AjustesCuenta { user_id: string; business_name: string | null; nif: string | null; updated_at: string | null; }
export interface FilaSuscripcionCompleta extends FilaSuscripcion {
  user_id: string; intervalo: 'month' | 'year' | null; actualizado_en: string;
}

export interface Cuenta {
  id: string; email: string; nombre: string | null; nif: string | null;
  alta: string; ultimaActividad: string | null; esAdmin: boolean; facturasMes: number;
  estado: EstadoSuscripcion; fila: FilaSuscripcionCompleta | null;
}

const mismoMes = (iso: string, hoy: Date) => iso.slice(0, 7) === hoy.toISOString().slice(0, 7);

export function combinarCuentas(d: {
  usuarios: UsuarioAuth[]; ajustes: AjustesCuenta[]; suscripciones: FilaSuscripcionCompleta[];
  facturasMes: { user_id: string; facturas: number }[]; admins: string[]; hoy: Date;
}): Cuenta[] {
  const ajustesPorCuenta = new Map<string, AjustesCuenta>();
  for (const a of d.ajustes) {
    const previo = ajustesPorCuenta.get(a.user_id);
    if (!previo || (a.updated_at ?? '') > (previo.updated_at ?? '')) ajustesPorCuenta.set(a.user_id, a);
  }
  const sus = new Map(d.suscripciones.map(s => [s.user_id, s]));
  const facturas = new Map(d.facturasMes.map(f => [f.user_id, Number(f.facturas)]));
  const admins = new Set(d.admins);

  return d.usuarios.map(u => {
    const fila = sus.get(u.id) ?? null;
    const a = ajustesPorCuenta.get(u.id);
    return {
      id: u.id, email: u.email ?? '', nombre: a?.business_name || null, nif: a?.nif || null,
      alta: u.created_at, ultimaActividad: u.last_sign_in_at ?? null,
      esAdmin: admins.has(u.id), facturasMes: facturas.get(u.id) ?? 0,
      estado: estadoEfectivo(fila, d.hoy), fila,
    };
  });
}

export function resumen(cuentas: Cuenta[], hoy: Date) {
  const activasPorPlan: Record<PlanId, number> = { basico: 0, pro: 0, sin_limite: 0 };
  let cortesias = 0, ingresosMensuales = 0, cobrosFallidos = 0, bajasMes = 0;

  for (const c of cuentas) {
    if (c.fila?.estado === 'past_due') cobrosFallidos++;
    if (c.fila?.estado === 'canceled' && mismoMes(c.fila.actualizado_en, hoy)) bajasMes++;
    if (!c.estado.activa || !c.estado.planId) continue;
    activasPorPlan[c.estado.planId]++;
    if (c.estado.origen === 'cortesia') { cortesias++; continue; }
    const plan = getPlan(c.estado.planId);
    if (plan) ingresosMensuales += c.fila?.intervalo === 'year' ? plan.priceAnnual / 12 : plan.priceMonthly;
  }
  return {
    activasPorPlan, cortesias, cobrosFallidos, bajasMes,
    ingresosMensuales: Math.round(ingresosMensuales * 100) / 100,
    altasMes: cuentas.filter(c => mismoMes(c.alta, hoy)).length,
  };
}
