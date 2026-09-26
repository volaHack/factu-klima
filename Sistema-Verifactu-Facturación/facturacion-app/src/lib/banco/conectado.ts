/**
 * MOVIMIENTOS QUE LLEGAN DEL BANCO CONECTADO (Enable Banking, PSD2)
 *
 * Convierte lo que devuelve la API al mismo `MovimientoBanco` que sale de
 * un Norma 43: la conciliación no sabe (ni tiene que saber) de dónde vino.
 *
 * Campos de la API: `entry_reference` (identificador del banco),
 * `transaction_amount.{amount,currency}` siempre positivo,
 * `credit_debit_indicator` (CRDT entra, DBIT sale), `booking_date`,
 * `value_date`, `transaction_date`, `remittance_information` (lista de
 * textos), `creditor.name`, `debtor.name` y `status` (BOOK apuntado,
 * PDNG pendiente).
 */

import type { MovimientoBanco } from './extracto';

export interface TransaccionEnableBanking {
  entry_reference?: string | null;
  transaction_id?: string | null;
  transaction_amount?: { amount?: string | number; currency?: string } | null;
  credit_debit_indicator?: 'CRDT' | 'DBIT' | string | null;
  booking_date?: string | null;
  value_date?: string | null;
  transaction_date?: string | null;
  remittance_information?: string[] | null;
  creditor?: { name?: string | null } | null;
  debtor?: { name?: string | null } | null;
  status?: string | null;
  balance_after_transaction?: { balance_amount?: { amount?: string | number } } | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Igual que en extracto.ts: corto, estable y sin choques en la práctica. */
function huella(texto: string): string {
  const pasada = (semilla: number) => {
    let h = semilla >>> 0;
    for (let i = 0; i < texto.length; i++) {
      h ^= texto.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(36);
  };
  return pasada(0x811c9dc5) + pasada(0x1b873593);
}

/**
 * Sólo los movimientos ya apuntados (los pendientes pueden cambiar de
 * importe o desaparecer) y en euros. El id es estable entre lecturas: sale
 * de la referencia del banco si la da, y si no, de los datos del movimiento.
 */
export function movimientosDesdeBanco(transacciones: TransaccionEnableBanking[], cuenta: string): MovimientoBanco[] {
  const vistos = new Map<string, number>();
  const salida: MovimientoBanco[] = [];
  for (const t of transacciones) {
    if (t.status && t.status !== 'BOOK') continue;
    const moneda = t.transaction_amount?.currency;
    if (moneda && moneda !== 'EUR') continue;
    const bruto = Math.abs(Number(t.transaction_amount?.amount ?? NaN));
    if (!Number.isFinite(bruto)) continue;
    const importe = r2(t.credit_debit_indicator === 'DBIT' ? -bruto : bruto);
    const fecha = (t.booking_date || t.value_date || t.transaction_date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) continue;

    const contraparte = importe < 0 ? t.creditor?.name : t.debtor?.name;
    const texto = (t.remittance_information ?? []).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    const concepto = [contraparte, texto].filter(Boolean).join(' · ') || (importe < 0 ? 'Cargo' : 'Abono');

    const ref = t.entry_reference || t.transaction_id || '';
    let id: string;
    if (ref) {
      id = `eb${huella(`${cuenta}|${ref}`)}`;
    } else {
      const clave = `${cuenta}|${fecha}|${importe.toFixed(2)}|${concepto.toLowerCase()}`;
      const n = vistos.get(clave) ?? 0;
      vistos.set(clave, n + 1);
      id = `eb${huella(`${clave}|${n}`)}`;
    }
    const saldo = Number(t.balance_after_transaction?.balance_amount?.amount);
    salida.push({ id, fecha, importe, concepto, ...(ref ? { referencia: ref } : {}), ...(Number.isFinite(saldo) ? { saldo } : {}) });
  }
  return salida.sort((a, b) => a.fecha.localeCompare(b.fecha));
}
