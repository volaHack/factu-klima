/**
 * EL DINERO QUE VA A ENTRAR, SEMANA A SEMANA
 *
 * La tesorería enseña lo que vence; esto dice cuándo llegará de verdad.
 * Cada factura pendiente se coloca en la semana en que es probable cobrarla:
 * su vencimiento más el retraso que suele tener ESE cliente (su perfil de
 * pago). Quien siempre paga a 45 días con 30 de plazo no entra en la semana
 * del vencimiento, sino dos semanas después.
 *
 * Y no todo pesa igual:
 *
 *   · SEGURO: clientes que pagan en plazo casi siempre (con tres cobros o
 *     más para decirlo) o recibos domiciliados, y que no tienen la factura
 *     vencida. Con eso se puede contar.
 *   · PROBABLE: lo demás que está dentro de lo normal en ese cliente.
 *   · DE RIESGO: lo que ya va más allá de lo que ese cliente suele tardar,
 *     o lleva vencido más de dos meses. No se suma a ninguna semana: contar
 *     con ello sería engañarse. Sale aparte, con nombre, para reclamarlo.
 *
 * Sin perfil propio (un cliente nuevo) se usa el retraso medio de toda la
 * cartera, y si tampoco hay, el vencimiento tal cual.
 */

import type { Invoice } from './types';
import { PaymentMethod } from './types';
import {
  diaLocal, diasEntreDias, esFacturaDeVenta, pendienteDe, perfilesDePago, sumarDiasIso, type PerfilPago,
} from './perfilPago';

export type Certeza = 'seguro' | 'probable' | 'riesgo';

export interface CobroPrevisto {
  facturaId: string;
  numero: string;
  clienteId: string;
  cliente: string;
  pendiente: number;
  vence: string;
  /** El día en que se espera cobrarla; null si es de riesgo. */
  esperado: string | null;
  certeza: Certeza;
  /** Días que lleva vencida, si lo está. */
  diasVencida: number;
  /** Por qué se ha clasificado así, en una frase. */
  motivo: string;
}

export interface SemanaPrevista {
  /** Primer y último día de la semana (AAAA-MM-DD). */
  desde: string;
  hasta: string;
  /** «3 nov.», para el eje. */
  etiqueta: string;
  seguro: number;
  probable: number;
  facturas: number;
}

export interface Tramo { dias: 30 | 60 | 90; seguro: number; probable: number; total: number }

export interface PrevisionCobros {
  semanas: SemanaPrevista[];
  tramos: Tramo[];
  riesgo: CobroPrevisto[];
  totalRiesgo: number;
  /** Todo lo previsto, con su clasificación (también lo que cae después de 90 días). */
  cobros: CobroPrevisto[];
  /** Lo que se cobraría más allá del horizonte. */
  despues: number;
}

/** Semanas que se dibujan: trece son algo más de 90 días. */
export const SEMANAS = 13;
/** Puntualidad a partir de la cual un cliente es de fiar. */
const PUNTUAL_FIABLE = 80;
/** Días más allá de su retraso habitual que se le consienten antes de darlo por dudoso. */
const HOLGURA_RIESGO = 15;
/** Vencida hace más de esto, de riesgo sea quien sea. */
const VENCIDA_RIESGO = 60;

const r2 = (n: number) => Math.round(n * 100) / 100;
const MESES = ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sep.', 'oct.', 'nov.', 'dic.'];
const etiquetaDia = (iso: string) => `${Number(iso.slice(8, 10))} ${MESES[Number(iso.slice(5, 7)) - 1]}`;

/** Retraso medio de toda la cartera, ponderado por cobros. */
function retrasoDeCartera(perfiles: Map<string, PerfilPago>): number {
  let suma = 0, n = 0;
  for (const p of perfiles.values()) { suma += p.retrasoMedio * p.cobradas; n += p.cobradas; }
  return n ? Math.round(suma / n) : 0;
}

export function clasificarCobro(
  f: Invoice, pendiente: number, perfil: PerfilPago | undefined, retrasoCartera: number, hoy: string,
): CobroPrevisto {
  // Sin vencimiento anotado, el plazo que suele tardar ese cliente desde la emisión.
  const vence = diaLocal(f.dueDate) ?? sumarDiasIso(diaLocal(f.issueDate) ?? hoy, perfil?.diasMedios ?? 30);
  const retraso = perfil?.fiable ? perfil.retrasoMedio : perfil ? Math.max(perfil.retrasoMedio, retrasoCartera) : retrasoCartera;
  const diasVencida = Math.max(0, diasEntreDias(vence, hoy));
  const base = { facturaId: f.id, numero: f.number, clienteId: f.clientId, cliente: f.clientName || 'Sin cliente', pendiente, vence, diasVencida };

  if (diasVencida > VENCIDA_RIESGO) {
    return { ...base, esperado: null, certeza: 'riesgo', motivo: `Vencida hace ${diasVencida} días` };
  }
  if (diasVencida > retraso + HOLGURA_RIESGO) {
    return {
      ...base, esperado: null, certeza: 'riesgo',
      motivo: retraso > 0 ? `Lleva ${diasVencida} días vencida y suele retrasarse ${retraso}` : `Lleva ${diasVencida} días vencida`,
    };
  }

  // Lo que ya debería haber llegado según su costumbre se espera para ya.
  const esperado = [sumarDiasIso(vence, retraso), hoy].sort()[1];
  const domiciliada = f.paymentMethod === PaymentMethod.DOMICILIACION;
  const puntual = !!perfil?.fiable && perfil.puntualidad >= PUNTUAL_FIABLE;
  if (!diasVencida && (domiciliada || puntual)) {
    return { ...base, esperado, certeza: 'seguro', motivo: domiciliada ? 'Recibo domiciliado' : `Paga en plazo el ${perfil!.puntualidad} % de las veces` };
  }
  return {
    ...base, esperado, certeza: 'probable',
    motivo: !perfil ? 'Sin historial de pagos: se cuenta con el retraso medio de tus clientes'
      : retraso > 0 ? `Suele pagar ${retraso} días después del vencimiento`
      : 'Suele pagar en plazo',
  };
}

export function previsionDeCobros(docs: readonly Invoice[], hoy: string): PrevisionCobros {
  const perfiles = perfilesDePago(docs, hoy);
  const retrasoCartera = retrasoDeCartera(perfiles);

  const cobros: CobroPrevisto[] = [];
  for (const f of docs) {
    if (!esFacturaDeVenta(f)) continue;
    const pendiente = pendienteDe(f);
    if (!pendiente) continue;
    cobros.push(clasificarCobro(f, pendiente, perfiles.get(f.clientId), retrasoCartera, hoy));
  }

  const semanas: SemanaPrevista[] = Array.from({ length: SEMANAS }, (_, i) => {
    const desde = sumarDiasIso(hoy, i * 7);
    return { desde, hasta: sumarDiasIso(desde, 6), etiqueta: etiquetaDia(desde), seguro: 0, probable: 0, facturas: 0 };
  });
  const tramos: Tramo[] = ([30, 60, 90] as const).map(dias => ({ dias, seguro: 0, probable: 0, total: 0 }));
  let despues = 0;

  for (const c of cobros) {
    if (!c.esperado || c.certeza === 'riesgo') continue;
    const dentro = diasEntreDias(hoy, c.esperado);
    const s = semanas[Math.floor(dentro / 7)];
    if (s) {
      s[c.certeza] += c.pendiente;
      s.facturas += 1;
    }
    let enAlguno = false;
    for (const t of tramos) {
      if (dentro < t.dias) { t[c.certeza] += c.pendiente; enAlguno = true; }
    }
    if (!enAlguno) despues += c.pendiente;
  }

  const riesgo = cobros.filter(c => c.certeza === 'riesgo').sort((a, b) => b.pendiente - a.pendiente);
  return {
    semanas: semanas.map(s => ({ ...s, seguro: r2(s.seguro), probable: r2(s.probable) })),
    tramos: tramos.map(t => ({ ...t, seguro: r2(t.seguro), probable: r2(t.probable), total: r2(t.seguro + t.probable) })),
    riesgo,
    totalRiesgo: r2(riesgo.reduce((s, c) => s + c.pendiente, 0)),
    cobros: cobros.sort((a, b) => (a.esperado ?? '9999').localeCompare(b.esperado ?? '9999')),
    despues: r2(despues),
  };
}
