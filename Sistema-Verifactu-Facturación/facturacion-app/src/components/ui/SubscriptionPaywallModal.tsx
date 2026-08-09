'use client';

import Link from 'next/link';
import { ShieldAlert, ArrowRight, X, Check, Zap } from 'lucide-react';
import { PLANS, PlanId } from '@/lib/plans';

interface SubscriptionPaywallModalProps {
  title?: string;
  description?: string;
  requiredPlan?: PlanId;
  onClose: () => void;
}

export default function SubscriptionPaywallModal({
  title = 'Suscripción requerida',
  description = 'Has alcanzado el límite de uso de tu plan actual o esta función requiere un plan superior.',
  requiredPlan = 'pro',
  onClose,
}: SubscriptionPaywallModalProps) {
  const plan = PLANS.find(p => p.id === requiredPlan) || PLANS[1];

  return (
    <div className="modal-overlay animate-fade-in" style={{ zIndex: 1200, backdropFilter: 'blur(6px)' }}>
      <div className="modal" style={{ maxWidth: 480, padding: 0, overflow: 'hidden', borderRadius: 'var(--radius-xl)' }}>
        <div style={{
          padding: 'var(--space-6)',
          background: 'linear-gradient(135deg, var(--wine-500) 0%, #2a0e17 100%)',
          color: '#ffffff',
          position: 'relative',
        }}>
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              right: 16,
              top: 16,
              background: 'none',
              border: 'none',
              color: '#ffffff',
              opacity: 0.7,
              cursor: 'pointer',
            }}
          >
            <X size={20} />
          </button>
          
          <div style={{
            width: 48,
            height: 48,
            borderRadius: 'var(--radius-lg)',
            background: 'rgba(255, 255, 255, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 'var(--space-3)',
          }}>
            <Zap size={26} style={{ color: '#f6b9cf' }} />
          </div>
          
          <h3 style={{ margin: '0 0 var(--space-1)', fontSize: '1.35rem', fontWeight: 700, color: '#ffffff' }}>
            {title}
          </h3>
          <p style={{ margin: 0, fontSize: 'var(--text-xs)', opacity: 0.85, lineHeight: 1.5 }}>
            {description}
          </p>
        </div>

        <div style={{ padding: 'var(--space-6)', background: 'var(--bg-card)' }}>
          <div style={{
            border: '1px solid var(--accent-500)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-4)',
            background: 'var(--accent-50)',
            marginBottom: 'var(--space-5)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
              <span style={{ fontWeight: 700, color: 'var(--accent-500)', textTransform: 'uppercase', fontSize: 'var(--text-2xs)', letterSpacing: '0.08em' }}>
                Plan Recomendado: {plan.name}
              </span>
              <span style={{ fontWeight: 700, fontSize: 'var(--text-lg)', color: 'var(--text-primary)' }}>
                {plan.priceMonthly} €<small style={{ fontSize: '0.7em', fontWeight: 400 }}>/mes</small>
              </span>
            </div>
            <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
              <li style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Check size={14} style={{ color: 'var(--accent-500)' }} /> {plan.invoiceLimit ? `Hasta ${plan.invoiceLimit} facturas al mes` : 'Facturación y TPV sin límite'}
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Check size={14} style={{ color: 'var(--accent-500)' }} /> Certificado FNMT y sellado Verifactu oficial
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Check size={14} style={{ color: 'var(--accent-500)' }} /> Sin permanencia · Cancela en 1-clic
              </li>
            </ul>
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <button className="btn btn-secondary" onClick={onClose} style={{ flex: 1 }}>
              Más tarde
            </button>
            <Link href="/precios" className="btn btn-primary" style={{ flex: 1.4, justifyContent: 'center' }} onClick={onClose}>
              Ver planes y suscribirme <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
