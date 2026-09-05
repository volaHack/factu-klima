/**
 * ESTAMPAR EL BLOQUE DEL QR SOBRE EL PDF YA COMPUESTO
 *
 * POR QUÉ NO LO PINTA pdfme CON EL RESTO DE LA FACTURA
 * ---------------------------------------------------
 * Porque no puede cumplir dos cosas que la especificación sí exige.
 *
 * 1. «Si la factura ocupara varias páginas, el código "QR" aparecería una
 *    única vez, en la primera página». En esta aplicación todos los campos
 *    van anclados dentro de `basePdf.staticSchema` (ver `plantilla.ts`), y
 *    pdfme pinta el `staticSchema` en TODAS las hojas: una factura de tres
 *    páginas salía —o habría salido— con tres QR. Y no se puede mover a
 *    `schemas`, porque ahí pdfme reordena verticalmente todo lo que rodea a
 *    la tabla que crece y el QR dejaría de estar arriba.
 *
 * 2. «deberá quedar siempre bien visible … ocupando un lugar preeminente»,
 *    con su espacio vacío alrededor. Dentro del flujo de pdfme el QR es un
 *    elemento más y lo puede tapar el calco del membrete, un logotipo o un
 *    rótulo del propio diseño del usuario.
 *
 * Estampándolo al final, sobre el PDF ya cerrado, las dos cosas se cumplen
 * por construcción: se dibuja en la primera hoja y sólo en ella, y va encima
 * de todo lo demás con su recuadro blanco debajo. De paso, las plantillas que
 * un usuario calcó de su propio PDF hace meses —que no tienen ningún hueco
 * reservado para el QR— pasan a llevarlo sin tener que migrar nada de lo
 * guardado.
 *
 * Se usa `@pdfme/pdf-lib`, que es la misma copia de pdf-lib que ya carga el
 * generador de pdfme: no añade ni un kilobyte al paquete que se descarga.
 */

import type { BloqueQr } from './qrFactura';

/** 1 mm en puntos PostScript. */
const PT_POR_MM = 72 / 25.4;

const mm = (valor: number) => valor * PT_POR_MM;

export interface OpcionesEstampado {
  bloque: BloqueQr;
  /** El código ya renderizado, como `data:image/png;base64,…`. */
  imagenQr: string;
  /** Metadatos que hay que devolver a su sitio después de volver a guardar. */
  titulo?: string;
  autor?: string;
}

/** Convierte un `data:` URL de PNG en los bytes que pdf-lib sabe incrustar. */
function bytesDeDataUrl(dataUrl: string): Uint8Array {
  const coma = dataUrl.indexOf(',');
  const base64 = coma >= 0 ? dataUrl.slice(coma + 1) : dataUrl;
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

/**
 * Parte un texto en las líneas que caben en un ancho dado.
 *
 * La especificación lo contempla expresamente para la frase larga: «Si no
 * cabe toda la frase en una sola línea, podrán utilizarse varias líneas hasta
 * completarla». Sobre un A4 cabe de una; sobre un ticket estrecho, no.
 */
function partirEnLineas(
  texto: string,
  anchoPt: number,
  medir: (t: string) => number,
): string[] {
  if (medir(texto) <= anchoPt) return [texto];

  const lineas: string[] = [];
  let actual = '';
  for (const palabra of texto.split(/\s+/)) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (medir(prueba) <= anchoPt || !actual) {
      actual = prueba;
    } else {
      lineas.push(actual);
      actual = palabra;
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

/**
 * Dibuja el bloque completo —rótulo, código y leyenda, sobre su zona de
 * reserva en blanco— en la primera página del PDF y devuelve los bytes
 * nuevos.
 *
 * Si el PDF viene vacío o sin páginas se devuelve tal cual: es mejor una
 * factura sin estampar que una excepción que impide descargarla.
 */
export async function estamparBloqueQr(
  pdf: Uint8Array,
  opciones: OpcionesEstampado,
): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('@pdfme/pdf-lib');

  const documento = await PDFDocument.load(pdf);
  const paginas = documento.getPages();
  if (paginas.length === 0) return pdf;

  const pagina = paginas[0];
  const { height: altoPt } = pagina.getSize();
  const { bloque } = opciones;

  // mm desde arriba → pt desde abajo, que es como mide pdf-lib.
  const desdeArriba = (yMm: number, altoMm: number) => altoPt - mm(yMm + altoMm);

  // --- La zona de reserva ---
  //
  // Primero el blanco, y encima todo lo demás. Es lo que garantiza que el QR
  // quede legible aunque debajo hubiera un membrete, una línea o un sello:
  // nada de lo que ya está pintado puede invadirlo, porque queda cubierto.
  pagina.drawRectangle({
    x: mm(bloque.reserva.x),
    y: desdeArriba(bloque.reserva.y, bloque.reserva.alto),
    width: mm(bloque.reserva.ancho),
    height: mm(bloque.reserva.alto),
    color: rgb(1, 1, 1),
  });

  // --- El código ---
  const imagen = await documento.embedPng(bytesDeDataUrl(opciones.imagenQr));
  pagina.drawImage(imagen, {
    x: mm(bloque.qr.x),
    y: desdeArriba(bloque.qr.y, bloque.qr.alto),
    width: mm(bloque.qr.ancho),
    height: mm(bloque.qr.alto),
  });

  // --- Los dos textos ---
  //
  // Helvetica: es una de las catorce fuentes que todo lector de PDF trae de
  // serie, así que el rótulo se ve igual en cualquier visor y en cualquier
  // impresora sin incrustar nada. El negro puro es el máximo contraste contra
  // el blanco de la reserva, que es lo que pide el apartado 3.
  const fuente = await documento.embedFont(StandardFonts.Helvetica);
  const negro = rgb(0, 0, 0);

  const escribirCentrado = (
    texto: string, xMm: number, yMm: number, anchoMm: number, pt: number,
  ): number => {
    const medir = (t: string) => fuente.widthOfTextAtSize(t, pt);
    const lineas = partirEnLineas(texto, mm(anchoMm), medir);
    const altoLineaPt = pt * 1.25;
    lineas.forEach((linea, i) => {
      const anchoLineaPt = medir(linea);
      pagina.drawText(linea, {
        x: mm(xMm) + (mm(anchoMm) - anchoLineaPt) / 2,
        // El texto se asienta sobre su línea base: se baja un poco desde el
        // alto de la caja para que no monte sobre lo de arriba.
        y: altoPt - mm(yMm) - altoLineaPt * (i + 1) + pt * 0.25,
        size: pt,
        font: fuente,
        color: negro,
      });
    });
    return lineas.length;
  };

  escribirCentrado(bloque.rotulo.texto, bloque.rotulo.x, bloque.rotulo.y, bloque.rotulo.ancho, bloque.rotulo.tamano);
  if (bloque.leyenda) {
    escribirCentrado(bloque.leyenda.texto, bloque.leyenda.x, bloque.leyenda.y, bloque.leyenda.ancho, bloque.leyenda.tamano);
  }

  // Volver a guardar con pdf-lib reescribe el diccionario de información del
  // documento, así que se le devuelven el título y el autor que pdfme le
  // había puesto y que, si no, se perderían al descargar.
  if (opciones.titulo) documento.setTitle(opciones.titulo);
  if (opciones.autor) documento.setAuthor(opciones.autor);
  documento.setProducer('Sistema de facturación');
  documento.setCreator('Sistema de facturación');

  return documento.save();
}
