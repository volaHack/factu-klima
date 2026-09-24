'use client';

/**
 * GUÍA INTERACTIVA Y AYUDA CONTEXTUAL (Apple Design)
 *
 * Pop-up flotante con diseño translúcido Apple WWDC, micro-animaciones fluidas,
 * tarjetas estructuradas (Para qué sirve, Paso a paso, Pro-tips, Sigue por aquí)
 * y asistente inteligente integrado para resolver dudas específicas de la pantalla.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CircleHelp, X, Sparkles, Loader2, CornerDownLeft, ArrowRight, BookOpen,
  Compass, Lightbulb,
} from 'lucide-react';
import { ayudaDe } from '@/lib/ayuda/paginas';
import Portal from '@/components/ui/Portal';

export default function AyudaContextual() {
  const pathname = usePathname() ?? '/';
  const ayuda = ayudaDe(pathname);

  // Sin ayuda escrita para esta pantalla no se enseña el botón
  if (!ayuda) return null;

  return <BotonAyuda key={pathname} ayuda={ayuda} />;
}

function BotonAyuda({ ayuda }: { ayuda: NonNullable<ReturnType<typeof ayudaDe>> }) {
  const [abierta, setAbierta] = useState(false);

  useEffect(() => {
    if (!abierta) return;
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierta(false);
    };
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [abierta]);

  return (
    <>
      <button
        type="button"
        className="apple-guide-trigger"
        onClick={() => setAbierta(true)}
        aria-label={`¿Cómo se usa ${ayuda.titulo}?`}
        title="¿Cómo se usa esta pantalla? Guía interactiva"
      >
        <span className="apple-guide-icon">
          <CircleHelp size={16} />
        </span>
        <span className="apple-guide-text">¿Cómo se usa?</span>
      </button>

      {/* Por el portal: este botón vive dentro de la cabecera, que lleva
          `backdrop-filter`, y eso reencuadra cualquier `position: fixed`
          de dentro. Sin el portal, el modal salía pegado a la cabecera
          en vez de centrado en la pantalla. Ver Portal.tsx. */}
      {abierta && (
        <Portal>
          <ModalAyuda ayuda={ayuda} onCerrar={() => setAbierta(false)} />
        </Portal>
      )}
    </>
  );
}

function ModalAyuda({
  ayuda,
  onCerrar,
}: {
  ayuda: NonNullable<ReturnType<typeof ayudaDe>>;
  onCerrar: () => void;
}) {
  const [pregunta, setPregunta] = useState('');
  const [respuesta, setRespuesta] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const campoRef = useRef<HTMLTextAreaElement>(null);

  const preguntar = async () => {
    const limpia = pregunta.trim();
    if (!limpia || cargando) return;
    setCargando(true);
    setError('');
    setRespuesta('');
    try {
      const res = await fetch('/api/ayuda', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modo: 'pagina',
          pregunta: limpia,
          pagina: {
            titulo: ayuda.titulo,
            paraQue: ayuda.paraQue,
            pasos: ayuda.pasos,
            saber: ayuda.saber ?? [],
          },
        }),
      });
      const datos = await res.json();
      if (!res.ok) throw new Error(datos?.error || 'No se ha podido responder.');
      setRespuesta(String(datos.texto ?? ''));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido responder.');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="ayuda-apple-overlay" onClick={onCerrar} role="presentation">
      <aside
        className="ayuda-apple-modal"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Guía de uso de ${ayuda.titulo}`}
      >
        {/* Cabecera translúcida */}
        <div className="ayuda-apple-header">
          <div className="ayuda-apple-header-info">
            <div className="ayuda-apple-pill">
              <BookOpen size={12} />
              <span>Guía rápida</span>
            </div>
            <h2 className="ayuda-apple-title">{ayuda.titulo}</h2>
          </div>
          <div className="ayuda-apple-header-actions">
            <kbd className="ayuda-apple-kbd" title="Presiona Esc para cerrar">ESC</kbd>
            <button
              type="button"
              className="ayuda-apple-close-btn"
              onClick={onCerrar}
              aria-label="Cerrar guía"
            >
              <X size={17} />
            </button>
          </div>
        </div>

        {/* Cuerpo con scroll elástico */}
        <div className="ayuda-apple-body">
          {/* Tarjeta Hero: Para qué sirve */}
          <div className="ayuda-hero-card">
            <div className="ayuda-hero-icon-box">
              <Compass size={18} />
            </div>
            <div className="ayuda-hero-content">
              <span className="ayuda-hero-label">¿Para qué sirve?</span>
              <p className="ayuda-hero-text">{ayuda.paraQue}</p>
            </div>
          </div>

          {/* Tarjeta Paso a Paso */}
          <div className="ayuda-section">
            <div className="ayuda-section-header">
              <span className="ayuda-section-title">Paso a paso</span>
              <span className="ayuda-section-counter">{ayuda.pasos.length} pasos</span>
            </div>
            <div className="ayuda-steps-list">
              {ayuda.pasos.map((p, i) => (
                <div key={i} className="ayuda-step-item">
                  <span className="ayuda-step-num">{i + 1}</span>
                  <div className="ayuda-step-content">
                    <p className="ayuda-step-text">{p}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tarjeta Pro-tips: Lo que conviene saber */}
          {ayuda.saber && ayuda.saber.length > 0 && (
            <div className="ayuda-pro-tips">
              <div className="ayuda-pro-tips-header">
                <Lightbulb size={16} />
                <span>Lo que conviene saber</span>
              </div>
              <ul className="ayuda-pro-tips-list">
                {ayuda.saber.map((s, i) => (
                  <li key={i} className="ayuda-pro-tip-item">
                    <span className="ayuda-pro-tip-bullet" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Rutas recomendadas / Sigue por aquí */}
          {ayuda.relacionadas && ayuda.relacionadas.length > 0 && (
            <div className="ayuda-section">
              <span className="ayuda-section-title">Sigue por aquí</span>
              <div className="ayuda-relacionadas-grid">
                {ayuda.relacionadas.map(r => (
                  <Link
                    key={r.ruta}
                    href={r.ruta}
                    className="ayuda-relacionada-pill"
                    onClick={onCerrar}
                  >
                    <span>{r.texto}</span>
                    <ArrowRight size={13} className="ayuda-relacionada-arrow" />
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Asistente */}
          <div className="ayuda-ai-card">
            <div className="ayuda-ai-header">
              <div className="ayuda-ai-badge">
                <Sparkles size={13} />
                <span>Pregúntale al asistente</span>
              </div>
              <span className="ayuda-ai-sub">¿Tienes otra duda sobre esta pantalla?</span>
            </div>

            {respuesta && (
              <div className="ayuda-ai-bubble">
                <div className="ayuda-ai-bubble-tag">Respuesta</div>
                <div className="ayuda-ai-bubble-text">{respuesta}</div>
              </div>
            )}

            {error && (
              <div className="ayuda-ai-error" role="alert">
                {error}
              </div>
            )}

            <div className="ayuda-ai-input-wrap">
              <textarea
                ref={campoRef}
                className="ayuda-ai-textarea"
                rows={2}
                placeholder={`Pregunta lo que no veas claro sobre ${ayuda.titulo}...`}
                value={pregunta}
                onChange={e => setPregunta(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void preguntar();
                  }
                }}
              />
              <div className="ayuda-ai-input-footer">
                <span className="ayuda-ai-hint">Pulsa ↵ Enter para enviar</span>
                <button
                  type="button"
                  className="ayuda-ai-submit-btn"
                  onClick={() => void preguntar()}
                  disabled={cargando || !pregunta.trim()}
                  title="Enviar pregunta"
                >
                  {cargando ? <Loader2 size={14} className="spin" /> : <CornerDownLeft size={14} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
