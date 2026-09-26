/**
 * PRUEBAS Y PRODUCCIÓN: QUÉ FALTA POR ENVIAR EN CADA UNO
 *
 * Las facturas emitidas mientras la cuenta estaba en Pruebas son facturas
 * de verdad (se emitieron, llevan número y huella), y sus registros están
 * en la cadena. Si al pasar a Producción sólo se mandaran los nuevos, el
 * primero de ellos se encadenaría con registros que la AEAT de producción
 * nunca ha recibido. Por eso, en Producción, lo que sólo se envió a Pruebas
 * cuenta como pendiente y se manda otra vez, desde el principio y en orden.
 *
 * Y al revés no: con registros ya aceptados en Producción no se vuelve a
 * Pruebas, porque lo que se emitiera después no llegaría a la AEAT real.
 */

export type EntornoAeat = 'pruebas' | 'produccion';

export interface EstadoRegistroEnvio {
  estado: string;
  entorno?: string | null;
}

/** Los estados que siempre hay que (re)enviar. */
export const ESTADOS_PENDIENTES = ['pendiente', 'error_envio', 'rechazado'] as const;

const aceptado = (estado: string) => estado === 'aceptado' || estado === 'aceptado_con_errores';

/** ¿Falta mandar este registro al entorno en el que está la cuenta? */
export function pendienteEn(entorno: EntornoAeat, r: EstadoRegistroEnvio): boolean {
  if ((ESTADOS_PENDIENTES as readonly string[]).includes(r.estado)) return true;
  return entorno === 'produccion' && r.entorno === 'pruebas';
}

/** ¿Hay algo ya aceptado por la AEAT real? Entonces no se puede volver a Pruebas. */
export function hayAceptadosEnProduccion(registros: EstadoRegistroEnvio[]): boolean {
  return registros.some(r => r.entorno === 'produccion' && aceptado(r.estado));
}

/** Registros que sólo han ido a Pruebas: se reenviarán al pasar a Producción. */
export function soloEnviadosAPruebas(registros: EstadoRegistroEnvio[]): number {
  return registros.filter(r => r.entorno === 'pruebas').length;
}
