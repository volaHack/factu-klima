/**
 * PACKS DE LÍNEAS: «PEDIDO SEMANAL HOTEL», «SURTIDO BAR»
 *
 * Hay pedidos que no son de un cliente sino de un tipo de cliente: el
 * surtido con el que se abre un bar nuevo, la reposición semanal de los
 * hoteles de la zona, la caja de Navidad. Se guardan las líneas de un
 * documento como un pack con nombre y después se meten enteras de un
 * toque, con sus cantidades, en cualquier factura, albarán, pedido o
 * presupuesto; luego se ajusta lo que cambie.
 *
 *   · Se guardan los artículos y las cantidades (y las cajas). El precio y
 *     los descuentos no: al meter el pack se ponen los que tocan HOY a ese
 *     cliente, igual que «Lo mismo que la última vez» (repetirPedido.ts),
 *     que es quien monta las líneas. Las líneas escritas a mano (un porte)
 *     sí guardan su precio, porque no tienen ficha de la que sacarlo.
 *   · Viven en este navegador y por cuenta, como lo fijado con la estrella
 *     (memoriaFichas.ts): sin cambiar la base de datos, y en un equipo
 *     compartido cada empresa ve los suyos. Sin almacenamiento (ventana
 *     privada) no se guardan, y el resto sigue igual.
 */

import type { InvoiceLineItem, Product } from './types';
import { lineasDeOtraVez, type Condiciones, type LineaAnterior } from './repetirPedido';

export interface PackLineas {
  id: string;
  nombre: string;
  lineas: LineaAnterior[];
  /** Cuándo se guardó (ms). */
  creado: number;
}

export const MAX_PACKS = 30;
export const MAX_LINEAS_PACK = 200;

/** Se avisa al guardar o borrar, para que otros editores abiertos se repinten. */
export const EVENTO_PACKS = 'klima-packs-lineas';

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

export function claveDePacks(cuenta: string | null): string {
  return `klima-packs-lineas:${cuenta ?? 'sin-sesion'}`;
}

const numero = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);

/** Lo leído se revisa entero: el almacén lo puede tocar cualquiera. */
function lineaValida(x: unknown): LineaAnterior | null {
  if (!x || typeof x !== 'object') return null;
  const l = x as Record<string, unknown>;
  if (typeof l.productId !== 'string' || typeof l.productName !== 'string') return null;
  if (!(numero(l.quantity) > 0)) return null;
  return {
    productId: l.productId,
    productName: l.productName.slice(0, 300),
    productRef: typeof l.productRef === 'string' ? l.productRef.slice(0, 100) : '',
    quantity: numero(l.quantity),
    ...(typeof l.cajas === 'number' ? { cajas: numero(l.cajas) } : {}),
    ...(numero(l.unitsPerPackage) > 0 ? { unitsPerPackage: numero(l.unitsPerPackage) } : {}),
    unitPrice: numero(l.unitPrice),
    taxRate: numero(l.taxRate),
    unit: (typeof l.unit === 'string' ? l.unit : 'ud') as LineaAnterior['unit'],
    discountPercent: numero(l.discountPercent),
    discountPercent2: numero(l.discountPercent2),
    discountPercent3: numero(l.discountPercent3),
  };
}

function packValido(x: unknown): PackLineas | null {
  if (!x || typeof x !== 'object') return null;
  const p = x as Record<string, unknown>;
  if (typeof p.id !== 'string' || typeof p.nombre !== 'string' || !p.nombre.trim() || !Array.isArray(p.lineas)) return null;
  const lineas = p.lineas.map(lineaValida).filter((l): l is LineaAnterior => !!l).slice(0, MAX_LINEAS_PACK);
  if (!lineas.length) return null;
  return { id: p.id, nombre: p.nombre.trim().slice(0, 80), lineas, creado: numero(p.creado) };
}

export function leerPacks(cuenta: string | null, almacen: AlmacenTexto | null = almacenDelNavegador()): PackLineas[] {
  if (!almacen) return [];
  try {
    const v = JSON.parse(almacen.getItem(claveDePacks(cuenta)) ?? 'null');
    return Array.isArray(v) ? v.map(packValido).filter((p): p is PackLineas => !!p).slice(0, MAX_PACKS) : [];
  } catch {
    return [];
  }
}

/** Guarda la lista entera. false si no se ha podido (sin almacén, o lleno). */
export function escribirPacks(cuenta: string | null, packs: readonly PackLineas[], almacen: AlmacenTexto | null = almacenDelNavegador()): boolean {
  if (!almacen) return false;
  try {
    almacen.setItem(claveDePacks(cuenta), JSON.stringify(packs.slice(0, MAX_PACKS)));
  } catch {
    return false;
  }
  try {
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENTO_PACKS));
  } catch { /* sin ventana (pruebas) */ }
  return true;
}

/** Las líneas del documento que tienen algo, pasadas a líneas de pack. */
export function lineasParaPack(lineas: readonly InvoiceLineItem[]): LineaAnterior[] {
  return lineas
    .filter(l => (Number(l.quantity) || 0) > 0 && (l.productId || l.productName?.trim()))
    .slice(0, MAX_LINEAS_PACK)
    .map(l => ({
      productId: l.productId || '',
      productName: l.productName,
      productRef: l.productRef ?? '',
      quantity: Number(l.quantity) || 0,
      ...(l.cajas != null ? { cajas: l.cajas } : {}),
      ...(l.unitsPerPackage ? { unitsPerPackage: l.unitsPerPackage } : {}),
      // El precio solo cuenta en las escritas a mano (ver arriba).
      unitPrice: l.productId ? 0 : Number(l.unitPrice) || 0,
      taxRate: Number(l.taxRate) || 0,
      unit: l.unit,
      discountPercent: l.productId ? 0 : l.discountPercent || 0,
      discountPercent2: l.productId ? 0 : l.discountPercent2 || 0,
      discountPercent3: l.productId ? 0 : l.discountPercent3 || 0,
    }));
}

const mismoNombre = (a: string, b: string) => a.trim().localeCompare(b.trim(), 'es', { sensitivity: 'base' }) === 0;

/**
 * La lista con un pack nuevo delante. Con el mismo nombre que otro, lo
 * sustituye (es «guardar otra vez el pedido semanal»). null si no hay
 * nombre o no hay líneas que guardar.
 */
export function conPackNuevo(
  packs: readonly PackLineas[],
  nombre: string,
  lineas: readonly InvoiceLineItem[],
  ahora = Date.now(),
  id: string = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `pack-${ahora}`,
): PackLineas[] | null {
  const limpio = nombre.trim().slice(0, 80);
  const deLineas = lineasParaPack(lineas);
  if (!limpio || !deLineas.length) return null;
  const anterior = packs.find(p => mismoNombre(p.nombre, limpio));
  const pack: PackLineas = { id: anterior?.id ?? id, nombre: limpio, lineas: deLineas, creado: ahora };
  return [pack, ...packs.filter(p => p !== anterior)].slice(0, MAX_PACKS);
}

export function sinPack(packs: readonly PackLineas[], id: string): PackLineas[] {
  return packs.filter(p => p.id !== id);
}

/** ¿Ya hay un pack con ese nombre? (para decir «se sustituirá»). */
export function packConNombre(packs: readonly PackLineas[], nombre: string): PackLineas | undefined {
  return nombre.trim() ? packs.find(p => mismoNombre(p.nombre, nombre)) : undefined;
}

/**
 * Las líneas de un pack para meterlas en un documento, con los precios de
 * hoy. Lo que ya no está de alta no entra, y se dice cuál.
 */
export function lineasDePack(
  pack: PackLineas,
  articulos: readonly Product[],
  condiciones: (p: Product) => Condiciones,
  nueva: () => InvoiceLineItem,
): { lineas: InvoiceLineItem[]; sinFicha: string[] } {
  return lineasDeOtraVez(
    { id: pack.id, tipo: 'pedido', numero: pack.nombre, fecha: '', creado: '', lineas: pack.lineas },
    articulos,
    condiciones,
    nueva,
  );
}

/** «12 líneas · 30 cajas», para el botón de cada pack. */
export function resumenPack(pack: PackLineas): string {
  const n = pack.lineas.length;
  const cajas = pack.lineas.reduce((s, l) => s + (l.cajas ?? 0), 0);
  const lineas = n === 1 ? '1 línea' : `${n} líneas`;
  return cajas > 0 ? `${lineas} · ${cajas.toLocaleString('es-ES')} ${cajas === 1 ? 'caja' : 'cajas'}` : lineas;
}
