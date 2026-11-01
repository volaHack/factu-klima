// Lógica compartida de documentos (factura, presupuesto, pedido, albarán…).
import {
  Invoice, InvoiceLineItem, InvoiceStatus, UnitOfMeasure, CompanySettings, TipoDocumento, SentidoDocumento, Client, Product,
} from './types';
import { descuentoFamiliaDe, precioEspecialDe } from './preciosCliente';
import { generateInvoiceNumber, calculateLineSubtotal, calculateLineTax, calculateInvoiceTotals, getToday, addDays } from './utils';
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
 *   · si se ha quedado sin precio;
 *   · si el mismo artículo ya está en otra línea.
 *
 * Lo de vender por debajo del coste ya no va aquí: lo dice el margen de la
 * línea (margen.ts), que además avisa antes, cuando el margen es muy bajo.
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

/** La clave de `servidoPorPedido`: un pedido y uno de sus productos. */
export const claveServido = (pedidoId: string, productId: string) => `${pedidoId}|${productId}`;

/**
 * Lo que identifica una línea al contar lo servido: su artículo y, si no
 * tiene (los portes, un servicio, una línea escrita a mano), su texto.
 * Antes las líneas sin artículo no se contaban nunca como servidas, y un
 * pedido con una línea de portes se quedaba en la cola del almacén para
 * siempre aunque se hubiera entregado entero. Vacía: la línea no cuenta.
 */
export function articuloDeLinea(li: Pick<InvoiceLineItem, 'productId' | 'productName'>): string {
  if (li.productId) return li.productId;
  const texto = (li.productName ?? '').trim().toLowerCase();
  return texto ? `~${texto}` : '';
}

/**
 * Lo ya servido de cada pedido, por producto: lo que suman los albaranes y
 * facturas que salieron de él (documentoOrigenId) y no se anularon. Lo usan
 * lo pendiente de cada artículo y la cola del almacén (prepararPedidos.ts),
 * para que los dos digan lo mismo de un pedido servido a medias.
 *
 * Sólo cuenta lo que sale DIRECTAMENTE del pedido: la factura de un albarán
 * apunta al albarán (ver documentoConvertido), así que la mercancía de un
 * albarán ya facturado no se cuenta dos veces.
 */
export function servidoPorPedido(invoices: readonly Invoice[]): Map<string, number> {
  const servido = new Map<string, number>();
  for (const inv of invoices) {
    if (!inv.documentoOrigenId || inv.tipo === 'pedido' || inv.tipo === 'presupuesto') continue;
    if (inv.status === InvoiceStatus.ANULADA) continue;
    for (const li of inv.lineItems) {
      const articulo = articuloDeLinea(li);
      if (!articulo) continue;
      const k = claveServido(inv.documentoOrigenId, articulo);
      servido.set(k, (servido.get(k) ?? 0) + Number(li.quantity || 0));
    }
  }
  return servido;
}

/** Lo mismo para todo el catálogo de una pasada (la lista de productos). */
export function pendientesPorProducto(
  invoices: Invoice[],
): Map<string, { pendienteRecibir: number; pendienteEntregar: number }> {
  const noCuenta: readonly InvoiceStatus[] = [InvoiceStatus.ANULADA, InvoiceStatus.FACTURADO, InvoiceStatus.BORRADOR, InvoiceStatus.RECHAZADO];
  const clave = claveServido;
  const servido = servidoPorPedido(invoices);

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

/**
 * El contador de un tipo de documento: su serie y el siguiente número.
 *
 * Las facturas y los albaranes de venta tienen, además del contador de los
 * documentos (`seriesDocumentos`), el de siempre: la serie y el número de
 * Ajustes (`invoiceSeries`), que usan «Nueva factura», las recurrentes y la
 * facturación de albaranes, y el de la pantalla «Albaranes»
 * (`albaranSeries`). Eran dos contadores para lo mismo: la factura sacada
 * de un albarán cogía el FAC-2026-0027 de uno mientras «Nueva factura» iba
 * por el F-2026-1200 del otro (y, con la misma serie, los dos acababan
 * dando el mismo número). Manda el de siempre, que es el que se ve y se
 * cambia en Ajustes; si el de documentos iba por delante en la misma
 * serie, el mayor, para no repetir ninguno.
 */
export function contadorDeTipo(
  settings: CompanySettings, tipo: TipoDocumento, sentido: SentidoDocumento,
): { serie: string; nextNumber: number } {
  const propio = serieDeTipo(settings, tipo, sentido);
  const deSiempre = sentido !== 'venta' ? null
    : tipo === 'factura' ? { serie: settings.invoiceSeries, nextNumber: settings.nextInvoiceNumber }
    : tipo === 'albaran' ? { serie: settings.albaranSeries, nextNumber: settings.nextAlbaranNumber }
    : null;
  if (!deSiempre?.serie) return propio;
  const mismaSerie = propio.serie === deSiempre.serie;
  return {
    serie: deSiempre.serie,
    nextNumber: Math.max(Number(deSiempre.nextNumber) || 1, mismaSerie ? Number(propio.nextNumber) || 1 : 1),
  };
}

/** Número y serie para un documento nuevo de un tipo/sentido. */
export function numeroDeDocumento(
  settings: CompanySettings, tipo: TipoDocumento, sentido: SentidoDocumento,
): { series: string; number: string; nextNumber: number } {
  const { serie, nextNumber } = contadorDeTipo(settings, tipo, sentido);
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

/**
 * «Albarán ALB-2026-0030»: el documento de origen con SU tipo. Antes se
 * ponía el tipo del documento que se miraba («Factura ALB-2026-0030»). Sin
 * el origen a mano, el número a secas: mejor que un tipo inventado.
 */
export function numeroOrigen(
  doc: { documentoOrigenId?: string; documentoOrigenNumber?: string },
  documentos: readonly Pick<Invoice, 'id' | 'tipo'>[] = [],
): string {
  if (!doc.documentoOrigenNumber) return '';
  const origen = doc.documentoOrigenId ? documentos.find(d => d.id === doc.documentoOrigenId) : undefined;
  return origen ? `${etiquetaTipo(origen.tipo ?? 'factura')} ${doc.documentoOrigenNumber}` : doc.documentoOrigenNumber;
}

export interface OpcionesConversion {
  /** Las líneas que lleva, si no son todas las del original (lo que falta por servir de un pedido). */
  lineItems?: InvoiceLineItem[];
  /** La serie del vendedor del cliente, si tiene una propia (serieParaCliente). */
  serie?: { serie: string; nextNumber: number } | null;
  /** La fecha del documento nuevo (AAAA-MM-DD). Por defecto, hoy. */
  hoy?: string;
}

const diasEntre = (desde?: string, hasta?: string): number | null => {
  const a = Date.parse(desde ?? '');
  const b = Date.parse(hasta ?? '');
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 86_400_000) : null;
};

/**
 * Genera un nuevo documento convertido a partir de uno original
 * (presupuesto → pedido → albarán → factura).
 *
 * Se copia todo lo que es del acuerdo con el cliente: sus datos fiscales,
 * las líneas con sus precios, descuentos en cascada e impuesto, el
 * descuento al pie, la retención, las notas, la forma de pago, el vendedor,
 * la tarifa, el almacén y la obra. Los totales salen otra vez de las
 * líneas, igual que al guardar: con las mismas líneas, los mismos al
 * céntimo.
 *
 * Lo que NO se copia es cómo le fue al original: cobros, sello, anulación,
 * envío al SII, tipo fiscal (se decide al emitir) o si su número era
 * provisional.
 *
 * EL ORIGEN ES EL DOCUMENTO DEL QUE SALE
 *
 * No el primero de la cadena. Antes se arrastraba el primero, y la factura
 * de un albarán que venía de un pedido quedaba colgada del pedido. Con eso:
 *   · la base de datos no la veía como factura de un albarán y descontaba
 *     el stock otra vez (ya lo había descontado el albarán, migración 074);
 *   · el pedido contaba como servida la misma mercancía dos veces (albarán
 *     y factura), y uno servido a medias parecía servido del todo.
 * La cadena entera se sigue de eslabón en eslabón (flujoVenta.trazaDe).
 *
 * LA FECHA, LA DE HOY
 *
 * La factura de un albarán del lunes que se hace el viernes es del
 * viernes; con la fecha de un presupuesto de hace un mes saldría
 * desordenada en su serie. El vencimiento conserva el plazo del original.
 */
export function documentoConvertido(
  original: Invoice,
  nuevoTipo: TipoDocumento,
  settings: CompanySettings,
  opciones: OpcionesConversion = {},
): Invoice {
  const hoy = opciones.hoy ?? getToday();
  const { series, number } = opciones.serie
    ? { series: opciones.serie.serie, number: generateInvoiceNumber(opciones.serie.serie, opciones.serie.nextNumber, Number(hoy.slice(0, 4))) }
    : numeroDeDocumento(settings, nuevoTipo, original.sentido ?? 'venta');
  const plazo = diasEntre(original.issueDate, original.dueDate);
  const now = new Date().toISOString();
  const lineItems = (opciones.lineItems ?? original.lineItems ?? []).map(li => ({ ...li, id: crypto.randomUUID() }));
  const totales = calculateInvoiceTotals(lineItems, [
    original.globalDiscountPercent1 ?? 0,
    original.globalDiscountPercent2 ?? 0,
    original.globalDiscountPercent3 ?? 0,
  ]);
  return {
    ...original,
    id: crypto.randomUUID(),
    tipo: nuevoTipo,
    number,
    series,
    status: InvoiceStatus.BORRADOR,
    issueDate: hoy,
    dueDate: plazo !== null && plazo >= 0 ? addDays(hoy, plazo) : hoy,
    documentoOrigenId: original.id,
    documentoOrigenNumber: original.number,
    lineItems,
    subtotal: totales.subtotal,
    totalDiscount: totales.totalDiscount,
    totalTax: totales.totalTax,
    total: totales.total,
    taxBreakdown: totales.taxBreakdown,
    paidDate: undefined,
    paidAmount: 0,
    paymentRecordIds: [],
    verifactu: undefined,
    cancelReason: undefined,
    cancelledAt: undefined,
    siiStatus: undefined,
    tipoFacturaFiscal: undefined,
    numberTemporary: false,
    posSessionId: undefined,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Actualiza el contador de la serie tras crear un documento nuevo.
 *
 * Sobre los ajustes recién leídos, no sobre los que la pantalla cargó al
 * abrirse: guardar aquella copia entera pisaba cualquier ajuste cambiado
 * entre medias (otro contador, otra pestaña).
 *
 * Un número de OTRA serie (la del vendedor del cliente) no toca el
 * contador de la empresa: antes el PED-2026-0009 saltaba al 51 porque el
 * vendedor iba por su V1-2026-0050. La serie del vendedor cuenta sola, por
 * los documentos que ya tiene (serieParaCliente).
 *
 * En facturas y albaranes de venta sube también el contador de siempre
 * (ver contadorDeTipo), que es el que usan las demás pantallas.
 */
export async function actualizarContadorSerie(
  settings: CompanySettings,
  clave: string,
  numeroUsado: string,
): Promise<void> {
  const { sequenceFromNumber } = await import('./utils');
  const { saveCompanySettings, getCompanySettings } = await import('./storage');
  const actuales = (await getCompanySettings().catch(() => null)) ?? settings;
  const [tipo, sentido] = clave.split('_') as [TipoDocumento, SentidoDocumento];
  const { serie } = contadorDeTipo(actuales, tipo, sentido);
  if (!numeroUsado.startsWith(`${serie}-`)) return;

  const siguiente = sequenceFromNumber(numeroUsado) + 1;
  const seriesDoc = { ...(actuales.seriesDocumentos ?? {}) };
  const prev = seriesDoc[clave];
  seriesDoc[clave] = { ...prev, serie, nextNumber: Math.max(prev?.serie === serie ? prev.nextNumber : 1, siguiente) };
  const deSiempre: Partial<CompanySettings> = {};
  if (clave === 'factura_venta' && actuales.invoiceSeries === serie) {
    deSiempre.nextInvoiceNumber = Math.max(actuales.nextInvoiceNumber || 1, siguiente);
  }
  if (clave === 'albaran_venta' && actuales.albaranSeries === serie) {
    deSiempre.nextAlbaranNumber = Math.max(actuales.nextAlbaranNumber || 1, siguiente);
  }
  await saveCompanySettings({ ...actuales, ...deSiempre, seriesDocumentos: seriesDoc });
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
