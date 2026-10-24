// Lógica compartida de documentos (factura, presupuesto, pedido, albarán…).
import {
  Invoice, InvoiceLineItem, InvoiceStatus, UnitOfMeasure, CompanySettings, TipoDocumento, SentidoDocumento, Client, Product,
} from './types';
import { descuentoFamiliaDe, precioEspecialDe } from './preciosCliente';
import { generateInvoiceNumber, calculateLineSubtotal, calculateLineTax } from './utils';
import { getDefaultTaxRate } from './constants';
import { vocabularioDe } from './vocabulario';
import { serieDeTipo } from './storage';

export interface TotalesDocumento { subtotal: number; totalDiscount: number; totalTax: number; total: number; }

/**
 * Determina si un documento es estrictamente una factura (ordinaria, simplificada/TPV o rectificativa)
 * y no un documento previo o de almacén (presupuesto, pedido, albarán).
 */
export function isFactura(doc: { tipo?: string; sentido?: string; number?: string; series?: string }): boolean {
  const tipo = doc.tipo;
  const num = (doc.number || '').toUpperCase();
  const series = (doc.series || '').toUpperCase();

  // Si el tipo es explícitamente otro documento de gestión, no es factura
  if (tipo && tipo !== 'factura' && tipo !== 'rectificativa') return false;

  // Si el número o serie delata que es un albarán, pedido o presupuesto
  if (num.startsWith('ALB-') || num.startsWith('PED-') || num.startsWith('PRE-')) return false;
  if (series === 'ALB' || series === 'PED' || series === 'PRE') return false;

  // Solo operaciones de venta (o sin sentido declarado, compatible con registros legacy)
  const sentido = doc.sentido ?? 'venta';
  if (sentido !== 'venta') return false;

  return true;
}

export function lineaVacia(settings: CompanySettings): InvoiceLineItem {
  return {
    id: crypto.randomUUID(),
    productId: '',
    productName: '',
    productRef: '',
    quantity: 1,
    unitPrice: 0,
    unit: UnitOfMeasure.UNIDAD,
    taxRate: getDefaultTaxRate(settings),
    discountPercent: 0,
    // En los oficios que venden por cajas, la línea nace por unidades con
    // su casilla de cajas (ver cajas.ts).
    ...(vocabularioDe(settings.sector).usaBultos ? { cajas: 0 } : {}),
    subtotal: 0,
    taxAmount: 0,
    total: 0,
  };
}

/** Recalcula una línea con hasta 3 descuentos en cascada. */
export function recalcularLinea(line: InvoiceLineItem): InvoiceLineItem {
  const subtotal = calculateLineSubtotal(
    line.quantity,
    line.unitPrice,
    line.discountPercent,
    line.discountPercent2,
    line.discountPercent3,
  );
  const taxAmount = calculateLineTax(subtotal, line.taxRate);
  return { ...line, subtotal, taxAmount, total: Number((subtotal + taxAmount).toFixed(2)) };
}

/** Resuelve el precio adecuado de un producto según la tarifa asignada al cliente. */
export function getPrecioProductoParaCliente(
  product: { unitPrice: number; tarifaPrices?: Record<string, number> },
  tarifaId?: string,
  tarifas?: Array<{ id: string; porcentajeDefecto?: number }>,
): number {
  if (tarifaId && product.tarifaPrices?.[tarifaId] !== undefined) {
    return Number(product.tarifaPrices[tarifaId]);
  }
  if (tarifaId && tarifas) {
    const tarifa = tarifas.find(t => t.id === tarifaId);
    if (tarifa?.porcentajeDefecto) {
      // margen o descuento porcentual
      const factor = 1 + tarifa.porcentajeDefecto / 100;
      return Number((product.unitPrice * factor).toFixed(2));
    }
  }
  return product.unitPrice;
}

/** De dónde sale el precio de una línea de venta (para decírselo a quien la hace). */
export type OrigenPrecio = 'precio_especial' | 'descuento_articulo' | 'descuento_familia' | 'tarifa';

/**
 * Precio y descuentos de una línea de VENTA al elegir el artículo, con las
 * condiciones del cliente (migración 067). Manda lo más concreto:
 *
 *   1. Precio especial del cliente para ese artículo: sustituye al de la
 *      tarifa y a los descuentos de su ficha. Si además lleva descuento, va
 *      en la línea (ISECAN permite los dos a la vez).
 *   2. Descuento del cliente para ese artículo, sobre el precio de su tarifa.
 *   3. Descuento del cliente para la familia del artículo, sobre su tarifa.
 *   4. Lo de siempre: su tarifa y los descuentos de su ficha.
 *
 * En 2 y 3 el descuento ocupa el primer hueco y los otros dos (pronto pago,
 * especial…) siguen siendo los de la ficha: son acuerdos distintos que se
 * suman en cascada, no se pisan.
 */
export function condicionesDeVenta(
  product: { id: string; category?: string; unitPrice: number; tarifaPrices?: Record<string, number> },
  opts: {
    tarifaId?: string;
    tarifas?: Array<{ id: string; porcentajeDefecto?: number }>;
    defaultDiscounts?: [number, number, number];
    cliente?: Pick<Client, 'preciosEspeciales' | 'descuentosFamilia'> | null;
  },
): { unitPrice: number; descuentos: [number, number, number]; origen: OrigenPrecio } {
  const ficha = opts.defaultDiscounts ?? [0, 0, 0];
  const deTarifa = getPrecioProductoParaCliente(product, opts.tarifaId, opts.tarifas);
  const especial = precioEspecialDe(opts.cliente, product.id);

  if (especial?.precio) {
    return { unitPrice: especial.precio, descuentos: [especial.descuento ?? 0, 0, 0], origen: 'precio_especial' };
  }
  if (especial?.descuento) {
    return { unitPrice: deTarifa, descuentos: [especial.descuento, ficha[1] || 0, ficha[2] || 0], origen: 'descuento_articulo' };
  }
  const familia = descuentoFamiliaDe(opts.cliente, product.category);
  if (familia) {
    return { unitPrice: deTarifa, descuentos: [familia.descuento, ficha[1] || 0, ficha[2] || 0], origen: 'descuento_familia' };
  }
  return { unitPrice: deTarifa, descuentos: [ficha[0] || 0, ficha[1] || 0, ficha[2] || 0], origen: 'tarifa' };
}

/** El coste de un artículo: el precio medio y, sin él, la última compra o el precio de compra. */
export function costeDe(p: Pick<Product, 'costePmp' | 'costeUltimaCompra' | 'purchasePrice'>): number {
  return [p.costePmp, p.costeUltimaCompra, p.purchasePrice].find(v => (v ?? 0) > 0) ?? 0;
}

/** El precio de una línea después de sus tres descuentos en cascada. */
export function precioNetoDe(l: Pick<InvoiceLineItem, 'unitPrice' | 'discountPercent' | 'discountPercent2' | 'discountPercent3'>): number {
  return l.unitPrice * (1 - (l.discountPercent || 0) / 100) * (1 - (l.discountPercent2 || 0) / 100) * (1 - (l.discountPercent3 || 0) / 100);
}

export interface AvisoLinea {
  tipo: 'info' | 'aviso';
  texto: string;
}

/**
 * Lo que conviene saber de una línea mientras se escribe:
 *
 *   · el stock (en una venta): cuánto hay y cuánto quedará con TODAS las
 *     líneas del documento de ese artículo. Se puede vender sin stock (queda
 *     en negativo, como pendiente), pero se avisa;
 *   · si se vende por debajo del coste;
 *   · si se ha quedado sin precio;
 *   · si el mismo artículo ya está en otra línea.
 */
export function avisosDeLinea(
  linea: InvoiceLineItem,
  indice: number,
  todas: readonly InvoiceLineItem[],
  producto: Product | undefined,
  sentido: SentidoDocumento,
): AvisoLinea[] {
  if (!linea.productId || !producto) return [];
  const avisos: AvisoLinea[] = [];
  const fmt = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 3 });
  const eur = (n: number) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });

  const otra = todas.findIndex((l, i) => i !== indice && l.productId === linea.productId);
  if (otra >= 0 && otra < indice) {
    avisos.push({ tipo: 'aviso', texto: `Este artículo ya está en la línea ${otra + 1}.` });
  }

  if (linea.unitPrice === 0) {
    avisos.push({ tipo: 'aviso', texto: 'Sin precio: la línea sale a 0 €.' });
  }

  if (sentido === 'venta') {
    const stock = producto.stockQuantity ?? 0;
    const pedidas = todas.filter(l => l.productId === linea.productId).reduce((s, l) => s + (Number(l.quantity) || 0), 0);
    const quedara = stock - pedidas;
    avisos.push(quedara < 0
      ? { tipo: 'aviso', texto: `Stock ${fmt(stock)} ${producto.unit}: quedará en ${fmt(quedara)} (se puede vender igual; queda pendiente de entrar).` }
      : { tipo: 'info', texto: `Stock ${fmt(stock)} ${producto.unit} · quedarán ${fmt(quedara)}` });

    const coste = costeDe(producto);
    const neto = precioNetoDe(linea);
    if (coste > 0 && linea.unitPrice > 0 && neto < coste) {
      avisos.push({ tipo: 'aviso', texto: `Por debajo del coste: ${eur(neto)} la unidad y cuesta ${eur(coste)}.` });
    }
  }
  return avisos;
}

/**
 * El precio y el impuesto que propone una línea de COMPRA: el precio de
 * compra de la ficha o, si no se ha puesto, lo que costó la última entrada
 * y, sin entradas, el precio medio. Nunca el de venta: comprar a precio de
 * venta se come el margen sin que nadie lo vea. El impuesto, el de compra
 * si lo tiene y si no el de venta.
 */
export function condicionesDeCompra(
  product: Pick<Product, 'purchasePrice' | 'costeUltimaCompra' | 'costePmp' | 'purchaseTaxRate' | 'defaultTaxRate'>,
): { unitPrice: number; taxRate: number } {
  const unitPrice = [product.purchasePrice, product.costeUltimaCompra, product.costePmp].find(v => (v ?? 0) > 0) ?? 0;
  return { unitPrice, taxRate: product.purchaseTaxRate ?? product.defaultTaxRate };
}

/**
 * Las unidades pendientes de recibir (pedidos de compra) y de entregar
 * (pedidos de venta) de un producto.
 *
 * Cuenta lo pedido menos lo ya servido: los albaranes y facturas que
 * salieron de cada pedido (documentoOrigenId) descuentan sus unidades, así
 * que un pedido servido a medias deja pendiente solo lo que falta y uno
 * servido del todo deja de contar. Los borradores, rechazados, anulados y
 * facturados no comprometen nada.
 */
export function calcularPendientesProducto(
  productId: string,
  invoices: Invoice[],
): { pendienteRecibir: number; pendienteEntregar: number } {
  return pendientesPorProducto(invoices).get(productId) ?? { pendienteRecibir: 0, pendienteEntregar: 0 };
}

/** Lo mismo para todo el catálogo de una pasada (la lista de productos). */
export function pendientesPorProducto(
  invoices: Invoice[],
): Map<string, { pendienteRecibir: number; pendienteEntregar: number }> {
  const noCuenta: readonly InvoiceStatus[] = [InvoiceStatus.ANULADA, InvoiceStatus.FACTURADO, InvoiceStatus.BORRADOR, InvoiceStatus.RECHAZADO];
  const clave = (pedido: string, producto: string) => `${pedido}|${producto}`;

  // Lo ya servido de cada pedido, por producto.
  const servido = new Map<string, number>();
  for (const inv of invoices) {
    if (!inv.documentoOrigenId || inv.tipo === 'pedido' || inv.tipo === 'presupuesto') continue;
    if (inv.status === InvoiceStatus.ANULADA) continue;
    for (const li of inv.lineItems) {
      if (!li.productId) continue;
      const k = clave(inv.documentoOrigenId, li.productId);
      servido.set(k, (servido.get(k) ?? 0) + Number(li.quantity || 0));
    }
  }

  const salida = new Map<string, { pendienteRecibir: number; pendienteEntregar: number }>();
  for (const inv of invoices) {
    if (inv.tipo !== 'pedido' || noCuenta.includes(inv.status)) continue;
    const pedido = new Map<string, number>();
    for (const li of inv.lineItems) {
      if (li.productId) pedido.set(li.productId, (pedido.get(li.productId) ?? 0) + Number(li.quantity || 0));
    }
    for (const [productId, uds] of pedido) {
      const falta = Math.max(0, uds - (servido.get(clave(inv.id, productId)) ?? 0));
      if (!falta) continue;
      const fila = salida.get(productId) ?? { pendienteRecibir: 0, pendienteEntregar: 0 };
      if (inv.sentido === 'compra') fila.pendienteRecibir += falta;
      else fila.pendienteEntregar += falta;
      salida.set(productId, fila);
    }
  }
  return salida;
}

/** Un precio que ya se puso en un documento anterior. */
export interface PrecioAnterior {
  unitPrice: number;
  descuentos: [number, number, number];
  numero: string;
  fecha: string;
  tipo: TipoDocumento;
  /** Nombre de la ficha, cuando el precio es de otro cliente o proveedor. */
  tercero?: string;
}

/**
 * Lo último que se puso de un producto: a ESTE cliente (o proveedor) y, si
 * no, a cualquiera del mismo sentido (la última venta o la última compra).
 * Cuenta todo lo que llegó a enviarse o servirse —facturas, albaranes,
 * pedidos y presupuestos—; ni borradores, ni rechazados, ni anulados.
 */
export function preciosAnteriores(
  docs: readonly Invoice[],
  productId: string,
  opts: { clienteId?: string | null; sentido: SentidoDocumento; excluirId?: string },
): { cliente: PrecioAnterior | null; ultimo: PrecioAnterior | null } {
  const fuera: readonly InvoiceStatus[] = [InvoiceStatus.BORRADOR, InvoiceStatus.RECHAZADO, InvoiceStatus.ANULADA];
  let cliente: { p: PrecioAnterior; orden: string } | null = null;
  let ultimo: { p: PrecioAnterior; orden: string } | null = null;

  for (const d of docs) {
    if (d.id === opts.excluirId || (d.sentido ?? 'venta') !== opts.sentido || fuera.includes(d.status)) continue;
    if (d.tipo === 'rectificativa') continue;
    const li = d.lineItems.find(l => l.productId === productId && Number(l.quantity) > 0);
    if (!li) continue;
    const orden = `${d.issueDate}|${d.createdAt ?? ''}`;
    const p: PrecioAnterior = {
      unitPrice: li.unitPrice,
      descuentos: [li.discountPercent || 0, li.discountPercent2 || 0, li.discountPercent3 || 0],
      numero: d.number,
      fecha: d.issueDate,
      tipo: d.tipo ?? 'factura',
      tercero: d.clientName,
    };
    if (!ultimo || orden > ultimo.orden) ultimo = { p, orden };
    if (opts.clienteId && d.clientId === opts.clienteId && (!cliente || orden > cliente.orden)) cliente = { p, orden };
  }
  return { cliente: cliente?.p ?? null, ultimo: ultimo?.p ?? null };
}

/**
 * Lo que suele llevarse un cliente (o venderte un proveedor), de más a menos
 * veces: lo que se sugiere al pinchar en una línea vacía, antes de escribir.
 */
export function habitualesDe(
  docs: readonly Invoice[],
  clienteId: string | null | undefined,
  sentido: SentidoDocumento,
  max = 8,
): string[] {
  if (!clienteId) return [];
  const veces = new Map<string, { n: number; ultima: string }>();
  for (const d of docs) {
    if (d.clientId !== clienteId || (d.sentido ?? 'venta') !== sentido || d.status === InvoiceStatus.ANULADA) continue;
    for (const l of d.lineItems) {
      if (!l.productId) continue;
      const v = veces.get(l.productId) ?? { n: 0, ultima: '' };
      v.n += 1;
      if ((d.issueDate ?? '') > v.ultima) v.ultima = d.issueDate ?? '';
      veces.set(l.productId, v);
    }
  }
  return [...veces.entries()]
    .sort((a, b) => b[1].n - a[1].n || b[1].ultima.localeCompare(a[1].ultima))
    .slice(0, max)
    .map(([id]) => id);
}

/** Las fichas con más documentos en los últimos 90 días: las que se sugieren al pinchar en «Cliente». */
export function fichasFrecuentes(docs: readonly Invoice[], max = 8, hoy = new Date()): string[] {
  const desde = new Date(hoy.getTime() - 90 * 86_400_000).toISOString().slice(0, 10);
  const veces = new Map<string, number>();
  for (const d of docs) {
    if (!d.clientId || (d.issueDate ?? '') < desde || d.status === InvoiceStatus.ANULADA) continue;
    veces.set(d.clientId, (veces.get(d.clientId) ?? 0) + 1);
  }
  return [...veces.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([id]) => id);
}

/** Número y serie para un documento nuevo de un tipo/sentido. */
export function numeroDeDocumento(
  settings: CompanySettings, tipo: TipoDocumento, sentido: SentidoDocumento,
): { series: string; number: string; nextNumber: number } {
  const { serie, nextNumber } = serieDeTipo(settings, tipo, sentido);
  return { series: serie, number: generateInvoiceNumber(serie, nextNumber), nextNumber };
}

/** Estado inicial por tipo (mapeo tipo → estados permitidos). */
export const ESTADOS_POR_TIPO: Record<TipoDocumento, readonly InvoiceStatus[]> = {
  presupuesto: [InvoiceStatus.BORRADOR, InvoiceStatus.EMITIDA, InvoiceStatus.ANULADA],
  pedido: [InvoiceStatus.BORRADOR, InvoiceStatus.PRE_APROBACION, InvoiceStatus.APROBADO, InvoiceStatus.APROBADO_PARCIAL, InvoiceStatus.RECHAZADO, InvoiceStatus.EMITIDA, InvoiceStatus.ANULADA],
  albaran: [InvoiceStatus.BORRADOR, InvoiceStatus.EXPEDIDO, InvoiceStatus.FACTURADO, InvoiceStatus.ANULADA],
  factura: [InvoiceStatus.BORRADOR, InvoiceStatus.PRE_APROBACION, InvoiceStatus.APROBADO, InvoiceStatus.APROBADO_PARCIAL, InvoiceStatus.RECHAZADO, InvoiceStatus.EMITIDA, InvoiceStatus.PENDIENTE, InvoiceStatus.PAGADA, InvoiceStatus.VENCIDA, InvoiceStatus.ANULADA],
  rectificativa: [InvoiceStatus.BORRADOR, InvoiceStatus.EMITIDA, InvoiceStatus.ANULADA],
};

export function etiquetaTipo(tipo: TipoDocumento): string {
  const etiquetas: Record<TipoDocumento, string> = {
    presupuesto: 'Presupuesto', pedido: 'Pedido', albaran: 'Albarán',
    factura: 'Factura', rectificativa: 'Factura rectificativa',
  };
  return etiquetas[tipo];
}

export function numeroOrigen(doc: { tipo?: TipoDocumento; documentoOrigenNumber?: string }): string {
  if (!doc.documentoOrigenNumber) return '';
  return `${etiquetaTipo(doc.tipo ?? 'factura')} ${doc.documentoOrigenNumber}`;
}

/** Genera un nuevo documento convertido a partir de uno original (presupuesto -> pedido -> albarán -> factura). */
export function documentoConvertido(
  original: Invoice,
  nuevoTipo: TipoDocumento,
  settings: CompanySettings,
): Invoice {
  const { series, number } = numeroDeDocumento(settings, nuevoTipo, original.sentido ?? 'venta');
  const now = new Date().toISOString();
  return {
    ...original,
    id: crypto.randomUUID(),
    tipo: nuevoTipo,
    number,
    series,
    status: InvoiceStatus.BORRADOR,
    documentoOrigenId: original.documentoOrigenId ?? original.id,
    documentoOrigenNumber: original.documentoOrigenNumber ?? original.number,
    lineItems: (original.lineItems || []).map(li => ({
      ...li,
      id: crypto.randomUUID(),
    })),
    paidDate: undefined,
    paidAmount: 0,
    paymentRecordIds: [],
    verifactu: undefined,
    createdAt: now,
    updatedAt: now,
  };
}

/** Actualiza el contador de la serie tras crear un documento nuevo. */
export async function actualizarContadorSerie(
  settings: CompanySettings,
  clave: string,
  numeroUsado: string,
): Promise<void> {
  const { sequenceFromNumber } = await import('./utils');
  const { saveCompanySettings } = await import('./storage');
  const seq = sequenceFromNumber(numeroUsado);
  const seriesDoc = { ...(settings.seriesDocumentos ?? {}) };
  const prev = seriesDoc[clave] ?? { serie: clave.split('_')[0].toUpperCase(), nextNumber: 1 };
  seriesDoc[clave] = {
    ...prev,
    nextNumber: Math.max(prev.nextNumber, seq + 1),
  };
  await saveCompanySettings({
    ...settings,
    seriesDocumentos: seriesDoc,
  });
}

/** Crea una factura rectificativa con importes negativos a partir de una factura emitida. */
export function rectificar(original: Invoice, settings: CompanySettings): Invoice {
  const { series, number } = numeroDeDocumento(settings, 'rectificativa', original.sentido ?? 'venta');
  const now = new Date().toISOString();
  const lineItems = original.lineItems.map((li: InvoiceLineItem) => ({
    ...li,
    id: crypto.randomUUID(),
    quantity: -Math.abs(li.quantity),
  }));
  return {
    ...original,
    id: crypto.randomUUID(),
    tipo: 'rectificativa',
    number,
    series,
    status: InvoiceStatus.BORRADOR,
    documentoOrigenId: original.id,
    documentoOrigenNumber: original.number,
    lineItems,
    createdAt: now,
    updatedAt: now,
  };
}

/** Resuelve la serie asignada al vendedor del cliente, si existe. */
export async function serieParaCliente(
  clientId: string | undefined,
  tipo: TipoDocumento,
  sentido: SentidoDocumento,
): Promise<{ serie: string; nextNumber: number } | null> {
  if (!clientId) return null;
  const { getClientById, getVendedores, getInvoices } = await import('./storage');
  const client = await getClientById(clientId);
  if (!client?.vendedorId) return null;
  const vendedores = await getVendedores();
  const vendedor = vendedores.find(v => v.id === client.vendedorId);
  const serie = vendedor?.series?.[`${tipo}_${sentido}`];
  if (!serie) return null;
  const invoices = await getInvoices();
  const usadas = invoices
    .filter(i => i.series === serie)
    .map(i => Number(i.number.match(/-(\d+)$/)?.[1] ?? 0));
  return { serie, nextNumber: usadas.length ? Math.max(...usadas) + 1 : 1 };
}



/**
 * El descuento que de verdad se le hace a una línea, en un solo porcentaje.
 *
 * Los tres descuentos van en cascada, no sumados: un 10 y luego otro 10 no son
 * un 20, son un 19, porque el segundo se aplica sobre lo que quedó del
 * primero. Sumarlos en el papel diría un número que no cuadra con el importe
 * impreso al lado, y eso es lo primero que mira un cliente que revisa.
 *
 * Hace falta porque en la factura impresa y en la vista del documento sólo
 * cabe una casilla de descuento: lo que se enseña ahí tiene que ser el
 * efectivo, no el primero de los tres.
 */
export function descuentoEfectivo(line: {
  discountPercent: number;
  discountPercent2?: number;
  discountPercent3?: number;
}): number {
  const queda = (1 - (line.discountPercent || 0) / 100)
    * (1 - (line.discountPercent2 || 0) / 100)
    * (1 - (line.discountPercent3 || 0) / 100);
  return Number(((1 - queda) * 100).toFixed(2));
}

/**
 * Cuántas unidades suman las líneas de un documento (las UDES.), contando
 * las cajas de las líneas de antes. Vive en `cajas.ts`, con el resto de la
 * cuenta de cajas y unidades.
 */
export { unidadesTotales } from './cajas';
