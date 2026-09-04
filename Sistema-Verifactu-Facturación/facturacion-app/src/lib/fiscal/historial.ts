/**
 * HISTORIAL DE GENERACIONES FISCALES
 *
 * Guarda qué se generó, cuándo y —esto es lo importante— CON QUÉ
 * CONTENIDO. Recalcular un modelo meses después no sirve como historial:
 * los datos de origen pueden haber cambiado (una factura rectificada, un
 * gasto reclasificado) y saldría un fichero distinto del que vio
 * Hacienda. Lo que se guarda es lo que se presentó.
 *
 * La tabla lleva RLS por `user_id` (migración 036), igual que el resto:
 * cada empresa ve sólo su historial.
 */

import { createClient } from '../supabase/client';
import type { GeneracionFiscal, ModeloId, Trimestre } from './tipos';

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapDesdeDb(g: any): GeneracionFiscal {
  return {
    id: g.id,
    modelo: g.modelo,
    ejercicio: Number(g.ejercicio),
    trimestre: g.trimestre == null ? undefined : (Number(g.trimestre) as Trimestre),
    generadoEn: g.generado_en,
    generadoPor: g.generado_por || '',
    numRegistros: Number(g.num_registros ?? 0),
    resultado: g.resultado == null ? null : Number(g.resultado),
    estado: g.estado === 'con_avisos' ? 'con_avisos' : 'ok',
    contenido: g.contenido || undefined,
    nombreFichero: g.nombre_fichero || undefined,
  };
}

export async function getHistorialFiscal(modelo?: ModeloId): Promise<GeneracionFiscal[]> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return [];
  let q = createClient()
    .from('fiscal_generaciones')
    .select('*')
    .order('generado_en', { ascending: false })
    .limit(200);
  if (modelo) q = q.eq('modelo', modelo);

  const { data, error } = await q;
  if (error || !data) return [];
  return data.map(mapDesdeDb);
}

export interface NuevaGeneracion {
  modelo: ModeloId;
  ejercicio: number;
  trimestre?: Trimestre;
  numRegistros: number;
  resultado?: number | null;
  estado?: 'ok' | 'con_avisos';
  nombreFichero?: string;
  contenido?: string;
}

/**
 * Deja constancia de una generación.
 *
 * No lanza si falla: el usuario ya tiene su fichero descargado, y perder
 * la fila del historial no puede impedir que se lo lleve. Se avisa por
 * consola y se sigue.
 */
export async function registrarGeneracion(g: NuevaGeneracion): Promise<void> {
  try {
    const { data: sesion } = await createClient().auth.getUser();
    const userId = sesion?.user?.id;
    if (!userId) return;

    await createClient().from('fiscal_generaciones').insert({
      user_id: userId,
      modelo: g.modelo,
      ejercicio: g.ejercicio,
      trimestre: g.trimestre ?? null,
      generado_por: sesion?.user?.email || '',
      num_registros: g.numRegistros,
      resultado: g.resultado ?? null,
      estado: g.estado || 'ok',
      nombre_fichero: g.nombreFichero || null,
      contenido: g.contenido || null,
    });
  } catch (e) {
    console.error('No se pudo registrar la generación fiscal en el historial', e);
  }
}
