/**
 * LA FACTURA SIN TERMINAR, GUARDADA EN EL EQUIPO
 *
 * Se empieza una factura, suena el teléfono, se cierra la pestaña sin
 * querer o se va la batería, y al volver todo lo escrito ha desaparecido.
 * Mientras se rellena una factura NUEVA, lo que se lleva se copia aquí
 * cada poco (en el almacenamiento del navegador, en este equipo) y al
 * volver a «Nueva factura» se ofrece recuperarlo o descartarlo.
 *
 *   · Una copia por cuenta: la clave lleva el id del usuario, así que en
 *     un ordenador compartido nadie ve la factura a medias de otra cuenta.
 *   · Sólo facturas nuevas. Una que ya existe se edita sobre la suya, y
 *     una copia aquí acabaría pisando cambios hechos después en otro
 *     equipo. Por eso la copia no lleva id de factura: recuperarla siempre
 *     crea una nueva.
 *   · Se borra al guardar el borrador o al emitir: ya está en su sitio.
 *   · Caduca a los 30 días. Una factura a medias de hace dos meses es más
 *     un estorbo que una ayuda.
 *
 * El almacenamiento puede no estar (ventana privada, cuota llena, bloqueado
 * por el navegador): cada acceso va en try/catch y, si falla, simplemente
 * no se guarda. Nunca rompe la pantalla.
 */

import type { InvoiceLineItem, PaymentMethod } from './types';
import type { ClienteManual } from './plantillas/datos';

const PREFIJO = 'facturaSinTerminar:';
export const VERSION_BORRADOR = 1;
export const CADUCA_DIAS = 30;

export interface BorradorFactura {
  version: number;
  /** Cuándo se guardó, en ISO. */
  guardado: string;
  clientId: string;
  /** Para el aviso, aunque la ficha ya no esté en la lista. */
  clienteNombre: string;
  clienteOcasional: boolean;
  clienteManual: ClienteManual;
  issueDate: string;
  dueDate: string;
  paymentMethod: PaymentMethod;
  notes: string;
  globalDiscounts: [number, number, number];
  lineItems: InvoiceLineItem[];
  datosExtras: Record<string, string>;
  cobradaAlEmitir: boolean;
  /** El total cuando se guardó, para decirlo en el aviso sin recalcular. */
  total: number;
}

/** Lo justo de `Storage` que hace falta (así se prueba sin navegador). */
export type Almacen = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** El almacenamiento del navegador, o `null` si no lo hay o no deja usarlo. */
export function almacenDelNavegador(): Almacen | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function claveBorrador(cuentaId: string): string {
  return `${PREFIJO}${cuentaId}`;
}

/** Las líneas que llevan algo (un artículo o un concepto escrito). */
export function lineasConContenido(lineas: readonly InvoiceLineItem[]): InvoiceLineItem[] {
  return lineas.filter(l => l.productId || l.productName?.trim());
}

/**
 * ¿Merece la pena guardarlo? Una pantalla recién abierta, con su línea en
 * blanco, no: si no, el aviso saldría cada vez que se entra y se sale.
 */
export function tieneContenido(b: Pick<BorradorFactura, 'lineItems' | 'clientId' | 'clienteManual' | 'notes'>): boolean {
  return lineasConContenido(b.lineItems).length > 0
    || !!b.clientId
    || !!b.clienteManual?.nombre?.trim()
    || !!b.notes?.trim();
}

export function guardarBorrador(almacen: Almacen | null, cuentaId: string | null, b: BorradorFactura): boolean {
  if (!almacen || !cuentaId) return false;
  try {
    if (!tieneContenido(b)) {
      almacen.removeItem(claveBorrador(cuentaId));
      return false;
    }
    almacen.setItem(claveBorrador(cuentaId), JSON.stringify(b));
    return true;
  } catch {
    // Sin sitio o sin permiso: esta vez no se guarda, y ya está.
    return false;
  }
}

/** La copia de esta cuenta, si la hay, es de esta versión y no ha caducado. */
export function leerBorrador(almacen: Almacen | null, cuentaId: string | null, ahora = new Date()): BorradorFactura | null {
  if (!almacen || !cuentaId) return null;
  let texto: string | null;
  try {
    texto = almacen.getItem(claveBorrador(cuentaId));
  } catch {
    return null;
  }
  if (!texto) return null;
  try {
    const b = JSON.parse(texto) as Partial<BorradorFactura>;
    const valido = b && typeof b === 'object' && b.version === VERSION_BORRADOR
      && Array.isArray(b.lineItems) && typeof b.guardado === 'string'
      && typeof b.issueDate === 'string' && typeof b.dueDate === 'string';
    if (!valido) {
      borrarBorrador(almacen, cuentaId);
      return null;
    }
    const edad = ahora.getTime() - new Date(b.guardado!).getTime();
    if (!(edad < CADUCA_DIAS * 86_400_000)) {
      borrarBorrador(almacen, cuentaId);
      return null;
    }
    const completo: BorradorFactura = {
      version: VERSION_BORRADOR,
      guardado: b.guardado!,
      clientId: typeof b.clientId === 'string' ? b.clientId : '',
      clienteNombre: typeof b.clienteNombre === 'string' ? b.clienteNombre : '',
      clienteOcasional: !!b.clienteOcasional,
      clienteManual: { nombre: '', nif: '', direccion: '', cp: '', ciudad: '', provincia: '', email: '', telefono: '', ...(b.clienteManual ?? {}) },
      issueDate: b.issueDate!,
      dueDate: b.dueDate!,
      paymentMethod: b.paymentMethod as PaymentMethod,
      notes: typeof b.notes === 'string' ? b.notes : '',
      globalDiscounts: Array.isArray(b.globalDiscounts) && b.globalDiscounts.length === 3
        ? b.globalDiscounts.map(n => Number(n) || 0) as [number, number, number]
        : [0, 0, 0],
      lineItems: b.lineItems!,
      datosExtras: b.datosExtras && typeof b.datosExtras === 'object' ? b.datosExtras : {},
      cobradaAlEmitir: !!b.cobradaAlEmitir,
      total: Number(b.total) || 0,
    };
    return tieneContenido(completo) ? completo : null;
  } catch {
    borrarBorrador(almacen, cuentaId);
    return null;
  }
}

export function borrarBorrador(almacen: Almacen | null, cuentaId: string | null): void {
  if (!almacen || !cuentaId) return;
  try {
    almacen.removeItem(claveBorrador(cuentaId));
  } catch {
    /* sin almacenamiento: no hay nada que borrar */
  }
}

/**
 * El aviso de recuperar, en una frase:
 * «Tienes una factura sin terminar para Bar Pepe (3 líneas, 245,00 €)».
 */
export function resumenBorrador(b: BorradorFactura): string {
  const para = b.clienteOcasional ? b.clienteManual.nombre.trim() : b.clienteNombre.trim();
  const n = lineasConContenido(b.lineItems).length;
  const lineas = n === 1 ? '1 línea' : `${n} líneas`;
  const total = b.total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });
  return `Tienes una factura sin terminar ${para ? `para ${para}` : 'sin cliente todavía'} (${lineas}, ${total})`;
}
