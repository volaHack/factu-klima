'use client';

/**
 * FACTURAS RECURRENTES
 *
 * Una factura ya hecha (la cuota de mantenimiento, el alquiler, la iguala
 * mensual) se marca para repetirse cada mes, trimestre, semestre o año. Al
 * llegar la fecha, el programa prepara la siguiente como BORRADOR, copiando
 * cliente, líneas, forma de pago y notas, con su número y sus fechas.
 *
 * No se emite sola: una factura emitida ya no se puede cambiar, sólo
 * rectificar, así que el último paso lo da una persona. El aviso sale al
 * entrar en el programa.
 *
 * Lo que se repite se guarda en la cuenta (ver `cuentaMetadatos.ts`): sólo
 * la referencia a la factura de origen y el calendario, nunca las líneas.
 */

import {
  getCompanySettings, getInvoiceById, notifyDataUpdate, saveCompanySettings, saveInvoice,
} from './storage';
import { InvoiceStatus, type Invoice } from './types';
import { addDays, generateId, generateInvoiceNumber, sequenceFromNumber } from './utils';
import { guardarEnCuenta, leerDeCuenta } from './cuentaMetadatos';

export type Periodo = 'mes' | 'trimestre' | 'semestre' | 'anio';

export const PERIODOS: { id: Periodo; nombre: string; cada: string; meses: number }[] = [
  { id: 'mes', nombre: 'Mensual', cada: 'cada mes', meses: 1 },
  { id: 'trimestre', nombre: 'Trimestral', cada: 'cada trimestre', meses: 3 },
  { id: 'semestre', nombre: 'Semestral', cada: 'cada seis meses', meses: 6 },
  { id: 'anio', nombre: 'Anual', cada: 'cada año', meses: 12 },
];

export interface Recurrente {
  id: string;
  /** La factura que se copia. */
  origenId: string;
  origenNumero: string;
  cliente: string;
  importe: number;
  periodo: Periodo;
  /** La fecha de la próxima factura (AAAA-MM-DD). */
  proxima: string;
  /** El día del mes de referencia: el 31 cae en el 28 de febrero y vuelve al 31 en marzo. */
  dia: number;
  /** Última fecha en la que se prepara una (incluida). Sin valor, sin fin. */
  hasta?: string;
  activa: boolean;
  /** Cuántas lleva preparadas y el número de la última. */
  creadas: number;
  ultima?: string;
}

const CAMPO = 'klima_recurrentes';
export const MAX_RECURRENTES = 60;
/** Si hace mucho que no se entra, no se prepara un año entero de golpe. */
const MAX_POR_PASADA = 12;

interface Compacta { i: string; o: string; n: string; c: string; m: number; p: Periodo; x: string; d: number; h?: string; a: boolean; k: number; u?: string }

const aCompacta = (r: Recurrente): Compacta => ({
  i: r.id, o: r.origenId, n: r.origenNumero, c: r.cliente.slice(0, 60), m: r.importe, p: r.periodo, x: r.proxima, d: r.dia,
  ...(r.hasta ? { h: r.hasta } : {}), a: r.activa, k: r.creadas, ...(r.ultima ? { u: r.ultima } : {}),
});
const deCompacta = (c: Compacta): Recurrente => ({
  id: c.i, origenId: c.o, origenNumero: c.n, cliente: c.c, importe: c.m, periodo: c.p, proxima: c.x, dia: c.d,
  hasta: c.h, activa: c.a !== false, creadas: c.k ?? 0, ultima: c.u,
});

export async function getRecurrentes(): Promise<Recurrente[]> {
  const lista = await leerDeCuenta<Compacta>(CAMPO);
  return lista.filter(c => c && typeof c.i === 'string' && typeof c.o === 'string').map(deCompacta);
}

async function guardar(lista: Recurrente[]): Promise<void> {
  await guardarEnCuenta(CAMPO, lista.map(aCompacta), MAX_RECURRENTES);
  notifyDataUpdate('invoices');
}

// ------------------------------------------------------------
// Calendario
// ------------------------------------------------------------

const diasDelMes = (anio: number, mes1: number) => new Date(Date.UTC(anio, mes1, 0)).getUTCDate();

/** `fecha` + los meses del periodo, en el día de referencia (o el último del mes si no existe). */
export function siguienteFecha(fecha: string, periodo: Periodo, dia: number): string {
  const meses = PERIODOS.find(p => p.id === periodo)!.meses;
  const [a, m] = fecha.split('-').map(Number);
  const total = (m - 1) + meses;
  const anio = a + Math.floor(total / 12);
  const mes1 = (total % 12) + 1;
  const d = Math.min(dia, diasDelMes(anio, mes1));
  return `${anio}-${String(mes1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** La primera fecha que toca después de la factura de origen, sin quedarse en el pasado. */
export function primeraFecha(emision: string, periodo: Periodo, hoy: string): string {
  const dia = Number(emision.slice(8, 10));
  let f = siguienteFecha(emision, periodo, dia);
  while (f < hoy) f = siguienteFecha(f, periodo, dia);
  return f;
}

/** Las fechas que ya han llegado y aún no tienen factura, en orden. */
export function fechasPendientes(r: Recurrente, hoy: string): string[] {
  const out: string[] = [];
  if (!r.activa) return out;
  let f = r.proxima;
  while (f <= hoy && (!r.hasta || f <= r.hasta) && out.length < MAX_POR_PASADA) {
    out.push(f);
    f = siguienteFecha(f, r.periodo, r.dia);
  }
  return out;
}

export function describirPeriodo(p: Periodo): string {
  return PERIODOS.find(x => x.id === p)?.cada ?? p;
}

// ------------------------------------------------------------
// Alta, cambios y baja
// ------------------------------------------------------------

export function puedeSerRecurrente(f: Invoice): boolean {
  return f.sentido !== 'compra' && (!f.tipo || f.tipo === 'factura') && !f.posSessionId && !f.cancelledAt
    && f.status !== InvoiceStatus.ANULADA && f.lineItems.length > 0;
}

export async function crearRecurrente(f: Invoice, periodo: Periodo, proxima: string, hasta?: string): Promise<Recurrente> {
  if (!puedeSerRecurrente(f)) throw new Error('Sólo se repiten facturas de venta con líneas (no tickets ni rectificativas).');
  const lista = await getRecurrentes();
  if (lista.some(r => r.origenId === f.id && r.activa)) throw new Error(`${f.number} ya se repite. Cámbialo desde Facturas recurrentes.`);
  const nueva: Recurrente = {
    id: generateId(), origenId: f.id, origenNumero: f.number, cliente: f.clientName || 'Sin cliente', importe: f.total,
    periodo, proxima, dia: Number(proxima.slice(8, 10)), hasta: hasta || undefined, activa: true, creadas: 0,
  };
  await guardar([...lista, nueva]);
  return nueva;
}

export async function cambiarRecurrente(id: string, cambios: Partial<Pick<Recurrente, 'periodo' | 'proxima' | 'hasta' | 'activa'>>): Promise<void> {
  const lista = await getRecurrentes();
  await guardar(lista.map(r => {
    if (r.id !== id) return r;
    const n = { ...r, ...cambios };
    if (cambios.proxima) n.dia = Number(cambios.proxima.slice(8, 10));
    if ('hasta' in cambios && !cambios.hasta) n.hasta = undefined;
    return n;
  }));
}

export async function borrarRecurrente(id: string): Promise<void> {
  const lista = await getRecurrentes();
  await guardar(lista.filter(r => r.id !== id));
}

// ------------------------------------------------------------
// Preparar las que tocan
// ------------------------------------------------------------

/** La copia en borrador de la factura de origen para una fecha. */
export function borradorDesde(origen: Invoice, fecha: string, numero: string, series: string, recurrenteId: string): Invoice {
  const plazo = origen.dueDate && origen.issueDate
    ? Math.max(0, Math.round((Date.parse(origen.dueDate) - Date.parse(origen.issueDate)) / 86_400_000))
    : 30;
  const ahora = new Date().toISOString();
  return {
    ...origen,
    id: generateId(),
    number: numero,
    series,
    issueDate: fecha,
    dueDate: addDays(fecha, plazo),
    status: InvoiceStatus.BORRADOR,
    paidDate: undefined,
    paidAmount: 0,
    paymentRecordIds: [],
    verifactu: undefined,
    cancelReason: undefined,
    cancelledAt: undefined,
    stripePaymentUrl: undefined,
    stripeSessionId: undefined,
    paidAt: undefined,
    numberTemporary: false,
    documentoOrigenId: undefined,
    documentoOrigenNumber: undefined,
    datosExtras: { ...(origen.datosExtras ?? {}), recurrente: recurrenteId },
    lineItems: origen.lineItems.map(li => ({ ...li, id: generateId() })),
    createdAt: ahora,
    updatedAt: ahora,
  };
}

const CERROJO = 'klima-recurrentes-cerrojo';

/**
 * Prepara en borrador todas las que han llegado a su fecha. Devuelve las
 * facturas creadas. Con dos pestañas abiertas sólo trabaja una.
 */
export async function prepararPendientes(hoy = new Date().toISOString().slice(0, 10)): Promise<Invoice[]> {
  try {
    const cerrojo = Number(localStorage.getItem(CERROJO) || 0);
    if (Date.now() - cerrojo < 60_000) return [];
    localStorage.setItem(CERROJO, String(Date.now()));
  } catch { /* sin almacenamiento: se sigue */ }

  try {
    const lista = await getRecurrentes();
    if (!lista.some(r => fechasPendientes(r, hoy).length)) return [];

    const ajustes = await getCompanySettings();
    const creadas: Invoice[] = [];
    let cambio = false;

    for (const r of lista) {
      const fechas = fechasPendientes(r, hoy);
      if (!fechas.length) continue;
      const origen = await getInvoiceById(r.origenId);
      if (!origen) {
        r.activa = false; // la factura de origen ya no existe
        cambio = true;
        continue;
      }
      for (const fecha of fechas) {
        const series = ajustes.invoiceSeries || origen.series;
        const numero = generateInvoiceNumber(series, ajustes.nextInvoiceNumber, Number(fecha.slice(0, 4)));
        const guardada = await saveInvoice(borradorDesde(origen, fecha, numero, series, r.id));
        ajustes.nextInvoiceNumber = sequenceFromNumber(guardada.number) + 1;
        creadas.push(guardada);
        r.proxima = siguienteFecha(fecha, r.periodo, r.dia);
        r.creadas += 1;
        r.ultima = guardada.number;
        cambio = true;
      }
      if (r.hasta && r.proxima > r.hasta) r.activa = false;
      // Se guarda después de cada una: si algo falla a medias, no se repite lo ya hecho.
      await guardar(lista);
    }
    if (creadas.length) await saveCompanySettings(ajustes);
    else if (cambio) await guardar(lista);
    return creadas;
  } finally {
    try { localStorage.removeItem(CERROJO); } catch { /* nada */ }
  }
}
