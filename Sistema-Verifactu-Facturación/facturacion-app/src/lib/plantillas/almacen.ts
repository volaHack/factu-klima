/**
 * ALMACÉN DE PLANTILLAS
 *
 * Sigue el mismo patrón que el resto de la aplicación: se escribe primero en
 * IndexedDB y luego se sincroniza con Supabase, y se lee de IndexedDB con un
 * refresco en segundo plano. Así se puede descargar el PDF de una factura
 * con el diseño de la empresa aunque el almacén esté sin cobertura.
 */

import { createClient } from '@/lib/supabase/client';
import {
  clearStore, enqueueSyncAction, getAll, getById, isOfflineDbAvailable,
  put, putMany, remove as removeFromDb,
} from '../offlineDb';
import { getCurrentUserId } from '../storage';
import { clavesValidas, TABLA_LINEAS } from './contrato';
import type { PlantillaDocumento, TipoDocumentoPlantilla } from './tipos';

const TIENDA = 'document_templates';

function supabase() {
  return createClient();
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
type FilaBd = any;

function desdeBd(fila: FilaBd): PlantillaDocumento {
  return {
    id: fila.id,
    nombre: fila.name ?? 'Plantilla',
    aplicaA: (fila.applies_to ?? ['factura']) as TipoDocumentoPlantilla[],
    plantilla: fila.template,
    diagnostico: fila.diagnostics ?? { avisos: [], confianza: {}, archivoOrigen: '' },
    predeterminada: Boolean(fila.is_default),
    createdAt: fila.created_at ?? new Date().toISOString(),
    updatedAt: fila.updated_at ?? new Date().toISOString(),
  };
}

function haciaBd(plantilla: PlantillaDocumento, userId: string): Record<string, unknown> {
  return {
    id: plantilla.id,
    user_id: userId,
    name: plantilla.nombre,
    applies_to: plantilla.aplicaA,
    template: plantilla.plantilla,
    diagnostics: plantilla.diagnostico,
    is_default: plantilla.predeterminada,
    updated_at: new Date().toISOString(),
  };
}

// ============================================================
// VALIDACIÓN
// ============================================================

export class PlantillaInvalida extends Error {}

/**
 * Comprueba que la plantilla sólo use campos que el sistema sabe rellenar.
 * Se ejecuta antes de guardar: más vale fallar aquí que descubrirlo al
 * imprimir una factura delante de un cliente.
 */
export function validarPlantilla(plantilla: PlantillaDocumento): void {
  const validas = clavesValidas();
  const paginas = plantilla.plantilla?.schemas;
  if (!Array.isArray(paginas) || paginas.length === 0) {
    throw new PlantillaInvalida('La plantilla no tiene ninguna página.');
  }

  const base = plantilla.plantilla.basePdf;
  const estaticos = base && typeof base === 'object' && 'staticSchema' in base
    ? (base.staticSchema ?? [])
    : [];

  const desconocidos: string[] = [];
  const vistos = new Set<string>();

  for (const esquema of [...paginas.flat(), ...estaticos]) {
    const nombre = esquema.name;
    if (!nombre || nombre.startsWith('__')) continue;
    if (vistos.has(nombre)) {
      throw new PlantillaInvalida(`Hay dos campos llamados «${nombre}». Los nombres no pueden repetirse.`);
    }
    vistos.add(nombre);
    // Los campos fijos añadidos a mano llevan su texto dentro y no se
    // rellenan con datos, así que no tienen por qué existir en el contrato.
    if (esquema.readOnly && !esquema.content?.startsWith('{')) continue;
    if (nombre === TABLA_LINEAS) continue;
    if (!validas.has(nombre)) desconocidos.push(nombre);
  }

  if (desconocidos.length > 0) {
    throw new PlantillaInvalida(
      `La plantilla usa campos que el sistema no sabe rellenar: ${desconocidos.join(', ')}.`,
    );
  }
}

// ============================================================
// LECTURA
// ============================================================

export async function getPlantillas(): Promise<PlantillaDocumento[]> {
  const local = await isOfflineDbAvailable();

  if (local) {
    const guardadas = await getAll<FilaBd>(TIENDA);
    if (guardadas.length > 0) {
      refrescarEnSegundoPlano();
      return guardadas.map(desdeBd).sort(porFecha);
    }
  }

  if (!navigator.onLine) return [];

  const { data, error } = await supabase()
    .from('document_templates')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error || !data) return [];

  if (local) {
    await clearStore(TIENDA);
    await putMany(TIENDA, data);
  }
  return data.map(desdeBd);
}

function porFecha(a: PlantillaDocumento, b: PlantillaDocumento): number {
  return b.updatedAt.localeCompare(a.updatedAt);
}

async function refrescarEnSegundoPlano(): Promise<void> {
  if (!navigator.onLine) return;
  try {
    const { data, error } = await supabase()
      .from('document_templates')
      .select('*')
      .order('updated_at', { ascending: false });
    if (!error && data) {
      await clearStore(TIENDA);
      await putMany(TIENDA, data);
    }
  } catch {
    // Sin conexión o con error del servidor, lo local sigue sirviendo.
  }
}

export async function getPlantillaById(id: string): Promise<PlantillaDocumento | undefined> {
  if (await isOfflineDbAvailable()) {
    const guardada = await getById<FilaBd>(TIENDA, id);
    if (guardada) return desdeBd(guardada);
  }
  if (!navigator.onLine) return undefined;
  const { data } = await supabase().from('document_templates').select('*').eq('id', id).limit(1);
  return data?.length ? desdeBd(data[0]) : undefined;
}

/**
 * La plantilla con la que se imprime un documento: la predeterminada que
 * sirva para ese tipo, o la más reciente que sirva. Sin ninguna, se imprime
 * con el diseño estándar del sistema.
 */
export async function getPlantillaActiva(
  tipo: TipoDocumentoPlantilla,
): Promise<PlantillaDocumento | null> {
  const todas = (await getPlantillas()).filter(p => p.aplicaA.includes(tipo));
  if (todas.length === 0) return null;
  return todas.find(p => p.predeterminada) ?? todas[0];
}

// ============================================================
// ESCRITURA
// ============================================================

export async function guardarPlantilla(plantilla: PlantillaDocumento): Promise<void> {
  validarPlantilla(plantilla);

  const userId = await getCurrentUserId();
  if (!userId) throw new Error('Sesión no válida. Vuelve a iniciar sesión para guardar la plantilla.');

  const fila = haciaBd(plantilla, userId);
  const local = await isOfflineDbAvailable();

  // Sólo puede haber una predeterminada por tipo de documento: si esta lo
  // es, las demás dejan de serlo. En el servidor lo garantiza además un
  // índice único, pero la caché local tiene que quedar coherente ya.
  if (plantilla.predeterminada) {
    const otras = (await getPlantillas()).filter(p => p.id !== plantilla.id && p.predeterminada);
    for (const otra of otras) {
      await guardarSinValidar({ ...otra, predeterminada: false }, userId, local);
    }
  }

  if (local) await put(TIENDA, fila);

  if (navigator.onLine) {
    let resultado: { error: unknown } | null = null;
    try {
      resultado = await supabase().from('document_templates').upsert(fila);
    } catch {
      // La petición no llegó a salir: se reintenta desde la cola.
      await enqueueSyncAction('upsert', 'document_templates', fila);
    }
    if (resultado?.error) {
      const mensaje = (resultado.error as { message?: string })?.message ?? 'Error al guardar la plantilla.';
      throw new Error(mensaje);
    }
  } else {
    await enqueueSyncAction('upsert', 'document_templates', fila);
  }
}

async function guardarSinValidar(
  plantilla: PlantillaDocumento,
  userId: string,
  local: boolean,
): Promise<void> {
  const fila = haciaBd(plantilla, userId);
  if (local) await put(TIENDA, fila);
  if (navigator.onLine) {
    try {
      await supabase().from('document_templates').upsert(fila);
      return;
    } catch {
      // Cae a la cola.
    }
  }
  await enqueueSyncAction('upsert', 'document_templates', fila);
}

export async function borrarPlantilla(id: string): Promise<void> {
  if (await isOfflineDbAvailable()) await removeFromDb(TIENDA, id);

  if (navigator.onLine) {
    try {
      await supabase().from('document_templates').delete().eq('id', id);
      return;
    } catch {
      // Cae a la cola.
    }
  }
  await enqueueSyncAction('delete', 'document_templates', { id });
}

export async function marcarPredeterminada(id: string): Promise<void> {
  const todas = await getPlantillas();
  const elegida = todas.find(p => p.id === id);
  if (!elegida) throw new Error('La plantilla ya no existe.');
  await guardarPlantilla({ ...elegida, predeterminada: true, updatedAt: new Date().toISOString() });
}
