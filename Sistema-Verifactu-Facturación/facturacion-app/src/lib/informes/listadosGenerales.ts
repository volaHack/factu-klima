/**
 * LOS LISTADOS DE SIEMPRE
 *
 * Los que trae cualquier programa de gestión en su menú «Listados»: las
 * fichas (proveedores, clientes, artículos, precios), los movimientos
 * (compras y ventas línea a línea, por proveedor y por cliente), la
 * rentabilidad, las estadísticas, la caja por formas de pago, los libros
 * de facturas emitidas y recibidas, el inventario valorado, el historial
 * del programa anterior y los impuestos de compra y de venta.
 *
 * Cada listado dice qué filtros le sirven y devuelve una hoja: columnas,
 * filas y qué columnas se suman al pie. La pantalla (app/(app)/listados)
 * la pinta, la imprime y la baja a Excel igual para todos.
 *
 * Las cuentas, todas aquí y probadas: un listado que suma mal es peor que
 * no tenerlo.
 */

import { InvoiceStatus, type Client, type CobroPago, type Invoice, type Product } from '../types';
import { costeDe, documentosDeCompra, documentosDeVenta } from '../asistencia/operativa';
import { casaTexto } from '../casaTexto';
import type { FilaListadoHistorico } from '../historico';

export type TipoColumna = 'texto' | 'mono' | 'num' | 'eur' | 'pct' | 'fecha';

export interface Columna {
  clave: string;
  titulo: string;
  tipo: TipoColumna;
  /** Se suma al pie. */
  suma?: boolean;
}

export type Celda = string | number | null;

export interface Hoja {
  columnas: Columna[];
  filas: Record<string, Celda>[];
  /** Una línea bajo el título: de dónde sale, qué no incluye. */
  nota?: string;
}

export interface DatosListados {
  facturas: Invoice[];
  clientes: Client[];
  productos: Product[];
  movimientos: CobroPago[];
  categorias: { value: string; label: string }[];
  vendedores: { id: string; nombre: string }[];
  formasDePago: { value: string; label: string }[];
  historico?: FilaListadoHistorico[];
}

export interface FiltroGeneral {
  desde?: string;
  hasta?: string;
  /** Un cliente o proveedor concreto. */
  terceroId?: string;
  familia?: string;
  productoId?: string;
  /** Texto libre sobre las filas ya hechas. */
  texto?: string;
  soloActivos?: boolean;
  soloConStock?: boolean;
}

export type GrupoListadoGeneral = 'fichas' | 'movimientos' | 'estadisticas' | 'caja' | 'almacen' | 'fiscal';

export interface ListadoGeneral {
  id: string;
  nombre: string;
  grupo: GrupoListadoGeneral;
  /** Qué filtros tienen sentido en este listado. */
  usa: { fechas?: boolean; tercero?: 'cliente' | 'proveedor' | 'ambos'; familia?: boolean; articulo?: boolean; activos?: boolean; conStock?: boolean };
  /** El listado del programa anterior: sus datos llegan de la base de datos. */
  historico?: boolean;
  generar: (d: DatosListados, f: FiltroGeneral) => Hoja;
}

export const GRUPOS_LISTADO_GENERAL: { id: GrupoListadoGeneral; nombre: string }[] = [
  { id: 'fichas', nombre: 'Fichas' },
  { id: 'movimientos', nombre: 'Compras y ventas' },
  { id: 'estadisticas', nombre: 'Estadísticas' },
  { id: 'caja', nombre: 'Caja' },
  { id: 'almacen', nombre: 'Almacén' },
  { id: 'fiscal', nombre: 'Libros e impuestos' },
];

// ------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const r4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;

function enFechas(fecha: string | undefined | null, f: FiltroGeneral): boolean {
  const d = fecha ?? '';
  if (f.desde && d < f.desde) return false;
  if (f.hasta && d > f.hasta) return false;
  return true;
}

const NO_CUENTA: readonly string[] = [InvoiceStatus.BORRADOR, InvoiceStatus.ANULADA, InvoiceStatus.RECHAZADO, InvoiceStatus.PRE_APROBACION];

/** El nombre con que se ve una ficha. */
const nombre = (c: Pick<Client, 'tradeName' | 'businessName'>) => c.tradeName || c.businessName;

function nombreFamilia(d: DatosListados, valor: string): string {
  return d.categorias.find(c => c.value === valor)?.label ?? valor;
}

function nombreForma(d: DatosListados, valor: string): string {
  return d.formasDePago.find(c => c.value === valor)?.label ?? valor;
}

/** La base de una línea: su subtotal (ya con los descuentos de línea). */
const baseLinea = (l: Invoice['lineItems'][number]) => Number(l.subtotal) || 0;

interface LineaMovimiento {
  doc: Invoice;
  linea: Invoice['lineItems'][number];
  producto?: Product;
}

/** Las líneas de los documentos que cuentan, con los filtros puestos. */
function lineasDe(docs: readonly Invoice[], d: DatosListados, f: FiltroGeneral): LineaMovimiento[] {
  const porId = new Map(d.productos.map(p => [p.id, p]));
  const salida: LineaMovimiento[] = [];
  for (const doc of docs) {
    if (!enFechas(doc.issueDate, f)) continue;
    if (f.terceroId && doc.clientId !== f.terceroId) continue;
    for (const linea of doc.lineItems) {
      const producto = linea.productId ? porId.get(linea.productId) : undefined;
      if (f.productoId && linea.productId !== f.productoId) continue;
      if (f.familia && producto?.category !== f.familia) continue;
      salida.push({ doc, linea, producto });
    }
  }
  return salida;
}

const NOMBRE_TIPO: Record<string, string> = {
  factura: 'Factura', albaran: 'Albarán', pedido: 'Pedido', presupuesto: 'Presupuesto', rectificativa: 'Rectificativa',
};

/** Facturas y rectificativas emitidas de un sentido: lo que va a los libros y a los impuestos. */
function facturasDelLibro(d: DatosListados, sentido: 'venta' | 'compra', f: FiltroGeneral): Invoice[] {
  return d.facturas
    .filter(x => (x.sentido ?? 'venta') === sentido && (x.tipo === 'factura' || x.tipo === 'rectificativa' || !x.tipo))
    .filter(x => !NO_CUENTA.includes(x.status))
    .filter(x => enFechas(x.issueDate, f))
    .filter(x => !f.terceroId || x.clientId === f.terceroId)
    .sort((a, b) => (a.issueDate ?? '').localeCompare(b.issueDate ?? '') || (a.number ?? '').localeCompare(b.number ?? '', 'es', { numeric: true }));
}

/** El desglose de impuestos de una factura: el guardado o, si no lo hay, el de sus líneas. */
export function desgloseDe(x: Invoice): { rate: number; base: number; amount: number }[] {
  if (x.taxBreakdown?.length) return x.taxBreakdown;
  const acc = new Map<number, { rate: number; base: number; amount: number }>();
  for (const l of x.lineItems) {
    const t = acc.get(l.taxRate) ?? { rate: l.taxRate, base: 0, amount: 0 };
    t.base += Number(l.subtotal) || 0;
    t.amount += Number(l.taxAmount) || 0;
    acc.set(l.taxRate, t);
  }
  return [...acc.values()];
}

// ------------------------------------------------------------
// Los listados
// ------------------------------------------------------------

function fichas(d: DatosListados, f: FiltroGeneral, proveedores: boolean): Hoja {
  const vendedor = (id?: string) => d.vendedores.find(v => v.id === id)?.nombre ?? '';
  const filas = d.clientes
    .filter(c => Boolean(c.esProveedor) === proveedores && !c.isWalkIn)
    .filter(c => !f.soloActivos || c.active)
    .sort((a, b) => nombre(a).localeCompare(nombre(b), 'es', { sensitivity: 'base' }))
    .map(c => ({
      codigo: c.codigo ?? '',
      nombre: nombre(c),
      razon: c.businessName !== nombre(c) ? c.businessName : '',
      nif: c.nif,
      direccion: [c.address, c.postalCode, c.city, c.province].filter(Boolean).join(', '),
      telefono: c.phone,
      email: c.email,
      contacto: c.contactPerson,
      pago: `${nombreForma(d, c.defaultPaymentMethod)}${c.paymentDays ? ` ${c.paymentDays} d` : ''}`,
      ...(proveedores ? {} : { vendedor: vendedor(c.vendedorId) }),
      estado: c.active ? '' : 'Baja',
    }));
  return {
    columnas: [
      { clave: 'codigo', titulo: 'Código', tipo: 'mono' },
      { clave: 'nombre', titulo: 'Nombre', tipo: 'texto' },
      { clave: 'razon', titulo: 'Razón social', tipo: 'texto' },
      { clave: 'nif', titulo: 'NIF', tipo: 'mono' },
      { clave: 'direccion', titulo: 'Dirección', tipo: 'texto' },
      { clave: 'telefono', titulo: 'Teléfono', tipo: 'mono' },
      { clave: 'email', titulo: 'Correo', tipo: 'texto' },
      { clave: 'contacto', titulo: 'Contacto', tipo: 'texto' },
      { clave: 'pago', titulo: 'Forma de pago', tipo: 'texto' },
      ...(proveedores ? [] : [{ clave: 'vendedor', titulo: 'Vendedor', tipo: 'texto' as const }]),
      { clave: 'estado', titulo: 'Estado', tipo: 'texto' },
    ],
    filas,
  };
}

function articulos(d: DatosListados, f: FiltroGeneral): Hoja {
  const filas = d.productos
    .filter(p => !f.soloActivos || p.active !== false)
    .filter(p => !f.familia || p.category === f.familia)
    .filter(p => !f.soloConStock || (p.stockQuantity ?? 0) !== 0)
    .sort((a, b) => (a.ref ?? '').localeCompare(b.ref ?? '', 'es', { numeric: true }))
    .map(p => ({
      ref: p.ref,
      nombre: p.name,
      familia: nombreFamilia(d, p.category),
      unidad: p.unit,
      uc: p.unitsPerPackage ?? null,
      barras: p.barcode ?? '',
      refProv: p.supplierRef ?? '',
      stock: p.stockQuantity ?? 0,
      pvp: p.unitPrice,
      iva: p.defaultTaxRate,
      estado: p.active === false ? 'Baja' : '',
    }));
  return {
    columnas: [
      { clave: 'ref', titulo: 'Ref.', tipo: 'mono' },
      { clave: 'nombre', titulo: 'Artículo', tipo: 'texto' },
      { clave: 'familia', titulo: 'Familia', tipo: 'texto' },
      { clave: 'unidad', titulo: 'Ud.', tipo: 'texto' },
      { clave: 'uc', titulo: 'U/C', tipo: 'num' },
      { clave: 'barras', titulo: 'Cód. barras', tipo: 'mono' },
      { clave: 'refProv', titulo: 'Ref. prov.', tipo: 'mono' },
      { clave: 'stock', titulo: 'Stock', tipo: 'num', suma: true },
      { clave: 'pvp', titulo: 'PVP', tipo: 'eur' },
      { clave: 'iva', titulo: '% Imp.', tipo: 'num' },
      { clave: 'estado', titulo: 'Estado', tipo: 'texto' },
    ],
    filas,
  };
}

function precios(d: DatosListados, f: FiltroGeneral): Hoja {
  const filas = d.productos
    .filter(p => !f.soloActivos || p.active !== false)
    .filter(p => !f.familia || p.category === f.familia)
    .sort((a, b) => (a.ref ?? '').localeCompare(b.ref ?? '', 'es', { numeric: true }))
    .map(p => {
      const coste = costeDe(p);
      return {
        ref: p.ref,
        nombre: p.name,
        compra: p.purchasePrice || null,
        entrada: p.costeUltimaCompra || null,
        medio: p.costePmp || null,
        pvp: p.unitPrice,
        margen: coste > 0 && p.unitPrice > 0 ? r2((1 - coste / p.unitPrice) * 100) : null,
        ivaVenta: p.defaultTaxRate,
        ivaCompra: p.purchaseTaxRate ?? p.defaultTaxRate,
        pvpImp: r2(p.unitPrice * (1 + p.defaultTaxRate / 100)),
      };
    });
  return {
    columnas: [
      { clave: 'ref', titulo: 'Ref.', tipo: 'mono' },
      { clave: 'nombre', titulo: 'Artículo', tipo: 'texto' },
      { clave: 'compra', titulo: 'P. compra', tipo: 'eur' },
      { clave: 'entrada', titulo: 'Últ. entrada', tipo: 'eur' },
      { clave: 'medio', titulo: 'P. medio', tipo: 'eur' },
      { clave: 'pvp', titulo: 'PVP', tipo: 'eur' },
      { clave: 'margen', titulo: 'Margen', tipo: 'pct' },
      { clave: 'ivaCompra', titulo: '% Imp. compra', tipo: 'num' },
      { clave: 'ivaVenta', titulo: '% Imp. venta', tipo: 'num' },
      { clave: 'pvpImp', titulo: 'PVP con imp.', tipo: 'eur' },
    ],
    filas,
    nota: 'El margen sale del precio medio (o, sin él, de la última entrada o el precio de compra) sobre el PVP.',
  };
}

function movimientosLinea(d: DatosListados, f: FiltroGeneral, sentido: 'venta' | 'compra'): Hoja {
  const docs = sentido === 'venta' ? documentosDeVenta(d.facturas) : documentosDeCompra(d.facturas);
  const filas = lineasDe(docs, d, f)
    .sort((a, b) => (a.doc.issueDate ?? '').localeCompare(b.doc.issueDate ?? '') || (a.doc.number ?? '').localeCompare(b.doc.number ?? '', 'es', { numeric: true }))
    .map(({ doc, linea }) => ({
      fecha: doc.issueDate,
      documento: `${NOMBRE_TIPO[doc.tipo ?? 'factura'] ?? doc.tipo} ${doc.number}`,
      tercero: doc.clientName,
      ref: linea.productRef,
      articulo: linea.productName,
      unidades: Number(linea.quantity) || 0,
      precio: linea.unitPrice,
      dto: [linea.discountPercent, linea.discountPercent2, linea.discountPercent3].filter(x => x).join('+') || '',
      base: r2(baseLinea(linea)),
    }));
  return {
    columnas: [
      { clave: 'fecha', titulo: 'Fecha', tipo: 'fecha' },
      { clave: 'documento', titulo: 'Documento', tipo: 'mono' },
      { clave: 'tercero', titulo: sentido === 'venta' ? 'Cliente' : 'Proveedor', tipo: 'texto' },
      { clave: 'ref', titulo: 'Ref.', tipo: 'mono' },
      { clave: 'articulo', titulo: 'Artículo', tipo: 'texto' },
      { clave: 'unidades', titulo: 'Uds.', tipo: 'num', suma: true },
      { clave: 'precio', titulo: 'Precio', tipo: 'eur' },
      { clave: 'dto', titulo: 'Dto. %', tipo: 'texto' },
      { clave: 'base', titulo: 'Base', tipo: 'eur', suma: true },
    ],
    filas,
    nota: sentido === 'venta'
      ? 'Albaranes servidos y facturas emitidas; la factura que sale de un albarán no se cuenta dos veces.'
      : 'Albaranes recibidos y facturas de proveedor; la factura que sale de un albarán no se cuenta dos veces.',
  };
}

function porTercero(d: DatosListados, f: FiltroGeneral, sentido: 'venta' | 'compra'): Hoja {
  const docs = (sentido === 'venta' ? documentosDeVenta(d.facturas) : documentosDeCompra(d.facturas))
    .filter(x => enFechas(x.issueDate, f) && (!f.terceroId || x.clientId === f.terceroId));
  const acc = new Map<string, { nombre: string; nif: string; docs: number; base: number; impuestos: number; total: number; ultima: string }>();
  for (const x of docs) {
    const k = x.clientId || x.clientName;
    const a = acc.get(k) ?? { nombre: x.clientName, nif: x.clientNif, docs: 0, base: 0, impuestos: 0, total: 0, ultima: '' };
    a.docs += 1;
    a.base += x.subtotal || 0;
    a.impuestos += x.totalTax || 0;
    a.total += x.total || 0;
    if ((x.issueDate ?? '') > a.ultima) a.ultima = x.issueDate ?? '';
    acc.set(k, a);
  }
  const total = [...acc.values()].reduce((s, a) => s + a.base, 0);
  const filas = [...acc.values()]
    .sort((a, b) => b.base - a.base)
    .map(a => ({
      nombre: a.nombre, nif: a.nif, docs: a.docs, base: r2(a.base), impuestos: r2(a.impuestos), total: r2(a.total),
      peso: total ? r2((a.base / total) * 100) : 0, ultima: a.ultima,
    }));
  return {
    columnas: [
      { clave: 'nombre', titulo: sentido === 'venta' ? 'Cliente' : 'Proveedor', tipo: 'texto' },
      { clave: 'nif', titulo: 'NIF', tipo: 'mono' },
      { clave: 'docs', titulo: 'Docs.', tipo: 'num', suma: true },
      { clave: 'base', titulo: 'Base', tipo: 'eur', suma: true },
      { clave: 'impuestos', titulo: 'Impuestos', tipo: 'eur', suma: true },
      { clave: 'total', titulo: 'Total', tipo: 'eur', suma: true },
      { clave: 'peso', titulo: '% del total', tipo: 'pct' },
      { clave: 'ultima', titulo: 'Último', tipo: 'fecha' },
    ],
    filas,
  };
}

function rentabilidad(d: DatosListados, f: FiltroGeneral): Hoja {
  const acc = new Map<string, { ref: string; nombre: string; familia: string; uds: number; venta: number; coste: number }>();
  for (const { linea, producto } of lineasDe(documentosDeVenta(d.facturas), d, f)) {
    const k = linea.productId || `libre:${linea.productName}`;
    const a = acc.get(k) ?? { ref: linea.productRef, nombre: linea.productName, familia: producto ? nombreFamilia(d, producto.category) : '', uds: 0, venta: 0, coste: 0 };
    const q = Number(linea.quantity) || 0;
    const costeUd = (linea.costPrice ?? 0) > 0 ? linea.costPrice! : (producto ? costeDe(producto) : 0);
    a.uds += q;
    a.venta += baseLinea(linea);
    a.coste += q * costeUd;
    acc.set(k, a);
  }
  const filas = [...acc.values()]
    .sort((a, b) => (b.venta - b.coste) - (a.venta - a.coste))
    .map(a => ({
      ref: a.ref, nombre: a.nombre, familia: a.familia, uds: r4(a.uds), venta: r2(a.venta), coste: r2(a.coste),
      margen: r2(a.venta - a.coste), pct: a.venta ? r2(((a.venta - a.coste) / a.venta) * 100) : null,
    }));
  return {
    columnas: [
      { clave: 'ref', titulo: 'Ref.', tipo: 'mono' },
      { clave: 'nombre', titulo: 'Artículo', tipo: 'texto' },
      { clave: 'familia', titulo: 'Familia', tipo: 'texto' },
      { clave: 'uds', titulo: 'Uds.', tipo: 'num', suma: true },
      { clave: 'venta', titulo: 'Venta', tipo: 'eur', suma: true },
      { clave: 'coste', titulo: 'Coste', tipo: 'eur', suma: true },
      { clave: 'margen', titulo: 'Margen', tipo: 'eur', suma: true },
      { clave: 'pct', titulo: '% Margen', tipo: 'pct' },
    ],
    filas,
    nota: 'Coste: el que se guardó en la línea al vender o, si no, el precio medio actual del artículo.',
  };
}

function porMes(d: DatosListados, f: FiltroGeneral, sentido: 'venta' | 'compra'): Hoja {
  const docs = (sentido === 'venta' ? documentosDeVenta(d.facturas) : documentosDeCompra(d.facturas))
    .filter(x => enFechas(x.issueDate, f) && (!f.terceroId || x.clientId === f.terceroId));
  const acc = new Map<string, { docs: number; base: number; total: number }>();
  for (const x of docs) {
    const m = (x.issueDate ?? '').slice(0, 7);
    const a = acc.get(m) ?? { docs: 0, base: 0, total: 0 };
    a.docs += 1; a.base += x.subtotal || 0; a.total += x.total || 0;
    acc.set(m, a);
  }
  const meses = [...acc.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const filas = meses.map(([m, a], i) => {
    const anterior = meses.find(([mm]) => mm === `${Number(m.slice(0, 4)) - 1}${m.slice(4)}`)?.[1];
    return {
      mes: m, docs: a.docs, base: r2(a.base), total: r2(a.total),
      media: a.docs ? r2(a.base / a.docs) : 0,
      acumulado: r2(meses.slice(0, i + 1).filter(([mm]) => mm.slice(0, 4) === m.slice(0, 4)).reduce((s, [, x]) => s + x.base, 0)),
      vsAnio: anterior && anterior.base ? r2(((a.base - anterior.base) / anterior.base) * 100) : null,
    };
  });
  return {
    columnas: [
      { clave: 'mes', titulo: 'Mes', tipo: 'mono' },
      { clave: 'docs', titulo: 'Docs.', tipo: 'num', suma: true },
      { clave: 'base', titulo: 'Base', tipo: 'eur', suma: true },
      { clave: 'total', titulo: 'Total', tipo: 'eur', suma: true },
      { clave: 'media', titulo: 'Media por doc.', tipo: 'eur' },
      { clave: 'acumulado', titulo: 'Acumulado del año', tipo: 'eur' },
      { clave: 'vsAnio', titulo: 'vs. mismo mes año ant.', tipo: 'pct' },
    ],
    filas,
  };
}

function ventasPorFamilia(d: DatosListados, f: FiltroGeneral): Hoja {
  const acc = new Map<string, { uds: number; venta: number; coste: number; articulos: Set<string> }>();
  for (const { linea, producto } of lineasDe(documentosDeVenta(d.facturas), d, f)) {
    const k = producto ? nombreFamilia(d, producto.category) : 'Sin ficha';
    const a = acc.get(k) ?? { uds: 0, venta: 0, coste: 0, articulos: new Set<string>() };
    const q = Number(linea.quantity) || 0;
    a.uds += q; a.venta += baseLinea(linea);
    a.coste += q * ((linea.costPrice ?? 0) > 0 ? linea.costPrice! : (producto ? costeDe(producto) : 0));
    a.articulos.add(linea.productId || linea.productName);
    acc.set(k, a);
  }
  const total = [...acc.values()].reduce((s, a) => s + a.venta, 0);
  return {
    columnas: [
      { clave: 'familia', titulo: 'Familia', tipo: 'texto' },
      { clave: 'articulos', titulo: 'Artículos', tipo: 'num' },
      { clave: 'uds', titulo: 'Uds.', tipo: 'num', suma: true },
      { clave: 'venta', titulo: 'Venta', tipo: 'eur', suma: true },
      { clave: 'margen', titulo: 'Margen', tipo: 'eur', suma: true },
      { clave: 'peso', titulo: '% de la venta', tipo: 'pct' },
    ],
    filas: [...acc.entries()].sort((a, b) => b[1].venta - a[1].venta).map(([familia, a]) => ({
      familia, articulos: a.articulos.size, uds: r4(a.uds), venta: r2(a.venta), margen: r2(a.venta - a.coste),
      peso: total ? r2((a.venta / total) * 100) : 0,
    })),
  };
}

function rankingArticulos(d: DatosListados, f: FiltroGeneral): Hoja {
  const hoja = rentabilidad(d, f);
  const total = hoja.filas.reduce((s, x) => s + Number(x.venta), 0);
  let acumulado = 0;
  const filas = [...hoja.filas].sort((a, b) => Number(b.venta) - Number(a.venta)).map((x, i) => {
    acumulado += Number(x.venta);
    return {
      puesto: i + 1, ref: x.ref, nombre: x.nombre, uds: x.uds, venta: x.venta,
      peso: total ? r2((Number(x.venta) / total) * 100) : 0,
      acumulado: total ? r2((acumulado / total) * 100) : 0,
      abc: total ? (acumulado / total <= 0.8 ? 'A' : acumulado / total <= 0.95 ? 'B' : 'C') : '',
    };
  });
  return {
    columnas: [
      { clave: 'puesto', titulo: 'Nº', tipo: 'num' },
      { clave: 'ref', titulo: 'Ref.', tipo: 'mono' },
      { clave: 'nombre', titulo: 'Artículo', tipo: 'texto' },
      { clave: 'uds', titulo: 'Uds.', tipo: 'num', suma: true },
      { clave: 'venta', titulo: 'Venta', tipo: 'eur', suma: true },
      { clave: 'peso', titulo: '% venta', tipo: 'pct' },
      { clave: 'acumulado', titulo: '% acumulado', tipo: 'pct' },
      { clave: 'abc', titulo: 'ABC', tipo: 'texto' },
    ],
    filas,
    nota: 'Clasificación ABC: A, los que hacen el 80 % de la venta; B, hasta el 95 %; C, el resto.',
  };
}

function ventasPorVendedor(d: DatosListados, f: FiltroGeneral): Hoja {
  const cliente = new Map(d.clientes.map(c => [c.id, c]));
  const acc = new Map<string, { docs: number; base: number; clientes: Set<string> }>();
  for (const x of documentosDeVenta(d.facturas).filter(x => enFechas(x.issueDate, f))) {
    const vid = x.vendedorId || cliente.get(x.clientId)?.vendedorId;
    const k = d.vendedores.find(v => v.id === vid)?.nombre ?? 'Sin vendedor';
    const a = acc.get(k) ?? { docs: 0, base: 0, clientes: new Set<string>() };
    a.docs += 1; a.base += x.subtotal || 0; a.clientes.add(x.clientId || x.clientName);
    acc.set(k, a);
  }
  return {
    columnas: [
      { clave: 'vendedor', titulo: 'Vendedor', tipo: 'texto' },
      { clave: 'clientes', titulo: 'Clientes', tipo: 'num' },
      { clave: 'docs', titulo: 'Docs.', tipo: 'num', suma: true },
      { clave: 'base', titulo: 'Base', tipo: 'eur', suma: true },
      { clave: 'media', titulo: 'Media por doc.', tipo: 'eur' },
    ],
    filas: [...acc.entries()].sort((a, b) => b[1].base - a[1].base).map(([vendedor, a]) => ({
      vendedor, clientes: a.clientes.size, docs: a.docs, base: r2(a.base), media: a.docs ? r2(a.base / a.docs) : 0,
    })),
  };
}

function cajaFormasDePago(d: DatosListados, f: FiltroGeneral): Hoja {
  const acc = new Map<string, { cobros: number; nCobros: number; pagos: number; nPagos: number; tickets: number; nTickets: number }>();
  const fila = (k: string) => acc.get(k) ?? { cobros: 0, nCobros: 0, pagos: 0, nPagos: 0, tickets: 0, nTickets: 0 };
  for (const m of d.movimientos) {
    if (!enFechas(m.fecha, f) || (f.terceroId && m.contraparteId !== f.terceroId)) continue;
    const a = fila(m.paymentMethod);
    if (m.tipo === 'cobro') { a.cobros += m.importeTotal; a.nCobros += 1; } else { a.pagos += m.importeTotal; a.nPagos += 1; }
    acc.set(m.paymentMethod, a);
  }
  // Los tickets del TPV se cobran en el momento, sin apunte en Cobros.
  for (const x of d.facturas) {
    if (!x.posSessionId || NO_CUENTA.includes(x.status) || !enFechas(x.issueDate, f)) continue;
    const a = fila(x.paymentMethod);
    a.tickets += x.total || 0; a.nTickets += 1;
    acc.set(x.paymentMethod, a);
  }
  return {
    columnas: [
      { clave: 'forma', titulo: 'Forma de pago', tipo: 'texto' },
      { clave: 'nCobros', titulo: 'Cobros', tipo: 'num', suma: true },
      { clave: 'cobros', titulo: 'Cobrado', tipo: 'eur', suma: true },
      { clave: 'nTickets', titulo: 'Tickets TPV', tipo: 'num', suma: true },
      { clave: 'tickets', titulo: 'Cobrado en TPV', tipo: 'eur', suma: true },
      { clave: 'nPagos', titulo: 'Pagos', tipo: 'num', suma: true },
      { clave: 'pagos', titulo: 'Pagado', tipo: 'eur', suma: true },
      { clave: 'neto', titulo: 'Neto', tipo: 'eur', suma: true },
    ],
    filas: [...acc.entries()].map(([forma, a]) => ({
      forma: nombreForma(d, forma), nCobros: a.nCobros, cobros: r2(a.cobros), nTickets: a.nTickets, tickets: r2(a.tickets),
      nPagos: a.nPagos, pagos: r2(a.pagos), neto: r2(a.cobros + a.tickets - a.pagos),
    })).sort((a, b) => b.neto - a.neto),
  };
}

function libro(d: DatosListados, f: FiltroGeneral, sentido: 'venta' | 'compra'): Hoja {
  const filas: Record<string, Celda>[] = [];
  for (const x of facturasDelLibro(d, sentido, f)) {
    const desglose = desgloseDe(x);
    desglose.forEach((t, i) => {
      filas.push({
        fecha: x.issueDate, numero: x.number, nif: x.clientNif, nombre: x.clientName,
        base: r2(t.base), tipo: t.rate, cuota: r2(t.amount),
        retencion: i === 0 && x.retencionPct ? r2(-(x.subtotal || 0) * x.retencionPct / 100) : null,
        total: i === 0 ? r2(x.total || 0) : null,
        clase: x.tipo === 'rectificativa' ? 'R' : '',
      });
    });
  }
  return {
    columnas: [
      { clave: 'fecha', titulo: 'Fecha', tipo: 'fecha' },
      { clave: 'numero', titulo: 'Número', tipo: 'mono' },
      { clave: 'clase', titulo: 'Rect.', tipo: 'texto' },
      { clave: 'nif', titulo: 'NIF', tipo: 'mono' },
      { clave: 'nombre', titulo: sentido === 'venta' ? 'Cliente' : 'Proveedor', tipo: 'texto' },
      { clave: 'base', titulo: 'Base', tipo: 'eur', suma: true },
      { clave: 'tipo', titulo: '% Imp.', tipo: 'num' },
      { clave: 'cuota', titulo: 'Cuota', tipo: 'eur', suma: true },
      { clave: 'retencion', titulo: 'Retención', tipo: 'eur', suma: true },
      { clave: 'total', titulo: 'Total', tipo: 'eur', suma: true },
    ],
    filas,
    nota: `Facturas ${sentido === 'venta' ? 'emitidas' : 'recibidas'} y rectificativas, una línea por tipo impositivo. Sin borradores ni anuladas.`,
  };
}

function impuestos(d: DatosListados, f: FiltroGeneral, sentido: 'venta' | 'compra'): Hoja {
  const acc = new Map<number, { base: number; cuota: number; facturas: Set<string> }>();
  for (const x of facturasDelLibro(d, sentido, f)) {
    for (const t of desgloseDe(x)) {
      const a = acc.get(t.rate) ?? { base: 0, cuota: 0, facturas: new Set<string>() };
      a.base += t.base; a.cuota += t.amount; a.facturas.add(x.id);
      acc.set(t.rate, a);
    }
  }
  return {
    columnas: [
      { clave: 'tipo', titulo: '% Impuesto', tipo: 'num' },
      { clave: 'facturas', titulo: 'Facturas', tipo: 'num' },
      { clave: 'base', titulo: 'Base imponible', tipo: 'eur', suma: true },
      { clave: 'cuota', titulo: sentido === 'venta' ? 'Cuota repercutida' : 'Cuota soportada', tipo: 'eur', suma: true },
      { clave: 'total', titulo: 'Total', tipo: 'eur', suma: true },
    ],
    filas: [...acc.entries()].sort((a, b) => a[0] - b[0]).map(([tipo, a]) => ({
      tipo, facturas: a.facturas.size, base: r2(a.base), cuota: r2(a.cuota), total: r2(a.base + a.cuota),
    })),
    nota: 'Para el modelo del trimestre, acota las fechas al trimestre. Los modelos oficiales están en Listados fiscales.',
  };
}

function inventario(d: DatosListados, f: FiltroGeneral): Hoja {
  const filas = d.productos
    .filter(p => !f.soloActivos || p.active !== false)
    .filter(p => !f.familia || p.category === f.familia)
    .filter(p => !f.soloConStock || (p.stockQuantity ?? 0) !== 0)
    .sort((a, b) => nombreFamilia(d, a.category).localeCompare(nombreFamilia(d, b.category), 'es') || (a.ref ?? '').localeCompare(b.ref ?? '', 'es', { numeric: true }))
    .map(p => {
      const stock = p.stockQuantity ?? 0;
      const coste = costeDe(p);
      return {
        ref: p.ref, nombre: p.name, familia: nombreFamilia(d, p.category), stock,
        minimo: p.lowStockThreshold ?? null,
        coste: coste || null,
        valor: r2(Math.max(stock, 0) * coste),
        pvp: p.unitPrice,
        valorVenta: r2(Math.max(stock, 0) * p.unitPrice),
        aviso: stock < 0 ? 'Negativo' : p.lowStockThreshold && stock <= p.lowStockThreshold ? 'Bajo mínimo' : '',
      };
    });
  return {
    columnas: [
      { clave: 'ref', titulo: 'Ref.', tipo: 'mono' },
      { clave: 'nombre', titulo: 'Artículo', tipo: 'texto' },
      { clave: 'familia', titulo: 'Familia', tipo: 'texto' },
      { clave: 'stock', titulo: 'Stock', tipo: 'num', suma: true },
      { clave: 'minimo', titulo: 'Mínimo', tipo: 'num' },
      { clave: 'coste', titulo: 'P. medio', tipo: 'eur' },
      { clave: 'valor', titulo: 'Valor a coste', tipo: 'eur', suma: true },
      { clave: 'pvp', titulo: 'PVP', tipo: 'eur' },
      { clave: 'valorVenta', titulo: 'Valor a PVP', tipo: 'eur', suma: true },
      { clave: 'aviso', titulo: 'Aviso', tipo: 'texto' },
    ],
    filas,
    nota: 'Stock de hoy. El negativo no suma valor: es mercancía vendida que aún no ha entrado.',
  };
}

function historicoListado(d: DatosListados): Hoja {
  const filas = (d.historico ?? []).map(h => ({
    fecha: h.fecha, tipo: `${NOMBRE_TIPO[h.tipo] ?? h.tipo}${h.sentido === 'compra' ? ' de compra' : ''}`,
    numero: h.numero, tercero: h.cliente ?? h.codigoTercero ?? '', nif: h.clienteNif ?? '', total: r2(h.total),
    estado: h.estado === 'pendiente' ? 'Sin pasar a otro doc.' : h.estado === 'facturado' ? 'Facturado' : '',
  }));
  return {
    columnas: [
      { clave: 'fecha', titulo: 'Fecha', tipo: 'fecha' },
      { clave: 'tipo', titulo: 'Tipo', tipo: 'texto' },
      { clave: 'numero', titulo: 'Número', tipo: 'mono' },
      { clave: 'tercero', titulo: 'Cliente / proveedor', tipo: 'texto' },
      { clave: 'nif', titulo: 'NIF', tipo: 'mono' },
      { clave: 'total', titulo: 'Total', tipo: 'eur', suma: true },
      { clave: 'estado', titulo: 'Estado', tipo: 'texto' },
    ],
    filas,
    nota: 'Documentos del programa anterior: solo consulta. Las líneas de esos documentos aún no están cargadas.',
  };
}

export const LISTADOS_GENERALES: ListadoGeneral[] = [
  { id: 'proveedores', nombre: 'Proveedores', grupo: 'fichas', usa: { activos: true }, generar: (d, f) => fichas(d, f, true) },
  { id: 'clientes', nombre: 'Clientes', grupo: 'fichas', usa: { activos: true }, generar: (d, f) => fichas(d, f, false) },
  { id: 'articulos', nombre: 'Artículos', grupo: 'fichas', usa: { familia: true, activos: true, conStock: true }, generar: articulos },
  { id: 'precios', nombre: 'Precios', grupo: 'fichas', usa: { familia: true, activos: true }, generar: precios },
  { id: 'compras', nombre: 'Compras (por líneas)', grupo: 'movimientos', usa: { fechas: true, tercero: 'proveedor', familia: true, articulo: true }, generar: (d, f) => movimientosLinea(d, f, 'compra') },
  { id: 'ventas', nombre: 'Ventas (por líneas)', grupo: 'movimientos', usa: { fechas: true, tercero: 'cliente', familia: true, articulo: true }, generar: (d, f) => movimientosLinea(d, f, 'venta') },
  { id: 'compras_proveedores', nombre: 'Compras por proveedor', grupo: 'movimientos', usa: { fechas: true, tercero: 'proveedor' }, generar: (d, f) => porTercero(d, f, 'compra') },
  { id: 'ventas_clientes', nombre: 'Ventas por cliente', grupo: 'movimientos', usa: { fechas: true, tercero: 'cliente' }, generar: (d, f) => porTercero(d, f, 'venta') },
  { id: 'rentabilidad', nombre: 'Rentabilidad por artículo', grupo: 'movimientos', usa: { fechas: true, tercero: 'cliente', familia: true, articulo: true }, generar: rentabilidad },
  { id: 'est_ventas_mes', nombre: 'Ventas por meses', grupo: 'estadisticas', usa: { fechas: true, tercero: 'cliente' }, generar: (d, f) => porMes(d, f, 'venta') },
  { id: 'est_compras_mes', nombre: 'Compras por meses', grupo: 'estadisticas', usa: { fechas: true, tercero: 'proveedor' }, generar: (d, f) => porMes(d, f, 'compra') },
  { id: 'est_familias', nombre: 'Ventas por familia', grupo: 'estadisticas', usa: { fechas: true, tercero: 'cliente' }, generar: ventasPorFamilia },
  { id: 'est_ranking', nombre: 'Ranking de artículos (ABC)', grupo: 'estadisticas', usa: { fechas: true, tercero: 'cliente', familia: true }, generar: rankingArticulos },
  { id: 'est_vendedores', nombre: 'Ventas por vendedor', grupo: 'estadisticas', usa: { fechas: true }, generar: ventasPorVendedor },
  { id: 'caja', nombre: 'Documentos de caja (formas de pago)', grupo: 'caja', usa: { fechas: true, tercero: 'ambos' }, generar: cajaFormasDePago },
  { id: 'libro_ventas', nombre: 'Libro de facturas emitidas', grupo: 'fiscal', usa: { fechas: true, tercero: 'cliente' }, generar: (d, f) => libro(d, f, 'venta') },
  { id: 'libro_compras', nombre: 'Libro de facturas recibidas', grupo: 'fiscal', usa: { fechas: true, tercero: 'proveedor' }, generar: (d, f) => libro(d, f, 'compra') },
  { id: 'impuestos_venta', nombre: 'Impuestos de venta', grupo: 'fiscal', usa: { fechas: true }, generar: (d, f) => impuestos(d, f, 'venta') },
  { id: 'impuestos_compra', nombre: 'Impuestos de compra', grupo: 'fiscal', usa: { fechas: true }, generar: (d, f) => impuestos(d, f, 'compra') },
  { id: 'inventario', nombre: 'Inventario valorado', grupo: 'almacen', usa: { familia: true, activos: true, conStock: true }, generar: inventario },
  { id: 'historico', nombre: 'Histórico del programa anterior', grupo: 'almacen', historico: true, usa: { fechas: true }, generar: historicoListado },
];

export function listadoGeneralPorId(id: string): ListadoGeneral | undefined {
  return LISTADOS_GENERALES.find(l => l.id === id);
}

/** La hoja con el filtro de texto libre aplicado sobre lo que se ve. */
export function generarHoja(l: ListadoGeneral, d: DatosListados, f: FiltroGeneral): Hoja {
  const hoja = l.generar(d, f);
  if (!f.texto?.trim()) return hoja;
  return { ...hoja, filas: hoja.filas.filter(fila => casaTexto(f.texto!, ...Object.values(fila))) };
}

/** Las sumas del pie, columna a columna. */
export function sumasDe(hoja: Hoja): Record<string, number> {
  const s: Record<string, number> = {};
  for (const c of hoja.columnas) {
    if (!c.suma) continue;
    s[c.clave] = c.tipo === 'num'
      ? r4(hoja.filas.reduce((t, f) => t + (Number(f[c.clave]) || 0), 0))
      : r2(hoja.filas.reduce((t, f) => t + (Number(f[c.clave]) || 0), 0));
  }
  return s;
}

/** En CSV para Excel: punto y coma, coma decimal y BOM, que es como lo abre un Excel en español. */
export function hojaComoCsv(hoja: Hoja): string {
  const esc = (v: Celda) => {
    if (v === null || v === undefined) return '';
    const t = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
    return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const sumas = sumasDe(hoja);
  const lineas = [
    hoja.columnas.map(c => esc(c.titulo)).join(';'),
    ...hoja.filas.map(f => hoja.columnas.map(c => esc(f[c.clave] ?? null)).join(';')),
  ];
  if (Object.keys(sumas).length) {
    lineas.push(hoja.columnas.map((c, i) => (i === 0 ? 'TOTAL' : c.clave in sumas ? esc(sumas[c.clave]) : '')).join(';'));
  }
  return '﻿' + lineas.join('\r\n');
}
