/**
 * Cómo se enseña el banco en pantalla. Puro, para la página `/banco`, la
 * conciliación y el panel.
 */

/** «ES11 ···· 1234»: lo justo para reconocer la cuenta sin enseñarla entera. */
export function ibanCorto(iban: string | null | undefined): string {
  const t = (iban ?? '').replace(/\s+/g, '').toUpperCase();
  if (t.length < 8) return t || 'Cuenta';
  return `${t.slice(0, 4)} ···· ${t.slice(-4)}`;
}

export type Tono = 'ok' | 'aviso' | 'peligro';

/** Cuándo empezar a pedir que se renueve el permiso. */
export const AVISAR_RENOVAR_DIAS = 10;

export function estadoPermiso(c: { caducada: boolean; diasParaCaducar: number | null }): { tono: Tono; texto: string } {
  if (c.caducada || (c.diasParaCaducar != null && c.diasParaCaducar < 0)) return { tono: 'peligro', texto: 'Permiso caducado' };
  if (c.diasParaCaducar != null && c.diasParaCaducar <= AVISAR_RENOVAR_DIAS) {
    return { tono: 'aviso', texto: c.diasParaCaducar === 0 ? 'Caduca hoy' : `Renueva en ${c.diasParaCaducar} ${c.diasParaCaducar === 1 ? 'día' : 'días'}` };
  }
  return { tono: 'ok', texto: 'Conectado' };
}

/** Lo que hay en todas las cuentas con el permiso en vigor. */
export function totalSaldos(conexiones: { caducada: boolean; cuentas: { saldo: { importe: number } | null }[] }[]): number {
  let total = 0;
  for (const c of conexiones) {
    if (c.caducada) continue;
    for (const cu of c.cuentas) if (cu.saldo) total += cu.saldo.importe;
  }
  return Math.round(total * 100) / 100;
}

export type FiltroMovimientos = 'pendientes' | 'conciliados' | 'apartados' | 'todos';

const plano = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function filtrarMovimientos<T extends { importe: number; concepto: string; conciliado: string | null; ignorado: boolean }>(
  movimientos: T[], filtro: FiltroMovimientos, busqueda: string,
): T[] {
  const q = plano(busqueda.trim());
  return movimientos.filter(m => {
    if (filtro === 'pendientes' && (m.conciliado || m.ignorado)) return false;
    if (filtro === 'conciliados' && !m.conciliado) return false;
    if (filtro === 'apartados' && !m.ignorado) return false;
    if (!q) return true;
    const importe = Math.abs(m.importe).toFixed(2).replace('.', ',');
    return plano(m.concepto).includes(q) || importe.includes(q.replace(/^-/, '')) || plano(m.conciliado ?? '').includes(q);
  });
}
