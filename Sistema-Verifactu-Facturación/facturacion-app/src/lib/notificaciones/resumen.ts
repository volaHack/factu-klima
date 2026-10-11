/**
 * CÓMO FUE EL MES, EN CIFRAS
 *
 * Lo que va en el correo del día 1. Las cuentas de facturado y cobrado son
 * las del panel (`facturadoYCobrado`), para que el correo y la pantalla
 * digan lo mismo.
 */

import { InvoiceStatus, type Gasto, type Invoice } from '../types';
import { isFactura } from '../documentos';
import { facturadoYCobrado } from '../analitica';

export interface ResumenMes {
  /** AAAA-MM */
  mes: string;
  nombreMes: string;
  facturado: number;
  facturas: number;
  /** Lo facturado el mes anterior a `mes`. */
  anterior: number;
  /** Variación en %, o null si el mes anterior no hubo nada. */
  variacion: number | null;
  cobrado: number;
  gastos: number;
  /** A día de hoy: lo que falta por cobrar y lo que ya ha vencido. */
  pendiente: number;
  vencido: number;
  vencidas: { numero: string; cliente: string; total: number; dias: number }[];
  mejoresClientes: { nombre: string; total: number }[];
  /** Lo facturado menos los gastos del mes. */
  resultado: number;
  /** Lo facturado de media por factura. */
  ticketMedio: number;
  /** El mes aún no ha terminado: las cifras son «hasta hoy» y la comparación, con los mismos días del mes anterior. */
  parcial: boolean;
  /** Día del mes hasta el que se cuenta (si es parcial). */
  hastaDia: number;
  /** Los últimos 6 meses (el del resumen, el último): facturado y cobrado. */
  historial: { mes: string; etiqueta: string; facturado: number; cobrado: number }[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const isoDia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** El mes de hoy (AAAA-MM). */
export function mesDe(hoy: Date): string {
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
}

/** El mes que acaba de terminar (AAAA-MM). */
export function mesAnteriorA(hoy: Date): string {
  const d = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const PENDIENTES = new Set<string>([InvoiceStatus.EMITIDA, InvoiceStatus.PENDIENTE, InvoiceStatus.PARCIAL, InvoiceStatus.VENCIDA]);

export function resumenDelMes(todas: Invoice[], gastos: Gasto[], mes: string, hoy: Date): ResumenMes {
  const [anio, m] = mes.split('-').map(Number);
  const facturas = todas.filter(isFactura);

  // El último día del mes, a mediodía: así la ventana de dos meses del
  // panel es exactamente [mes anterior, este mes].
  const seis = facturadoYCobrado(facturas, new Date(anio, m, 0, 12), 6);
  const [previo, este] = seis.slice(-2);

  // El mes en curso se compara con los mismos días del mes anterior: el
  // día 11 no se puede comparar con un mes entero.
  const parcial = mes === mesDe(hoy);
  const hastaDia = parcial ? hoy.getDate() : new Date(anio, m, 0).getDate();
  let anteriorComparable = previo?.series1 ?? 0;
  if (parcial) {
    const pm = new Date(anio, m - 2, 1);
    const prefijo = `${pm.getFullYear()}-${String(pm.getMonth() + 1).padStart(2, '0')}`;
    const corte = `${prefijo}-${String(Math.min(hastaDia, new Date(anio, m - 1, 0).getDate())).padStart(2, '0')}`;
    const recortadas = facturas.filter(f => !(f.issueDate ?? '').startsWith(prefijo) || f.issueDate.slice(0, 10) <= corte);
    anteriorComparable = facturadoYCobrado(recortadas, new Date(anio, m, 0, 12), 2)[0]?.series1 ?? 0;
  }

  const delMes = facturas.filter(f =>
    f.status !== InvoiceStatus.ANULADA && f.status !== InvoiceStatus.BORRADOR && !f.cancelledAt
    && (f.issueDate ?? '').startsWith(mes));

  const porCliente = new Map<string, number>();
  for (const f of delMes) {
    const nombre = f.clientName || 'Sin cliente';
    porCliente.set(nombre, (porCliente.get(nombre) ?? 0) + f.total);
  }

  const hoyIso = isoDia(hoy);
  const abiertas = facturas.filter(f => PENDIENTES.has(f.status) && !f.cancelledAt);
  const debe = (f: Invoice) => r2(Math.max(0, f.total - (f.paidAmount ?? 0)));
  const vencidas = abiertas
    .filter(f => f.status === InvoiceStatus.VENCIDA || (f.dueDate && f.dueDate < hoyIso))
    .map(f => ({
      numero: f.number,
      cliente: f.clientName || 'Sin cliente',
      total: debe(f),
      dias: Math.max(0, Math.round((Date.parse(`${hoyIso}T12:00:00`) - Date.parse(`${(f.dueDate || f.issueDate).slice(0, 10)}T12:00:00`)) / 86_400_000)),
    }))
    .sort((a, b) => b.dias - a.dias);

  const facturado = este?.series1 ?? 0;
  const anterior = anteriorComparable;
  const gastosMes = r2(gastos.filter(g => (g.fecha ?? '').startsWith(mes)).reduce((s, g) => s + Number(g.total || 0), 0));
  const historial = seis.map((x, i) => {
    const d = new Date(anio, m - 6 + i, 1);
    return { mes: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, etiqueta: x.name, facturado: x.series1, cobrado: x.series2 };
  });
  return {
    mes,
    nombreMes: new Date(anio, m - 1, 15).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }),
    facturado,
    facturas: delMes.length,
    anterior,
    variacion: anterior > 0 ? Math.round(((facturado - anterior) / anterior) * 1000) / 10 : null,
    cobrado: este?.series2 ?? 0,
    gastos: gastosMes,
    pendiente: r2(abiertas.reduce((s, f) => s + debe(f), 0)),
    vencido: r2(vencidas.reduce((s, v) => s + v.total, 0)),
    vencidas: vencidas.slice(0, 5),
    mejoresClientes: [...porCliente.entries()]
      .map(([nombre, total]) => ({ nombre, total: r2(total) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 3),
    resultado: r2(facturado - gastosMes),
    ticketMedio: delMes.length ? r2(facturado / delMes.length) : 0,
    parcial,
    hastaDia,
    historial,
  };
}
