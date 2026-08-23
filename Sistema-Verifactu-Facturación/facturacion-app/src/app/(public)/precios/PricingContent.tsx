'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Check, X, Zap, Crown, Rocket, ShieldCheck,
  FileText, Users, BarChart3, Plug,
  ArrowRight, Sparkles, Star,
  Clock, Headphones, Download, Globe, Loader2, Store,
  Flame, Gift, Heart, Copy, Tag,
} from 'lucide-react';
import { PLANS, type PlanId } from '@/lib/plans';
import SiteNav from '@/components/public/SiteNav';
import SiteFooter from '@/components/public/SiteFooter';
import TipModal from '@/components/ui/TipModal';
import { GravityStarsBackground } from '@/components/animate-ui/components/backgrounds/gravity-stars';

type BillingCycle = 'monthly' | 'annual';

interface PlanFeature {
  text: string;
  included: boolean;
  highlight?: boolean;
}

// Metadatos solo de presentación — el precio, el id y el límite de
// facturas vienen SIEMPRE de src/lib/plans.ts (fuente única de verdad,
// también usada por el trigger de base de datos vía
// migration_005_suscripciones.sql). No dupliques números aquí.
const PLAN_DISPLAY: Record<PlanId, {
  subtitle: string;
  icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
  popular?: boolean;
  features: PlanFeature[];
  cta: string;
  gradient: string;
  iconBg: string;
  iconColor: string;
}> = {
  basico: {
    subtitle: 'Para autónomos y negocios pequeños',
    icon: Zap,
    features: [
      { text: 'Huella SHA-256 en cada factura', included: true },
      { text: 'Exportar PDF', included: true },
      { text: 'Panel de control', included: true },
      { text: 'Modo offline (PWA)', included: true },
      { text: 'Cobro online con Stripe', included: true },
      { text: 'Portal de aprobación de pedidos', included: false },
      { text: 'Terminal Punto de Venta (TPV)', included: false },
      { text: 'Informes fiscales avanzados', included: false },
      { text: 'Integración Verifactu AEAT', included: false },
      { text: 'Soporte prioritario', included: false },
    ],
    cta: 'Empezar con Básico',
    gradient: 'linear-gradient(135deg, #4a3a40 0%, #2c2226 100%)',
    iconBg: 'rgba(26, 18, 22, 0.08)',
    iconColor: '#4a3a40',
  },
  pro: {
    subtitle: 'Para pymes en crecimiento',
    icon: Crown,
    popular: true,
    features: [
      { text: 'Huella SHA-256 en cada factura', included: true },
      { text: 'Exportar PDF', included: true },
      { text: 'Panel de control avanzado', included: true },
      { text: 'Modo offline (PWA)', included: true },
      { text: 'Cobro online con Stripe', included: true },
      { text: 'Portal de aprobación de pedidos', included: true, highlight: true },
      { text: 'Terminal Punto de Venta (TPV)', included: true, highlight: true },
      { text: 'Informes fiscales avanzados', included: true, highlight: true },
      { text: 'Integración Verifactu AEAT', included: false },
      { text: 'Soporte prioritario', included: false },
    ],
    cta: 'Empezar con Pro',
    gradient: 'linear-gradient(135deg, #c9407a 0%, #9c2856 100%)',
    iconBg: 'rgba(176, 42, 92, 0.14)',
    iconColor: '#b02a5c',
  },
  sin_limite: {
    subtitle: 'Para empresas que necesitan todo',
    icon: Rocket,
    features: [
      { text: 'Facturas ilimitadas', included: true, highlight: true },
      { text: 'Huella SHA-256 en cada factura', included: true },
      { text: 'Exportar PDF', included: true },
      { text: 'Panel de control avanzado', included: true },
      { text: 'Modo offline (PWA)', included: true },
      { text: 'Cobro online con Stripe', included: true },
      { text: 'Portal de aprobación de pedidos', included: true },
      { text: 'Terminal Punto de Venta (TPV)', included: true },
      { text: 'Informes fiscales avanzados', included: true },
      { text: 'Integración Verifactu AEAT', included: true, highlight: true },
      { text: 'Soporte prioritario 24/7', included: true, highlight: true },
    ],
    cta: 'Empezar Sin Límites',
    gradient: 'linear-gradient(135deg, #6b2436 0%, #3a1420 100%)',
    iconBg: 'rgba(76, 26, 40, 0.12)',
    iconColor: '#4c1a28',
  },
};

const plans = PLANS.map(plan => ({ ...plan, ...PLAN_DISPLAY[plan.id] }));

const highlights = [
  { icon: ShieldCheck, title: 'Sellado SHA-256', desc: 'Cada factura lleva huella criptográfica inalterable' },
  { icon: Globe, title: 'Funciona offline', desc: 'PWA instalable que sincroniza al volver online' },
  { icon: Clock, title: 'Activa en 2 minutos', desc: 'Crea tu cuenta y empieza a facturar de inmediato' },
  { icon: Headphones, title: 'Soporte real', desc: 'Personas reales que entienden tu negocio' },
];

const faqs = [
  {
    q: '¿Puedo cambiar de plan en cualquier momento?',
    a: 'Sí. Puedes subir o bajar de plan cuando quieras. Si subes, la diferencia se prorratea al instante. Si bajas, el nuevo precio se aplica en tu próximo ciclo de facturación.',
  },
  {
    q: '¿Qué pasa si supero el límite de facturas?',
    a: 'Te avisamos al 80% de uso. Si llegas al límite, puedes subir de plan al instante desde Ajustes. Nunca perderás datos ni se bloquearán facturas ya emitidas.',
  },
  {
    q: '¿Mis datos están seguros?',
    a: 'Absolutamente. Usamos Supabase con Row Level Security (RLS), cifrado en tránsito (TLS 1.3) y en reposo. Cada factura lleva huella SHA-256 encadenada con la anterior: cualquier alteración se detecta automáticamente.',
  },
  {
    q: '¿Hay permanencia o compromiso?',
    a: 'No. Puedes cancelar en cualquier momento. Si eliges facturación anual, pagas por adelantado el año pero si cancelas te devolvemos la parte no usada, prorrateada por meses completos.',
  },
  {
    q: '¿Qué incluye la integración Verifactu?',
    a: 'La conexión directa con la AEAT para el sistema Verifactu de facturación electrónica. Envío automático de facturas, verificación de estado, y cumplimiento normativo completo con la regulación española.',
  },
];

export default function PricingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [billing, setBilling] = useState<BillingCycle>('monthly');
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [loadingPlan, setLoadingPlan] = useState<PlanId | null>(null);
  const [apiError, setApiError] = useState('');
  const [couponApplied, setCouponApplied] = useState(true);
  const [couponCopied, setCouponCopied] = useState(false);
  const [showTipModal, setShowTipModal] = useState(false);
  const wasCancelled = searchParams.get('cancelled') === 'true';

  const copyCoupon = () => {
    navigator.clipboard.writeText('LANZAMIENTO50');
    setCouponCopied(true);
    setTimeout(() => setCouponCopied(false), 2500);
  };

  // Ahorro real en euros por año al pagar anual (priceAnnual ya es el
  // total del año, no una cuota mensual — ver src/lib/plans.ts).
  const annualSavings = (plan: (typeof plans)[number]) => plan.priceMonthly * 12 - plan.priceAnnual;

  const handleSelectPlan = async (planId: PlanId) => {
    setApiError('');
    setLoadingPlan(planId);
    try {
      const res = await fetch('/api/stripe/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, interval: billing === 'monthly' ? 'month' : 'year' }),
      });
      const data = await res.json();

      if (res.status === 401 && data.requiresLogin) {
        router.push('/login?next=/precios');
        return;
      }
      if (!res.ok || !data.url) {
        setApiError(data.error || 'No se pudo iniciar el pago. Inténtalo de nuevo.');
        setLoadingPlan(null);
        return;
      }

      window.location.assign(data.url);
    } catch {
      setApiError('No se pudo conectar con el servidor de pagos. Inténtalo de nuevo.');
      setLoadingPlan(null);
    }
  };

  return (
    <div className="pricing-page site-page" style={{ position: 'relative', minHeight: '100vh' }}>
      {/* Fondo Estelar de Gravedad Activo en TODA la página */}
      <GravityStarsBackground
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
          width: '100vw',
          height: '100vh',
        }}
        starsCount={130}
        starsSize={2.8}
        starsOpacity={0.88}
        glowIntensity={22}
        movementSpeed={0.38}
        mouseInfluence={190}
        mouseGravity="attract"
        gravityStrength={90}
      />

      {/* Background effects */}
      <div className="pricing-bg-glow pricing-bg-glow--1" />
      <div className="pricing-bg-glow pricing-bg-glow--2" />
      <div className="pricing-bg-glow pricing-bg-glow--3" />
      <div className="pricing-bg-grid" />

      {/* Barra de navegación pública */}
      <SiteNav />

      {/* Hero Section */}
      <div className="pricing-hero-container" style={{ position: 'relative', zIndex: 1 }}>
        <header className="pricing-hero">
          <div className="pricing-hero-badge">
            <Sparkles size={14} />
            Sin permanencia · Cancela cuando quieras
          </div>
          <h1 className="pricing-hero-title">
            Facturación profesional,<br />
            precio <em className="accent-serif pricing-hero-accent">justo</em>
          </h1>
          <p className="pricing-hero-subtitle">
            Elige el plan que encaje con tu negocio. Cumplimiento normativo español,
            sellado criptográfico y cobros online incluidos en todos los planes.
          </p>

          {/* Promo Banner por Tiempo Limitado (1 Mes de Oferta) */}
          <div
            style={{
              maxWidth: 760,
              margin: 'var(--space-5) auto var(--space-2)',
              padding: '22px 24px',
              background: 'linear-gradient(135deg, rgba(30, 14, 28, 0.75) 0%, rgba(12, 5, 14, 0.85) 100%)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid rgba(201, 64, 122, 0.45)',
              borderRadius: 'var(--radius-xl)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              textAlign: 'left',
              boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.5), 0 0 30px rgba(201, 64, 122, 0.2)',
              position: 'relative',
              zIndex: 1,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ background: '#e11d48', color: '#fff', padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Flame size={12} fill="#fff" /> Oferta Limitada (1 Mes)
                </span>
                <strong style={{ fontSize: '0.95rem', color: '#ffffff' }}>
                  50% Dto. Primer Mes o 3 Meses Gratis Anual
                </strong>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.7)' }}>
                <Clock size={13} />
                <span>Oferta de lanzamiento activa</span>
              </div>
            </div>
            
            <p style={{ margin: 0, fontSize: '0.86rem', color: 'rgba(255, 255, 255, 0.8)', lineHeight: 1.45 }}>
              Usa el cupón oficial de lanzamiento en la pasarela Stripe para activar el precio promocional en cualquiera de los planes.
            </p>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'rgba(255, 255, 255, 0.9)' }}>Código cupón:</span>
              <code style={{ background: 'rgba(0, 0, 0, 0.4)', padding: '4px 12px', borderRadius: 'var(--radius-md)', border: '1px dashed #c9407a', fontWeight: 800, color: '#ff69b4', fontSize: '0.92rem', letterSpacing: '0.05em' }}>
                LANZAMIENTO50
              </code>
              <button
                onClick={copyCoupon}
                className="btn btn-ghost btn-xs"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', backgroundColor: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.1)', color: '#ffffff' }}
              >
                {couponCopied ? <Check size={13} style={{ color: '#10b981' }} /> : <Copy size={13} />}
                <span>{couponCopied ? '¡Copiado!' : 'Copiar cupón'}</span>
              </button>
            </div>
          </div>

          {wasCancelled && (
            <div className="pricing-alert pricing-alert--info" role="status">
              Pago cancelado. Puedes intentarlo de nuevo cuando quieras.
            </div>
          )}
          {apiError && (
            <div className="pricing-alert pricing-alert--error" role="alert">
              {apiError}
            </div>
          )}

          {/* Billing toggle */}
          <div className="pricing-billing-toggle">
            <button
              className={`pricing-billing-btn ${billing === 'monthly' ? 'active' : ''}`}
              onClick={() => setBilling('monthly')}
            >
              Mensual
            </button>
            <button
              className={`pricing-billing-btn ${billing === 'annual' ? 'active' : ''}`}
              onClick={() => setBilling('annual')}
            >
              Anual
              <span className="pricing-billing-save">2 meses gratis</span>
            </button>
          </div>
        </header>
      </div>

      {/* Pricing Cards */}
      <section className="pricing-cards">
        {plans.map((plan) => {
          const monthlyEquivalent = billing === 'monthly' ? plan.priceMonthly : plan.priceAnnual / 12;
          const savings = annualSavings(plan);
          const isLoading = loadingPlan === plan.id;

          return (
            <div
              key={plan.id}
              className={`pricing-card ${plan.popular ? 'pricing-card--popular' : ''}`}
            >
              {plan.popular && (
                <div className="pricing-card-badge">
                  <Star size={12} />
                  Más popular
                </div>
              )}

              <div className="pricing-card-header">
                <div className="pricing-card-icon" style={{ background: plan.iconBg }}>
                  <plan.icon size={22} style={{ color: plan.iconColor }} />
                </div>
                <h3 className="pricing-card-name">{plan.name}</h3>
                <p className="pricing-card-subtitle">{plan.subtitle}</p>
              </div>

              <div className="pricing-card-price">
                <div className="pricing-card-amount">
                  <span className="pricing-card-currency">€</span>
                  <span className="pricing-card-number">
                    {monthlyEquivalent % 1 === 0 ? monthlyEquivalent : monthlyEquivalent.toFixed(2).replace('.', ',')}
                  </span>
                  <span className="pricing-card-period">/mes</span>
                </div>
                {billing === 'annual' && (
                  <div className="pricing-card-annual-note">
                    Facturado como {plan.priceAnnual}€/año · <span className="pricing-card-savings">Ahorras {savings}€</span>
                  </div>
                )}
                {billing === 'monthly' && (
                  <div className="pricing-card-annual-note">
                    Cambia a anual y ahorra {savings}€/año
                  </div>
                )}
              </div>

              <button
                className="pricing-card-cta"
                style={{ background: plan.gradient }}
                onClick={() => handleSelectPlan(plan.id)}
                disabled={loadingPlan !== null}
              >
                {isLoading ? <Loader2 size={16} className="spin" /> : <>{plan.cta}<ArrowRight size={16} /></>}
              </button>

              <div className="pricing-card-divider" />

              <ul className="pricing-card-features">
                <li className="pricing-feature">
                  <Check size={15} className="pricing-feature-check" />
                  <span>{plan.invoiceLimit === null ? 'Facturas ilimitadas' : `Hasta ${plan.invoiceLimit} facturas/mes`}</span>
                </li>
                {plan.features.map((feat, i) => (
                  <li
                    key={i}
                    className={`pricing-feature ${!feat.included ? 'pricing-feature--disabled' : ''} ${feat.highlight ? 'pricing-feature--highlight' : ''}`}
                  >
                    {feat.included ? (
                      <Check size={15} className="pricing-feature-check" />
                    ) : (
                      <X size={15} className="pricing-feature-x" />
                    )}
                    <span>{feat.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      {/* Highlights */}
      <section className="pricing-highlights">
        <h2 className="pricing-section-title">Incluido en todos los planes</h2>
        <div className="pricing-highlights-grid">
          {highlights.map((h, i) => (
            <div key={i} className="pricing-highlight-card">
              <div className="pricing-highlight-icon">
                <h.icon size={22} />
              </div>
              <h4>{h.title}</h4>
              <p>{h.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Support & Tip Stripe Section */}
      <section
        style={{
          maxWidth: 900,
          margin: 'var(--space-10) auto 0',
          padding: 'var(--space-6) var(--space-8)',
          background: 'linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-tertiary) 100%)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-2xl)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 'var(--space-6)',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        <div style={{ flex: '1 1 400px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#e11d48', fontSize: '0.8rem', fontWeight: 700, marginBottom: 8 }}>
            <Heart size={14} fill="#e11d48" /> APOYO AL SOFTWARE INDEPENDIENTE
          </div>
          <h3 style={{ fontSize: '1.3rem', fontWeight: 800, margin: '0 0 8px' }}>
            ¿Quieres apoyar el desarrollo o invitar un café? ☕
          </h3>
          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            FactuKlima se desarrolla como software de código limpio y transparente. Si te es de gran utilidad y quieres dejar una propina o aportación voluntaria mediante Stripe, ¡te lo agradecemos enormemente!
          </p>
        </div>
        <div>
          <button
            className="btn btn-primary"
            onClick={() => setShowTipModal(true)}
            style={{
              padding: '12px 24px',
              fontSize: '0.95rem',
              fontWeight: 800,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              borderRadius: 'var(--radius-full)',
              background: 'linear-gradient(135deg, #c9407a 0%, #7c1a3e 100%)',
              boxShadow: '0 4px 15px rgba(201, 64, 122, 0.35)',
            }}
          >
            <Heart size={16} fill="#ffffff" /> Dejar una Propina / Tip con Stripe
          </button>
        </div>
      </section>

      {/* Comparison Table */}
      <section className="pricing-comparison">
        <h2 className="pricing-section-title">Compara los planes al detalle</h2>
        <div className="pricing-table-wrapper">
          <table className="pricing-table">
            <thead>
              <tr>
                <th>Característica</th>
                <th>Básico</th>
                <th className="pricing-table-popular">Profesional</th>
                <th>Sin Límites</th>
              </tr>
            </thead>
            <tbody>
              <tr className="pricing-table-section">
                <td colSpan={4}><FileText size={14} /> Facturación</td>
              </tr>
              <tr>
                <td>Facturas por mes</td>
                <td>15</td>
                <td className="pricing-table-popular">100</td>
                <td><span className="pricing-table-unlimited">∞ Ilimitadas</span></td>
              </tr>
              <tr>
                <td>Exportar PDF</td>
                <td><Check size={14} /></td>
                <td className="pricing-table-popular"><Check size={14} /></td>
                <td><Check size={14} /></td>
              </tr>
              <tr>
                <td>Huella SHA-256</td>
                <td><Check size={14} /></td>
                <td className="pricing-table-popular"><Check size={14} /></td>
                <td><Check size={14} /></td>
              </tr>
              <tr>
                <td>Facturación recurrente</td>
                <td><X size={14} className="pricing-feature-x" /></td>
                <td className="pricing-table-popular"><Check size={14} /></td>
                <td><Check size={14} /></td>
              </tr>

              <tr className="pricing-table-section">
                <td colSpan={4}><Users size={14} /> Gestión</td>
              </tr>
              <tr>
                <td>Clientes</td>
                <td>50</td>
                <td className="pricing-table-popular">250</td>
                <td><span className="pricing-table-unlimited">∞ Ilimitados</span></td>
              </tr>
              <tr>
                <td>Productos</td>
                <td>100</td>
                <td className="pricing-table-popular">500</td>
                <td><span className="pricing-table-unlimited">∞ Ilimitados</span></td>
              </tr>
              <tr>
                <td>Portal de aprobación</td>
                <td><X size={14} className="pricing-feature-x" /></td>
                <td className="pricing-table-popular"><Check size={14} /></td>
                <td><Check size={14} /></td>
              </tr>

              <tr className="pricing-table-section">
                <td colSpan={4}><BarChart3 size={14} /> Informes y cobros</td>
              </tr>
              <tr>
                <td>Dashboard analítico</td>
                <td>Básico</td>
                <td className="pricing-table-popular">Avanzado</td>
                <td>Avanzado</td>
              </tr>
              <tr>
                <td>Cobro online Stripe</td>
                <td><Check size={14} /></td>
                <td className="pricing-table-popular"><Check size={14} /></td>
                <td><Check size={14} /></td>
              </tr>
              <tr>
                <td>Informes fiscales</td>
                <td>Básico</td>
                <td className="pricing-table-popular">Completo</td>
                <td>Completo</td>
              </tr>

              <tr className="pricing-table-section">
                <td colSpan={4}><Store size={14} /> Terminal Punto de Venta</td>
              </tr>
              <tr>
                <td>Terminal TPV mostrador</td>
                <td><X size={14} className="pricing-feature-x" /></td>
                <td className="pricing-table-popular"><Check size={14} /></td>
                <td><Check size={14} /></td>
              </tr>

              <tr className="pricing-table-section">
                <td colSpan={4}><Plug size={14} /> Cumplimiento</td>
              </tr>
              <tr>
                <td>Verificación integridad</td>
                <td><Check size={14} /></td>
                <td className="pricing-table-popular"><Check size={14} /></td>
                <td><Check size={14} /></td>
              </tr>
              <tr>
                <td>Integración Verifactu AEAT</td>
                <td><X size={14} className="pricing-feature-x" /></td>
                <td className="pricing-table-popular"><X size={14} className="pricing-feature-x" /></td>
                <td><Check size={14} /></td>
              </tr>
              <tr>
                <td>Soporte prioritario</td>
                <td><X size={14} className="pricing-feature-x" /></td>
                <td className="pricing-table-popular">Email</td>
                <td>24/7 · Teléfono + email</td>
              </tr>

              <tr className="pricing-table-section">
                <td colSpan={4}><Download size={14} /> Plataforma</td>
              </tr>
              <tr>
                <td>PWA / Modo offline</td>
                <td><Check size={14} /></td>
                <td className="pricing-table-popular"><Check size={14} /></td>
                <td><Check size={14} /></td>
              </tr>
              <tr>
                <td>Sincronización automática</td>
                <td><Check size={14} /></td>
                <td className="pricing-table-popular"><Check size={14} /></td>
                <td><Check size={14} /></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* FAQ */}
      <section className="pricing-faq">
        <h2 className="pricing-section-title">Preguntas frecuentes</h2>
        <div className="pricing-faq-list">
          {faqs.map((faq, i) => (
            <button
              key={i}
              className={`pricing-faq-item ${openFaq === i ? 'open' : ''}`}
              onClick={() => setOpenFaq(openFaq === i ? null : i)}
            >
              <div className="pricing-faq-question">
                <span>{faq.q}</span>
                <span className="pricing-faq-toggle">{openFaq === i ? '−' : '+'}</span>
              </div>
              {openFaq === i && (
                <div className="pricing-faq-answer">{faq.a}</div>
              )}
            </button>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="pricing-final-cta">
        <div className="pricing-final-cta-inner">
          <h2>¿Listo para facturar como un profesional?</h2>
          <p>Elige tu plan y empieza a facturar hoy mismo. Sin permanencia.</p>
          <button
            className="pricing-final-cta-btn"
            onClick={() => router.push('/login')}
          >
            Crear cuenta
            <ArrowRight size={18} />
          </button>
        </div>
      </section>

      <p className="pricing-iva-note">
        Todos los precios indicados son sin IVA. El IVA se añade según la legislación vigente.
      </p>

      <TipModal isOpen={showTipModal} onClose={() => setShowTipModal(false)} />

      <SiteFooter />
    </div>
  );
}
