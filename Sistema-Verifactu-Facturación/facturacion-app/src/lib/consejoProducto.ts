/**
 * LO QUE CUENTA LA FICHA DE UN PRODUCTO
 *
 * Al abrir un artículo se ve, además de sus datos, cómo le va:
 *
 *   · lo vendido mes a mes en el último año (la minigráfica);
 *   · quién lo compra más;
 *   · a cuánto se vende de verdad (con los descuentos de cada cliente)
 *     frente al precio de la ficha: si la media va un 12 % por debajo, la
 *     tarifa dice una cosa y los clientes pagan otra;
 *   · el margen, con el precio de la ficha y con el real;
 *   · y un aviso cuando el precio lleva más de un año igual mientras lo que
 *     cuesta comprarlo ha subido: es el margen que se va perdiendo sin que
 *     nadie lo note.
 *
 * Que el precio «no ha cambiado» se deduce de las propias facturas (no hay
 * un historial de precios guardado): si todas las ventas desde hace un año
 * llevan el precio de hoy, es que no se ha tocado. Que el coste ha subido,
 * de las compras de ese tiempo; sin compras anotadas, de que la última
 * entrada costó más que la media.
 */

import type { Invoice, Product } from './types';
import { costeDe } from './documentos';
import { ventasPorArticulo, comprasPorArticulo, diasEntre, haceDias, type Movimiento } from './ventasArticulos';
import { margenSobreVenta } from './subidaPrecios';

export interface MesDeVentas {
  /** «2026-10» */
  mes: string;
  /** «oct» */
  etiqueta: string;
  unidades: number;
  importe: number;
}

export interface MejorCliente {
  id: string;
  nombre: string;
  unidades: number;
  importe: number;
}

export interface AvisoPrecioQuieto {
  /** Desde cuándo se vende al precio de hoy (la venta más antigua a ese precio). */
  desde: string;
  meses: number;
  costeAntes: number;
  costeAhora: number;
  subidaCostePct: number;
}

export interface ConsejoProducto {
  meses: MesDeVentas[];
  unidades: number;
  importe: number;
  mejoresClientes: MejorCliente[];
  /** Precio medio cobrado por unidad en el año, después de descuentos. */
  precioMedio: number | null;
  precioFicha: number;
  /** Cuánto se aparta lo cobrado del precio de la ficha, en %. */
  diferenciaPct: number | null;
  coste: number;
  margenFicha: number | null;
  margenReal: number | null;
  avisoPrecio: AvisoPrecioQuieto | null;
}

const NOMBRE_MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Los doce meses que acaban en el de hoy, del más antiguo al actual. */
function ultimosDoceMeses(hoy: Date): MesDeVentas[] {
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - 11 + i, 1);
    return { mes: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, etiqueta: NOMBRE_MES[d.getMonth()], unidades: 0, importe: 0 };
  });
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const mismoPrecio = (a: number, b: number) => Math.abs(a - b) < 0.005;

/**
 * La venta más antigua de la racha final al precio de hoy: se recorren las
 * ventas de la más reciente hacia atrás mientras lleven ese precio.
 */
function vendidoAlPrecioDesde(ventas: readonly Movimiento[], precio: number): string | null {
  let desde: string | null = null;
  for (let i = ventas.length - 1; i >= 0; i--) {
    if (ventas[i].unidades <= 0) continue;
    if (!mismoPrecio(ventas[i].precioUnidad, precio)) break;
    desde = ventas[i].fecha;
  }
  return desde;
}

function avisoDePrecio(p: Product, ventas: readonly Movimiento[], compras: readonly Movimiento[], hoy: Date): AvisoPrecioQuieto | null {
  if (p.unitPrice <= 0) return null;
  const desde = vendidoAlPrecioDesde(ventas, p.unitPrice);
  if (!desde) return null;
  const dias = diasEntre(desde, hoy);
  if (dias < 365) return null;

  const entradas = compras.filter(c => c.unidades > 0 && c.netoUnidad > 0);
  // El coste de cuando se puso el precio: la última compra hasta entonces o,
  // si no la hay, la primera después.
  const antesDe = entradas.filter(c => c.fecha <= desde);
  const deEntonces = antesDe.length ? antesDe[antesDe.length - 1] : entradas[0];
  const costeAhora = (p.costeUltimaCompra ?? 0) > 0 ? p.costeUltimaCompra! : entradas[entradas.length - 1]?.netoUnidad ?? 0;
  const costeAntes = deEntonces && deEntonces !== entradas[entradas.length - 1] ? deEntonces.netoUnidad : (p.costePmp ?? 0);
  if (costeAntes <= 0 || costeAhora <= costeAntes * 1.01) return null;

  return {
    desde,
    meses: Math.floor(dias / 30.44),
    costeAntes: r2(costeAntes),
    costeAhora: r2(costeAhora),
    subidaCostePct: ((costeAhora - costeAntes) / costeAntes) * 100,
  };
}

export function consejoDeProducto(p: Product, docs: readonly Invoice[], hoy = new Date()): ConsejoProducto {
  const ventas = ventasPorArticulo(docs).get(p.id) ?? [];
  const compras = comprasPorArticulo(docs).get(p.id) ?? [];
  const meses = ultimosDoceMeses(hoy);
  const desde = `${meses[0].mes}-01`;
  const delAno = ventas.filter(v => v.fecha >= desde && v.fecha <= haceDias(hoy, -1));

  const porCliente = new Map<string, MejorCliente>();
  for (const v of delAno) {
    const mes = meses.find(m => v.fecha.startsWith(m.mes));
    if (mes) { mes.unidades += v.unidades; mes.importe += v.importe; }
    const clave = v.clientId || v.clientName;
    const c = porCliente.get(clave) ?? { id: v.clientId, nombre: v.clientName || 'Sin nombre', unidades: 0, importe: 0 };
    c.unidades += v.unidades;
    c.importe += v.importe;
    porCliente.set(clave, c);
  }
  for (const m of meses) m.importe = r2(m.importe);

  const unidades = delAno.reduce((n, v) => n + v.unidades, 0);
  const importe = r2(delAno.reduce((n, v) => n + v.importe, 0));
  const precioMedio = unidades > 0 ? importe / unidades : null;
  const coste = costeDe(p);

  return {
    meses,
    unidades,
    importe,
    mejoresClientes: [...porCliente.values()]
      .filter(c => c.importe > 0)
      .sort((a, b) => b.importe - a.importe)
      .slice(0, 5)
      .map(c => ({ ...c, importe: r2(c.importe) })),
    precioMedio: precioMedio === null ? null : r2(precioMedio),
    precioFicha: p.unitPrice,
    diferenciaPct: precioMedio !== null && p.unitPrice > 0 ? ((precioMedio - p.unitPrice) / p.unitPrice) * 100 : null,
    coste,
    margenFicha: margenSobreVenta(p.unitPrice, coste),
    margenReal: precioMedio === null ? null : margenSobreVenta(precioMedio, coste),
    avisoPrecio: avisoDePrecio(p, ventas, compras, hoy),
  };
}
