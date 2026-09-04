'use client';

// El `export const dynamic = 'force-dynamic'` que había aquí se ha ido a
// page.tsx, que es donde Next lee de verdad la configuración de segmento
// — en un componente cliente importado no la lee, así que aquí no hacía
// nada. Y hace falta: sin él la ruta se prerenderiza estática y, con
// `useSearchParams` dentro del <Suspense>, el HTML servido llega sin el
// contenido. Ver el comentario largo en page.tsx.

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Check, X, ShieldCheck,
  FileText, Users, BarChart3, Plug,
  ArrowRight, Star,
  Clock, Headphones, Download, Globe, Loader2, Store,
  Copy, Plus,
} from 'lucide-react';
import { PLANS, ANNUAL_MONTHS_FREE, type PlanId } from '@/lib/plans';
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

// Metadatos solo de presentación — el precio, el NOMBRE y el límite de
// facturas vienen SIEMPRE de src/lib/plans.ts (fuente única de verdad,
// también usada por el trigger de base de datos vía
// migration_014_basico_25_facturas.sql). No dupliques números ni nombres
// aquí: la tabla comparativa de más abajo llevaba «15» a mano cuando el
// plan ya iba por 25, y cabeceras «Profesional»/«Sin Límites» cuando los
// planes se llaman «Pro» y «Sin límite». Todo eso ahora se lee de `plans`.
//
// Sin `icon`/`iconBg`/`iconColor`: se quitó el cuadradito de icono de la
// tarjeta hace tiempo y los tres campos se quedaron aquí rellenados sin
// que nadie los pintara.
const PLAN_DISPLAY: Record<PlanId, {
  subtitle: string;
  popular?: boolean;
  features: PlanFeature[];
  /** El soporte, tal cual va en la tabla comparativa. Es la ÚNICA
   *  diferencia real entre planes además del volumen. */
  soporte: string;
  cta: string;
  gradient: string;
}> = {
  basico: {
    subtitle: 'Para autónomos y negocios pequeños',
    features: [
      ...FUNCIONES_COMUNES,
      { text: 'Soporte por email', included: true },
    ],
    soporte: 'Email',
    cta: 'Empezar con Básico',
    gradient: 'linear-gradient(135deg, #4a3a40 0%, #2c2226 100%)',
  },
  pro: {
    subtitle: 'Para pymes en crecimiento',
    popular: true,
    features: [
      ...FUNCIONES_COMUNES,
      { text: 'Soporte prioritario por email', included: true, highlight: true },
    ],
    soporte: 'Email prioritario',
    cta: 'Empezar con Pro',
    gradient: 'linear-gradient(135deg, #c9407a 0%, #9c2856 100%)',
  },
  sin_limite: {
    subtitle: 'Para empresas que necesitan todo',
    features: [
      ...FUNCIONES_COMUNES,
      { text: 'Soporte 24/7 por teléfono y email', included: true, highlight: true },
    ],
    soporte: '24/7 · Teléfono + email',
    cta: 'Empezar Sin Límites',
    gradient: 'linear-gradient(135deg, #6b2436 0%, #3a1420 100%)',
  },
};

const plans = PLANS.map(plan => ({ ...plan, ...PLAN_DISPLAY[plan.id] }));

/* --- Piezas de la tabla comparativa ---------------------------------
   Casi todas las filas valen lo mismo en los tres planes: se paga por
   VOLUMEN de facturas y por SOPORTE, y el resto va en los tres. Antes
   eso eran tres `<td>` copiados a mano por fila, y así es como se
   coló un «15» en la columna del básico cuando el plan ya iba por 25.
   Escrito una vez, las tres columnas no se pueden separar. */

const SI = <Check size={14} />;
const NO = <X size={14} className="pricing-feature-x" />;
const INFINITO = <span className="pricing-table-unlimited">∞</span>;

/** Fila cuyo valor es idéntico en los tres planes. */
function FilaIgual({ etiqueta, children }: { etiqueta: React.ReactNode; children: React.ReactNode }) {
  return (
    <tr>
      <th scope="row">{etiqueta}</th>
      {plans.map(plan => (
        <td key={plan.id} className={plan.popular ? 'pricing-table-popular' : undefined}>
          {children}
        </td>
      ))}
    </tr>
  );
}

/** Banda de sección. El contenido va en un <span>: el flex tiene que ir
 *  ahí dentro y no en el <td>, o el `colSpan` se pierde (un td con
 *  `display:flex` deja de ser table-cell y el navegador le fabrica una
 *  celda anónima que no abarca las cuatro columnas). */
function FilaSeccion({
  icono: Icono,
  children,
}: {
  icono: React.ComponentType<{ size?: number }>;
  children: React.ReactNode;
}) {
  return (
    <tr className="pricing-table-section">
      <td colSpan={4}><span><Icono size={14} /> {children}</span></td>
    </tr>
  );
}

/** El cupón de lanzamiento, en un sitio: se enseña y se copia el mismo. */
const CUPON = 'LANZAMIENTO50';

/** Los meses gratis del plan anual salen del mismo sitio que el precio.
 *  El texto de la promo decía «tres meses gratis» mientras la pastilla
 *  del conmutador, a cien píxeles, decía «2 meses gratis» — y el 10x de
 *  `plans.ts` dice que son dos. Escrito una vez, no puede volver a
 *  descuadrarse. */
const MESES_GRATIS_TEXTO = ['cero', 'un', 'dos', 'tres', 'cuatro'][ANNUAL_MONTHS_FREE] ?? String(ANNUAL_MONTHS_FREE);

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
  const [couponCopied, setCouponCopied] = useState<'idle' | 'ok' | 'fallo'>('idle');
  const [showTipModal, setShowTipModal] = useState(false);
  const wasCancelled = searchParams.get('cancelled') === 'true';

  // El aviso de «Copiado» se borra solo a los 2,5 s. Guardamos el
  // temporizador para cancelarlo al desmontar: antes quedaba vivo y
  // disparaba un setState sobre un componente que ya no existía.
  const avisoCupon = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (avisoCupon.current) clearTimeout(avisoCupon.current); }, []);

  // `writeText` no se esperaba ni se capturaba: en http, en Safari en
  // privado o sin permiso, la promesa se rechazaba sola y el botón decía
  // «Copiado» igualmente. Mentirle a alguien sobre si tiene el cupón en
  // el portapapeles es peor que no tener botón.
  const copyCoupon = async () => {
    let copiado = false;
    try {
      await navigator.clipboard.writeText(CUPON);
      copiado = true;
    } catch {
      copiado = false;
    }
    setCouponCopied(copiado ? 'ok' : 'fallo');
    if (avisoCupon.current) clearTimeout(avisoCupon.current);
    avisoCupon.current = setTimeout(() => setCouponCopied('idle'), 2500);
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
                el primer mes, o <strong>{MESES_GRATIS_TEXTO} meses gratis</strong> en el plan anual.
              </span>
            </div>
            {/* El ancho lo fija el estado más largo («Copiado»), así el
                botón no da un respingo al cambiar de etiqueta; los dos
                estados se cruzan apilados en la misma celda de rejilla. */}
            <button
              type="button"
              onClick={copyCoupon}
              className="pricing-promo-cupon"
              title="Copiar el cupón para pegarlo en la pasarela de pago"
            >
              <span className="pricing-promo-codigo">{CUPON}</span>
              <span className="pricing-promo-estado" data-estado={couponCopied}>
                <span className="pricing-promo-estado-cara"><Copy size={13} /> Copiar</span>
                <span className="pricing-promo-estado-cara"><Check size={13} /> Copiado</span>
                <span className="pricing-promo-estado-cara">Copia a mano</span>
              </span>
            </button>
            <span className="sr-only" role="status">
              {couponCopied === 'ok' ? `Cupón ${CUPON} copiado al portapapeles.` : ''}
              {couponCopied === 'fallo' ? `No se pudo copiar. El cupón es ${CUPON}.` : ''}
            </span>
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

          {/* CONMUTADOR MENSUAL / ANUAL
              Dos capas con la misma retícula: abajo la real y clicable,
              en tinta apagada; encima la misma lista ya pintada «activa»
              (pastilla + texto fuerte), recortada con `clip-path` para
              que sólo se vea la mitad que toca. Al cambiar de mitad se
              anima el recorte, y el color del texto y el de la pastilla
              cruzan a la vez y exactos — cosa que temporizar `color` y
              `background` por separado no consigue nunca.
              Las dos mitades son `1fr 1fr` a propósito: el recorte al 50%
              sólo cae en el sitio si miden lo mismo. */}
          <div
            className="pricing-billing-toggle"
            data-activo={billing}
            role="group"
            aria-label="Periodicidad de facturación"
          >
            <div className="pricing-billing-capa">
              <button
                type="button"
                className="pricing-billing-btn"
                aria-pressed={billing === 'monthly'}
                onClick={() => setBilling('monthly')}
              >
                Mensual
              </button>
              <button
                type="button"
                className="pricing-billing-btn"
                aria-pressed={billing === 'annual'}
                onClick={() => setBilling('annual')}
              >
                Anual
                <span className="pricing-billing-save">{ANNUAL_MONTHS_FREE} meses gratis</span>
              </button>
            </div>
            <div className="pricing-billing-capa pricing-billing-capa--activa" aria-hidden="true">
              <span className="pricing-billing-btn">Mensual</span>
              <span className="pricing-billing-btn">
                Anual
                <span className="pricing-billing-save">{ANNUAL_MONTHS_FREE} meses gratis</span>
              </span>
            </div>
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
                  {/* La cifra es lo único que cambia al tocar el
                      conmutador, así que es lo único que se mueve: entra
                      desenfocada y un pelo más arriba, 160 ms. El blur
                      tapa el instante en que se ven los dos números
                      pisándose; sin él se leen como dos objetos, no como
                      uno que cambia. `key` fuerza el remontaje: si se
                      pulsa rápido, cada cifra hace su propia entrada en
                      vez de arrastrar la anterior a medias.
                      `tabular-nums` ya estaba puesto, así que el ancho no
                      baila y no arrastra al «/mes». */}
                  <span key={billing} className="pricing-card-number">
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
                type="button"
                className="pricing-card-cta"
                style={{ background: plan.gradient }}
                onClick={() => handleSelectPlan(plan.id)}
                disabled={loadingPlan !== null}
                aria-busy={isLoading}
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

      {/* LA PROPINA SE HA IDO ABAJO, DETRÁS DEL CTA FINAL.
          Estaba justo aquí, entre las tarjetas de precio y la tabla
          comparativa: en mitad de la decisión de compra, con un corazón
          #e11d48 que no es de esta paleta, un emoji de café en un <h3> y
          cuarenta líneas de estilos en línea — la única sección de la
          página que no usaba el sistema de diseño.
          Pedir un café en la misma pantalla en la que pides 79 €/mes por
          cumplimiento normativo no suma: le dice al comprador que esto es
          un proyecto personal, y lo que ese comprador necesita creer es
          que el programa seguirá existiendo cuando Hacienda le pida el
          registro de 2028. La propina sigue estando, pero después de
          decidir, no durante. */}

      {/* Comparison Table */}
      <section className="pricing-comparison">
        <h2 className="pricing-section-title">Compara los planes al detalle</h2>
        <div className="pricing-table-wrapper">
          {/* `colgroup` + `table-layout: fixed`: las tres columnas de plan
              tienen que medir lo mismo. Se estaban repartiendo
              474/139/207/271 px porque el `display:flex` de las filas de
              sección (abajo) anulaba su `display: table-cell`, tiraba el
              `colspan={4}` y descuadraba el reparto de toda la tabla.
              Tres planes que se comparan y ocupan anchos distintos hacen
              creer al ojo que uno pesa más que otro. */}
          <table className="pricing-table">
            <colgroup>
              <col className="pricing-col-caracteristica" />
              <col />
              <col />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">Característica</th>
                {plans.map(plan => (
                  <th
                    key={plan.id}
                    scope="col"
                    className={plan.popular ? 'pricing-table-popular' : undefined}
                  >
                    {plan.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="pricing-table-section">
                <td colSpan={4}><span><FileText size={14} /> Facturación</span></td>
              </tr>
              {/* El «15» estaba escrito a mano aquí mientras la tarjeta de
                  al lado decía 25 y la base de datos ya permitía 25.
                  Ahora sale de `plans`, como el precio. */}
              <tr>
                <th scope="row">Facturas por mes</th>
                {plans.map(plan => (
                  <td key={plan.id} className={plan.popular ? 'pricing-table-popular' : undefined}>
                    {plan.invoiceLimit === null
                      ? <span className="pricing-table-unlimited">∞ Ilimitadas</span>
                      : plan.invoiceLimit}
                  </td>
                ))}
              </tr>
              <FilaIgual etiqueta="Exportar PDF">{SI}</FilaIgual>
              <FilaIgual etiqueta="Huella SHA-256">{SI}</FilaIgual>
              {/* Se cae «Facturación recurrente»: no existe en el
                  programa, ni en el plan caro ni en ninguno. */}

              <FilaSeccion icono={Users}>Gestión</FilaSeccion>
              {/* Los clientes y los productos NO están limitados por plan
                  en ningún sitio del código. Aquí ponía 50 / 250 / ∞. */}
              <FilaIgual etiqueta="Clientes y proveedores">{INFINITO}</FilaIgual>
              <FilaIgual etiqueta="Productos y servicios">{INFINITO}</FilaIgual>
              <FilaIgual etiqueta="Portal de aprobación">{SI}</FilaIgual>

              <FilaSeccion icono={BarChart3}>Informes y cobros</FilaSeccion>
              {/* No hay dos paneles ni dos juegos de informes: hay uno, y
                  es el mismo para todos. Aquí ponía «Básico / Avanzado». */}
              <FilaIgual etiqueta="Dashboard analítico">{SI}</FilaIgual>
              <FilaIgual etiqueta="Cobro online Stripe">{SI}</FilaIgual>
              <FilaIgual etiqueta="Informes fiscales">{SI}</FilaIgual>

              <FilaSeccion icono={Store}>Terminal Punto de Venta</FilaSeccion>
              {/* El TPV no mira el plan por ningún lado: lo enciende el
                  sector o el interruptor de Ajustes, en los tres. */}
              <FilaIgual etiqueta="Terminal TPV mostrador">{SI}</FilaIgual>

              <FilaSeccion icono={Plug}>Cumplimiento</FilaSeccion>
              <FilaIgual etiqueta="Verificación integridad">{SI}</FilaIgual>
              <FilaIgual
                etiqueta={<>Envío telemático a la AEAT <span className="pricing-table-pendiente">en preparación</span></>}
              >
                {NO}
              </FilaIgual>
              {/* El soporte SÍ es una diferencia real entre planes: es un
                  compromiso de personas, no una función del programa. Es
                  la única fila que no se sirve de `FilaIgual`. */}
              <tr>
                <th scope="row">Soporte</th>
                {plans.map(plan => (
                  <td key={plan.id} className={plan.popular ? 'pricing-table-popular' : undefined}>
                    {plan.soporte}
                  </td>
                ))}
              </tr>

              <FilaSeccion icono={Download}>Plataforma</FilaSeccion>
              <FilaIgual etiqueta="PWA / Modo offline">{SI}</FilaIgual>
              <FilaIgual etiqueta="Sincronización automática">{SI}</FilaIgual>
            </tbody>
          </table>
        </div>
      </section>

      {/* FAQ */}
      <section className="pricing-faq">
        <h2 className="pricing-section-title">Preguntas frecuentes</h2>
        {/* EL ACORDEÓN
            Antes la respuesta era `{abierta && <div>}`: aparecía y
            desaparecía de un fotograma al siguiente, y lo que aparece sin
            transición se lee como roto, no como rápido. Ahora la altura
            va con `grid-template-rows: 0fr → 1fr`, que sí es animable sin
            medir nada en JS y sirve para cualquier largo de respuesta.
            Es una *transition*, no un keyframe, a propósito: quien abre
            cuatro preguntas seguidas ve cada una redirigir desde donde
            iba en vez de reiniciarse desde cero.
            Y el `+`/`−` ya no se intercambian como texto —tienen métricas
            distintas y el glifo pegaba un salto lateral—: es un solo
            icono que gira 45°.
            La estructura también cambia: el <div> que había dentro del
            <button> era HTML inválido, y sin `aria-expanded` un lector de
            pantalla no sabía si la pregunta estaba abierta. */}
        <div className="pricing-faq-list">
          {faqs.map((faq, i) => {
            const abierta = openFaq === i;
            return (
              <div key={i} className={`pricing-faq-item ${abierta ? 'open' : ''}`}>
                <h3 className="pricing-faq-heading">
                  <button
                    type="button"
                    className="pricing-faq-question"
                    aria-expanded={abierta}
                    aria-controls={`faq-panel-${i}`}
                    id={`faq-boton-${i}`}
                    onClick={() => setOpenFaq(abierta ? null : i)}
                  >
                    <span>{faq.q}</span>
                    <Plus size={18} className="pricing-faq-toggle" aria-hidden="true" />
                  </button>
                </h3>
                <div
                  className="pricing-faq-panel"
                  id={`faq-panel-${i}`}
                  role="region"
                  aria-labelledby={`faq-boton-${i}`}
                >
                  <div className="pricing-faq-panel-inner">
                    <div className="pricing-faq-answer">{faq.a}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Final CTA */}
      <section className="pricing-final-cta">
        <div className="pricing-final-cta-inner">
          <h2>¿Listo para facturar como un profesional?</h2>
          <p>Elige tu plan y empieza a facturar hoy mismo. Sin permanencia.</p>
          <button
            type="button"
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

      {/* La propina, ya fuera del embudo: una línea al pie, con el peso
          del aviso de IVA. Quien quiera dejarla la encuentra; a quien
          está decidiendo si paga 79 €/mes no se le pide un café. */}
      <p className="pricing-propina">
        Klima Solutions se desarrolla de forma independiente.{' '}
        <button type="button" className="pricing-propina-enlace" onClick={() => setShowTipModal(true)}>
          Dejar una propina
        </button>
      </p>

      <TipModal isOpen={showTipModal} onClose={() => setShowTipModal(false)} />

      <SiteFooter />
    </div>
  );
}
