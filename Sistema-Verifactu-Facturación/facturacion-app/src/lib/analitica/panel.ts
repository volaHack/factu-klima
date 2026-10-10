/**
 * LAS CUENTAS DEL PANEL DE ANÁLISIS
 *
 * Cada función contesta una pregunta del negocio con las facturas que ya
 * tiene: ¿voy a mejor o a peor este mes?, ¿qué días y a qué horas vendo?,
 * ¿cuánto de lo facturado ha entrado?, ¿cuánto tardan en pagarme?,
 * ¿quién sube y quién baja entre mis clientes?, ¿de dónde sale el dinero?
 *
 * Aquí sólo hay cuentas, sin React ni gráficas, para poder probarlas. Nada
 * se inventa: sin datos, cada función devuelve vacío y la tarjeta enseña
 * su estado vacío (ver el comentario de `topClients` en el panel).
 */

import { InvoiceStatus, type Invoice, type Product } from '@/lib/types';

/** Lo que cuenta como vendido: ni borradores, ni anuladas, ni ofertas rechazadas. */
const NO_ES_VENTA = new Set<string>([
  InvoiceStatus.BORRADOR,
  InvoiceStatus.ANULADA,
  InvoiceStatus.RECHAZADO,
  InvoiceStatus.PRE_APROBACION,
]);

export const esVenta = (f: Pick<Invoice, 'status'>) => !NO_ES_VENTA.has(f.status);

const cent = (n: number) => Math.round(n * 100) / 100;

/** 'AAAA-MM-DD' en hora local, que es la del negocio. */
export function diaLocal(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${dd}`;
}

const diaDe = (s: string | undefined | null) => (s ?? '').slice(0, 10);

/** Días entre dos 'AAAA-MM-DD', sin que el horario de verano mueva una hora. */
export function diasEntre(desde: string, hasta: string): number {
  const a = Date.UTC(+desde.slice(0, 4), +desde.slice(5, 7) - 1, +desde.slice(8, 10));
  const b = Date.UTC(+hasta.slice(0, 4), +hasta.slice(5, 7) - 1, +hasta.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

// ============================================================
// RITMO DEL MES — ¿voy por encima o por debajo de lo normal?
// ============================================================

export interface RitmoMes {
  /** Lo emitido del día 1 a hoy. */
  facturado: number;
  /** Si el mes sigue al mismo paso, dónde acaba. */
  proyeccion: number;
  mesAnterior: number;
  /** La media de los tres meses cerrados anteriores. */
  mediaTrimestre: number;
  mismoMesAnioPasado: number;
  diaDelMes: number;
  diasDelMes: number;
}

export function ritmoDelMes(facturas: readonly Invoice[], hoy: Date): RitmoMes {
  const anio = hoy.getFullYear();
  const mes = hoy.getMonth();
  const clave = (a: number, m: number) => {
    const d = new Date(a, m, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };
  const porMes = new Map<string, number>();
  for (const f of facturas) {
    if (!esVenta(f)) continue;
    const k = diaDe(f.issueDate).slice(0, 7);
    porMes.set(k, (porMes.get(k) ?? 0) + Number(f.total || 0));
  }
  // Del mes en curso, sólo hasta hoy: una factura con fecha futura no es ritmo.
  const hoyIso = diaLocal(hoy);
  const facturado = facturas
    .filter(f => esVenta(f) && diaDe(f.issueDate).slice(0, 7) === clave(anio, mes) && diaDe(f.issueDate) <= hoyIso)
    .reduce((s, f) => s + Number(f.total || 0), 0);

  const diaDelMes = hoy.getDate();
  const diasDelMes = new Date(anio, mes + 1, 0).getDate();
  const previos = [1, 2, 3].map(i => porMes.get(clave(anio, mes - i)) ?? 0);

  return {
    facturado: cent(facturado),
    proyeccion: cent(diaDelMes > 0 ? (facturado / diaDelMes) * diasDelMes : facturado),
    mesAnterior: cent(previos[0]),
    mediaTrimestre: cent(previos.reduce((s, v) => s + v, 0) / 3),
    mismoMesAnioPasado: cent(porMes.get(clave(anio - 1, mes)) ?? 0),
    diaDelMes,
    diasDelMes,
  };
}

// ============================================================
// ACTIVIDAD DIARIA — los días con ventas del último año
// ============================================================

export interface ActividadDiaria {
  desde: string;
  hasta: string;
  dias: { day: string; value: number }[];
  diasConVenta: number;
  mejorDia: { day: string; value: number } | null;
  /** Lo que se factura de media un día que se vende. */
  mediaDiaActivo: number;
}

export function actividadDiaria(facturas: readonly Invoice[], hoy: Date, dias = 365): ActividadDiaria {
  const hasta = diaLocal(hoy);
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - (dias - 1));
  const desde = diaLocal(inicio);
  const suma = new Map<string, number>();
  for (const f of facturas) {
    if (!esVenta(f)) continue;
    const d = diaDe(f.issueDate);
    if (d < desde || d > hasta) continue;
    suma.set(d, (suma.get(d) ?? 0) + Number(f.total || 0));
  }
  const lista = [...suma.entries()]
    .map(([day, value]) => ({ day, value: cent(value) }))
    .filter(d => d.value > 0)
    .sort((a, b) => a.day.localeCompare(b.day));
  const total = lista.reduce((s, d) => s + d.value, 0);
  const mejorDia = lista.reduce<{ day: string; value: number } | null>(
    (m, d) => (!m || d.value > m.value ? d : m), null);
  return {
    desde, hasta, dias: lista,
    diasConVenta: lista.length,
    mejorDia,
    mediaDiaActivo: lista.length ? cent(total / lista.length) : 0,
  };
}

// ============================================================
// CUÁNDO SE VENDE — día de la semana × franja horaria
// ============================================================

export const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const;
export const FRANJAS = ['<9 h', '9–11', '11–13', '13–15', '15–17', '17–19', '19–21', '≥21 h'] as const;

function franjaDe(hora: number): (typeof FRANJAS)[number] {
  if (hora < 9) return FRANJAS[0];
  if (hora >= 21) return FRANJAS[7];
  return FRANJAS[1 + Math.floor((hora - 9) / 2)];
}

export interface CeldaHoraria { x: string; y: number | null; ventas: number }
export interface MapaHorario {
  filas: { id: string; data: CeldaHoraria[] }[];
  ventas: number;
  /** La celda que más factura. */
  pico: { dia: string; franja: string; importe: number } | null;
}

/**
 * Cuándo se vende, con la hora en que se dio de alta cada venta.
 *
 * Sólo cuenta los últimos 90 días: los hábitos cambian (horario de
 * verano, un empleado nuevo) y un año entero los emborrona.
 */
export function mapaHorario(facturas: readonly Invoice[], hoy: Date, dias = 90): MapaHorario {
  const desde = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - dias).getTime();
  const importe = DIAS_SEMANA.map(() => FRANJAS.map(() => 0));
  const cuenta = DIAS_SEMANA.map(() => FRANJAS.map(() => 0));
  let ventas = 0;
  for (const f of facturas) {
    if (!esVenta(f) || !f.createdAt) continue;
    const t = new Date(f.createdAt);
    if (Number.isNaN(t.getTime()) || t.getTime() < desde || t.getTime() > hoy.getTime()) continue;
    const fila = (t.getDay() + 6) % 7; // lunes primero
    const col = FRANJAS.indexOf(franjaDe(t.getHours()));
    importe[fila][col] += Number(f.total || 0);
    cuenta[fila][col] += 1;
    ventas++;
  }
  let pico: MapaHorario['pico'] = null;
  const filas = DIAS_SEMANA.map((dia, i) => ({
    id: dia,
    data: FRANJAS.map((franja, j) => {
      const v = cent(importe[i][j]);
      if (v > 0 && (!pico || v > pico.importe)) pico = { dia, franja, importe: v };
      return { x: franja, y: cuenta[i][j] ? v : null, ventas: cuenta[i][j] };
    }),
  }));
  return { filas, ventas, pico };
}

// ============================================================
// ESTADO DEL COBRO — de lo facturado, qué ha entrado
// ============================================================

export type TramoCobro = 'cobrado' | 'al_dia' | 'vencido';
export interface EstadoCobro {
  tramos: { id: TramoCobro; label: string; value: number; facturas: number }[];
  total: number;
  /** Lo vencido, repartido por antigüedad. */
  antiguedad: { tramo: string; importe: number; facturas: number }[];
}

const PENDIENTES = new Set<string>([InvoiceStatus.EMITIDA, InvoiceStatus.PENDIENTE, InvoiceStatus.PARCIAL, InvoiceStatus.VENCIDA]);

export function estadoCobro(facturas: readonly Invoice[], hoy: Date, meses = 12): EstadoCobro {
  const desde = diaLocal(new Date(hoy.getFullYear(), hoy.getMonth() - (meses - 1), 1));
  const hoyIso = diaLocal(hoy);
  const t = { cobrado: [0, 0], al_dia: [0, 0], vencido: [0, 0] } as Record<TramoCobro, [number, number]>;
  const antig = [
    { tramo: '1–30 días', min: 1, max: 30 },
    { tramo: '31–60 días', min: 31, max: 60 },
    { tramo: '61–90 días', min: 61, max: 90 },
    { tramo: 'Más de 90', min: 91, max: Infinity },
  ].map(a => ({ ...a, importe: 0, facturas: 0 }));

  for (const f of facturas) {
    if (!esVenta(f) || diaDe(f.issueDate) < desde) continue;
    const total = Number(f.total || 0);
    if (f.status === InvoiceStatus.PAGADA) {
      t.cobrado[0] += total; t.cobrado[1]++;
    } else if (PENDIENTES.has(f.status)) {
      const vence = diaDe(f.dueDate) || diaDe(f.issueDate);
      const retraso = diasEntre(vence, hoyIso);
      if (f.status === InvoiceStatus.VENCIDA || retraso > 0) {
        t.vencido[0] += total; t.vencido[1]++;
        const a = antig.find(x => Math.max(1, retraso) >= x.min && Math.max(1, retraso) <= x.max);
        if (a) { a.importe += total; a.facturas++; }
      } else {
        t.al_dia[0] += total; t.al_dia[1]++;
      }
    }
  }
  const etiquetas: Record<TramoCobro, string> = { cobrado: 'Cobrado', al_dia: 'Pendiente, en plazo', vencido: 'Vencido' };
  const tramos = (['cobrado', 'al_dia', 'vencido'] as TramoCobro[])
    .map(id => ({ id, label: etiquetas[id], value: cent(t[id][0]), facturas: t[id][1] }));
  return {
    tramos,
    total: cent(tramos.reduce((s, x) => s + x.value, 0)),
    antiguedad: antig.map(({ tramo, importe, facturas: n }) => ({ tramo, importe: cent(importe), facturas: n })),
  };
}

// ============================================================
// DÍAS DE COBRO — cuánto tarda en entrar cada factura
// ============================================================

export interface PuntoCobro { x: number; y: number; numero: string; cliente: string }
export interface DiasDeCobro {
  aTiempo: PuntoCobro[];
  conRetraso: PuntoCobro[];
  /** Periodo medio de cobro, ponderado por importe (lo que pesa en caja). */
  periodoMedio: number;
  /** Qué parte de lo cobrado entró antes de su vencimiento. */
  pctATiempo: number;
}

export function diasDeCobro(facturas: readonly Invoice[], hoy: Date, meses = 12, maximo = 300): DiasDeCobro {
  const desde = diaLocal(new Date(hoy.getFullYear(), hoy.getMonth() - (meses - 1), 1));
  const pagadas = facturas
    .filter(f => f.status === InvoiceStatus.PAGADA && (f.paidDate || f.paidAt) && diaDe(f.issueDate) >= desde)
    .sort((a, b) => diaDe(b.issueDate).localeCompare(diaDe(a.issueDate)))
    .slice(0, maximo);

  const aTiempo: PuntoCobro[] = [];
  const conRetraso: PuntoCobro[] = [];
  let pesoDias = 0, peso = 0, importeATiempo = 0;
  for (const f of pagadas) {
    const pago = diaDe(f.paidDate || f.paidAt);
    const dias = Math.max(0, diasEntre(diaDe(f.issueDate), pago));
    const total = Number(f.total || 0);
    const punto = { x: cent(total), y: dias, numero: f.number, cliente: f.clientName };
    const vence = diaDe(f.dueDate) || diaDe(f.issueDate);
    if (pago <= vence) { aTiempo.push(punto); importeATiempo += total; } else conRetraso.push(punto);
    pesoDias += dias * total;
    peso += total;
  }
  return {
    aTiempo, conRetraso,
    periodoMedio: peso > 0 ? Math.round(pesoDias / peso) : 0,
    pctATiempo: peso > 0 ? Math.round((importeATiempo / peso) * 100) : 0,
  };
}

// ============================================================
// RANKING DE CLIENTES — quién sube y quién baja, mes a mes
// ============================================================

export interface PuntoRanking { x: string; y: number; importe: number }
export interface SerieRanking { id: string; data: PuntoRanking[] }

/**
 * Los mejores clientes del periodo y su puesto cada mes.
 *
 * Se clasifican entre ellos (del 1 al N): la pregunta es quién gana peso
 * frente a quién, no el puesto frente a toda la cartera. Un mes sin
 * compras cuenta como cero y va al final, que es lo que es.
 */
export function rankingClientes(facturas: readonly Invoice[], hoy: Date, meses = 6, top = 5): SerieRanking[] {
  const claves = Array.from({ length: meses }, (_, i) => {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - (meses - 1 - i), 1);
    return { k: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, etiqueta: MESES[d.getMonth()] };
  });
  const validas = new Set(claves.map(c => c.k));
  const porCliente = new Map<string, { nombre: string; total: number; mes: Map<string, number> }>();
  for (const f of facturas) {
    if (!esVenta(f)) continue;
    const k = diaDe(f.issueDate).slice(0, 7);
    if (!validas.has(k)) continue;
    const id = f.clientId || f.clientName;
    const c = porCliente.get(id) ?? { nombre: f.clientName || 'Sin nombre', total: 0, mes: new Map() };
    c.total += Number(f.total || 0);
    c.mes.set(k, (c.mes.get(k) ?? 0) + Number(f.total || 0));
    porCliente.set(id, c);
  }
  const mejores = [...porCliente.values()].sort((a, b) => b.total - a.total).slice(0, top);
  if (mejores.length < 2) return [];

  // Dos clientes con el mismo nombre comercial no pueden compartir serie.
  const vistos = new Map<string, number>();
  const nombres = mejores.map(c => {
    const n = vistos.get(c.nombre) ?? 0;
    vistos.set(c.nombre, n + 1);
    return n ? `${c.nombre} (${n + 1})` : c.nombre;
  });

  const series: SerieRanking[] = mejores.map((_, i) => ({ id: nombres[i], data: [] }));
  for (const { k, etiqueta } of claves) {
    const orden = mejores
      .map((c, i) => ({ i, v: c.mes.get(k) ?? 0 }))
      .sort((a, b) => b.v - a.v || a.i - b.i);
    orden.forEach((o, puesto) => {
      series[o.i].data.push({ x: etiqueta, y: puesto + 1, importe: cent(o.v) });
    });
  }
  return series;
}

// ============================================================
// MAPA DE VENTAS — categoría → producto, por importe
// ============================================================

export interface NodoMapa { id: string; nombre: string; value?: number; children?: NodoMapa[] }

/**
 * De dónde sale el dinero: cada categoría con sus productos.
 *
 * Seis categorías como mucho y ocho productos por categoría; lo demás se
 * junta en «Otras»/«Otros». Un mapa con cien cuadraditos no se lee.
 */
export function mapaDeVentas(
  facturas: readonly Invoice[],
  productos: readonly Pick<Product, 'id' | 'name' | 'category'>[],
  hoy: Date,
  meses = 12,
): { raiz: NodoMapa; total: number; categorias: number } {
  const desde = diaLocal(new Date(hoy.getFullYear(), hoy.getMonth() - (meses - 1), 1));
  const categoriaDe = new Map(productos.map(p => [p.id, (p.category || '').trim()]));
  const porNombre = new Map(productos.map(p => [p.name.trim().toLowerCase(), (p.category || '').trim()]));
  const cats = new Map<string, Map<string, number>>();
  let total = 0;

  for (const f of facturas) {
    if (!esVenta(f) || diaDe(f.issueDate) < desde) continue;
    for (const li of f.lineItems ?? []) {
      const importe = Number(li.total || 0);
      if (importe <= 0) continue;
      const nombre = (li.productName || 'Sin nombre').trim();
      const cat = categoriaDe.get(li.productId) || porNombre.get(nombre.toLowerCase()) || 'Sin categoría';
      const m = cats.get(cat) ?? new Map<string, number>();
      m.set(nombre, (m.get(nombre) ?? 0) + importe);
      cats.set(cat, m);
      total += importe;
    }
  }

  const sumar = (m: Map<string, number>) => [...m.values()].reduce((s, v) => s + v, 0);
  const ordenadas = [...cats.entries()].sort((a, b) => sumar(b[1]) - sumar(a[1]));
  const visibles = ordenadas.slice(0, 6);
  const resto = ordenadas.slice(6);
  if (resto.length) {
    const otras = new Map<string, number>();
    for (const [nombreCat, m] of resto) otras.set(nombreCat, sumar(m));
    visibles.push(['Otras categorías', otras]);
  }

  const children: NodoMapa[] = visibles.map(([cat, m]) => {
    const prods = [...m.entries()].sort((a, b) => b[1] - a[1]);
    const hojas: NodoMapa[] = prods.slice(0, 8).map(([id, v]) => ({ id: `${cat} · ${id}`, nombre: id, value: cent(v) }));
    const sobra = prods.slice(8);
    if (sobra.length) {
      hojas.push({ id: `${cat} · Otros (${sobra.length})`, nombre: `Otros (${sobra.length})`, value: cent(sobra.reduce((s, [, v]) => s + v, 0)) });
    }
    return { id: cat, nombre: cat, children: hojas };
  });

  return { raiz: { id: 'Ventas', nombre: 'Ventas', children }, total: cent(total), categorias: cats.size };
}
