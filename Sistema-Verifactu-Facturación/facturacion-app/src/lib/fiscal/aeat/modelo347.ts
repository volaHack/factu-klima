/**
 * MODELO 347 — Declaración anual de operaciones con terceras personas
 *
 * Se declara cada tercero (cliente o proveedor) con el que se ha superado
 * 3.005,06 € en el año natural, con el importe repartido por trimestres.
 *
 * EL DISEÑO DEL FICHERO NO ESTÁ INVENTADO
 * ---------------------------------------
 * Las posiciones de `generarFichero347` salen del diseño de registro
 * oficial de la AEAT para el ejercicio 2025 y siguientes (modificado por
 * la Orden HAC/1431/2025, de 3 de diciembre):
 *
 *   https://sede.agenciatributaria.gob.es/static_files/Sede/Disenyo_registro/DR_300_399/archivos/347.pdf
 *
 * OJO con el diseño antiguo: el de 2010 (347_2010_TIPOSV1.0.pdf, que es
 * el que sale primero al buscar) NO vale. En aquel los importes eran
 * numéricos sin signo y las posiciones 134-500 del registro de declarado
 * iban en blanco; en el vigente cada importe lleva delante una posición
 * de SIGNO y existe el desglose por trimestres a partir de la 136. Un
 * fichero con el diseño viejo lo rechaza la Sede.
 *
 * IGIC: este modelo es de la AEAT. Una empresa canaria acogida al IGIC
 * presenta el 415 ante la ATC, que es otro modelo y otro organismo — ver
 * `atc/modelo415.ts`. No se mezclan.
 */

import type { Invoice, Gasto, Client, CompanySettings } from '../../types';
import type {
  ErrorValidacion,
  PeriodoFiscal,
  ResultadoValidacion,
  Trimestre,
} from '../tipos';
// El validador de NIF/NIE/CIF ya existe en el proyecto y está probado:
// no se duplica aquí.
import { isValidNif } from '../../validation/nif';

/** El umbral legal del 347: 3.005,06 € por tercero y año natural. */
export const UMBRAL_347 = 3005.06;

/** Umbral de los cobros por cuenta de terceros (clave C). */
export const UMBRAL_COBROS_TERCEROS = 300.51;

/**
 * Clave de operación del diseño oficial (posición 82 del registro 2).
 * Aquí sólo se usan A y B: son las que se pueden deducir de las facturas
 * que guarda el programa. Las demás (C cobros por cuenta de terceros, D
 * entidades públicas, E subvenciones, F/G agencias de viaje) dependen de
 * información que el sistema no registra, y no se rellenan a ojo.
 */
export type ClaveOperacion = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';

export interface LineaDeclarado {
  clienteId?: string;
  nif: string;
  nombre: string;
  clave: ClaveOperacion;
  /** 'venta' = le hemos facturado (clave B). 'compra' = nos ha facturado (clave A). */
  tipo: 'venta' | 'compra';
  provincia: string;
  totalAnual: number;
  trimestres: Record<Trimestre, number>;
  /** Facturas que componen el total, para poder abrir el detalle. */
  documentos: { id: string; numero: string; fecha: string; importe: number }[];
}

export interface Resultado347 {
  ejercicio: number;
  lineas: LineaDeclarado[];
  /** Terceros que no llegan al umbral: no se declaran, pero se enseñan. */
  descartadosPorUmbral: number;
  totalDeclarados: number;
  totalOperaciones: number;
  importeTotal: number;
  importeVentas: number;
  importeCompras: number;
  porTrimestre: Record<Trimestre, number>;
}

/* ------------------------------------------------------------------ */
/* Cálculo                                                             */
/* ------------------------------------------------------------------ */

function trimestreDe(fecha: string): Trimestre {
  const mes = Number(fecha.slice(5, 7));
  return (Math.floor((mes - 1) / 3) + 1) as Trimestre;
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * El importe que va al 347 es el TOTAL de la operación, con el impuesto
 * incluido — no la base imponible. Es el error clásico al montar este
 * modelo, y cuadra mal con Hacienda porque el tercero declara su lado con
 * el impuesto dentro.
 */
function importeDeclarable(f: Invoice): number {
  return f.total;
}

/**
 * ¿Cuenta esta factura para el 347?
 *
 * Fuera: borradores y facturas anuladas (no existen fiscalmente), y los
 * albaranes y demás documentos que no son factura.
 */
function cuentaParaEl347(f: Invoice, ejercicio: number): boolean {
  if (f.cancelledAt) return false;
  if (f.tipo && f.tipo !== 'factura') return false;
  if (f.status === 'borrador') return false;
  return Number(f.issueDate.slice(0, 4)) === ejercicio;
}

export interface DatosModelo347 {
  facturas: Invoice[];
  gastos: Gasto[];
  clientes: Client[];
}

/**
 * Agrupa por NIF, no por id de cliente: el mismo tercero puede estar dado
 * de alta dos veces (como cliente y como proveedor) y en el 347 va una
 * sola línea por NIF y clave de operación.
 */
export function calcularModelo347(
  datos: DatosModelo347,
  periodo: PeriodoFiscal,
): Resultado347 {
  const { ejercicio } = periodo;
  const porClave = new Map<string, LineaDeclarado>();
  const nombrePorNif = new Map<string, string>();
  const provinciaPorNif = new Map<string, string>();

  for (const c of datos.clientes) {
    if (!c.nif) continue;
    const nif = c.nif.trim().toUpperCase();
    if (!nombrePorNif.has(nif)) nombrePorNif.set(nif, c.businessName || '');
    if (c.province) provinciaPorNif.set(nif, c.province);
  }

  const acumular = (
    nif: string,
    nombre: string,
    tipo: 'venta' | 'compra',
    fecha: string,
    importe: number,
    doc: { id: string; numero: string },
  ) => {
    const clave: ClaveOperacion = tipo === 'venta' ? 'B' : 'A';
    const k = `${nif}|${clave}`;
    let linea = porClave.get(k);
    if (!linea) {
      linea = {
        nif,
        nombre: nombrePorNif.get(nif) || nombre,
        clave,
        tipo,
        provincia: provinciaPorNif.get(nif) || '',
        totalAnual: 0,
        trimestres: { 1: 0, 2: 0, 3: 0, 4: 0 },
        documentos: [],
      };
      porClave.set(k, linea);
    }
    const t = trimestreDe(fecha);
    linea.totalAnual = redondear(linea.totalAnual + importe);
    linea.trimestres[t] = redondear(linea.trimestres[t] + importe);
    linea.documentos.push({ id: doc.id, numero: doc.numero, fecha, importe });
  };

  for (const f of datos.facturas) {
    if (!cuentaParaEl347(f, ejercicio)) continue;
    const nif = (f.clientNif || '').trim().toUpperCase();
    if (!nif) continue;
    const tipo: 'venta' | 'compra' = f.sentido === 'compra' ? 'compra' : 'venta';
    acumular(nif, f.clientName || '', tipo, f.issueDate, importeDeclarable(f), {
      id: f.id,
      numero: f.number,
    });
  }

  // Los gastos son compras a proveedores: cuentan en el 347 igual que una
  // factura recibida, siempre que se sepa a qué NIF corresponden. Un gasto
  // sin proveedor identificado (un ticket de gasolina suelto) no se puede
  // declarar y se queda fuera; la validación lo avisa.
  const nifPorProveedorId = new Map<string, string>();
  for (const c of datos.clientes) {
    if (c.id && c.nif) nifPorProveedorId.set(c.id, c.nif.trim().toUpperCase());
  }
  for (const g of datos.gastos) {
    if (Number(g.fecha.slice(0, 4)) !== ejercicio) continue;
    const nif = g.proveedorId ? nifPorProveedorId.get(g.proveedorId) : undefined;
    if (!nif) continue;
    acumular(nif, g.proveedorNombre || '', 'compra', g.fecha, g.total, {
      id: g.id,
      numero: g.concepto,
    });
  }

  const todas = [...porClave.values()];
  const lineas = todas
    .filter(l => Math.abs(l.totalAnual) > UMBRAL_347)
    .sort((a, b) => b.totalAnual - a.totalAnual);

  const porTrimestre: Record<Trimestre, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  let importeVentas = 0;
  let importeCompras = 0;
  let totalOperaciones = 0;
  for (const l of lineas) {
    for (const t of [1, 2, 3, 4] as Trimestre[]) {
      porTrimestre[t] = redondear(porTrimestre[t] + l.trimestres[t]);
    }
    if (l.tipo === 'venta') importeVentas = redondear(importeVentas + l.totalAnual);
    else importeCompras = redondear(importeCompras + l.totalAnual);
    totalOperaciones += l.documentos.length;
  }

  return {
    ejercicio,
    lineas,
    descartadosPorUmbral: todas.length - lineas.length,
    totalDeclarados: lineas.length,
    totalOperaciones,
    importeTotal: redondear(importeVentas + importeCompras),
    importeVentas,
    importeCompras,
    porTrimestre,
  };
}

/* ------------------------------------------------------------------ */
/* Validación                                                          */
/* ------------------------------------------------------------------ */

export function validarModelo347(
  resultado: Resultado347,
  empresa: Pick<CompanySettings, 'nif' | 'businessName'> | null,
): ResultadoValidacion {
  const errores: ErrorValidacion[] = [];
  const avisos: ErrorValidacion[] = [];

  if (!empresa?.nif || !isValidNif(empresa.nif)) {
    errores.push({
      gravedad: 'critico',
      campo: 'nif_declarante',
      mensaje: `El NIF de la empresa (${empresa?.nif || 'vacío'}) no es válido. Sin él no se puede generar el fichero.`,
      referencia: { tipo: 'empresa', id: 'empresa', etiqueta: 'Ajustes de la empresa' },
    });
  }
  if (!empresa?.businessName?.trim()) {
    errores.push({
      gravedad: 'critico',
      campo: 'nombre_declarante',
      mensaje: 'La empresa no tiene razón social configurada.',
      referencia: { tipo: 'empresa', id: 'empresa', etiqueta: 'Ajustes de la empresa' },
    });
  }

  const ejercicioActual = new Date().getFullYear();
  if (resultado.ejercicio < 2000 || resultado.ejercicio > ejercicioActual + 1) {
    errores.push({
      gravedad: 'critico',
      campo: 'ejercicio',
      mensaje: `Ejercicio ${resultado.ejercicio} fuera de rango.`,
    });
  }

  for (const l of resultado.lineas) {
    const ref = {
      tipo: 'cliente' as const,
      id: l.clienteId || l.nif,
      etiqueta: `${l.nombre || l.nif} (${l.nif})`,
    };
    if (!isValidNif(l.nif)) {
      errores.push({
        gravedad: 'critico',
        campo: 'nif_declarado',
        mensaje: `NIF ${l.nif} no válido (${l.nombre || 'sin nombre'}).`,
        referencia: ref,
      });
    }
    if (!l.nombre.trim()) {
      errores.push({
        gravedad: 'critico',
        campo: 'nombre_declarado',
        mensaje: `El tercero con NIF ${l.nif} no tiene razón social.`,
        referencia: ref,
      });
    }
    const sumaTrimestres = redondear(
      l.trimestres[1] + l.trimestres[2] + l.trimestres[3] + l.trimestres[4],
    );
    if (Math.abs(sumaTrimestres - l.totalAnual) > 0.01) {
      errores.push({
        gravedad: 'critico',
        campo: 'cuadre_trimestres',
        mensaje: `En ${l.nombre || l.nif} los trimestres suman ${sumaTrimestres} € y el total anual es ${l.totalAnual} €.`,
        referencia: ref,
      });
    }
    if (l.nombre.length > 40) {
      avisos.push({
        gravedad: 'aviso',
        campo: 'nombre_declarado',
        mensaje: `La razón social de ${l.nif} pasa de 40 caracteres y se recortará en el fichero.`,
        referencia: ref,
      });
    }
    if (!l.provincia) {
      avisos.push({
        gravedad: 'aviso',
        campo: 'provincia',
        mensaje: `${l.nombre || l.nif} no tiene provincia; el fichero llevará 99 (no residente).`,
        referencia: ref,
      });
    }
  }

  // Un mismo NIF declarado dos veces con la misma clave sería un duplicado
  // real; el agrupado por `${nif}|${clave}` ya lo impide, pero si alguna
  // vez se rompe, que salte aquí y no en la Sede.
  const vistos = new Set<string>();
  for (const l of resultado.lineas) {
    const k = `${l.nif}|${l.clave}`;
    if (vistos.has(k)) {
      errores.push({
        gravedad: 'critico',
        campo: 'duplicado',
        mensaje: `El NIF ${l.nif} aparece dos veces con la clave ${l.clave}.`,
      });
    }
    vistos.add(k);
  }

  if (resultado.lineas.length === 0) {
    avisos.push({
      gravedad: 'aviso',
      campo: 'sin_datos',
      mensaje: `Ningún tercero supera los ${UMBRAL_347.toLocaleString('es-ES')} € en ${resultado.ejercicio}. No hay obligación de presentar el 347.`,
    });
  }

  return { valido: errores.length === 0, errores, avisos };
}

/* ------------------------------------------------------------------ */
/* Generación del fichero — diseño oficial vigente                     */
/* ------------------------------------------------------------------ */

/** Alfanumérico: izquierda, relleno de blancos, mayúsculas sin acentos. */
function alfa(valor: string, longitud: number): string {
  const limpio = (valor || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita acentos, deja la Ñ (que va aparte)
    .toUpperCase()
    .replace(/[^A-Z0-9ÑÇ .,\-/]/g, ' ');
  return limpio.slice(0, longitud).padEnd(longitud, ' ');
}

/** Numérico: derecha, relleno de ceros. */
function num(valor: number | string, longitud: number): string {
  const s = String(valor ?? 0).replace(/\D/g, '');
  return s.slice(-longitud).padStart(longitud, '0');
}

/** NIF: 9 posiciones, ajustado a la derecha y relleno de ceros a la izquierda. */
function nif(valor: string): string {
  return (valor || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(-9).padStart(9, '0');
}

/**
 * Importe con signo, tal y como lo pide el diseño vigente: una posición de
 * signo ('N' si es negativo, espacio si no) seguida del importe sin signo
 * ni coma decimal, partido en parte entera y dos decimales.
 *
 * En el diseño de 2010 esta posición de signo NO existía. Es el cambio que
 * más fácil se pasa por alto al portar un generador viejo.
 */
function importeConSigno(valor: number, digitosEnteros: number): string {
  const signo = valor < 0 ? 'N' : ' ';
  const abs = Math.abs(redondear(valor));
  const entera = Math.floor(abs);
  const decimal = Math.round((abs - entera) * 100);
  return signo + num(entera, digitosEnteros) + num(decimal, 2);
}

/** Código de provincia de dos dígitos del diseño oficial. 99 = no residente. */
const PROVINCIAS: Record<string, string> = {
  'ALAVA': '01', 'ARABA': '01', 'ALBACETE': '02', 'ALICANTE': '03', 'ALACANT': '03',
  'ALMERIA': '04', 'AVILA': '05', 'BADAJOZ': '06', 'ILLES BALEARS': '07', 'BALEARES': '07',
  'BARCELONA': '08', 'BURGOS': '09', 'CACERES': '10', 'CADIZ': '11', 'CASTELLON': '12',
  'CASTELLO': '12', 'CIUDAD REAL': '13', 'CORDOBA': '14', 'A CORUNA': '15', 'CORUNA': '15',
  'CUENCA': '16', 'GIRONA': '17', 'GERONA': '17', 'GRANADA': '18', 'GUADALAJARA': '19',
  'GUIPUZCOA': '20', 'GIPUZKOA': '20', 'HUELVA': '21', 'HUESCA': '22', 'JAEN': '23',
  'LEON': '24', 'LLEIDA': '25', 'LERIDA': '25', 'LA RIOJA': '26', 'RIOJA': '26',
  'LUGO': '27', 'MADRID': '28', 'MALAGA': '29', 'MURCIA': '30', 'NAVARRA': '31',
  'OURENSE': '32', 'ORENSE': '32', 'ASTURIAS': '33', 'PALENCIA': '34', 'LAS PALMAS': '35',
  'PALMAS': '35', 'PONTEVEDRA': '36', 'SALAMANCA': '37', 'SANTA CRUZ DE TENERIFE': '38',
  'TENERIFE': '38', 'CANTABRIA': '39', 'SEGOVIA': '40', 'SEVILLA': '41', 'SORIA': '42',
  'TARRAGONA': '43', 'TERUEL': '44', 'TOLEDO': '45', 'VALENCIA': '46', 'VALLADOLID': '47',
  'VIZCAYA': '48', 'BIZKAIA': '48', 'ZAMORA': '49', 'ZARAGOZA': '50', 'CEUTA': '51',
  'MELILLA': '52',
};

export function codigoProvincia(provincia: string | undefined): string {
  if (!provincia) return '99';
  const k = provincia
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .trim();
  return PROVINCIAS[k] || '99';
}

export interface OpcionesFichero347 {
  /** Teléfono de contacto (9 dígitos). */
  telefono?: string;
  /** Apellidos y nombre de la persona de contacto. */
  contacto?: string;
  /** Secuencial de 13 dígitos que empieza por 347. Se genera si no se pasa. */
  numeroIdentificativo?: string;
  complementaria?: boolean;
  sustitutiva?: boolean;
  numeroDeclaracionAnterior?: string;
}

/** Registro de tipo 1: declarante. 500 posiciones exactas. */
export function registroDeclarante(
  resultado: Resultado347,
  empresa: Pick<CompanySettings, 'nif' | 'businessName'>,
  opciones: OpcionesFichero347 = {},
): string {
  const identificativo = opciones.numeroIdentificativo || `347${num(Date.now() % 10 ** 10, 10)}`;

  const r =
    '1' +                                                  // 1
    '347' +                                                // 2-4
    num(resultado.ejercicio, 4) +                          // 5-8
    nif(empresa.nif) +                                     // 9-17
    alfa(empresa.businessName, 40) +                       // 18-57
    'T' +                                                  // 58  transmisión telemática
    num(opciones.telefono || '', 9) +                      // 59-67
    alfa(opciones.contacto || empresa.businessName, 40) +  // 68-107
    num(identificativo, 13) +                              // 108-120
    (opciones.complementaria ? 'C' : ' ') +                // 121
    (opciones.sustitutiva ? 'S' : ' ') +                   // 122
    num(opciones.numeroDeclaracionAnterior || '', 13) +    // 123-135
    num(resultado.totalDeclarados, 9) +                    // 136-144
    importeConSigno(resultado.importeTotal, 13) +          // 145-160
    num(0, 9) +                                            // 161-169  inmuebles: el programa no los registra
    importeConSigno(0, 13) +                               // 170-185  arrendamientos de local de negocio
    ' '.repeat(205) +                                      // 186-390
    ' '.repeat(9) +                                        // 391-399  NIF representante legal
    ' '.repeat(88) +                                       // 400-487
    ' '.repeat(13);                                        // 488-500  sello electrónico (lo pone la AEAT)

  return r;
}

/** Registro de tipo 2: declarado. 500 posiciones exactas. */
export function registroDeclarado(
  linea: LineaDeclarado,
  resultado: Resultado347,
  empresa: Pick<CompanySettings, 'nif'>,
): string {
  const r =
    '2' +                                          // 1
    '347' +                                        // 2-4
    num(resultado.ejercicio, 4) +                  // 5-8
    nif(empresa.nif) +                             // 9-17
    nif(linea.nif) +                               // 18-26
    ' '.repeat(9) +                                // 27-35  NIF representante legal
    alfa(linea.nombre, 40) +                       // 36-75
    'D' +                                          // 76     tipo de hoja
    codigoProvincia(linea.provincia) +             // 77-78
    ' '.repeat(2) +                                // 79-80  código país (residentes: blancos)
    ' ' +                                          // 81
    linea.clave +                                  // 82
    importeConSigno(linea.totalAnual, 13) +        // 83-98
    ' ' +                                          // 99     operación de seguro
    ' ' +                                          // 100    arrendamiento de local de negocio
    num(0, 15) +                                   // 101-115 importe percibido en metálico
    importeConSigno(0, 13) +                       // 116-131 transmisiones de inmuebles sujetas a IVA
    num(0, 4) +                                    // 132-135 ejercicio del cobro en metálico
    importeConSigno(linea.trimestres[1], 13) +     // 136-151
    importeConSigno(0, 13) +                       // 152-167 transmisiones 1T
    importeConSigno(linea.trimestres[2], 13) +     // 168-183
    importeConSigno(0, 13) +                       // 184-199 transmisiones 2T
    importeConSigno(linea.trimestres[3], 13) +     // 200-215
    importeConSigno(0, 13) +                       // 216-231 transmisiones 3T
    importeConSigno(linea.trimestres[4], 13) +     // 232-247
    importeConSigno(0, 13) +                       // 248-263 transmisiones 4T
    ' '.repeat(17) +                               // 264-280 NIF operador comunitario
    ' '.repeat(220);                               // 281-500

  return r;
}

/**
 * El fichero completo: un registro de tipo 1 y tantos de tipo 2 como
 * declarados. Registros de 500 posiciones separados por CRLF.
 *
 * Codificación: el diseño exige ISO-8859-1. Quien escriba esto a disco
 * tiene que hacerlo en latin1, no en UTF-8 — ver `descargarFichero347`.
 */
export function generarFichero347(
  resultado: Resultado347,
  empresa: Pick<CompanySettings, 'nif' | 'businessName'>,
  opciones: OpcionesFichero347 = {},
): string {
  const lineas = [
    registroDeclarante(resultado, empresa, opciones),
    ...resultado.lineas.map(l => registroDeclarado(l, resultado, empresa)),
  ];
  return lineas.join('\r\n') + '\r\n';
}

/** El nombre que espera la Sede: el NIF del declarante y extensión .347 */
export function nombreFichero347(empresa: Pick<CompanySettings, 'nif'>): string {
  return `${(empresa.nif || '').trim().toUpperCase()}.347`;
}
