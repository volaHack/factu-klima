/**
 * Rutas accesibles sin sesión — las páginas del grupo (public).
 *
 * La lista la comparten dos sitios que TIENEN que coincidir:
 *
 *   - src/proxy.ts, en servidor, que redirige a /login antes de renderizar.
 *   - AuthWrapper, en cliente, que decide si envolver la página en el
 *     armazón del dashboard (sidebar + cabecera).
 *
 * Vivían duplicadas y se desincronizaron: la landing y /precios eran
 * públicas para AuthWrapper pero el proxy las mandaba a /login, así que
 * ningún visitante sin sesión llegaba a verlas. De ahí este módulo.
 */
const PUBLIC_PREFIXES = ['/login', '/auth', '/aprobar', '/instalar', '/precios'];

export function isPublicRoute(pathname: string): boolean {
  // La landing se compara exacta: metida entre los prefijos, CUALQUIER ruta
  // la cumpliría (todas empiezan por '/') y la aplicación entera pasaría por
  // pública — sin sidebar ni cabecera en ninguna página.
  return pathname === '/' || PUBLIC_PREFIXES.some(p => pathname.startsWith(p));
}
