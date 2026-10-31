/**
 * AVISO AL ALMACÉN DE PEDIDOS NUEVOS
 *
 * El comercial guarda el pedido en el móvil y, en el almacén, la tablet
 * tiene que enterarse sin que nadie recargue: un número en la entrada
 * «Preparar pedidos» del menú, un aviso con el cliente y las líneas, y un
 * pitido corto si se quiere. Aquí está lo que decide qué es «nuevo», sin
 * pantalla ni red, para poder probarlo entero.
 *
 * DOS MEMORIAS, POR CUENTA Y POR EQUIPO
 *
 *   · avisados: los pedidos de los que este equipo ya ha avisado. Un
 *     pedido avisa una vez, aunque la pantalla se recargue cien veces.
 *   · vistos: los que ya se han visto en la cola. Es lo que cuenta el
 *     número del menú: lo que ha entrado y nadie ha mirado todavía.
 *
 * Se guardan en localStorage con la cuenta en la clave: si en la tablet
 * entra otra empresa (una gestoría, una cuenta de pruebas), no hereda lo
 * visto de la anterior.
 *
 * LA PRIMERA VEZ
 *
 * La primera vez que un equipo mira, todo lo que hay en la cola se da por
 * avisado: si no, abrir el programa por la mañana soltaría veinte avisos
 * seguidos de pedidos de ayer. Lo que sí se cuenta en el menú, porque
 * nadie lo ha visto aún en este equipo.
 *
 * LO QUE GUARDA ESTE MISMO EQUIPO
 *
 * El móvil del comercial también ve su pedido entrar en la cola, pero no
 * tiene sentido que le avise de lo que acaba de escribir él: lo que se
 * guarda en este equipo se marca como avisado al guardarlo.
 */

import type { PedidoEnCola } from './prepararPedidos';
import { nombreDe, numeroDeLineas } from './prepararPedidos';

export interface MemoriaAvisos {
  /** false hasta la primera vez que este equipo mira la cola. */
  iniciada: boolean;
  avisados: string[];
  vistos: string[];
}

export const MEMORIA_VACIA: MemoriaAvisos = { iniciada: false, avisados: [], vistos: [] };

/** Cuántos ids se recuerdan: de sobra para la cola de un almacén, y la memoria no crece sin fin. */
export const MAX_RECORDADOS = 400;

export const claveMemoria = (cuenta: string) => `klima-almacen-avisos:${cuenta}`;

/** Añade ids a una lista sin repetir y se queda con los últimos `max`. */
export function recordar(lista: readonly string[], ids: readonly string[], max = MAX_RECORDADOS): string[] {
  const nuevos = ids.filter(id => !lista.includes(id));
  if (!nuevos.length) return [...lista];
  const junta = [...lista, ...new Set(nuevos)];
  return junta.slice(Math.max(0, junta.length - max));
}

export interface Novedades {
  /** De los que hay que avisar ahora, por orden de llegada. */
  paraAvisar: PedidoEnCola[];
  /** Cuántos de la cola no se han visto todavía: el número del menú. */
  sinVer: number;
  memoria: MemoriaAvisos;
}

/** Compara la cola con lo que este equipo recuerda y dice qué es nuevo. */
export function novedades(cola: readonly PedidoEnCola[], memoria: MemoriaAvisos): Novedades {
  const ids = cola.map(p => p.id);
  const sinVer = cola.filter(p => !memoria.vistos.includes(p.id)).length;
  if (!memoria.iniciada) {
    return { paraAvisar: [], sinVer, memoria: { ...memoria, iniciada: true, avisados: recordar(memoria.avisados, ids) } };
  }
  const paraAvisar = cola
    .filter(p => !memoria.avisados.includes(p.id))
    .sort((a, b) => a.creado.localeCompare(b.creado));
  if (!paraAvisar.length) return { paraAvisar, sinVer, memoria };
  return { paraAvisar, sinVer, memoria: { ...memoria, avisados: recordar(memoria.avisados, paraAvisar.map(p => p.id)) } };
}

/**
 * Lo visto en la cola deja de contar en el menú. Pero sigue avisando si aún
 * no lo había hecho: la tablet del almacén se pasa el día con la cola
 * abierta, y es justo ahí donde el pitido hace falta.
 */
export function marcarVistos(memoria: MemoriaAvisos, ids: readonly string[]): MemoriaAvisos {
  return { ...memoria, vistos: recordar(memoria.vistos, ids) };
}

/** Lo que guarda este equipo no le avisa a él mismo. */
export function marcarAvisados(memoria: MemoriaAvisos, ids: readonly string[]): MemoriaAvisos {
  return { ...memoria, avisados: recordar(memoria.avisados, ids) };
}

export interface TextoAviso { titulo: string; mensaje?: string }

/** «Nuevo pedido de Bar Pepe · 6 líneas». */
export function textoAviso(p: Pick<PedidoEnCola, 'tipo' | 'numero' | 'cliente' | 'lineas'>): TextoAviso {
  return {
    titulo: `${p.tipo === 'pedido' ? 'Nuevo pedido' : 'Nuevo albarán'} de ${p.cliente} · ${numeroDeLineas(p.lineas.length)}`,
    mensaje: nombreDe(p),
  };
}

/**
 * Los avisos de una tanda. Hasta tres, uno por pedido; más, uno solo que
 * los resume: diez avisos apilados tapan la pantalla y no se leen.
 */
export function avisosDeTanda(pedidos: readonly PedidoEnCola[], max = 3): TextoAviso[] {
  if (pedidos.length <= max) return pedidos.map(textoAviso);
  const clientes = [...new Set(pedidos.map(p => p.cliente))];
  const nombres = clientes.slice(0, 3).join(', ') + (clientes.length > 3 ? ` y ${clientes.length - 3} más` : '');
  return [{ titulo: `${pedidos.length} pedidos nuevos para preparar`, mensaje: nombres }];
}

// ------------------------------------------------------------
// Guardar y leer (localStorage, que puede no estar)
// ------------------------------------------------------------

const esLista = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string');

export function leerMemoria(cuenta: string): MemoriaAvisos {
  try {
    const v = JSON.parse(localStorage.getItem(claveMemoria(cuenta)) ?? 'null');
    if (!v || typeof v !== 'object') return { ...MEMORIA_VACIA };
    return { iniciada: v.iniciada === true, avisados: esLista(v.avisados) ? v.avisados : [], vistos: esLista(v.vistos) ? v.vistos : [] };
  } catch {
    return { ...MEMORIA_VACIA };
  }
}

export function guardarMemoria(cuenta: string, memoria: MemoriaAvisos): void {
  try { localStorage.setItem(claveMemoria(cuenta), JSON.stringify(memoria)); } catch { /* sin almacenamiento: vale para esta visita */ }
}

/** Lo que este equipo quiere: el aviso en pantalla y el pitido, cada uno por su lado. */
export interface PreferenciasAviso { avisos: boolean; sonido: boolean }

export const CLAVE_PREFERENCIAS = 'klima-almacen-preferencias';
const POR_DEFECTO: PreferenciasAviso = { avisos: true, sonido: true };

export function leerPreferencias(): PreferenciasAviso {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE_PREFERENCIAS) ?? 'null');
    return { avisos: v?.avisos !== false, sonido: v?.sonido !== false };
  } catch {
    return { ...POR_DEFECTO };
  }
}

export function guardarPreferencias(p: PreferenciasAviso): void {
  try { localStorage.setItem(CLAVE_PREFERENCIAS, JSON.stringify(p)); } catch { /* sin almacenamiento */ }
}
