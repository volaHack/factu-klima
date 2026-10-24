/**
 * LO QUE EL ASISTENTE SABE DEL DÍA A DÍA
 *
 * El retrato del panel (contexto.ts) cuenta documentos y dinero. Esto añade
 * lo que se pregunta en un almacén y en una oficina de compras y ventas:
 *
 *   · el stock de verdad: valor del almacén, lo que falta, lo que está en
 *     negativo, lo que hay que pedir y lo que está parado;
 *   · lo que está por servir y por recibir (pedidos) y el disponible;
 *   · qué se vende, a quién y con cuánto margen, y la evolución por meses;
 *   · a quién se compra y a cuánto;
 *   · los clientes que han dejado de comprar;
 *   · el historial del programa anterior, sumado.
 *
 * Todo va ya sumado y ordenado: el modelo cuenta y suma mal, así que no se
 * le deja hacerlo. Cada bloque va con su tope para que quepa en la ventana.
 */

import { InvoiceStatus, type Client, type Invoice, type Product } from '../types';
import { pendientesPorProducto } from '../documentos';
import type { FilaResumenHistorico } from '../historico';

const NO_CUENTA: readonly string[] = [InvoiceStatus.BORRADOR, InvoiceStatus.ANULADA, InvoiceStatus.RECHAZADO, InvoiceStatus.PRE_APROBACION];

function euros(n: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(n);
}

function uds(n: number): string {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(n);
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** El coste de un artículo: el precio medio y, sin él, la última compra o el precio de compra. */
export function costeDe(p: Pick<Product, 'costePmp' | 'costeUltimaCompra' | 'purchasePrice'>): number {
  return [p.costePmp, p.costeUltimaCompra, p.purchasePrice].find(v => (v ?? 0) > 0) ?? 0;
}

/** Las ventas que cuentan: facturas de venta emitidas que no vienen de un albarán ya contado, y los albaranes servidos. */
export function documentosDeVenta(facturas: readonly Invoice[]): Invoice[] {
  const albaranes = new Set(facturas.filter(d => d.tipo === 'albaran').map(d => d.id));
  return facturas.filter(d => {
    if ((d.sentido ?? 'venta') !== 'venta' || NO_CUENTA.includes(d.status)) return false;
    if (d.tipo === 'albaran') return true;
    // La factura de un albarán ya contado no se cuenta otra vez.
    return d.tipo === 'factura' && !(d.documentoOrigenId && albaranes.has(d.documentoOrigenId));
  });
}

/** Lo mismo en compras. */
export function documentosDeCompra(facturas: readonly Invoice[]): Invoice[] {
  const albaranes = new Set(facturas.filter(d => d.tipo === 'albaran').map(d => d.id));
  return facturas.filter(d => {
    if (d.sentido !== 'compra' || NO_CUENTA.includes(d.status)) return false;
    if (d.tipo === 'albaran') return true;
    return d.tipo === 'factura' && !(d.documentoOrigenId && albaranes.has(d.documentoOrigenId));
  });
}

export interface VentaArticulo {
  productId: string;
  nombre: string;
  unidades: number;
  importe: number;
  coste: number;
  ultimaVenta: string;
}

/** Ventas por artículo desde una fecha (AAAA-MM-DD), de más a menos importe. */
export function ventasPorArticulo(docs: readonly Invoice[], productos: readonly Product[], desde: string): VentaArticulo[] {
  const porId = new Map(productos.map(p => [p.id, p]));
  const acc = new Map<string, VentaArticulo>();
  for (const d of docs) {
    if ((d.issueDate ?? '') < desde) continue;
    for (const li of d.lineItems) {
      if (!li.productId) continue;
      const p = porId.get(li.productId);
      const a = acc.get(li.productId) ?? { productId: li.productId, nombre: p?.name ?? li.productName, unidades: 0, importe: 0, coste: 0, ultimaVenta: '' };
      const q = Number(li.quantity) || 0;
      a.unidades += q;
      a.importe += Number(li.subtotal) || 0;
      const costeUd = (li.costPrice ?? 0) > 0 ? li.costPrice! : (p ? costeDe(p) : 0);
      a.coste += q * costeUd;
      if ((d.issueDate ?? '') > a.ultimaVenta) a.ultimaVenta = d.issueDate ?? '';
      acc.set(li.productId, a);
    }
  }
  return [...acc.values()].sort((a, b) => b.importe - a.importe);
}

function haceDias(n: number, ahora: Date): string {
  return new Date(ahora.getTime() - n * 86_400_000).toISOString().slice(0, 10);
}

function mesDe(fecha: string): string {
  return fecha.slice(0, 7);
}

const NOMBRE_HISTORICO: Record<string, string> = {
  factura_venta: 'facturas de venta', albaran_venta: 'albaranes de venta', pedido_venta: 'pedidos de venta',
  presupuesto_venta: 'presupuestos', factura_compra: 'facturas de compra', albaran_compra: 'albaranes de compra',
};

export function operativaEnPalabras(e: {
  facturas: readonly Invoice[];
  productos: readonly Product[];
  clientes: readonly Client[];
  historico?: readonly FilaResumenHistorico[];
  origenHistorico?: string | null;
  ahora?: Date;
}): string[] {
  const ahora = e.ahora ?? new Date();
  const lineas: string[] = [];
  const activos = e.productos.filter(p => p.active !== false);
  const ventas = documentosDeVenta(e.facturas);
  const compras = documentosDeCompra(e.facturas);
  const pendientes = pendientesPorProducto([...e.facturas]);

  // ---------------- STOCK ----------------
  if (activos.length > 0) {
    const valor = activos.reduce((s, p) => s + Math.max(p.stockQuantity ?? 0, 0) * costeDe(p), 0);
    const conStock = activos.filter(p => (p.stockQuantity ?? 0) > 0);
    const negativos = activos.filter(p => (p.stockQuantity ?? 0) < 0).sort((a, b) => (a.stockQuantity ?? 0) - (b.stockQuantity ?? 0));
    const bajoMinimo = activos.filter(p => p.lowStockThreshold != null && p.lowStockThreshold > 0
      && (p.stockQuantity ?? 0) >= 0 && (p.stockQuantity ?? 0) <= p.lowStockThreshold);
    lineas.push(
      '',
      `=== ALMACÉN: STOCK REAL (${activos.length} artículos activos) ===`,
      `- Valor del almacén a precio de coste: ${euros(r2(valor))}. Con existencias: ${conStock.length}. A cero: ${activos.filter(p => (p.stockQuantity ?? 0) === 0).length}. En NEGATIVO (vendido sin haber entrado): ${negativos.length}.`,
      '- El stock lo mueven solos los albaranes expedidos, las facturas y tickets (restan) y las compras recibidas (suman). Puede quedar en negativo.',
    );
    if (negativos.length) {
      lineas.push(`- EN NEGATIVO: ${negativos.slice(0, 30).map(p => `${p.name}${p.ref ? ` [${p.ref}]` : ''} ${uds(p.stockQuantity ?? 0)} ${p.unit}`).join('; ')}.`);
    }
    if (bajoMinimo.length) {
      lineas.push(`- BAJO EL MÍNIMO (hay que pedir): ${bajoMinimo.slice(0, 30).map(p => `${p.name} ${uds(p.stockQuantity ?? 0)} (mín. ${p.lowStockThreshold})`).join('; ')}.`);
    }
  }

  // ---------------- PENDIENTES ----------------
  const conPendiente = [...pendientes.entries()]
    .map(([id, v]) => ({ p: e.productos.find(x => x.id === id), ...v }))
    .filter(x => x.p);
  if (conPendiente.length) {
    const entregar = conPendiente.filter(x => x.pendienteEntregar > 0).sort((a, b) => b.pendienteEntregar - a.pendienteEntregar);
    const recibir = conPendiente.filter(x => x.pendienteRecibir > 0).sort((a, b) => b.pendienteRecibir - a.pendienteRecibir);
    lineas.push('', '=== PENDIENTE DE ENTREGAR Y DE RECIBIR (pedidos sin servir del todo) ===');
    if (entregar.length) {
      lineas.push(`- Por ENTREGAR a clientes (${entregar.length} artículos): ${entregar.slice(0, 30).map(x => {
        const disp = (x.p!.stockQuantity ?? 0) + x.pendienteRecibir - x.pendienteEntregar;
        return `${x.p!.name} ${uds(x.pendienteEntregar)} (stock ${uds(x.p!.stockQuantity ?? 0)}, disponible ${uds(disp)}${disp < 0 ? ' ¡FALTA!' : ''})`;
      }).join('; ')}.`);
    }
    if (recibir.length) {
      lineas.push(`- Por RECIBIR de proveedores (${recibir.length} artículos): ${recibir.slice(0, 30).map(x => `${x.p!.name} ${uds(x.pendienteRecibir)}`).join('; ')}.`);
    }
  }
  const pedidosAbiertos = (sentido: 'venta' | 'compra') => e.facturas
    .filter(d => d.tipo === 'pedido' && (d.sentido ?? 'venta') === sentido
      && ![InvoiceStatus.ANULADA, InvoiceStatus.FACTURADO, InvoiceStatus.BORRADOR, InvoiceStatus.RECHAZADO].includes(d.status)
      && !e.facturas.some(x => x.documentoOrigenId === d.id && x.status !== InvoiceStatus.ANULADA))
    .sort((a, b) => (a.issueDate ?? '').localeCompare(b.issueDate ?? ''));
  for (const [sentido, titulo] of [['venta', 'PEDIDOS DE CLIENTES SIN SERVIR'], ['compra', 'PEDIDOS A PROVEEDORES SIN RECIBIR']] as const) {
    const lista = pedidosAbiertos(sentido);
    if (lista.length) {
      lineas.push(`- ${titulo} (${lista.length}, del más antiguo): ${lista.slice(0, 20).map(d => `${d.number} de ${d.clientName} del ${d.issueDate} (${euros(d.total)})`).join('; ')}.`);
    }
  }

  // ---------------- VENTAS ----------------
  if (ventas.length) {
    const desde12 = haceDias(365, ahora);
    const anio = `${ahora.getFullYear()}-01-01`;
    const porArticulo = ventasPorArticulo(ventas, e.productos, desde12);
    const totalImporte = porArticulo.reduce((s, a) => s + a.importe, 0);
    const totalCoste = porArticulo.reduce((s, a) => s + a.coste, 0);
    lineas.push(
      '',
      '=== VENTAS POR ARTÍCULO (últimos 12 meses, de más a menos facturado; base sin impuestos) ===',
      `- Total vendido: ${euros(r2(totalImporte))}; coste estimado ${euros(r2(totalCoste))}; margen bruto ${euros(r2(totalImporte - totalCoste))}${totalImporte > 0 ? ` (${uds((1 - totalCoste / totalImporte) * 100)} %)` : ''}.`,
    );
    porArticulo.slice(0, 40).forEach(a => {
      const margen = a.importe > 0 && a.coste > 0 ? ` · margen ${uds((1 - a.coste / a.importe) * 100)} %` : '';
      lineas.push(`- ${a.nombre}: ${uds(a.unidades)} ud · ${euros(r2(a.importe))}${margen} · última venta ${a.ultimaVenta}`);
    });
    const masUnidades = [...porArticulo].sort((a, b) => b.unidades - a.unidades).slice(0, 15);
    lineas.push(`- Los más vendidos por UNIDADES: ${masUnidades.map(a => `${a.nombre} ${uds(a.unidades)}`).join('; ')}.`);
    const margenNegativo = porArticulo.filter(a => a.coste > a.importe && a.importe > 0);
    if (margenNegativo.length) {
      lineas.push(`- VENDIDOS POR DEBAJO DEL COSTE: ${margenNegativo.slice(0, 20).map(a => `${a.nombre} (vendido ${euros(r2(a.importe))}, coste ${euros(r2(a.coste))})`).join('; ')}.`);
    }

    // Stock parado: con existencias y sin ventas en 90 días.
    const vendidos90 = new Set(ventasPorArticulo(ventas, e.productos, haceDias(90, ahora)).map(a => a.productId));
    const parados = activos
      .filter(p => (p.stockQuantity ?? 0) > 0 && !vendidos90.has(p.id))
      .map(p => ({ p, valor: (p.stockQuantity ?? 0) * costeDe(p) }))
      .sort((a, b) => b.valor - a.valor);
    if (parados.length) {
      lineas.push(`- STOCK PARADO (con existencias y sin vender en 90 días: ${parados.length}): ${parados.slice(0, 20).map(x => `${x.p.name} ${uds(x.p.stockQuantity ?? 0)} ud (${euros(r2(x.valor))})`).join('; ')}.`);
    }

    // Por meses.
    const porMes = new Map<string, number>();
    for (const d of ventas) {
      if ((d.issueDate ?? '') < desde12) continue;
      porMes.set(mesDe(d.issueDate ?? ''), (porMes.get(mesDe(d.issueDate ?? '')) ?? 0) + (d.subtotal || 0));
    }
    if (porMes.size) {
      lineas.push(`- Ventas por MES (base): ${[...porMes.entries()].sort().map(([m, v]) => `${m} ${euros(r2(v))}`).join('; ')}.`);
    }

    // Por cliente, este año, y quién ha dejado de comprar.
    const porCliente = new Map<string, { nombre: string; importe: number; docs: number; ultima: string; antes: number }>();
    for (const d of ventas) {
      const k = d.clientId || d.clientName;
      const c = porCliente.get(k) ?? { nombre: d.clientName, importe: 0, docs: 0, ultima: '', antes: 0 };
      if ((d.issueDate ?? '') >= anio) { c.importe += d.subtotal || 0; c.docs += 1; }
      else c.antes += d.subtotal || 0;
      if ((d.issueDate ?? '') > c.ultima) c.ultima = d.issueDate ?? '';
      porCliente.set(k, c);
    }
    const clientesAnio = [...porCliente.values()].filter(c => c.importe > 0).sort((a, b) => b.importe - a.importe);
    if (clientesAnio.length) {
      const total = clientesAnio.reduce((s, c) => s + c.importe, 0);
      lineas.push(`- MEJORES CLIENTES de ${ahora.getFullYear()} (base): ${clientesAnio.slice(0, 25).map(c => `${c.nombre} ${euros(r2(c.importe))} en ${c.docs} docs`).join('; ')}. Venta media por documento: ${euros(r2(total / clientesAnio.reduce((s, c) => s + c.docs, 0)))}.`);
    }
    const dormidos = [...porCliente.values()]
      .filter(c => c.ultima && c.ultima < haceDias(60, ahora))
      .sort((a, b) => (b.importe + b.antes) - (a.importe + a.antes));
    if (dormidos.length) {
      lineas.push(`- CLIENTES QUE HAN DEJADO DE COMPRAR (nada en 60 días; de más a menos que compraban): ${dormidos.slice(0, 20).map(c => `${c.nombre} (última ${c.ultima})`).join('; ')}.`);
    }
  }

  // ---------------- COMPRAS ----------------
  if (compras.length) {
    const desde12 = haceDias(365, ahora);
    const porProveedor = new Map<string, { nombre: string; importe: number; docs: number; ultima: string }>();
    for (const d of compras) {
      if ((d.issueDate ?? '') < desde12) continue;
      const k = d.clientId || d.clientName;
      const c = porProveedor.get(k) ?? { nombre: d.clientName, importe: 0, docs: 0, ultima: '' };
      c.importe += d.subtotal || 0;
      c.docs += 1;
      if ((d.issueDate ?? '') > c.ultima) c.ultima = d.issueDate ?? '';
      porProveedor.set(k, c);
    }
    const provs = [...porProveedor.values()].sort((a, b) => b.importe - a.importe);
    lineas.push('', '=== COMPRAS (últimos 12 meses, base sin impuestos) ===');
    if (provs.length) {
      lineas.push(`- Por PROVEEDOR: ${provs.slice(0, 25).map(p => `${p.nombre} ${euros(r2(p.importe))} en ${p.docs} docs (última ${p.ultima})`).join('; ')}.`);
    }
    const compradoArt = ventasPorArticulo(compras, e.productos, desde12);
    if (compradoArt.length) {
      lineas.push(`- Por ARTÍCULO: ${compradoArt.slice(0, 30).map(a => `${a.nombre} ${uds(a.unidades)} ud por ${euros(r2(a.importe))}`).join('; ')}.`);
    }
  }

  // ---------------- PRECIOS DE COMPRA Y COSTE ----------------
  const conCoste = activos.filter(p => costeDe(p) > 0 && p.unitPrice > 0);
  if (conCoste.length) {
    const bajoMargen = conCoste
      .map(p => ({ p, margen: (1 - costeDe(p) / p.unitPrice) * 100 }))
      .filter(x => x.margen < 10)
      .sort((a, b) => a.margen - b.margen);
    if (bajoMargen.length) {
      lineas.push('', `=== ARTÍCULOS CON MARGEN DE TARIFA BAJO (<10 %, ${bajoMargen.length}) ===`,
        `- ${bajoMargen.slice(0, 25).map(x => `${x.p.name}: venta ${euros(x.p.unitPrice)}, coste ${euros(costeDe(x.p))} (${uds(x.margen)} %)`).join('; ')}.`);
    }
  }

  // ---------------- HISTORIAL ANTERIOR ----------------
  if (e.historico && e.historico.length) {
    const nombre = e.origenHistorico ? e.origenHistorico.toUpperCase() : 'el programa anterior';
    const porAnio = new Map<number, FilaResumenHistorico[]>();
    for (const f of e.historico) {
      if (f.anio == null) continue;
      porAnio.set(f.anio, [...(porAnio.get(f.anio) ?? []), f]);
    }
    lineas.push('', `=== HISTORIAL DE ${nombre} (documentos de antes de usar Klima; solo consulta, no cuentan en los totales de arriba) ===`);
    [...porAnio.entries()].sort((a, b) => b[0] - a[0]).forEach(([anio, filas]) => {
      lineas.push(`- ${anio}: ${filas.map(f => `${f.documentos} ${NOMBRE_HISTORICO[f.tipo] ?? f.tipo} por ${euros(r2(f.total))}${f.pendientes ? ` (${f.pendientes} sin pasar a otro documento)` : ''}`).join('; ')}.`);
    });
  }

  return lineas;
}

// ============================================================
// LAS FICHAS DE LO QUE MENCIONA LA PREGUNTA
// ============================================================

/**
 * «¿Cuánto me queda de aceite de oliva?», «¿a cuánto le vendí el queso a
 * Bar Pepe?»: con mil quinientos artículos no se le puede pasar el
 * catálogo entero al asistente, pero sí la ficha completa de lo que la
 * pregunta nombra. Se busca cada palabra con peso de la pregunta en los
 * artículos (como el buscador de las líneas) y en los clientes y
 * proveedores, y de los que salen se manda todo lo que se sabe.
 */

const VACIAS = new Set(('que cual cuales cuanto cuanta cuantos cuantas como donde cuando quien quienes para por con sin del las los una uno unos unas este esta estos estas ese esa esos esas hay tengo tiene tenemos me mi mis nos les sus todo toda todos todas mas menos muy pero porque sobre entre desde hasta hoy ayer mes ano dia semana precio precios stock queda quedan vendido vendi vendimos compra compras compre venta ventas cliente clientes proveedor proveedores articulo articulos producto productos factura facturas albaran albaranes pedido pedidos presupuesto presupuestos dime dame saber ver puedes hacer cuanto debe deben ultimo ultima ultimos ultimas').split(' '));

function plano(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Las palabras de la pregunta que sirven para buscar. */
export function palabrasClave(pregunta: string): string[] {
  return [...new Set(plano(pregunta).split(/[^a-z0-9ñ.-]+/).filter(w => w.length >= 3 && !VACIAS.has(w)))];
}

function casa(texto: string, palabras: readonly string[]): number {
  const t = plano(texto);
  return palabras.filter(w => t.includes(w)).length;
}

const NOMBRE_TIPO: Record<string, string> = {
  factura: 'factura', albaran: 'albarán', pedido: 'pedido', presupuesto: 'presupuesto', rectificativa: 'rectificativa',
};

export function fichasParaLaPregunta(pregunta: string, e: {
  facturas: readonly Invoice[];
  productos: readonly Product[];
  clientes: readonly Client[];
  ahora?: Date;
}): string[] {
  const palabras = palabrasClave(pregunta);
  if (!palabras.length) return [];
  const ahora = e.ahora ?? new Date();
  const lineas: string[] = [];

  // ---- Artículos ----
  const articulos = e.productos
    .map(p => {
      const exacta = palabras.some(w => plano(p.ref) === w || (p.barcode && plano(p.barcode) === w));
      const n = casa(`${p.name} ${p.ref} ${p.supplierRef ?? ''} ${p.category}`, palabras);
      return { p, n: exacta ? 100 : n };
    })
    .filter(x => x.n > 0)
    .sort((a, b) => b.n - a.n || Number(b.p.active !== false) - Number(a.p.active !== false));
  // Si una palabra casa con cientos («caja»), no dice nada: se queda con los que casan con más palabras.
  const mejores = articulos.filter(x => x.n === articulos[0]?.n).slice(0, 8);
  if (mejores.length) {
    const pendientes = pendientesPorProducto([...e.facturas]);
    const movidos = e.facturas.filter(d => !NO_CUENTA.includes(d.status));
    lineas.push('', `=== FICHAS DE LOS ARTÍCULOS QUE NOMBRA LA PREGUNTA (${mejores.length}${articulos.length > mejores.length ? ` de ${articulos.length} que casan` : ''}) ===`);
    for (const { p } of mejores) {
      const pend = pendientes.get(p.id) ?? { pendienteRecibir: 0, pendienteEntregar: 0 };
      const disp = (p.stockQuantity ?? 0) + pend.pendienteRecibir - pend.pendienteEntregar;
      const datos = [
        `ref. ${p.ref}`,
        p.category && `familia ${p.category}`,
        `STOCK ${uds(p.stockQuantity ?? 0)} ${p.unit}`,
        pend.pendienteEntregar ? `por entregar ${uds(pend.pendienteEntregar)}` : '',
        pend.pendienteRecibir ? `por recibir ${uds(pend.pendienteRecibir)}` : '',
        (pend.pendienteEntregar || pend.pendienteRecibir) ? `disponible ${uds(disp)}` : '',
        p.lowStockThreshold ? `mínimo ${p.lowStockThreshold}` : '',
        `precio de venta ${euros(p.unitPrice)} + ${p.defaultTaxRate} %`,
        (p.purchasePrice ?? 0) > 0 ? `precio de compra ${euros(p.purchasePrice!)}` : '',
        (p.costeUltimaCompra ?? 0) > 0 ? `última entrada ${euros(p.costeUltimaCompra!)}` : '',
        (p.costePmp ?? 0) > 0 ? `precio medio ${euros(p.costePmp!)}` : '',
        costeDe(p) > 0 && p.unitPrice > 0 ? `margen de tarifa ${uds((1 - costeDe(p) / p.unitPrice) * 100)} %` : '',
        p.unitsPerPackage ? `${p.unitsPerPackage} ud por caja` : '',
        p.supplierRef ? `ref. proveedor ${p.supplierRef}` : '',
        p.barcode ? `código de barras ${p.barcode}` : '',
        p.active === false ? 'DADO DE BAJA' : '',
        p.notes ? `observaciones: ${p.notes.slice(0, 200)}` : '',
      ].filter(Boolean);
      lineas.push(`- ${p.name}: ${datos.join(' · ')}.`);
      const ultimos = movidos
        .flatMap(d => d.lineItems.filter(l => l.productId === p.id).map(l => ({ d, l })))
        .sort((a, b) => (b.d.issueDate ?? '').localeCompare(a.d.issueDate ?? ''))
        .slice(0, 8);
      if (ultimos.length) {
        lineas.push(`  Últimos movimientos: ${ultimos.map(({ d, l }) => `${d.issueDate} ${d.sentido === 'compra' ? 'COMPRA' : 'venta'} ${NOMBRE_TIPO[d.tipo ?? 'factura'] ?? d.tipo} ${d.number} ${d.clientName}: ${uds(l.quantity)} a ${euros(l.unitPrice)}${l.discountPercent ? ` −${l.discountPercent} %` : ''}`).join('; ')}.`);
      }
      const v = ventasPorArticulo(documentosDeVenta(e.facturas).filter(d => d.lineItems.some(l => l.productId === p.id)), e.productos, haceDias(365, ahora))[0];
      if (v) lineas.push(`  Vendido en 12 meses: ${uds(v.unidades)} ud por ${euros(r2(v.importe))}.`);
    }
  }

  // ---- Clientes y proveedores ----
  const fichas = e.clientes
    .map(c => ({ c, n: palabras.some(w => plano(c.nif) === w) ? 100 : casa(`${c.tradeName} ${c.businessName} ${c.city}`, palabras) }))
    .filter(x => x.n > 0)
    .sort((a, b) => b.n - a.n);
  const mejoresC = fichas.filter(x => x.n === fichas[0]?.n).slice(0, 5);
  if (mejoresC.length) {
    lineas.push('', `=== FICHAS DE LOS CLIENTES O PROVEEDORES QUE NOMBRA LA PREGUNTA (${mejoresC.length}) ===`);
    for (const { c } of mejoresC) {
      const docs = e.facturas.filter(d => d.clientId === c.id).sort((a, b) => (b.issueDate ?? '').localeCompare(a.issueDate ?? ''));
      const anio = `${ahora.getFullYear()}-01-01`;
      const vendidoAnio = docs.filter(d => d.tipo === 'factura' && !NO_CUENTA.includes(d.status) && (d.issueDate ?? '') >= anio).reduce((s, d) => s + (d.total || 0), 0);
      const debe = docs.filter(d => d.tipo === 'factura' && [InvoiceStatus.PENDIENTE, InvoiceStatus.VENCIDA, InvoiceStatus.EMITIDA, InvoiceStatus.PARCIAL].includes(d.status));
      const deuda = debe.reduce((s, d) => s + (d.total || 0) - (d.paidAmount || 0), 0);
      lineas.push(`- ${c.esProveedor ? 'PROVEEDOR' : 'CLIENTE'} ${c.tradeName || c.businessName}${c.tradeName && c.businessName !== c.tradeName ? ` (${c.businessName})` : ''}: NIF ${c.nif || '—'}${c.city ? ` · ${c.city}` : ''}${c.phone ? ` · tel. ${c.phone}` : ''}${c.email ? ` · ${c.email}` : ''}${c.contactPerson ? ` · contacto ${c.contactPerson}` : ''} · forma de pago ${c.defaultPaymentMethod}${c.paymentDays ? ` a ${c.paymentDays} días` : ''}${c.active ? '' : ' · INACTIVO'}.`);
      lineas.push(`  Facturado este año ${euros(r2(vendidoAnio))}. ${debe.length ? `Pendiente de cobro/pago ${euros(r2(deuda))} en ${debe.length} facturas: ${debe.slice(0, 10).map(d => `${d.number} (${euros(d.total)}, vence ${d.dueDate}${d.status === InvoiceStatus.VENCIDA ? ', VENCIDA' : ''})`).join('; ')}.` : 'No debe nada.'}`);
      if (docs.length) {
        lineas.push(`  Últimos documentos: ${docs.slice(0, 10).map(d => `${d.issueDate} ${NOMBRE_TIPO[d.tipo ?? 'factura'] ?? d.tipo} ${d.number} ${euros(d.total)} (${d.status})`).join('; ')}.`);
        // Lo que más le vende o le compra, con el último precio que se le puso.
        const porArt = new Map<string, { nombre: string; uds: number; ultimoPrecio: number; fecha: string }>();
        for (const d of docs) {
          if (NO_CUENTA.includes(d.status)) continue;
          for (const l of d.lineItems) {
            if (!l.productId) continue;
            const a = porArt.get(l.productId) ?? { nombre: l.productName, uds: 0, ultimoPrecio: l.unitPrice, fecha: d.issueDate ?? '' };
            a.uds += Number(l.quantity) || 0;
            if ((d.issueDate ?? '') >= a.fecha) { a.ultimoPrecio = l.unitPrice; a.fecha = d.issueDate ?? ''; }
            porArt.set(l.productId, a);
          }
        }
        const top = [...porArt.values()].sort((a, b) => b.uds - a.uds).slice(0, 15);
        if (top.length) lineas.push(`  Artículos de más a menos unidades, con el último precio: ${top.map(a => `${a.nombre} ${uds(a.uds)} ud (último ${euros(a.ultimoPrecio)} el ${a.fecha})`).join('; ')}.`);
      }
    }
  }

  return lineas;
}
