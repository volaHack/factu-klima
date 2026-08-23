/**
 * TRAZABILIDAD ALIMENTARIA
 *
 * No es una función más: es la que responde cuando llega un aviso de la
 * Agencia Española de Seguridad Alimentaria diciendo que el lote L-4471 de
 * un proveedor está contaminado. En ese momento hay que saber, en minutos y
 * sin margen de error, a QUÉ CLIENTES se les ha servido algo de ese lote —y
 * poder demostrar que la lista está completa.
 *
 * Por eso cada función de aquí es deliberadamente simple y literal: nada de
 * heurísticas ni de aproximaciones. O la línea lleva el lote marcado, o no
 * cuenta. Preferir un falso negativo aquí —dejarse un cliente fuera de la
 * lista— es exactamente lo que no se puede permitir.
 */

import type { Invoice, InvoiceLineItem, Lote } from './types';

export interface EntregaDeLote {
  invoiceId: string;
  number: string;
  fecha: string;
  clientId: string;
  clientName: string;
  cantidad: number;
}

/**
 * A quién se le ha servido algo de este lote. LA función de la alerta
 * sanitaria.
 *
 * Sólo mira facturas y albaranes de VENTA que de verdad han salido —no
 * presupuestos, no pedidos, no borradores—: lo que no ha salido de puerta no
 * hay que retirarlo de ningún sitio, y contarlo daría una lista más larga de
 * la real, que también es un error de cara a una inspección.
 */
export function trazabilidadDeLote(loteId: string, invoices: Invoice[]): EntregaDeLote[] {
  const entregas: EntregaDeLote[] = [];

  for (const inv of invoices) {
    if ((inv.sentido ?? 'venta') !== 'venta') continue;
    const tipo = inv.tipo ?? 'factura';
    if (tipo === 'presupuesto' || tipo === 'pedido') continue;
    if (inv.status === 'borrador' || inv.status === 'anulada') continue;

    for (const li of inv.lineItems ?? []) {
      if (li.loteId !== loteId) continue;
      entregas.push({
        invoiceId: inv.id,
        number: inv.number,
        fecha: inv.issueDate,
        clientId: inv.clientId,
        clientName: inv.clientName,
        cantidad: li.quantity,
      });
    }
  }

  return entregas.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/** Cuánto se ha servido de un lote en total, y a cuántos clientes distintos. */
export function resumenDeLote(loteId: string, invoices: Invoice[]): { unidades: number; clientes: number } {
  const entregas = trazabilidadDeLote(loteId, invoices);
  return {
    unidades: entregas.reduce((s, e) => s + e.cantidad, 0),
    clientes: new Set(entregas.map(e => e.clientId)).size,
  };
}

/**
 * Los lotes disponibles de un producto, el que caduca antes primero.
 *
 * FEFO —first expired, first out—: es la norma en alimentación, y es lo que
 * se sugiere por defecto al elegir de qué lote sale una venta. Un lote sin
 * caducidad se manda al final: no urge sacarlo.
 */
export function lotesDisponibles(lotes: Lote[], productId: string): Lote[] {
  return lotes
    .filter(l => l.productId === productId && l.cantidadDisponible > 0)
    .sort((a, b) => {
      if (!a.fechaCaducidad && !b.fechaCaducidad) return 0;
      if (!a.fechaCaducidad) return 1;
      if (!b.fechaCaducidad) return -1;
      return a.fechaCaducidad.localeCompare(b.fechaCaducidad);
    });
}

export interface ResultadoConsumo {
  cantidadDisponible: number;
  /** Se ha pedido más de lo que quedaba: el lote se vacía y sobra esta cantidad sin poder salir de él. */
  faltante: number;
}

/** Descuenta una venta de un lote. Nunca baja de cero: lo que sobre queda como faltante. */
export function consumirLote(lote: Lote, cantidad: number): ResultadoConsumo {
  const disponible = Math.max(0, lote.cantidadDisponible - cantidad);
  const faltante = Math.max(0, cantidad - lote.cantidadDisponible);
  return { cantidadDisponible: disponible, faltante };
}

/**
 * Los lotes que caducan dentro de `dias`, el más urgente primero.
 *
 * Los que ya caducaron entran también, a propósito: `fechaCaducidad <=
 * límite` los incluye sin necesidad de un caso aparte, y un lote vencido con
 * existencias es más urgente que uno a punto de vencer, no menos.
 *
 * Con existencias: un lote agotado no hay que gestionarlo aunque le quede
 * poca vida, porque no queda nada que retirar ni que vender.
 */
export function lotesCaducando(lotes: Lote[], dias = 7, hoy = new Date()): Lote[] {
  const limite = new Date(hoy);
  limite.setDate(limite.getDate() + dias);
  const limiteStr = limite.toISOString().slice(0, 10);

  return lotes
    .filter(l => l.cantidadDisponible > 0 && l.fechaCaducidad)
    .filter(l => l.fechaCaducidad! <= limiteStr)
    .sort((a, b) => a.fechaCaducidad!.localeCompare(b.fechaCaducidad!));
}

/** Cuántos días quedan hasta la caducidad. Negativo si ya caducó. */
export function diasHastaCaducidad(lote: Lote, hoy = new Date()): number | null {
  if (!lote.fechaCaducidad) return null;
  const cad = Date.parse(lote.fechaCaducidad);
  if (!Number.isFinite(cad)) return null;
  return Math.round((cad - hoy.getTime()) / 86_400_000);
}

/** Aplica el lote elegido a una línea: guarda su id y su código. */
export function aplicarLoteALinea(linea: InvoiceLineItem, lote: Lote | null): InvoiceLineItem {
  return { ...linea, loteId: lote?.id, loteCodigo: lote?.codigo };
}
