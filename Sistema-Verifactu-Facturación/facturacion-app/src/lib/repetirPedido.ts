/**
 * «LO MISMO QUE LA ÚLTIMA VEZ»
 *
 * En una distribuidora muchos clientes piden casi siempre lo mismo: el bar
 * de la esquina, sus cajas de agua, refrescos y cerveza cada semana. Con
 * esto el documento nuevo se rellena con los artículos y las cantidades del
 * último que se le hizo a esa ficha, y sólo hay que tocar lo que cambie.
 *
 *   · El último documento de la ficha: factura, albarán o pedido (no
 *     presupuestos ni rectificativas), ni borradores ni anulados. Mira los
 *     documentos de hoy (`invoices`) y los albaranes de la pantalla antigua
 *     (`albaranes`).
 *   · Se copian artículos, cantidades y cajas. Los precios y descuentos son
 *     los que tocan HOY (tarifa, precios especiales…), como si se eligiera
 *     el artículo a mano; la línea ya avisa si la última vez se le cobró otro.
 *   · Los artículos que ya no existen o están dados de baja no se copian, y
 *     se dice cuáles.
 */

import { InvoiceStatus, type Albaran, type Invoice, type InvoiceLineItem, type Product } from './types';
import { recalcularLinea } from './documentos';

export type TipoRepetible = 'factura' | 'albaran' | 'pedido';

export interface LineaAnterior {
  productId: string;
  productName: string;
  productRef: string;
  quantity: number;
  cajas?: number | null;
  unitsPerPackage?: number;
  unitPrice: number;
  taxRate: number;
  unit: InvoiceLineItem['unit'];
  discountPercent: number;
  discountPercent2?: number;
  discountPercent3?: number;
}

export interface DocumentoAnterior {
  id: string;
  tipo: TipoRepetible;
  numero: string;
  fecha: string;
  creado: string;
  lineas: LineaAnterior[];
}

const NO_VALEN = new Set<string>([InvoiceStatus.BORRADOR, InvoiceStatus.ANULADA, InvoiceStatus.RECHAZADO, 'anulado']);

const conContenido = (l: Pick<LineaAnterior, 'productId' | 'productName' | 'quantity'>) =>
  (l.quantity ?? 0) > 0 && !!(l.productId || l.productName?.trim());

function tipoDe(d: Pick<Invoice, 'tipo' | 'number'>): TipoRepetible | null {
  if (d.tipo === 'albaran' || d.tipo === 'pedido') return d.tipo;
  if (d.tipo === 'factura') return 'factura';
  if (d.tipo) return null; // presupuesto, rectificativa…
  // Facturas de antes de que existiera `tipo`: lo dice el número.
  const n = (d.number ?? '').toUpperCase();
  if (n.startsWith('ALB-')) return 'albaran';
  if (n.startsWith('PED-')) return 'pedido';
  if (n.startsWith('PRE-')) return null;
  return 'factura';
}

/** El documento más reciente de esa ficha que se puede repetir, o null. */
export function ultimoDocumentoDe(
  documentos: readonly Invoice[],
  albaranes: readonly Albaran[],
  clienteId: string | null | undefined,
  sentido: 'venta' | 'compra',
  excluirId?: string,
): DocumentoAnterior | null {
  if (!clienteId) return null;
  const candidatos: DocumentoAnterior[] = [];

  for (const d of documentos) {
    if (d.clientId !== clienteId || d.id === excluirId || NO_VALEN.has(d.status)) continue;
    // Una rectificativa (en negativo) no es un pedido que repetir.
    if ((d.sentido ?? 'venta') !== sentido || (Number(d.total) || 0) < 0) continue;
    const tipo = tipoDe(d);
    if (!tipo) continue;
    const lineas = (d.lineItems ?? []).filter(conContenido);
    if (!lineas.length) continue;
    candidatos.push({ id: d.id, tipo, numero: d.number, fecha: d.issueDate ?? '', creado: d.createdAt ?? '', lineas });
  }

  // Los albaranes de la pantalla antigua sólo son de venta.
  if (sentido === 'venta') {
    for (const a of albaranes) {
      if (a.clientId !== clienteId || a.id === excluirId || NO_VALEN.has(a.status)) continue;
      const lineas = (a.lineItems ?? []).filter(conContenido);
      if (!lineas.length) continue;
      candidatos.push({ id: a.id, tipo: 'albaran', numero: a.number, fecha: a.issueDate ?? '', creado: a.createdAt ?? '', lineas });
    }
  }

  candidatos.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creado.localeCompare(a.creado));
  return candidatos[0] ?? null;
}

export interface Condiciones {
  unitPrice: number;
  descuentos: readonly [number, number, number] | readonly number[];
  taxRate: number;
}

/**
 * Las líneas nuevas a partir de las del último documento. `nueva` da una
 * línea vacía con lo de la empresa (impuesto por defecto, casilla de cajas);
 * `condiciones` el precio de hoy de un artículo para esta ficha.
 */
export function lineasDeOtraVez(
  anterior: DocumentoAnterior,
  articulos: readonly Product[],
  condiciones: (p: Product) => Condiciones,
  nueva: () => InvoiceLineItem,
): { lineas: InvoiceLineItem[]; sinFicha: string[] } {
  const porId = new Map(articulos.map(p => [p.id, p]));
  const lineas: InvoiceLineItem[] = [];
  const sinFicha: string[] = [];

  for (const l of anterior.lineas) {
    const base = nueva();
    const cantidades = {
      quantity: l.quantity,
      ...(l.cajas != null ? { cajas: l.cajas } : {}),
      ...(l.unitsPerPackage ? { unitsPerPackage: l.unitsPerPackage } : {}),
    };

    if (!l.productId) {
      // Una línea escrita a mano (un porte, un servicio): tal cual estaba.
      lineas.push(recalcularLinea({
        ...base, ...cantidades,
        productId: '', productName: l.productName, productRef: l.productRef ?? '',
        unit: l.unit, unitPrice: l.unitPrice, taxRate: l.taxRate,
        discountPercent: l.discountPercent || 0, discountPercent2: l.discountPercent2 || 0, discountPercent3: l.discountPercent3 || 0,
      }));
      continue;
    }

    const p = porId.get(l.productId);
    if (!p || !p.active) {
      if (!sinFicha.includes(l.productName)) sinFicha.push(l.productName || l.productRef || 'Artículo sin nombre');
      continue;
    }
    const c = condiciones(p);
    lineas.push(recalcularLinea({
      ...base, ...cantidades,
      productId: p.id, productName: p.name, productRef: p.ref,
      unit: p.unit,
      unitsPerPackage: l.unitsPerPackage || p.unitsPerPackage,
      unitPrice: c.unitPrice, taxRate: c.taxRate,
      discountPercent: c.descuentos[0] ?? 0, discountPercent2: c.descuentos[1] ?? 0, discountPercent3: c.descuentos[2] ?? 0,
    }));
  }

  return { lineas, sinFicha };
}

/** ¿El documento está todavía en blanco (sólo líneas vacías)? */
export function lineasEnBlanco(lineas: readonly InvoiceLineItem[]): boolean {
  return lineas.every(l => !l.productId && !l.productName?.trim());
}
