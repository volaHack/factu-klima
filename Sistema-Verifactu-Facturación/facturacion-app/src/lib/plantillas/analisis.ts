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
import {
  agruparEnLineas, extraerPagina, lineasHorizontales, muestrearColor,
  rehidratarLienzo, type PaginaConLienzo,
} from './extraccion';
import { construirCalco, type Zona } from './limpieza';
import { compilarPlantilla, type ResultadoCompilacion } from './plantilla';
import type { AnalisisPdf, OrigenPlantilla, PlantillaDocumento } from './tipos';

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

// ============================================================
// REABRIR UNA PLANTILLA YA GUARDADA
// ============================================================

/** Lo que hay que guardar junto a la plantilla para poder reeditarla. */
export function origenDeSesion(sesion: SesionAnalisis): OrigenPlantilla {
  const { pagina, campos, tabla, zonasExtra, avisos, familia } = sesion.analisis;
  return {
    version: 1,
    pagina: {
      ancho: pagina.ancho,
      alto: pagina.alto,
      items: pagina.items,
      totalPaginas: pagina.totalPaginas,
      bitmap: pagina.bitmap,
    },
    campos,
    tabla,
    zonasExtra,
    avisos,
    familia,
  };
}

export class PlantillaNoEditable extends Error {}

/**
 * Devuelve una sesión de edición a partir de una plantilla guardada.
 *
 * El mapa de bits se vuelve a pintar en un lienzo para recuperar los píxeles
 * (hacen falta para tapar zonas y muestrear colores) y las líneas de texto se
 * recalculan agrupando los items, igual que al leer el PDF por primera vez.
 */
export async function abrirPlantillaGuardada(
  plantilla: PlantillaDocumento,
): Promise<SesionAnalisis> {
  const origen = plantilla.origen;
  if (!origen || !origen.pagina?.bitmap?.dataUrl) {
    throw new PlantillaNoEditable(
      'Esta plantilla se guardó antes de que existiera el editor y no conserva el PDF original. Vuelve a subir la factura para poder ajustarla.',
    );
  }

  const { lienzo, pixeles } = await rehidratarLienzo(origen.pagina.bitmap);
  const pagina: PaginaConLienzo = {
    ...origen.pagina,
    lineas: agruparEnLineas(origen.pagina.items),
    lienzo,
    pixeles,
  };

  return {
    analisis: {
      pagina,
      campos: origen.campos,
      tabla: origen.tabla,
      avisos: origen.avisos ?? [],
      zonasExtra: origen.zonasExtra ?? [],
      familia: origen.familia ?? 'sans',
    },
    pagina,
    nombreArchivo: plantilla.diagnostico?.archivoOrigen ?? '',
  };
}

/**
 * Zonas del calco que hay que tapar: cada campo que se va a rellenar con
 * datos, la tabla entera y lo que el usuario haya tapado a mano. Se
 * recalcula en cada compilación porque el usuario puede haber marcado
 * campos como fijos, movido cajas o añadido campos nuevos desde el revisor.
 */
export function zonasABorrar(analisis: AnalisisPdf): Zona[] {
  // Se borra TODO campo que no esté marcado como fijo, tenga clave asignada o
  // no.
  //
  // Un campo sin clave es un dato de la factura de muestra que no hemos
  // sabido a qué corresponde: el código del cliente anterior, su ciudad, un
  // desglose. Nadie lo va a rellenar, así que si no se borra queda impreso
  // en todas las facturas que se emitan con esta plantilla. Con los datos de
  // la empresa sólo queda feo; con los del cliente de la muestra es enseñarle
  // a un cliente los datos de otro.
  //
  // Dejar un hueco en blanco es peor de ver pero mejor de todas las demás
  // maneras, y tiene arreglo: en el revisor se marca el campo como fijo y
  // vuelve a salir impreso tal cual estaba.
  // Medio milímetro de más a los lados de cada campo. La caja se calcula a
  // partir de dónde dice el PDF que empieza el texto, y el trazo de la
  // primera letra suele asomar una pizca por delante: sin este margen queda
  // un pellizco de la «B» del NIF anterior pegado al NIF nuevo. Sólo se
  // aplica a los campos: el marco de la tabla y las zonas que el usuario tapa
  // a mano se borran exactamente donde dicen.
  const MARGEN = 0.5;
  const zonas: Zona[] = analisis.campos
    .filter(c => !c.fijo)
    .map(c => ({ x: c.x - MARGEN, y: c.y, ancho: c.ancho + MARGEN * 2, alto: c.alto }));

  if (analisis.tabla) {
    // La tabla se borra entera, cabecera incluida: la vuelve a pintar pdfme
    // para que los títulos de columna se repitan en las páginas siguientes.
    // Se deja un pequeño margen bajo la última fila para llevarse la última
    // línea partida de una descripción que envuelve a dos líneas.
    zonas.push({
      x: analisis.tabla.x,
      y: analisis.tabla.y,
      ancho: analisis.tabla.ancho,
      alto: analisis.tabla.altoTotal + analisis.tabla.altoFila * 0.6,
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
    const { x } = zona;
    let { y } = zona;
    const derecha = zona.x + zona.ancho;
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
