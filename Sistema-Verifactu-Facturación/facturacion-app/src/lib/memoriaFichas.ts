/**
 * LO ÚLTIMO QUE SE ABRIÓ Y LO FIJADO CON LA ESTRELLA
 *
 * Quien factura vuelve diez veces al día a las mismas cinco fichas: el
 * cliente de siempre, la factura que está a medias, el artículo que más
 * se vende. Aquí se recuerdan las últimas abiertas (facturas, documentos,
 * clientes, productos) y las que se fijan a mano; salen nada más abrir el
 * buscador y en el menú lateral, a un toque.
 *
 * Vive en este navegador y por cuenta: en un ordenador compartido, o con la
 * gestoría que entra en varias empresas, cada cual ve lo suyo. Sin
 * almacenamiento (ventana privada, bloqueado) simplemente no se recuerda
 * nada y todo lo demás sigue igual.
 */

export type TipoFicha = 'factura' | 'documento' | 'cliente' | 'producto' | 'pantalla';

export interface FichaRecordada {
  /** Única por ficha: «factura:ID», «cliente:ID»… */
  clave: string;
  tipo: TipoFicha;
  titulo: string;
  detalle?: string;
  href: string;
  /** Cuándo se abrió por última vez (ms). */
  cuando: number;
}

export interface Memoria {
  recientes: FichaRecordada[];
  fijadas: FichaRecordada[];
}

export const MAX_RECIENTES = 10;
export const MAX_FIJADAS = 12;

/** Se avisa al recordar o fijar, para que el menú y el buscador se repinten. */
export const EVENTO_MEMORIA = 'klima-fichas-recordadas';

export interface AlmacenTexto {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
}

function almacenDelNavegador(): AlmacenTexto | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function claveMemoria(cuenta: string | null): string {
  return `klima-fichas:${cuenta ?? 'sin-sesion'}`;
}

const TIPOS: readonly TipoFicha[] = ['factura', 'documento', 'cliente', 'producto', 'pantalla'];

/**
 * Lo leído se revisa entero: viene de un sitio que cualquiera puede tocar,
 * y un enlace que no empiece por «/» (un `javascript:`) no se pinta nunca.
 */
function valida(x: unknown): x is FichaRecordada {
  if (!x || typeof x !== 'object') return false;
  const f = x as Record<string, unknown>;
  return typeof f.clave === 'string' && typeof f.titulo === 'string' && typeof f.href === 'string'
    && f.href.startsWith('/') && !f.href.startsWith('//')
    && TIPOS.includes(f.tipo as TipoFicha) && typeof f.cuando === 'number';
}

const VACIA: Memoria = { recientes: [], fijadas: [] };

export function leerMemoria(cuenta: string | null, almacen: AlmacenTexto | null = almacenDelNavegador()): Memoria {
  if (!almacen) return VACIA;
  try {
    const v = JSON.parse(almacen.getItem(claveMemoria(cuenta)) ?? 'null');
    if (!v || typeof v !== 'object') return VACIA;
    return {
      recientes: (Array.isArray(v.recientes) ? v.recientes.filter(valida) : []).slice(0, MAX_RECIENTES),
      fijadas: (Array.isArray(v.fijadas) ? v.fijadas.filter(valida) : []).slice(0, MAX_FIJADAS),
    };
  } catch {
    return VACIA;
  }
}

function guardar(cuenta: string | null, memoria: Memoria, almacen: AlmacenTexto | null): Memoria {
  try {
    almacen?.setItem(claveMemoria(cuenta), JSON.stringify(memoria));
  } catch { /* lleno o bloqueado: vale para esta vez */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENTO_MEMORIA));
  return memoria;
}

/**
 * Apunta que se acaba de abrir. Sube arriba del todo si ya estaba, y si está
 * fijada se le refresca el título (una factura que pasó de borrador a su
 * número definitivo).
 */
export function recordarFicha(
  cuenta: string | null,
  ficha: Omit<FichaRecordada, 'cuando'>,
  ahora = Date.now(),
  almacen: AlmacenTexto | null = almacenDelNavegador(),
): Memoria {
  const nueva = { ...ficha, cuando: ahora };
  if (!valida(nueva)) return leerMemoria(cuenta, almacen);
  const m = leerMemoria(cuenta, almacen);
  return guardar(cuenta, {
    recientes: [nueva, ...m.recientes.filter(r => r.clave !== ficha.clave)].slice(0, MAX_RECIENTES),
    fijadas: m.fijadas.map(f => (f.clave === ficha.clave ? { ...nueva, cuando: f.cuando } : f)),
  }, almacen);
}

export function estaFijada(memoria: Memoria, clave: string): boolean {
  return memoria.fijadas.some(f => f.clave === clave);
}

/**
 * Pone o quita la estrella. Fijadas hay un máximo: con la lista llena, la
 * nueva entra y sale la fijada hace más tiempo.
 */
export function alternarFijada(
  cuenta: string | null,
  ficha: Omit<FichaRecordada, 'cuando'>,
  ahora = Date.now(),
  almacen: AlmacenTexto | null = almacenDelNavegador(),
): Memoria {
  const m = leerMemoria(cuenta, almacen);
  if (estaFijada(m, ficha.clave)) {
    return guardar(cuenta, { ...m, fijadas: m.fijadas.filter(f => f.clave !== ficha.clave) }, almacen);
  }
  const nueva = { ...ficha, cuando: ahora };
  if (!valida(nueva)) return m;
  return guardar(cuenta, { ...m, fijadas: [nueva, ...m.fijadas].slice(0, MAX_FIJADAS) }, almacen);
}

/** Lo que se borra deja de salir (si se deshace el borrado, vuelve al abrirlo). */
export function olvidarFicha(cuenta: string | null, clave: string, almacen: AlmacenTexto | null = almacenDelNavegador()): Memoria {
  const m = leerMemoria(cuenta, almacen);
  if (!m.recientes.some(r => r.clave === clave) && !estaFijada(m, clave)) return m;
  return guardar(cuenta, {
    recientes: m.recientes.filter(r => r.clave !== clave),
    fijadas: m.fijadas.filter(f => f.clave !== clave),
  }, almacen);
}

/**
 * ¿Es esta dirección la ficha de algo que merezca recordarse? Las pantallas
 * de crear («nueva», «nuevo») y las listas no lo son.
 */
export function fichaDeRuta(pathname: string): { tipo: 'factura' | 'documento' | 'cliente'; id: string } | null {
  const m = /^\/(facturas|documentos|clientes)\/([^/?#]+)(?:\/editar)?\/?$/.exec(pathname);
  if (!m) return null;
  const [, seccion, id] = m;
  const reservadas: Record<string, string[]> = {
    facturas: ['nueva', 'recurrentes'],
    documentos: ['nuevo', 'historico'],
    clientes: ['nuevo'],
  };
  if (reservadas[seccion].includes(id)) return null;
  return { tipo: seccion === 'facturas' ? 'factura' : seccion === 'documentos' ? 'documento' : 'cliente', id: decodeURIComponent(id) };
}
