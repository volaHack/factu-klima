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
import { COLUMNAS_LINEAS, TABLA_LINEAS } from './contrato';
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

function esquemaDeTabla(tabla: TablaDetectada, familia: 'sans' | 'serif'): Schema {
  const columnas = tabla.columnas;
  const anchoTotal = columnas.reduce((s, c) => s + c.ancho, 0) || tabla.ancho;
  const porcentajes = columnas.map(c => (c.ancho / anchoTotal) * 100);
  // Los redondeos no pueden dejar la tabla en 99,97%: el sobrante se le da a
  // la columna más ancha, que es donde menos se nota.
  const suma = porcentajes.reduce((a, b) => a + b, 0);
  const masAncha = porcentajes.indexOf(Math.max(...porcentajes));
  porcentajes[masAncha] += 100 - suma;

  const alineaciones: Record<number, Alineacion> = {};
  columnas.forEach((c, i) => { alineaciones[i] = c.alineacion; });

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
    height: redondear(tabla.altoTotal),
    content: '[]',
    showHead: tabla.estilo.mostrarCabecera !== false,
    // La cabecera se repite en cada página nueva: una factura de tres hojas
    // sin títulos de columna en la segunda no hay quien la lea.
    repeatHead: true,
    head: columnas.map(c => c.cabecera),
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
      alternateBackgroundColor: tabla.estilo.filaAlterna === 'transparent' ? '' : tabla.estilo.filaAlterna,
    },
    columnStyles: { alignment: alineaciones },
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
    schemas: [[esquemaDeTabla(tabla, analisis.familia), ...fluyen]],
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
