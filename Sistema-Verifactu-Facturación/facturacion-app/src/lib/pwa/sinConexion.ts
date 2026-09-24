/**
 * QUÉ PANTALLAS SE GUARDAN EN EL TELÉFONO PARA USARLAS SIN CONEXIÓN
 *
 * El service worker (public/sw.js) guarda las que se le pidan, con su
 * código. Se le pide la lista en cuanto hay sesión y red, y otra vez cada
 * doce horas, porque cada despliegue cambia los ficheros de código y la
 * pantalla guardada tiene que apuntar a los de ahora.
 *
 * Primero las del día a día (vender, facturar, entregar), por si la
 * conexión se va a mitad: son las que no pueden faltar.
 */

export const RUTAS_SIN_CONEXION = [
  '/dashboard', '/tpv', '/facturas', '/facturas/nueva', '/albaranes', '/albaranes/nueva',
  '/clientes', '/productos', '/documentos', '/documentos/nuevo', '/devoluciones', '/gastos', '/tesoreria',
  '/asistencia', '/ofertas', '/almacenes', '/lotes', '/obras', '/ordenes-trabajo',
  '/rutas-reparto', '/informes', '/listados', '/verifactu', '/ajustes', '/importar',
];

const CLAVE = 'klima-precalentado';
const CADA_MS = 12 * 60 * 60 * 1000;

/** ¿Toca volver a guardar las pantallas? */
export function tocaPrecalentar(ahora: number, ultimo: string | null, version: string): boolean {
  if (!ultimo) return true;
  const [v, t] = ultimo.split('@');
  return v !== version || !(Number(t) > 0) || ahora - Number(t) > CADA_MS;
}

/**
 * Pide al service worker que guarde todas las pantallas. No hace nada si
 * no hay red, si no hay service worker o si ya se hizo hace poco con esta
 * versión de la app.
 */
export async function precalentar(version: string): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.onLine || !('serviceWorker' in navigator)) return;
  let ultimo: string | null = null;
  try { ultimo = localStorage.getItem(CLAVE); } catch { /* sin almacenamiento: se hace igual */ }
  if (!tocaPrecalentar(Date.now(), ultimo, version)) return;

  const reg = await navigator.serviceWorker.ready;
  reg.active?.postMessage({ type: 'PRECALENTAR', rutas: RUTAS_SIN_CONEXION });
  try { localStorage.setItem(CLAVE, `${version}@${Date.now()}`); } catch { /* da igual */ }
}

/** Al cerrar sesión: las pantallas guardadas llevan datos de esa cuenta. */
export async function olvidarPantallas(): Promise<void> {
  try { localStorage.removeItem(CLAVE); } catch { /* da igual */ }
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  reg?.active?.postMessage({ type: 'OLVIDAR_PAGINAS' });
}
