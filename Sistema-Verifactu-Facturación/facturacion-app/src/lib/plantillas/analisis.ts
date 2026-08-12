/**
 * EL PROCESO COMPLETO: DE UN PDF SUBIDO A UNA PLANTILLA UTILIZABLE
 *
 *   PDF → extraer (texto + calco) → detectar (qué es dato) → [el usuario
 *   revisa] → compilar (calco limpio + campos) → plantilla pdfme
 *
 * La revisión del usuario está en medio a propósito: la detección acierta la
 * mayor parte, pero es la persona que conoce su factura quien confirma qué
 * es cada cosa. Por eso `analizar` y `compilar` son dos pasos separados y se
 * puede volver a compilar tantas veces como haga falta sin releer el PDF.
 */

import type { CompanySettings } from '../types';
import { detectar } from './deteccion';
import { extraerPagina, muestrearColor, type PaginaConLienzo } from './extraccion';
import { construirCalco, type Zona } from './limpieza';
import { compilarPlantilla, type ResultadoCompilacion } from './plantilla';
import type { AnalisisPdf } from './tipos';

export { ErrorPdf } from './extraccion';

/** Tamaño máximo del PDF de muestra. Una factura pesa muy por debajo. */
export const LIMITE_PDF_BYTES = 12 * 1024 * 1024;

export class ErrorArchivo extends Error {}

export interface SesionAnalisis {
  analisis: AnalisisPdf;
  /** La página con su lienzo, para poder recompilar cuando el usuario edite. */
  pagina: PaginaConLienzo;
  nombreArchivo: string;
}

export async function analizarPdf(
  archivo: File,
  ajustes?: CompanySettings | null,
): Promise<SesionAnalisis> {
  if (archivo.size > LIMITE_PDF_BYTES) {
    throw new ErrorArchivo('El PDF ocupa más de 12 MB. Sube una factura de una sola página.');
  }
  if (archivo.size === 0) {
    throw new ErrorArchivo('El archivo está vacío.');
  }

  const datos = await archivo.arrayBuffer();
  const pagina = await extraerPagina(datos);

  const analisis = detectar(pagina, {
    ajustes,
    muestrear: (x, y, ancho, alto) => {
      const { pxPorMm } = pagina.bitmap;
      return muestrearColor(pagina.pixeles, x * pxPorMm, y * pxPorMm, ancho * pxPorMm, alto * pxPorMm);
    },
  });

  return { analisis, pagina, nombreArchivo: archivo.name };
}

/**
 * Zonas del calco que hay que tapar: cada campo que se va a rellenar con
 * datos y la tabla entera. Se recalcula en cada compilación porque el
 * usuario puede haber marcado campos como fijos, movido cajas o añadido
 * campos nuevos desde el revisor.
 */
export function zonasABorrar(analisis: AnalisisPdf): Zona[] {
  const zonas: Zona[] = analisis.campos
    .filter(c => !c.fijo && c.clave)
    .map(c => ({ x: c.x, y: c.y, ancho: c.ancho, alto: c.alto }));

  if (analisis.tabla) {
    // La tabla se borra entera, cabecera incluida: la vuelve a pintar pdfme
    // para que los títulos de columna se repitan en las páginas siguientes.
    zonas.push({
      x: analisis.tabla.x,
      y: analisis.tabla.y,
      ancho: analisis.tabla.ancho,
      alto: analisis.tabla.altoTotal,
    });
  }
  return zonas;
}

export function compilar(sesion: SesionAnalisis): ResultadoCompilacion {
  const fondo = construirCalco(sesion.pagina, zonasABorrar(sesion.analisis));
  return compilarPlantilla(sesion.analisis, { fondo, archivoOrigen: sesion.nombreArchivo });
}
