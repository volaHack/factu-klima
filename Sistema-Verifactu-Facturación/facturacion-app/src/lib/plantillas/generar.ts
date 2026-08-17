/**
 * GENERACIÓN DEL PDF FINAL
 *
 * Junta la plantilla (el diseño calcado del PDF del usuario) con los datos
 * de una factura concreta y produce el PDF que se descarga o se imprime.
 *
 * pdfme pesa bastante, así que se importa aquí dentro y siempre en dinámico:
 * quien no descargue un PDF no llega a bajarse el generador.
 */

import type { Template } from '@pdfme/common';
import { TABLA_LINEAS } from './contrato';
import type { DatosDocumento } from './datos';
import { cargarFuentes } from './fuentes';
import { columnasDePlantilla, normalizarPlantilla } from './plantilla';

export class ErrorGeneracion extends Error {}

/**
 * Construye la entrada de pdfme: una clave por campo y, para la tabla, las
 * filas ya ordenadas según las columnas que tenga esa plantilla.
 */
export function construirEntrada(plantilla: Template, datos: DatosDocumento): Record<string, string> {
  const columnas = columnasDePlantilla(plantilla);
  const filas = datos.lineas.map(linea =>
    columnas.map(columna => (columna ? (linea[columna] ?? '') : '')),
  );

  const entrada: Record<string, string> = { ...datos.campos };

  const paginas = plantilla.schemas || [];
  const baseStatic = (plantilla.basePdf && typeof plantilla.basePdf === 'object' && 'staticSchema' in plantilla.basePdf)
    ? ((plantilla.basePdf as { staticSchema?: unknown[] }).staticSchema || [])
    : [];

  for (const esq of [...paginas.flat(), ...baseStatic] as { name?: string }[]) {
    if (!esq.name || esq.name === TABLA_LINEAS) continue;
    if (entrada[esq.name] === undefined) {
      const claveBase = esq.name.replace(/_\d+$/, '');
      if (datos.campos[claveBase] !== undefined) {
        entrada[esq.name] = datos.campos[claveBase];
      }
    }
  }

  return {
    ...entrada,
    [TABLA_LINEAS]: JSON.stringify(filas),
  };
}

export interface OpcionesPdf {
  /** Título del documento dentro de las propiedades del PDF. */
  titulo?: string;
  autor?: string;
}

/**
 * Deja los valores de las imágenes (logotipo, QR) en un formato que pdfme
 * sepa incrustar.
 *
 * pdfme sólo admite un `data:` URL: con una dirección `https://…` —que es
 * justo lo que guarda Ajustes cuando el logotipo se sube a Supabase— intenta
 * interpretar la propia URL como un JPEG y la generación entera falla. Aquí
 * se descarga y se convierte; si no se puede, el campo se queda vacío, que es
 * mucho mejor que una factura que no llega a generarse.
 */
async function resolverImagenes(
  plantilla: Template,
  entrada: Record<string, string>,
): Promise<Record<string, string>> {
  const paginas = plantilla.schemas || [];
  const baseStatic = (plantilla.basePdf && typeof plantilla.basePdf === 'object' && 'staticSchema' in plantilla.basePdf)
    ? ((plantilla.basePdf as { staticSchema?: unknown[] }).staticSchema || [])
    : [];

  const nombresDeImagen = [...paginas.flat(), ...baseStatic]
    .filter((e): e is { name: string; type: string } => {
      const esq = e as { name?: string; type?: string };
      return typeof esq.name === 'string' && esq.type === 'image';
    })
    .map(e => e.name);

  if (nombresDeImagen.length === 0) return entrada;

  const resuelta = { ...entrada };
  await Promise.all(nombresDeImagen.map(async (nombre) => {
    const valor = resuelta[nombre];
    if (!valor || valor.startsWith('data:')) return;
    try {
      const respuesta = await fetch(valor);
      if (!respuesta.ok) throw new Error(String(respuesta.status));
      const blob = await respuesta.blob();
      resuelta[nombre] = await new Promise<string>((resolver, rechazar) => {
        const lector = new FileReader();
        lector.onload = () => resolver(String(lector.result));
        lector.onerror = () => rechazar(lector.error);
        lector.readAsDataURL(blob);
      });
    } catch {
      resuelta[nombre] = '';
    }
  }));

  return resuelta;
}

export async function generarPdf(
  plantillaBruta: Template,
  datos: DatosDocumento,
  opciones: OpcionesPdf = {},
): Promise<Uint8Array> {
  const plantilla = normalizarPlantilla(plantillaBruta);
  const [{ generate }, esquemas, fuentes] = await Promise.all([
    import('@pdfme/generator'),
    import('@pdfme/schemas'),
    cargarFuentes(),
  ]);

  // Los tipos de elemento hay que declararlos: `generate()` sólo trae de
  // serie el de texto, y sin esto una plantilla con tabla o con el calco de
  // fondo falla con «renderer for type table not found».
  const tipos = {
    text: esquemas.text,
    table: esquemas.table,
    image: esquemas.image,
    line: esquemas.line,
    rectangle: esquemas.rectangle,
    ellipse: esquemas.ellipse,
    svg: esquemas.svg,
    qrcode: esquemas.barcodes.qrcode,
  };

  const entrada = await resolverImagenes(plantilla, construirEntrada(plantilla, datos));

  try {
    return await generate({
      template: plantilla,
      inputs: [entrada],
      plugins: tipos,
      options: {
        font: fuentes,
        title: opciones.titulo ?? '',
        author: opciones.autor ?? '',
        creator: 'Sistema de facturación',
        producer: 'Sistema de facturación',
        lang: 'es',
      },
    });
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);
    throw new ErrorGeneracion(`No se ha podido componer el PDF: ${detalle}`);
  }
}

/** Genera el PDF y lo devuelve como Blob listo para descargar o previsualizar. */
export async function generarPdfBlob(
  plantilla: Template,
  datos: DatosDocumento,
  opciones: OpcionesPdf = {},
): Promise<Blob> {
  const bytes = await generarPdf(plantilla, datos, opciones);
  // Copia dentro de un ArrayBuffer propio: el Uint8Array de pdfme puede venir
  // sobre un buffer compartido y Blob necesita uno normal.
  return new Blob([new Uint8Array(bytes).slice().buffer], { type: 'application/pdf' });
}

/** Descarga el PDF con el nombre indicado. */
export function descargarBlob(blob: Blob, nombreArchivo: string): void {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  // Se libera con retraso porque algunos navegadores aún están leyendo la
  // URL cuando termina el click.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
