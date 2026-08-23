/**
 * EL PARTE DE UN SERVICIO
 *
 * Se abre al llegar el aviso, se cierra al terminar. No mueve stock ni
 * genera ningún efecto fiscal por sí sola: es el registro de qué se hizo,
 * y de ahí sale —o no— la factura.
 */

import type { EstadoOrdenTrabajo, OrdenTrabajo } from './types';

/** Las que siguen en marcha: abiertas o en curso, no cerradas. */
export function ordenesEnMarcha(ordenes: OrdenTrabajo[]): OrdenTrabajo[] {
  return ordenes.filter(o => o.estado !== 'cerrada');
}

/**
 * Cuántos días lleva abierta una orden sin cerrarse.
 *
 * Es el número que importa de verdad: una orden con tres días es normal, una
 * con tres semanas es un aviso que se ha quedado colgado.
 */
export function diasAbierta(orden: OrdenTrabajo, hoy = new Date()): number {
  const desde = Date.parse(orden.fecha);
  if (!Number.isFinite(desde)) return 0;
  return Math.max(0, Math.round((hoy.getTime() - desde) / 86_400_000));
}

/** Las que llevan más de `limite` días sin cerrarse: lo que hay que revisar hoy. */
export function ordenesAtrasadas(ordenes: OrdenTrabajo[], limite = 7, hoy = new Date()): OrdenTrabajo[] {
  return ordenesEnMarcha(ordenes).filter(o => diasAbierta(o, hoy) > limite);
}

/** Un número correlativo: OT-2026-0007. */
export function numeroDeOrden(existentes: OrdenTrabajo[], fecha = new Date()): string {
  const anyo = fecha.getFullYear();
  const delAnyo = existentes.filter(o => o.numero.includes(`-${anyo}-`));
  return `OT-${anyo}-${String(delAnyo.length + 1).padStart(4, '0')}`;
}

/** El siguiente estado al que pasa una orden al avanzarla un paso. */
export function siguienteEstado(estado: EstadoOrdenTrabajo): EstadoOrdenTrabajo | null {
  if (estado === 'abierta') return 'en_curso';
  if (estado === 'en_curso') return 'cerrada';
  return null;
}
