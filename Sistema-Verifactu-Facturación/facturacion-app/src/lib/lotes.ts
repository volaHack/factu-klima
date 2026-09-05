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

import type { EstadoLote, Invoice, InvoiceLineItem, Lote } from './types';

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
    .filter(l => l.productId === productId && l.cantidadDisponible > 0 && sePuedeVender(l))
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

// ============================================================
// FRENAR UN LOTE
// ============================================================

/**
 * FRENAR UN LOTE ES LA MITAD QUE FALTABA
 *
 * La trazabilidad ya sabía decir a quién se le había servido el lote L-4471.
 * Lo que no había era manera de IMPEDIR que siguiera saliendo mientras se
 * averiguaba: llegaba el aviso de la agencia de seguridad alimentaria y el
 * género seguía cruzando la puerta, porque nada en el programa lo paraba.
 *
 * Dos situaciones, y la diferencia entre ellas importa:
 *
 * - INMOVILIZADO es «para todo y no lo toques mientras compruebo». Es
 *   reversible: si la alerta era de otro lote o de otro proveedor, se
 *   libera y se sigue vendiendo.
 * - RETIRADO es «esto no vuelve a venderse». No se libera. La marca queda
 *   con su fecha y su motivo, que es lo que hay que poder enseñar en una
 *   inspección para demostrar cuándo se reaccionó.
 *
 * Todo lo de aquí abajo es deliberadamente literal, por lo mismo que el
 * resto del archivo: en una retirada, equivocarse por optimismo —dejar un
 * lote vendible «por si acaso no era»— es el error que no se puede cometer.
 */

/** Un lote sin estado es de antes de que esto existiera: se vende. */
export function estadoDeLote(lote: Lote): EstadoLote {
  return lote.estado ?? 'disponible';
}

/** Si este lote puede salir por la puerta. */
export function sePuedeVender(lote: Lote): boolean {
  return estadoDeLote(lote) === 'disponible';
}

export interface ResultadoBloqueo {
  lote: Lote;
}

/**
 * Inmoviliza o retira un lote.
 *
 * El motivo es obligatorio y no es burocracia: dentro de seis meses, quien
 * mire este lote tiene que poder saber por qué se paró sin llamar a nadie.
 */
export function bloquearLote(
  lote: Lote,
  estado: Exclude<EstadoLote, 'disponible'>,
  motivo: string,
  ahora = new Date(),
): Lote {
  const limpio = motivo.trim();
  if (!limpio) throw new Error('Hay que decir por qué se bloquea el lote.');

  return {
    ...lote,
    estado,
    motivoBloqueo: limpio,
    bloqueadoEn: ahora.toISOString(),
    updatedAt: ahora.toISOString(),
  };
}

/**
 * Devuelve un lote inmovilizado a la venta.
 *
 * Un lote RETIRADO no se libera: si de verdad se retiró por error, se da de
 * alta otro con su código y se explica en las notas. Dejar que un clic
 * deshaga una retirada convierte la marca en una opinión, y lo que tiene
 * que ser es un hecho con fecha.
 */
export function liberarLote(lote: Lote, ahora = new Date()): Lote {
  if (estadoDeLote(lote) === 'retirado') {
    throw new Error('Un lote retirado no se puede volver a poner a la venta.');
  }
  return {
    ...lote,
    estado: 'disponible',
    motivoBloqueo: undefined,
    bloqueadoEn: undefined,
    updatedAt: ahora.toISOString(),
  };
}

export interface AvisoLoteBloqueado {
  loteId: string;
  codigo: string;
  productName: string;
  estado: EstadoLote;
  motivo: string;
}

/**
 * Comprueba si alguna línea de una venta lleva un lote frenado.
 *
 * Es lo que hay que llamar ANTES de cobrar o de emitir: si devuelve algo, la
 * venta no debe salir. Se devuelve la lista entera y no el primero, porque
 * un pedido puede llevar dos lotes del mismo aviso y hay que enseñarlos los
 * dos de una vez, no uno, corregir, y descubrir el siguiente.
 */
export function lotesFrenadosEnLineas(
  lineas: { loteId?: string; loteCodigo?: string }[],
  lotes: Lote[],
): AvisoLoteBloqueado[] {
  const porId = new Map(lotes.map(l => [l.id, l]));
  const avisos: AvisoLoteBloqueado[] = [];
  const vistos = new Set<string>();

  for (const linea of lineas) {
    if (!linea.loteId || vistos.has(linea.loteId)) continue;
    const lote = porId.get(linea.loteId);
    if (!lote || sePuedeVender(lote)) continue;
    vistos.add(linea.loteId);
    avisos.push({
      loteId: lote.id,
      codigo: lote.codigo,
      productName: lote.productName,
      estado: estadoDeLote(lote),
      motivo: lote.motivoBloqueo ?? '',
    });
  }

  return avisos;
}

export interface ClienteAfectado {
  clientId: string;
  clientName: string;
  unidades: number;
  /** Los documentos con los que se le sirvió, para poder citarlos al avisar. */
  documentos: string[];
  /** La primera y la última entrega, para acotar las fechas del aviso. */
  desde: string;
  hasta: string;
}

/**
 * A QUIÉN HAY QUE LLAMAR
 *
 * La trazabilidad devuelve entregas —una fila por línea de factura—, que es
 * lo correcto para el registro pero no es lo que hace falta con el teléfono
 * en la mano. Esto agrupa por cliente: un nombre, cuánto se le sirvió, con
 * qué documentos y entre qué fechas. Es la lista con la que se llama.
 *
 * Ordenada por unidades servidas, de más a menos: si hay que empezar por
 * alguien, es por quien más tiene.
 */
export function clientesAfectadosPorLote(loteId: string, invoices: Invoice[]): ClienteAfectado[] {
  const porCliente = new Map<string, ClienteAfectado>();

  for (const entrega of trazabilidadDeLote(loteId, invoices)) {
    const previo = porCliente.get(entrega.clientId);
    if (previo) {
      previo.unidades += entrega.cantidad;
      if (!previo.documentos.includes(entrega.number)) previo.documentos.push(entrega.number);
      if (entrega.fecha < previo.desde) previo.desde = entrega.fecha;
      if (entrega.fecha > previo.hasta) previo.hasta = entrega.fecha;
    } else {
      porCliente.set(entrega.clientId, {
        clientId: entrega.clientId,
        clientName: entrega.clientName,
        unidades: entrega.cantidad,
        documentos: [entrega.number],
        desde: entrega.fecha,
        hasta: entrega.fecha,
      });
    }
  }

  return [...porCliente.values()].sort((a, b) => b.unidades - a.unidades);
}
