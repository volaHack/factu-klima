'use client';

import { useEffect, useState, type MouseEvent } from 'react';
import { Printer, RefreshCw } from 'lucide-react';

export interface SeccionPanel {
  /** El id del elemento al que lleva (y que se vigila al bajar). */
  id: string;
  nombre: string;
}

/**
 * LA BARRA DE SECCIONES DEL PANEL
 *
 * El panel mide unos seis mil píxeles en un portátil: lo de hoy, las
 * fichas elegidas, el análisis y los avisos, uno detrás de otro. Esta
 * barra se queda pegada bajo la cabecera y lleva a cada parte de un
 * toque; la sección que se está leyendo se marca sola al bajar.
 *
 * A la derecha, cuándo se leyeron los datos (el panel no es una foto
 * fija: se repinta al volver a la pestaña o al guardar una factura en
 * otro equipo), el botón para volver a leerlos y el de imprimir.
 */
export default function NavegacionPanel({ secciones, actualizado, recargando, onRecargar }: {
  secciones: readonly SeccionPanel[];
  actualizado: Date | null;
  recargando: boolean;
  onRecargar: () => void;
}) {
  const [activa, setActiva] = useState(secciones[0]?.id);
  const claveSecciones = secciones.map(s => s.id).join('|');

  // La activa es la última cuya parte de arriba ya ha pasado bajo la
  // barra. Se mide al hacer scroll (una vez por fotograma) y no con
  // IntersectionObserver: las secciones miden de 300 a 2.000 px y un
  // umbral único no sirve para todas.
  useEffect(() => {
    const ids = claveSecciones.split('|').filter(Boolean);
    let pendiente = 0;
    const medir = () => {
      pendiente = 0;
      const barra = document.querySelector('.panel-secciones')?.getBoundingClientRect().bottom ?? 0;
      const alFinal = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      let actual = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top - barra <= 24) actual = id;
      }
      setActiva(alFinal ? ids[ids.length - 1] : actual);
    };
    const alMover = () => { if (!pendiente) pendiente = requestAnimationFrame(medir); };
    alMover();
    window.addEventListener('scroll', alMover, { passive: true });
    window.addEventListener('resize', alMover);
    return () => {
      window.removeEventListener('scroll', alMover);
      window.removeEventListener('resize', alMover);
      cancelAnimationFrame(pendiente);
    };
  }, [claveSecciones]);

  const ir = (e: MouseEvent<HTMLAnchorElement>, id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: quieto ? 'auto' : 'smooth', block: 'start' });
    // El foco va a la sección, para que el tabulador siga desde allí.
    el.focus({ preventScroll: true });
    setActiva(id);
  };

  const hora = actualizado?.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="panel-secciones">
      <nav className="panel-secciones-nav" aria-label="Secciones del panel">
        <ul>
          {secciones.map(s => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="panel-secciones-enlace"
                aria-current={activa === s.id ? 'location' : undefined}
                onClick={e => ir(e, s.id)}
              >
                {s.nombre}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="panel-secciones-acciones">
        {hora && (
          <span className="panel-secciones-hora" aria-live="polite">
            <span className="panel-secciones-hora-largo">Actualizado a las </span>
            <time dateTime={actualizado!.toISOString()}>{hora}</time>
          </span>
        )}
        <button
          type="button"
          className="panel-secciones-boton"
          onClick={onRecargar}
          disabled={recargando}
          aria-label="Volver a leer los datos del panel"
          title="Volver a leer los datos"
        >
          <RefreshCw size={14} aria-hidden="true" className={recargando ? 'spin' : undefined} />
        </button>
        <button
          type="button"
          className="panel-secciones-boton"
          onClick={() => window.print()}
          aria-label="Imprimir el panel"
          title="Imprimir"
        >
          <Printer size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
