'use client';

/**
 * La consulta al censo de la AEAT desde el navegador (la hace el servidor,
 * ver /api/verifactu/comprobar-nif) y lo que se hace con su respuesta.
 *
 * Un par NIF + nombre que la AEAT dio por IDENTIFICADO no cambia de un día
 * para otro: se guarda 30 días en este equipo y no se vuelve a preguntar
 * en cada factura al mismo cliente. Lo demás no se guarda: si estaba mal,
 * se corrige y se vuelve a mirar.
 */

import type { EstadoCenso, ResultadoCenso } from '../verifactu/censoAeat';
import { normalizarNif } from './identidad';

const CLAVE_CACHE = 'klima-censo-aeat';
const VIGENCIA_MS = 30 * 24 * 60 * 60 * 1000;

export type RespuestaCenso =
  | { tipo: 'resultado'; resultado: ResultadoCenso }
  /** Sin certificado: no se puede preguntar, pero no es un fallo. */
  | { tipo: 'sin_certificado'; motivo: string }
  /** Se intentó y falló (red, AEAT caída…). */
  | { tipo: 'fallo'; motivo: string };

const clave = (nif: string, nombre: string) =>
  `${normalizarNif(nif)}|${nombre.trim().toUpperCase().replace(/\s+/g, ' ')}`;

function leerCache(): Record<string, { en: number; resultado: ResultadoCenso }> {
  try { return JSON.parse(localStorage.getItem(CLAVE_CACHE) || '{}'); } catch { return {}; }
}

export async function comprobarEnAeat(nif: string, nombre: string): Promise<RespuestaCenso> {
  const k = clave(nif, nombre);
  const cache = leerCache();
  const guardado = cache[k];
  if (guardado && Date.now() - guardado.en < VIGENCIA_MS) return { tipo: 'resultado', resultado: guardado.resultado };

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { tipo: 'fallo', motivo: 'No hay conexión para preguntar a la AEAT.' };
  }
  try {
    const r = await fetch('/api/verifactu/comprobar-nif', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consultas: [{ nif: normalizarNif(nif), nombre: nombre.trim() }] }),
    });
    const datos = await r.json().catch(() => ({}));
    if (!r.ok) return { tipo: 'fallo', motivo: datos?.error || `Error ${r.status} al preguntar a la AEAT.` };
    if (datos?.disponible === false) return { tipo: 'sin_certificado', motivo: datos.motivo };
    const resultado: ResultadoCenso | undefined = datos?.resultados?.[0];
    if (!resultado) return { tipo: 'fallo', motivo: 'La AEAT no ha devuelto resultado.' };
    if (resultado.estado === 'identificado') {
      cache[k] = { en: Date.now(), resultado };
      try { localStorage.setItem(CLAVE_CACHE, JSON.stringify(cache)); } catch { /* sin almacenamiento */ }
    }
    return { tipo: 'resultado', resultado };
  } catch {
    return { tipo: 'fallo', motivo: 'No se ha podido conectar para preguntar a la AEAT.' };
  }
}

/** Lo que significa cada resultado, dicho para quien factura. */
export function explicarEstado(estado: EstadoCenso, nif: string, nombreCenso: string): string {
  switch (estado) {
    case 'identificado':
      return `La AEAT confirma que ${nif} corresponde a este nombre.`;
    case 'similar':
      return `La AEAT tiene ${nif} a nombre de «${nombreCenso}»: el nombre sólo se parece. Pon el nombre exacto.`;
    case 'no_identificado':
      return `La AEAT no reconoce ${nif} con ese nombre. O el NIF está mal, o el nombre no es el que consta en Hacienda.`;
    case 'baja':
      return `${nif} está de baja en el censo de la AEAT.`;
    case 'revocado':
      return `El NIF ${nif} está revocado: ya no se puede usar para facturar.`;
    case 'no_procesado':
      return 'La AEAT no ha podido comprobarlo ahora. Prueba en unos minutos.';
    default:
      return 'La AEAT ha devuelto una respuesta que no se reconoce.';
  }
}

/** Los estados con los que no se debe emitir. */
export function impideEmitir(estado: EstadoCenso): boolean {
  return estado === 'no_identificado' || estado === 'baja' || estado === 'revocado';
}
