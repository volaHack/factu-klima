/**
 * LO QUE SE COMPRUEBA DE CADA LÍNEA ANTES DE GUARDAR O EMITIR
 *
 *   · Cajas sin unidades por caja: no se puede saber cuántas unidades son.
 *   · Una línea con producto y sin unidades (o sin precio, ni siquiera 0
 *     a propósito) se queda en el papel como un hueco.
 *   · Un tipo de impuesto que no existe en el régimen de la empresa: un 21 %
 *     con IGIC es un IVA metido por error (el general del IGIC es el 7 %).
 *     No para —hay casos raros—, pero se avisa antes de emitir.
 */

import { desgloseLinea, vaPorUnidades } from '../cajas';

export interface ProblemaLinea {
  gravedad: 'error' | 'aviso';
  linea: number;
  mensaje: string;
}

interface LineaAComprobar {
  productName?: string;
  productId?: string;
  quantity: number;
  unitsPerPackage?: number;
  cajas?: number | null;
  unitPrice: number;
  taxRate: number;
}

interface Regimen {
  igicEnabled?: boolean;
  ivaRates?: number[];
  igicRates?: number[];
}

/** Los tipos que existen en cada régimen (más los que la empresa haya puesto en Ajustes). */
const IGIC_VIGENTES = [0, 3, 5, 7, 9.5, 13, 15, 20];
const IVA_VIGENTES = [0, 2, 4, 5, 7.5, 10, 21];

export function tiposValidos(r: Regimen | null | undefined): number[] {
  const base = r?.igicEnabled ? IGIC_VIGENTES : IVA_VIGENTES;
  const propios = (r?.igicEnabled ? r?.igicRates : r?.ivaRates) ?? [];
  return [...new Set([...base, ...propios])].sort((a, b) => a - b);
}

/** El tipo general del régimen, para ofrecerlo al corregir. */
export function tipoGeneral(r: Regimen | null | undefined): number {
  return r?.igicEnabled ? 7 : 21;
}

/** Si el tipo no existe en el régimen de la empresa, por qué; si existe, null. */
export function tipoImpositivoRaro(tipo: number, r: Regimen | null | undefined): string | null {
  if (tiposValidos(r).includes(Number(tipo))) return null;
  const nombre = r?.igicEnabled ? 'IGIC' : 'IVA';
  if (r?.igicEnabled && [21, 10, 4].includes(Number(tipo))) {
    return `El ${tipo} % es un tipo de IVA, no de IGIC. En Canarias el general es el 7 %.`;
  }
  if (!r?.igicEnabled && [7, 3, 9.5, 15].includes(Number(tipo))) {
    return `El ${tipo} % es un tipo de IGIC. Si facturas en Canarias, actívalo en Ajustes; si no, el general del IVA es el 21 %.`;
  }
  return `El ${tipo} % no es un tipo de ${nombre} vigente.`;
}

export function problemasDeLineas(lineas: LineaAComprobar[], r: Regimen | null | undefined): ProblemaLinea[] {
  const problemas: ProblemaLinea[] = [];
  lineas.forEach((l, i) => {
    const n = i + 1;
    const nombre = l.productName?.trim() ? `«${l.productName.trim()}»` : `la línea ${n}`;
    const d = desgloseLinea(l);
    if (vaPorUnidades(l) && (l.cajas ?? 0) > 0 && !d.udsCaja) {
      problemas.push({ gravedad: 'error', linea: n, mensaje: `En ${nombre} hay cajas pero falta cuántas unidades trae cada una (U/C).` });
    }
    if (!(Number(l.quantity) > 0)) {
      problemas.push({ gravedad: 'error', linea: n, mensaje: `En ${nombre} faltan las unidades.` });
    }
    if (!(Number(l.unitPrice) >= 0)) {
      problemas.push({ gravedad: 'error', linea: n, mensaje: `En ${nombre} el precio no es válido.` });
    }
    const raro = tipoImpositivoRaro(l.taxRate, r);
    if (raro) problemas.push({ gravedad: 'aviso', linea: n, mensaje: `${nombre[0].toUpperCase()}${nombre.slice(1)}: ${raro}` });
  });
  return problemas;
}
