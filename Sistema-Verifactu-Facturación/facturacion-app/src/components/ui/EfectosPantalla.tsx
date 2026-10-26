'use client';

/**
 * LOS EFECTOS QUE VAN EN TODAS LAS PANTALLAS
 *
 * Dos cosas que no dependen de ninguna pantalla en concreto, montadas una
 * vez en el armazón de la app:
 *
 *  · Lo que queda por debajo del borde de la pantalla aparece al llegar a
 *    ello: sube un poco y se enfoca (desenfocado → nítido). Lo que ya se ve
 *    al cargar no se toca: tiene su propia entrada (ver «MOVIMIENTO DE LA
 *    APP» en globals.css). Se vuelve a mirar cuando cambia el contenido
 *    —llegan los datos, se cambia de pestaña—, y cada bloque se revela una
 *    sola vez.
 *  · Un foco de luz que sigue al ratón dentro de tarjetas y paneles. Sólo
 *    se escriben dos variables CSS en el elemento que está debajo del
 *    puntero, una vez por fotograma.
 *
 * Nada de esto pasa con «reducir movimiento» activado, ni en pantallas
 * táctiles (el foco), ni al imprimir (todo se ve, ver CSS).
 */

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/** Los bloques que se revelan al desplazar. */
const BLOQUES = [
  '.pantalla > * > *',
  '.pantalla .card',
  '.pantalla .table-container',
  '.pantalla .tabla-contenedor',
  '.pantalla .cuentas-marco',
  '.pantalla section',
].join(',');

/** Donde se enciende el foco de luz. */
const CON_FOCO = '.card, .cuentas-marco, .table-container, .modal, .guia-panel, .notifications-popover';

export default function EfectosPantalla() {
  const pathname = usePathname();

  // Revelar al desplazar.
  useEffect(() => {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const raiz = document.querySelector('.pantalla');
    if (!raiz) return;

    const vigia = new IntersectionObserver(entradas => {
      for (const e of entradas) {
        if (!e.isIntersecting) continue;
        const el = e.target as HTMLElement;
        el.dataset.revelar = 'si';
        vigia.unobserve(el);
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

    const mirar = () => {
      const alto = window.innerHeight;
      for (const el of raiz.querySelectorAll<HTMLElement>(BLOQUES)) {
        if (el.dataset.revelar) continue;
        // Uno dentro de otro que ya espera: se revela con su padre.
        if (el.parentElement?.closest('[data-revelar="espera"]')) { el.dataset.revelar = 'dentro'; continue; }
        const caja = el.getBoundingClientRect();
        if (caja.height === 0) continue;
        if (caja.top < alto * 0.92) { el.dataset.revelar = 'visto'; continue; }
        el.dataset.revelar = 'espera';
        vigia.observe(el);
      }
    };

    let cuadro = 0;
    const pronto = () => { cancelAnimationFrame(cuadro); cuadro = requestAnimationFrame(mirar); };
    pronto();
    const cambios = new MutationObserver(pronto);
    cambios.observe(raiz, { childList: true, subtree: true });
    return () => { cambios.disconnect(); vigia.disconnect(); cancelAnimationFrame(cuadro); };
  }, [pathname]);

  // El foco de luz que sigue al ratón.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let actual: HTMLElement | null = null;
    let x = 0, y = 0, cuadro = 0;
    const pintar = () => {
      cuadro = 0;
      if (!actual) return;
      const caja = actual.getBoundingClientRect();
      actual.style.setProperty('--foco-x', `${x - caja.left}px`);
      actual.style.setProperty('--foco-y', `${y - caja.top}px`);
    };
    const mover = (e: PointerEvent) => {
      x = e.clientX; y = e.clientY;
      const bajo = (e.target as Element | null)?.closest?.(CON_FOCO) as HTMLElement | null;
      if (bajo !== actual) {
        actual?.removeAttribute('data-foco');
        actual = bajo;
        actual?.setAttribute('data-foco', '');
      }
      if (actual && !cuadro) cuadro = requestAnimationFrame(pintar);
    };
    const salir = () => { actual?.removeAttribute('data-foco'); actual = null; };
    document.addEventListener('pointermove', mover, { passive: true });
    document.addEventListener('pointerleave', salir);
    return () => {
      document.removeEventListener('pointermove', mover);
      document.removeEventListener('pointerleave', salir);
      cancelAnimationFrame(cuadro);
      salir();
    };
  }, []);

  return null;
}
