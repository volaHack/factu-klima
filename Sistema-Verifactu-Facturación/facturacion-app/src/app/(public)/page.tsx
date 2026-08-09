'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight, ShieldCheck, BarChart3,
  FileCheck, Smartphone, Check, Star, Shield, Store,
  CreditCard, Sparkles, Lock, ChevronRight,
  TrendingUp, CheckCircle2, Zap, Globe, Users
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/* Utility: fade-in on scroll via IntersectionObserver                 */
/* ------------------------------------------------------------------ */
function useReveal() {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.15 }
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return { ref, visible };
}

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */
export default function HomePage() {
  const router = useRouter();

  // Interactive SHA-256 demo state
  const [demoBase, setDemoBase] = useState(1250);

  const iva = +(demoBase * 0.21).toFixed(2);
  const total = +(demoBase + iva).toFixed(2);
  const hash = useMemo(() => {
    let h = 0x811c9dc5;
    const s = `FAC-2026-0042-${demoBase}-${total}`;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return Math.abs(h).toString(16).padStart(8, '0');
  }, [demoBase, total]);

  // Section reveal hooks
  const s1 = useReveal();
  const s2 = useReveal();
  const s3 = useReveal();
  const s4 = useReveal();
  const s5 = useReveal();
  const s6 = useReveal();

  // Typewriter loop effect: type → pause → erase → retype
  const fullSubtitle = 'Sellado SHA-256 · Verifactu AEAT · TPV de Mostrador · Cobros Stripe';
  const [typedLen, setTypedLen] = useState(0);
  const [isErasing, setIsErasing] = useState(false);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    if (!isErasing) {
      if (typedLen < fullSubtitle.length) {
        t = setTimeout(() => setTypedLen(l => l + 1), 30);
      } else {
        // Finished typing — pause 2.2s then start erasing
        t = setTimeout(() => setIsErasing(true), 2200);
      }
    } else {
      if (typedLen > 0) {
        t = setTimeout(() => setTypedLen(l => l - 1), 18);
      } else {
        // Finished erasing — pause 400ms then retype
        t = setTimeout(() => setIsErasing(false), 400);
      }
    }
    return () => clearTimeout(t);
  }, [typedLen, isErasing, fullSubtitle.length]);

  // FAQ accordion
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const faqs = [
    { q: '¿Qué es el sellado SHA-256 y por qué lo exige la ley?', a: 'La Ley Anti-fraude 11/2021 exige que las facturas no puedan ser modificadas ni borradas sin dejar rastro. Nuestro sistema encadena la huella digital (SHA-256) de cada factura con la anterior, garantizando la integridad ante cualquier inspección fiscal.' },
    { q: '¿Puedo usar el TPV en una tienda o supermercado?', a: 'Sí. El módulo TPV está diseñado para venta directa en mostrador con pantalla táctil, escáner de código de barras, atajos de teclado (F1-F5), emisión de tickets simplificados y control de apertura/cierre de caja.' },
    { q: '¿Cómo funcionan los cobros con Stripe?', a: 'Al emitir una factura, puedes generar un enlace seguro. Tu cliente revisa los conceptos y paga con tarjeta o Bizum. El cobro se sincroniza automáticamente marcando la factura como Pagada.' },
    { q: '¿Qué pasa si me quedo sin internet?', a: 'La app es una PWA con base de datos local. Puedes seguir emitiendo facturas o cobrando en caja offline. Cuando vuelva la conexión, se sincroniza automáticamente.' },
    { q: '¿Hay permanencia o compromiso?', a: 'No. Puedes cancelar en cualquier momento. Si eliges facturación anual, pagas por adelantado el año pero si cancelas te devolvemos la parte no usada, prorrateada por meses completos.' },
  ];

  return (
    <div className="pricing-page home-page">
      {/* Bg */}
      <div className="pricing-bg-glow pricing-bg-glow--1" />
      <div className="pricing-bg-glow pricing-bg-glow--2" />
      <div className="pricing-bg-glow pricing-bg-glow--3" />
      <div className="pricing-bg-grid" />

      {/* ────────────────────── Navbar ────────────────────── */}
      <nav className="pricing-nav">
        <div className="pricing-nav-inner">
          <div className="pricing-nav-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/klima-mark.svg" alt="" className="pricing-nav-logo" width={32} height={32} />
            <span>Klima Solutions</span>
          </div>
          <div className="pricing-nav-actions">
            <button className="pricing-nav-login" onClick={() => router.push('/precios')}>
              Precios
            </button>
            <button className="pricing-nav-login" onClick={() => router.push('/login')}>
              Iniciar sesión
            </button>
            <button className="pricing-nav-cta" onClick={() => router.push('/login')}>
              Crear cuenta
            </button>
          </div>
        </div>
      </nav>

      {/* ────────────────────── Hero ────────────────────── */}
      <header className="pricing-hero" style={{ maxWidth: 920, paddingBottom: 32 }}>
        <div className="pricing-hero-badge">
          <Sparkles size={14} />
          Software de facturación certificado para España
        </div>

        <h1 className="pricing-hero-title" style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', lineHeight: 1.08 }}>
          La facturación que<br />
          <em className="accent-serif pricing-hero-accent">aguanta auditoría</em>
        </h1>

        <p className="pricing-hero-subtitle" style={{ maxWidth: 640, minHeight: '1.8em', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', letterSpacing: '0.01em' }}>
          {fullSubtitle.slice(0, typedLen)}
          <span style={{ animation: 'cursorBlink 1s step-end infinite', display: 'inline-block' }}>▋</span>
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--space-4)', flexWrap: 'wrap', marginTop: 'var(--space-6)' }}>
          <button className="pricing-final-cta-btn" onClick={() => router.push('/login')} style={{ padding: '14px 32px' }}>
            Accede ahora — empieza hoy
            <ArrowRight size={18} />
          </button>
          <button
            className="pricing-nav-login"
            onClick={() => router.push('/precios')}
            style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-color)', padding: '14px 28px', borderRadius: 'var(--radius-full)', color: 'var(--text-primary)', fontWeight: 600 }}
          >
            Ver planes y precios
          </button>
        </div>
      </header>

      {/* ────────────────────── Interactive Demo ────────────────────── */}
      <section
        ref={s1.ref as React.Ref<HTMLElement>}
        className="pricing-highlights"
        style={{ opacity: s1.visible ? 1 : 0, transform: s1.visible ? 'none' : 'translateY(32px)', transition: 'all 0.7s cubic-bezier(0.16,1,0.3,1)', paddingBottom: 40 }}
      >
        <div className="home-mockup-wrapper" style={{
          maxWidth: 880, margin: '0 auto',
          background: 'var(--bg-card)', border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-2xl)', padding: 'var(--space-6)',
          boxShadow: '0 24px 64px -16px rgba(0,0,0,0.5), 0 0 0 1px rgba(16,185,129,0.06)',
        }}>
          {/* Mock browser chrome */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', borderBottom: '1px solid var(--border-subtle)', paddingBottom: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444' }} />
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#eab308' }} />
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e' }} />
            <span style={{ flex: 1, textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              Simulador de sellado — modifica el importe y observa el hash cambiar en tiempo real
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)', alignItems: 'stretch' }}>
            {/* Left — input */}
            <div style={{ background: 'var(--bg-tertiary)', padding: 'var(--space-5)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em' }}>Datos de la factura</div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: 4 }}>Cliente</div>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)' }}>Distribuciones García S.L.</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: 4 }}>Base imponible (€)</div>
                <input
                  type="range" min={100} max={10000} step={50} value={demoBase}
                  onChange={e => setDemoBase(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--accent-500)' }}
                />
                <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                  {demoBase.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                </div>
              </div>
            </div>

            {/* Right — sealed receipt */}
            <div style={{ background: 'var(--bg-primary)', padding: 'var(--space-5)', borderRadius: 'var(--radius-xl)', border: '1px solid rgba(16,185,129,0.2)', fontFamily: 'var(--font-mono)', fontSize: '12px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', marginBottom: 8 }}>
                  <span>FAC-2026-0042</span>
                  <span style={{ color: '#22c55e', fontWeight: 700 }}>● SELLADA</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}><span>Base:</span><span>{demoBase.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', color: 'var(--text-muted)' }}><span>IVA 21%:</span><span>{iva.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 0', borderTop: '1px dashed var(--border-subtle)', marginTop: 6, fontSize: 'var(--text-md)', fontWeight: 800, color: 'var(--accent-400)' }}>
                  <span>Total:</span><span>{total.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</span>
                </div>
              </div>
              <div style={{ marginTop: 16, paddingTop: 10, borderTop: '1px solid var(--border-subtle)', fontSize: '10px', wordBreak: 'break-all' }}>
                <span style={{ color: '#fbbf24' }}>SHA-256:</span>{' '}
                <span style={{ color: 'var(--text-muted)' }}>e3b0c442...{hash}</span>
                <div style={{ color: '#22c55e', marginTop: 4 }}>✓ Cadena encadenada · Integridad verificada</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ────────────────────── Social Proof Bar ────────────────────── */}
      <section
        ref={s2.ref as React.Ref<HTMLElement>}
        className="pricing-highlights"
        style={{ opacity: s2.visible ? 1 : 0, transform: s2.visible ? 'none' : 'translateY(24px)', transition: 'all 0.6s cubic-bezier(0.16,1,0.3,1) 0.1s', paddingBottom: 60 }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-4)' }}>
          {[
            { v: '50.000+', l: 'facturas selladas', d: 'huella SHA-256' },
            { v: '100%', l: 'Norma AEAT', d: 'Verifactu compliant' },
            { v: '<1s', l: 'emisión por factura', d: 'incluso offline' },
            { v: '4.9★', l: 'satisfacción media', d: 'autónomos y pymes' },
          ].map((s, i) => (
            <div key={i} className="pricing-highlight-card" style={{ padding: 'var(--space-5) var(--space-4)', textAlign: 'center' }}>
              <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>{s.v}</div>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-secondary)', marginTop: 2 }}>{s.l}</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2 }}>{s.d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ────────────────────── Features (3 Pillars) ────────────────────── */}
      <section
        ref={s3.ref as React.Ref<HTMLElement>}
        className="pricing-highlights"
        style={{ opacity: s3.visible ? 1 : 0, transform: s3.visible ? 'none' : 'translateY(32px)', transition: 'all 0.7s cubic-bezier(0.16,1,0.3,1)', paddingBottom: 80 }}
      >
        <h2 className="pricing-section-title">Tres pilares, una plataforma</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-6)', maxWidth: 1080, margin: '0 auto' }}>
          {[
            {
              icon: ShieldCheck, color: '#10b981', bg: 'rgba(16,185,129,0.1)', tag: 'Cumplimiento',
              title: 'Sellado Verifactu',
              desc: 'Cada factura genera una huella SHA-256 encadenada con la anterior. Hacienda verifica la cadena completa: si alguien borra o modifica un registro, se detecta instantáneamente.',
              bullets: ['Huella criptográfica automática', 'Registro inalterable de eventos', 'Informe de integridad exportable'],
            },
            {
              icon: Store, color: '#a855f7', bg: 'rgba(168,85,247,0.1)', tag: 'Venta directa',
              title: 'TPV de Mostrador',
              desc: 'Terminal punto de venta diseñado para cajeros de supermercado, tiendas y hostelería. Atajos de teclado, escáner de código de barras, venta libre, arqueo de caja.',
              bullets: ['Atajos F1-F5 + lector de códigos', 'Alta rápida de productos al escanear', 'Cierre de caja con informe automático'],
            },
            {
              icon: CreditCard, color: '#ec4899', bg: 'rgba(236,72,153,0.1)', tag: 'Cobros',
              title: 'Pagos con Stripe',
              desc: 'Genera enlaces de cobro en cada factura. Tu cliente revisa, aprueba y paga con tarjeta o Bizum. La factura pasa a "Pagada" sin que hagas nada.',
              bullets: ['Enlace de pago por factura', 'Conciliación automática vía Webhooks', 'Portal de aprobación de pedidos'],
            },
          ].map((f, i) => (
            <div key={i} className="pricing-highlight-card" style={{ textAlign: 'left', padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <div style={{ width: 44, height: 44, borderRadius: 'var(--radius-lg)', background: f.bg, color: f.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <f.icon size={22} />
                </div>
                <span style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 700, color: f.color, letterSpacing: '0.06em' }}>{f.tag}</span>
              </div>
              <h3 style={{ fontSize: 'var(--text-xl)', fontWeight: 800, lineHeight: 1.2 }}>{f.title}</h3>
              <p style={{ color: 'var(--text-secondary)', lineHeight: 1.65, fontSize: 'var(--text-sm)' }}>{f.desc}</p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6, marginTop: 'auto' }}>
                {f.bullets.map((b, j) => (
                  <li key={j} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--text-xs)', color: 'var(--text-primary)' }}>
                    <Check size={14} style={{ color: f.color, flexShrink: 0 }} /> {b}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ────────────────────── 6 Features Grid ────────────────────── */}
      <section
        ref={s4.ref as React.Ref<HTMLElement>}
        className="pricing-highlights"
        style={{ opacity: s4.visible ? 1 : 0, transform: s4.visible ? 'none' : 'translateY(32px)', transition: 'all 0.7s cubic-bezier(0.16,1,0.3,1)', paddingBottom: 80 }}
      >
        <h2 className="pricing-section-title">Todo lo que necesitas, sin sorpresas</h2>
        <div className="pricing-highlights-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {[
            { icon: FileCheck, title: 'Exportar PDF', desc: 'Facturas con diseño profesional listas para enviar a tu cliente o a tu gestor.' },
            { icon: Globe, title: 'Funciona offline', desc: 'PWA instalable en cualquier dispositivo. Factura sin conexión y sincroniza al volver.' },
            { icon: BarChart3, title: 'Informes fiscales', desc: 'IVA e IRPF trimestral calculados al céntimo. Exporta a Excel, CSV o PDF.' },
            { icon: Users, title: 'Gestión de clientes', desc: 'Ficha completa de cada cliente con historial de facturas y estados de pago.' },
            { icon: Lock, title: 'Seguridad RLS', desc: 'Row Level Security en Supabase. Cada usuario solo ve sus propios datos.' },
            { icon: Zap, title: 'Activa en 2 minutos', desc: 'Crea tu cuenta y empieza a facturar. Sin configuraciones complejas.' },
          ].map((f, i) => (
            <div key={i} className="pricing-highlight-card" style={{ textAlign: 'left', padding: 'var(--space-5)' }}>
              <div className="pricing-highlight-icon" style={{ margin: '0 0 var(--space-3)' }}>
                <f.icon size={20} />
              </div>
              <h4 style={{ fontSize: 'var(--text-md)', fontWeight: 700, marginBottom: 4 }}>{f.title}</h4>
              <p style={{ lineHeight: 1.55 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ────────────────────── Testimonials ────────────────────── */}
      <section
        ref={s5.ref as React.Ref<HTMLElement>}
        className="pricing-faq"
        style={{ opacity: s5.visible ? 1 : 0, transform: s5.visible ? 'none' : 'translateY(32px)', transition: 'all 0.7s cubic-bezier(0.16,1,0.3,1)', maxWidth: 1100, paddingBottom: 80 }}
      >
        <h2 className="pricing-section-title">Lo que dicen nuestros usuarios</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-5)' }}>
          {[
            { name: 'Elena Morales', role: 'Gerente, Alimentación Morales S.L.', text: 'Buscábamos TPV para la tienda y facturas normativas para mayoristas. Ha sido un acierto total.', stars: 5 },
            { name: 'Carlos Ruiz', role: 'Autónomo, Servicios Industriales', text: 'El sellado SHA-256 da tranquilidad ante cualquier inspección. Funciona genial desde el móvil sin cobertura.', stars: 5 },
            { name: 'Sofía Benítez', role: 'Directora, HORECA Distribución', text: 'El portal donde los clientes aprueban y pagan con Stripe nos ha reducido la morosidad a la mitad.', stars: 5 },
          ].map((t, i) => (
            <div key={i} className="pricing-card" style={{ padding: 'var(--space-6)', textAlign: 'left', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', gap: 2, color: '#fbbf24', marginBottom: 'var(--space-3)' }}>
                {[...Array(t.stars)].map((_, j) => <Star key={j} size={14} fill="#fbbf24" />)}
              </div>
              <p style={{ fontStyle: 'italic', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', lineHeight: 1.7, flex: 1 }}>
                &ldquo;{t.text}&rdquo;
              </p>
              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
                <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>{t.name}</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{t.role}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ────────────────────── FAQ ────────────────────── */}
      <section
        ref={s6.ref as React.Ref<HTMLElement>}
        className="pricing-faq"
        style={{ opacity: s6.visible ? 1 : 0, transform: s6.visible ? 'none' : 'translateY(24px)', transition: 'all 0.6s cubic-bezier(0.16,1,0.3,1)', paddingBottom: 80 }}
      >
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

      {/* ────────────────────── Final CTA ────────────────────── */}
      <section className="pricing-final-cta">
        <div className="pricing-final-cta-inner">
          <h2>¿Listo para facturar como un profesional?</h2>
          <p>Prueba gratis 14 días · Sin tarjeta de crédito · Sin permanencia</p>
          <button className="pricing-final-cta-btn" onClick={() => router.push('/login')}>
            Crear cuenta gratis
            <ArrowRight size={18} />
          </button>
        </div>
      </section>

      {/* ────────────────────── Footer ────────────────────── */}
      <footer className="pricing-footer">
        <div className="pricing-footer-inner">
          <div className="pricing-footer-brand">
            <ShieldCheck size={16} />
            <span>Klima Solutions · Verifactu</span>
          </div>
          <p>© 2026 Klima Solutions S.L. · Facturación profesional para España.</p>
        </div>
      </footer>
    </div>
  );
}
