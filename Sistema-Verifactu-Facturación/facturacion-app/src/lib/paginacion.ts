/**
 * LISTAS POR PÁGINAS
 *
 * Una lista de clientes, artículos o documentos que se pinta entera deja de
 * servir pasado cierto tamaño: cientos de filas en la pantalla, el navegador
 * pintándolas todas y la barra de desplazamiento convertida en una raya. Se
 * enseñan por páginas, con el tamaño que cada uno elija.
 *
 * Aquí sólo la cuenta, sin React, para poder probarla.
 */

/** Tamaños que se ofrecen. El primero es el de partida. */
export const TAMANOS_PAGINA = [25, 50, 100] as const;
export type TamanoPagina = (typeof TAMANOS_PAGINA)[number];

export const TAMANO_POR_DEFECTO: TamanoPagina = TAMANOS_PAGINA[0];

export function esTamanoPagina(n: unknown): n is TamanoPagina {
  return TAMANOS_PAGINA.includes(n as TamanoPagina);
}

export function totalPaginas(total: number, porPagina: number): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / Math.max(1, porPagina)));
}

/** La página pedida, dentro de las que existen (la lista pudo encogerse al filtrar o borrar). */
export function paginaValida(pagina: number, total: number, porPagina: number): number {
  const ultima = totalPaginas(total, porPagina);
  if (!Number.isFinite(pagina) || pagina < 1) return 1;
  return Math.min(Math.floor(pagina), ultima);
}

/** El trozo de la lista que toca enseñar en esa página. */
export function trozo<T>(lista: readonly T[], pagina: number, porPagina: number): T[] {
  const p = paginaValida(pagina, lista.length, porPagina);
  return lista.slice((p - 1) * porPagina, p * porPagina);
}

/** «26–50 de 240»: las posiciones de la primera y la última fila de la página. */
export function rango(pagina: number, total: number, porPagina: number): { desde: number; hasta: number } {
  if (total <= 0) return { desde: 0, hasta: 0 };
  const p = paginaValida(pagina, total, porPagina);
  return { desde: (p - 1) * porPagina + 1, hasta: Math.min(p * porPagina, total) };
}

export type BotonPagina = number | 'hueco';

/**
 * Qué números de página enseñar: siempre la primera y la última, la actual
 * con su vecina a cada lado, y un hueco («…») donde se saltan páginas. Un
 * hueco que sólo escondería una página se sustituye por esa página: «1 … 3»
 * no ahorra nada frente a «1 2 3».
 */
export function botonesPagina(actual: number, total: number): BotonPagina[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const p = Math.min(Math.max(1, actual), total);
  const nucleo = new Set([1, total, p - 1, p, p + 1]);
  // En los extremos se enseña algo más para que la fila no encoja.
  if (p <= 3) [2, 3, 4].forEach(n => nucleo.add(n));
  if (p >= total - 2) [total - 3, total - 2, total - 1].forEach(n => nucleo.add(n));
  const numeros = [...nucleo].filter(n => n >= 1 && n <= total).sort((a, b) => a - b);

  const salida: BotonPagina[] = [];
  numeros.forEach((n, i) => {
    const anterior = numeros[i - 1];
    if (anterior !== undefined) {
      if (n - anterior === 2) salida.push(anterior + 1);
      else if (n - anterior > 2) salida.push('hueco');
    }
    salida.push(n);
  });
  return salida;
}
