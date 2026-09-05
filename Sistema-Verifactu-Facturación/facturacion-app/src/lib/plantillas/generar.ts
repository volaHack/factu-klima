/**
 * GENERACIÓN DEL PDF FINAL
 *
 * Junta la plantilla (el diseño calcado del PDF del usuario) con los datos
 * de una factura concreta y produce el PDF que se descarga o se imprime.
 *
 * pdfme pesa bastante, así que se importa aquí dentro y siempre en dinámico:
 * quien no descargue un PDF no llega a bajarse el generador.
 */

import type { Schema, Template } from '@pdfme/common';
import { TABLA_LINEAS } from './contrato';
import type { DatosDocumento } from './datos';
import { cargarFuentes } from './fuentes';
import { columnasDePlantilla, materializarRejillas, normalizarPlantilla } from './plantilla';
import { estamparBloqueQr } from '@/lib/verifactu/estamparQr';
import { generarQrVerifactu, validarDatosQr, type DatosQrVerifactu } from '@/lib/verifactu/qr';
import {
  componerBloqueQr, validarBloqueQr,
  type Hoja, type LeyendaQr, type PosicionQr,
} from '@/lib/verifactu/qrFactura';

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

/**
 * EL QR TRIBUTARIO, VISTO DESDE QUIEN PIDE EL PDF
 *
 * Quien descarga una factura no coloca el QR ni decide cómo se presenta: sólo
 * dice de qué factura es y si esa factura tiene que llevarlo. Todo lo demás
 * —tamaño, sitio, rótulo, leyenda y comprobaciones— sale de `qrFactura.ts` y
 * de la plantilla, que es donde debe estar.
 */
export interface OpcionesQrFactura {
  /** Los cuatro datos que la AEAT exige codificar. */
  datos: DatosQrVerifactu;
  /**
   * `true` en una factura o rectificativa ya emitida: si el QR no se puede
   * generar, el PDF no sale y se explica por qué. `false` en un albarán, un
   * presupuesto o un borrador, que no llevan QR y no deben fallar por eso.
   */
  exigido: boolean;
  /** Lado en mm. Se acota a [30, 40]; por defecto 35. */
  tamanoMm?: number;
  /** Sólo se usa cuando la plantilla no dice dónde quiere el QR. */
  posicion?: PosicionQr;
  margenMm?: number;
  /** Cuál de las dos frases del art. 20.1.b se imprime. Por defecto la larga. */
  leyenda?: LeyendaQr;
}

export interface OpcionesPdf {
  /** Título del documento dentro de las propiedades del PDF. */
  titulo?: string;
  autor?: string;
  /** Sin esto no se estampa ningún QR: es el caso de los documentos no fiscales. */
  qr?: OpcionesQrFactura;
}

/** Los nombres que puede tener el hueco del QR y su leyenda dentro de la plantilla. */
const ES_QR = /^verifactu_qr(_\d+)?$/;
const ES_LEYENDA = /^verifactu_leyenda(_\d+)?$/;

/** Tamaño de la hoja de la plantilla, con el A4 vertical como red de seguridad. */
function hojaDePlantilla(plantilla: Template): Hoja {
  const base = (plantilla.basePdf ?? {}) as { width?: number; height?: number };
  return {
    ancho: typeof base.width === 'number' && base.width > 0 ? base.width : 210,
    alto: typeof base.height === 'number' && base.height > 0 ? base.height : 297,
  };
}

/** Todos los esquemas de la plantilla, estén en la página o anclados. */
function esquemasDe(plantilla: Template): Schema[] {
  const base = plantilla.basePdf;
  const estaticos = (base && typeof base === 'object' && 'staticSchema' in base)
    ? ((base as { staticSchema?: Schema[] }).staticSchema || [])
    : [];
  return [...(plantilla.schemas || []).flat(), ...estaticos];
}

/**
 * Dónde quiere la plantilla que vaya el QR.
 *
 * Es lo único que decide la plantilla: la esquina. El tamaño se acota
 * siempre, y el rótulo y la leyenda los coloca el bloque a su alrededor. Una
 * plantilla calcada de un PDF antiguo, que no tiene hueco ninguno, devuelve
 * `null` y entonces manda la posición que dice la especificación.
 */
function anclaQrDePlantilla(plantilla: Template): { x: number; y: number } | null {
  const hueco = esquemasDe(plantilla).find(e => typeof e?.name === 'string' && ES_QR.test(e.name));
  if (!hueco) return null;
  const posicion = (hueco as unknown as { position?: { x?: number; y?: number } }).position;
  if (!posicion || typeof posicion.x !== 'number' || typeof posicion.y !== 'number') return null;
  return { x: posicion.x, y: posicion.y };
}

/**
 * Saca de la plantilla el hueco del QR y el de la leyenda.
 *
 * Los pinta el estampado, no pdfme, y por dos motivos que no son de gusto:
 * el `staticSchema` se repite en todas las hojas —y el QR va sólo en la
 * primera— y ahí el código quedaría por debajo de lo que hubiera encima. Si
 * se dejaran, además, saldrían dos veces.
 */
function quitarHuecosDelQr(plantilla: Template): void {
  const sobra = (e: Schema) => typeof e?.name === 'string' && (ES_QR.test(e.name) || ES_LEYENDA.test(e.name));

  if (Array.isArray(plantilla.schemas)) {
    plantilla.schemas = plantilla.schemas.map(pagina => pagina.filter(e => !sobra(e)));
  }
  const base = plantilla.basePdf;
  if (base && typeof base === 'object' && 'staticSchema' in base) {
    const conHueco = base as { staticSchema?: Schema[] };
    conHueco.staticSchema = (conHueco.staticSchema || []).filter(e => !sobra(e));
  }
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

/**
 * TODO LO QUE SE COMPRUEBA ANTES DE COMPONER NADA
 *
 * Una factura Veri*Factu sin QR válido no es una factura: es papel. Así que
 * las comprobaciones van ANTES de generar, no después, y cuando el documento
 * es de los que obligan (`exigido`) el PDF no llega a existir. El mensaje
 * dice qué falta con nombre y apellidos, porque «error al generar el PDF» no
 * le sirve a nadie para arreglarlo.
 */
function prepararQr(plantilla: Template, opciones: OpcionesQrFactura) {
  const hoja = hojaDePlantilla(plantilla);
  const bloque = componerBloqueQr({
    hoja,
    tamanoMm: opciones.tamanoMm,
    posicion: opciones.posicion,
    margenMm: opciones.margenMm,
    leyenda: opciones.leyenda,
    ancla: anclaQrDePlantilla(plantilla) ?? undefined,
  });

  const problemas = [
    ...validarDatosQr(opciones.datos),
    ...validarBloqueQr(bloque, hoja),
  ];

  return { bloque, problemas };
}

/** El aviso que ve el usuario cuando la factura no puede llevar su QR. */
function errorDeQr(problemas: string[]): ErrorGeneracion {
  const detalle = problemas.length === 1
    ? problemas[0]
    : problemas.map(p => `\n  · ${p}`).join('');
  return new ErrorGeneracion(
    `No se puede generar la factura VERI*FACTU: el QR tributario no puede generarse porque ${detalle}`,
  );
}

export async function generarPdf(
  plantillaBruta: Template,
  datos: DatosDocumento,
  opciones: OpcionesPdf = {},
): Promise<Uint8Array> {
  const plantilla = normalizarPlantilla(plantillaBruta);

  // El bloque se resuelve con la plantilla todavía entera, porque de ella
  // sale la esquina donde el usuario quiere el QR; el hueco se quita justo
  // después, ya con la posición leída.
  let bloqueQr = null as ReturnType<typeof prepararQr>['bloque'] | null;
  let imagenQr = '';
  if (opciones.qr) {
    const { bloque, problemas } = prepararQr(plantilla, opciones.qr);
    if (problemas.length > 0) {
      if (opciones.qr.exigido) throw errorDeQr(problemas);
    } else {
      imagenQr = await generarQrVerifactu(opciones.qr.datos);
      if (imagenQr) bloqueQr = bloque;
      else if (opciones.qr.exigido) throw errorDeQr(['no se ha podido dibujar el código']);
    }
  }
  quitarHuecosDelQr(plantilla);

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
  // El desglose del pie se expande AQUÍ y no al montar la plantilla, porque
  // cuántos renglones lleva lo dice la factura que se está imprimiendo, no el
  // impreso: la misma plantilla saca hoy una factura de un tipo impositivo y
  // mañana otra de cuatro.
  materializarRejillas(plantilla, { impuestos: datos.impuestos, vencimientos: datos.vencimientos });
  await incrustarImagenes(plantilla, entrada);

  let bytes: Uint8Array;
  try {
    bytes = await generate({
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

  // El QR va lo último y sólo en la primera hoja: encima de todo, con su
  // espacio en blanco alrededor y sin repetirse en las páginas siguientes.
  if (bloqueQr && imagenQr) {
    try {
      bytes = await estamparBloqueQr(bytes, {
        bloque: bloqueQr,
        imagenQr,
        titulo: opciones.titulo,
        autor: opciones.autor,
      });
    } catch (error) {
      const detalle = error instanceof Error ? error.message : String(error);
      throw new ErrorGeneracion(`No se ha podido estampar el QR tributario: ${detalle}`);
    }
  }

  return bytes;
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
