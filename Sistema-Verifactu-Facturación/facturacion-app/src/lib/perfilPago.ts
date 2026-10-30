/**
 * CÓMO PAGA CADA CLIENTE, Y CUÁNTO SE LE ESTÁ JUGANDO HOY
 *
 * Dos preguntas que se hacen antes de volver a facturarle a alguien:
 *
 *   · ¿Suele pagar? No a cuántos días se le dio de plazo, sino a cuántos
 *     paga de verdad: sale de sus facturas cobradas (emisión, vencimiento y
 *     día del cobro). Con eso se sabe si es puntual, cuánto se retrasa
 *     cuando se retrasa y si va a mejor o a peor en el último medio año.
 *
 *   · ¿Cuánto me debe ahora? Lo pendiente y lo vencido, con un semáforo.
 *     Verde, nada fuera de plazo; ámbar, algo vencido hace poco; rojo, una
 *     deuda vieja o varias facturas vencidas a la vez.
 *
 * Las fechas se tratan como días, no como instantes: «2026-03-01» es el 1
 * de marzo aquí. Un cobro que llega con hora (el de Stripe, `paidAt`) se
 * pasa a su día LOCAL antes de contar, y la resta de días se hace sobre el
 * calendario, sin que el cambio de hora de marzo reste un día.
 */

import { InvoiceStatus, type Invoice } from './types';
import { claveDia, fechaLocal } from './analitica';
import { totalAPagar } from './retenciones';
import { formatCurrency as euros } from './utils';

// ------------------------------------------------------------------
// Días del calendario
// ------------------------------------------------------------------

/** El día local de una fecha guardada (con o sin hora), como AAAA-MM-DD. */
export function diaLocal(valor: string | undefined | null): string | null {
  const d = fechaLocal(valor);
  return d ? claveDia(d) : null;
}

/** Hoy, como día local (no el de Greenwich, que a las 00:30 en Madrid aún es ayer). */
export function hoyLocal(): string {
  return claveDia(new Date());
}

/** Días de calendario de `desde` a `hasta` (AAAA-MM-DD), sin pasar por la zona horaria. */
export function diasEntreDias(desde: string, hasta: string): number {
  const ms = (iso: string) => {
    const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
    return Date.UTC(a, m - 1, d);
  };
  return Math.round((ms(hasta) - ms(desde)) / 86_400_000);
}

/** AAAA-MM-DD más `n` días. */
export function sumarDiasIso(iso: string, n: number): string {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

/** AAAA-MM-DD menos `n` meses, con el día recortado al último del mes si no existe. */
export function restarMesesIso(iso: string, n: number): string {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  const ultimo = new Date(Date.UTC(a, m - 1 - n + 1, 0)).getUTCDate();
  return new Date(Date.UTC(a, m - 1 - n, Math.min(d, ultimo))).toISOString().slice(0, 10);
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const media = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

/** Factura de venta de verdad: ni compra, ni presupuesto ni albarán, ni ticket del TPV. */
export function esFacturaDeVenta(f: Invoice): boolean {
  return f.sentido !== 'compra' && (f.tipo ?? 'factura') === 'factura' && !f.posSessionId;
}

const SIN_COBRAR: readonly string[] = [InvoiceStatus.EMITIDA, InvoiceStatus.PENDIENTE, InvoiceStatus.VENCIDA, InvoiceStatus.PARCIAL];

/** Lo que falta por entrar de una factura: con retención, lo que de verdad se cobra. */
export function pendienteDe(f: Invoice): number {
  if (!SIN_COBRAR.includes(f.status) || f.cancelledAt) return 0;
  const falta = r2(totalAPagar(f.total || 0, f.subtotal || 0, f.retencionPct) - (f.paidAmount || 0));
  return falta > 0.009 ? falta : 0;
}

// ============================================================
// 1 · PERFIL DE PAGO
// ============================================================

/**
 * Cuántos días de margen se dan antes de contar un cobro como tardío. Una
 * transferencia ordenada el día del vencimiento llega al día siguiente, y
 * un cobro que entra el lunes por un vencimiento del sábado no es un
 * cliente moroso: es el banco.
 */
export const MARGEN_PUNTUAL = 3;
/** El retraso medio a partir del cual la etiqueta dice que «suele retrasarse». */
const RETRASO_QUE_SE_NOTA = 3;
/** Diferencia de días medios (últimos 6 meses frente a antes) que ya es una tendencia. */
const CAMBIO_QUE_SE_NOTA = 5;
/** Con menos facturas cobradas en cada mitad no se habla de tendencia. */
const MINIMO_POR_MITAD = 2;

export type Tendencia = 'mejora' | 'empeora' | 'estable';

export interface PerfilPago {
  clienteId: string;
  /** Facturas cobradas que se han podido medir. */
  cobradas: number;
  /** Días medios reales desde la emisión hasta el cobro. */
  diasMedios: number;
  /** % de las cobradas que entraron en plazo (con `MARGEN_PUNTUAL`). */
  puntualidad: number;
  /** Días medios de retraso sobre el vencimiento; 0 si paga en plazo o antes. */
  retrasoMedio: number;
  /** Mejora o empeora en los últimos 6 meses frente a antes; null sin datos de las dos mitades. */
  tendencia: Tendencia | null;
  /** Días medios de los últimos 6 meses y de antes, cuando hay tendencia. */
  diasRecientes: number | null;
  diasAntes: number | null;
  /** Con tres o más cobros ya es un hábito; con uno o dos, un indicio. */
  fiable: boolean;
  /** «Paga a 42 días · suele retrasarse 12». */
  etiqueta: string;
}

interface Cobro { emitida: string; vence: string | null; cobrada: string }

function cobrosDe(docs: readonly Invoice[], clienteId: string): Cobro[] {
  const out: Cobro[] = [];
  for (const f of docs) {
    if (f.clientId !== clienteId || !esFacturaDeVenta(f) || f.status !== InvoiceStatus.PAGADA || f.cancelledAt) continue;
    const emitida = diaLocal(f.issueDate);
    const cobrada = diaLocal(f.paidDate) ?? diaLocal(f.paidAt);
    if (!emitida || !cobrada) continue;
    out.push({ emitida, vence: diaLocal(f.dueDate), cobrada });
  }
  return out;
}

export function etiquetaPerfil(p: Pick<PerfilPago, 'diasMedios' | 'retrasoMedio' | 'puntualidad'>): string {
  const paga = `Paga a ${p.diasMedios} ${p.diasMedios === 1 ? 'día' : 'días'}`;
  if (p.retrasoMedio >= RETRASO_QUE_SE_NOTA) return `${paga} · suele retrasarse ${p.retrasoMedio}`;
  if (p.puntualidad >= 80) return `${paga} · suele pagar en plazo`;
  return `${paga} · a veces se retrasa`;
}

/** El perfil de pago de un cliente, o null si todavía no ha pagado ninguna factura. */
export function perfilDePago(docs: readonly Invoice[], clienteId: string, hoy: string): PerfilPago | null {
  const cobros = cobrosDe(docs, clienteId);
  if (!cobros.length) return null;

  const dias = cobros.map(c => Math.max(0, diasEntreDias(c.emitida, c.cobrada)));
  const conVencimiento = cobros.filter(c => c.vence);
  const retrasos = conVencimiento.map(c => diasEntreDias(c.vence!, c.cobrada));
  const puntuales = retrasos.filter(r => r <= MARGEN_PUNTUAL).length;

  // La tendencia compara cuándo se cobró, no cuándo se emitió: lo que
  // interesa es cómo paga ahora.
  const corte = restarMesesIso(hoy, 6);
  const recientes = cobros.filter(c => c.cobrada >= corte).map(c => Math.max(0, diasEntreDias(c.emitida, c.cobrada)));
  const antes = cobros.filter(c => c.cobrada < corte).map(c => Math.max(0, diasEntreDias(c.emitida, c.cobrada)));
  let tendencia: Tendencia | null = null;
  let diasRecientes: number | null = null;
  let diasAntes: number | null = null;
  if (recientes.length >= MINIMO_POR_MITAD && antes.length >= MINIMO_POR_MITAD) {
    diasRecientes = Math.round(media(recientes));
    diasAntes = Math.round(media(antes));
    const cambio = diasRecientes - diasAntes;
    tendencia = cambio >= CAMBIO_QUE_SE_NOTA ? 'empeora' : cambio <= -CAMBIO_QUE_SE_NOTA ? 'mejora' : 'estable';
  }

  const base = {
    diasMedios: Math.round(media(dias)),
    // Sin ningún vencimiento anotado no hay plazo que cumplir: se da por puntual.
    puntualidad: conVencimiento.length ? Math.round((puntuales / conVencimiento.length) * 100) : 100,
    retrasoMedio: Math.round(media(retrasos.map(r => Math.max(0, r)))),
  };
  return {
    clienteId, cobradas: cobros.length, ...base,
    tendencia, diasRecientes, diasAntes,
    fiable: cobros.length >= 3,
    etiqueta: etiquetaPerfil(base),
  };
}

/** El perfil de todos los clientes con algún cobro, de una pasada. */
export function perfilesDePago(docs: readonly Invoice[], hoy: string): Map<string, PerfilPago> {
  const ids = new Set(docs.filter(f => f.clientId && esFacturaDeVenta(f) && f.status === InvoiceStatus.PAGADA).map(f => f.clientId));
  const mapa = new Map<string, PerfilPago>();
  for (const id of ids) {
    const p = perfilDePago(docs, id, hoy);
    if (p) mapa.set(id, p);
  }
  return mapa;
}

export const TEXTO_TENDENCIA: Record<Tendencia, string> = {
  mejora: 'Paga antes que hace unos meses',
  empeora: 'Tarda más en pagar que hace unos meses',
  estable: 'Paga igual que siempre',
};

// ============================================================
// 2 · RIESGO VIVO
// ============================================================

export type Semaforo = 'verde' | 'ambar' | 'rojo';

/** A partir de cuántos días de retraso una deuda deja de ser un despiste. */
export const RETRASO_ROJO = 30;
/** Con tantas facturas vencidas a la vez, rojo aunque ninguna sea vieja. */
const VENCIDAS_ROJO = 3;

export interface RiesgoCliente {
  pendiente: number;
  facturasPendientes: number;
  vencido: number;
  facturasVencidas: number;
  /** Días que lleva vencida la más antigua; 0 si no hay nada vencido. */
  diasMasAntigua: number;
  semaforo: Semaforo;
  /** «Te debe 1.240 € · 640 € vencidos hace 45 días». */
  texto: string;
}

const haceDias = (n: number) => (n <= 0 ? 'hoy' : n === 1 ? 'ayer' : `hace ${n} días`);

export function riesgoDeCliente(docs: readonly Invoice[], clienteId: string, hoy: string): RiesgoCliente {
  let pendiente = 0, facturasPendientes = 0, vencido = 0, facturasVencidas = 0, diasMasAntigua = 0;
  for (const f of docs) {
    if (f.clientId !== clienteId || !esFacturaDeVenta(f)) continue;
    const falta = pendienteDe(f);
    if (!falta) continue;
    pendiente += falta;
    facturasPendientes += 1;
    const vence = diaLocal(f.dueDate);
    if (vence ? vence < hoy : f.status === InvoiceStatus.VENCIDA) {
      vencido += falta;
      facturasVencidas += 1;
      diasMasAntigua = Math.max(diasMasAntigua, vence ? diasEntreDias(vence, hoy) : 0);
    }
  }
  pendiente = r2(pendiente);
  vencido = r2(vencido);
  const semaforo: Semaforo = !facturasVencidas ? 'verde'
    : diasMasAntigua > RETRASO_ROJO || facturasVencidas >= VENCIDAS_ROJO ? 'rojo'
    : 'ambar';
  const texto = !pendiente ? 'No te debe nada'
    : !vencido ? `Te debe ${euros(pendiente)} · nada vencido`
    : facturasVencidas === 1 ? `Te debe ${euros(pendiente)} · ${euros(vencido)} vencidos ${haceDias(diasMasAntigua)}`
    : `Te debe ${euros(pendiente)} · ${euros(vencido)} vencidos, lo más antiguo ${haceDias(diasMasAntigua)}`;
  return { pendiente, facturasPendientes, vencido, facturasVencidas, diasMasAntigua, semaforo, texto };
}

export const NOMBRE_SEMAFORO: Record<Semaforo, string> = {
  verde: 'Al día',
  ambar: 'Algo vencido',
  rojo: 'Riesgo alto',
};
