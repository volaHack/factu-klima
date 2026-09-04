/**
 * MODELO 303 — Autoliquidación trimestral del IVA
 *
 * EL DISEÑO DEL FICHERO NO ESTÁ INVENTADO
 * ---------------------------------------
 * Las posiciones salen del diseño de registro oficial de la AEAT,
 * «Modelo 303, versión 1.01, ejercicio 2026 y siguientes»:
 *
 *   https://sede.agenciatributaria.gob.es/static_files/Sede/Disenyo_registro/DR_300_399/archivos_26/DR303e26v101.xlsx
 *
 * Es un formato ETIQUETADO, no de registros de longitud fija como el 347:
 * el fichero es una cabecera `<T3030EEEEPP0000>` con un bloque `<AUX>`,
 * después una página por cada `<T303PPPPP>` con sus casillas en
 * posiciones fijas, y se cierra con `</T3030EEEEPP0000>`.
 *
 * QUÉ SE RELLENA Y QUÉ NO
 * -----------------------
 * Se rellena el RÉGIMEN GENERAL, que es lo que este programa sabe de
 * verdad: IVA devengado por tipo, IVA soportado deducible por tipo de
 * operación y el resultado.
 *
 * NO se rellenan el régimen simplificado, el recargo de equivalencia, la
 * prorrata especial, el criterio de caja ni los supuestos concursales:
 * el programa no registra ninguno de esos datos, y rellenarlos a cero
 * como si fueran ceros reales sería declarar algo que no se ha
 * comprobado. `validarModelo303` avisa cuando la empresa parece estar en
 * uno de esos regímenes.
 */

import type { Invoice, Gasto, CompanySettings } from '../../types';
import type { ErrorValidacion, PeriodoFiscal, ResultadoValidacion } from '../tipos';
import {
  desglosarPorTipo,
  enPeriodo,
  facturaCuenta,
  redondear,
  soportadoPorTipoOperacion,
  type DesgloseTipo,
  type SoportadoPorTipoOperacion,
} from '../FiscalCalculationService';
import { isValidNif } from '../../validation/nif';

export interface Resultado303 {
  periodo: PeriodoFiscal;
  /** IVA repercutido, desglosado por tipo. */
  devengado: DesgloseTipo[];
  baseDevengada: number;
  /** Casilla [27]: total cuota devengada. */
  cuotaDevengada: number;
  /** IVA soportado, por tipo de operación (cada uno va a su casilla). */
  soportado: SoportadoPorTipoOperacion;
  /** Casilla [45]: total a deducir. */
  cuotaDeducible: number;
  /** Casilla [46] = [27] − [45]. */
  resultadoRegimenGeneral: number;
  /** Casilla [71]: resultado de la autoliquidación. */
  resultadoLiquidacion: number;
  numFacturas: number;
  numGastos: number;
}

/* ------------------------------------------------------------------ */
/* Cálculo                                                             */
/* ------------------------------------------------------------------ */

export interface DatosModelo303 {
  facturas: Invoice[];
  gastos: Gasto[];
}

export function calcularModelo303(datos: DatosModelo303, periodo: PeriodoFiscal): Resultado303 {
  const emitidas = datos.facturas.filter(
    f => facturaCuenta(f) && f.sentido !== 'compra' && enPeriodo(f.issueDate, periodo),
  );
  const gastos = datos.gastos.filter(g => enPeriodo(g.fecha, periodo));

  const devengado = desglosarPorTipo(emitidas);
  const baseDevengada = redondear(devengado.reduce((s, d) => s + d.base, 0));
  const cuotaDevengada = redondear(devengado.reduce((s, d) => s + d.cuota, 0));

  const soportado = soportadoPorTipoOperacion(gastos);
  const cuotaDeducible = soportado.totalDeducible;

  const resultadoRegimenGeneral = redondear(cuotaDevengada - cuotaDeducible);

  return {
    periodo,
    devengado,
    baseDevengada,
    cuotaDevengada,
    soportado,
    cuotaDeducible,
    resultadoRegimenGeneral,
    // Sin régimen simplificado ni regularizaciones, [71] coincide con
    // [46]. Se deja como campo aparte porque es la casilla que de verdad
    // se ingresa o se devuelve, y para que se vea que son dos conceptos.
    resultadoLiquidacion: resultadoRegimenGeneral,
    numFacturas: emitidas.length,
    numGastos: gastos.length,
  };
}

/* ------------------------------------------------------------------ */
/* Validación                                                          */
/* ------------------------------------------------------------------ */

export function validarModelo303(
  r: Resultado303,
  empresa: Pick<CompanySettings, 'nif' | 'businessName' | 'igicEnabled' | 'porcentajeProrrata'> | null,
): ResultadoValidacion {
  const errores: ErrorValidacion[] = [];
  const avisos: ErrorValidacion[] = [];
  const refEmpresa = { tipo: 'empresa' as const, id: 'empresa', etiqueta: 'Ajustes de la empresa' };

  if (!empresa?.nif || !isValidNif(empresa.nif)) {
    errores.push({
      gravedad: 'critico', campo: 'nif',
      mensaje: `El NIF de la empresa (${empresa?.nif || 'vacío'}) no es válido.`,
      referencia: refEmpresa,
    });
  }
  if (!empresa?.businessName?.trim()) {
    errores.push({
      gravedad: 'critico', campo: 'nombre',
      mensaje: 'La empresa no tiene razón social configurada.',
      referencia: refEmpresa,
    });
  }

  // El 303 es de IVA. Una empresa en IGIC no lo presenta: presenta el 420
  // ante la Agencia Tributaria Canaria. Esto es un error, no un aviso:
  // presentar un 303 estando en IGIC es presentar el modelo equivocado.
  if (empresa?.igicEnabled) {
    errores.push({
      gravedad: 'critico', campo: 'regimen',
      mensaje: 'La empresa tributa en IGIC: le corresponde el modelo 420 ante la ATC, no el 303.',
      referencia: refEmpresa,
    });
  }

  if (!r.periodo.trimestre) {
    errores.push({
      gravedad: 'critico', campo: 'periodo',
      mensaje: 'El modelo 303 es trimestral: hay que elegir un trimestre.',
    });
  }

  // Cuadres aritméticos: si esto falla, es un fallo del programa, no del
  // usuario, y más vale que salte aquí.
  const sumaDevengado = redondear(r.devengado.reduce((s, d) => s + d.cuota, 0));
  if (Math.abs(sumaDevengado - r.cuotaDevengada) > 0.01) {
    errores.push({
      gravedad: 'critico', campo: 'cuadre',
      mensaje: `La casilla [27] (${r.cuotaDevengada} €) no cuadra con el desglose por tipos (${sumaDevengado} €).`,
    });
  }
  if (Math.abs(redondear(r.cuotaDevengada - r.cuotaDeducible) - r.resultadoRegimenGeneral) > 0.01) {
    errores.push({
      gravedad: 'critico', campo: 'cuadre',
      mensaje: 'La casilla [46] no es igual a [27] − [45].',
    });
  }

  if (r.numFacturas === 0 && r.numGastos === 0) {
    avisos.push({
      gravedad: 'aviso', campo: 'sin_datos',
      mensaje: 'No hay facturas ni gastos en el período. Si no has tenido actividad, el 303 se presenta igualmente a cero.',
    });
  }
  if (r.numGastos === 0 && r.numFacturas > 0) {
    avisos.push({
      gravedad: 'aviso', campo: 'sin_soportado',
      mensaje: 'No hay ningún gasto registrado en el período: el IVA soportado sale a cero y el resultado a ingresar será el máximo posible.',
    });
  }
  if (empresa?.porcentajeProrrata != null && empresa.porcentajeProrrata < 100) {
    avisos.push({
      gravedad: 'aviso', campo: 'prorrata',
      mensaje: `La empresa tiene prorrata del ${empresa.porcentajeProrrata}%. El modelo usa la cuota deducible de cada gasto: comprueba que ya lleva la prorrata aplicada.`,
      referencia: refEmpresa,
    });
  }
  if (r.resultadoLiquidacion < 0) {
    avisos.push({
      gravedad: 'aviso', campo: 'resultado',
      mensaje: `Resultado negativo (${r.resultadoLiquidacion} €): es una cuota a compensar o a devolver, no a ingresar.`,
    });
  }

  return { valido: errores.length === 0, errores, avisos };
}

/* ------------------------------------------------------------------ */
/* Fichero oficial                                                     */
/* ------------------------------------------------------------------ */

/** Alfanumérico: izquierda, blancos a la derecha, mayúsculas sin acentos. */
function alfa(v: string, len: number): string {
  return (v || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9ÑÇ .,\-/]/g, ' ')
    .slice(0, len)
    .padEnd(len, ' ');
}

/**
 * Importe en el formato del 303: 15 enteros y 2 decimales, sin coma, en
 * un campo de 17 posiciones. El signo NO va aquí: los campos que pueden
 * ser negativos lo llevan en una posición aparte, y en las casillas de
 * este módulo (bases y cuotas del régimen general) los importes son
 * positivos salvo [46] y [71], que se firman con `importeFirmado`.
 */
function importe(v: number, len = 17): string {
  const abs = Math.abs(redondear(v));
  const entera = Math.floor(abs);
  const dec = Math.round((abs - entera) * 100);
  return (String(entera) + String(dec).padStart(2, '0')).padStart(len, '0');
}

/** Casillas que admiten negativo: signo N + importe de 16. */
function importeFirmado(v: number): string {
  return (v < 0 ? 'N' : ' ') + importe(v, 16);
}

/** Tipo impositivo en 5 posiciones: 21% → "02100". */
function tipoPct(v: number): string {
  return String(Math.round(v * 100)).padStart(5, '0');
}

function nif9(v: string): string {
  return (v || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(-9).padStart(9, '0');
}

/** "1T".."4T" tal y como lo pide el diseño. */
function periodoAeat(p: PeriodoFiscal): string {
  return `${p.trimestre ?? 1}T`;
}

/**
 * Construye un registro colocando cada campo en su posición del diseño.
 *
 * Se trabaja con posiciones absolutas (las del PDF/xlsx oficial, que
 * empiezan en 1) en vez de concatenar: así el código se puede cotejar
 * campo a campo con el diseño, y un campo que falte deja blancos en vez
 * de desplazar todo lo que viene detrás — que es el fallo clásico de los
 * generadores de ficheros de Hacienda y el más difícil de ver.
 */
function registro(longitud: number, campos: [number, string][]): string {
  const buf = new Array(longitud).fill(' ');
  for (const [pos, valor] of campos) {
    for (let i = 0; i < valor.length; i++) buf[pos - 1 + i] = valor[i];
  }
  return buf.join('');
}

/** Reparte el devengado por los tres tipos con casilla propia (4/10/21). */
function casillasDevengado(devengado: DesgloseTipo[]) {
  const de = (t: number) => devengado.find(d => d.tipo === t) || { tipo: t, base: 0, cuota: 0 };
  const otros = devengado.filter(d => ![4, 10, 21].includes(d.tipo));
  return {
    t4: de(4),
    t10: de(10),
    t21: de(21),
    // Los tipos que no son 4/10/21 (por ejemplo un 5% temporal) van a las
    // filas de «otros tipos» del modelo: [150-152], [153-155], [165-167].
    otros: otros.slice(0, 3),
  };
}

export interface OpcionesFichero303 {
  /** Versión del programa que genera, 4 posiciones. */
  versionPrograma?: string;
  /** NIF de la empresa de desarrollo, para el bloque AUX. */
  nifDesarrollador?: string;
  /** 'I' ingreso, 'D' devolución, 'N' sin actividad, 'C' compensación. */
  tipoDeclaracion?: 'I' | 'D' | 'N' | 'C' | 'U' | 'G';
}

/** Página 00: cabecera con el bloque AUX. 328 posiciones. */
export function cabecera303(r: Resultado303, o: OpcionesFichero303 = {}): string {
  const eeee = String(r.periodo.ejercicio);
  const pp = periodoAeat(r.periodo);
  return registro(328, [
    [1, '<T'],
    [3, '303'],
    [6, '0'],
    [7, eeee],
    [11, pp],
    [13, '0000>'],
    [18, '<AUX>'],
    // 23-92 blancos
    [93, alfa(o.versionPrograma || '0100', 4)],
    // 97-100 blancos
    [101, o.nifDesarrollador ? nif9(o.nifDesarrollador) : ' '.repeat(9)],
    // 110-322 blancos
    [323, '</AUX>'],
  ]);
}

/**
 * Página 01: identificación y liquidación del régimen general.
 * 1581 posiciones (el indicador de fin va en la 1570, longitud 12).
 */
export function pagina01_303(
  r: Resultado303,
  empresa: Pick<CompanySettings, 'nif' | 'businessName'>,
  o: OpcionesFichero303 = {},
): string {
  const c = casillasDevengado(r.devengado);
  const s = r.soportado;

  return registro(1581, [
    [1, '<T'],
    [3, '303'],
    [6, '01000'],
    [11, '>'],
    // 12: indicador de página complementaria (en blanco)
    [13, o.tipoDeclaracion || (r.resultadoLiquidacion >= 0 ? 'I' : 'C')],
    [14, nif9(empresa.nif)],
    [23, alfa(empresa.businessName, 80)],
    [103, String(r.periodo.ejercicio)],
    [107, periodoAeat(r.periodo)],
    // 109-130: marcas de régimen. Todas a "2" (NO) porque el programa no
    // registra ninguno de esos regímenes especiales; la 111 es "3" =
    // sólo régimen general, que es lo que aplica aquí.
    [109, '2'], [110, '2'], [111, '3'], [112, '2'], [113, '2'], [114, '2'],
    [115, '2'], [116, '2'], [117, '2'],
    // 118-125: fecha del auto de concurso (en blanco)
    [126, ' '],
    [127, '2'], [128, '2'], [129, '2'], [130, '0'],

    // --- IVA devengado, régimen general ---
    // Otros tipos: [150-152], [165-167], [153-155]
    [131, importe(c.otros[0]?.base ?? 0)], [148, tipoPct(c.otros[0]?.tipo ?? 0)], [153, importe(c.otros[0]?.cuota ?? 0)],
    [170, importe(c.otros[1]?.base ?? 0)], [187, tipoPct(c.otros[1]?.tipo ?? 0)], [192, importe(c.otros[1]?.cuota ?? 0)],
    // 4 % → [01][02][03]
    [209, importe(c.t4.base)], [226, tipoPct(4)], [231, importe(c.t4.cuota)],
    // Otro tipo más: [153-155]
    [248, importe(c.otros[2]?.base ?? 0)], [265, tipoPct(c.otros[2]?.tipo ?? 0)], [270, importe(c.otros[2]?.cuota ?? 0)],
    // 10 % → [04][05][06]
    [287, importe(c.t10.base)], [304, tipoPct(10)], [309, importe(c.t10.cuota)],
    // 21 % → [07][08][09]
    [326, importe(c.t21.base)], [343, tipoPct(21)], [348, importe(c.t21.cuota)],
    // Adquisiciones intracomunitarias [10][11]
    [365, importe(s.intracomunitariaCorriente.base + s.intracomunitariaInversion.base)],
    [382, importe(s.intracomunitariaCorriente.cuota + s.intracomunitariaInversion.cuota)],
    // Inversión del sujeto pasivo [12][13]
    [399, importe(s.inversionSujetoPasivo.base)],
    [416, importe(s.inversionSujetoPasivo.cuota)],
    // Modificación de bases y cuotas [14][15]: el programa no registra
    // rectificaciones separadas del devengo, van a cero.
    [433, importe(0)], [450, importe(0)],
    // Recargo de equivalencia [156-158], [168-170], [16]-[26]: la empresa
    // no está en recargo (no se registra), todo a cero.
    [467, importe(0)], [484, tipoPct(0)], [489, importe(0)],
    [506, importe(0)], [523, tipoPct(0)], [528, importe(0)],
    [545, importe(0)], [562, tipoPct(0)], [567, importe(0)],
    [584, importe(0)], [601, tipoPct(0)], [606, importe(0)],
    [623, importe(0)], [640, tipoPct(0)], [645, importe(0)],
    [662, importe(0)], [679, importe(0)],
    // [27] Total cuota devengada
    [696, importe(r.cuotaDevengada)],

    // --- IVA deducible ---
    [713, importe(s.interiorCorriente.base)], [730, importe(s.interiorCorriente.cuota)],   // [28][29]
    [747, importe(s.interiorInversion.base)], [764, importe(s.interiorInversion.cuota)],   // [30][31]
    [781, importe(s.importacionCorriente.base)], [798, importe(s.importacionCorriente.cuota)], // [32][33]
    [815, importe(s.importacionInversion.base)], [832, importe(s.importacionInversion.cuota)], // [34][35]
    [849, importe(s.intracomunitariaCorriente.base)], [866, importe(s.intracomunitariaCorriente.cuota)], // [36][37]
    [883, importe(s.intracomunitariaInversion.base)], [900, importe(s.intracomunitariaInversion.cuota)], // [38][39]
    [917, importe(0)], [934, importe(0)],   // [40][41] rectificación de deducciones
    [951, importe(0)],                       // [42] compensaciones REAGP
    [968, importe(0)],                       // [43] regularización de inversiones
    [985, importe(0)],                       // [44] regularización por prorrata definitiva
    [1002, importe(r.cuotaDeducible)],       // [45] total a deducir
    [1019, importeFirmado(r.resultadoRegimenGeneral)], // [46] puede ser negativo

    [1570, '</T30301000>'],
  ]);
}

/** Página 03: resultado. 1017 posiciones. */
export function pagina03_303(r: Resultado303): string {
  return registro(1017, [
    [1, '<T'],
    [3, '303'],
    [6, '03000'],
    [11, '>'],
    // Información adicional (entregas intracomunitarias, exportaciones…):
    // el programa no las clasifica todavía, van a cero.
    [182, importe(0)],                          // [76] regularización art. 80.cinco.5ª
    [199, importeFirmado(r.resultadoRegimenGeneral)], // [64] suma de resultados
    [216, tipoPct(100)],                        // [65] % atribuible al Estado
    [221, importeFirmado(r.resultadoRegimenGeneral)], // [66] atribuible al Estado
    [340, importeFirmado(r.resultadoLiquidacion)],    // [71] resultado de la autoliquidación
    [1006, '</T30303000>'],
  ]);
}

/**
 * El fichero completo del 303.
 *
 * Estructura: cabecera con AUX, página 01, página 03 y la etiqueta de
 * cierre. Las páginas 02, 04 y 05 (régimen simplificado y anexos) no se
 * emiten porque no se rellenan.
 */
export function generarFichero303(
  r: Resultado303,
  empresa: Pick<CompanySettings, 'nif' | 'businessName'>,
  o: OpcionesFichero303 = {},
): string {
  const cierre = `</T3030${r.periodo.ejercicio}${periodoAeat(r.periodo)}0000>`;
  return cabecera303(r, o) + pagina01_303(r, empresa, o) + pagina03_303(r) + cierre;
}

export function nombreFichero303(
  empresa: Pick<CompanySettings, 'nif'>,
  periodo: PeriodoFiscal,
): string {
  return `${(empresa.nif || '').trim().toUpperCase()}_${periodo.ejercicio}${periodoAeat(periodo)}.303`;
}
