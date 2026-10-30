/**
 * EL VENCIMIENTO EN UN TOQUE
 *
 * La fecha de vencimiento casi nunca se elige en el calendario: es «a 30
 * días», «a fin de mes» o «lo de siempre con este cliente». Aquí salen esas
 * fechas ya calculadas desde la de emisión, para ponerlas con un botón, y
 * el día de la semana en que caen: un vencimiento en domingo se cobra el
 * lunes, y conviene saberlo al hacer la factura y no al mirar el banco.
 *
 * Las fechas van siempre como texto `AAAA-MM-DD` y las cuentas se hacen en
 * UTC: con la hora local, en según qué zona y según qué día del cambio de
 * hora, sumar 30 días a medianoche daba 29.
 */

export type IdVencimiento = 'contado' | 'd15' | 'd30' | 'd60' | 'fin-mes' | 'cliente';

export interface OpcionVencimiento {
  id: IdVencimiento;
  etiqueta: string;
  fecha: string;
  /** Para el lector de pantalla y el rótulo emergente. */
  descripcion: string;
}

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function aUtc(fecha: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha ?? '');
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) || d.getUTCDate() !== Number(m[3]) ? null : d;
}

const aTexto = (d: Date) => d.toISOString().slice(0, 10);

/** La fecha `dias` días después (o antes, en negativo). */
export function sumarDias(fecha: string, dias: number): string | null {
  const d = aUtc(fecha);
  if (!d) return null;
  d.setUTCDate(d.getUTCDate() + Math.trunc(dias));
  return aTexto(d);
}

/** El último día del mes de esa fecha. */
export function finDeMes(fecha: string): string | null {
  const d = aUtc(fecha);
  if (!d) return null;
  return aTexto(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}

/** Días de una fecha a otra (negativo si la segunda es anterior). */
export function diasEntre(desde: string, hasta: string): number | null {
  const a = aUtc(desde);
  const b = aUtc(hasta);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function diaDeLaSemana(fecha: string): string | null {
  const d = aUtc(fecha);
  return d ? DIAS_SEMANA[d.getUTCDay()] : null;
}

/** ¿Cae en sábado o domingo? */
export function esFinDeSemana(fecha: string): boolean {
  const d = aUtc(fecha);
  return !!d && (d.getUTCDay() === 0 || d.getUTCDay() === 6);
}

/**
 * Los atajos de vencimiento a partir de la fecha de emisión. «Según
 * cliente» sólo sale si la ficha tiene sus días de pago puestos.
 */
export function opcionesVencimiento(emision: string, diasCliente?: number | null): OpcionVencimiento[] {
  if (!aUtc(emision)) return [];
  const opciones: OpcionVencimiento[] = [
    { id: 'contado', etiqueta: 'Contado', fecha: emision, descripcion: 'Vence el mismo día de la factura' },
    { id: 'd15', etiqueta: '+15', fecha: sumarDias(emision, 15)!, descripcion: 'A 15 días' },
    { id: 'd30', etiqueta: '+30', fecha: sumarDias(emision, 30)!, descripcion: 'A 30 días' },
    { id: 'd60', etiqueta: '+60', fecha: sumarDias(emision, 60)!, descripcion: 'A 60 días' },
    { id: 'fin-mes', etiqueta: 'Fin de mes', fecha: finDeMes(emision)!, descripcion: 'El último día del mes de la factura' },
  ];
  if (diasCliente != null && Number.isFinite(diasCliente) && diasCliente >= 0) {
    const dias = Math.trunc(diasCliente);
    opciones.push({
      id: 'cliente',
      etiqueta: dias === 0 ? 'Según cliente (contado)' : `Según cliente (${dias} días)`,
      fecha: sumarDias(emision, dias)!,
      descripcion: dias === 0 ? 'Este cliente paga al contado' : `Este cliente paga a ${dias} días`,
    });
  }
  return opciones;
}

/**
 * El vencimiento dicho en una frase: «jueves, 26 de noviembre · a 30 días».
 * Con un aviso si cae en fin de semana o antes de la emisión.
 */
export function explicarVencimiento(emision: string, vencimiento: string): { texto: string; aviso: string | null } | null {
  const d = aUtc(vencimiento);
  if (!d) return null;
  const dia = DIAS_SEMANA[d.getUTCDay()];
  const fecha = `${dia}, ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
  const dias = diasEntre(emision, vencimiento);
  const plazo = dias == null ? '' : dias === 0 ? ' · al contado' : dias === 1 ? ' · mañana' : dias > 0 ? ` · a ${dias} días` : '';
  let aviso: string | null = null;
  if (dias != null && dias < 0) aviso = 'Es anterior a la fecha de emisión.';
  else if (esFinDeSemana(vencimiento)) aviso = `Cae en ${dia}: el cobro llegará, como pronto, el lunes.`;
  return { texto: `${fecha.charAt(0).toUpperCase()}${fecha.slice(1)}${plazo}`, aviso };
}
