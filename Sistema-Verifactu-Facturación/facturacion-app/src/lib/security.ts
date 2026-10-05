/**
 * Comprueba que una ruta de redirect proporcionada por el usuario (query
 * string, body, etc.) sea una ruta interna de la app y no pueda usarse
 * para redirigir a un dominio externo (open redirect).
 */
export function isSafeRedirectPath(path: unknown): path is string {
  if (typeof path !== 'string' || path.length === 0) return false;
  if (!path.startsWith('/')) return false;
  if (path.startsWith('//')) return false; // protocol-relative URL
  if (path.startsWith('/\\')) return false; // algunos navegadores tratan \ como /
  // El navegador quita tabuladores y saltos de línea de una dirección:
  // «/\t/otro.com» acabaría siendo «//otro.com», otra web.
  if (/[\u0000-\u001f\u007f]/.test(path)) return false;
  return true;
}
