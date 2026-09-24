/**
 * LA CONTABILIDAD SE HACE SOLA
 *
 * Cada cosa que ya se hace en el programa —emitir una factura, registrar
 * una compra o un gasto, cobrar, pagar, vender en el TPV— tiene su asiento
 * en el Plan General Contable. Este motor los genera a partir de los datos,
 * sin que nadie tenga que apuntar nada: el libro diario es una consecuencia
 * de trabajar, no un segundo trabajo.
 *
 * Es una función pura sobre los datos del programa: mismo dato, mismo
 * asiento, siempre. Por eso no se guarda: se recalcula, y nunca se
 * desincroniza de las facturas.
 *
 * QUÉ ASIENTO GENERA CADA COSA
 *   Factura de venta   430 cliente (total − retención) + 473 retención
 *                      / 700 o 705 base + 477 cuota por tipo
 *   Rectificativa      lo mismo al revés, con 708 en lugar de 700/705
 *   Tickets del TPV    un asiento por día: 570 caja + 572 banco (tarjeta,
 *                      Bizum) / 700 + 477. Así lo lleva una gestoría:
 *                      el resumen diario, no ticket a ticket.
 *   Factura de compra  600 base + 472 cuota / 400 proveedor (+ 4751 si hay
 *                      retención, que la ingresamos nosotros en el 111)
 *   Gasto              6xx (o 219 si es inversión) + 472 deducible
 *                      / 570 o 572. La parte no deducible del IVA es gasto.
 *   Cobro              570/572 / 430 del cliente
 *   Pago               400 del proveedor / 570/572
 *   Factura cobrada sin cobro apuntado: se genera el cobro por lo que falte,
 *   en la fecha de cobro de la factura.
 */

import type { BusinessSector, Client, CobroPago, Gasto, GastoCategoria, Invoice } from '../types';
import { CUENTAS, cuentaImpuesto, subcuenta, type Impuesto } from './plan';
import { asientosDeApuntes, type ApunteContable } from './apuntes';

export type OrigenAsiento =
  | 'apertura' | 'factura' | 'rectificativa' | 'tpv' | 'compra' | 'rectificativa_compra'
  | 'gasto' | 'cobro' | 'pago' | 'cobro_implicito' | 'manual' | 'periodico';

export interface LineaAsiento {
  cuenta: string;
  debe: number;
  haber: number;
}

export interface Asiento {
  /** Número correlativo dentro del ejercicio (lo pone `numerar`). */
  numero: number;
  fecha: string;
  concepto: string;
  origen: OrigenAsiento;
  /** El documento del que sale, para poder abrirlo. */
  documentoId?: string;
  documento?: string;
  lineas: LineaAsiento[];
}

export interface DatosContables {
  facturas: Invoice[];
  gastos: Gasto[];
  cobrosPagos: CobroPago[];
  clientes: Client[];
  sector?: BusinessSector;
  impuesto: Impuesto;
  /** Apuntes a mano y periódicos (nóminas, amortizaciones, préstamos…). */
  apuntes?: ApunteContable[];
  /** Hasta dónde se generan los periódicos. Por defecto, hoy. */
  hoy?: string;
}

export interface Terceros {
  /** codigo de subcuenta → nombre (cliente, proveedor, acreedor). */
  nombres: Map<string, string>;
  cuentaCliente: (id?: string, nombre?: string) => string;
  cuentaProveedor: (id?: string, nombre?: string) => string;
  cuentaAcreedor: (id?: string, nombre?: string) => string;
}

export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Sectores que venden su trabajo, no mercancía: sus ventas van a la 705
 * (prestaciones de servicios) y no a la 700.
 */
const SECTORES_SERVICIOS = new Set<string>([
  'psicologia', 'medicina', 'dental', 'fisioterapia', 'nutricion', 'veterinaria', 'abogacia', 'procuraduria',
  'asesoria', 'peritaje', 'traduccion', 'arquitectura', 'interiorismo', 'ingenieria', 'informatica', 'diseno',
  'fotografia', 'marketing', 'formacion', 'clases', 'freelance', 'electricidad', 'fontaneria', 'reformas',
  'taller', 'limpieza', 'transporte', 'peluqueria', 'estetica', 'eventos', 'inmobiliaria',
]);

export function cuentaDeVentas(sector?: BusinessSector): string {
  return sector && SECTORES_SERVICIOS.has(sector) ? CUENTAS.prestacionServicios : CUENTAS.ventasMercaderias;
}

const GASTO_A_CUENTA: Record<GastoCategoria, string> = {
  alquiler: CUENTAS.arrendamientos,
  suministros: CUENTAS.suministros,
  personal: CUENTAS.sueldos,
  vehiculo: CUENTAS.otrosServicios,
  material: CUENTAS.otrosAprovisionamientos,
  servicios: CUENTAS.otrosServicios,
  impuestos: CUENTAS.tributos,
  seguros: CUENTAS.seguros,
  otros: CUENTAS.otrosServicios,
};

export function cuentaDeGasto(g: Gasto): string {
  if (g.tipoOperacion && g.tipoOperacion.endsWith('_inversion')) return CUENTAS.inmovilizado;
  return GASTO_A_CUENTA[g.categoria] ?? CUENTAS.otrosServicios;
}

/** Efectivo → caja; lo demás (transferencia, tarjeta, Bizum, domiciliación…) → banco. */
export const cuentaDeTesoreria = (metodo?: string) => (metodo === 'efectivo' ? CUENTAS.caja : CUENTAS.bancos);

/**
 * Subcuentas de clientes, proveedores y acreedores.
 *
 * El número sale del orden de alta de la ficha: no cambia de un año a otro
 * ni al añadir clientes nuevos, que es lo que necesita una gestoría para
 * cuadrar ejercicios. Quien no tiene ficha va a «varios».
 */
export function crearTerceros(clientes: Client[], facturas: Invoice[], gastos: Gasto[]): Terceros {
  const nombres = new Map<string, string>();
  const ordenados = [...clientes].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '') || a.id.localeCompare(b.id));
  const porIdCliente = new Map<string, string>();
  const porIdProveedor = new Map<string, string>();
  ordenados.forEach((c, i) => {
    const n = i + 1;
    porIdCliente.set(c.id, subcuenta('430', n));
    porIdProveedor.set(c.id, subcuenta('400', n));
    nombres.set(subcuenta('430', n), c.businessName || c.tradeName || 'Cliente');
    nombres.set(subcuenta('400', n), c.businessName || c.tradeName || 'Proveedor');
  });

  // Acreedores de gastos: por ficha si la tienen; si no, por nombre.
  const acreedores = new Map<string, string>();
  let siguiente = 1;
  const claveAcreedor = (id?: string, nombre?: string) => (id ? `id:${id}` : `n:${(nombre || '').trim().toUpperCase()}`);
  for (const g of [...gastos].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id))) {
    if (!g.proveedorId && !g.proveedorNombre?.trim()) continue;
    const k = claveAcreedor(g.proveedorId, g.proveedorNombre);
    if (acreedores.has(k)) continue;
    const codigo = subcuenta('410', siguiente++);
    acreedores.set(k, codigo);
    nombres.set(codigo, g.proveedorNombre?.trim() || clientes.find(c => c.id === g.proveedorId)?.businessName || 'Acreedor');
  }

  // Clientes y proveedores sin ficha (clientes ocasionales): una subcuenta
  // por nombre, a partir del 90000, para no mezclarlos con los de ficha.
  const sinFicha = new Map<string, string>();
  let libre = 90000;
  for (const f of facturas) {
    if (f.clientId || !f.clientName?.trim() || f.posSessionId) continue;
    const raiz = f.sentido === 'compra' ? '400' : '430';
    const k = `${raiz}:${f.clientName.trim().toUpperCase()}`;
    if (sinFicha.has(k)) continue;
    const codigo = subcuenta(raiz, libre++);
    sinFicha.set(k, codigo);
    nombres.set(codigo, f.clientName.trim());
  }

  return {
    nombres,
    cuentaCliente: (id, nombre) => (id && porIdCliente.get(id))
      || (nombre && sinFicha.get(`430:${nombre.trim().toUpperCase()}`)) || CUENTAS.clientesVarios,
    cuentaProveedor: (id, nombre) => (id && porIdProveedor.get(id))
      || (nombre && sinFicha.get(`400:${nombre.trim().toUpperCase()}`)) || CUENTAS.acreedoresVarios,
    cuentaAcreedor: (id, nombre) => acreedores.get(claveAcreedor(id, nombre)) || CUENTAS.acreedoresVarios,
  };
}

/** ¿Existe fiscalmente? Borradores, anuladas y lo que no es factura, fuera. */
export function cuentaEnContabilidad(f: Invoice): boolean {
  if (f.cancelledAt) return false;
  if (f.status === 'borrador' || f.status === 'anulada') return false;
  const tipo = f.tipo ?? 'factura';
  return tipo === 'factura' || tipo === 'rectificativa';
}

/** Añade una línea al lado que toque según el signo (un negativo en el debe es haber). */
function apuntar(lineas: LineaAsiento[], cuenta: string, importe: number, lado: 'debe' | 'haber') {
  const v = r2(importe);
  if (v === 0) return;
  const enDebe = (lado === 'debe') === (v > 0);
  lineas.push({ cuenta, debe: enDebe ? Math.abs(v) : 0, haber: enDebe ? 0 : Math.abs(v) });
}

/** Une las líneas de la misma cuenta y lado; quita las vacías. */
function compactar(lineas: LineaAsiento[]): LineaAsiento[] {
  const m = new Map<string, LineaAsiento>();
  for (const l of lineas) {
    const k = `${l.cuenta}|${l.debe > 0 ? 'D' : 'H'}`;
    const a = m.get(k) ?? { cuenta: l.cuenta, debe: 0, haber: 0 };
    a.debe = r2(a.debe + l.debe);
    a.haber = r2(a.haber + l.haber);
    m.set(k, a);
  }
  return [...m.values()].filter(l => l.debe !== 0 || l.haber !== 0)
    .sort((a, b) => (b.debe > 0 ? 1 : 0) - (a.debe > 0 ? 1 : 0));
}

/**
 * Si por redondeos el asiento no cuadra por un céntimo (una factura cuyo
 * total guardado difiere un céntimo de base + cuota), se lleva la
 * diferencia a la cuenta del tercero, que es la que refleja lo que de
 * verdad se debe. Más de un céntimo no se toca: se enseña en los cuadres.
 */
function ajustarCentimo(lineas: LineaAsiento[], cuentaTercero: string) {
  const debe = r2(lineas.reduce((s, l) => s + l.debe, 0));
  const haber = r2(lineas.reduce((s, l) => s + l.haber, 0));
  const dif = r2(haber - debe);
  if (dif === 0 || Math.abs(dif) > 0.02) return;
  const l = lineas.find(x => x.cuenta === cuentaTercero);
  if (!l) return;
  if (l.debe > 0) l.debe = r2(l.debe + dif); else l.haber = r2(l.haber - dif);
}

function desgloseDe(f: Invoice): { tipo: number; base: number; cuota: number }[] {
  if (f.taxBreakdown?.length) return f.taxBreakdown.map(t => ({ tipo: t.rate, base: t.base, cuota: t.amount }));
  return [{ tipo: 0, base: f.subtotal, cuota: f.totalTax }];
}

function asientoFactura(f: Invoice, t: Terceros, sector?: BusinessSector): Asiento {
  const esCompra = f.sentido === 'compra';
  const rectificativa = (f.tipo ?? 'factura') === 'rectificativa';
  const signo = f.total < 0 ? -1 : 1;
  const retencion = r2(f.subtotal * ((f.retencionPct ?? 0) / 100));
  const lineas: LineaAsiento[] = [];

  if (!esCompra) {
    const tercero = t.cuentaCliente(f.clientId, f.clientName);
    // Lo que nos debe el cliente es el total menos lo que retiene él.
    apuntar(lineas, tercero, f.total - retencion, 'debe');
    apuntar(lineas, CUENTAS.retencionesSoportadas, retencion, 'debe');
    const ingreso = rectificativa || signo < 0 ? CUENTAS.devolucionesVentas : cuentaDeVentas(sector);
    for (const d of desgloseDe(f)) {
      apuntar(lineas, ingreso, d.base, 'haber');
      apuntar(lineas, cuentaImpuesto('477', d.tipo), d.cuota, 'haber');
    }
    ajustarCentimo(lineas, tercero);
    return {
      numero: 0, fecha: f.issueDate, origen: rectificativa ? 'rectificativa' : 'factura',
      concepto: `${rectificativa ? 'Rectificativa' : 'Factura'} ${f.number} · ${f.clientName}`,
      documentoId: f.id, documento: f.number, lineas: compactar(lineas),
    };
  }

  const tercero = t.cuentaProveedor(f.clientId, f.clientName);
  const gasto = rectificativa || signo < 0 ? CUENTAS.devolucionesCompras : CUENTAS.compras;
  for (const d of desgloseDe(f)) {
    apuntar(lineas, gasto, d.base, 'debe');
    apuntar(lineas, cuentaImpuesto('472', d.tipo), d.cuota, 'debe');
  }
  // Retención que practicamos al proveedor: la ingresamos nosotros (111).
  apuntar(lineas, CUENTAS.retencionesPracticadas, retencion, 'haber');
  apuntar(lineas, tercero, f.total - retencion, 'haber');
  ajustarCentimo(lineas, tercero);
  return {
    numero: 0, fecha: f.issueDate, origen: rectificativa ? 'rectificativa_compra' : 'compra',
    concepto: `${rectificativa ? 'Rectificativa de compra' : 'Compra'} ${f.number} · ${f.clientName}`,
    documentoId: f.id, documento: f.number, lineas: compactar(lineas),
  };
}

/** Un asiento por día con todos los tickets del TPV (ventas y cobro a la vez). */
function asientosTpv(tickets: Invoice[], sector?: BusinessSector): Asiento[] {
  const porDia = new Map<string, Invoice[]>();
  for (const f of tickets) {
    const lista = porDia.get(f.issueDate) ?? [];
    lista.push(f);
    porDia.set(f.issueDate, lista);
  }
  return [...porDia.entries()].map(([fecha, lista]) => {
    const lineas: LineaAsiento[] = [];
    for (const f of lista) {
      apuntar(lineas, cuentaDeTesoreria(f.paymentMethod), f.total, 'debe');
      const ingreso = f.total < 0 ? CUENTAS.devolucionesVentas : cuentaDeVentas(sector);
      for (const d of desgloseDe(f)) {
        apuntar(lineas, ingreso, d.base, 'haber');
        apuntar(lineas, cuentaImpuesto('477', d.tipo), d.cuota, 'haber');
      }
    }
    const compactas = compactar(lineas);
    ajustarCentimo(compactas, compactas.find(l => l.cuenta === CUENTAS.caja) ? CUENTAS.caja : CUENTAS.bancos);
    return {
      numero: 0, fecha, origen: 'tpv' as const,
      concepto: `Ventas del TPV · ${lista.length} ticket${lista.length === 1 ? '' : 's'}`,
      lineas: compactas,
    };
  });
}

function asientoGasto(g: Gasto, t: Terceros): Asiento {
  const lineas: LineaAsiento[] = [];
  const cuota = g.taxAmount || 0;
  const deducible = g.deducible === false ? 0 : (typeof g.cuotaDeducible === 'number' ? g.cuotaDeducible : cuota);
  // El IVA que no se puede deducir es más gasto (o más coste del bien).
  apuntar(lineas, cuentaDeGasto(g), (g.baseImponible || 0) + (cuota - deducible), 'debe');
  apuntar(lineas, cuentaImpuesto('472', g.taxRate || 0), deducible, 'debe');
  // Los gastos se apuntan ya pagados, con su forma de pago.
  apuntar(lineas, cuentaDeTesoreria(g.paymentMethod), g.total, 'haber');
  ajustarCentimo(lineas, cuentaDeTesoreria(g.paymentMethod));
  const acreedor = t.cuentaAcreedor(g.proveedorId, g.proveedorNombre);
  return {
    numero: 0, fecha: g.fecha, origen: 'gasto',
    concepto: `${g.concepto}${g.proveedorNombre ? ` · ${g.proveedorNombre}` : ''}`,
    documentoId: g.id, documento: acreedor !== CUENTAS.acreedoresVarios ? acreedor : undefined,
    lineas: compactar(lineas),
  };
}

function asientoCobroPago(c: CobroPago, t: Terceros, esProveedor: (id: string) => boolean): Asiento {
  const lineas: LineaAsiento[] = [];
  const tesoreria = cuentaDeTesoreria(c.paymentMethod);
  if (c.tipo === 'cobro') {
    apuntar(lineas, tesoreria, c.importeTotal, 'debe');
    apuntar(lineas, t.cuentaCliente(c.contraparteId, c.contraparteNombre), c.importeTotal, 'haber');
  } else {
    const cuenta = esProveedor(c.contraparteId) || c.contraparteId
      ? t.cuentaProveedor(c.contraparteId, c.contraparteNombre)
      : CUENTAS.acreedoresVarios;
    apuntar(lineas, cuenta, c.importeTotal, 'debe');
    apuntar(lineas, tesoreria, c.importeTotal, 'haber');
  }
  return {
    numero: 0, fecha: c.fecha, origen: c.tipo === 'cobro' ? 'cobro' : 'pago',
    concepto: `${c.tipo === 'cobro' ? 'Cobro' : 'Pago'} ${c.number} · ${c.contraparteNombre}`,
    documentoId: c.id, documento: c.number, lineas: compactar(lineas),
  };
}

/**
 * Todos los asientos, de todos los años, en orden. Los informes cortan por
 * ejercicio; la apertura de cada año sale de los anteriores.
 */
export function generarAsientos(d: DatosContables): Asiento[] {
  const t = crearTerceros(d.clientes, d.facturas, d.gastos);
  const facturas = d.facturas.filter(cuentaEnContabilidad);
  const tickets = facturas.filter(f => f.posSessionId && f.sentido !== 'compra');
  const resto = facturas.filter(f => !(f.posSessionId && f.sentido !== 'compra'));
  const idsProveedor = new Set(d.clientes.filter(c => c.esProveedor).map(c => c.id));

  const asientos: Asiento[] = [
    ...resto.map(f => asientoFactura(f, t, d.sector)),
    ...asientosTpv(tickets, d.sector),
    ...d.gastos.filter(g => g.fecha).map(g => asientoGasto(g, t)),
    ...d.cobrosPagos.filter(c => c.fecha && c.importeTotal).map(c => asientoCobroPago(c, t, id => idsProveedor.has(id))),
    ...asientosDeApuntes(d.apuntes ?? [], d.hoy ?? new Date().toISOString().slice(0, 10)),
  ];

  // Facturas de venta cobradas sin cobro apuntado en tesorería: el cobro
  // existe (la factura está pagada), así que se genera por lo que falte.
  const cobradoPorFactura = new Map<string, number>();
  for (const c of d.cobrosPagos) {
    for (const x of c.desglose ?? []) {
      cobradoPorFactura.set(x.invoiceId, r2((cobradoPorFactura.get(x.invoiceId) ?? 0) + x.importeAplicado));
    }
  }
  for (const f of resto) {
    if (f.status !== 'pagada' || f.total <= 0) continue;
    const esCompra = f.sentido === 'compra';
    const pendiente = r2(f.total - r2(f.subtotal * ((f.retencionPct ?? 0) / 100)) - (cobradoPorFactura.get(f.id) ?? 0));
    if (pendiente <= 0.009) continue;
    const lineas: LineaAsiento[] = [];
    const tesoreria = cuentaDeTesoreria(f.paymentMethod);
    if (esCompra) {
      apuntar(lineas, t.cuentaProveedor(f.clientId, f.clientName), pendiente, 'debe');
      apuntar(lineas, tesoreria, pendiente, 'haber');
    } else {
      apuntar(lineas, tesoreria, pendiente, 'debe');
      apuntar(lineas, t.cuentaCliente(f.clientId, f.clientName), pendiente, 'haber');
    }
    asientos.push({
      numero: 0, fecha: f.paidDate || f.issueDate, origen: 'cobro_implicito',
      concepto: `${esCompra ? 'Pago' : 'Cobro'} de ${f.number} · ${f.clientName}`,
      documentoId: f.id, documento: f.number, lineas: compactar(lineas),
    });
  }

  const orden: Record<OrigenAsiento, number> = {
    apertura: 0, factura: 1, rectificativa: 2, tpv: 3, compra: 4, rectificativa_compra: 5, gasto: 6,
    cobro: 7, cobro_implicito: 8, pago: 9, periodico: 10, manual: 11,
  };
  return asientos
    .filter(a => a.lineas.length > 0)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || orden[a.origen] - orden[b.origen] || (a.documento ?? '').localeCompare(b.documento ?? ''));
}

export function nombresDeTerceros(d: Pick<DatosContables, 'clientes' | 'facturas' | 'gastos'>): Map<string, string> {
  return crearTerceros(d.clientes, d.facturas, d.gastos).nombres;
}
