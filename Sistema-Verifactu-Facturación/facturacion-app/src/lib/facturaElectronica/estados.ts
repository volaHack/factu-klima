/**
 * ESTADOS DE LA FACTURA ELECTRÓNICA Y SUS PLAZOS
 *
 * El RD 238/2026 obliga a quien RECIBE una factura electrónica a informar
 * a quien la emitió de dos cosas: si la acepta o la rechaza (y la fecha),
 * y la fecha en que la paga entera. La Orden HAC/1028/2026 añade que esas
 * comunicaciones (rechazo, pago, cobro, impago) llegan también a la
 * solución pública de la AEAT, y que quien EMITE puede comunicar de forma
 * voluntaria el cobro o el impago.
 *
 * El plazo es de cuatro días naturales sin contar sábados, domingos ni
 * festivos nacionales, desde el día en que pasa lo que se comunica.
 */

export type SentidoFe = 'emitida' | 'recibida';

export type EstadoFe =
  | 'generada'   // emitida: el fichero existe y se guarda, aún no ha salido
  | 'enviada'    // emitida: entregada por el canal
  | 'error'      // emitida: el canal no la ha admitido
  | 'recibida'   // recibida, o emitida que el cliente ya tiene
  | 'aceptada'
  | 'rechazada'
  | 'pagada'
  | 'impagada'
  | 'anulada';

export type TipoComunicacion = 'aceptacion' | 'rechazo' | 'pago' | 'pago_parcial' | 'cobro' | 'impago' | 'anulacion';

export const NOMBRE_ESTADO: Record<EstadoFe, string> = {
  generada: 'Generada', enviada: 'Enviada', error: 'Con error', recibida: 'Recibida', aceptada: 'Aceptada',
  rechazada: 'Rechazada', pagada: 'Pagada', impagada: 'Impagada', anulada: 'Anulada',
};

export const NOMBRE_COMUNICACION: Record<TipoComunicacion, string> = {
  aceptacion: 'Aceptación', rechazo: 'Rechazo', pago: 'Pago completo', pago_parcial: 'Pago parcial', cobro: 'Cobro',
  impago: 'Impago', anulacion: 'Anulación',
};

/** El estado al que lleva cada comunicación. */
export const ESTADO_TRAS: Record<TipoComunicacion, EstadoFe> = {
  aceptacion: 'aceptada', rechazo: 'rechazada', pago: 'pagada', pago_parcial: 'aceptada', cobro: 'pagada', impago: 'impagada', anulacion: 'anulada',
};

/** Qué puede comunicar cada parte, según el estado en que está la factura. */
export function comunicacionesPosibles(sentido: SentidoFe, estado: EstadoFe): TipoComunicacion[] {
  if (estado === 'anulada') return [];
  if (sentido === 'recibida') {
    switch (estado) {
      case 'recibida': return ['aceptacion', 'rechazo', 'pago'];
      case 'aceptada': return ['pago', 'pago_parcial', 'rechazo'];
      case 'impagada': return ['pago', 'pago_parcial'];
      default: return [];
    }
  }
  // Quien emite: el cobro y el impago son voluntarios; la anulación, cuando la factura se anula.
  switch (estado) {
    case 'generada': case 'error': return ['anulacion'];
    case 'enviada': case 'recibida': case 'aceptada': return ['cobro', 'impago', 'anulacion'];
    case 'impagada': return ['cobro', 'anulacion'];
    case 'rechazada': return ['anulacion'];
    default: return [];
  }
}

// ------------------------------------------------------------ calendario

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (f: string) => new Date(`${f.slice(0, 10)}T00:00:00Z`);

/** Domingo de Pascua (algoritmo anónimo gregoriano). */
export function domingoDePascua(anio: number): string {
  const a = anio % 19, b = Math.floor(anio / 100), c = anio % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/**
 * Festivos nacionales comunes a toda España (los que fija cada año la
 * resolución del BOE para todo el territorio). Los autonómicos y locales
 * no cuentan para este plazo.
 */
export function festivosNacionales(anio: number): Set<string> {
  const viernesSanto = new Date(utc(domingoDePascua(anio)).getTime() - 2 * 86400000);
  return new Set([
    `${anio}-01-01`, `${anio}-01-06`, iso(viernesSanto), `${anio}-05-01`, `${anio}-08-15`,
    `${anio}-10-12`, `${anio}-11-01`, `${anio}-12-06`, `${anio}-12-08`, `${anio}-12-25`,
  ]);
}

export function esDiaHabil(fecha: string): boolean {
  const d = utc(fecha);
  const dia = d.getUTCDay();
  if (dia === 0 || dia === 6) return false;
  return !festivosNacionales(d.getUTCFullYear()).has(fecha.slice(0, 10));
}

/** Suma `n` días hábiles a una fecha (el día de partida no cuenta). */
export function sumarDiasHabiles(fecha: string, n: number): string {
  let d = utc(fecha);
  let quedan = n;
  while (quedan > 0) {
    d = new Date(d.getTime() + 86400000);
    if (esDiaHabil(iso(d))) quedan--;
  }
  return iso(d);
}

export const DIAS_PLAZO = 4;

/** Último día para comunicar algo que pasó en `fechaHecho`. */
export const plazoComunicacion = (fechaHecho: string) => sumarDiasHabiles(fechaHecho, DIAS_PLAZO);

/** Días hábiles que quedan hasta `plazo` desde `hoy` (negativo si ya pasó). */
export function diasHabilesHasta(plazo: string, hoy: string): number {
  if (plazo.slice(0, 10) === hoy.slice(0, 10)) return 0;
  const adelante = plazo > hoy;
  let d = utc(adelante ? hoy : plazo);
  const fin = adelante ? plazo.slice(0, 10) : hoy.slice(0, 10);
  let n = 0;
  while (iso(d) < fin) {
    d = new Date(d.getTime() + 86400000);
    if (esDiaHabil(iso(d))) n++;
  }
  return adelante ? n : -n;
}

// ------------------------------------------------------------ lo que hay que hacer

export interface FeResumen {
  id: string;
  sentido: SentidoFe;
  estado: EstadoFe;
  numero: string;
  nombreEmisor?: string;
  total: number;
  fecha: string;
  /** Vencimiento de la factura (de su fichero), si lo trae. */
  vencimiento?: string;
}

export interface Tarea {
  feId: string;
  tipo: 'decidir' | 'pago';
  texto: string;
  /** Plazo legal, si lo hay. */
  plazo?: string;
  urgente: boolean;
}

/**
 * Lo pendiente con las facturas recibidas: decidir si se aceptan y,
 * vencidas, comunicar el pago. Lo que ya está comunicado no aparece.
 */
export function tareasPendientes(facturas: FeResumen[], hoy: string): Tarea[] {
  const out: Tarea[] = [];
  for (const f of facturas) {
    if (f.sentido !== 'recibida') continue;
    const quien = f.nombreEmisor ? ` de ${f.nombreEmisor}` : '';
    if (f.estado === 'recibida') {
      out.push({ feId: f.id, tipo: 'decidir', texto: `Acepta o rechaza la factura ${f.numero}${quien}.`, urgente: false });
    }
    if ((f.estado === 'recibida' || f.estado === 'aceptada' || f.estado === 'impagada') && f.vencimiento && f.vencimiento <= hoy) {
      out.push({
        feId: f.id, tipo: 'pago', urgente: true,
        texto: `La factura ${f.numero}${quien} venció el ${f.vencimiento.split('-').reverse().join('/')}. Si ya la has pagado, comunica el pago: hay ${DIAS_PLAZO} días hábiles desde la fecha de pago.`,
      });
    }
  }
  return out;
}
