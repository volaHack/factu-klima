/**
 * UNA FACTURA HECHA DESDE CERO, SIN SUBIR NINGÚN PDF
 *
 * El resto del sistema parte de un PDF de muestra: se lee, se detecta qué es
 * dato y se calca el diseño. Eso sirve a quien ya tiene un impreso —un
 * talonario, la factura que le hizo su gestor—, pero deja fuera a quien
 * empieza de cero y no tiene ningún papel del que partir.
 *
 * Aquí se monta esa factura: papel en blanco y encima, ya colocado, todo lo
 * que lleva una factura española completa. No es un lienzo vacío a propósito.
 * Un lienzo vacío obliga a colocar treinta recuadros a mano antes de ver
 * nada, y nadie pasa de ahí. Saliendo de una factura entera y bien puesta, lo
 * que queda es mover lo que no guste, que es un trabajo que sí se hace.
 *
 * POR QUÉ EL PAPEL ES BLANCO Y NO UN DISEÑO BONITO
 * ------------------------------------------------
 * Lo que se genera tiene que poder imprimirse tal cual y ser una factura
 * válida. Un fondo con color, franjas o adornos se imprime en cada hoja y
 * gasta tinta que casi nadie quiere gastar; y el que sí quiera diseño puede
 * subir su PDF, que es justo para lo que está la otra puerta. Aquí lo que se
 * da es la estructura correcta: los datos obligatorios, en su sitio, con el
 * desglose de impuestos cuadrando.
 *
 * CADA OFICIO FACTURA LO SUYO
 * ---------------------------
 * Un fisioterapeuta cobra sesiones y bonos; un taller, mano de obra y
 * recambios contra una matrícula; un abogado, minutas con retención de IRPF.
 * Cambia lo que llevan las columnas de la tabla y los rótulos que hacen falta
 * al pie. Lo demás —quién factura, a quién, cuándo y cuánto— es igual en
 * todas, porque lo manda la ley y no el oficio.
 */

import type { BusinessSector, CompanySettings } from '../types';
import { campoPorClave } from './contrato';
import { campoNuevo, rejillaNueva } from './editor';
import type {
  AnalisisPdf, CampoDetectado, ColumnaDetectada, PaginaExtraida, TablaDetectada,
} from './tipos';

// ============================================================
// LOS OFICIOS
// ============================================================

export interface Oficio {
  id: string;
  nombre: string;
  /** Cómo titula este oficio lo que va en cada línea de la factura. */
  concepto: string;
  /** Qué mide: horas, sesiones, metros… Va en la columna de cantidad. */
  unidad: string;
  /**
   * Columnas propias del oficio, además de concepto, cantidad, precio e
   * importe. La matrícula de un taller o los metros de una reforma.
   *
   * Son de texto libre: el usuario las rellena a mano en cada línea.
   */
  columnas?: string[];
  /**
   * Columnas que el programa ya sabe rellenar solo, por su clave del
   * contrato: la referencia del artículo, las unidades por caja, las
   * unidades que salen de multiplicarlas.
   *
   * Sin esto, un distribuidor sólo podía pedir esas columnas como texto
   * libre y teclearlas él en cada línea, cuando el dato ya estaba en la
   * ficha del producto.
   */
  columnasFijas?: { clave: string; cabecera: string }[];
  /**
   * Rótulos que este oficio necesita al pie y los demás no: el número de
   * colegiado de un sanitario, la retención de un abogado, el aviso de
   * exención de IVA de quien hace actos médicos.
   */
  pie?: string[];
}

/**
 * Los oficios que se ofrecen al empezar.
 *
 * Ninguno es una jaula: todo lo que pone un oficio se puede cambiar después
 * en el editor, y quien no se vea en la lista tiene «Genérico», que es una
 * factura española normal y corriente.
 */
export const OFICIOS: Oficio[] = [
  { id: 'generico', nombre: 'Genérico', concepto: 'Concepto', unidad: 'Cantidad' },

  // --- Comercio y distribución ---
  //
  // Faltaban. Los treinta oficios de esta lista eran todos de servicios, así
  // que las cinco actividades de comercio que admite el programa —que son
  // con las que nació— sólo podían empezar por «Genérico»: una factura sin
  // referencia de artículo y, sobre todo, sin las unidades por caja. El
  // dato se metía en el formulario y no salía impreso en ninguna parte,
  // que es justo lo que hay que comprobar al descargar el camión.
  { id: 'distribucion', nombre: 'Distribución y mayorista', concepto: 'Artículo', unidad: 'Cajas',
    columnasFijas: [
      { clave: 'ref', cabecera: 'Ref.' },
      { clave: 'uds_caja', cabecera: 'U/C' },
      { clave: 'uds_linea', cabecera: 'Udes.' },
    ],
    pie: ['Nº de pedido:', 'Total de bultos:', 'Total de unidades:'] },
  { id: 'comercio', nombre: 'Comercio y tienda', concepto: 'Artículo', unidad: 'Cantidad',
    columnasFijas: [{ clave: 'ref', cabecera: 'Ref.' }] },
  { id: 'industrial', nombre: 'Suministros industriales y recambios', concepto: 'Artículo', unidad: 'Cantidad',
    columnasFijas: [{ clave: 'ref', cabecera: 'Ref.' }],
    pie: ['Nº de pedido:', 'Nº de albarán:'] },

  // --- Sanitarios ---
  // El IVA lo llevan a 0: la asistencia sanitaria a personas físicas está
  // exenta (art. 20.Uno.3º de la Ley del IVA), y una factura de fisioterapia
  // con el 21% puesto es una factura mal hecha.
  { id: 'psicologo', nombre: 'Psicología y psicoterapia', concepto: 'Sesión', unidad: 'Sesiones',
    columnas: ['Modalidad'], pie: ['Nº de colegiado:', 'Servicio exento de IVA (art. 20.Uno.3º LIVA)'] },
  { id: 'medico', nombre: 'Medicina y clínicas', concepto: 'Acto médico', unidad: 'Cantidad',
    columnas: ['Especialidad'],
    pie: ['Nº de colegiado:', 'Centro médico:', 'Servicio exento de IVA (art. 20.Uno.3º LIVA)'] },
  // El artículo nombra expresamente a los odontólogos, así que el aviso de
  // exención le corresponde igual que al médico o al fisioterapeuta. Le
  // faltaba: un dentista imprimía sus facturas sin él.
  { id: 'dentista', nombre: 'Odontología', concepto: 'Tratamiento', unidad: 'Cantidad',
    columnas: ['Pieza'], pie: ['Nº de colegiado:', 'Servicio exento de IVA (art. 20.Uno.3º LIVA)'] },
  { id: 'fisio', nombre: 'Fisioterapia', concepto: 'Sesión', unidad: 'Sesiones',
    columnas: ['Terapia'], pie: ['Nº de colegiado:', 'Servicio exento de IVA (art. 20.Uno.3º LIVA)'] },
  // Sin aviso de exención a propósito: la consulta de un dietista-nutricionista
  // titulado sí está exenta, pero un asesor nutricional sin esa titulación no
  // lo está, y los dos eligen este sector. Imprimir la exención por defecto
  // sería ponerle a la mitad una factura mal hecha; quien la tenga, la añade
  // en el editor en un minuto.
  { id: 'nutricion', nombre: 'Nutrición y dietética', concepto: 'Consulta', unidad: 'Cantidad',
    columnas: ['Plan'], pie: ['Nº de colegiado:'] },
  { id: 'veterinario', nombre: 'Veterinaria', concepto: 'Servicio', unidad: 'Cantidad',
    columnas: ['Nº historia'] },

  // --- Jurídicos ---
  // Con retención de IRPF: un profesional que factura a empresa la practica,
  // y sin la casilla puesta el importe a cobrar sale mal.
  { id: 'abogado', nombre: 'Abogacía', concepto: 'Actuación', unidad: 'Cantidad',
    columnas: ['Expediente'], pie: ['Nº de expediente:', 'Retención IRPF:', 'Suplidos:'] },
  { id: 'procurador', nombre: 'Procura', concepto: 'Derechos y honorarios', unidad: 'Cantidad',
    columnas: ['Autos'], pie: ['Juzgado:', 'Nº de autos:', 'Suplidos:'] },
  { id: 'asesoria', nombre: 'Asesoría y gestoría', concepto: 'Servicio', unidad: 'Cantidad',
    pie: ['Periodo facturado:', 'Retención IRPF:'] },
  { id: 'perito', nombre: 'Peritaje', concepto: 'Actuación pericial', unidad: 'Horas',
    columnas: ['Expediente'],
    pie: ['Nº de expediente:', 'Desplazamiento:', 'Retención IRPF:'] },
  { id: 'traductor', nombre: 'Traducción e interpretación', concepto: 'Traducción', unidad: 'Palabras',
    columnas: ['Idiomas'], pie: ['Plazo de entrega:', 'Urgencia:'] },

  // --- Técnicos ---
  { id: 'arquitecto', nombre: 'Arquitectura', concepto: 'Fase', unidad: 'Cantidad',
    columnas: ['m²'], pie: ['Nº de proyecto:', 'Ref. catastral:', 'Retención IRPF:'] },
  // Separado de arquitectura: comparten fases y m², pero lo que se discute y
  // se cobra aparte en interiorismo son las visitas, no la referencia
  // catastral.
  { id: 'interiorismo', nombre: 'Interiorismo y decoración', concepto: 'Fase', unidad: 'Cantidad',
    columnas: ['m²', 'Visitas'], pie: ['Nº de proyecto:', 'Retención IRPF:'] },
  { id: 'ingeniero', nombre: 'Ingeniería y consultoría técnica', concepto: 'Trabajo', unidad: 'Horas',
    pie: ['Nº de proyecto:', 'Retención IRPF:'] },
  { id: 'informatico', nombre: 'Informática y desarrollo', concepto: 'Trabajo', unidad: 'Horas',
    pie: ['Nº de proyecto:', 'Hosting y dominios:', 'Periodo de mantenimiento:', 'SLA:'] },

  // --- Creativos ---
  { id: 'disenador', nombre: 'Diseño y creatividad', concepto: 'Trabajo', unidad: 'Cantidad',
    pie: ['Nº de revisiones:', 'Derechos de uso:'] },
  { id: 'fotografo', nombre: 'Fotografía y vídeo', concepto: 'Servicio', unidad: 'Cantidad',
    columnas: ['Horas'], pie: ['Derechos de uso:', 'Entrega de material:'] },
  { id: 'marketing', nombre: 'Marketing y publicidad', concepto: 'Servicio', unidad: 'Cantidad',
    pie: ['Periodo del servicio:', 'Presupuesto publicitario:'] },
  { id: 'formador', nombre: 'Formación y coaching', concepto: 'Formación', unidad: 'Horas',
    columnas: ['Asistentes'], pie: ['Modalidad:', 'Periodo:'] },
  { id: 'profesor', nombre: 'Clases particulares', concepto: 'Clase', unidad: 'Horas',
    columnas: ['Asignatura'], pie: ['Periodo:', 'Bono:'] },
  // «Fotografía de eventos» caía en el genérico porque no tenía oficio: una
  // boda facturada con la factura de nadie, sin horas de cobertura ni fecha
  // del evento, que es lo primero que se mira en esa factura.
  { id: 'eventos', nombre: 'Fotografía de eventos', concepto: 'Servicio', unidad: 'Horas',
    columnas: ['Cobertura'], pie: ['Fecha del evento:', 'Lugar:', 'Álbum y edición:'] },

  // --- Oficios ---
  // Con columna de horas y casilla de desplazamiento: es lo que se discute
  // con el cliente y lo que hay que poder enseñar desglosado.
  { id: 'electricista', nombre: 'Electricidad', concepto: 'Concepto', unidad: 'Cantidad',
    columnas: ['Horas'], pie: ['Nº de instalación:', 'Desplazamiento:'] },
  { id: 'fontanero', nombre: 'Fontanería', concepto: 'Concepto', unidad: 'Cantidad',
    columnas: ['Horas'], pie: ['Desplazamiento:', 'Urgencia:'] },
  { id: 'reformas', nombre: 'Albañilería y reformas', concepto: 'Partida', unidad: 'Cantidad',
    columnas: ['m²'], pie: ['Nº de obra:', 'Anticipo:', 'Retención de garantía:'] },
  // Con las dos columnas, que es como se lee la factura de un taller: las
  // horas de mano de obra por un lado y la referencia del recambio por
  // otro. Con sólo la referencia, la mano de obra iba suelta en la
  // descripción y no había forma de ver cuánto se cobró de trabajo.
  { id: 'taller', nombre: 'Taller mecánico', concepto: 'Concepto', unidad: 'Cantidad',
    columnas: ['Horas', 'Referencia'],
    pie: ['Matrícula:', 'Marca y modelo:', 'Kilometraje:', 'Nº de bastidor:'] },
  { id: 'transporte', nombre: 'Transporte', concepto: 'Servicio', unidad: 'Cantidad',
    columnas: ['Km', 'Peso'], pie: ['Origen:', 'Destino:', 'Matrícula:', 'Nº de envío:'] },
  { id: 'limpieza', nombre: 'Limpieza', concepto: 'Servicio', unidad: 'Horas',
    columnas: ['m²'], pie: ['Periodo:', 'Frecuencia:'] },
  { id: 'peluqueria', nombre: 'Peluquería y barbería', concepto: 'Servicio', unidad: 'Cantidad',
    pie: ['Profesional:', 'Bono:'] },
  { id: 'estetica', nombre: 'Estética', concepto: 'Tratamiento', unidad: 'Sesiones',
    pie: ['Profesional:', 'Bono:'] },
  { id: 'inmobiliaria', nombre: 'Inmobiliaria', concepto: 'Concepto', unidad: 'Cantidad',
    pie: ['Inmueble:', 'Nº de inmueble:', '% de comisión:'] },
  { id: 'freelance', nombre: 'Autónomo y freelance', concepto: 'Servicio', unidad: 'Horas',
    pie: ['Periodo facturado:', 'Gastos y desplazamientos:', 'Retención IRPF:'] },
];

export const oficioPorId = (id: string): Oficio =>
  OFICIOS.find(o => o.id === id) ?? OFICIOS[0];

/**
 * Qué oficio de plantilla le toca al sector que tiene puesto la empresa.
 *
 * Sin esto, la lista de «¿A qué te dedicas?» eran treinta y tres botones
 * en fila y daba igual a qué se dedicara quien miraba: un psicólogo tenía
 * que encontrar el suyo entre todos, y si se equivocaba —o si se quedaba
 * con el primero— acababa con una factura de distribuidor, con su columna
 * de cajas, pidiéndole el formato de cada sesión de terapia.
 *
 * Los 36 están cubiertos, sin ninguno cayendo en el genérico por descuido:
 * el genérico es el último recurso para quien no ha elegido sector todavía,
 * no un cajón para los que se nos olvidaron.
 */
const OFICIO_POR_SECTOR: Record<BusinessSector, string> = {
  supermercado: 'comercio',
  alimentacion: 'distribucion',
  mayorista: 'distribucion',
  bebidas: 'distribucion',
  servicios_industriales: 'industrial',

  psicologia: 'psicologo',
  medicina: 'medico',
  dental: 'dentista',
  fisioterapia: 'fisio',
  nutricion: 'nutricion',
  veterinaria: 'veterinario',

  abogacia: 'abogado',
  procuraduria: 'procurador',
  asesoria: 'asesoria',
  peritaje: 'perito',
  traduccion: 'traductor',

  arquitectura: 'arquitecto',
  interiorismo: 'interiorismo',
  ingenieria: 'ingeniero',
  informatica: 'informatico',
  diseno: 'disenador',
  fotografia: 'fotografo',
  marketing: 'marketing',
  formacion: 'formador',
  clases: 'profesor',
  freelance: 'freelance',

  electricidad: 'electricista',
  fontaneria: 'fontanero',
  reformas: 'reformas',
  taller: 'taller',
  limpieza: 'limpieza',
  transporte: 'transporte',

  peluqueria: 'peluqueria',
  estetica: 'estetica',
  eventos: 'eventos',
  inmobiliaria: 'inmobiliaria',
};

/** El oficio que le corresponde a este sector, o el genérico si no hay sector. */
export function oficioParaSector(sector: BusinessSector | undefined): Oficio {
  return oficioPorId(sector ? OFICIO_POR_SECTOR[sector] ?? 'generico' : 'generico');
}

/**
 * ¿La plantilla que se está usando es de otro gremio?
 *
 * Devuelve el oficio con el que se montó cuando NO es el del sector de la
 * empresa; null cuando cuadra, cuando la plantilla salió de un PDF subido
 * (ahí el diseño lo pone el usuario y no hay nada que corregir) o cuando
 * todavía no se sabe a qué se dedica.
 *
 * Esto es lo que faltaba: un despacho de abogados podía estar facturando
 * con la plantilla de un distribuidor —columna de cajas incluida, pidiendo
 * el formato de cada minuta— y en ninguna pantalla se decía nada.
 */
export function plantillaDeOtroOficio(
  oficioDeLaPlantilla: string | undefined,
  sector: BusinessSector | undefined,
): Oficio | null {
  if (!oficioDeLaPlantilla || !sector) return null;
  const suyo = oficioParaSector(sector);
  if (oficioDeLaPlantilla === suyo.id) return null;
  // El genérico es una factura española normal y corriente: sirve para
  // cualquiera y no es un error que alguien la use a propósito.
  if (oficioDeLaPlantilla === 'generico') return null;
  return oficioPorId(oficioDeLaPlantilla);
}

// ============================================================
// LA HOJA
// ============================================================

const ANCHO = 210;
const ALTO = 297;
const MARGEN = 15;

/**
 * Papel en blanco de A4.
 *
 * Un píxel blanco estirado a toda la hoja: pesa nada, se guarda con la
 * plantilla como cualquier otro calco y el resto del sistema —el borrado, el
 * editor, la generación— no tiene que saber que esta plantilla no salió de
 * ningún PDF.
 */
const PAPEL_EN_BLANCO =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function hojaEnBlanco(): PaginaExtraida {
  return {
    ancho: ANCHO,
    alto: ALTO,
    items: [],
    lineas: [],
    totalPaginas: 1,
    bitmap: { dataUrl: PAPEL_EN_BLANCO, anchoPx: 794, altoPx: 1123, pxPorMm: 3.78 },
  };
}

// ============================================================
// LO QUE SE COLOCA ENCIMA
// ============================================================

let contador = 0;
const id = () => `cero-${++contador}`;

interface Puesto {
  clave?: string;
  texto?: string;
  x: number;
  y: number;
  ancho: number;
  tamano?: number;
  negrita?: boolean;
  derecha?: boolean;
}

function colocar(p: Puesto): CampoDetectado {
  const tamano = p.tamano ?? 9;
  const campo = campoNuevo(
    id(),
    { x: p.x, y: p.y, ancho: p.ancho, alto: Math.max(4, tamano * 0.42) },
    { fijo: p.texto !== undefined },
  );
  campo.clave = p.clave ?? null;
  campo.texto = p.texto;
  campo.tamano = tamano;
  campo.negrita = p.negrita ?? false;
  campo.alineacion = p.derecha ? 'right' : 'left';
  campo.motivo = p.texto !== undefined ? 'Rótulo de la plantilla' : 'Colocado al empezar desde cero';
  return campo;
}

/** Un rótulo con su dato debajo, que es como se lee una factura. */
function rotuloConDato(
  rotulo: string, clave: string, x: number, y: number, ancho: number,
  opciones: { tamano?: number; negrita?: boolean } = {},
): CampoDetectado[] {
  return [
    colocar({ texto: rotulo, x, y, ancho, tamano: 7 }),
    colocar({ clave, x, y: y + 3.6, ancho, tamano: opciones.tamano ?? 9, negrita: opciones.negrita }),
  ];
}

// ============================================================
// LA TABLA DE LÍNEAS
// ============================================================

const Y_TABLA = 108;
const ALTO_FILA = 7;

function tablaDelOficio(oficio: Oficio): TablaDetectada {
  // Concepto manda: es lo que el cliente lee. Las columnas del oficio van
  // entre el concepto y los importes, que son los que cierran a la derecha.
  const propias = oficio.columnas ?? [];
  const fijas = oficio.columnasFijas ?? [];
  const anchoUtil = ANCHO - MARGEN * 2;

  // Los importes necesitan sitio fijo —«1.234,56 €» no cabe en menos— y lo
  // que sobre se lo queda el concepto, que es el que puede estirarse.
  const anchoPropia = 20;
  // Las del contrato llevan cifras cortas («24», «288», «REF-001»), así que
  // se apañan con menos sitio que una columna de texto libre.
  const anchoFija = 16;
  const anchoCantidad = 18;
  const anchoPrecio = 22;
  const anchoImporte = 24;
  const anchoConcepto = anchoUtil
    - propias.length * anchoPropia
    - fijas.length * anchoFija
    - anchoCantidad - anchoPrecio - anchoImporte;

  const columnas: ColumnaDetectada[] = [];
  let x = MARGEN;
  const meter = (clave: string, cabecera: string, ancho: number, numerica: boolean) => {
    columnas.push({
      clave, cabecera, x, ancho,
      alineacion: numerica ? 'right' : 'left',
      numerica,
    } as ColumnaDetectada);
    x += ancho;
  };

  // La referencia abre la fila —es por lo que se busca el artículo—; el
  // resto de columnas del contrato van detrás del concepto, junto a las
  // cifras con las que se leen.
  const [refs, resto] = [fijas.filter(c => c.clave === 'ref'), fijas.filter(c => c.clave !== 'ref')];
  refs.forEach(c => meter(c.clave, c.cabecera, anchoFija, false));
  meter('descripcion', oficio.concepto, anchoConcepto, false);
  propias.forEach((nombre, i) => meter(`custom_col_${i + 1}`, nombre, anchoPropia, false));
  resto.forEach(c => meter(c.clave, c.cabecera, anchoFija, true));
  meter('cantidad', oficio.unidad, anchoCantidad, true);
  meter('precio', 'Precio', anchoPrecio, true);
  meter('importe', 'Importe', anchoImporte, true);

  return {
    x: MARGEN,
    y: Y_TABLA,
    ancho: anchoUtil,
    altoCabecera: 8,
    altoFila: ALTO_FILA,
    // Hasta donde empieza el pie: es el hueco del que dispone la tabla, y lo
    // que no quepa pasa a otra hoja.
    altoTotal: 8 + ALTO_FILA * 8,
    columnas,
    estilo: {
      cabeceraFondo: '#f2f2f2',
      cabeceraTexto: '#111111',
      cabeceraNegrita: true,
      cuerpoTexto: '#111111',
      bordeColor: '#c8c8c8',
      bordeAncho: 0.2,
      bordeFilas: 0.1,
      tamanoCabecera: 8,
      tamanoCuerpo: 9,
      relleno: [1.8, 2, 1.8, 2],
      filaAlterna: '',
    },
    filasOriginales: 0,
  };
}

// ============================================================
// LA FACTURA ENTERA
// ============================================================

/**
 * Monta una factura completa sobre papel en blanco.
 *
 * Los ajustes de la empresa entran como valor de arranque donde los hay, para
 * que lo que se ve en el editor sea ya la factura de quien la está haciendo y
 * no un ejemplo con datos de nadie.
 */
export function facturaDesdeCero(oficioId: string, ajustes?: CompanySettings | null): AnalisisPdf {
  const oficio = oficioPorId(oficioId);
  const campos: CampoDetectado[] = [];
  const derecha = ANCHO - MARGEN;
  const media = ANCHO / 2;

  // --- Quién factura, arriba a la izquierda ---
  campos.push(colocar({ clave: 'empresa_nombre', x: MARGEN, y: 18, ancho: 90, tamano: 13, negrita: true }));
  campos.push(colocar({ clave: 'empresa_nif', x: MARGEN, y: 25, ancho: 90, tamano: 9 }));
  campos.push(colocar({ clave: 'empresa_direccion', x: MARGEN, y: 29.5, ancho: 90, tamano: 9 }));
  campos.push(colocar({ clave: 'empresa_poblacion', x: MARGEN, y: 34, ancho: 90, tamano: 9 }));
  campos.push(colocar({ clave: 'empresa_telefono', x: MARGEN, y: 38.5, ancho: 90, tamano: 9 }));
  campos.push(colocar({ clave: 'empresa_email', x: MARGEN, y: 43, ancho: 90, tamano: 9 }));
  // El logotipo, arriba a la derecha y vacío mientras no haya ninguno subido.
  const logo = campoNuevo(id(), { x: derecha - 38, y: 16, ancho: 38, alto: 18 });
  logo.clave = 'empresa_logo';
  logo.tipo = 'imagen';
  logo.motivo = 'Colocado al empezar desde cero';
  campos.push(logo);

  // --- Qué documento es y de cuándo ---
  campos.push(colocar({ clave: 'doc_tipo', x: derecha - 80, y: 40, ancho: 80, tamano: 17, negrita: true, derecha: true }));
  campos.push(...rotuloConDato('NÚMERO', 'doc_numero', derecha - 80, 50, 38, { negrita: true }));
  campos.push(...rotuloConDato('FECHA', 'doc_fecha', derecha - 38, 50, 38));
  campos.push(...rotuloConDato('VENCIMIENTO', 'doc_vencimiento', derecha - 38, 60, 38));

  // --- A quién se la hacemos ---
  campos.push(colocar({ texto: 'FACTURAR A', x: MARGEN, y: 58, ancho: 80, tamano: 7 }));
  campos.push(colocar({ clave: 'cliente_nombre', x: MARGEN, y: 62, ancho: 88, tamano: 11, negrita: true }));
  campos.push(colocar({ clave: 'cliente_nif', x: MARGEN, y: 68.5, ancho: 88, tamano: 9 }));
  campos.push(colocar({ clave: 'cliente_direccion', x: MARGEN, y: 73, ancho: 88, tamano: 9 }));
  campos.push(colocar({ clave: 'cliente_poblacion', x: MARGEN, y: 77.5, ancho: 88, tamano: 9 }));

  // --- Lo que el oficio necesita y los demás no ---
  let yPie = 88;
  for (const rotulo of oficio.pie ?? []) {
    campos.push(colocar({ texto: rotulo, x: MARGEN, y: yPie, ancho: 88, tamano: 8 }));
    yPie += 4.5;
  }

  // --- Los totales, al pie y a la derecha, que es donde se buscan ---
  const yTotales = 196;
  const anchoRotulo = 34;
  const xRotulo = derecha - 74;
  const linea = (rotulo: string, clave: string, y: number, grande = false) => {
    campos.push(colocar({ texto: rotulo, x: xRotulo, y, ancho: anchoRotulo, tamano: grande ? 11 : 9, negrita: grande }));
    campos.push(colocar({ clave, x: derecha - 40, y, ancho: 40, tamano: grande ? 13 : 9, negrita: grande, derecha: true }));
  };
  linea('Base imponible', 'total_base', yTotales);
  linea('Impuestos', 'total_impuestos', yTotales + 6);
  linea('TOTAL', 'total_general', yTotales + 15, true);

  // --- El cuadro de desglose, con su contorno ---
  //
  // Debajo no hay recuadro impreso que valga, así que se lo dibuja él. Va a
  // la izquierda, enfrente de los totales, que es donde lo lleva casi
  // cualquier factura española.
  const rejilla = rejillaNueva('rejilla-desglose', { x: MARGEN, y: yTotales - 6, ancho: 88, alto: 30 }, 'sans');
  campos.push(colocar({ texto: 'DESGLOSE DE IMPUESTOS', x: MARGEN, y: yTotales - 10, ancho: 88, tamano: 7 }));

  // --- La relación de pagos ---
  //
  // Cuándo hay que pagar, cuánto y de qué manera. Va debajo del desglose
  // porque es lo que se mira después de saber el total, y con contorno propio
  // por lo mismo que el otro: debajo sólo hay papel.
  const pagos = rejillaNueva(
    'rejilla-pagos', { x: MARGEN, y: yTotales + 30, ancho: 118, alto: 22 }, 'sans', 'vencimientos',
  );
  campos.push(colocar({ texto: 'RELACIÓN DE PAGOS', x: MARGEN, y: yTotales + 26, ancho: 118, tamano: 7 }));

  // --- Forma de pago y sello Veri*Factu ---
  campos.push(...rotuloConDato('CUENTA', 'empresa_iban', MARGEN, 250, 88));
  campos.push(colocar({ clave: 'doc_notas', x: MARGEN, y: 262, ancho: 120, tamano: 8 }));

  const qr = campoNuevo(id(), { x: derecha - 24, y: 246, ancho: 24, alto: 24 });
  qr.clave = 'verifactu_qr';
  qr.tipo = 'imagen';
  qr.motivo = 'Colocado al empezar desde cero';
  campos.push(qr);
  campos.push(colocar({ clave: 'verifactu_leyenda', x: media - 20, y: 272, ancho: 90, tamano: 6, derecha: true }));

  // --- Con qué se ven llenos los recuadros en el editor ---
  //
  // Un campo sin valor sale como una caja vacía, y una factura entera de
  // cajas vacías no se puede revisar: no hay manera de saber si el nombre del
  // cliente cabe donde está puesto, ni si el total se sale de su sitio, hasta
  // que se emite la primera de verdad.
  //
  // Así que cada campo arranca con el ejemplo que el contrato tiene para su
  // clave. No se imprime nunca —al generar se sustituye por el dato de la
  // factura— pero deja ver la plantilla como se va a ver de verdad.
  for (const campo of campos) {
    if (!campo.clave || campo.valorOriginal) continue;
    campo.valorOriginal = campoPorClave(campo.clave)?.ejemplo ?? '';
  }

  // El valor de arranque sale de los ajustes de la empresa: así lo que se ve
  // en el editor es ya la factura de quien la está haciendo.
  if (ajustes) {
    const suyo: Record<string, string | undefined> = {
      empresa_nombre: ajustes.tradeName || ajustes.businessName,
      empresa_nif: ajustes.nif,
      empresa_direccion: ajustes.address,
      empresa_telefono: ajustes.phone,
      empresa_email: ajustes.email,
    };
    for (const campo of campos) {
      if (campo.clave && suyo[campo.clave]) campo.valorOriginal = suyo[campo.clave]!;
    }
  }

  return {
    pagina: hojaEnBlanco(),
    campos,
    tabla: tablaDelOficio(oficio),
    rejillas: [rejilla, pagos],
    avisos: [{
      nivel: 'info',
      texto: 'Factura nueva lista. Mueve lo que quieras y guárdala; todo lo obligatorio ya está puesto.',
    }],
    zonasExtra: [],
    familia: 'sans',
  };
}
