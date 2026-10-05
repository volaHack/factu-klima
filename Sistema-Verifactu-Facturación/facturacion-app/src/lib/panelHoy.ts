/**
 * LO QUE HAY QUE HACER HOY
 *
 * La cabecera del panel abre con esto y no con cifras: quien entra por la
 * mañana quiere saber qué le toca, no cuánto facturó en marzo. Cada tarea
 * sale de datos que ya hay (facturas, facturas electrónicas recibidas, el
 * trimestre) y lleva al sitio donde se resuelve.
 *
 * Sin estado y sin leer nada, como `panelDatos`: el panel pasa los datos y
 * pinta lo que vuelve.
 */

import { InvoiceStatus, type Invoice } from './types';
import { diasEntre } from './panelDatos';
import { tareasPendientes, type FeResumen } from './facturaElectronica/estados';
import type { ApartarHacienda } from './fiscal/apartarHacienda';

export type TonoTarea = 'peligro' | 'aviso' | 'info';

export interface TareaHoy {
  id: string;
  tono: TonoTarea;
  titulo: string;
  detalle: string;
  /** Importe que se juega en la tarea, si lo hay. */
  importe?: number;
  href: string;
  accion: string;
}

export const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
const hace = (dias: number) => (dias <= 0 ? 'hoy' : dias === 1 ? 'ayer' : `hace ${dias} días`);
const r2 = (n: number) => Math.round(n * 100) / 100;
const ORDEN: Record<TonoTarea, number> = { peligro: 0, aviso: 1, info: 2 };
const esVenta = (f: Invoice) => f.sentido !== 'compra' && (!f.tipo || f.tipo === 'factura' || f.tipo === 'rectificativa');

function sumarDias(iso: string, n: number): string {
  const [a, m, d] = iso.split('-').map(Number);
  const f = new Date(Date.UTC(a, m - 1, d + n));
  return f.toISOString().slice(0, 10);
}

/** «20 de octubre» de un AAAA-MM-DD, sin pasar por la zona horaria. */
export function diaYMes(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d, 12)).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', timeZone: 'UTC' });
}

export interface EntradaHoy {
  /** Todos los documentos (facturas, borradores, presupuestos…). */
  documentos: Invoice[];
  /** Facturas electrónicas, las dos direcciones. */
  fe?: FeResumen[];
  /** El trimestre cerrado que aún está en plazo (`presentacionPendiente`). */
  presentacion?: ApartarHacienda | null;
  igic?: boolean;
  hoy: string;
}

export function tareasDeHoy({ documentos, fe = [], presentacion, igic, hoy }: EntradaHoy): TareaHoy[] {
  const tareas: TareaHoy[] = [];
  const ventas = documentos.filter(esVenta);

  // Vencidas: dinero que ya debería estar en la cuenta.
  const vencidas = ventas.filter(f => f.status === InvoiceStatus.VENCIDA && !f.cancelledAt);
  if (vencidas.length) {
    const masAntigua = Math.max(...vencidas.map(f => diasEntre(f.dueDate || f.issueDate, hoy)));
    tareas.push({
      id: 'vencidas', tono: 'peligro',
      titulo: `${plural(vencidas.length, 'factura vencida', 'facturas vencidas')} sin cobrar`,
      detalle: `La más antigua venció ${hace(masAntigua)}`,
      importe: r2(vencidas.reduce((s, f) => s + f.total, 0)),
      href: '/recordatorios', accion: 'Reclamar',
    });
  }

  // Trimestre cerrado en plazo de presentación.
  if (presentacion) {
    const modelos = presentacion.conceptos.map(c => c.modelo).join(' y ');
    const quedan = presentacion.diasParaPlazo;
    tareas.push({
      id: 'trimestre', tono: quedan <= 5 ? 'peligro' : 'aviso',
      titulo: `Presentar el ${igic ? 'IGIC' : 'IVA'} del ${presentacion.trimestre}.º trimestre`,
      detalle: `Modelo ${modelos} · hasta el ${diaYMes(presentacion.plazo)} (${quedan === 0 ? 'hoy es el último día' : quedan === 1 ? 'queda 1 día' : `quedan ${quedan} días`})`,
      importe: presentacion.total > 0 ? presentacion.total : undefined,
      href: `/listados-fiscales/${presentacion.conceptos[0]?.modelo ?? ''}`, accion: 'Preparar',
    });
  }

  // Facturas electrónicas recibidas: plazo legal para contestar.
  const fePendientes = tareasPendientes(fe, hoy);
  const pagos = fePendientes.filter(t => t.tipo === 'pago');
  const decidir = fePendientes.filter(t => t.tipo === 'decidir');
  if (pagos.length) {
    tareas.push({
      id: 'fe-pago', tono: 'peligro',
      titulo: `${plural(pagos.length, 'factura recibida vencida', 'facturas recibidas vencidas')}`,
      detalle: 'Si ya las has pagado, comunícalo: hay 4 días hábiles',
      href: '/factura-electronica', accion: 'Comunicar',
    });
  }
  if (decidir.length) {
    tareas.push({
      id: 'fe-decidir', tono: 'aviso',
      titulo: `${plural(decidir.length, 'factura electrónica', 'facturas electrónicas')} por aceptar o rechazar`,
      detalle: 'Las de proveedores que han llegado por el canal electrónico',
      href: '/factura-electronica', accion: 'Revisar',
    });
  }

  // Cobros que vencen esta semana: avisar antes de que se pasen.
  const enSieteDias = sumarDias(hoy, 7);
  const prontas = ventas.filter(f =>
    (f.status === InvoiceStatus.EMITIDA || f.status === InvoiceStatus.PENDIENTE || f.status === InvoiceStatus.PARCIAL)
    && !f.cancelledAt && f.dueDate && f.dueDate >= hoy && f.dueDate <= enSieteDias);
  if (prontas.length) {
    tareas.push({
      id: 'vencen', tono: 'info',
      titulo: `${plural(prontas.length, 'cobro vence', 'cobros vencen')} esta semana`,
      detalle: prontas.length === 1 ? `${prontas[0].clientName || 'Sin cliente'} · el ${diaYMes(prontas[0].dueDate)}` : 'En los próximos siete días',
      importe: r2(prontas.reduce((s, f) => s + f.total, 0)),
      href: '/tesoreria', accion: 'Ver cobros',
    });
  }

  // Borradores: trabajo empezado que no cuenta hasta que se emite.
  const borradores = documentos.filter(d => d.status === InvoiceStatus.BORRADOR && esVenta(d));
  if (borradores.length) {
    const masViejo = Math.max(...borradores.map(d => diasEntre(d.updatedAt || d.createdAt || d.issueDate, hoy)));
    tareas.push({
      id: 'borradores', tono: 'info',
      titulo: `${plural(borradores.length, 'borrador', 'borradores')} sin emitir`,
      detalle: `El más antiguo, de ${hace(masViejo)}`,
      importe: r2(borradores.reduce((s, d) => s + d.total, 0)) || undefined,
      href: '/facturas', accion: 'Emitir',
    });
  }

  return tareas.sort((a, b) => ORDEN[a.tono] - ORDEN[b.tono]);
}

// ------------------------------------------------------------------
// Vendido este mes, comparado con justicia
// ------------------------------------------------------------------

export interface ComparativaMes {
  total: number;
  facturas: number;
  /** Lo vendido el mes pasado hasta el mismo día. */
  anterior: number;
  /** Variación en %, o null si el mes pasado no hubo nada con que comparar. */
  variacion: number | null;
  /** Último día comparado del mes pasado. */
  hastaDia: number;
}

/**
 * Lo vendido en lo que va de mes frente a lo vendido el mes pasado HASTA
 * EL MISMO DÍA. Comparar cinco días de octubre con todo septiembre daba
 * casi siempre un «−75 %» en rojo a principio de mes, sin que nada fuera mal.
 */
export function comparativaMes(facturas: Invoice[], hoy: string): ComparativaMes {
  const [a, m, d] = hoy.split('-').map(Number);
  const mes = hoy.slice(0, 7);
  const aPas = m === 1 ? a - 1 : a;
  const mPas = m === 1 ? 12 : m - 1;
  const mesPasado = `${aPas}-${String(mPas).padStart(2, '0')}`;
  const diasMesPasado = new Date(aPas, mPas, 0).getDate();
  const hastaDia = Math.min(d, diasMesPasado);
  const limite = `${mesPasado}-${String(hastaDia).padStart(2, '0')}`;

  const vivas = facturas.filter(f => esVenta(f) && f.status !== InvoiceStatus.ANULADA && f.status !== InvoiceStatus.BORRADOR && !f.cancelledAt);
  const deEste = vivas.filter(f => f.issueDate?.slice(0, 7) === mes && f.issueDate.slice(0, 10) <= hoy);
  const delPasado = vivas.filter(f => f.issueDate?.slice(0, 7) === mesPasado && f.issueDate.slice(0, 10) <= limite);
  const total = r2(deEste.reduce((s, f) => s + f.total, 0));
  const anterior = r2(delPasado.reduce((s, f) => s + f.total, 0));
  return {
    total, facturas: deEste.length, anterior, hastaDia,
    variacion: anterior > 0 ? Math.round(((total - anterior) / anterior) * 1000) / 10 : null,
  };
}
