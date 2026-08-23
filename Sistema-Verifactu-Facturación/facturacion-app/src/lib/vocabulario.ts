/**
 * CÓMO LLAMA CADA OFICIO A LO QUE FACTURA
 *
 * Una línea de factura no se llama igual en un almacén de bebidas que en
 * la consulta de un psicólogo. En el primero es un producto que va en
 * cajas y se cuenta por bultos; en la segunda es una sesión, y preguntar
 * «¿cuántas unidades por caja?» en la ficha de una terapia no es que
 * sobre: es que confunde.
 *
 * El editor de líneas estaba escrito para el primer caso y sólo para él
 * —«Productos y conceptos», «U/C», «12 bultos · 288 unidades en total»—,
 * así que las otras treinta y una actividades que admite el programa
 * facturaban con las palabras de un mayorista.
 *
 * Aquí vive esa diferencia, y en un solo sitio: el editor, el albarán y
 * la ficha de la factura leen de aquí en vez de llevar cada uno sus
 * propias palabras escritas a mano.
 *
 * VA POR GRUPO, NO POR SECTOR
 *
 * Los treinta y seis sectores ya están agrupados en seis familias
 * (comercio, salud, profesional, técnico, oficio, público) y esa
 * agrupación es justo la que manda aquí: lo que separa a un fontanero de
 * un dentista a efectos de vocabulario es la familia, no el sector. Sólo
 * se listan aparte los sectores en los que el grupo se queda corto.
 */

import type { BusinessSector, GrupoSector } from './types';
import { BUSINESS_SECTORS } from './constants';

export interface VocabularioDocumento {
  /** Título del bloque de líneas en el formulario. */
  titulo: string;
  /** Lo que se añade al pulsar el botón: «Añadir producto», «Añadir sesión». */
  linea: string;
  /** Cabecera de la columna de cantidad. */
  cantidad: string;
  /**
   * Si en este oficio se agrupa la mercancía en bultos.
   *
   * En falso desaparecen el campo de unidades por bulto y el recuento del
   * pie: un abogado no minuta por cajas, y dejarle el campo puesto sólo
   * le hace preguntarse si tiene que rellenarlo.
   */
  usaBultos: boolean;
  /** Etiqueta corta del campo de unidades por bulto («U/C» = unidades por caja). */
  bultoCorto: string;
  /** Cómo se llama el contenedor, en singular y plural. */
  bulto: readonly [string, string];
  /** Lo que va dentro del contenedor, en singular y plural. */
  contenido: readonly [string, string];
}

const COMERCIO: VocabularioDocumento = {
  titulo: 'Productos y conceptos',
  linea: 'producto',
  cantidad: 'Cantidad',
  usaBultos: true,
  bultoCorto: 'U/C',
  bulto: ['bulto', 'bultos'],
  contenido: ['unidad', 'unidades'],
};

const SALUD: VocabularioDocumento = {
  titulo: 'Servicios prestados',
  linea: 'servicio',
  cantidad: 'Sesiones',
  usaBultos: false,
  bultoCorto: '',
  bulto: ['sesión', 'sesiones'],
  contenido: ['sesión', 'sesiones'],
};

const PROFESIONAL: VocabularioDocumento = {
  titulo: 'Conceptos de la minuta',
  linea: 'concepto',
  cantidad: 'Cantidad',
  usaBultos: false,
  bultoCorto: '',
  bulto: ['concepto', 'conceptos'],
  contenido: ['concepto', 'conceptos'],
};

const TECNICO: VocabularioDocumento = {
  titulo: 'Trabajos y servicios',
  linea: 'trabajo',
  cantidad: 'Cantidad',
  usaBultos: false,
  bultoCorto: '',
  bulto: ['trabajo', 'trabajos'],
  contenido: ['trabajo', 'trabajos'],
};

const OFICIO: VocabularioDocumento = {
  // Un electricista factura mano de obra Y material en la misma hoja, así
  // que el título tiene que dar cabida a las dos cosas.
  titulo: 'Mano de obra y materiales',
  linea: 'partida',
  cantidad: 'Cantidad',
  usaBultos: false,
  bultoCorto: '',
  bulto: ['partida', 'partidas'],
  contenido: ['partida', 'partidas'],
};

const PUBLICO: VocabularioDocumento = {
  titulo: 'Servicios y productos',
  linea: 'servicio',
  cantidad: 'Cantidad',
  usaBultos: false,
  bultoCorto: '',
  bulto: ['servicio', 'servicios'],
  contenido: ['servicio', 'servicios'],
};

const POR_GRUPO: Record<GrupoSector, VocabularioDocumento> = {
  comercio: COMERCIO,
  salud: SALUD,
  profesional: PROFESIONAL,
  tecnico: TECNICO,
  oficio: OFICIO,
  publico: PUBLICO,
};

/**
 * Los sectores en los que su grupo se queda corto.
 *
 * `transporte` está en «oficio» junto al fontanero y el electricista,
 * pero una empresa de reparto sí cuenta bultos —es literalmente lo que
 * descarga del camión y lo que se firma en el albarán—, así que hereda el
 * recuento del comercio aunque su grupo no lo use.
 */
const POR_SECTOR: Partial<Record<BusinessSector, VocabularioDocumento>> = {
  transporte: {
    ...COMERCIO,
    titulo: 'Portes y bultos',
    linea: 'porte',
  },
};

/** El grupo al que pertenece un sector. */
function grupoDe(sector: BusinessSector | undefined): GrupoSector {
  return BUSINESS_SECTORS.find(s => s.value === sector)?.grupo ?? 'comercio';
}

/**
 * Las palabras que le tocan a este negocio.
 *
 * Sin sector configurado devuelve las del comercio, que es de donde viene
 * el programa y con lo que ya facturaba todo el mundo hasta ahora: quien
 * no haya elegido oficio no ve cambiar nada de un día para otro.
 */
export function vocabularioDe(sector: BusinessSector | undefined): VocabularioDocumento {
  return (sector && POR_SECTOR[sector]) ?? POR_GRUPO[grupoDe(sector)];
}

/** «1 bulto» / «12 bultos», con la palabra que le toca a este oficio. */
export function conPlural(cantidad: number, [singular, plural]: readonly [string, string]): string {
  return `${cantidad} ${cantidad === 1 ? singular : plural}`;
}
