'use client';

import { useEffect, useRef, useState } from 'react';

export interface SeccionDelIndice {
  id: string;
  etiqueta: string;
}

/**
 * EL ÍNDICE DE AJUSTES
 *
 * Ajustes son dieciocho secciones seguidas, y lo que se busca suele estar
 * en la del fondo. Con esto se salta directo. En pantalla ancha va en una
 * columna fija al lado; en el móvil, una fila de fichas arriba que se
 * desliza de lado. Es el mismo elemento: lo cambia el CSS según el ancho
 * que tiene la página, no la ventana (ver `.ajustes-pagina`).
 *
 * `secciones` tiene que ser una lista fija (una constante fuera del
 * componente): si cambiara en cada render, el vigía se rehace cada vez.
 */
export default function IndiceAjustes({ secciones }: { secciones: readonly SeccionDelIndice[] }) {
  const [activa, setActiva] = useState(secciones[0]?.id ?? '');
  /**
   * La que se ha pulsado manda hasta que la persona se mueva por su cuenta.
   *
   * Sin esto, al pulsar «Mantenimiento» (la última) se marcaba la de
   * antes: la página no da más de sí y la última nunca llega arriba, que
   * es donde mira el vigía.
   */
  const fijada = useRef<string | null>(null);

  // Cuál se está leyendo: la primera que asoma por la franja de arriba,
  // justo debajo de la cabecera fija.
  useEffect(() => {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return;
    const cabecera = Math.round(document.querySelector('.header')?.getBoundingClientRect().height ?? 56);
    const visibles = new Set<string>();
    const vigia = new IntersectionObserver(entradas => {
      for (const e of entradas) {
        if (e.isIntersecting) visibles.add(e.target.id);
        else visibles.delete(e.target.id);
      }
      if (fijada.current) return;
      const primera = secciones.find(s => visibles.has(s.id));
      if (primera) setActiva(primera.id);
    }, { rootMargin: `-${cabecera + 8}px 0px -55% 0px` });

    for (const s of secciones) {
      const el = document.getElementById(s.id);
      if (el) vigia.observe(el);
    }

    const soltar = () => { fijada.current = null; };
    window.addEventListener('wheel', soltar, { passive: true });
    window.addEventListener('touchmove', soltar, { passive: true });
    window.addEventListener('keydown', soltar);
    return () => {
      vigia.disconnect();
      window.removeEventListener('wheel', soltar);
      window.removeEventListener('touchmove', soltar);
      window.removeEventListener('keydown', soltar);
    };
  }, [secciones]);

  /**
   * Llegar desde otra pantalla con `/ajustes#equipo`.
   *
   * El navegador busca el ancla al cargar, pero entonces Ajustes todavía
   * es el esqueleto de carga y no la encuentra: se quedaba arriba del
   * todo. Se vuelve a buscar ya con la página pintada, y un par de veces
   * más por si es de una pieza que carga sus datos aparte (la contraseña,
   * dentro de Seguridad).
   */
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    const esperas = [0, 300, 900];
    const relojes: number[] = [];
    let hecho = false;
    for (const ms of esperas) {
      relojes.push(window.setTimeout(() => {
        if (hecho) return;
        const el = document.getElementById(id);
        if (!el) return;
        hecho = true;
        el.scrollIntoView({ block: 'start', behavior: 'auto' });
        if (secciones.some(s => s.id === id)) { fijada.current = id; setActiva(id); }
      }, ms));
    }
    return () => relojes.forEach(r => window.clearTimeout(r));
  }, [secciones]);

  const ir = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    // Con Ctrl, Cmd o la rueda se deja hacer al navegador (otra pestaña).
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    const quieto = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'start', behavior: quieto ? 'auto' : 'smooth' });
    // Se reemplaza y no se añade: si no, «Atrás» recorre cada sección
    // visitada antes de salir de Ajustes. Next copia su estado al nuevo
    // registro, así que el router no se pierde.
    window.history.replaceState(null, '', `#${id}`);
    fijada.current = id;
    setActiva(id);
  };

  return (
    <nav className="ajustes-indice" aria-label="Secciones de ajustes">
      <p className="ajustes-indice-titulo">En esta página</p>
      <ol>
        {secciones.map(s => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className={`filter-chip ${activa === s.id ? 'active' : ''}`}
              aria-current={activa === s.id ? 'location' : undefined}
              onClick={e => ir(e, s.id)}
            >
              {s.etiqueta}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
