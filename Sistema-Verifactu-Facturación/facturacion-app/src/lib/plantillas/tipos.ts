/**
 * TIPOS DE LAS PLANTILLAS DE DOCUMENTO
 *
 * Vocabulario común entre el analizador de PDF (`extraccion.ts` +
 * `deteccion.ts`), el constructor de plantillas (`plantilla.ts`), el
 * almacén (`almacen.ts`) y la interfaz.
 *
 * Una unidad de medida para todo: **milímetros desde la esquina superior
 * izquierda de la página**. Es la de pdfme. El PDF original mide en puntos
 * desde abajo a la izquierda, así que la conversión se hace una sola vez, al
 * extraer, y a partir de ahí nadie más tiene que pensar en ello.
 */

import type { Template } from '@pdfme/common';

// ============================================================
// EXTRACCIÓN
// ============================================================

/** Un trozo de texto del PDF con su geometría y su estilo. */
export interface ItemTexto {
  texto: string;
  /** mm desde el borde izquierdo. */
  x: number;
  /** mm desde el borde superior, al alto de la línea base del texto. */
  y: number;
  ancho: number;
  alto: number;
  /** Tamaño de fuente en puntos. */
  tamano: number;
  /** Nombre bruto de la fuente tal cual viene en el PDF (p. ej. `g_d0_f2`). */
  fuente: string;
  negrita: boolean;
  cursiva: boolean;
  serif: boolean;
  monoespaciada: boolean;
  /** Color del texto en formato `#rrggbb`. */
  color: string;
}

/**
 * Varios items pegados entre sí a la misma altura: una frase suelta como
 * «Nº factura: FAC-2026-0001» o una celda de la tabla.
 */
export interface SegmentoTexto {
  items: ItemTexto[];
  texto: string;
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

/**
 * Todo lo que hay a una misma altura de la página, de margen a margen.
 *
 * Hacen falta los dos niveles. La fila completa es lo que permite reconocer
 * la tabla, porque sus columnas están muy separadas y aun así forman una
 * unidad. Los segmentos son lo que permite leer el resto de la página, donde
 * dos textos a la misma altura («Calle Mayor 1» a la izquierda y «Fecha:
 * 12/01/2026» a la derecha) no tienen nada que ver entre sí.
 */
export interface LineaTexto extends SegmentoTexto {
  segmentos: SegmentoTexto[];
}

/** Resultado de leer la primera página de un PDF subido. */
export interface PaginaExtraida {
  /** Ancho de página en mm. */
  ancho: number;
  /** Alto de página en mm. */
  alto: number;
  items: ItemTexto[];
  lineas: LineaTexto[];
  /** Número total de páginas del PDF original. */
  totalPaginas: number;
  /** Página pintada a mapa de bits, para calcar el estilo y previsualizar. */
  bitmap: {
    dataUrl: string;
    anchoPx: number;
    altoPx: number;
    /** Píxeles por mm del bitmap: convierte mm ↔ px sin recalcular escalas. */
    pxPorMm: number;
  };
}

// ============================================================
// DETECCIÓN
// ============================================================

export type Alineacion = 'left' | 'center' | 'right';

/**
 * Un texto del PDF que el detector considera un DATO (algo que cambia en
 * cada factura) y no una etiqueta fija del diseño.
 */
export interface CampoDetectado {
  /** Identificador estable dentro del análisis. */
  id: string;
  /** Clave del contrato a la que se asigna, o null si aún no se sabe. */
  clave: string | null;
  /** Texto o imagen (logo, QR). */
  tipo: 'texto' | 'imagen';
  /**
   * true = el usuario ha dicho que ese texto no es un dato sino parte del
   * diseño, así que se vuelve a imprimir siempre igual en vez de rellenarse
   * con el valor de cada factura.
   */
  fijo: boolean;
  /** Campos añadidos a mano en el revisor, para distinguirlos de los detectados. */
  manual?: boolean;
  /**
   * Texto literal a imprimir. Sólo lo usan los campos `fijo` añadidos a mano:
   * un rótulo nuevo que el diseño original no traía («Condiciones de entrega»,
   * un aviso propio…). Los campos fijos detectados no lo necesitan, porque su
   * texto sigue impreso en el calco.
   */
  texto?: string;
  /** El texto que traía el PDF de muestra en esa posición. */
  valorOriginal: string;
  /** La etiqueta impresa que hay al lado, si se encontró («Nº factura:»). */
  etiquetaCercana: string;
  x: number;
  y: number;
  ancho: number;
  alto: number;
  tamano: number;
  alineacion: Alineacion;
  color: string;
  negrita: boolean;
  cursiva: boolean;
  serif: boolean;
  /** Alto de línea detectado, en múltiplos del tamaño de fuente. */
  interlineado: number;
  /** 0 a 1. Por debajo de 0,6 la interfaz pide confirmación al usuario. */
  confianza: number;
  /** Por qué se decidió así. Se enseña al usuario en el revisor. */
  motivo: string;
}

export interface ColumnaDetectada {
  /** Clave de COLUMNAS_LINEAS, o null si la columna no se supo interpretar. */
  clave: string | null;
  /** Texto de cabecera tal cual venía en el PDF. */
  cabecera: string;
  x: number;
  ancho: number;
  alineacion: Alineacion;
}

export interface EstiloTabla {
  cabeceraFondo: string;
  cabeceraTexto: string;
  cabeceraNegrita: boolean;
  mostrarCabecera?: boolean;
  cuerpoFondo?: string;
  cuerpoTexto: string;
  bordeColor: string;
  bordeAncho: number;
  /** Bordes internos entre filas, en mm (0 = sin líneas). */
  bordeFilas: number;
  tamanoCabecera: number;
  tamanoCuerpo: number;
  /** Relleno interior de cada celda en mm: [arriba, derecha, abajo, izquierda]. */
  relleno: [number, number, number, number];
  filaAlterna: string;
}

export interface TablaDetectada {
  x: number;
  ancho: number;
  /** Y de la cabecera de la tabla (mm desde arriba). */
  y: number;
  /** Alto de la fila de cabecera. */
  altoCabecera: number;
  /** Alto medio de una fila del cuerpo. */
  altoFila: number;
  /** Alto total que ocupaba la tabla en el PDF de muestra (cabecera + filas). */
  altoTotal: number;
  columnas: ColumnaDetectada[];
  estilo: EstiloTabla;
  /** Cuántas filas de datos traía el PDF de muestra. */
  filasOriginales: number;
}

// ============================================================
// REJILLAS
// ============================================================

/** Una columna de una rejilla: dónde cae y qué dato imprime. */
export interface ColumnaRejilla {
  /** Clave de `COLUMNAS_IMPUESTOS`, o null mientras nadie haya dicho cuál es. */
  clave: string | null;
  /** Cómo la titula el impreso. Es lo que el usuario reconoce en el editor. */
  cabecera: string;
  /** Milímetros desde el borde izquierdo de la hoja. */
  x: number;
  ancho: number;
  alineacion: 'left' | 'center' | 'right';
}

/**
 * UN RECUADRO QUE SE RELLENA POR RENGLONES
 *
 * El cuadro de desglose que casi toda factura lleva al pie —«IMPUESTO / BASE
 * IMP. / % / CUOTA», o «BASE / IVA / RETENCIONES / TOTAL»— no es un puñado de
 * casillas sueltas: es una tabla, y cuántos renglones lleva depende de la
 * factura, no del impreso.
 *
 * Antes eran cuatro campos anclados por renglón, con el cuatro clavado en el
 * código. Una factura con cinco tipos no cabía, y un impreso con las columnas
 * puestas de otra manera no se reconocía.
 *
 * No puede ser una tabla de pdfme. En pdfme sólo crece lo que vive en
 * `schemas`, y ahí todo lo que va detrás de una tabla que crece se desplaza
 * hacia abajo (`processDynamicPage`: cada elemento arranca en `baseY +
 * totalYOffset`); además sólo hay una banda de contenido por hoja, así que no
 * hay manera de darle a dos tablas dos huecos independientes. Metida en el
 * flujo, esta rejilla se despegaría de su recuadro impreso en cuanto la
 * factura trajera unas cuantas líneas.
 *
 * Tampoco hace falta: los renglones se saben ANTES de generar, porque salen
 * del desglose de la propia factura. Así que la expandimos nosotros a
 * casillas ancladas, y crece hacia abajo dentro de su recuadro sin que nada
 * la empuje.
 */
export interface RejillaDetectada {
  id: string;
  /** Qué desglose imprime. Hoy sólo el de impuestos. */
  fuente: 'impuestos';
  /** El recuadro entero, tal y como está pintado en el papel. */
  x: number;
  y: number;
  ancho: number;
  alto: number;
  /** Dónde cae el primer renglón, ya por debajo de la cabecera impresa. */
  yPrimerRenglon: number;
  /** Lo que mide un renglón en el impreso de muestra. */
  altoRenglon: number;
  columnas: ColumnaRejilla[];
  /** Estilo del texto de los renglones, copiado del que traía la muestra. */
  tamano: number;
  negrita: boolean;
  cursiva: boolean;
  serif: boolean;
  color: string;
}

export interface AvisoAnalisis {
  nivel: 'info' | 'aviso' | 'error';
  texto: string;
}

/** Rectángulo en milímetros sobre la página. */
export interface Zona {
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

/**
 * Rectángulo que el usuario ha añadido a mano para tapar algo del diseño
 * original: un sello, una nota de la factura de muestra, un resto que la
 * detección no vio. Es la goma de borrar del editor.
 */
export interface ZonaBorrado extends Zona {
  id: string;
}

export interface AnalisisPdf {
  pagina: PaginaExtraida;
  campos: CampoDetectado[];
  tabla: TablaDetectada | null;
  /** Recuadros que se rellenan por renglones (el desglose de impuestos). */
  rejillas: RejillaDetectada[];
  avisos: AvisoAnalisis[];
  /** Zonas que el usuario ha decidido tapar además de las automáticas. */
  zonasExtra: ZonaBorrado[];
  /** Familia dominante del documento, para elegir la fuente del PDF final. */
  familia: 'sans' | 'serif';
}

// ============================================================
// PLANTILLA GUARDADA
// ============================================================

export type TipoDocumentoPlantilla = 'factura' | 'albaran';

export interface DiagnosticoPlantilla {
  avisos: AvisoAnalisis[];
  /** Confianza de la detección por cada campo, indexada por nombre. */
  confianza: Record<string, number>;
  /** Nombre del PDF del que salió la plantilla. */
  archivoOrigen: string;
}

/**
 * Todo lo necesario para volver a abrir una plantilla en el editor.
 *
 * La plantilla compilada no sirve para editar: en ella el diseño ya es un
 * calco con los datos borrados y los campos han perdido de dónde salieron.
 * Aquí se guarda el análisis tal cual quedó —el mapa de bits ORIGINAL, los
 * textos leídos, los campos, la tabla y las zonas tapadas— para que «Editar»
 * devuelva al usuario exactamente donde lo dejó, sin volver a subir el PDF.
 *
 * `lineas` no se guarda: se recalcula agrupando `items`, y guardarla
 * triplicaría el tamaño porque cada item aparecería además dentro de su
 * segmento y de su línea.
 */
export interface OrigenPlantilla {
  /** Versión del formato, para poder migrar sin romper lo ya guardado. */
  version: 1;
  pagina: Omit<PaginaExtraida, 'lineas'>;
  campos: CampoDetectado[];
  tabla: TablaDetectada | null;
  /** Ausente en las plantillas guardadas antes de que existieran. */
  rejillas?: RejillaDetectada[];
  zonasExtra: ZonaBorrado[];
  avisos: AvisoAnalisis[];
  familia: 'sans' | 'serif';
}

export interface PlantillaDocumento {
  id: string;
  nombre: string;
  /** Tipos de documento que puede imprimir esta plantilla. */
  aplicaA: TipoDocumentoPlantilla[];
  /** Plantilla pdfme lista para `generate()`. */
  plantilla: Template;
  diagnostico: DiagnosticoPlantilla;
  /**
   * Análisis del que salió, para poder reeditarla. Las plantillas guardadas
   * antes de que existiera esta pieza no lo tienen: se avisa al usuario y se
   * le ofrece volver a subir el PDF.
   */
  origen?: OrigenPlantilla | null;
  /** La plantilla que se usa por defecto al descargar un PDF. */
  predeterminada: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Miniatura y datos de cabecera para el listado, sin cargar la plantilla entera. */
export interface ResumenPlantilla {
  id: string;
  nombre: string;
  aplicaA: TipoDocumentoPlantilla[];
  predeterminada: boolean;
  updatedAt: string;
}
