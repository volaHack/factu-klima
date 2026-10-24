import { plano } from './buscarProductos';

/**
 * ¿Casa lo escrito en un buscador de lista con alguno de estos campos?
 * Cada palabra tiene que estar en alguno, sin tildes ni mayúsculas y en
 * cualquier orden: «pepe arrecife» encuentra a Bar Pepe de Arrecife.
 */
export function casaTexto(texto: string, ...campos: (string | number | null | undefined)[]): boolean {
  const palabras = plano(texto).split(/\s+/).filter(Boolean);
  if (!palabras.length) return true;
  const pajar = plano(campos.filter(c => c !== null && c !== undefined && c !== '').join(' '));
  return palabras.every(w => pajar.includes(w));
}
