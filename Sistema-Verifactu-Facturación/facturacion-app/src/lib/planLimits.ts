import { CompanySettings, Invoice, InvoiceStatus } from './types';
import { PLANS, PlanId, getPlan } from './plans';

export interface PlanLimitResult {
  allowed: boolean;
  reason?: string;
  currentCount: number;
  limit: number | null;
  planName: string;
  requiredPlan?: PlanId;
}

/**
 * Calcula cuántas facturas se han emitido en el mes actual.
 */
export function countMonthlyInvoices(invoices: Invoice[]): number {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  return invoices.filter(inv => {
    if (inv.status === InvoiceStatus.ANULADA) return false;
    const d = new Date(inv.issueDate || inv.createdAt);
    return d.getFullYear() === year && d.getMonth() === month;
  }).length;
}

/**
 * Evalúa si la empresa puede emitir una nueva factura según su plan y estado de suscripción.
 */
export function evaluatePlanLimit(
  settings: CompanySettings | null,
  invoices: Invoice[]
): PlanLimitResult {
  const status = settings?.subscriptionStatus || 'inactive';
  const planId: PlanId = settings?.planId || 'basico';
  const currentCount = countMonthlyInvoices(invoices);

  if (status === 'inactive' || status === 'canceled') {
    return {
      allowed: false,
      reason: 'No dispones de una suscripción activa. Elige y activa un plan (Básico, Pro o Sin Límite) para comenzar a emitir facturas y cobrar en TPV.',
      currentCount,
      limit: 0,
      planName: 'Sin Suscripción',
      requiredPlan: 'basico',
    };
  }

  const plan = getPlan(planId) || PLANS[0]; // Plan Básico fallback

  if (plan.invoiceLimit !== null && currentCount >= plan.invoiceLimit) {
    const nextPlan: PlanId = planId === 'basico' ? 'pro' : 'sin_limite';
    return {
      allowed: false,
      reason: `Has alcanzado el límite de ${plan.invoiceLimit} facturas mensuales de tu Plan ${plan.name}. Suscríbete a un plan superior para continuar.`,
      currentCount,
      limit: plan.invoiceLimit,
      planName: `Plan ${plan.name}`,
      requiredPlan: nextPlan,
    };
  }

  return {
    allowed: true,
    currentCount,
    limit: plan.invoiceLimit,
    planName: `Plan ${plan.name}`,
  };
}
