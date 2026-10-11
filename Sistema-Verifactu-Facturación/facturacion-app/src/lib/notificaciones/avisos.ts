/**
 * QUÉ AVISOS DEL PANEL MERECEN UN CORREO
 *
 * Los mismos de «Para hoy», pero sólo los que piden hacer algo (vencidas,
 * plazos de Hacienda, permisos del banco…), no los informativos. Y sin
 * machacar: se manda cuando hay algo nuevo; si sigue siendo lo mismo, como
 * mucho un recordatorio a la semana.
 */

import type { TareaHoy } from '../panelHoy';

export const DIAS_ENTRE_RECORDATORIOS = 7;

export function avisosImportantes(tareas: TareaHoy[]): TareaHoy[] {
  return tareas.filter(t => t.tono === 'peligro' || t.tono === 'aviso');
}

/** Lo que identifica «lo mismo de la otra vez»: qué tareas y con qué texto. */
export function huellaAvisos(tareas: TareaHoy[]): string {
  return tareas.map(t => `${t.id}:${t.titulo}`).sort().join('|');
}

export function tocaAvisar(e: {
  importantes: number;
  huella: string;
  ultimaHuella: string | null;
  ultimoEn: string | null;
  ahora: Date;
}): boolean {
  if (e.importantes === 0) return false;
  if (e.huella !== e.ultimaHuella || !e.ultimoEn) return true;
  const dias = (e.ahora.getTime() - Date.parse(e.ultimoEn)) / 86_400_000;
  return dias >= DIAS_ENTRE_RECORDATORIOS;
}
