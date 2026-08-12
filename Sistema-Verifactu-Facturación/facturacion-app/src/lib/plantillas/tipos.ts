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

export interface AvisoAnalisis {
  nivel: 'info' | 'aviso' | 'error';
  texto: string;
}

export interface AnalisisPdf {
  pagina: PaginaExtraida;
  campos: CampoDetectado[];
  tabla: TablaDetectada | null;
  avisos: AvisoAnalisis[];
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

export interface PlantillaDocumento {
  id: string;
  nombre: string;
  /** Tipos de documento que puede imprimir esta plantilla. */
  aplicaA: TipoDocumentoPlantilla[];
  /** Plantilla pdfme lista para `generate()`. */
  plantilla: Template;
  diagnostico: DiagnosticoPlantilla;
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
