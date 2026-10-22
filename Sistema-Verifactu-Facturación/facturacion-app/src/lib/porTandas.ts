/**
 * LEER TODO, AUNQUE SEAN MÁS DE MIL
 *
 * Supabase (PostgREST) devuelve como mucho 1.000 filas por petición y no
 * avisa: lo demás simplemente no llega. Una distribuidora con 1.469
 * artículos veía «1000 referencias» y los 469 últimos por orden alfabético
 * no salían ni en Productos ni en el buscador de las facturas; con más de
 * mil facturas o albaranes pasaba lo mismo en los listados, y la búsqueda
 * del siguiente número libre dejaba de ver los números ya usados.
 *
 * `todasLasFilas` pide por tandas con `.range()` hasta que una tanda llega
 * incompleta. Para que las tandas no se solapen ni dejen huecos, la
 * consulta tiene que tener un orden total (por eso las llamadas añaden
 * `id` como desempate).
 *
 * `porTrozos` reparte una lista larga de ids en varias peticiones: con
 * miles de facturas, un solo `.in('invoice_id', ids)` no cabe en la URL.
 */

/** El tope de filas por respuesta de Supabase (`max_rows`). */
export const FILAS_POR_TANDA = 1000;

/** Para no quedarse en bucle si el servidor devolviera siempre tandas llenas. */
const TANDAS_MAX = 500;

/**
 * Las filas de Supabase llegan sin tipo (el cliente no lleva el esquema), y
 * cada llamante las lee como siempre las ha leído.
 */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
type Fila = any;

export interface Respuesta {
  data: Fila[] | null;
  error: unknown;
}

export async function todasLasFilas(
  pedir: (desde: number, hasta: number) => PromiseLike<Respuesta>,
  porTanda = FILAS_POR_TANDA,
): Promise<Respuesta> {
  const filas: Fila[] = [];
  for (let tanda = 0; tanda < TANDAS_MAX; tanda++) {
    const desde = tanda * porTanda;
    const { data, error } = await pedir(desde, desde + porTanda - 1);
    if (error) return { data: null, error };
    const llegadas = data ?? [];
    filas.push(...llegadas);
    if (llegadas.length < porTanda) break;
  }
  return { data: filas, error: null };
}

/** Ids por petición: unos 150 uuid caben de sobra en la URL. */
export const IDS_POR_PETICION = 150;

export async function porTrozos(
  ids: readonly string[],
  pedir: (trozo: string[]) => PromiseLike<Respuesta>,
  porPeticion = IDS_POR_PETICION,
): Promise<Respuesta> {
  const filas: Fila[] = [];
  for (let i = 0; i < ids.length; i += porPeticion) {
    const { data, error } = await pedir(ids.slice(i, i + porPeticion));
    if (error) return { data: null, error };
    filas.push(...(data ?? []));
  }
  return { data: filas, error: null };
}
