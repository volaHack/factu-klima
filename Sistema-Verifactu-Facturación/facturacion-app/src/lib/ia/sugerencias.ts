/**
 * LO QUE DEVUELVE EL MODELO AL RECONOCER UNA PLANTILLA, PUESTO EN ORDEN
 *
 * Se le pide un objeto con una lista dentro:
 *
 *   {"sugerencias":[{"id":"c1","clave":"doc_numero","motivo":"..."}]}
 *
 * Gemini lo cumple porque se le manda además un esquema que obedece al
 * pie de la letra. Un modelo pequeño no siempre: con el mismo enunciado,
 * Qwen 3 4B contestó
 *
 *   {"c1":"doc_numero","c2":"cliente_nombre","c3":"cliente_nif"}
 *
 * que es la MISMA información, perfectamente útil, en otra forma. La
 * primera versión de esto la tiraba entera y devolvía cero sugerencias,
 * sin un solo error por ningún lado: el usuario veía que la IA «no había
 * encontrado nada» cuando en realidad lo había acertado todo.
 *
 * Así que aquí se admiten las tres formas en que suelen contestar y se
 * filtra siempre lo que llegue. Lo segundo no es negociable: el modelo se
 * inventa claves de vez en cuando, y una clave inventada acaba imprimiendo
 * el NIF de un cliente donde va el total.
 */

export interface SugerenciaCampo {
  id: string;
  /** La clave del dato, o null si el modelo no se atrevió. */
  clave: string | null;
  motivo: string;
}

const MAXIMO_MOTIVO = 120;

function comoSugerencia(valor: unknown, id: string, permitidas: Set<string>): SugerenciaCampo | null {
  if (typeof id !== 'string' || !id) return null;

  // Forma larga: un objeto con clave y motivo.
  if (valor && typeof valor === 'object' && !Array.isArray(valor)) {
    const o = valor as { clave?: unknown; motivo?: unknown };
    const clave = o.clave;
    if (clave === null || clave === undefined) return { id, clave: null, motivo: motivoDe(o.motivo) };
    if (typeof clave === 'string' && permitidas.has(clave)) {
      return { id, clave, motivo: motivoDe(o.motivo) };
    }
    return null;
  }

  // Forma corta: el valor ES la clave.
  if (valor === null) return { id, clave: null, motivo: '' };
  if (typeof valor === 'string') {
    if (valor === 'null' || valor === '') return { id, clave: null, motivo: '' };
    return permitidas.has(valor) ? { id, clave: valor, motivo: '' } : null;
  }

  return null;
}

function motivoDe(valor: unknown): string {
  return typeof valor === 'string' ? valor.slice(0, MAXIMO_MOTIVO) : '';
}

/**
 * Saca las sugerencias válidas de lo que haya contestado el modelo.
 *
 * `permitidas` son las claves que la plantilla admite de verdad: todo lo
 * que no esté ahí se tira, venga como venga.
 */
export function normalizarSugerencias(analisis: unknown, permitidas: Set<string>): SugerenciaCampo[] {
  if (!analisis || typeof analisis !== 'object') return [];

  // 1. Lo que se pidió: {"sugerencias": [...]}
  const conEnvoltorio = (analisis as { sugerencias?: unknown }).sugerencias;
  const lista = Array.isArray(conEnvoltorio)
    ? conEnvoltorio
    // 2. La lista a pelo, sin el envoltorio.
    : Array.isArray(analisis)
      ? analisis
      : null;

  if (lista) {
    return lista
      .map(item => {
        const id = (item as { id?: unknown })?.id;
        return typeof id === 'string' ? comoSugerencia(item, id, permitidas) : null;
      })
      .filter((s): s is SugerenciaCampo => s !== null);
  }

  // 3. El mapa plano {"c1": "doc_numero", ...}, que es lo que devuelven
  //    los modelos pequeños cuando el enunciado se les hace largo.
  return Object.entries(analisis as Record<string, unknown>)
    .map(([id, valor]) => comoSugerencia(valor, id, permitidas))
    .filter((s): s is SugerenciaCampo => s !== null);
}
