/**
 * CAJAS, UNIDADES POR CAJA Y UNIDADES: LA LÍNEA DE UN MAYORISTA
 *
 * En distribución cada línea lleva tres números que se leen juntos:
 *
 *   CAJ.   cuántas cajas completas salen (puede no haber ninguna)
 *   U/C    cuántas unidades trae cada caja; es de la ficha del producto
 *   UDES.  cuántas unidades se entregan en total, que es lo que se cobra:
 *          UDES. × PRECIO (por unidad) = IMPORTE
 *
 * Lo normal es pedir cajas y que las unidades salgan solas (2 × 24 = 48),
 * pero se puede escribir sólo UDES. —una venta suelta— o cajas y además
 * unas sueltas (2 cajas de 24 + 3 = 51).
 *
 * Cómo se guarda: `quantity` son las UDES., `unitsPerPackage` la U/C y
 * `cajas` las cajas. Que `cajas` exista (aunque sea 0) es lo que dice que
 * la línea va por unidades.
 *
 * LÍNEAS DE ANTES
 * Hasta ahora `quantity` eran las cajas y no había `cajas`: doce cajas de
 * veinticuatro se guardaban como 12 con U/C 24, y el precio era por caja.
 * Esas líneas (ya emitidas casi todas) se siguen leyendo igual; sólo un
 * borrador que se vuelve a abrir se pasa a unidades, sin cambiar el
 * importe (ver `aLineaPorUnidades`).
 */

export interface LineaConCajas {
  quantity: number;
  unitsPerPackage?: number;
  cajas?: number | null;
  unitPrice: number;
}

export interface Desglose {
  /** Cajas completas, o null si no van por cajas. */
  cajas: number | null;
  /** Unidades por caja, o null si el producto no la tiene. */
  udsCaja: number | null;
  /** Unidades entregadas en total. */
  unidades: number;
  /** Unidades sueltas además de las cajas completas (0 si no hay). */
  sueltas: number;
}

const redondear = (n: number) => Math.round(n * 1000) / 1000;
const positivo = (n?: number | null) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0);

/** ¿Va esta línea por unidades (con su casilla de cajas)? */
export function vaPorUnidades(l: { cajas?: number | null }): boolean {
  return l.cajas !== undefined && l.cajas !== null;
}

export function desgloseLinea(l: { quantity: number; unitsPerPackage?: number; cajas?: number | null }): Desglose {
  const uc = positivo(l.unitsPerPackage);
  if (vaPorUnidades(l)) {
    const cajas = positivo(l.cajas);
    const unidades = Number(l.quantity) || 0;
    const sueltas = uc && cajas ? Math.max(0, redondear(unidades - cajas * uc)) : 0;
    return { cajas: cajas || null, udsCaja: uc || null, unidades, sueltas };
  }
  // Línea de antes: la cantidad eran las cajas.
  if (uc > 1) {
    return { cajas: Number(l.quantity) || 0, udsCaja: uc, unidades: redondear((Number(l.quantity) || 0) * uc), sueltas: 0 };
  }
  return { cajas: null, udsCaja: uc || null, unidades: Number(l.quantity) || 0, sueltas: 0 };
}

/** Unidades entregadas en todas las líneas. */
export function unidadesTotales(lineas: { quantity: number; unitsPerPackage?: number; cajas?: number | null }[]): number {
  return redondear(lineas.reduce((s, l) => s + desgloseLinea(l).unidades, 0));
}

/** Cajas completas en todas las líneas. */
export function cajasTotales(lineas: { quantity: number; unitsPerPackage?: number; cajas?: number | null }[]): number {
  return redondear(lineas.reduce((s, l) => s + (desgloseLinea(l).cajas ?? 0), 0));
}

/**
 * Cambia las cajas: las unidades pasan a ser cajas × U/C, conservando las
 * sueltas que ya hubiera (2 cajas + 3 sueltas → 3 cajas + 3 sueltas).
 * Sin U/C no se puede calcular y las unidades se quedan como estaban.
 */
export function conCajas<T extends LineaConCajas>(l: T, cajas: number): T {
  const nuevas = positivo(cajas);
  const uc = positivo(l.unitsPerPackage);
  if (!uc) return { ...l, cajas: nuevas };
  const { sueltas } = desgloseLinea(l);
  return { ...l, cajas: nuevas, quantity: redondear(nuevas * uc + sueltas) };
}

/** Cambia las unidades por caja: con cajas puestas, recalcula las unidades. */
export function conUdsCaja<T extends LineaConCajas>(l: T, udsCaja: number): T {
  const uc = positivo(udsCaja);
  const antes = desgloseLinea(l);
  const cajas = positivo(l.cajas);
  const siguiente = { ...l, unitsPerPackage: uc || undefined };
  if (!uc || !cajas) return siguiente;
  return { ...siguiente, quantity: redondear(cajas * uc + antes.sueltas) };
}

/**
 * Cambia las unidades a mano. Si ya no llegan para las cajas puestas, las
 * cajas bajan a las que caben completas: 45 unidades con 2 cajas de 24
 * son 1 caja y 21 sueltas.
 */
export function conUnidades<T extends LineaConCajas>(l: T, unidades: number): T {
  const udes = Math.max(0, Number(unidades) || 0);
  const uc = positivo(l.unitsPerPackage);
  const cajas = positivo(l.cajas);
  if (uc && cajas && udes < cajas * uc) {
    return { ...l, quantity: udes, cajas: Math.floor(udes / uc) };
  }
  return { ...l, quantity: udes };
}

/**
 * Una línea de antes (cantidad = cajas, precio por caja) pasada a unidades
 * sin cambiar lo que cuesta: 12 cajas de 24 a 30 € son 288 unidades a
 * 1,25 €. Las que ya van por unidades, o no tienen U/C, no cambian (salvo
 * ponerles la casilla de cajas).
 */
export function aLineaPorUnidades<T extends LineaConCajas>(l: T): T {
  if (vaPorUnidades(l)) return l;
  const uc = positivo(l.unitsPerPackage);
  if (uc > 1) {
    return { ...l, cajas: Number(l.quantity) || 0, quantity: redondear((Number(l.quantity) || 0) * uc), unitPrice: l.unitPrice / uc };
  }
  return { ...l, cajas: 0 };
}

/** «2 cajas × 24 + 3 sueltas = 51 unidades», para el pie de cada línea. */
export function explicarLinea(l: { quantity: number; unitsPerPackage?: number; cajas?: number | null }): string | null {
  const d = desgloseLinea(l);
  if (!d.cajas || !d.udsCaja) return null;
  const cajas = `${d.cajas} ${d.cajas === 1 ? 'caja' : 'cajas'} × ${d.udsCaja}`;
  return d.sueltas > 0
    ? `${cajas} + ${d.sueltas} ${d.sueltas === 1 ? 'suelta' : 'sueltas'} = ${d.unidades} unidades`
    : `${cajas} = ${d.unidades} unidades`;
}
