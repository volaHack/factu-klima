import { isTextEditableTarget } from './scanner';

/**
 * LOS ATAJOS DE TECLADO DE LA APLICACIÓN, EN UN SOLO SITIO
 *
 * Estaban en dos: la barra de gestión rápida escuchaba N y R, el armazón
 * escuchaba Ctrl+K, y los rótulos de los botones anunciaban además D y F,
 * que no los escuchaba nadie. Quien probaba D y no pasaba nada dejaba de
 * fiarse también de los que sí funcionaban.
 *
 * Por eso la lista y la decisión viven aquí: la barra saca de esta misma
 * lista lo que enseña en los rótulos, así que anunciar un atajo que no
 * existe deja de ser posible. Si mañana se añade uno, se añade aquí y
 * aparece solo en los rótulos y en el teclado a la vez.
 *
 * CUÁNDO NO DEBE DISPARARSE
 * -------------------------
 * Un atajo de una sola letra es cómodo y es peligroso: la misma tecla que
 * abre una factura nueva es la que se escribe en un nombre. Así que no se
 * dispara si se está escribiendo (incluido texto enriquecido y acentos a
 * medio componer), si hay una ventana modal abierta delante, o si hay
 * alguna tecla modificadora de por medio —Alt+F es el menú del navegador,
 * no nuestro atajo.
 */

export type AccionAtajo = 'panel' | 'facturas' | 'nueva-factura' | 'refrescar' | 'buscar';

/**
 * El aviso de «refresca los datos».
 *
 * La tecla la escucha el armazón, pero el icono que gira lo pinta la barra
 * de gestión rápida. En vez de subir ese estado hasta el armazón —que no
 * tiene por qué saber que existe una barra— se avisa por un evento y lo
 * recoge quien tenga algo que enseñar.
 */
export const EVENTO_REFRESCAR = 'atajo:refrescar';

/** Lo mismo para abrir el buscador desde un botón, sin fingir teclas. */
export const EVENTO_BUSCAR = 'atajo:buscar';

export interface Atajo {
  accion: AccionAtajo;
  /** Cómo se escribe en el rótulo del botón. */
  tecla: string;
  etiqueta: string;
  /** A dónde lleva, si es navegación. */
  href?: string;
}

export const ATAJOS: Atajo[] = [
  { accion: 'panel', tecla: 'D', etiqueta: 'Panel', href: '/dashboard' },
  { accion: 'facturas', tecla: 'F', etiqueta: 'Facturas', href: '/facturas' },
  { accion: 'nueva-factura', tecla: 'N', etiqueta: 'Nueva factura', href: '/facturas/nueva' },
  { accion: 'buscar', tecla: 'Ctrl+K', etiqueta: 'Búsqueda rápida' },
  { accion: 'refrescar', tecla: 'R', etiqueta: 'Actualizar datos' },
];

export function atajoDe(accion: AccionAtajo): Atajo {
  const encontrado = ATAJOS.find(a => a.accion === accion);
  if (!encontrado) throw new Error(`Atajo desconocido: ${accion}`);
  return encontrado;
}

/** Las letras sueltas, en minúscula, asociadas a su acción. */
const POR_LETRA: Record<string, AccionAtajo> = {
  d: 'panel',
  f: 'facturas',
  n: 'nueva-factura',
  r: 'refrescar',
};

export interface TeclaPulsada {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  /** Verdadero mientras se compone un carácter con el teclado (acentos, IME). */
  isComposing?: boolean;
}

export interface EntornoAtajo {
  /** El foco está en algo donde se escribe. */
  escribiendo: boolean;
  /** Hay una ventana modal abierta por delante. */
  hayModal: boolean;
}

/**
 * Qué hay que hacer con esta tecla, o nada.
 *
 * Es una función pura a propósito: así las reglas de cuándo NO disparar
 * —que son la parte delicada— se pueden probar una a una sin montar un
 * navegador.
 */
export function accionDeAtajo(e: TeclaPulsada, entorno: EntornoAtajo): AccionAtajo | null {
  // Acentos y teclados asiáticos: mientras se compone el carácter, la
  // tecla todavía no es una tecla, y en algunos navegadores llega como
  // «Process» o como la letra base.
  if (e.isComposing) return null;

  // Con una modal delante, el teclado es suyo. Navegar por detrás de un
  // diálogo abierto deja al usuario mirando una ventana que ya no
  // corresponde a la página que hay debajo.
  if (entorno.hayModal) return null;

  const conModificador = Boolean(e.ctrlKey || e.metaKey);

  // El único atajo con modificador. Éste sí vale mientras se escribe: es
  // la costumbre de todas partes, y Ctrl+K no se teclea sin querer.
  if (conModificador && !e.altKey && e.key.toLowerCase() === 'k') return 'buscar';

  // Cualquier otra combinación con modificador es del navegador o del
  // sistema: Ctrl+F busca en la página, Alt+F abre su menú. No se tocan.
  if (conModificador || e.altKey) return null;

  if (entorno.escribiendo) return null;

  return POR_LETRA[e.key.toLowerCase()] ?? null;
}

/** Igual que `accionDeAtajo`, pero leyendo el entorno del propio evento. */
export function accionDeEventoDeTeclado(e: KeyboardEvent): AccionAtajo | null {
  return accionDeAtajo(e, {
    escribiendo: isTextEditableTarget(e.target),
    hayModal: hayModalAbierta(),
  });
}

/**
 * ¿Hay un diálogo por delante?
 *
 * Se mira el DOM en vez de llevar un contador de modales abiertas porque
 * las hay de varias procedencias —las del programa, el modal de ayuda, el
 * de propina— y un contador se desincroniza en cuanto una se desmonta sin
 * avisar. Lo que está pintado es la única verdad que no miente.
 */
export function hayModalAbierta(): boolean {
  if (typeof document === 'undefined') return false;
  return document.querySelector('[role="dialog"], [role="alertdialog"], dialog[open]') !== null;
}
