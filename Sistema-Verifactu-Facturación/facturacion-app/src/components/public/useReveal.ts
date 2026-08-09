'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Marca un elemento como visible la primera vez que entra en pantalla,
 * para que el CSS haga la entrada (`.reveal` → `.is-in`).
 *
 * Diferencia con la versión que vivía dentro de page.tsx: la entrada la
 * hace el CSS, no un `style` inline recalculado en cada render; aquí
 * sólo se conmuta una clase.
 *
 * `prefers-reduced-motion` no se consulta aquí a propósito: la hoja de
 * estilos ya deja `.reveal` visible y sin transición bajo esa consulta,
 * así que el observador puede seguir haciendo su trabajo sin que se
 * note. Comprobarlo también en JavaScript sólo añadiría una segunda
 * fuente de verdad para la misma decisión.
 */
export function useReveal<T extends HTMLElement = HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // No hay comprobación de soporte de IntersectionObserver: es base
    // en todos los navegadores desde 2019, y el caso de verdad —que no
    // se ejecute JavaScript en absoluto— lo cubre la hoja de estilos con
    // `@media (scripting: none)`, no este archivo.

    // Si el elemento ya está en pantalla al cargar (secciones altas en
    // pantallas grandes), el observer dispara igualmente en su primer
    // callback, así que no hace falta comprobarlo aparte.
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, []);

  return { ref, visible, className: `reveal${visible ? ' is-in' : ''}` };
}
