'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check, X, Zap, Crown, Rocket, ShieldCheck,
  FileText, Users, Package, BarChart3, Plug,
  ArrowRight, Sparkles, Building2, Star,
  Clock, Headphones, Download, Globe,
} from 'lucide-react';

type BillingCycle = 'monthly' | 'annual';

interface PlanFeature {
  text: string;
  included: boolean;
  highlight?: boolean;
}

interface Plan {
  id: string;
  name: string;
  subtitle: string;
  icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
  monthlyPrice: number;
  annualPrice: number;
  popular?: boolean;
  features: PlanFeature[];
  cta: string;
  gradient: string;
  iconBg: string;
  iconColor: string;
}

const plans: Plan[] = [
  {
    id: 'basico',
    name: 'Básico',
    subtitle: 'Para autónomos y negocios pequeños',
    icon: Zap,
    monthlyPrice: 39.50,
    annualPrice: 32,
    features: [
      { text: 'Hasta 100 facturas/mes', included: true },
      { text: 'Hasta 50 clientes', included: true },
      { text: 'Hasta 100 productos', included: true },
      { text: 'Huella SHA-256 en cada factura', included: true },
      { text: 'Exportar PDF', included: true },
      { text: 'Panel de control', included: true },
      { text: 'Modo offline (PWA)', included: true },
      { text: 'Cobro online con Stripe', included: true },
      { text: 'Portal de aprobación de pedidos', included: false },
      { text: 'Informes fiscales avanzados', included: false },
      { text: 'Integración Verifactu AEAT', included: false },
      { text: 'Soporte prioritario', included: false },
    ],
    cta: 'Empezar con Básico',
    gradient: 'linear-gradient(135deg, #4a3a40 0%, #2c2226 100%)',
    iconBg: 'rgba(26, 18, 22, 0.08)',
    iconColor: '#4a3a40',
  },
  {
    id: 'pro',
    name: 'Profesional',
    subtitle: 'Para pymes en crecimiento',
    icon: Crown,
    monthlyPrice: 55,
    annualPrice: 44,
    popular: true,
    features: [
      { text: 'Hasta 500 facturas/mes', included: true },
      { text: 'Hasta 250 clientes', included: true },
      { text: 'Hasta 500 productos', included: true },
      { text: 'Huella SHA-256 en cada factura', included: true },
      { text: 'Exportar PDF', included: true },
      { text: 'Panel de control avanzado', included: true },
      { text: 'Modo offline (PWA)', included: true },
      { text: 'Cobro online con Stripe', included: true },
      { text: 'Portal de aprobación de pedidos', included: true, highlight: true },
      { text: 'Informes fiscales avanzados', included: true, highlight: true },
      { text: 'Integración Verifactu AEAT', included: false },
      { text: 'Soporte prioritario', included: false },
    ],
    cta: 'Empezar con Pro',
    gradient: 'linear-gradient(135deg, #c9407a 0%, #9c2856 100%)',
    iconBg: 'rgba(176, 42, 92, 0.14)',
    iconColor: '#b02a5c',
  },
  {
    id: 'enterprise',
    name: 'Sin Límites',
    subtitle: 'Para empresas que necesitan todo',
    icon: Rocket,
    monthlyPrice: 110,
    annualPrice: 89,
    features: [
      { text: 'Facturas ilimitadas', included: true, highlight: true },
      { text: 'Clientes ilimitados', included: true, highlight: true },
      { text: 'Productos ilimitados', included: true, highlight: true },
      { text: 'Huella SHA-256 en cada factura', included: true },
      { text: 'Exportar PDF', included: true },
      { text: 'Panel de control avanzado', included: true },
      { text: 'Modo offline (PWA)', included: true },
      { text: 'Cobro online con Stripe', included: true },
      { text: 'Portal de aprobación de pedidos', included: true },
      { text: 'Informes fiscales avanzados', included: true },
      { text: 'Integración Verifactu AEAT', included: true, highlight: true },
      { text: 'Soporte prioritario 24/7', included: true, highlight: true },
    ],
    cta: 'Empezar Sin Límites',
    gradient: 'linear-gradient(135deg, #6b2436 0%, #3a1420 100%)',
    iconBg: 'rgba(76, 26, 40, 0.12)',
    iconColor: '#4c1a28',
  },
];

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
    q: '¿Puedo probar antes de pagar?',
    a: 'Sí. Todos los planes incluyen 14 días de prueba gratis, sin introducir tarjeta. Cuando estés listo, activas el plan que mejor encaje.',
  },
  {
    q: '¿Qué incluye la integración Verifactu?',
    a: 'La conexión directa con la AEAT para el sistema Verifactu de facturación electrónica. Envío automático de facturas, verificación de estado, y cumplimiento normativo completo con la regulación española.',
  },
];

export default function PreciosPage() {
  const router = useRouter();
  const [billing, setBilling] = useState<BillingCycle>('monthly');
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const annualSavings = (plan: Plan) => {
    const monthly = plan.monthlyPrice * 12;
    const annual = plan.annualPrice * 12;
    const pct = Math.round(((monthly - annual) / monthly) * 100);
    return pct;
  };

  const handleSelectPlan = (planId: string) => {
    // Navigate to signup with plan pre-selected
    router.push(`/login?plan=${planId}&billing=${billing}`);
  };

  return (
    <div className="pricing-page">
      {/* Background effects */}
      <div className="pricing-bg-glow pricing-bg-glow--1" />
      <div className="pricing-bg-glow pricing-bg-glow--2" />
      <div className="pricing-bg-glow pricing-bg-glow--3" />
      <div className="pricing-bg-grid" />

      {/* Navbar */}
      <nav className="pricing-nav">
        <div className="pricing-nav-inner">
          <div className="pricing-nav-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/klima-mark.svg" alt="" className="pricing-nav-logo" width={32} height={32} />
            <span>Klima Solutions</span>
          </div>
          <div className="pricing-nav-actions">
            <button
              className="pricing-nav-login"
              onClick={() => router.push('/login')}
            >
              Iniciar sesión
            </button>
            <button
              className="pricing-nav-cta"
              onClick={() => router.push('/login')}
            >
              Empezar gratis
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="pricing-hero">
        <div className="pricing-hero-badge">
          <Sparkles size={14} />
          14 días de prueba gratis · Sin tarjeta
        </div>
        <h1 className="pricing-hero-title">
          Facturación profesional,<br />
          precio <em className="accent-serif pricing-hero-accent">justo</em>
        </h1>
        <p className="pricing-hero-subtitle">
          Elige el plan que encaje con tu negocio. Cumplimiento normativo español,
          sellado criptográfico y cobros online incluidos en todos los planes.
        </p>

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
            <span className="pricing-billing-save">-19%</span>
          </button>
        </div>
      </header>

      {/* Pricing Cards */}
      <section className="pricing-cards">
        {plans.map((plan) => {
          const price = billing === 'monthly' ? plan.monthlyPrice : plan.annualPrice;
          const savings = annualSavings(plan);

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
                  <span className="pricing-card-number">{price % 1 === 0 ? price : price.toFixed(2).replace('.', ',')}</span>
                  <span className="pricing-card-period">/mes</span>
                </div>
                {billing === 'annual' && (
                  <div className="pricing-card-annual-note">
                    Facturado anualmente · <span className="pricing-card-savings">Ahorras {savings}%</span>
                  </div>
                )}
                {billing === 'monthly' && (
                  <div className="pricing-card-annual-note">
                    Cambia a anual y ahorra {savings}%
                  </div>
                )}
              </div>

              <button
                className="pricing-card-cta"
                style={{ background: plan.gradient }}
                onClick={() => handleSelectPlan(plan.id)}
              >
                {plan.cta}
                <ArrowRight size={16} />
              </button>

              <div className="pricing-card-divider" />

              <ul className="pricing-card-features">
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
                <td>100</td>
                <td className="pricing-table-popular">500</td>
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
          <p>Empieza gratis durante 14 días. Sin tarjeta de crédito. Sin permanencia.</p>
          <button
            className="pricing-final-cta-btn"
            onClick={() => router.push('/login')}
          >
            Crear cuenta gratis
            <ArrowRight size={18} />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="pricing-footer">
        <div className="pricing-footer-inner">
          <div className="pricing-footer-brand">
            <ShieldCheck size={16} />
            <span>Klima Solutions · Verifactu</span>
          </div>
          <p>Todos los precios indicados son sin IVA. El IVA se añade según la legislación vigente.</p>
        </div>
      </footer>
    </div>
  );
}
