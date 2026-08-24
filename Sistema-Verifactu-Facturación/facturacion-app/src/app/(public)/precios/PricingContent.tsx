'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Check, X, Zap, Crown, Rocket, ShieldCheck,
  FileText, Users, BarChart3, Plug,
  ArrowRight, Star,
  Clock, Headphones, Download, Globe, Loader2, Store,
  Heart, Copy,
} from 'lucide-react';
import { PLANS, type PlanId } from '@/lib/plans';
import SiteNav from '@/components/public/SiteNav';
import SiteFooter from '@/components/public/SiteFooter';
import TipModal from '@/components/ui/TipModal';

type BillingCycle = 'monthly' | 'annual';

interface PlanFeature {
  text: string;
  included: boolean;
  highlight?: boolean;
}

/**
 * LO QUE LLEVAN TODOS LOS PLANES — Y POR QUÉ SON LOS MISMOS
 *
 * Esta lista era distinta en cada plan: el básico salía sin TPV, sin
 * portal de aprobación y con «informes básicos», y el caro con todo. Nada
 * de eso era verdad. Lo ÚNICO que el programa comprueba de verdad es
 * cuántas facturas llevas emitidas este mes (`evaluatePlanLimit`); el
 * TPV, el portal y los informes no miran el plan por ningún lado, así que
 * quien pagaba el básico los tenía igual. La página prometía una cosa y
 * el programa hacía otra, y en una página de precios eso no es un
 * descuadre: es cobrar por algo que no se entrega.
 *
 * Se arregla diciendo la verdad, que además es un modelo limpio: se paga
 * por VOLUMEN de facturas y por SOPORTE. El volumen sale de
 * `plan.invoiceLimit`, que sí está aplicado en el código y en la base de
 * datos; el soporte es un compromiso humano, no una función.
 *
 * Si algún día se quiere que el TPV sea de pago, primero se limita en el
 * código y después se cambia esta lista, en ese orden.
 */
const FUNCIONES_COMUNES: PlanFeature[] = [
  { text: 'Huella SHA-256 encadenada en cada factura', included: true },
  { text: 'QR de cotejo impreso en la factura', included: true },
  { text: 'Diseño de factura para tu oficio', included: true },
  { text: 'Exportar PDF', included: true },
  { text: 'Panel de control e informes fiscales', included: true },
  { text: 'Modo offline (PWA)', included: true },
  { text: 'Cobro online con Stripe', included: true },
  { text: 'Portal de aprobación de pedidos', included: true },
  { text: 'Terminal Punto de Venta (TPV)', included: true },
  // No se cobra por lo que todavía no se puede hacer: el envío telemático
  // a la AEAT no está conectado en ningún plan.
  { text: 'Envío telemático a la AEAT (en preparación)', included: false },
];

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
      ...FUNCIONES_COMUNES,
      { text: 'Soporte por email', included: true },
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
      ...FUNCIONES_COMUNES,
      { text: 'Soporte prioritario por email', included: true, highlight: true },
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
      ...FUNCIONES_COMUNES,
      { text: 'Soporte 24/7 por teléfono y email', included: true, highlight: true },
    ],
    cta: 'Empezar Sin Límites',
    gradient: 'linear-gradient(135deg, #6b2436 0%, #3a1420 100%)',
    iconBg: 'rgba(76, 26, 40, 0.12)',
    iconColor: '#4c1a28',
  },
};

const plans = PLANS.map(plan => ({ ...plan, ...PLAN_DISPLAY[plan.id] }));

/** El cupón de lanzamiento, en un sitio: se enseña y se copia el mismo. */
const CUPON = 'LANZAMIENTO50';

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
    q: '¿Qué parte de Veri*Factu está funcionando hoy?',
    a: 'El registro de facturación, que es la parte que te toca a ti y va en todos los planes: cada factura que emites se sella con una huella SHA-256 encadenada a la anterior, queda inalterable, y sale impresa con su código QR de cotejo. Eso es lo que exige el RD 1007/2023 del sistema informático de facturación, y está en marcha desde el primer día. Lo que todavía NO está conectado es el envío telemático de esas facturas a la AEAT: lo estamos preparando y no se cobra en ningún plan. Mientras tanto puedes generar y descargar el XML de cada factura desde la pantalla de Verifactu.',
  },
];

export default function PricingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [billing, setBilling] = useState<BillingCycle>('monthly');
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [loadingPlan, setLoadingPlan] = useState<PlanId | null>(null);
  const [apiError, setApiError] = useState('');
  const [couponCopied, setCouponCopied] = useState(false);
  const [showTipModal, setShowTipModal] = useState(false);
  const wasCancelled = searchParams.get('cancelled') === 'true';

  const copyCoupon = () => {
    navigator.clipboard.writeText(CUPON);
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
      {/* Aquí había un campo de estrellas animado que seguía al ratón, con
          130 partículas redibujándose en cada fotograma. Fuera: un
          simulador espacial en la página donde alguien decide si te confía
          la facturación de su negocio no dice nada de este producto —dice
          «esto lo ha montado una IA»— y era el único coste de rendimiento
          serio de la única página que tiene que ir fina. Lo que queda
          —los halos de vino y la retícula— ya es de la casa. */}

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
          <h1 className="pricing-hero-title">
            Facturación profesional,<br />
            precio <em className="accent-serif pricing-hero-accent">justo</em>
          </h1>
          <p className="pricing-hero-subtitle">
            Elige el plan que encaje con tu negocio. Cumplimiento normativo español,
            sellado criptográfico y cobros online incluidos en todos los planes.
          </p>

          {/* La oferta de lanzamiento, en una línea.

              Antes eran sesenta líneas de estilos a mano —cristal
              esmerilado, rosa chicle #ff69b4 que no es de esta paleta, y
              cinco elementos gritando lo mismo: una llama, un reloj, el
              descuento en negrita, un párrafo explicándolo y el cupón—.
              Cinco maneras de decir «date prisa» no convencen más que una:
              convencen menos, porque quien lee eso ya sabe que le están
              vendiendo. El descuento es real y se dice una vez. */}
          <div className="pricing-promo">
            <div className="pricing-promo-oferta">
              <span className="pricing-promo-pct">−50%</span>
              <span className="pricing-promo-texto">
                el primer mes, o <strong>tres meses gratis</strong> en el plan anual.
              </span>
            </div>
            <button
              onClick={copyCoupon}
              className="pricing-promo-cupon"
              title="Copiar el cupón para pegarlo en la pasarela de pago"
            >
              <span className="pricing-promo-codigo">{CUPON}</span>
              {couponCopied
                ? <><Check size={13} /> Copiado</>
                : <><Copy size={13} /> Copiar</>}
            </button>
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

              {/* Sin el cuadradito de icono redondeado encima del nombre:
                  un rayo, una corona y un cohete no dicen nada de tres
                  planes que se diferencian en cuántas facturas caben, y
                  son el sello de cualquier plantilla. Lo que distingue a
                  un plan del siguiente es el número: que lo lleve él. */}
              <div className="pricing-card-header">
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
              {/* Se cae «Facturación recurrente»: no existe en el
                  programa, ni en el plan caro ni en ninguno. */}

              <tr className="pricing-table-section">
                <td colSpan={4}><Users size={14} /> Gestión</td>
              </tr>
              {/* Los clientes y los productos NO están limitados por plan
                  en ningún sitio del código. Aquí ponía 50 / 250 / ∞. */}
              <tr>
                <td>Clientes y proveedores</td>
                <td><span className="pricing-table-unlimited">∞</span></td>
                <td className="pricing-table-popular"><span className="pricing-table-unlimited">∞</span></td>
                <td><span className="pricing-table-unlimited">∞</span></td>
              </tr>
              <tr>
                <td>Productos y servicios</td>
                <td><span className="pricing-table-unlimited">∞</span></td>
                <td className="pricing-table-popular"><span className="pricing-table-unlimited">∞</span></td>
                <td><span className="pricing-table-unlimited">∞</span></td>
              </tr>
              <tr>
                <td>Portal de aprobación</td>
                <td><Check size={14} /></td>
                <td className="pricing-table-popular"><Check size={14} /></td>
                <td><Check size={14} /></td>
              </tr>

              <tr className="pricing-table-section">
                <td colSpan={4}><BarChart3 size={14} /> Informes y cobros</td>
              </tr>
              {/* No hay dos paneles ni dos juegos de informes: hay uno, y
                  es el mismo para todos. Aquí ponía «Básico / Avanzado». */}
              <tr>
                <td>Dashboard analítico</td>
                <td><Check size={14} /></td>
                <td className="pricing-table-popular"><Check size={14} /></td>
                <td><Check size={14} /></td>
              </tr>
              <tr>
                <td>Cobro online Stripe</td>
                <td><Check size={14} /></td>
                <td className="pricing-table-popular"><Check size={14} /></td>
                <td><Check size={14} /></td>
              </tr>
              <tr>
                <td>Informes fiscales</td>
                <td><Check size={14} /></td>
                <td className="pricing-table-popular"><Check size={14} /></td>
                <td><Check size={14} /></td>
              </tr>

              <tr className="pricing-table-section">
                <td colSpan={4}><Store size={14} /> Terminal Punto de Venta</td>
              </tr>
              {/* El TPV no mira el plan por ningún lado: lo enciende el
                  sector o el interruptor de Ajustes, en los tres. */}
              <tr>
                <td>Terminal TPV mostrador</td>
                <td><Check size={14} /></td>
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
                <td>Envío telemático a la AEAT <span className="pricing-table-pendiente">en preparación</span></td>
                <td><X size={14} className="pricing-feature-x" /></td>
                <td className="pricing-table-popular"><X size={14} className="pricing-feature-x" /></td>
                <td><X size={14} className="pricing-feature-x" /></td>
              </tr>
              {/* El soporte SÍ es una diferencia real entre planes: es un
                  compromiso de personas, no una función del programa. */}
              <tr>
                <td>Soporte</td>
                <td>Email</td>
                <td className="pricing-table-popular">Email prioritario</td>
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
