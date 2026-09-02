/**
 * EL DISEÑO DE FACTURA SIGUE AL SECTOR
 *
 * Las casillas que pide cada línea en /facturas/nueva salen de la plantilla
 * activa cuando ésta trae columnas propias, y sólo del oficio cuando no. Es
 * a propósito: las columnas de la plantilla se imprimen en el PDF, y pedir
 * unas y sacar otras dejaría huecos en el papel.
 *
 * El efecto secundario es el que motiva este módulo: al cambiar el sector en
 * Ajustes, la plantilla se quedaba como estaba. Una inmobiliaria que antes
 * tuvo puesto «Distribución» seguía viendo «CAJ.» en cada línea, y la única
 * salida era ir a /plantillas y montarse otra a mano.
 *
 * Aquí la plantilla pasa a seguir al sector. Con dos cautelas que importan:
 *
 * - Un calco del PDF real de la empresa NO se toca nunca. Ésos no tienen
 *   oficio anotado, y son el membrete de verdad de quien factura: cambiarlo
 *   por un papel genérico sería destruirle el diseño.
 * - La plantilla anterior tampoco se borra. Sólo deja de ser la
 *   predeterminada, así que volver atrás es marcarla otra vez.
 */

import { getPlantillas, guardarPlantilla, marcarPredeterminada } from './almacen';
import { compilar, origenDeSesion, sesionDesdeCero } from './analisis';
import { facturaDesdeCero, oficioParaSector, oficioPorId, plantillaDeOtroOficio } from './desdeCero';
import type { PlantillaDocumento } from './tipos';
import type { BusinessSector, CompanySettings } from '@/lib/types';

/** Qué hay que hacer con la plantilla de factura para un sector dado. */
export type DecisionPlantilla =
  /** La que hay ya sirve: es la del oficio, es genérica, o es un calco propio. */
  | { accion: 'ninguna' }
  /** Ya existe la del oficio entre las guardadas: basta con volver a marcarla. */
  | { accion: 'marcar'; id: string; oficioId: string }
  /** No hay ninguna del oficio: hay que montarla. */
  | { accion: 'crear'; oficioId: string };

/**
 * Decide sin tocar nada. Separado del guardado para poder probarlo: montar
 * una plantilla de verdad necesita lienzo, y esto es sólo la regla.
 */
export function decidirPlantillaParaSector(
  plantillas: PlantillaDocumento[],
  sector: BusinessSector | undefined,
): DecisionPlantilla {
  const facturas = plantillas.filter(p => p.aplicaA.includes('factura'));
  // Mismo criterio que getPlantillaActiva: la marcada, y si no la primera.
  const activa = facturas.find(p => p.predeterminada) ?? facturas[0];
  if (!activa) return { accion: 'ninguna' };

  // plantillaDeOtroOficio ya sabe cuándo NO hay que meterse: sin oficio
  // anotado (un calco del PDF de la empresa) o con el genérico, que es una
  // factura española normal y vale para cualquiera.
  const ajena = plantillaDeOtroOficio(activa.diagnostico?.oficio, sector);
  if (!ajena) return { accion: 'ninguna' };

  const suyo = oficioParaSector(sector);
  const ya = facturas.find(p => p.diagnostico?.oficio === suyo.id);
  if (ya) return { accion: 'marcar', id: ya.id, oficioId: suyo.id };
  return { accion: 'crear', oficioId: suyo.id };
}

/** Lo que se hizo, para poder contárselo a quien cambió el sector. */
export interface ResultadoAjuste {
  cambiada: boolean;
  /** Nombre del oficio al que ha pasado la factura, si hubo cambio. */
  oficio?: string;
}

/**
 * Aplica la decisión: deja como predeterminada la plantilla del oficio que
 * le toca al sector, montándola si aún no existe.
 *
 * Necesita navegador: `sesionDesdeCero` pasa el papel en blanco por el
 * lienzo porque `compilar` lee sus píxeles.
 */
export async function ajustarPlantillaAlSector(
  sector: BusinessSector | undefined,
  ajustes: CompanySettings | null,
): Promise<ResultadoAjuste> {
  const decision = decidirPlantillaParaSector(await getPlantillas(), sector);
  if (decision.accion === 'ninguna') return { cambiada: false };

  const oficio = oficioPorId(decision.oficioId);

  if (decision.accion === 'marcar') {
    await marcarPredeterminada(decision.id);
    return { cambiada: true, oficio: oficio.nombre };
  }

  const sesion = await sesionDesdeCero(facturaDesdeCero(decision.oficioId, ajustes), decision.oficioId);
  const { plantilla, diagnostico } = compilar(sesion);
  const ahora = new Date().toISOString();
  await guardarPlantilla({
    id: crypto.randomUUID(),
    nombre: `Mi factura · ${oficio.nombre}`,
    aplicaA: ['factura'],
    plantilla,
    diagnostico,
    origen: origenDeSesion(sesion),
    predeterminada: true,
    createdAt: ahora,
    updatedAt: ahora,
  });
  return { cambiada: true, oficio: oficio.nombre };
}
