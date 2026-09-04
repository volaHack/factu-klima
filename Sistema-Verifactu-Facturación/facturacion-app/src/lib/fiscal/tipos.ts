/**
 * LISTADOS FISCALES — tipos comunes del motor
 *
 * Un modelo fiscal es siempre la misma secuencia: coger los datos reales
 * (facturas, gastos, clientes), CALCULAR, VALIDAR, enseñar una VISTA
 * PREVIA y sólo entonces GENERAR el fichero. El motor impone esa
 * secuencia para todos los modelos, y cada modelo pone lo suyo.
 *
 * Lo que NO hace este archivo: cálculos. Los cálculos van en el módulo de
 * cada modelo (`aeat/modelo347.ts`, `atc/modelo420.ts`, …) y son funciones
 * puras sobre los tipos del dominio, igual que `retenciones.ts` o
 * `intracomunitarias.ts`. Los componentes de React no calculan nada.
 */

/** Quién recauda. Determina el formato de fichero y dónde se presenta. */
export type Organismo = 'AEAT' | 'ATC';

export type ModeloId = '347' | '303' | '130' | '131' | '420' | '415' | '425';

/** Cada cuánto se presenta. */
export type Periodicidad = 'anual' | 'trimestral';

export type Trimestre = 1 | 2 | 3 | 4;

/** El período que se declara. `trimestre` sólo en los modelos trimestrales. */
export interface PeriodoFiscal {
  ejercicio: number;
  trimestre?: Trimestre;
}

/**
 * CÓMO SE PRESENTA CADA MODELO — y por qué esto es un tipo y no un detalle.
 *
 * El punto de partida del encargo era «generar el fichero» de los siete
 * modelos. Al ir a los diseños oficiales resulta que no todos tienen uno:
 *
 *  - `fichero_oficial`: el organismo publica un diseño de registro y
 *    cualquiera puede generar el fichero. Es el caso del 347.
 *  - `sede_o_programa`: no hay diseño de registro público para terceros;
 *    se presenta por formulario en la Sede o con el programa de ayuda del
 *    organismo. Aquí se calcula, se valida y se enseña la vista previa,
 *    y se exporta lo que sí se puede exportar — pero el fichero de
 *    presentación NO se inventa.
 *
 * Inventarse las posiciones de un fichero que se presenta ante Hacienda
 * es peor que no generarlo: el que lo presenta se lleva la sanción.
 */
export type ViaPresentacion = 'fichero_oficial' | 'sede_o_programa';

export interface DefinicionModelo {
  id: ModeloId;
  nombre: string;
  descripcion: string;
  organismo: Organismo;
  periodicidad: Periodicidad;
  via: ViaPresentacion;
  /** Extensión del fichero cuando `via === 'fichero_oficial'`. */
  extension?: string;
  /**
   * De dónde sale el diseño que implementa el generador. URL oficial del
   * organismo, nunca un blog. Se guarda aquí para que quien revise el
   * código pueda comprobarlo sin volver a buscarlo.
   */
  fuenteOficial: string;
  /** Qué queda pendiente o hace falta para que el modelo esté completo. */
  nota?: string;
}

/**
 * Los siete modelos del encargo.
 *
 * `via` y `fuenteOficial` salen de consultar las fuentes oficiales, no de
 * suponer. Ver docs/plans/2026-09-04-listados-fiscales-design.md para el
 * detalle de qué se comprobó en cada uno.
 */
export const MODELOS: DefinicionModelo[] = [
  {
    id: '347',
    nombre: 'Modelo 347',
    descripcion: 'Declaración anual de operaciones con terceras personas',
    organismo: 'AEAT',
    periodicidad: 'anual',
    via: 'fichero_oficial',
    extension: '347',
    fuenteOficial:
      'https://sede.agenciatributaria.gob.es/static_files/Sede/Disenyo_registro/DR_300_399/archivos/347.pdf',
    nota: 'Diseño vigente para el ejercicio 2025 y siguientes (Orden HAC/1431/2025).',
  },
  {
    id: '303',
    nombre: 'Modelo 303',
    descripcion: 'Autoliquidación trimestral del IVA',
    organismo: 'AEAT',
    periodicidad: 'trimestral',
    via: 'fichero_oficial',
    fuenteOficial:
      'https://sede.agenciatributaria.gob.es/Sede/ayuda/disenos-registro/modelos-300-399.html',
    nota: 'La AEAT publica diseño de registro (ejercicio 2026 y siguientes). Generador pendiente.',
  },
  {
    id: '130',
    nombre: 'Modelo 130',
    descripcion: 'Pago fraccionado del IRPF — estimación directa',
    organismo: 'AEAT',
    periodicidad: 'trimestral',
    via: 'sede_o_programa',
    fuenteOficial: 'https://sede.agenciatributaria.gob.es/Sede/ayuda/disenos-registro/modelos-100-199.html',
    nota: 'La AEAT no publica diseño de registro para el 130: se presenta por formulario en la Sede.',
  },
  {
    id: '131',
    nombre: 'Modelo 131',
    descripcion: 'Pago fraccionado del IRPF — estimación objetiva (módulos)',
    organismo: 'AEAT',
    periodicidad: 'trimestral',
    via: 'sede_o_programa',
    fuenteOficial: 'https://sede.agenciatributaria.gob.es/Sede/ayuda/disenos-registro/modelos-100-199.html',
    nota: 'Igual que el 130: presentación por formulario en la Sede.',
  },
  {
    id: '420',
    nombre: 'Modelo 420',
    descripcion: 'Autoliquidación trimestral del IGIC — régimen general',
    organismo: 'ATC',
    periodicidad: 'trimestral',
    via: 'sede_o_programa',
    fuenteOficial: 'https://sede.gobiernodecanarias.org/sede/tramites/4015',
    nota: 'La ATC no publica diseño de registro abierto: se presenta en su Sede o con su programa de ayuda.',
  },
  {
    id: '415',
    nombre: 'Modelo 415',
    descripcion: 'Declaración anual de operaciones con terceras personas (IGIC)',
    organismo: 'ATC',
    periodicidad: 'anual',
    via: 'sede_o_programa',
    fuenteOficial: 'https://sede.gobiernodecanarias.org/sede/tramites/4010',
    nota: 'El fichero .dec lo genera el programa de ayuda oficial de la ATC; su diseño no se publica como especificación abierta.',
  },
  {
    id: '425',
    nombre: 'Modelo 425',
    descripcion: 'Declaración resumen anual del IGIC',
    organismo: 'ATC',
    periodicidad: 'anual',
    via: 'sede_o_programa',
    fuenteOficial: 'https://www3.gobiernodecanarias.org/tributos/atc/',
    nota: 'Resumen de los cuatro 420 del ejercicio. Presentación por la Sede de la ATC.',
  },
];

export function getModelo(id: string): DefinicionModelo | undefined {
  return MODELOS.find(m => m.id === id);
}

/* ------------------------------------------------------------------ */
/* Validación                                                          */
/* ------------------------------------------------------------------ */

export type GravedadError = 'critico' | 'aviso';

/**
 * Un problema encontrado al validar.
 *
 * `referencia` es lo que permite que el usuario pulse el error y llegue a
 * la factura o al registro que lo causa, como pide el encargo: no basta
 * con decir «hay 3 errores».
 */
export interface ErrorValidacion {
  gravedad: GravedadError;
  mensaje: string;
  /** Qué campo o concepto falla, para agrupar. */
  campo?: string;
  referencia?: {
    tipo: 'factura' | 'gasto' | 'cliente' | 'empresa';
    id: string;
    /** Lo que se enseña al usuario: número de factura, nombre… */
    etiqueta: string;
  };
}

export interface ResultadoValidacion {
  valido: boolean;
  errores: ErrorValidacion[];
  avisos: ErrorValidacion[];
}

/** Un modelo no se puede generar si tiene errores críticos. */
export function puedeGenerar(v: ResultadoValidacion): boolean {
  return v.errores.length === 0;
}

/* ------------------------------------------------------------------ */
/* Historial                                                           */
/* ------------------------------------------------------------------ */

export interface GeneracionFiscal {
  id: string;
  modelo: ModeloId;
  ejercicio: number;
  trimestre?: Trimestre;
  generadoEn: string;
  generadoPor: string;
  numRegistros: number;
  resultado: number | null;
  estado: 'ok' | 'con_avisos';
  /** El fichero tal cual se generó, para poder volver a descargarlo. */
  contenido?: string;
  nombreFichero?: string;
}
