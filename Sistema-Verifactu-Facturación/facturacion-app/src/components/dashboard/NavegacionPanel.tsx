'use client';

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { RefreshCw } from 'lucide-react';

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
 * otro equipo) y el botón para volver a leerlos.
 *
 * La raya de la sección activa es una sola pieza que se desliza de una
 * pestaña a otra, como en Linear: con una raya por pestaña el ojo veía
 * apagarse una y encenderse otra, y no de dónde venía ni a dónde iba.
 */

/** Lo mínimo que se ve el hilo de «leyendo»: más corto parece un parpadeo. */
const HILO_MINIMO = 650;
export default function NavegacionPanel({ secciones, actualizado, recargando, onRecargar }: {
  secciones: readonly SeccionPanel[];
  actualizado: Date | null;
  recargando: boolean;
  onRecargar: () => void;
}) {
  const [activa, setActiva] = useState(secciones[0]?.id);
  const claveSecciones = secciones.map(s => s.id).join('|');
  const lista = useRef<HTMLUListElement>(null);
  // Dónde está la raya: posición y ancho de la pestaña activa dentro de la
  // lista. `null` hasta la primera medida, para no verla llegar desde cero.
  const [raya, setRaya] = useState<{ x: number; ancho: number } | null>(null);
  // El hilo bajo la barra mientras se leen los datos. Leer del equipo tarda
  // milisegundos: al acabar se deja una cola, para que se vea que algo ha
  // pasado. (El valor anterior se guarda en estado y no en un efecto, como
  // pide React para lo que se deriva de las props.)
  const [antes, setAntes] = useState(recargando);
  const [cola, setCola] = useState(false);
  if (antes !== recargando) {
    setAntes(recargando);
    if (!recargando) setCola(true);
  }
  useEffect(() => {
    if (!cola) return;
    const t = window.setTimeout(() => setCola(false), HILO_MINIMO);
    return () => window.clearTimeout(t);
  }, [cola]);
  const leyendo = recargando || cola;

  useLayoutEffect(() => {
    const ul = lista.current;
    if (!ul) return;
    const medir = () => {
      const enlace = ul.querySelector<HTMLElement>('[aria-current]');
      if (!enlace) { setRaya(null); return; }
      setRaya(r => (r && r.x === enlace.offsetLeft && r.ancho === enlace.offsetWidth
        ? r : { x: enlace.offsetLeft, ancho: enlace.offsetWidth }));
      // En el móvil la lista se desplaza de lado: la pestaña activa se trae
      // a la vista sin mover la página (scrollIntoView también la bajaría).
      const nav = ul.parentElement;
      if (nav && nav.scrollWidth > nav.clientWidth) {
        const izquierda = enlace.offsetLeft - 16;
        const derecha = enlace.offsetLeft + enlace.offsetWidth + 16 - nav.clientWidth;
        if (nav.scrollLeft > izquierda) nav.scrollTo({ left: izquierda });
        else if (nav.scrollLeft < derecha) nav.scrollTo({ left: derecha });
      }
    };
    medir();
    // Las fuentes llegan después y cambian el ancho de las pestañas.
    const obs = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medir) : null;
    obs?.observe(ul);
    return () => obs?.disconnect();
  }, [activa, claveSecciones]);

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
    <div className="panel-secciones" data-leyendo={leyendo || undefined}>
      <nav className="panel-secciones-nav" aria-label="Secciones del panel">
        <ul ref={lista}>
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
          {raya && (
            <li
              className="panel-secciones-raya"
              aria-hidden="true"
              style={{ '--raya-x': `${raya.x}px`, '--raya-escala': raya.ancho / 100 } as CSSProperties}
            />
          )}
        </ul>
      </nav>
      <div className="panel-secciones-acciones">
        {hora && (
          <span className="panel-secciones-hora" aria-live="polite">
            <span className="panel-secciones-hora-largo">Actualizado a las </span>
            {/* Con la hora como llave: al cambiar, la nueva entra desde abajo. */}
            <time key={hora} className="panel-secciones-hora-valor" dateTime={actualizado!.toISOString()}>{hora}</time>
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
      </div>
    </div>
  );
}
