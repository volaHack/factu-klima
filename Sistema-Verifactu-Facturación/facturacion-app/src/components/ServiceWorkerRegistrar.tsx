'use client';

import { useEffect } from 'react';

/**
 * Registra el service worker desde un efecto.
 *
 * Antes esto era un <script dangerouslySetInnerHTML> dentro del <head>
 * del layout. React no ejecuta los <script> que encuentra al renderizar
 * en cliente, y su presencia en el árbol rompía la hidratación: React
 * descartaba el HTML del servidor y volvía a montar toda la página. Ese
 * remontaje es lo que dejaba a Recharts midiendo un contenedor de 0px,
 * y por eso los gráficos aparecían en blanco.
 */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (window.location.protocol !== 'https:') return;

    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.warn('No se pudo registrar el service worker:', err);
    });
  }, []);

  return null;
}
