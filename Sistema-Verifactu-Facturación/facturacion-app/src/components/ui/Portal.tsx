'use client';

import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

/**
 * SACA SU CONTENIDO AL <body>
 *
 * Un `position: fixed` NO se mide contra la ventana si algún antepasado
 * tiene `transform`, `filter`, `backdrop-filter`, `perspective`,
 * `will-change` o `contain: paint`: cualquiera de ésos crea un bloque
 * contenedor y el elemento fijo pasa a medirse contra ÉL.
 *
 * Aquí eso no es teoría: la cabecera de la aplicación lleva
 * `backdrop-filter: blur(20px)` (el cristal esmerilado), y la guía
 * «¿Cómo se usa?» salía pegada a la cabecera en vez de centrada en la
 * pantalla, con su fondo oscuro cubriendo sólo esa franja de 64 px.
 *
 * Quitarle el desenfoque a la cabecera habría arreglado el síntoma y
 * estropeado el diseño. Un portal lo arregla de raíz: el modal se pinta
 * como hijo del <body>, así que ningún contenedor puede reencuadrarlo,
 * hoy ni cuando alguien añada un `filter` a otra tarjeta dentro de un
 * año.
 *
 * EL PORQUÉ DE `useSyncExternalStore`
 *
 * `document` no existe en el servidor, así que hay que esperar al
 * cliente. La forma habitual —un `useState(false)` y un efecto que lo
 * pone a `true`— provoca un render en cascada y el compilador de React
 * lo marca como error. Esta API está hecha exactamente para esto:
 * devuelve un valor en servidor y otro en cliente sin descuadrar la
 * hidratación y sin cambiar estado dentro de un efecto.
 */

/** Nada que escuchar: el valor sólo depende de dónde se ejecuta. */
const sinSuscripcion = () => () => {};
const enCliente = () => true;
const enServidor = () => false;

export default function Portal({ children }: { children: React.ReactNode }) {
  const montado = useSyncExternalStore(sinSuscripcion, enCliente, enServidor);

  if (!montado) return null;
  return createPortal(children, document.body);
}
