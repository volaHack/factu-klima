/**
 * DEL ANÁLISIS A UNA PLANTILLA DE PDFME
 *
 * Convierte lo detectado en el PDF subido en una plantilla que pdfme sabe
 * imprimir con los datos de cualquier factura.
 *
 * LA DECISIÓN IMPORTANTE: EL FONDO ES UN CALCO
 * --------------------------------------------
 * El diseño original (logotipo, franjas de color, marcos, rótulos, pie
 * legal) se conserva como una imagen de la página con los datos de muestra
 * borrados. No se intenta reconstruir cada línea y cada recuadro como
 * elementos vectoriales.
 *
 * Es lo que hace que funcione «venga la factura como venga»: da igual que el
 * PDF traiga un degradado, una marca de agua, un logotipo vectorial o una
 * tipografía que no tenemos; el resultado es idéntico al original porque es
 * el original. Reconstruir el diseño elemento a elemento sería más elegante,
 * pero cada PDF raro produciría una factura distinta de la que el cliente
 * espera, y una factura mal presentada es un problema real para quien la
 * manda.
 *
 * POR QUÉ EL FONDO VA COMO PÁGINA EN BLANCO Y NO COMO PDF BASE
 * -----------------------------------------------------------
 * pdfme sólo sabe crear páginas nuevas (una factura con muchas líneas ocupa
 * varias) cuando el `basePdf` es una página en blanco. Si se le pasa el PDF
 * subido como base, el documento queda clavado a las páginas que tuviera ese
 * PDF y las líneas que sobran se pierden. Por eso el calco viaja como imagen
 * dentro de `staticSchema`: al ser estático se repite en todas las páginas,
 * y la tabla puede crecer y saltar de página con el membrete puesto.
 */

import type { Schema, Template } from '@pdfme/common';
import { COLUMNAS_LINEAS, esColumnaPersonalizada, TABLA_LINEAS } from './contrato';
import { columnasPorDefecto } from './deteccion';
import type {
  Alineacion,
  AnalisisPdf,
  CampoDetectado,
  DiagnosticoPlantilla,
  TablaDetectada,
} from './tipos';

/** Nombres con los que se registran las fuentes en el generador. */
export const FUENTES = {
  sans: 'sans',
  sansNegrita: 'sans-bold',
  sansCursiva: 'sans-italic',
  serif: 'serif',
  serifNegrita: 'serif-bold',
  serifCursiva: 'serif-italic',
} as const;

/** Margen inferior mínimo reservado al pie, en mm. */
const MARGEN_PIE_MINIMO = 12;

export interface ResultadoCompilacion {
  plantilla: Template;
  diagnostico: DiagnosticoPlantilla;
}

export interface OpcionesCompilacion {
  /** Calco de la página con los datos de muestra ya borrados. */
  fondo: string;
  archivoOrigen: string;
}

// ============================================================
// AYUDAS
// ============================================================

function nombreDeFuente(campo: { serif: boolean; negrita: boolean; cursiva: boolean }): string {
  if (campo.serif) {
    if (campo.negrita) return FUENTES.serifNegrita;
    if (campo.cursiva) return FUENTES.serifCursiva;
    return FUENTES.serif;
  }
  if (campo.negrita) return FUENTES.sansNegrita;
  if (campo.cursiva) return FUENTES.sansCursiva;
  return FUENTES.sans;
}

/** Nombre único y legible para cada campo dentro de la plantilla. */
function nombreDeCampo(campo: CampoDetectado, usados: Set<string>): string {
  const base = campo.clave ?? `texto_${campo.id}`;
  let nombre = base;
  let n = 2;
  while (usados.has(nombre)) nombre = `${base}_${n++}`;
  usados.add(nombre);
  return nombre;
}

/**
 * Un valor real puede ser más largo que el del PDF de muestra: «Bar Paco» en
 * la muestra y «Comercial Hermanos Rodríguez e Hijos S.L.» en la factura de
 * verdad. La caja se estira hasta lo que haya al lado para que quepa, en la
 * dirección que marque su alineación.
 */
function estirarCaja(
  campo: CampoDetectado,
  vecinos: { x: number; y: number; ancho: number; alto: number }[],
  anchoPagina: number,
): { x: number; ancho: number } {
  const HOLGURA = 2;
  const solapaEnVertical = (otro: { y: number; alto: number }) =>
    otro.y < campo.y + campo.alto - 0.4 && otro.y + otro.alto > campo.y + 0.4;

  if (campo.alineacion === 'right') {
    const derechaFija = campo.x + campo.ancho;
    const topeIzquierdo = vecinos
      .filter(v => solapaEnVertical(v) && v.x + v.ancho <= campo.x + 0.5)
      .reduce((max, v) => Math.max(max, v.x + v.ancho), 0);
    const x = Math.min(campo.x, topeIzquierdo + HOLGURA);
    return { x: Math.max(0, x), ancho: Math.max(campo.ancho, derechaFija - Math.max(0, x)) };
  }

  const topeDerecho = vecinos
    .filter(v => solapaEnVertical(v) && v.x >= campo.x + campo.ancho - 0.5)
    .reduce((min, v) => Math.min(min, v.x), anchoPagina);
  const ancho = Math.max(campo.ancho, Math.min(topeDerecho - HOLGURA, anchoPagina - 4) - campo.x);
  return { x: campo.x, ancho: Math.max(campo.ancho, ancho) };
}

/**
 * Decide la alineación de cada campo. Los importes de una factura se alinean
 * a la derecha y comparten borde; cuando dos o más campos acaban en la misma
 * vertical es que están alineados a la derecha aunque su texto sea corto.
 */
export function decidirAlineaciones(campos: CampoDetectado[], anchoPagina: number): void {
  const porBordeDerecho = new Map<number, CampoDetectado[]>();
  for (const campo of campos) {
    const borde = Math.round((campo.x + campo.ancho) * 2) / 2;
    const grupo = porBordeDerecho.get(borde) ?? [];
    grupo.push(campo);
    porBordeDerecho.set(borde, grupo);
  }

  for (const [, grupo] of porBordeDerecho) {
    if (grupo.length < 2) continue;
    // Varios campos con el mismo borde derecho y distinto borde izquierdo:
    // es una columna de importes, no una coincidencia.
    const izquierdas = new Set(grupo.map(c => Math.round(c.x)));
    if (izquierdas.size < 2) continue;
    for (const campo of grupo) campo.alineacion = 'right';
  }

  // Un importe pegado al margen derecho está alineado a la derecha aunque
  // sea el único de su altura.
  for (const campo of campos) {
    if (campo.alineacion !== 'left') continue;
    const enElMargen = campo.x + campo.ancho > anchoPagina * 0.72;
    const esImporte = /€|\d,\d{2}$/.test(campo.valorOriginal.trim());
    if (enElMargen && esImporte) campo.alineacion = 'right';
  }
}

// ============================================================
// CAMPOS DE TEXTO
// ============================================================

function esquemaDeTexto(campo: CampoDetectado, nombre: string, caja: { x: number; ancho: number }): Schema {
  const multilinea = campo.interlineado > 1.05 || /\n/.test(campo.valorOriginal) || campo.alto > campo.tamano * 0.6;
  const tamanoMm = campo.tamano * 0.3528;

  const esquema: Record<string, unknown> = {
    name: nombre,
    type: 'text',
    // Vacío a propósito: el valor llega al generar. Si aquí quedara el texto
    // del PDF de muestra, una factura sin ese dato saldría con el del PDF
    // original — el nombre del cliente de la muestra en la factura de otro.
    content: '',
    position: { x: redondear(caja.x), y: redondear(campo.y) },
    width: redondear(caja.ancho),
    height: redondear(Math.max(campo.alto, tamanoMm * 1.2)),
    fontName: nombreDeFuente(campo),
    fontSize: redondear(campo.tamano),
    fontColor: campo.color,
    backgroundColor: '',
    alignment: campo.alineacion,
    verticalAlignment: 'top',
    lineHeight: redondear(Math.max(1, campo.interlineado)),
    characterSpacing: 0,
  };

  if (!multilinea) {
    // Un nombre largo se encoge hasta caber en vez de desbordarse sobre el
    // campo de al lado. Es la diferencia entre una factura correcta y una
    // con el nombre del cliente pisando el NIF.
    esquema.dynamicFontSize = {
      min: redondear(Math.max(5, campo.tamano * 0.62)),
      max: redondear(campo.tamano),
      fit: 'horizontal',
    };
  } else {
    esquema.overflow = 'expand';
  }

  return esquema as unknown as Schema;
}

function esquemaDeImagen(campo: CampoDetectado, nombre: string): Schema {
  return {
    name: nombre,
    type: 'image',
    content: '',
    position: { x: redondear(campo.x), y: redondear(campo.y) },
    width: redondear(campo.ancho),
    height: redondear(campo.alto),
  } as unknown as Schema;
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

// ============================================================
// TABLA
// ============================================================

function alturaMinimaCabecera(tabla: TablaDetectada): number {
  const relleno = (tabla.estilo.relleno ?? {}) as Partial<{ top: number; bottom: number }>;
  return (tabla.estilo.tamanoCabecera || 9) * 1.3 + (relleno.top ?? 0) + (relleno.bottom ?? 0);
}

/**
 * La altura de reserva de la tabla.
 *
 * La medida ideal es la real del PDF de muestra (`altoTotal`): así, una
 * factura con las mismas líneas queda idéntica al diseño, con menos líneas la
 * tabla encoge y lo que va debajo (los totales) sube con ella, y con más
 * líneas crece y empuja hacia abajo o a la siguiente página.
 *
 * Pero si esa altura quedara por encima del espacio útil de la página o de lo
 * que hay hasta el campo que viene justo debajo, una factura con pocas líneas
 * arrastraría ese campo a una coordenada negativa y el repaginador de pdfme
 * fallaría con «Cannot read properties of undefined (reading 'push')». Por
 * eso la altura se recorta a esos dos topes.
 */
function alturaReservaTabla(
  tabla: TablaDetectada,
  campos: CampoDetectado[],
  altoPagina: number,
  inicioPie: number,
  alturaMinima: number,
): number {
  const topePagina = altoPagina - Math.max(MARGEN_PIE_MINIMO, altoPagina - inicioPie) - tabla.y;
  const masCercanoDebajo = campos
    .filter(c => c.y > tabla.y + 0.5)
    .sort((a, b) => a.y - b.y)[0];
  const topeCampos = masCercanoDebajo
    ? masCercanoDebajo.y - tabla.y + alturaMinima
    : Number.POSITIVE_INFINITY;
  const tope = Math.min(topePagina, topeCampos);
  return redondear(Math.max(Math.min(tabla.altoTotal, tope), 0.1));
}

function esquemaDeTabla(tabla: TablaDetectada, familia: 'sans' | 'serif', alturaReserva: number): Schema {
  const columnas = tabla.columnas;
  const anchoTotal = columnas.reduce((s, c) => s + c.ancho, 0) || tabla.ancho;
  const porcentajes = columnas.map(c => (c.ancho / anchoTotal) * 100);
  // Los redondeos no pueden dejar la tabla en 99,97%: el sobrante se le da a
  // la columna más ancha, que es donde menos se nota.
  const suma = porcentajes.reduce((a, b) => a + b, 0);
  const masAncha = porcentajes.indexOf(Math.max(...porcentajes));
  porcentajes[masAncha] += 100 - suma;

  const stylesColumna: Record<number, { alignment: string }> = {};
  columnas.forEach((col, idx) => {
    stylesColumna[idx] = { alignment: col.alineacion };
  });

  const fuenteBase = familia === 'serif' ? FUENTES.serif : FUENTES.sans;
  const fuenteCabecera = tabla.estilo.cabeceraNegrita
    ? (familia === 'serif' ? FUENTES.serifNegrita : FUENTES.sansNegrita)
    : fuenteBase;

  const bordeCelda = {
    top: 0,
    right: 0,
    bottom: tabla.estilo.bordeFilas,
    left: 0,
  };

  return {
    name: TABLA_LINEAS,
    type: 'table',
    position: { x: redondear(tabla.x), y: redondear(tabla.y) },
    width: redondear(tabla.ancho),
    // La altura es de reserva, no la real: la ocupa cada factura según sus
    // líneas. Es la real de la tabla de muestra recortada a los topes de
    // seguridad (ver `alturaReservaTabla`), de modo que una factura con las
    // mismas líneas queda idéntica al diseño y los totales siguen de cerca a
    // la tabla tanto si ésta encoge como si crece.
    height: alturaReserva,
    content: '[]',
    showHead: tabla.estilo.mostrarCabecera !== false,
    // La cabecera se repite en cada página nueva: una factura de tres hojas
    // sin títulos de columna en la segunda no hay quien la lea.
    repeatHead: true,
    head: columnas.map(c => c.cabecera || ''),
    headWidthPercentages: porcentajes.map(p => redondear(p)),
    tableStyles: { borderColor: tabla.estilo.bordeColor, borderWidth: tabla.estilo.bordeAncho },
    headStyles: {
      fontName: fuenteCabecera,
      alignment: 'left',
      verticalAlignment: 'middle',
      fontSize: redondear(tabla.estilo.tamanoCabecera),
      lineHeight: 1,
      characterSpacing: 0,
      fontColor: tabla.estilo.cabeceraTexto,
      backgroundColor: (!tabla.estilo.cabeceraFondo || tabla.estilo.cabeceraFondo === 'transparent' || tabla.estilo.cabeceraFondo === '#ffffff') ? '' : tabla.estilo.cabeceraFondo,
      borderColor: tabla.estilo.bordeColor,
      borderWidth: { ...bordeCelda },
      padding: rellenoComoCaja(tabla.estilo.relleno),
    },
    bodyStyles: {
      fontName: fuenteBase,
      alignment: 'left',
      verticalAlignment: 'top',
      fontSize: redondear(tabla.estilo.tamanoCuerpo),
      lineHeight: 1.15,
      characterSpacing: 0,
      fontColor: tabla.estilo.cuerpoTexto,
      backgroundColor: (!tabla.estilo.cuerpoFondo || tabla.estilo.cuerpoFondo === 'transparent' || tabla.estilo.cuerpoFondo === '#ffffff') ? '' : tabla.estilo.cuerpoFondo,
      borderColor: tabla.estilo.bordeColor,
      borderWidth: { ...bordeCelda },
      padding: rellenoComoCaja(tabla.estilo.relleno),
      alternateBackgroundColor: (tabla.estilo.filaAlterna && tabla.estilo.filaAlterna !== 'transparent') ? tabla.estilo.filaAlterna : '',
    },
    columnStyles: stylesColumna,
    // Extensión propia: qué dato de la factura va en cada columna. pdfme
    // ignora lo que no conoce, y el generador lo usa para ordenar las celdas.
    __columnas: columnas.map(c => c.clave),
  } as unknown as Schema;
}

function rellenoComoCaja(relleno: [number, number, number, number]) {
  return { top: relleno[0], right: relleno[1], bottom: relleno[2], left: relleno[3] };
}

/** Tabla de reserva cuando el PDF no traía ninguna reconocible. */
export function tablaPorDefecto(anchoPagina: number, altoPagina: number): TablaDetectada {
  const margen = 15;
  const ancho = anchoPagina - margen * 2;
  return {
    x: margen,
    ancho,
    y: altoPagina * 0.42,
    altoCabecera: 7,
    altoFila: 6,
    altoTotal: 7 + 6 * 6,
    columnas: columnasPorDefecto(margen, ancho),
    estilo: {
      cabeceraFondo: 'transparent',
      cabeceraTexto: '#0f172a',
      cabeceraNegrita: true,
      mostrarCabecera: true,
      cuerpoTexto: '#1f2937',
      bordeColor: '#d5dbe3',
      bordeAncho: 0,
      bordeFilas: 0.1,
      tamanoCabecera: 9,
      tamanoCuerpo: 9,
      relleno: [1.4, 1.6, 1.4, 1.6],
      filaAlterna: '',
    },
    filasOriginales: 0,
  };
}

// ============================================================
// COMPILACIÓN
// ============================================================

export function compilarPlantilla(
  analisis: AnalisisPdf,
  opciones: OpcionesCompilacion,
): ResultadoCompilacion {
  const { pagina } = analisis;
  const tabla = analisis.tabla ?? tablaPorDefecto(pagina.ancho, pagina.alto);

  // Un campo marcado como fijo no genera nada: su texto sigue impreso en el
  // calco, que es exactamente como estaba en el PDF original. Y uno sin
  // clave asignada tampoco, porque no sabríamos con qué rellenarlo.
  const campos = analisis.campos.filter(c => !c.fijo && c.clave);
  decidirAlineaciones(campos, pagina.ancho);

  // Vecinos con los que puede chocar una caja al estirarse: los demás campos
  // y los textos fijos que se quedan impresos en el calco.
  const textosDelCalco = pagina.lineas
    .filter(l => !campos.some(c => solapan(c, l)))
    .map(l => ({ x: l.x, y: l.y, ancho: l.ancho, alto: l.alto }));

  const limiteTabla = tabla.y;
  const inicioPie = calcularInicioPie(campos, pagina.alto, tabla);

  const estaticos: Schema[] = [];
  const fluyen: Schema[] = [];
  const confianza: Record<string, number> = {};
  const usados = new Set<string>([TABLA_LINEAS]);

  for (const campo of campos) {
    const nombre = nombreDeCampo(campo, usados);
    confianza[nombre] = campo.confianza;

    const vecinos = [
      ...textosDelCalco,
      ...campos.filter(c => c !== campo).map(c => ({ x: c.x, y: c.y, ancho: c.ancho, alto: c.alto })),
    ];
    const caja = campo.tipo === 'imagen'
      ? { x: campo.x, ancho: campo.ancho }
      : estirarCaja(campo, vecinos, pagina.ancho);

    const esquema = campo.tipo === 'imagen'
      ? esquemaDeImagen(campo, nombre)
      : esquemaDeTexto(campo, nombre, caja);

    // Cabecera y pie se repiten en todas las páginas; lo que está entre la
    // tabla y el pie acompaña a las líneas y baja con ellas.
    const enCabecera = campo.y + campo.alto <= limiteTabla + 1;
    const enPie = campo.y >= inicioPie;
    // El contador de páginas sólo lo sabe pdfme al componer, y sólo lo
    // resuelve en los elementos estáticos. Colocado en la zona que fluye
    // saldría el texto del marcador en crudo.
    const esContadorDePaginas = campo.clave === 'doc_pagina';

    if (enCabecera || enPie || esContadorDePaginas) {
      estaticos.push(convertirEnEstatico(esquema, campo, nombre));
    } else {
      fluyen.push(esquema);
    }
  }

  const fondo: Schema = {
    name: '__calco',
    type: 'image',
    content: opciones.fondo,
    position: { x: 0, y: 0 },
    width: redondear(pagina.ancho),
    height: redondear(pagina.alto),
    readOnly: true,
  } as unknown as Schema;

  const plantilla: Template = {
    basePdf: {
      width: redondear(pagina.ancho),
      height: redondear(pagina.alto),
      // El margen superior marca dónde vuelve a empezar la tabla en la
      // segunda página: justo donde empezaba en la primera, debajo del
      // membrete. El inferior reserva el sitio del pie.
      padding: [
        redondear(limiteTabla),
        0,
        redondear(Math.max(MARGEN_PIE_MINIMO, pagina.alto - inicioPie)),
        0,
      ],
      staticSchema: [fondo, ...estaticos],
    },
    schemas: [[esquemaDeTabla(tabla, analisis.familia, alturaReservaTabla(
      tabla,
      campos,
      pagina.alto,
      inicioPie,
      alturaMinimaCabecera(tabla),
    )), ...fluyen]],
  };

  return {
    plantilla,
    diagnostico: {
      avisos: analisis.avisos,
      confianza,
      archivoOrigen: opciones.archivoOrigen,
    },
  };
}

/**
 * Los campos de cabecera y pie viven en `staticSchema`, que pdfme pinta en
 * todas las páginas. Ahí el valor no llega por la entrada sino por un
 * marcador `{clave}` dentro del propio contenido, así que el campo se
 * convierte a esa forma.
 */
function convertirEnEstatico(esquema: Schema, campo: CampoDetectado, nombre: string): Schema {
  if (!campo.clave) return { ...esquema, readOnly: true } as Schema;
  return {
    ...esquema,
    content: `{${campo.clave}}`,
    readOnly: true,
    // El nombre sigue siendo único para que el revisor pueda localizarlo.
    name: nombre,
  } as Schema;
}

function solapan(a: { x: number; y: number; ancho: number; alto: number }, b: { x: number; y: number; ancho: number; alto: number }): boolean {
  return a.x < b.x + b.ancho && a.x + a.ancho > b.x && a.y < b.y + b.alto && a.y + a.alto > b.y;
}

/**
 * Dónde empieza el pie de página. Todo lo que esté por debajo se repite en
 * cada hoja y no lo empuja el crecimiento de la tabla.
 */
function calcularInicioPie(campos: CampoDetectado[], altoPagina: number, tabla: TablaDetectada): number {
  const zonaPie = altoPagina * 0.87;
  const finTabla = tabla.y + tabla.altoTotal;
  const candidatos = campos
    .filter(c => c.y >= zonaPie && c.y > finTabla)
    .map(c => c.y);
  const inicio = candidatos.length > 0 ? Math.min(...candidatos) - 2 : altoPagina - MARGEN_PIE_MINIMO;
  // Nunca por encima del final de la tabla original: el pie no puede comerse
  // el sitio de las líneas.
  return Math.max(inicio, Math.min(finTabla + 4, altoPagina - MARGEN_PIE_MINIMO));
}

/** El calco de una plantilla ya compilada, para enseñarlo como miniatura. */
export function calcoDePlantilla(plantilla: Template): string | null {
  const base = plantilla.basePdf;
  if (!base || typeof base !== 'object' || !('staticSchema' in base)) return null;
  const calco = (base.staticSchema ?? []).find(e => e.name === '__calco');
  return calco?.content ?? null;
}

/** Columnas de la tabla de una plantilla ya compilada. */
export function columnasDePlantilla(plantilla: Template): (string | null)[] {
  for (const pagina of plantilla.schemas) {
    for (const esquema of pagina) {
      if (esquema.name === TABLA_LINEAS) {
        const columnas = (esquema as unknown as { __columnas?: (string | null)[] }).__columnas;
        if (Array.isArray(columnas)) return columnas;
      }
    }
  }
  return COLUMNAS_LINEAS.slice(0, 5).map(c => c.clave);
}

/**
 * Columnas personalizadas (`custom_col_N`) que usa la tabla de líneas de una
 * plantilla compilada, con su cabecera. Es lo que se pide por línea al crear
 * una factura.
 */
export function columnasPersonalizadasDePlantilla(plantilla: Template): { clave: string; cabecera: string }[] {
  for (const pagina of plantilla.schemas) {
    for (const esquema of pagina) {
      if (esquema.name !== TABLA_LINEAS) continue;
      const mesa = esquema as unknown as { __columnas?: (string | null)[]; head?: string[] };
      const claves = mesa.__columnas;
      const cabeceras = mesa.head ?? [];
      if (!Array.isArray(claves)) return [];
      return claves
        .map((clave, i) => ({ clave, cabecera: cabeceras[i] ?? '' }))
        .filter((c): c is { clave: string; cabecera: string } =>
          c.clave !== null && esColumnaPersonalizada(c.clave));
    }
  }
  return [];
}

/** Claves `custom_N` (manuales) que la plantilla usa, únicas y ordenadas. */
export function clavesManualesUsadasPorPlantilla(plantilla: Template): string[] {
  const nombres = new Set<string>();
  const recorrer = (esquema: Schema[]) => {
    for (const campo of esquema ?? []) {
      const m = campo.name?.match(/^custom_([1-5])(_\d+)?$/);
      if (m) nombres.add(m[1]);
    }
  };
  for (const pagina of plantilla.schemas ?? []) recorrer(pagina);
  const base = plantilla.basePdf;
  if (base && typeof base === 'object' && 'staticSchema' in base) recorrer(base.staticSchema ?? []);
  return [...nombres].map(n => `custom_${n}`).sort();
}

/**
 * Normaliza y sanea cualquier objeto Template (incluso los guardados previamente en BD)
 * para asegurar compatibilidad total con pdfme y evitar errores al componer el PDF.
 */
export function normalizarPlantilla(plantilla: Template): Template {
  if (!plantilla || typeof plantilla !== 'object') return plantilla;
  const copia: Template = JSON.parse(JSON.stringify(plantilla));
  const paginas = copia.schemas || [];
  const baseStatic = (copia.basePdf && typeof copia.basePdf === 'object' && 'staticSchema' in copia.basePdf)
    ? ((copia.basePdf as { staticSchema?: Schema[] }).staticSchema || [])
    : [];

  const normalizarFont = (nombre?: string, negrita = false) => {
    if (!nombre || nombre === 'Helvetica' || nombre === 'Arial' || nombre === 'sans') {
      return negrita ? 'sans-bold' : 'sans';
    }
    if (nombre === 'Helvetica-Bold' || nombre === 'sans-bold') return 'sans-bold';
    if (nombre === 'Times-Roman' || nombre === 'serif') return negrita ? 'serif-bold' : 'serif';
    return nombre;
  };

  const normalizarCajaDimension = (caja?: Partial<{ top: number; right: number; bottom: number; left: number }>) => ({
    top: typeof caja?.top === 'number' ? caja.top : 0,
    right: typeof caja?.right === 'number' ? caja.right : 0,
    bottom: typeof caja?.bottom === 'number' ? caja.bottom : 0,
    left: typeof caja?.left === 'number' ? caja.left : 0,
  });

  // Contexto para acotar la altura de reserva de la tabla (ver
  // `alturaReservaTabla`): lo que cabe en la página y hasta dónde queda el
  // campo que viene justo debajo. Sólo se miran los esquemas de la primera
  // página, que es donde vive el diseño.
  const baseInfo = (copia.basePdf ?? {}) as { height?: number; padding?: number[] };
  const altoPagina = typeof baseInfo.height === 'number' && baseInfo.height > 0 ? baseInfo.height : 297;
  const padding = Array.isArray(baseInfo.padding) ? baseInfo.padding : [0, 0, 0, 0];
  const paddingTop = typeof padding[0] === 'number' ? padding[0] : 0;
  const paddingBottom = typeof padding[2] === 'number' ? padding[2] : 0;
  const altoContenido = Math.max(altoPagina - paddingTop - paddingBottom, 0.1);
  const primeraPagina = Array.isArray(paginas[0]) ? paginas[0] as unknown[] : [];

  for (const esq of [...paginas.flat(), ...baseStatic] as unknown as Record<string, unknown>[]) {
    if (!esq || typeof esq !== 'object') continue;

    if (esq.type === 'table') {
      const headArray = Array.isArray(esq.head) ? (esq.head as unknown[]).map(h => (h != null ? String(h) : '')) : ['Item', 'Total'];
      esq.head = headArray;
      const numCols = Math.max(1, headArray.length);

      // 1. Corregir columnStyles si viene como array { alignment: [...] } o desestructurado
      let colStyles = (esq.columnStyles as Record<string, unknown>) ?? {};
      if (Array.isArray((colStyles as { alignment?: unknown }).alignment)) {
        const arr = (colStyles as { alignment: string[] }).alignment;
        const map: Record<number, { alignment: string }> = {};
        arr.forEach((a, i) => { map[i] = { alignment: a || 'left' }; });
        colStyles = map;
      }
      const finalColStyles: Record<number, { alignment: string }> = {};
      for (let i = 0; i < numCols; i++) {
        const item = colStyles[i] as { alignment?: string } | undefined;
        finalColStyles[i] = { alignment: item?.alignment || 'left' };
      }
      esq.columnStyles = finalColStyles;

      // 2. Garantizar headWidthPercentages
      if (!Array.isArray(esq.headWidthPercentages) || (esq.headWidthPercentages as number[]).length !== numCols) {
        const pct = Math.round((100 / numCols) * 100) / 100;
        esq.headWidthPercentages = Array.from({ length: numCols }, () => pct);
      }

      // 3. Saneamiento de tableStyles, headStyles y bodyStyles
      const tableStyles = (esq.tableStyles as Record<string, unknown>) ?? {};
      tableStyles.borderWidth = typeof tableStyles.borderWidth === 'number' ? tableStyles.borderWidth : 0;
      tableStyles.borderColor = typeof tableStyles.borderColor === 'string' ? tableStyles.borderColor : '#000000';
      esq.tableStyles = tableStyles;

      const headStyles = (esq.headStyles as Record<string, unknown>) ?? {};
      headStyles.fontName = normalizarFont(headStyles.fontName as string | undefined, true);
      headStyles.fontSize = typeof headStyles.fontSize === 'number' ? headStyles.fontSize : 9;
      headStyles.characterSpacing = typeof headStyles.characterSpacing === 'number' ? headStyles.characterSpacing : 0;
      headStyles.lineHeight = typeof headStyles.lineHeight === 'number' ? headStyles.lineHeight : 1;
      headStyles.fontColor = typeof headStyles.fontColor === 'string' ? headStyles.fontColor : '#0f172a';
      headStyles.backgroundColor = typeof headStyles.backgroundColor === 'string' && headStyles.backgroundColor !== 'transparent' ? headStyles.backgroundColor : '';
      headStyles.borderColor = typeof headStyles.borderColor === 'string' ? headStyles.borderColor : '#d5dbe3';
      headStyles.borderWidth = normalizarCajaDimension(headStyles.borderWidth as Partial<{ top: number; right: number; bottom: number; left: number }>);
      headStyles.padding = normalizarCajaDimension(headStyles.padding as Partial<{ top: number; right: number; bottom: number; left: number }>);
      headStyles.alignment = 'left';
      headStyles.verticalAlignment = 'middle';
      esq.headStyles = headStyles;

      const bodyStyles = (esq.bodyStyles as Record<string, unknown>) ?? {};
      bodyStyles.fontName = normalizarFont(bodyStyles.fontName as string | undefined, false);
      bodyStyles.fontSize = typeof bodyStyles.fontSize === 'number' ? bodyStyles.fontSize : 9;
      bodyStyles.characterSpacing = typeof bodyStyles.characterSpacing === 'number' ? bodyStyles.characterSpacing : 0;
      bodyStyles.lineHeight = typeof bodyStyles.lineHeight === 'number' ? bodyStyles.lineHeight : 1.15;
      bodyStyles.fontColor = typeof bodyStyles.fontColor === 'string' ? bodyStyles.fontColor : '#1f2937';
      bodyStyles.backgroundColor = typeof bodyStyles.backgroundColor === 'string' && bodyStyles.backgroundColor !== 'transparent' ? bodyStyles.backgroundColor : '';
      bodyStyles.alternateBackgroundColor = typeof bodyStyles.alternateBackgroundColor === 'string' && bodyStyles.alternateBackgroundColor !== 'transparent' ? bodyStyles.alternateBackgroundColor : '';
      bodyStyles.borderColor = typeof bodyStyles.borderColor === 'string' ? bodyStyles.borderColor : '#d5dbe3';
      bodyStyles.borderWidth = normalizarCajaDimension(bodyStyles.borderWidth as Partial<{ top: number; right: number; bottom: number; left: number }>);
      bodyStyles.padding = normalizarCajaDimension(bodyStyles.padding as Partial<{ top: number; right: number; bottom: number; left: number }>);
      bodyStyles.alignment = 'left';
      bodyStyles.verticalAlignment = 'top';
      esq.bodyStyles = bodyStyles;

      esq.showHead = esq.showHead !== false;
      esq.repeatHead = esq.repeatHead !== false;
      esq.content = typeof esq.content === 'string' ? esq.content : '[]';

      // La altura de reserva se respeta siempre que quepa en el contenido útil
      // de la página y hasta el campo que viene justo debajo; si se pasa de
      // esos topes se recorta. Plantillas guardadas (o editadas a mano) con
      // una altura desmedida arrastrarían lo que sigue a una coordenada
      // negativa cuando la factura trae pocas líneas y romperían el
      // repaginador con «Cannot read properties of undefined (reading
      // 'push')». Sólo se ajusta la tabla de la primera página, que es la que
      // fluye.
      if (primeraPagina.includes(esq)) {
        const hs = headStyles as { fontSize?: number; lineHeight?: number; padding?: { top?: number; bottom?: number } };
        const alturaMinima = ((hs.fontSize ?? 9) * (hs.lineHeight ?? 1) * 1.3) + (hs.padding?.top ?? 0) + (hs.padding?.bottom ?? 0);
        const posicion = esq.position as { y?: number } | undefined;
        const posicionY = typeof posicion?.y === 'number' ? posicion.y : 0;
        const topePagina = altoContenido - (posicionY - paddingTop);
        const masCercanoDebajo = primeraPagina
          .filter(o => o !== esq && typeof o === 'object' && o !== null && (o as { position?: { y?: number } }).position?.y != null && (o as { position: { y: number } }).position.y > posicionY + 0.5)
          .sort((a, b) => ((a as { position: { y: number } }).position.y) - ((b as { position: { y: number } }).position.y))[0] as { position: { y: number } } | undefined;
        const topeCampos = masCercanoDebajo
          ? masCercanoDebajo.position.y - posicionY + alturaMinima
          : Number.POSITIVE_INFINITY;
        const tope = Math.min(topePagina, topeCampos);
        if (typeof esq.height !== 'number' || !Number.isFinite(esq.height) || esq.height <= 0 || esq.height > tope) {
          esq.height = Math.max(tope, 0.1);
        }
      }
    } else if (esq.type === 'text') {
      esq.fontName = normalizarFont(esq.fontName as string | undefined, Boolean(esq.bold));
    }
  }

  return copia;
}
