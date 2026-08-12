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
import { extraerPagina, lineasHorizontales, muestrearColor, type PaginaConLienzo } from './extraccion';
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

  const { pxPorMm } = pagina.bitmap;
  const analisis = detectar(pagina, {
    ajustes,
    muestrear: (x, y, ancho, alto) =>
      muestrearColor(pagina.pixeles, x * pxPorMm, y * pxPorMm, ancho * pxPorMm, alto * pxPorMm),
    buscarLineas: (x, ancho, y, alto) =>
      lineasHorizontales(
        pagina.pixeles,
        x * pxPorMm, (x + ancho) * pxPorMm,
        y * pxPorMm, (y + alto) * pxPorMm,
      ).map(pxY => pxY / pxPorMm),
  });

  return { analisis, pagina, nombreArchivo: archivo.name };
}

/**
 * Zonas del calco que hay que tapar: cada campo que se va a rellenar con
 * datos, la tabla entera y lo que el usuario haya tapado a mano. Se
 * recalcula en cada compilación porque el usuario puede haber marcado
 * campos como fijos, movido cajas o añadido campos nuevos desde el revisor.
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

  zonas.push(...analisis.zonasExtra.map(z => ({ x: z.x, y: z.y, ancho: z.ancho, alto: z.alto })));

  return ajustarAlTexto(zonas, analisis);
}

/**
 * Estira cada zona hasta cubrir por completo los textos que sólo tapa a
 * medias.
 *
 * Sin esto se ven letras cortadas por la mitad: el rectángulo de la tabla
 * termina donde la heurística cree que acaba el cuerpo, y si justo ahí hay
 * una fila de desglose, queda la mitad superior borrada y la inferior
 * impresa. Es el defecto que más delata que la factura está «parcheada».
 */
function ajustarAlTexto(zonas: Zona[], analisis: AnalisisPdf): Zona[] {
  const segmentos = analisis.pagina.lineas.flatMap(l => l.segmentos);

  return zonas.map(zona => {
    let { x, y } = zona;
    let derecha = zona.x + zona.ancho;
    let abajo = zona.y + zona.alto;

    for (const segmento of segmentos) {
      const segDerecha = segmento.x + segmento.ancho;
      const segAbajo = segmento.y + segmento.alto;
      const seCruzan = segmento.x < derecha && segDerecha > x && segmento.y < abajo && segAbajo > y;
      if (!seCruzan) continue;

      // Sólo se estira en vertical y hacia el propio texto: crecer en
      // horizontal se comería los bordes del diseño que hay al lado.
      const cubiertoEnHorizontal = segmento.x >= x - 0.5 && segDerecha <= derecha + 0.5;
      if (!cubiertoEnHorizontal) continue;

      y = Math.min(y, segmento.y);
      abajo = Math.max(abajo, segAbajo);
    }

    return { x, y, ancho: derecha - x, alto: abajo - y };
  });
}

export function compilar(sesion: SesionAnalisis): ResultadoCompilacion {
  const fondo = construirCalco(sesion.pagina, zonasABorrar(sesion.analisis));
  return compilarPlantilla(sesion.analisis, { fondo, archivoOrigen: sesion.nombreArchivo });
}
