'use client';

import { useEffect } from 'react';

/**
 * Layout de las páginas públicas (/, /precios, /instalar, /login).
 *
 * EL LANDING NO TIENE MODO OSCURO, A PROPÓSITO
 *
 * El interruptor de tema es para el panel: quien trabaja ocho horas
 * dentro del programa decide con qué luz lo mira. La cara pública es otra
 * cosa —es la primera impresión, y tiene que ser siempre la misma para
 * todo el mundo—, así que aquí la paleta se planta en claro pase lo que
 * pase con lo que el usuario tenga elegido.
 *
 * Se hace en `.public-layout-force-light` (globals.css), que reescribe
 * todos los tokens de color y ADEMÁS se pinta su propio fondo: sin eso
 * el <body>, que queda por encima de este div, seguía resolviendo su
 * fondo y su color de texto con la paleta oscura.
 */
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  /**
   * La franja del sistema en el móvil.
   *
   * `aplicarTema` la deja en el gris casi negro del panel cuando el
   * usuario tiene el modo oscuro. En el landing eso saca una banda negra
   * encima de una página clara, así que mientras se esté en la parte
   * pública se fuerza al blush y se devuelve al salir.
   */
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    const anterior = meta.getAttribute('content');
    meta.setAttribute('content', '#f2e7e0');
    return () => { if (anterior) meta.setAttribute('content', anterior); };
  }, []);

  return (
    <div className="public-layout-force-light">
      {children}
    </div>
  );
}
