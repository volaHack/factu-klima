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

  // Todo campo de la plantilla tiene que aparecer en la entrada, aunque sea
  // vacío. Los campos anclados reciben su valor por un marcador `{clave}`
  // dentro del contenido, y pdfme, cuando no sabe resolver un marcador, deja
  // el texto tal cual: una factura sin teléfono imprimiría «{empresa_telefono}»
  // en mitad del membrete.
  for (const esq of [...paginas.flat(), ...baseStatic] as { name?: string }[]) {
    if (!esq.name || esq.name === TABLA_LINEAS) continue;
    if (entrada[esq.name] !== undefined) continue;
    const claveBase = esq.name.replace(/_\d+$/, '');
    entrada[esq.name] = datos.campos[claveBase] ?? '';
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

/** Descarga una imagen y la devuelve como `data:` URL. */
async function comoDataUrl(direccion: string): Promise<string> {
  const respuesta = await fetch(direccion);
  if (!respuesta.ok) throw new Error(String(respuesta.status));
  const bytes = new Uint8Array(await respuesta.arrayBuffer());
  // En trozos: `String.fromCharCode(...)` con un array de cientos de miles de
  // elementos desborda la pila de llamadas.
  let binario = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  const tipo = respuesta.headers.get('content-type') || 'image/png';
  return `data:${tipo};base64,${btoa(binario)}`;
}

/**
 * Mete el logotipo y el QR dentro de la plantilla, en el `content` de su
 * campo.
 *
 * Los campos van anclados (ver `plantilla.ts`), y de un campo anclado pdfme
 * lee el valor del `content`, no de la entrada. Los textos lo resuelven solos
 * con el marcador `{clave}`; una imagen no puede, porque ahí pdfme intentaría
 * incrustar la cadena «{empresa_logo}» como si fuera un PNG. Así que se
 * coloca aquí, ya resuelta.
 *
 * De paso se descarga: pdfme sólo admite `data:` URL, y con una dirección
 * `https://…` —que es justo lo que guarda Ajustes cuando el logotipo se sube
 * a Supabase— falla la generación entera. Si no se puede descargar, el campo
 * se queda vacío, que es mucho mejor que una factura que no llega a salir.
 *
 * Muta la plantilla, que a estas alturas ya es una copia (`normalizarPlantilla`).
 */
async function incrustarImagenes(plantilla: Template, entrada: Record<string, string>): Promise<void> {
  const baseStatic = (plantilla.basePdf && typeof plantilla.basePdf === 'object' && 'staticSchema' in plantilla.basePdf)
    ? ((plantilla.basePdf as { staticSchema?: unknown[] }).staticSchema || [])
    : [];

  const imagenes = [...(plantilla.schemas || []).flat(), ...baseStatic]
    .filter((e): e is { name: string; type: string; content: string } => {
      const esq = e as { name?: string; type?: string };
      return typeof esq.name === 'string' && esq.type === 'image' && esq.name !== '__calco';
    });

  await Promise.all(imagenes.map(async (esquema) => {
    const valor = entrada[esquema.name];
    if (valor === undefined) return;
    if (!valor || valor.startsWith('data:')) {
      esquema.content = valor;
      return;
    }
    try {
      esquema.content = await comoDataUrl(valor);
    } catch {
      esquema.content = '';
    }
  }));
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

  const entrada = construirEntrada(plantilla, datos);
  await incrustarImagenes(plantilla, entrada);

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
