'use client';

/**
 * «¿CÓMO SE USA?» — LA GUÍA DE CADA PANTALLA
 *
 * Una hoja que entra por la derecha sobre la pantalla desenfocada, como la
 * ayuda de cualquier herramienta de trabajo: deja ver de qué pantalla se
 * habla. Para qué sirve, cómo se hace, lo que hay que tener en cuenta, lo
 * relacionado y, abajo, una pregunta al asistente sobre esta pantalla.
 *
 * Escape, la X o un clic en el velo la cierran con una salida corta; el foco
 * entra en la guía al abrirla y vuelve al botón al cerrarla.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowUp, ChevronRight, CircleHelp, Info, Loader2, X } from 'lucide-react';
import { ayudaDe } from '@/lib/ayuda/paginas';
import Portal from '@/components/ui/Portal';

/** Lo que dura la salida (igual que en el CSS: .guia-capa.saliendo). */
const SALIDA_MS = 140;

export default function AyudaContextual() {
  const pathname = usePathname() ?? '/';
  const ayuda = ayudaDe(pathname);

  // Sin ayuda escrita para esta pantalla no se enseña el botón
  if (!ayuda) return null;

  return <BotonAyuda key={pathname} ayuda={ayuda} />;
}

function BotonAyuda({ ayuda }: { ayuda: NonNullable<ReturnType<typeof ayudaDe>> }) {
  const [abierta, setAbierta] = useState(false);

  return (
    <>
      <button
        type="button"
        className="apple-guide-trigger"
        onClick={() => setAbierta(true)}
        aria-haspopup="dialog"
        aria-expanded={abierta}
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
          de dentro. Sin el portal, la guía salía pegada a la cabecera
          en vez de centrada en la pantalla. Ver Portal.tsx. */}
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
  const [saliendo, setSaliendo] = useState(false);
  const panel = useRef<HTMLElement>(null);

  const cerrar = () => {
    if (saliendo) return;
    setSaliendo(true);
    window.setTimeout(onCerrar, SALIDA_MS);
  };
  const cerrarRef = useRef(cerrar);
  useEffect(() => { cerrarRef.current = cerrar; });

  // Escape cierra; el foco entra en la guía y, al cerrar, vuelve al botón.
  // Mientras está abierta, la página de detrás no se desplaza.
  useEffect(() => {
    const antes = document.activeElement as HTMLElement | null;
    panel.current?.focus({ preventScroll: true });
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrarRef.current(); };
    document.addEventListener('keydown', tecla);
    const desplazamiento = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', tecla);
      document.body.style.overflow = desplazamiento;
      antes?.focus?.({ preventScroll: true });
    };
  }, []);

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
    <div className={`guia-capa${saliendo ? ' saliendo' : ''}`}>
      <div className="guia-velo" onMouseDown={cerrar} aria-hidden="true" />
      <aside
        ref={panel}
        className="guia-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guia-titulo"
        tabIndex={-1}
      >
        <header className="guia-cabecera">
          <h2 id="guia-titulo" className="guia-titulo">{ayuda.titulo}</h2>
          <button type="button" className="guia-cerrar" onClick={cerrar} aria-label="Cerrar la ayuda">
            <X size={18} />
          </button>
        </header>

        <div className="guia-cuerpo">
          <p className="guia-para-que">{ayuda.paraQue}</p>

          <section aria-labelledby="guia-pasos">
            <h3 id="guia-pasos" className="guia-apartado">Cómo se hace</h3>
            <ol className="guia-pasos">
              {ayuda.pasos.map((p, i) => <li key={i}>{p}</li>)}
            </ol>
          </section>

          {ayuda.saber && ayuda.saber.length > 0 && (
            <section aria-labelledby="guia-saber" className="guia-saber">
              <h3 id="guia-saber" className="guia-apartado">
                <Info size={15} aria-hidden="true" /> Ten en cuenta
              </h3>
              <ul>
                {ayuda.saber.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </section>
          )}

          {ayuda.relacionadas && ayuda.relacionadas.length > 0 && (
            <section aria-labelledby="guia-sigue">
              <h3 id="guia-sigue" className="guia-apartado">Relacionado</h3>
              <ul className="guia-enlaces">
                {ayuda.relacionadas.map(r => (
                  <li key={r.ruta}>
                    <Link href={r.ruta} className="guia-enlace" onClick={onCerrar}>
                      {r.texto}
                      <ChevronRight size={16} aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <footer className="guia-asistente">
          {respuesta && <div className="guia-respuesta" aria-live="polite">{respuesta}</div>}
          {error && <p className="guia-error" role="alert">{error}</p>}

          <div className="guia-campo">
            <textarea
              className="guia-campo-texto"
              rows={1}
              aria-label={`Pregunta sobre ${ayuda.titulo}`}
              placeholder="Pregunta sobre esta pantalla"
              value={pregunta}
              onChange={e => setPregunta(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void preguntar();
                }
              }}
            />
            <button
              type="button"
              className="guia-enviar"
              onClick={() => void preguntar()}
              disabled={cargando || !pregunta.trim()}
              aria-label="Enviar la pregunta"
            >
              {cargando ? <Loader2 size={15} className="spin" /> : <ArrowUp size={16} />}
            </button>
          </div>
        </footer>
      </aside>
    </div>
  );
}
