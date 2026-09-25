/**
 * La huella de un error: lo que hace que dos avisos sean «el mismo fallo».
 *
 * Se quitan del mensaje y de la ruta los identificadores, números y fechas
 * que cambian de una vez a otra («la factura 3f2a… no existe» y «la
 * factura 9c1b… no existe» son el mismo error). Así la administración ve
 * «este fallo, 40 veces, en 12 cuentas» y no 40 filas sueltas.
 */

export function normalizarMensaje(texto: string): string {
  return texto
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>')
    .replace(/\b[0-9a-f]{16,}\b/gi, '<hex>')
    .replace(/\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?/g, '<fecha>')
    .replace(/\d+([.,]\d+)?/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

export function normalizarRuta(ruta: string): string {
  return (ruta.split('?')[0] || '/')
    .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '/[id]')
    .replace(/\/\d+(?=\/|$)/g, '/[n]')
    .slice(0, 200);
}

/** FNV-1a de 32 bits: corto, estable y sin dependencias. */
export function huellaDe(origen: string, mensaje: string, ruta: string): string {
  const texto = `${origen}|${normalizarMensaje(mensaje)}|${normalizarRuta(ruta)}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}
