/**
 * ANÁLISIS DEL NEGOCIO — LOS NÚMEROS DETRÁS DE LAS GRÁFICAS DEL PANEL
 *
 * Las gráficas no calculan nada: reciben lo que sale de aquí. Así cada
 * cifra se puede probar sin montar un navegador, y la misma factura cuenta
 * igual en todas las gráficas.
 *
 * QUÉ FACTURA CUENTA
 *
 * Un borrador todavía no es venta y una anulada ya no lo es. Todo lo demás
 * (emitida, pendiente, parcial, pagada, vencida) es dinero facturado. Las
 * fechas se leen como día LOCAL: «2026-03-01» es el 1 de marzo aquí, no las
 * 00:00 de Greenwich, que en Canarias en invierno o en América sería el 28
 * de febrero y movería la factura de mes.
 */

import { InvoiceStatus, type Invoice, type Product } from './types';

// ------------------------------------------------------------
// Utilidades de fecha
// ------------------------------------------------------------

export const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
/** Lunes primero, que es como se lee una semana en España. */
export const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/** Una fecha guardada como texto, leída como día local. */
export function fechaLocal(valor: string | undefined | null): Date | null {
  if (!valor) return null;
  const soloDia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (soloDia) return new Date(Number(soloDia[1]), Number(soloDia[2]) - 1, Number(soloDia[3]));
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** «2026-03-01», en hora local. */
export function claveDia(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const inicioDelDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const diasEntre = (a: Date, b: Date) =>
  Math.round((inicioDelDia(b).getTime() - inicioDelDia(a).getTime()) / 86_400_000);
const diasDelMes = (anio: number, mes: number) => new Date(anio, mes + 1, 0).getDate();
/** 0 = lunes … 6 = domingo. */
const diaSemana = (d: Date) => (d.getDay() + 6) % 7;
const redondear = (n: number) => Math.round(n * 100) / 100;

/** Los últimos `n` meses, del más antiguo al actual, como {anio, mes}. */
function ultimosMeses(hoy: Date, n: number): { anio: number; mes: number; nombre: string }[] {
  const salida = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    salida.push({ anio: d.getFullYear(), mes: d.getMonth(), nombre: MESES_CORTOS[d.getMonth()] });
  }
  return salida;
}

// ------------------------------------------------------------
// Qué cuenta como venta y cuándo se cobró
// ------------------------------------------------------------

/** Facturado de verdad: ni borrador ni anulada. */
export function cuentaComoVenta(inv: Invoice): boolean {
  return inv.status !== InvoiceStatus.ANULADA && inv.status !== InvoiceStatus.BORRADOR;
}

/** El día en que entró el dinero, si la factura está pagada y se sabe cuándo. */
export function fechaDeCobro(inv: Invoice): Date | null {
  if (inv.status !== InvoiceStatus.PAGADA) return null;
  return fechaLocal(inv.paidDate) ?? fechaLocal(inv.paidAt);
}

function ventas(invoices: Invoice[]) {
  return invoices
    .filter(cuentaComoVenta)
    .map(inv => ({ inv, fecha: fechaLocal(inv.issueDate) }))
    .filter((v): v is { inv: Invoice; fecha: Date } => v.fecha !== null);
}

const mismoMes = (d: Date, anio: number, mes: number) => d.getFullYear() === anio && d.getMonth() === mes;

// ============================================================
// 1 · RITMO DEL MES (Bullet)
//
// ¿Voy bien este mes? La barra es lo facturado hasta hoy; su
// prolongación, adónde llega el mes si sigue a este paso. Detrás, en
// gris, la media y el mejor de los doce meses anteriores. Las marcas son
// el mes pasado y el mismo mes del año pasado.
// ============================================================

export interface RitmoFila {
  /** Lo que ya ha ocurrido este mes. */
  actual: number;
  /** Adónde llega el mes a este paso. Igual a `actual` en la fila de cobros. */
  proyeccion: number;
  mediaDoceMeses: number;
  mejorDoceMeses: number;
  mesAnterior: number;
  mismoMesAnioPasado: number;
}

export interface RitmoDelMes {
  diaDelMes: number;
  diasDelMes: number;
  facturado: RitmoFila;
  cobrado: RitmoFila;
}

export function ritmoDelMes(invoices: Invoice[], hoy: Date): RitmoDelMes {
  const anio = hoy.getFullYear();
  const mes = hoy.getMonth();
  const dia = hoy.getDate();
  const totalDias = diasDelMes(anio, mes);

  const facturadoEn = new Map<string, number>();
  for (const { inv, fecha } of ventas(invoices)) {
    const k = `${fecha.getFullYear()}-${fecha.getMonth()}`;
    facturadoEn.set(k, (facturadoEn.get(k) ?? 0) + inv.total);
  }
  const cobradoEn = new Map<string, number>();
  for (const inv of invoices) {
    const f = fechaDeCobro(inv);
    if (!f) continue;
    const k = `${f.getFullYear()}-${f.getMonth()}`;
    cobradoEn.set(k, (cobradoEn.get(k) ?? 0) + inv.total);
  }

  const clave = (a: number, m: number) => {
    const d = new Date(a, m, 1);
    return `${d.getFullYear()}-${d.getMonth()}`;
  };

  const fila = (serie: Map<string, number>, proyectar: boolean): RitmoFila => {
    const actual = redondear(serie.get(clave(anio, mes)) ?? 0);
    const previos = Array.from({ length: 12 }, (_, i) => serie.get(clave(anio, mes - 1 - i)) ?? 0);
    return {
      actual,
      proyeccion: proyectar ? redondear((actual / dia) * totalDias) : actual,
      mediaDoceMeses: redondear(previos.reduce((s, v) => s + v, 0) / 12),
      mejorDoceMeses: redondear(Math.max(0, ...previos)),
      mesAnterior: redondear(previos[0]),
      mismoMesAnioPasado: redondear(serie.get(clave(anio - 1, mes)) ?? 0),
    };
  };

  return {
    diaDelMes: dia,
    diasDelMes: totalDias,
    facturado: fila(facturadoEn, true),
    cobrado: fila(cobradoEn, false),
  };
}

// ============================================================
// 2 · DÍAS CON VENTAS (TimeRange)
//
// Un año de días en una rejilla, como la de actividad de GitHub: se ve de
// un vistazo qué semanas se paró la tienda y cuáles no dio abasto.
// ============================================================

export interface DiaVenta {
  day: string;
  value: number;
  facturas: number;
}

export interface VentasPorDia {
  /** Lunes con el que arranca la rejilla (columna entera). */
  desde: Date;
  /** Mañana: Nivo no incluye el último día del rango. */
  hasta: Date;
  dias: DiaVenta[];
  diasConVenta: number;
  mejorDia: DiaVenta | null;
}

export function ventasPorDia(invoices: Invoice[], hoy: Date, semanas = 53): VentasPorDia {
  const hoy0 = inicioDelDia(hoy);
  const lunesActual = new Date(hoy0.getFullYear(), hoy0.getMonth(), hoy0.getDate() - diaSemana(hoy0));
  const desde = new Date(lunesActual.getFullYear(), lunesActual.getMonth(), lunesActual.getDate() - (semanas - 1) * 7);
  const hasta = new Date(hoy0.getFullYear(), hoy0.getMonth(), hoy0.getDate() + 1);

  const porDia = new Map<string, DiaVenta>();
  for (const { inv, fecha } of ventas(invoices)) {
    if (fecha < desde || fecha >= hasta) continue;
    const day = claveDia(fecha);
    const d = porDia.get(day) ?? { day, value: 0, facturas: 0 };
    d.value += inv.total;
    d.facturas += 1;
    porDia.set(day, d);
  }

  const dias = [...porDia.values()]
    .map(d => ({ ...d, value: redondear(d.value) }))
    .filter(d => d.value > 0)
    .sort((a, b) => a.day.localeCompare(b.day));

  const mejorDia = dias.reduce<DiaVenta | null>((m, d) => (!m || d.value > m.value ? d : m), null);
  return { desde, hasta, dias, diasConVenta: dias.length, mejorDia };
}

// ============================================================
// 3 · QUÉ DÍA DE LA SEMANA SE VENDE (HeatMap)
//
// Venta MEDIA por día de la semana y mes, no la suma: un mes con cinco
// lunes no tiene por qué parecer mejor en lunes que uno con cuatro.
// ============================================================

export interface CeldaSemana {
  x: string;
  y: number | null;
  /** Cuántos días de ese tipo tuvo el mes (hasta hoy, en el mes actual). */
  dias: number;
  total: number;
}

export interface FilaSemana {
  id: string;
  data: CeldaSemana[];
}

export function mapaSemanal(invoices: Invoice[], hoy: Date, meses = 6): FilaSemana[] {
  const ventana = ultimosMeses(hoy, meses);
  const sumas = new Map<string, number>();
  for (const { inv, fecha } of ventas(invoices)) {
    if (fecha > hoy) continue;
    const k = `${fecha.getFullYear()}-${fecha.getMonth()}-${diaSemana(fecha)}`;
    sumas.set(k, (sumas.get(k) ?? 0) + inv.total);
  }

  return DIAS_SEMANA.map((nombre, ds) => ({
    id: nombre,
    data: ventana.map(({ anio, mes, nombre: mesNombre }) => {
      // Cuántos días `ds` tuvo ese mes, sin contar los que aún no han llegado.
      const ultimo = anio === hoy.getFullYear() && mes === hoy.getMonth() ? hoy.getDate() : diasDelMes(anio, mes);
      let dias = 0;
      for (let d = 1; d <= ultimo; d++) if (diaSemana(new Date(anio, mes, d)) === ds) dias++;
      const total = redondear(sumas.get(`${anio}-${mes}-${ds}`) ?? 0);
      return {
        x: `${mesNombre} ${String(anio).slice(2)}`,
        y: dias > 0 ? redondear(total / dias) : null,
        dias,
        total,
      };
    }),
  }));
}

// ============================================================
// 4 · EN QUÉ PUNTO ESTÁ EL COBRO (Waffle)
//
// De cada 100 € facturados en los últimos doce meses, cuántos han entrado,
// cuántos están por cobrar a tiempo y cuántos ya van tarde.
// ============================================================

export interface EstadoCobro {
  cobrado: number;
  pendiente: number;
  vencido: number;
  total: number;
}

/** Vencida: marcada como tal, o sin cobrar y con el vencimiento ya pasado. */
export function estaVencida(inv: Invoice, hoy: Date): boolean {
  if (inv.status === InvoiceStatus.VENCIDA) return true;
  if (inv.status === InvoiceStatus.PAGADA || !cuentaComoVenta(inv)) return false;
  const vence = fechaLocal(inv.dueDate);
  return vence !== null && vence < inicioDelDia(hoy);
}

export function estadoCobro(invoices: Invoice[], hoy: Date, meses = 12): EstadoCobro {
  const desde = new Date(hoy.getFullYear(), hoy.getMonth() - meses + 1, 1);
  let cobrado = 0;
  let pendiente = 0;
  let vencido = 0;
  for (const { inv, fecha } of ventas(invoices)) {
    if (fecha < desde || fecha > hoy) continue;
    if (inv.status === InvoiceStatus.PAGADA) cobrado += inv.total;
    else if (estaVencida(inv, hoy)) vencido += inv.total;
    else pendiente += inv.total;
  }
  return {
    cobrado: redondear(cobrado),
    pendiente: redondear(pendiente),
    vencido: redondear(vencido),
    total: redondear(cobrado + pendiente + vencido),
  };
}

// ============================================================
// 5 · ANTIGÜEDAD DE LA DEUDA
//
// Lo que se debe, por cuánto hace que venció. No es lo mismo deber 3.000 €
// desde hace una semana que desde hace cuatro meses.
// ============================================================

export interface TramoDeuda {
  tramo: string;
  importe: number;
  facturas: number;
}

/** Cortos a propósito: en el móvil cinco etiquetas largas se pisan bajo el eje. */
export const TRAMOS_DEUDA = ['Sin vencer', '1–30 d', '31–60 d', '61–90 d', '+90 d'] as const;

export function antiguedadDeuda(invoices: Invoice[], hoy: Date): TramoDeuda[] {
  const tramos = TRAMOS_DEUDA.map(tramo => ({ tramo: tramo as string, importe: 0, facturas: 0 }));
  for (const { inv } of ventas(invoices)) {
    if (inv.status === InvoiceStatus.PAGADA) continue;
    const vence = fechaLocal(inv.dueDate);
    const retraso = vence ? diasEntre(vence, hoy) : 0;
    const i = retraso <= 0 && inv.status !== InvoiceStatus.VENCIDA ? 0
      : retraso <= 30 ? 1
      : retraso <= 60 ? 2
      : retraso <= 90 ? 3
      : 4;
    tramos[i].importe += inv.total;
    tramos[i].facturas += 1;
  }
  return tramos.map(t => ({ ...t, importe: redondear(t.importe) }));
}

// ============================================================
// 6 · QUIÉN PAGA Y CUÁNTO TARDA (ScatterPlot)
//
// Cada punto es un cliente: a la derecha, los que tardan en pagar; arriba,
// los que más facturan. El cuadrante que preocupa es el de arriba a la
// derecha: mucho dinero que llega tarde.
// ============================================================

export interface PuntualidadCliente {
  id: string;
  nombre: string;
  /** Días medios entre la emisión y el cobro. */
  diasMedios: number;
  facturado: number;
  facturasCobradas: number;
}

export function puntualidadClientes(invoices: Invoice[], hoy: Date, meses = 12): PuntualidadCliente[] {
  const desde = new Date(hoy.getFullYear(), hoy.getMonth() - meses + 1, 1);
  const porCliente = new Map<string, { nombre: string; dias: number; cobradas: number; facturado: number }>();
  for (const { inv, fecha } of ventas(invoices)) {
    if (fecha < desde) continue;
    const c = porCliente.get(inv.clientId) ?? { nombre: inv.clientName, dias: 0, cobradas: 0, facturado: 0 };
    c.facturado += inv.total;
    const cobro = fechaDeCobro(inv);
    if (cobro) {
      c.dias += Math.max(0, diasEntre(fecha, cobro));
      c.cobradas += 1;
    }
    porCliente.set(inv.clientId, c);
  }
  return [...porCliente.entries()]
    .filter(([, c]) => c.cobradas > 0)
    .map(([id, c]) => ({
      id,
      nombre: c.nombre,
      diasMedios: Math.round(c.dias / c.cobradas),
      facturado: redondear(c.facturado),
      facturasCobradas: c.cobradas,
    }))
    .sort((a, b) => b.facturado - a.facturado);
}

/** Días medios de cobro de toda la cartera, ponderados por factura. */
export function diasMediosDeCobro(invoices: Invoice[], hoy: Date, meses = 12): number | null {
  const clientes = puntualidadClientes(invoices, hoy, meses);
  const facturas = clientes.reduce((s, c) => s + c.facturasCobradas, 0);
  if (facturas === 0) return null;
  return Math.round(clientes.reduce((s, c) => s + c.diasMedios * c.facturasCobradas, 0) / facturas);
}

// ============================================================
// 7 · CÓMO SE MUEVEN LOS MEJORES CLIENTES (Bump)
//
// Los cinco que más han facturado en el periodo y el puesto que ocupa cada
// uno, mes a mes, entre ellos cinco. Un cliente que baja del primero al
// cuarto no aparece en un ranking anual; aquí se ve caer.
// ============================================================

export interface PuestoMes {
  x: string;
  y: number | null;
  importe: number;
}

export interface SerieRanking {
  id: string;
  nombre: string;
  total: number;
  data: PuestoMes[];
}

export function rankingClientes(invoices: Invoice[], hoy: Date, meses = 6, cuantos = 5): SerieRanking[] {
  const ventana = ultimosMeses(hoy, meses);
  const desde = new Date(ventana[0].anio, ventana[0].mes, 1);

  const porCliente = new Map<string, { nombre: string; total: number; porMes: number[] }>();
  for (const { inv, fecha } of ventas(invoices)) {
    if (fecha < desde || fecha > hoy) continue;
    const i = ventana.findIndex(m => mismoMes(fecha, m.anio, m.mes));
    if (i < 0) continue;
    const c = porCliente.get(inv.clientId) ?? { nombre: inv.clientName, total: 0, porMes: ventana.map(() => 0) };
    c.total += inv.total;
    c.porMes[i] += inv.total;
    porCliente.set(inv.clientId, c);
  }

  const mejores = [...porCliente.entries()]
    .sort((a, b) => b[1].total - a[1].total || a[1].nombre.localeCompare(b[1].nombre))
    .slice(0, cuantos);

  // Puesto de cada uno entre los elegidos; sin ventas ese mes, sin puesto.
  const puestos = ventana.map((_, i) => {
    const conVentas = mejores
      .filter(([, c]) => c.porMes[i] > 0)
      .sort((a, b) => b[1].porMes[i] - a[1].porMes[i] || b[1].total - a[1].total);
    return new Map(conVentas.map(([id], p) => [id, p + 1]));
  });

  // Mismo nombre en dos clientes: Nivo identifica la serie por el id.
  return mejores.map(([id, c]) => ({
    id,
    nombre: c.nombre,
    total: redondear(c.total),
    data: ventana.map((m, i) => ({
      x: `${m.nombre} ${String(m.anio).slice(2)}`,
      y: puestos[i].get(id) ?? null,
      importe: redondear(c.porMes[i]),
    })),
  }));
}

// ============================================================
// 8 · DE DÓNDE SALE LA FACTURACIÓN (TreeMap)
//
// Categoría → producto, con el área proporcional a lo facturado. Como
// mucho seis categorías (cinco y «Otras»): una séptima no tiene color
// propio que distinguir, y seis productos por categoría para que las
// etiquetas quepan.
// ============================================================

export interface NodoArbol {
  /**
   * Por posición, nunca el nombre: Nivo compone la ruta de cada nodo
   * uniendo ids con puntos, y «Tornillo 3.5mm» la partiría en dos.
   */
  id: string;
  nombre: string;
  /** Qué categoría es (o de cuál cuelga): elige su color, en orden fijo. */
  categoria: number;
  nombreCategoria: string;
  value?: number;
  children?: NodoArbol[];
}

export const MAX_CATEGORIAS = 6;
const MAX_PRODUCTOS = 6;

const bonito = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ') : s);

export function ventasPorCategoria(invoices: Invoice[], products: Product[], hoy: Date, meses = 12): NodoArbol {
  const desde = new Date(hoy.getFullYear(), hoy.getMonth() - meses + 1, 1);
  const categoriaDe = new Map(products.map(p => [p.id, p.category]));

  const porCategoria = new Map<string, Map<string, number>>();
  for (const { inv, fecha } of ventas(invoices)) {
    if (fecha < desde || fecha > hoy) continue;
    for (const li of inv.lineItems ?? []) {
      // La base de la línea: el IVA no es venta del negocio.
      const importe = Number(li.subtotal ?? li.total) || 0;
      if (importe <= 0) continue;
      const cat = bonito(categoriaDe.get(li.productId) ?? '') || 'Sin categoría';
      const prod = li.productName || 'Sin nombre';
      const m = porCategoria.get(cat) ?? new Map<string, number>();
      m.set(prod, (m.get(prod) ?? 0) + importe);
      porCategoria.set(cat, m);
    }
  }

  const total = (m: Map<string, number>) => [...m.values()].reduce((s, v) => s + v, 0);
  const ordenadas = [...porCategoria.entries()].sort((a, b) => total(b[1]) - total(a[1]));

  let categorias = ordenadas;
  if (ordenadas.length > MAX_CATEGORIAS) {
    const otras = new Map<string, number>();
    for (const [, m] of ordenadas.slice(MAX_CATEGORIAS - 1)) {
      for (const [p, v] of m) otras.set(p, (otras.get(p) ?? 0) + v);
    }
    categorias = [...ordenadas.slice(0, MAX_CATEGORIAS - 1), ['Otras', otras]];
  }

  return {
    id: 'ventas',
    nombre: 'Ventas',
    categoria: -1,
    nombreCategoria: '',
    children: categorias.map(([cat, m], c) => {
      const productos = [...m.entries()].sort((a, b) => b[1] - a[1]);
      const visibles = productos.slice(0, MAX_PRODUCTOS);
      const resto = productos.slice(MAX_PRODUCTOS).reduce((s, [, v]) => s + v, 0);
      const hoja = (nombre: string, v: number, j: number): NodoArbol => ({
        id: `c${c}-p${j}`, nombre, categoria: c, nombreCategoria: cat, value: redondear(v),
      });
      const hojas = visibles.map(([p, v], j) => hoja(p, v, j));
      if (resto > 0) {
        const n = productos.length - MAX_PRODUCTOS;
        hojas.push(hoja(`${n} ${n === 1 ? 'producto más' : 'productos más'}`, resto, MAX_PRODUCTOS));
      }
      return { id: `c${c}`, nombre: cat, categoria: c, nombreCategoria: cat, children: hojas };
    }),
  };
}

// ============================================================
// Cifras de cabecera
// ============================================================

export interface CifrasAnalisis {
  ticketMedio: number;
  facturas: number;
  clientesActivos: number;
  clientesNuevos: number;
  diasMediosCobro: number | null;
  porcentajeCobrado: number | null;
}

/** Los cuatro números que acompañan a las gráficas, de los últimos doce meses. */
export function cifrasAnalisis(invoices: Invoice[], hoy: Date): CifrasAnalisis {
  const desde = new Date(hoy.getFullYear(), hoy.getMonth() - 11, 1);
  const hace90 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 90);
  const todas = ventas(invoices);
  const periodo = todas.filter(v => v.fecha >= desde && v.fecha <= hoy);
  const facturado = periodo.reduce((s, v) => s + v.inv.total, 0);

  const primeraCompra = new Map<string, Date>();
  for (const { inv, fecha } of todas) {
    const p = primeraCompra.get(inv.clientId);
    if (!p || fecha < p) primeraCompra.set(inv.clientId, fecha);
  }

  const cobro = estadoCobro(invoices, hoy);
  return {
    ticketMedio: periodo.length ? redondear(facturado / periodo.length) : 0,
    facturas: periodo.length,
    clientesActivos: new Set(todas.filter(v => v.fecha >= hace90 && v.fecha <= hoy).map(v => v.inv.clientId)).size,
    clientesNuevos: [...primeraCompra.values()].filter(f => f >= hace90 && f <= hoy).length,
    diasMediosCobro: diasMediosDeCobro(invoices, hoy),
    porcentajeCobrado: cobro.total > 0 ? Math.round((cobro.cobrado / cobro.total) * 100) : null,
  };
}
