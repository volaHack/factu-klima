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
  const planId: PlanId = settings?.planId || 'pro';
  const status = settings?.subscriptionStatus || 'active';
  const plan = getPlan(planId) || PLANS[1]; // fallback a Pro
  const currentCount = countMonthlyInvoices(invoices);

  if (status === 'inactive' || status === 'canceled') {
    return {
      allowed: false,
      reason: 'Tu suscripción está inactiva o cancelada. Suscríbete a un plan para emitir facturas y usar el TPV.',
      currentCount,
      limit: plan.invoiceLimit,
      planName: 'Sin Suscripción Activa',
      requiredPlan: 'basico',
    };
  }

  if (plan.invoiceLimit !== null && currentCount >= plan.invoiceLimit) {
    const nextPlan: PlanId = planId === 'basico' ? 'pro' : 'sin_limite';
    return {
      allowed: false,
      reason: `Has alcanzado el límite de ${plan.invoiceLimit} facturas mensuales de tu Plan ${plan.name}.`,
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
