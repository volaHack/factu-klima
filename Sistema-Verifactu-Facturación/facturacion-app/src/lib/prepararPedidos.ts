/**
 * PREPARAR PEDIDOS: LA COLA DEL ALMACÉN
 *
 * El comercial toma el pedido en el móvil, delante del cliente. En el
 * almacén alguien tiene que enterarse, sacar el género de las estanterías,
 * dejarlo listo en el muelle y cargarlo en la furgoneta de su ruta. Esta
 * pieza decide, sin tocar la base de datos para poder probarla entera:
 *
 *   · qué hay que preparar o entregar (la cola);
 *   · cuántas cajas y cuántas sueltas son cada línea, que es como se coge
 *     del palé (CAJ. y U/C de cajas.ts);
 *   · qué hay que subir a la furgoneta de una ruta, sumado por artículo.
 *
 * QUÉ ENTRA EN LA COLA
 *
 *   · Pedidos de venta emitidos o aprobados a los que aún les falta algo
 *     por servir. Lo servido se cuenta igual que en lo «pendiente de
 *     entregar» de cada artículo (servidoPorPedido, en documentos.ts): un
 *     pedido servido a medias sólo pide lo que falta. Ni el borrador (el
 *     comercial aún lo está escribiendo) ni el que espera aprobación, que
 *     todavía puede cambiar o rechazarse.
 *   · Albaranes de venta en borrador: el género aún no ha salido por la
 *     puerta. EXPEDIDO es lo que dice que se entregó y que el stock se
 *     movió (ver rutas.ts), así que «Entregado» es expedirlo.
 *   · Los albaranes de entrega de la pantalla «Albaranes», que viven en su
 *     propia tabla, también en borrador.
 *
 * «PREPARADO», SIN MIGRACIÓN
 *
 * Entre «pendiente» y «entregado» hay un paso que el modelo no tiene: el
 * género ya está en el muelle, pero la furgoneta no ha salido. No hay
 * estado para eso (y un estado nuevo pediría tocar la base de datos), así
 * que va en una clave reservada de `datosExtras`, igual que el cliente
 * ocasional (`__cliente`) o las columnas por línea (`__lineas`): no choca
 * con los campos de la plantilla, viaja en la misma fila y se guarda por la
 * vía de siempre, con su cola sin conexión. No mueve nada: ni stock ni
 * estado. Es una marca para el almacén.
 */

import {
  InvoiceStatus, type Albaran, type Client, type CompanySettings, type Invoice, type InvoiceLineItem, type RutaReparto,
} from './types';
import { desgloseLinea, vaPorUnidades, conUnidades } from './cajas';
import { claveServido, servidoPorPedido, recalcularLinea, documentoConvertido } from './documentos';
import { conPlural } from './vocabulario';

// ------------------------------------------------------------
// La marca de «preparado»
// ------------------------------------------------------------

export const CLAVE_PREPARADO = '__preparado';

export interface MarcaPreparado {
  /** Cuándo se dejó listo (ISO). */
  en: string;
  /** Quién, si la cuenta usa perfiles de trabajo. */
  por?: string;
}

export function marcaPreparado(datosExtras?: Record<string, string>): MarcaPreparado | null {
  const crudo = datosExtras?.[CLAVE_PREPARADO];
  if (!crudo) return null;
  try {
    const v = JSON.parse(crudo);
    return v && typeof v.en === 'string' ? { en: v.en, ...(typeof v.por === 'string' && v.por ? { por: v.por } : {}) } : null;
  } catch {
    return null;
  }
}

/** Los mismos datos extra con la marca puesta (o quitada, con `null`). */
export function conMarcaPreparado(datosExtras: Record<string, string> | undefined, marca: MarcaPreparado | null): Record<string, string> {
  const resto = { ...(datosExtras ?? {}) };
  delete resto[CLAVE_PREPARADO];
  return marca ? { ...resto, [CLAVE_PREPARADO]: JSON.stringify(marca) } : resto;
}

// ------------------------------------------------------------
// La cola
// ------------------------------------------------------------

/** Los pedidos que el almacén tiene que preparar: emitidos o aprobados. */
const PEDIDO_EN_MARCHA: readonly InvoiceStatus[] = [InvoiceStatus.EMITIDA, InvoiceStatus.APROBADO, InvoiceStatus.APROBADO_PARCIAL];

export interface LineaAPreparar {
  id: string;
  productId: string;
  nombre: string;
  ref: string;
  unidad: string;
  /** Unidades que hay que coger, en total. */
  unidades: number;
  /** Unidades por caja, o null si el artículo no va en cajas. */
  udsCaja: number | null;
  /** Cajas completas (0 si no llega a una) y unidades sueltas aparte. */
  cajas: number;
  sueltas: number;
  lote?: string;
}

export interface PedidoEnCola {
  /** Por qué vía se guarda: los documentos o la tabla de albaranes de entrega. */
  origen: 'documento' | 'albaran';
  id: string;
  tipo: 'pedido' | 'albaran';
  numero: string;
  clienteId: string;
  cliente: string;
  direccion: string;
  /** Fecha del documento: la de entrega en un albarán, la del pedido en un pedido. */
  fecha: string;
  /** Cuándo entró (ISO): el orden de llegada. */
  creado: string;
  ruta: { id: string; nombre: string } | null;
  lineas: LineaAPreparar[];
  preparado: MarcaPreparado | null;
  notas: string;
}

const redondear = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Cajas completas y sueltas de unas unidades, que es como se coge del palé:
 * 51 unidades de 24 por caja son 2 cajas y 3 sueltas. Sin U/C (o de 1) no
 * hay cajas: todo son sueltas.
 */
export function enCajas(unidades: number, udsCaja: number | null | undefined): { cajas: number; sueltas: number } {
  const uc = udsCaja && udsCaja > 1 ? udsCaja : 0;
  if (!uc) return { cajas: 0, sueltas: redondear(unidades) };
  const cajas = Math.floor(redondear(unidades / uc));
  return { cajas, sueltas: redondear(unidades - cajas * uc) };
}

const tieneArticulo = (l: { productId?: string; productName?: string }) => Boolean(l.productId || l.productName?.trim());

/** Una línea del documento tal y como se coge en el almacén. */
function aLineaAPreparar(l: Pick<InvoiceLineItem, 'id' | 'productId' | 'productName' | 'productRef' | 'unit' | 'quantity' | 'unitsPerPackage' | 'cajas' | 'loteCodigo'>): LineaAPreparar {
  // desgloseLinea sabe leer las líneas de antes, en las que la cantidad
  // eran las cajas: de ahí salen las unidades de verdad.
  const { unidades, udsCaja } = desgloseLinea(l);
  const { cajas, sueltas } = enCajas(unidades, udsCaja);
  return {
    id: l.id, productId: l.productId || '', nombre: l.productName || '', ref: l.productRef || '', unidad: l.unit,
    unidades, udsCaja: udsCaja && udsCaja > 1 ? udsCaja : null, cajas, sueltas,
    ...(l.loteCodigo ? { lote: l.loteCodigo } : {}),
  };
}

/**
 * Lo que falta por servir de un pedido, línea a línea y con las mismas
 * líneas del pedido (su precio y sus descuentos), recalculadas con la
 * cantidad que queda. Si un artículo va en dos líneas, lo servido se
 * descuenta de la primera y lo que sobre de la siguiente.
 */
export function lineasPendientesDePedido(pedido: Invoice, documentos: readonly Invoice[], servido = servidoPorPedido(documentos)): InvoiceLineItem[] {
  const queda = new Map<string, number>();
  const salida: InvoiceLineItem[] = [];
  for (const li of pedido.lineItems) {
    const cantidad = Number(li.quantity) || 0;
    if (cantidad <= 0 || !tieneArticulo(li)) continue;
    if (!li.productId) { salida.push(li); continue; }
    const k = claveServido(pedido.id, li.productId);
    const yaServido = queda.get(k) ?? servido.get(k) ?? 0;
    const usado = Math.min(yaServido, cantidad);
    queda.set(k, redondear(yaServido - usado));
    const falta = redondear(cantidad - usado);
    if (falta <= 0) continue;
    if (falta === cantidad) { salida.push(li); continue; }
    // En una línea por unidades, las cajas se ajustan a las que caben.
    const ajustada = vaPorUnidades(li) ? conUnidades(li, falta) : { ...li, quantity: falta };
    salida.push(recalcularLinea(ajustada));
  }
  return salida;
}

/**
 * El albarán con que sale un pedido al marcarlo «Entregado»: la conversión
 * de siempre (documentoConvertido, la del botón «Convertir en Albarán»),
 * pero sólo con lo que falta por servir y con la fecha de hoy, que es la
 * de la entrega. Queda enganchado a ESTE pedido aunque el pedido viniera de
 * un presupuesto: es lo que hace que el pedido cuente como servido.
 */
export function albaranDeEntrega(pedido: Invoice, documentos: readonly Invoice[], settings: CompanySettings, hoy: string): Invoice {
  const albaran = documentoConvertido(pedido, 'albaran', settings);
  return {
    ...albaran,
    issueDate: hoy,
    documentoOrigenId: pedido.id,
    documentoOrigenNumber: pedido.number,
    lineItems: lineasPendientesDePedido(pedido, documentos).map(li => ({ ...li, id: crypto.randomUUID() })),
  };
}

export interface FuentesCola {
  documentos: readonly Invoice[];
  /** Los albaranes de entrega (pantalla «Albaranes»). */
  albaranes?: readonly Albaran[];
  clientes: readonly Client[];
  rutas: readonly RutaReparto[];
}

/** Todo lo que el almacén tiene pendiente de preparar o de entregar, por orden de fecha. */
export function colaDeAlmacen({ documentos, albaranes = [], clientes, rutas }: FuentesCola): PedidoEnCola[] {
  const porCliente = new Map(clientes.map(c => [c.id, c]));
  const porRuta = new Map(rutas.map(r => [r.id, r]));
  const rutaDe = (clienteId: string) => {
    const r = porRuta.get(porCliente.get(clienteId)?.rutaId ?? '');
    return r ? { id: r.id, nombre: r.nombre } : null;
  };
  const servido = servidoPorPedido(documentos);
  const cola: PedidoEnCola[] = [];

  const base = (d: Invoice | Albaran, origen: PedidoEnCola['origen'], tipo: PedidoEnCola['tipo'], lineas: LineaAPreparar[]): PedidoEnCola => ({
    origen, id: d.id, tipo, numero: d.number,
    clienteId: d.clientId, cliente: d.clientName || porCliente.get(d.clientId)?.businessName || 'Sin cliente',
    direccion: d.clientAddress || '',
    fecha: d.issueDate, creado: d.createdAt || d.issueDate,
    ruta: rutaDe(d.clientId), lineas, preparado: marcaPreparado(d.datosExtras), notas: d.notes || '',
  });

  for (const d of documentos) {
    if ((d.sentido ?? 'venta') !== 'venta') continue;
    if (d.tipo === 'albaran' && d.status === InvoiceStatus.BORRADOR) {
      const lineas = d.lineItems.filter(l => tieneArticulo(l) && Number(l.quantity) > 0).map(aLineaAPreparar);
      if (lineas.length) cola.push(base(d, 'documento', 'albaran', lineas));
    } else if (d.tipo === 'pedido' && PEDIDO_EN_MARCHA.includes(d.status)) {
      const lineas = lineasPendientesDePedido(d, documentos, servido).map(aLineaAPreparar);
      if (lineas.length) cola.push(base(d, 'documento', 'pedido', lineas));
    }
  }
  for (const a of albaranes) {
    if (a.status !== 'borrador') continue;
    const lineas = a.lineItems.filter(l => tieneArticulo(l) && Number(l.quantity) > 0).map(aLineaAPreparar);
    if (lineas.length) cola.push(base(a, 'albaran', 'albaran', lineas));
  }
  return ordenarCola(cola, 'fecha');
}

export type OrdenCola = 'fecha' | 'llegada';

/**
 * Por fecha (la de entrega del albarán o la del pedido; a igual fecha, el
 * que llegó antes) o por orden de llegada. Lo más antiguo arriba: es lo
 * que antes hay que sacar.
 */
export function ordenarCola(cola: readonly PedidoEnCola[], orden: OrdenCola): PedidoEnCola[] {
  const clave = (p: PedidoEnCola) => (orden === 'fecha' ? `${p.fecha}|${p.creado}` : `${p.creado}|${p.fecha}`);
  return [...cola].sort((a, b) => clave(a).localeCompare(clave(b)) || a.numero.localeCompare(b.numero));
}

export interface GrupoDeRuta {
  /** null: los clientes que no tienen ruta. */
  ruta: { id: string; nombre: string } | null;
  pedidos: PedidoEnCola[];
}

/** La cola partida por rutas, por orden alfabético y «Sin ruta» al final. */
export function agruparPorRuta(cola: readonly PedidoEnCola[]): GrupoDeRuta[] {
  const grupos = new Map<string, GrupoDeRuta>();
  for (const p of cola) {
    const k = p.ruta?.id ?? '';
    const g = grupos.get(k) ?? { ruta: p.ruta, pedidos: [] };
    g.pedidos.push(p);
    grupos.set(k, g);
  }
  return [...grupos.values()].sort((a, b) => {
    if (!a.ruta) return 1;
    if (!b.ruta) return -1;
    return a.ruta.nombre.localeCompare(b.ruta.nombre, 'es');
  });
}

export const numeroDeLineas = (n: number) => conPlural(n, ['línea', 'líneas']);

/** «Pedido PED-0042» o «Albarán ALB-0042». */
export const nombreDe = (p: Pick<PedidoEnCola, 'tipo' | 'numero'>) => `${p.tipo === 'pedido' ? 'Pedido' : 'Albarán'} ${p.numero}`;

// ------------------------------------------------------------
// Las hojas
// ------------------------------------------------------------

/** Lo que suma una hoja de preparación: cajas y unidades en total. */
export function totalesDePedido(p: Pick<PedidoEnCola, 'lineas'>): { cajas: number; unidades: number } {
  return {
    cajas: p.lineas.reduce((s, l) => s + l.cajas, 0),
    unidades: redondear(p.lineas.reduce((s, l) => s + l.unidades, 0)),
  };
}

export interface FilaDeCarga {
  clave: string;
  nombre: string;
  ref: string;
  unidad: string;
  unidades: number;
  udsCaja: number | null;
  cajas: number;
  sueltas: number;
  /** En cuántos pedidos va: para repartirlo luego en la furgoneta. */
  pedidos: number;
}

export interface HojaDeCarga {
  filas: FilaDeCarga[];
  /** Una parada por cliente, no por pedido: dos pedidos del mismo bar son una visita. */
  paradas: number;
  pedidos: number;
  cajas: number;
  unidades: number;
}

/**
 * Lo que hay que subir a la furgoneta para varios pedidos, sumado por
 * artículo. Las unidades se suman primero y luego se pasan a cajas: dos
 * pedidos de 18 latas de un pack de 24 son una caja y 12 sueltas, no dos
 * cajas empezadas. Un artículo que viene en cajas de distinto tamaño va
 * en una fila por tamaño, porque son cajas distintas en el almacén.
 */
export function hojaDeCarga(pedidos: readonly PedidoEnCola[]): HojaDeCarga {
  const filas = new Map<string, FilaDeCarga & { de: Set<string> }>();
  for (const p of pedidos) {
    for (const l of p.lineas) {
      const articulo = l.productId || `${l.ref}|${l.nombre.trim().toLowerCase()}`;
      const clave = `${articulo}|${l.udsCaja ?? ''}`;
      const f = filas.get(clave) ?? {
        clave, nombre: l.nombre, ref: l.ref, unidad: l.unidad, unidades: 0, udsCaja: l.udsCaja, cajas: 0, sueltas: 0, pedidos: 0, de: new Set<string>(),
      };
      f.unidades = redondear(f.unidades + l.unidades);
      f.de.add(p.id);
      filas.set(clave, f);
    }
  }
  const lista = [...filas.values()].map(({ de, ...f }) => ({ ...f, ...enCajas(f.unidades, f.udsCaja), pedidos: de.size }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es') || a.ref.localeCompare(b.ref));
  return {
    filas: lista,
    paradas: new Set(pedidos.map(p => p.clienteId || p.cliente)).size,
    pedidos: pedidos.length,
    cajas: lista.reduce((s, f) => s + f.cajas, 0),
    unidades: redondear(lista.reduce((s, f) => s + f.unidades, 0)),
  };
}

export interface Parada {
  clave: string;
  cliente: string;
  direccion: string;
  /** Los documentos que se le dejan. */
  numeros: string[];
}

/** Una parada por cliente, con todos sus documentos, en el orden de la cola. */
export function paradasDe(pedidos: readonly PedidoEnCola[]): Parada[] {
  const porCliente = new Map<string, Parada>();
  for (const p of pedidos) {
    const clave = p.clienteId || p.cliente;
    const fila = porCliente.get(clave) ?? { clave, cliente: p.cliente, direccion: p.direccion, numeros: [] };
    fila.numeros.push(p.numero);
    porCliente.set(clave, fila);
  }
  return [...porCliente.values()];
}
