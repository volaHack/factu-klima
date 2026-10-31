/**
 * DE «REPÓN ESTO» AL PEDIDO DE COMPRA
 *
 * «Repón esto» ya sabe qué se va a acabar y cuánto conviene pedir, en cajas
 * si el artículo va por cajas. Faltaba el paso de después, el que se hacía
 * a mano con la lista delante: repartirlo por proveedor y montar un pedido
 * a cada uno. Aquí se reparte y se monta, siempre en BORRADOR: nada sale de
 * aquí hacia el proveedor sin que alguien lo abra, lo repase y lo mande.
 *
 * DE QUIÉN ES CADA ARTÍCULO
 * La ficha del producto no guarda proveedor: `supplierRef` es la referencia
 * que el proveedor le da al artículo, no quién es el proveedor. Lo que sí
 * lo dice es el último documento de compra en que salió (pedido, albarán o
 * factura; ni borradores ni anulados): a quien se le compró la última vez
 * es a quien se le vuelve a pedir. Lo que nunca se ha comprado queda «sin
 * proveedor» y la pantalla deja elegirlo.
 *
 * Lo que ya está en un borrador de pedido de compra no se vuelve a pedir:
 * pulsar dos veces el botón no debe duplicar el pedido.
 */

import { InvoiceStatus, PaymentMethod, type CompanySettings, type Invoice, type InvoiceLineItem, type Product } from './types';
import type { Reposicion } from './reposicion';
import { condicionesDeCompra, recalcularLinea } from './documentos';
import { calculateInvoiceTotals, generateInvoiceNumber } from './utils';
import { serieDeTipo } from './storage';

export interface ProveedorPedido {
  /** «id:…» con ficha; «nombre:…» si sólo se conoce el nombre; '' si no se sabe. */
  clave: string;
  clientId: string;
  clientName: string;
  clientNif: string;
  clientAddress: string;
  paymentMethod?: PaymentMethod;
}

export interface LineaPedido {
  productId: string;
  nombre: string;
  ref: string;
  /** La referencia del proveedor, para que sepa qué se le pide. */
  supplierRef?: string;
  unidades: number;
  cajas: number | null;
  udsCaja: number | null;
  /** Precio de compra por unidad (0 si no se conoce). */
  precio: number;
  taxRate: number;
  unidad: string;
}

export interface GrupoPedido {
  proveedor: ProveedorPedido;
  lineas: LineaPedido[];
  /** Base del pedido, sin impuesto. */
  base: number;
}

export interface Reparto {
  grupos: GrupoPedido[];
  /** Lo que no se sabe a quién pedir. */
  sinProveedor: LineaPedido[];
  /** Lo que ya está en un borrador de pedido de compra. */
  yaEnBorrador: string[];
}

const SIN_VALOR: readonly InvoiceStatus[] = [InvoiceStatus.BORRADOR, InvoiceStatus.ANULADA, InvoiceStatus.RECHAZADO];

const claveDe = (d: Pick<Invoice, 'clientId' | 'clientName'>) =>
  d.clientId ? `id:${d.clientId}` : d.clientName?.trim() ? `nombre:${d.clientName.trim().toLowerCase()}` : '';

/** El proveedor al que se le compró cada artículo la última vez. */
export function ultimoProveedorPorArticulo(docs: readonly Invoice[]): Map<string, ProveedorPedido> {
  const salida = new Map<string, { p: ProveedorPedido; orden: string }>();
  for (const d of docs) {
    if (d.sentido !== 'compra' || SIN_VALOR.includes(d.status) || d.cancelledAt) continue;
    const clave = claveDe(d);
    if (!clave) continue;
    const orden = `${d.issueDate}|${d.createdAt ?? ''}`;
    for (const l of d.lineItems ?? []) {
      if (!l.productId) continue;
      const antes = salida.get(l.productId);
      if (antes && antes.orden >= orden) continue;
      salida.set(l.productId, {
        orden,
        p: {
          clave, clientId: d.clientId ?? '', clientName: d.clientName, clientNif: d.clientNif ?? '',
          clientAddress: d.clientAddress ?? '', paymentMethod: d.paymentMethod,
        },
      });
    }
  }
  return new Map([...salida].map(([id, v]) => [id, v.p]));
}

/** Los artículos que ya están en algún borrador de pedido de compra. */
export function articulosEnBorradorDeCompra(docs: readonly Invoice[]): Set<string> {
  const ids = new Set<string>();
  for (const d of docs) {
    if (d.sentido !== 'compra' || d.tipo !== 'pedido' || d.status !== InvoiceStatus.BORRADOR) continue;
    for (const l of d.lineItems ?? []) if (l.productId) ids.add(l.productId);
  }
  return ids;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Reparte lo que hay que reponer entre los proveedores. */
export function repartirPorProveedor(
  reponer: readonly Reposicion[],
  productos: readonly Product[],
  docs: readonly Invoice[],
): Reparto {
  const proveedores = ultimoProveedorPorArticulo(docs);
  const enBorrador = articulosEnBorradorDeCompra(docs);
  const porId = new Map(productos.map(p => [p.id, p]));
  const grupos = new Map<string, GrupoPedido>();
  const sinProveedor: LineaPedido[] = [];
  const yaEnBorrador: string[] = [];

  for (const r of reponer) {
    if (r.sugerido <= 0) continue;
    const p = porId.get(r.id);
    if (!p) continue;
    if (enBorrador.has(r.id)) { yaEnBorrador.push(r.nombre); continue; }
    const { unitPrice, taxRate } = condicionesDeCompra(p);
    const linea: LineaPedido = {
      productId: p.id, nombre: p.name, ref: p.ref, supplierRef: p.supplierRef,
      unidades: r.sugerido, cajas: r.cajas, udsCaja: r.udsCaja, precio: unitPrice, taxRate, unidad: p.unit,
    };
    const prov = proveedores.get(p.id);
    if (!prov) { sinProveedor.push(linea); continue; }
    const g = grupos.get(prov.clave) ?? { proveedor: prov, lineas: [], base: 0 };
    g.lineas.push(linea);
    g.base = r2(g.base + linea.unidades * linea.precio);
    grupos.set(prov.clave, g);
  }

  return {
    grupos: [...grupos.values()].sort((a, b) => b.lineas.length - a.lineas.length || a.proveedor.clientName.localeCompare(b.proveedor.clientName, 'es')),
    sinProveedor,
    yaEnBorrador,
  };
}

/** La línea del pedido: por unidades con su casilla de cajas si va por cajas (ver cajas.ts). */
export function lineaDePedido(l: LineaPedido): InvoiceLineItem {
  return recalcularLinea({
    id: crypto.randomUUID(),
    productId: l.productId,
    productName: l.nombre,
    productRef: l.ref,
    quantity: l.unidades,
    unitPrice: l.precio,
    unit: l.unidad as InvoiceLineItem['unit'],
    taxRate: l.taxRate,
    discountPercent: 0,
    ...(l.udsCaja ? { unitsPerPackage: l.udsCaja, cajas: l.cajas ?? 0 } : {}),
    subtotal: 0,
    taxAmount: 0,
    total: 0,
  });
}

/**
 * Los números de los pedidos, seguidos en la serie de pedidos de compra.
 * Si alguno ya existe en el servidor, al guardar se pasa al siguiente libre
 * (lo hace `saveInvoice`).
 */
export function numerosDePedido(settings: CompanySettings, cuantos: number, hoy = new Date()): { series: string; number: string }[] {
  const { serie, nextNumber } = serieDeTipo(settings, 'pedido', 'compra');
  return Array.from({ length: cuantos }, (_, i) => ({ series: serie, number: generateInvoiceNumber(serie, nextNumber + i, hoy.getFullYear()) }));
}

/** El borrador de pedido de compra de un proveedor. Nunca otro estado. */
export function pedidoBorrador(
  grupo: GrupoPedido,
  numero: { series: string; number: string },
  hoy = new Date(),
): Invoice {
  const fecha = hoy.toISOString().slice(0, 10);
  const ahora = hoy.toISOString();
  const lineItems = grupo.lineas.map(lineaDePedido);
  const totales = calculateInvoiceTotals(lineItems);
  const refs = grupo.lineas.filter(l => l.supplierRef).map(l => `${l.supplierRef} (${l.nombre})`);
  return {
    id: crypto.randomUUID(),
    tipo: 'pedido',
    sentido: 'compra',
    number: numero.number,
    series: numero.series,
    clientId: grupo.proveedor.clientId,
    clientName: grupo.proveedor.clientName,
    clientNif: grupo.proveedor.clientNif,
    clientAddress: grupo.proveedor.clientAddress,
    issueDate: fecha,
    dueDate: fecha,
    status: InvoiceStatus.BORRADOR,
    paymentMethod: grupo.proveedor.paymentMethod ?? PaymentMethod.TRANSFERENCIA,
    lineItems,
    subtotal: totales.subtotal,
    totalDiscount: totales.totalDiscount,
    taxBreakdown: totales.taxBreakdown,
    totalTax: totales.totalTax,
    total: totales.total,
    notes: [
      'Preparado desde «Repón esto» con lo que se va a acabar a su ritmo de venta. Revísalo antes de mandarlo.',
      refs.length ? `Referencias del proveedor: ${refs.join(', ')}.` : '',
    ].filter(Boolean).join('\n'),
    createdAt: ahora,
    updatedAt: ahora,
  };
}
