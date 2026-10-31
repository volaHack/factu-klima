/**
 * GASTOS QUE SE RELLENAN SOLOS
 *
 * La factura de la luz es de suministros, va al 7 % de IGIC y se paga por
 * domiciliación; la del gestor, de servicios y por transferencia. Así cada
 * mes. Al elegir el proveedor de un gasto se propone lo de la última vez
 * con él, y si el importe se sale mucho de lo de siempre se avisa: una
 * factura de luz del triple casi siempre es una coma mal puesta o una
 * lectura estimada que hay que reclamar.
 *
 * Mira los gastos registrados y, para la forma de pago y el importe, también
 * las facturas de compra a ese proveedor (lo que se le compra es tan suyo
 * como lo que se le paga de gasto). Sólo propone: la pantalla no pisa lo
 * que ya se haya cambiado a mano.
 */

import type { Gasto, GastoCategoria, Invoice, PaymentMethod } from './types';

export interface ProveedorBuscado {
  id?: string;
  nombre?: string;
}

const plano = (t?: string) => (t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** ¿Es de este proveedor? Por la ficha y, si no hay ficha, por el nombre. */
function esDe(p: ProveedorBuscado, id?: string, nombre?: string): boolean {
  if (p.id && id) return p.id === id;
  const n = plano(p.nombre);
  return !!n && n === plano(nombre);
}

export interface HabitoProveedor {
  /** Lo del último gasto con él (null si sólo hay compras). */
  categoria: GastoCategoria | null;
  taxRate: number | null;
  paymentMethod: PaymentMethod | null;
  /** Fecha y concepto del último, para decir de dónde sale. */
  ultimaFecha: string;
  ultimoConcepto: string;
  /** Las bases de antes, de la más reciente a la más antigua (hasta 12). */
  bases: number[];
}

/** Cuántos registros anteriores hacen falta para hablar de «lo habitual». */
export const MINIMO_HABITUAL = 3;

/**
 * Lo de siempre con un proveedor, o null si nunca se le ha registrado nada.
 *
 * La categoría y el impuesto salen del último GASTO (una factura de compra
 * lleva varios tipos y no tiene categoría de gasto). La forma de pago, del
 * más reciente de los dos. Se deja fuera el que se está editando.
 */
export function habitoProveedor(
  proveedor: ProveedorBuscado,
  gastos: readonly Gasto[],
  compras: readonly Invoice[] = [],
  excluirId?: string,
): HabitoProveedor | null {
  if (!proveedor.id && !plano(proveedor.nombre)) return null;
  const suyos = gastos
    .filter(g => g.id !== excluirId && esDe(proveedor, g.proveedorId, g.proveedorNombre))
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  const facturas = compras
    .filter(f => f.id !== excluirId && f.sentido === 'compra' && (f.tipo ?? 'factura') === 'factura')
    .filter(f => f.status !== 'borrador' && f.status !== 'anulada' && !f.cancelledAt)
    .filter(f => esDe(proveedor, f.clientId || undefined, f.clientName))
    .sort((a, b) => b.issueDate.localeCompare(a.issueDate));
  if (!suyos.length && !facturas.length) return null;

  const gasto = suyos[0];
  const factura = facturas[0];
  const masReciente = !gasto ? 'factura' : !factura ? 'gasto' : factura.issueDate > gasto.fecha ? 'factura' : 'gasto';

  const bases = [
    ...suyos.map(g => ({ fecha: g.fecha, base: g.baseImponible })),
    ...facturas.map(f => ({ fecha: f.issueDate, base: f.subtotal })),
  ]
    .filter(x => Number.isFinite(x.base) && x.base > 0)
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .slice(0, 12)
    .map(x => x.base);

  return {
    categoria: gasto?.categoria ?? null,
    taxRate: gasto ? gasto.taxRate : null,
    paymentMethod: (masReciente === 'gasto' ? gasto?.paymentMethod : factura?.paymentMethod) ?? null,
    ultimaFecha: masReciente === 'gasto' ? gasto.fecha : factura.issueDate,
    ultimoConcepto: masReciente === 'gasto' ? gasto.concepto : `Factura ${factura.number}`,
    bases,
  };
}

function mediana(valores: readonly number[]): number {
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export interface AvisoImporte {
  habitual: number;
  /** Cuántas veces lo habitual (2,8 = casi el triple). */
  veces: number;
  texto: string;
}

const euros = (n: number) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });

/**
 * ¿Se sale este importe de lo habitual?
 *
 * Se compara con la MEDIANA de los anteriores, que no se mueve por una
 * factura rara, y hacen falta al menos tres para que haya algo habitual.
 * Se avisa a partir del doble o por debajo de la mitad; por debajo de 20 €
 * de diferencia, no: un ticket de 8 € frente a uno de 3 € no es noticia.
 */
export function avisoImporte(base: number, bases: readonly number[], nombre = 'este proveedor'): AvisoImporte | null {
  if (!(base > 0) || bases.length < MINIMO_HABITUAL) return null;
  const habitual = mediana(bases);
  if (!(habitual > 0) || Math.abs(base - habitual) < 20) return null;
  const veces = base / habitual;
  if (veces < 2 && veces > 0.5) return null;
  const cuanto = veces >= 2.5
    ? `${(Math.round(veces * 10) / 10).toLocaleString('es-ES')} veces`
    : veces >= 2 ? 'el doble de' : 'menos de la mitad de';
  return {
    habitual: Math.round(habitual * 100) / 100,
    veces,
    texto: `Es ${cuanto} lo habitual con ${nombre} (suele rondar ${euros(habitual)} de base). Revisa el importe antes de guardar.`,
  };
}

export type CampoGasto = 'categoria' | 'taxRate' | 'paymentMethod';

export interface PropuestaGasto {
  campo: CampoGasto;
  valor: GastoCategoria | number | PaymentMethod;
}

/**
 * Lo que se propone poner en el formulario, sin lo que ya coincide.
 * `aplicarSolas` son las de los campos que nadie ha tocado: ésas se ponen
 * directamente; las otras quedan como sugerencia de un toque.
 */
export function propuestasGasto(
  habito: HabitoProveedor,
  actual: { categoria: GastoCategoria; taxRate: number; paymentMethod: PaymentMethod },
  tocados: ReadonlySet<CampoGasto> = new Set(),
): { aplicarSolas: PropuestaGasto[]; sugeridas: PropuestaGasto[] } {
  const todas: PropuestaGasto[] = [];
  if (habito.categoria && habito.categoria !== actual.categoria) todas.push({ campo: 'categoria', valor: habito.categoria });
  if (habito.taxRate !== null && habito.taxRate !== actual.taxRate) todas.push({ campo: 'taxRate', valor: habito.taxRate });
  if (habito.paymentMethod && habito.paymentMethod !== actual.paymentMethod) todas.push({ campo: 'paymentMethod', valor: habito.paymentMethod });
  return {
    aplicarSolas: todas.filter(p => !tocados.has(p.campo)),
    sugeridas: todas.filter(p => tocados.has(p.campo)),
  };
}
