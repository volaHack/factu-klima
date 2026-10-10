/**
 * LAS DECISIONES DE LA SINCRONIZACIÓN CON EL BANCO
 *
 * Puras y sin red, para poder probarlas sin un banco delante. El motor
 * (`sincronizar.ts`) las usa al leer de Enable Banking.
 */

import type { BalanceEnableBanking } from './enableBanking';

const DIA = 86_400_000;
const isoDia = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Cuántos días atrás se leen la primera vez (lo que suelen dar los bancos sin pedir más permiso). */
export const DIAS_PRIMERA_LECTURA = 90;

/**
 * Desde qué día pedir movimientos.
 *
 * La primera vez, 90 días. Después, desde la última lectura menos 5 días:
 * los bancos apuntan algunos movimientos con fecha de días atrás (un
 * recibo del viernes que aparece el martes), y leer de más no duplica
 * porque el id de cada movimiento es estable.
 */
export function desdeParaSincronizar(ultimaLectura: string | null, hoy: string): string {
  const hoyT = Date.parse(`${hoy}T00:00:00Z`);
  const limite = hoyT - DIAS_PRIMERA_LECTURA * DIA;
  if (!ultimaLectura) return isoDia(limite);
  const ultima = Date.parse(ultimaLectura);
  if (!Number.isFinite(ultima)) return isoDia(limite);
  return isoDia(Math.max(limite, Date.parse(`${isoDia(ultima)}T00:00:00Z`) - 5 * DIA));
}

/** De más a menos útil para decir «cuánto hay en la cuenta». */
const PREFERENCIA = ['ITAV', 'CLAV', 'XPCD', 'ITBD', 'CLBD', 'PRCD'];

export interface Saldo {
  importe: number;
  /** Día al que se refiere, si el banco lo dice. */
  fecha: string | null;
  tipo: string;
}

/** El saldo que se enseña de una cuenta, de los varios que da el banco. */
export function saldoPrincipal(balances: BalanceEnableBanking[]): Saldo | null {
  const enEuros = balances.filter(b => {
    const moneda = b.balance_amount?.currency;
    return (!moneda || moneda === 'EUR') && Number.isFinite(Number(b.balance_amount?.amount));
  });
  if (enEuros.length === 0) return null;
  const rango = (t?: string | null) => {
    const i = PREFERENCIA.indexOf((t ?? '').toUpperCase());
    return i === -1 ? PREFERENCIA.length : i;
  };
  const elegido = [...enEuros].sort((a, b) => rango(a.balance_type) - rango(b.balance_type))[0];
  const fecha = (elegido.last_change_date_time || elegido.reference_date || '').slice(0, 10);
  return {
    importe: Math.round(Number(elegido.balance_amount!.amount) * 100) / 100,
    fecha: /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : null,
    tipo: (elegido.balance_type ?? 'OTHR').toUpperCase(),
  };
}

/**
 * ¿El error dice que el permiso ya no vale (caducado o retirado en el
 * banco)? Entonces hay que pedir al cliente que lo renueve; cualquier otro
 * error es pasajero y se reintenta en la próxima lectura.
 */
export function esPermisoCaducado(error: unknown): boolean {
  const e = error as { estado?: number; cuerpo?: string } | null;
  if (!e || typeof e.estado !== 'number') return false;
  if (e.estado === 401 || e.estado === 403) return true;
  return /EXPIRED|REVOKED|INVALID_SESSION|SESSION_(?:NOT_FOUND|CLOSED)|CONSENT/i.test(e.cuerpo ?? '');
}

/** Días que le quedan al permiso (negativo si ya caducó). */
export function diasParaCaducar(validoHasta: string | null, ahora: Date = new Date()): number | null {
  if (!validoHasta) return null;
  const t = Date.parse(validoHasta);
  if (!Number.isFinite(t)) return null;
  return Math.floor((t - ahora.getTime()) / DIA);
}

const normIban = (i: string | null | undefined) => (i ?? '').replace(/\s+/g, '').toUpperCase();

/**
 * ¿La conexión nueva es la renovación de una que ya había? Mismo banco y
 * alguna cuenta en común. Entonces se actualiza la vieja en vez de tener
 * dos conexiones con las mismas cuentas.
 */
export function mismaConexion(
  vieja: { banco: string; cuentas: { uid?: string; iban: string | null }[] },
  nueva: { banco: string; cuentas: { uid?: string; iban: string | null }[] },
): boolean {
  if (vieja.banco !== nueva.banco) return false;
  const ibans = new Set(vieja.cuentas.map(c => normIban(c.iban)).filter(Boolean));
  return nueva.cuentas.some(c => ibans.has(normIban(c.iban)));
}
