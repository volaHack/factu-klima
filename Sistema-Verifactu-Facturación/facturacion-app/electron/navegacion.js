'use strict';

/**
 * ¿Qué se hace con una navegación dentro de la ventana de la app?
 *   'permitir' — es la app (https en su dominio).
 *   'externo'  — otra web: se abre en el navegador del sistema.
 *   'tpv'      — en modo TPV, una pantalla que no toca: de vuelta a /tpv.
 *   'bloquear' — cualquier otra cosa (file:, data:, javascript:…).
 */
function decidirNavegacion(url, appUrl, mode) {
  let destino;
  try {
    destino = new URL(url);
  } catch {
    return 'bloquear';
  }
  const esLocal = destino.hostname === 'localhost' || destino.hostname === '127.0.0.1';
  if (!(destino.protocol === 'https:' || (destino.protocol === 'http:' && esLocal))) return 'bloquear';
  if (destino.host !== new URL(appUrl).host) return 'externo';
  if (mode === 'tpv' && !esRutaTpv(destino.pathname)) return 'tpv';
  return 'permitir';
}

function esRutaTpv(pathname) {
  return pathname === '/tpv' || pathname === '/login' || pathname.startsWith('/auth/');
}

module.exports = { decidirNavegacion, esRutaTpv };
