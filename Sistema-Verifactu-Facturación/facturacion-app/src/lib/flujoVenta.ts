/**
 * LA CADENA DE VENTA: PRESUPUESTO → PEDIDO → ALBARÁN → FACTURA
 *
 * Lo que decide la ficha de un documento antes de convertirlo, sin tocar la
 * base de datos para poder probarlo entero:
 *
 *   · qué se puede convertir en qué, y por qué no cuando no se puede;
 *   · qué líneas lleva el documento nuevo (de un pedido, sólo lo que falta
 *     por servir; de un pedido aprobado a medias, lo que aprobó el cliente);
 *   · cuánto se ha servido de cada línea de un pedido;
 *   · de dónde viene un documento y a qué ha dado lugar;
 *   · qué pasa si se anula uno que ya se convirtió.
 *
 * UN DOCUMENTO SE CONVIERTE UNA VEZ
 *
 * Un doble clic, o volver atrás y pulsar otra vez, sacaba un segundo
 * pedido del mismo presupuesto o una segunda factura del mismo albarán.
 * Ahora lo que ya salió de un documento se mira en los propios documentos
 * (los que lo tienen como origen y no están anulados): no hace falta un
 * estado nuevo ni tocar la base de datos, y anulando lo que salió se puede
 * volver a convertir. Un pedido es la excepción, porque se sirve en varias
 * veces: mientras le quede algo por servir, puede sacar otro albarán.
 *
 * EL STOCK, UNA SOLA VEZ
 *
 * Lo mueve la base de datos (migración 074): el albarán al dejar de ser
 * borrador y la factura emitida que NO viene de un albarán. De ahí dos
 * reglas de aquí:
 *   · un albarán en borrador no se factura: la factura no movería el stock
 *     (viene de un albarán) y el albarán tampoco (es borrador). Se expide
 *     antes;
 *   · un albarán facturado no se anula: devolvería la mercancía al stock y
 *     la factura, que confía en que la movió el albarán, no la descontaría.
 * `movimientoDeStock` es el espejo de esa regla de la base de datos, para
 * poder probar la cadena entera.
 */

import { InvoiceStatus, type CompanySettings, type Invoice, type InvoiceLineItem, type TipoDocumento } from './types';
import {
  articuloDeLinea, claveServido, documentoConvertido, etiquetaTipo, recalcularLinea, servidoPorPedido,
  type OpcionesConversion,
} from './documentos';
import { lineasPendientesDePedido } from './prepararPedidos';
import { conUnidades, vaPorUnidades } from './cajas';

/** En qué se convierte cada tipo. */
export const DESTINOS: Record<TipoDocumento, readonly TipoDocumento[]> = {
  presupuesto: ['pedido', 'albaran', 'factura'],
  pedido: ['albaran', 'factura'],
  albaran: ['factura'],
  factura: [],
  rectificativa: [],
};

const redondear = (n: number) => Math.round(n * 1000) / 1000;
const vivo = (d: Invoice) => d.status !== InvoiceStatus.ANULADA;
const nombre = (d: Pick<Invoice, 'tipo' | 'number'>) => `${etiquetaTipo(d.tipo ?? 'factura')} ${d.number}`;
const orden = (a: Invoice, b: Invoice) => (a.createdAt || a.issueDate || '').localeCompare(b.createdAt || b.issueDate || '');

/**
 * El nombre del estado de un documento de la cadena. `getStatusInfo` sólo
 * conoce los de las facturas: un albarán expedido o facturado salía como
 * «Borrador» (el primero de su lista), y un pedido, «Emitida».
 */
export function etiquetaEstado(doc: Pick<Invoice, 'status' | 'tipo'> & { sentido?: Invoice['sentido'] }): string {
  const masculino = doc.tipo === 'presupuesto' || doc.tipo === 'pedido' || doc.tipo === 'albaran';
  switch (doc.status) {
    case InvoiceStatus.BORRADOR: return 'Borrador';
    case InvoiceStatus.PRE_APROBACION: return 'En aprobación';
    case InvoiceStatus.APROBADO: return 'Aprobado';
    case InvoiceStatus.APROBADO_PARCIAL: return 'Aprobado en parte';
    case InvoiceStatus.RECHAZADO: return 'Rechazado';
    case InvoiceStatus.EMITIDA: return masculino ? 'Emitido' : 'Emitida';
    // En compras el albarán no sale del almacén: entra.
    case InvoiceStatus.EXPEDIDO: return doc.sentido === 'compra' ? 'Recibido' : 'Expedido';
    case InvoiceStatus.FACTURADO: return 'Facturado';
    case InvoiceStatus.PENDIENTE: return 'Pendiente';
    case InvoiceStatus.PARCIAL: return 'Cobro parcial';
    case InvoiceStatus.PAGADA: return 'Pagada';
    case InvoiceStatus.VENCIDA: return 'Vencida';
    case InvoiceStatus.ANULADA: return masculino ? 'Anulado' : 'Anulada';
    default: return String(doc.status);
  }
}

/** Lo que salió de un documento y sigue vivo (no anulado). */
export function derivadosDe(id: string, documentos: readonly Invoice[]): Invoice[] {
  return documentos.filter(d => d.documentoOrigenId === id && vivo(d)).sort(orden);
}

// ------------------------------------------------------------
// La trazabilidad
// ------------------------------------------------------------

export interface Traza {
  /** De dónde viene, del primero de la cadena al inmediato. */
  origenes: Invoice[];
  /** A qué ha dado lugar, también lo anulado (se enseña tachado), con su nivel: 0 lo que salió de él, 1 lo que salió de eso… */
  derivados: { doc: Invoice; nivel: number }[];
}

/**
 * La cadena de un documento en los dos sentidos. Se sigue de eslabón en
 * eslabón por `documentoOrigenId`; un eslabón que no está (borrado, de otro
 * equipo aún sin bajar) corta la cadena ahí, y una cadena circular (datos
 * de antes, rotos) no cuelga la ficha.
 */
export function trazaDe(doc: Invoice, documentos: readonly Invoice[]): Traza {
  const porId = new Map(documentos.map(d => [d.id, d]));
  const vistos = new Set([doc.id]);
  const origenes: Invoice[] = [];
  for (let o = porId.get(doc.documentoOrigenId ?? ''); o && !vistos.has(o.id); o = porId.get(o.documentoOrigenId ?? '')) {
    vistos.add(o.id);
    origenes.unshift(o);
  }

  const derivados: Traza['derivados'] = [];
  const bajar = (id: string, nivel: number) => {
    for (const d of documentos.filter(x => x.documentoOrigenId === id).sort(orden)) {
      if (vistos.has(d.id)) continue;
      vistos.add(d.id);
      derivados.push({ doc: d, nivel });
      bajar(d.id, nivel + 1);
    }
  };
  bajar(doc.id, 0);
  return { origenes, derivados };
}

// ------------------------------------------------------------
// Lo servido de un pedido
// ------------------------------------------------------------

export type EstadoServicio = 'sin_servir' | 'parcial' | 'servido';

export interface LineaServida {
  articulo: string;
  productId: string;
  nombre: string;
  pedido: number;
  servido: number;
  pendiente: number;
  /** Lo servido de más, si se sirvió más de lo pedido. */
  exceso: number;
}

/**
 * Cuánto se ha servido de cada artículo de un pedido, con la misma cuenta
 * que lo pendiente de cada artículo y la cola del almacén
 * (servidoPorPedido): los tres dicen lo mismo del mismo pedido.
 *
 * El pedido no tiene estado de «servido» (sería tocar la base de datos):
 * esto es lo que lo dice, mirando sus albaranes y facturas.
 */
export function servicioDePedido(pedido: Invoice, documentos: readonly Invoice[]): { estado: EstadoServicio; lineas: LineaServida[] } {
  const servido = servidoPorPedido(documentos);
  const porArticulo = new Map<string, LineaServida>();
  for (const li of pedido.lineItems) {
    const articulo = articuloDeLinea(li);
    const cantidad = Number(li.quantity) || 0;
    if (!articulo || cantidad <= 0) continue;
    const fila = porArticulo.get(articulo)
      ?? { articulo, productId: li.productId || '', nombre: li.productName || '', pedido: 0, servido: 0, pendiente: 0, exceso: 0 };
    fila.pedido = redondear(fila.pedido + cantidad);
    porArticulo.set(articulo, fila);
  }
  const lineas = [...porArticulo.values()].map(f => {
    const s = redondear(servido.get(claveServido(pedido.id, f.articulo)) ?? 0);
    return { ...f, servido: s, pendiente: Math.max(0, redondear(f.pedido - s)), exceso: Math.max(0, redondear(s - f.pedido)) };
  });
  const estado: EstadoServicio = lineas.length > 0 && lineas.every(l => l.pendiente === 0) ? 'servido'
    : lineas.some(l => l.servido > 0) ? 'parcial'
    : 'sin_servir';
  return { estado, lineas };
}

export interface ExcesoSobrePedido {
  nombre: string;
  /** Lo que se pidió (0 si el artículo no estaba en el pedido). */
  pedido: number;
  /** Lo que ya sirvieron otros documentos del mismo pedido. */
  otros: number;
  /** Lo que lleva este documento. */
  este: number;
  exceso: number;
}

/**
 * Lo que un albarán (o factura) sacado de un pedido sirve de más: entre él
 * y lo que ya sirvieron los demás, más de lo pedido, o un artículo que no
 * estaba en el pedido. Se puede (el cliente pidió más en la puerta), pero
 * se avisa antes de guardar o expedir.
 */
export function excesosSobrePedido(doc: Invoice, documentos: readonly Invoice[]): ExcesoSobrePedido[] {
  const pedido = documentos.find(d => d.id === doc.documentoOrigenId && d.tipo === 'pedido');
  if (!pedido || doc.tipo === 'pedido' || doc.tipo === 'presupuesto') return [];
  const otros = servidoPorPedido(documentos.filter(d => d.id !== doc.id));
  const pedidoPor = new Map<string, number>();
  for (const li of pedido.lineItems) {
    const a = articuloDeLinea(li);
    if (a) pedidoPor.set(a, (pedidoPor.get(a) ?? 0) + (Number(li.quantity) || 0));
  }
  const este = new Map<string, { nombre: string; cantidad: number }>();
  for (const li of doc.lineItems) {
    const a = articuloDeLinea(li);
    if (!a) continue;
    const f = este.get(a) ?? { nombre: li.productName || '', cantidad: 0 };
    f.cantidad += Number(li.quantity) || 0;
    este.set(a, f);
  }
  const salida: ExcesoSobrePedido[] = [];
  for (const [a, f] of este) {
    const pedidoUds = redondear(pedidoPor.get(a) ?? 0);
    const yaOtros = redondear(otros.get(claveServido(pedido.id, a)) ?? 0);
    const exceso = redondear(yaOtros + f.cantidad - pedidoUds);
    if (exceso > 0) salida.push({ nombre: f.nombre, pedido: pedidoUds, otros: yaOtros, este: redondear(f.cantidad), exceso });
  }
  return salida;
}

/** El aviso de un exceso, dicho para quien lo va a confirmar. */
export function textoDeExcesos(excesos: readonly ExcesoSobrePedido[]): string {
  const fmt = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 3 });
  return excesos.map(e => (e.pedido === 0
    ? `• ${e.nombre}: no estaba en el pedido (${fmt(e.este)} de más).`
    : `• ${e.nombre}: pedido ${fmt(e.pedido)}, ya servido ${fmt(e.otros)}, aquí ${fmt(e.este)} (${fmt(e.exceso)} de más).`)).join('\n');
}

// ------------------------------------------------------------
// Convertir
// ------------------------------------------------------------

/**
 * Por qué no se puede convertir un documento en otro, o null si se puede.
 * El texto es el que ve quien pulsa el botón.
 */
export function motivoParaNoConvertir(doc: Invoice, destino: TipoDocumento, documentos: readonly Invoice[]): string | null {
  const tipo = doc.tipo ?? 'factura';
  if (!DESTINOS[tipo].includes(destino)) return `${etiquetaTipo(tipo)} no se convierte en ${etiquetaTipo(destino).toLowerCase()}.`;
  if (doc.status === InvoiceStatus.ANULADA) return 'Este documento está anulado.';
  const salieron = derivadosDe(doc.id, documentos);

  if (tipo === 'presupuesto' && salieron.length > 0) return `Ya se pasó a ${nombre(salieron[0])}.`;

  if (tipo === 'pedido') {
    if (doc.status === InvoiceStatus.PRE_APROBACION) return 'El pedido está esperando la aprobación del cliente.';
    if (doc.status === InvoiceStatus.RECHAZADO) return 'El cliente rechazó este pedido.';
    if (lineasPendientesDePedido(doc, documentos).length === 0) {
      return salieron.length > 0
        ? `El pedido ya está servido del todo (${salieron.map(d => d.number).join(', ')}). Factura sus albaranes.`
        : 'El pedido no tiene líneas que servir.';
    }
  }

  if (tipo === 'albaran') {
    const factura = salieron.find(d => d.tipo === 'factura');
    if (factura) return `Ya está facturado en ${factura.number}.`;
    if (doc.status === InvoiceStatus.FACTURADO) return 'Ya está facturado.';
    if (doc.status === InvoiceStatus.BORRADOR) return 'Expide antes el albarán: es lo que mueve el stock. Facturado sin expedir, el stock no se movería nunca.';
  }
  return null;
}

/** La respuesta del cliente a una línea del pedido (order_approval_items). */
export interface LineaAprobada {
  lineItemId: string;
  accepted: boolean;
  adjustedQuantity: number | null;
}

/**
 * Las líneas de un pedido como las aprobó el cliente: las rechazadas
 * fuera, las ajustadas con su cantidad nueva (y su importe recalculado) y
 * las que no contestó, como estaban.
 */
export function aplicarAprobacion(lineas: readonly InvoiceLineItem[], aprobacion: readonly LineaAprobada[]): InvoiceLineItem[] {
  const porLinea = new Map(aprobacion.map(a => [a.lineItemId, a]));
  const salida: InvoiceLineItem[] = [];
  for (const li of lineas) {
    const a = porLinea.get(li.id);
    if (a && !a.accepted) continue;
    const cantidad = a?.adjustedQuantity;
    if (cantidad != null && cantidad > 0 && cantidad !== li.quantity) {
      salida.push(recalcularLinea(vaPorUnidades(li) ? conUnidades(li, cantidad) : { ...li, quantity: cantidad }));
    } else {
      salida.push(li);
    }
  }
  return salida;
}

export interface OpcionesConvertir extends OpcionesConversion {
  /** Lo que aprobó el cliente, para un pedido aprobado a medias. */
  aprobacion?: readonly LineaAprobada[] | null;
}

/**
 * El documento nuevo, listo para guardar, o un error con el motivo si no se
 * puede. De un pedido salen sólo las líneas que faltan por servir: así un
 * albarán o una factura del pedido después de una entrega parcial no
 * vuelven a servir (ni a descontar del stock) lo que ya salió.
 */
export function convertirDocumento(
  doc: Invoice, destino: TipoDocumento, documentos: readonly Invoice[], settings: CompanySettings, opciones: OpcionesConvertir = {},
): Invoice {
  const motivo = motivoParaNoConvertir(doc, destino, documentos);
  if (motivo) throw new Error(motivo);
  const { aprobacion, ...resto } = opciones;

  let lineas = doc.lineItems;
  if (doc.tipo === 'pedido' && doc.status === InvoiceStatus.APROBADO_PARCIAL) {
    if (!aprobacion) {
      throw new Error('Para servir este pedido hace falta lo que aprobó el cliente, y eso se lee del servidor: vuelve a intentarlo con conexión.');
    }
    lineas = aplicarAprobacion(lineas, aprobacion);
  }
  if (doc.tipo === 'pedido') lineas = lineasPendientesDePedido({ ...doc, lineItems: lineas }, documentos);
  if (lineas.length === 0) throw new Error(`No queda nada que pasar a ${etiquetaTipo(destino).toLowerCase()}.`);

  return documentoConvertido(doc, destino, settings, { ...resto, lineItems: lineas });
}

// ------------------------------------------------------------
// El segundo botón del formulario
// ------------------------------------------------------------

export type PasoAlTerminar = 'emitir' | 'expedir' | 'facturas';

/**
 * Qué hace el botón de al lado de «Guardar» en el formulario de un
 * documento. Antes era «Emitir» para todo, y guardaba con estado EMITIDA:
 *   · una factura de venta quedaba sellada sin el repaso de antes de emitir
 *     (NIF, nombre en la AEAT, líneas, primeros pasos). Ahora se guarda en
 *     borrador y se emite desde Facturas, por la vía de siempre;
 *   · un albarán «emitido» no es ningún estado de albarán: la base de
 *     datos movía el stock pero no se gastaban lotes ni números de serie, y
 *     la cola del almacén no lo veía. Ahora se expide, como desde su ficha.
 */
export function pasoAlTerminar(tipo: TipoDocumento, sentido: 'venta' | 'compra'): PasoAlTerminar {
  if ((tipo === 'factura' || tipo === 'rectificativa') && sentido === 'venta') return 'facturas';
  if (tipo === 'albaran') return 'expedir';
  return 'emitir';
}

export function rotuloAlTerminar(tipo: TipoDocumento, sentido: 'venta' | 'compra'): string {
  const paso = pasoAlTerminar(tipo, sentido);
  if (paso === 'facturas') return 'Guardar y revisar para emitir';
  // En compras el albarán no sale: entra. Y la factura no se emite: se registra.
  if (paso === 'expedir') return sentido === 'compra' ? 'Guardar y recibir' : 'Guardar y expedir';
  if (sentido === 'compra' && (tipo === 'factura' || tipo === 'rectificativa')) return 'Registrar factura';
  return `Emitir ${etiquetaTipo(tipo).toLowerCase()}`;
}

// ------------------------------------------------------------
// Anular
// ------------------------------------------------------------

/**
 * Qué decir (o si impedirlo) al anular un documento del que ya salió algo.
 * null: nada que avisar.
 */
export function avisoAlAnular(doc: Invoice, documentos: readonly Invoice[]): { bloquea: boolean; texto: string } | null {
  const tipo = doc.tipo ?? 'factura';
  const salieron = derivadosDe(doc.id, documentos);
  const lista = salieron.map(nombre).join(', ');

  if (tipo === 'albaran') {
    const factura = salieron.find(d => d.tipo === 'factura');
    if (factura) {
      return {
        bloquea: true,
        texto: `No se puede anular: está facturado en ${factura.number}. Anula antes esa factura (o rectifícala, si ya está emitida); si no, la mercancía volvería al stock con la venta facturada.`,
      };
    }
    if (doc.status === InvoiceStatus.EXPEDIDO) return { bloquea: false, texto: 'Al anularlo, la mercancía vuelve al stock.' };
    return null;
  }
  if (salieron.length === 0) return null;
  if (tipo === 'pedido') {
    return { bloquea: false, texto: `De este pedido ya salió ${lista}. Si lo anulas, eso sigue como está y lo que falta por servir deja de estar pendiente.` };
  }
  return { bloquea: false, texto: `De este documento ya salió ${lista}. Si lo anulas, eso sigue como está.` };
}

// ------------------------------------------------------------
// El stock (espejo de la base de datos)
// ------------------------------------------------------------

const NO_MUEVE: readonly InvoiceStatus[] = [InvoiceStatus.BORRADOR, InvoiceStatus.PRE_APROBACION, InvoiceStatus.RECHAZADO, InvoiceStatus.ANULADA];

/**
 * Lo que un documento mueve del stock de cada artículo, con la regla de
 * `fn_stock_signo_documento` (migración 074): el albarán en cuanto deja de
 * ser borrador; la factura emitida que no viene de un albarán; nada más.
 * Negativo, sale; positivo, entra. No lo usa la app para mover nada (eso
 * lo hace la base de datos): sirve para comprobar que la cadena lo mueve
 * exactamente una vez.
 */
export function movimientoDeStock(doc: Invoice, documentos: readonly Invoice[]): Map<string, number> {
  const salida = new Map<string, number>();
  if (NO_MUEVE.includes(doc.status)) return salida;
  const deAlbaran = documentos.some(o => o.id === doc.documentoOrigenId && o.tipo === 'albaran');
  const mueve = doc.tipo === 'albaran' || (doc.tipo === 'factura' && !deAlbaran);
  if (!mueve) return salida;
  const signo = doc.sentido === 'compra' ? 1 : -1;
  for (const li of doc.lineItems) {
    if (li.productId) salida.set(li.productId, redondear((salida.get(li.productId) ?? 0) + signo * (Number(li.quantity) || 0)));
  }
  return salida;
}
