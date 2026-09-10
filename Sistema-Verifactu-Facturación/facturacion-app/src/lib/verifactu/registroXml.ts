/**
 * EL XML QUE ENTIENDE LA AGENCIA TRIBUTARIA
 *
 * Fuente: los esquemas oficiales del servicio, descargados del WSDL
 * publicado por la AEAT:
 *   - SistemaFacturacion.wsdl
 *   - SuministroLR.xsd            (el envío: cabecera + hasta 1000 registros)
 *   - SuministroInformacion.xsd   (los registros de alta y de anulación)
 *   - RespuestaSuministro.xsd     (lo que contesta)
 *
 * Lo que había antes en este proyecto (aeatXmlGenerator.ts) tenía un
 * espacio de nombres inventado, elementos que no existen en ningún
 * esquema —«ModoEnvio», «HuellaHexSHA256»— y le faltaban campos
 * obligatorios enteros, empezando por Encadenamiento, que es la razón de
 * ser del sistema. No es que hubiera fallado en producción: es que no
 * habría pasado de la validación del esquema.
 *
 * DOS COSAS QUE NO SE PUEDEN IMPROVISAR AQUÍ
 *
 * 1. El ORDEN de los elementos. Los tipos del XSD son <sequence>, no
 *    <all>: un campo correcto en el sitio equivocado invalida el
 *    documento igual que si faltara. Las funciones de este fichero
 *    escriben los campos en el orden del esquema y por eso son largas y
 *    aburridas en vez de recorrer un objeto.
 *
 * 2. Los datos que van en la huella. IDEmisorFactura, NumSerieFactura,
 *    FechaExpedicionFactura, TipoFactura, CuotaTotal, ImporteTotal y
 *    FechaHoraHusoGenRegistro se escriben tal y como se hashearon al
 *    sellar la factura, leídos del registro guardado. Recalcularlos aquí
 *    sería pedir que un cambio de redondeo, de zona horaria o de criterio
 *    para el tipo de factura dejara la huella sin cuadrar, y la AEAT
 *    marcaría el registro como «aceptado con errores» sin decir por qué.
 */

import { fechaAeat, importeAeat } from './huella';

// Espacios de nombres oficiales, copiados de los propios esquemas.
export const NS_SUMINISTRO_LR =
  'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd';
export const NS_SUMINISTRO_INFORMACION =
  'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd';
export const NS_RESPUESTA =
  'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/RespuestaSuministro.xsd';
const NS_SOAP = 'http://schemas.xmlsoap.org/soap/envelope/';

/** La versión del diseño de registro. Hoy el esquema sólo admite «1.0». */
export const ID_VERSION = '1.0';
/** Lista L12: hoy el único algoritmo permitido es SHA-256, que es el «01». */
export const TIPO_HUELLA_SHA256 = '01';

/** Persona identificada por NIF español, o por identificación extranjera. */
export interface Persona {
  nombreRazon: string;
  nif?: string | null;
  idOtro?: { codigoPais?: string; idType: string; id: string } | null;
}

/** Un tramo del desglose: un tipo impositivo con su base y su cuota. */
export interface DetalleDesglose {
  /** 01 IVA, 02 IPSI, 03 IGIC, 05 otros. */
  impuesto?: string;
  /** Clave de régimen (01 general, 09 IGIC, 11 intracomunitaria…). */
  claveRegimen?: string;
  /** S1 sujeta y no exenta, S2 inversión del sujeto pasivo, N1/N2 no sujeta. */
  calificacionOperacion?: string;
  /** E1…E6: exenta, excluyente con calificacionOperacion. */
  operacionExenta?: string;
  tipoImpositivo?: number;
  baseImponible: number;
  cuotaRepercutida?: number;
  tipoRecargoEquivalencia?: number;
  cuotaRecargoEquivalencia?: number;
}

/** Identificación del programa que produce los registros. */
export interface SistemaInformatico {
  /** Quien PRODUCE el software, no quien lo usa. */
  nombreRazon: string;
  nif?: string | null;
  idOtro?: { codigoPais?: string; idType: string; id: string } | null;
  nombreSistemaInformatico: string;
  idSistemaInformatico: string;
  version: string;
  numeroInstalacion: string;
  tipoUsoPosibleSoloVerifactu: 'S' | 'N';
  tipoUsoPosibleMultiOT: 'S' | 'N';
  indicadorMultiplesOT: 'S' | 'N';
}

export interface Cabecera {
  obligadoEmision: { nombreRazon: string; nif: string };
  representante?: { nombreRazon: string; nif: string } | null;
}

export interface RegistroAlta {
  idEmisorFactura: string;
  numSerieFactura: string;
  /** ISO aaaa-mm-dd; se le da la vuelta al escribirlo. */
  fechaExpedicionFactura: string;
  nombreRazonEmisor: string;
  tipoFactura: string;
  /** «S» si es rectificativa por sustitución, «I» por diferencias. */
  tipoRectificativa?: 'S' | 'I' | null;
  facturasRectificadas?: Array<{ idEmisor: string; numSerie: string; fecha: string }>;
  descripcionOperacion: string;
  facturaSinIdentifDestinatarioArt61d?: boolean;
  destinatarios?: Persona[];
  desglose: DetalleDesglose[];
  cuotaTotal: number;
  importeTotal: number;
  /** Huella del registro anterior. Ausente si éste es el primero. */
  huellaAnterior?: string | null;
  idEmisorAnterior?: string | null;
  numSerieAnterior?: string | null;
  fechaExpedicionAnterior?: string | null;
  fechaHoraHusoGenRegistro: string;
  huella: string;
}

export interface RegistroAnulacion {
  idEmisorFacturaAnulada: string;
  numSerieFacturaAnulada: string;
  fechaExpedicionFacturaAnulada: string;
  huellaAnterior?: string | null;
  idEmisorAnterior?: string | null;
  numSerieAnterior?: string | null;
  fechaExpedicionAnterior?: string | null;
  fechaHoraHusoGenRegistro: string;
  huella: string;
}

export type Registro =
  | { tipo: 'alta'; datos: RegistroAlta }
  | { tipo: 'anulacion'; datos: RegistroAnulacion };

/**
 * Escapa el texto que va dentro de un elemento.
 *
 * Los nombres de empresa traen ampersands («Pérez & Hijos») más a menudo
 * de lo que uno espera, y un & sin escapar rompe el documento entero:
 * la AEAT no rechaza esa factura, rechaza el envío completo.
 */
function esc(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Un elemento con texto dentro, o nada si no hay valor. */
function el(nombre: string, valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined || valor === '') return '';
  return `<sf:${nombre}>${esc(String(valor))}</sf:${nombre}>`;
}

function persona(etiqueta: string, p: Persona): string {
  const identificacion = p.nif
    ? el('NIF', p.nif)
    : p.idOtro
      ? `<sf:IDOtro>${el('CodigoPais', p.idOtro.codigoPais)}`
        + `${el('IDType', p.idOtro.idType)}${el('ID', p.idOtro.id)}</sf:IDOtro>`
      : '';
  return `<sf:${etiqueta}>${el('NombreRazon', p.nombreRazon)}${identificacion}</sf:${etiqueta}>`;
}

function sistemaInformaticoXml(s: SistemaInformatico): string {
  const identificacion = s.nif
    ? el('NIF', s.nif)
    : s.idOtro
      ? `<sf:IDOtro>${el('CodigoPais', s.idOtro.codigoPais)}`
        + `${el('IDType', s.idOtro.idType)}${el('ID', s.idOtro.id)}</sf:IDOtro>`
      : '';

  return '<sf:SistemaInformatico>'
    + el('NombreRazon', s.nombreRazon)
    + identificacion
    + el('NombreSistemaInformatico', s.nombreSistemaInformatico)
    + el('IdSistemaInformatico', s.idSistemaInformatico)
    + el('Version', s.version)
    + el('NumeroInstalacion', s.numeroInstalacion)
    + el('TipoUsoPosibleSoloVerifactu', s.tipoUsoPosibleSoloVerifactu)
    + el('TipoUsoPosibleMultiOT', s.tipoUsoPosibleMultiOT)
    + el('IndicadorMultiplesOT', s.indicadorMultiplesOT)
    + '</sf:SistemaInformatico>';
}

/**
 * El bloque de encadenamiento: o se declara que es el primero, o se
 * apunta al anterior con sus cuatro datos.
 *
 * No hay tercera opción. Un registro sin este bloque no es un registro
 * Veri*Factu, es una factura suelta.
 */
function encadenamiento(datos: {
  huellaAnterior?: string | null;
  idEmisorAnterior?: string | null;
  numSerieAnterior?: string | null;
  fechaExpedicionAnterior?: string | null;
}): string {
  if (!datos.huellaAnterior) {
    return '<sf:Encadenamiento><sf:PrimerRegistro>S</sf:PrimerRegistro></sf:Encadenamiento>';
  }
  return '<sf:Encadenamiento><sf:RegistroAnterior>'
    + el('IDEmisorFactura', datos.idEmisorAnterior)
    + el('NumSerieFactura', datos.numSerieAnterior)
    + el('FechaExpedicionFactura', datos.fechaExpedicionAnterior ? fechaAeat(datos.fechaExpedicionAnterior) : '')
    + el('Huella', datos.huellaAnterior)
    + '</sf:RegistroAnterior></sf:Encadenamiento>';
}

function detalleXml(d: DetalleDesglose): string {
  // El esquema pone CalificacionOperacion y OperacionExenta en un
  // <choice>: van una u otra, nunca las dos. Si vinieran las dos, manda
  // la exención, que es la que describe la operación.
  const calificacion = d.operacionExenta
    ? el('OperacionExenta', d.operacionExenta)
    : el('CalificacionOperacion', d.calificacionOperacion ?? 'S1');

  return '<sf:DetalleDesglose>'
    + el('Impuesto', d.impuesto)
    + el('ClaveRegimen', d.claveRegimen)
    + calificacion
    + (d.tipoImpositivo === undefined || d.tipoImpositivo === null
        ? '' : el('TipoImpositivo', importeAeat(d.tipoImpositivo)))
    + el('BaseImponibleOimporteNoSujeto', importeAeat(d.baseImponible))
    + (d.cuotaRepercutida === undefined || d.cuotaRepercutida === null
        ? '' : el('CuotaRepercutida', importeAeat(d.cuotaRepercutida)))
    + (d.tipoRecargoEquivalencia
        ? el('TipoRecargoEquivalencia', importeAeat(d.tipoRecargoEquivalencia)) : '')
    + (d.cuotaRecargoEquivalencia
        ? el('CuotaRecargoEquivalencia', importeAeat(d.cuotaRecargoEquivalencia)) : '')
    + '</sf:DetalleDesglose>';
}

/**
 * Registro de alta, en el orden exacto de RegistroFacturacionAltaType.
 *
 * Los campos opcionales que este programa no usa (RefExterna,
 * Subsanacion, RechazoPrevio, Macrodato, Tercero, Cupon…) se omiten en
 * vez de mandarse vacíos: un elemento presente y vacío no es lo mismo
 * que ausente, y varios de ellos tienen consecuencias.
 */
export function registroAltaXml(r: RegistroAlta, sistema: SistemaInformatico): string {
  const rectificadas = r.facturasRectificadas?.length
    ? '<sf:FacturasRectificadas>'
      + r.facturasRectificadas.map(f =>
          '<sf:IDFacturaRectificada>'
          + el('IDEmisorFactura', f.idEmisor)
          + el('NumSerieFactura', f.numSerie)
          + el('FechaExpedicionFactura', fechaAeat(f.fecha))
          + '</sf:IDFacturaRectificada>').join('')
      + '</sf:FacturasRectificadas>'
    : '';

  const destinatarios = r.destinatarios?.length
    ? `<sf:Destinatarios>${r.destinatarios.map(d => persona('IDDestinatario', d)).join('')}</sf:Destinatarios>`
    : '';

  return '<sf:RegistroAlta>'
    + el('IDVersion', ID_VERSION)
    + '<sf:IDFactura>'
    + el('IDEmisorFactura', r.idEmisorFactura)
    + el('NumSerieFactura', r.numSerieFactura)
    + el('FechaExpedicionFactura', fechaAeat(r.fechaExpedicionFactura))
    + '</sf:IDFactura>'
    + el('NombreRazonEmisor', r.nombreRazonEmisor)
    + el('TipoFactura', r.tipoFactura)
    + (r.tipoRectificativa ? el('TipoRectificativa', r.tipoRectificativa) : '')
    + rectificadas
    + el('DescripcionOperacion', r.descripcionOperacion)
    + (r.facturaSinIdentifDestinatarioArt61d ? el('FacturaSinIdentifDestinatarioArt61d', 'S') : '')
    + destinatarios
    + `<sf:Desglose>${r.desglose.map(detalleXml).join('')}</sf:Desglose>`
    + el('CuotaTotal', importeAeat(r.cuotaTotal))
    + el('ImporteTotal', importeAeat(r.importeTotal))
    + encadenamiento(r)
    + sistemaInformaticoXml(sistema)
    + el('FechaHoraHusoGenRegistro', r.fechaHoraHusoGenRegistro)
    + el('TipoHuella', TIPO_HUELLA_SHA256)
    + el('Huella', r.huella)
    + '</sf:RegistroAlta>';
}

/** Registro de anulación, en el orden de RegistroFacturacionAnulacionType. */
export function registroAnulacionXml(r: RegistroAnulacion, sistema: SistemaInformatico): string {
  return '<sf:RegistroAnulacion>'
    + el('IDVersion', ID_VERSION)
    + '<sf:IDFactura>'
    + el('IDEmisorFacturaAnulada', r.idEmisorFacturaAnulada)
    + el('NumSerieFacturaAnulada', r.numSerieFacturaAnulada)
    + el('FechaExpedicionFacturaAnulada', fechaAeat(r.fechaExpedicionFacturaAnulada))
    + '</sf:IDFactura>'
    + encadenamiento(r)
    + sistemaInformaticoXml(sistema)
    + el('FechaHoraHusoGenRegistro', r.fechaHoraHusoGenRegistro)
    + el('TipoHuella', TIPO_HUELLA_SHA256)
    + el('Huella', r.huella)
    + '</sf:RegistroAnulacion>';
}

/** Tope del esquema: 1000 registros por envío. */
export const MAX_REGISTROS_POR_ENVIO = 1000;

/**
 * El sobre SOAP completo de RegFactuSistemaFacturacion.
 *
 * Va sin firma XAdES a propósito: en Veri*Factu la autenticación es el
 * certificado del canal (TLS mutuo). La firma electrónica del registro
 * es el camino alternativo, para los sistemas que NO remiten a la AEAT.
 * Este sistema remite, así que firmar aquí no sólo sobra: sería declarar
 * ser otra cosa.
 */
export function sobreRegFactu(
  cabecera: Cabecera,
  registros: Registro[],
  sistema: SistemaInformatico,
): string {
  if (registros.length === 0) {
    throw new Error('Un envío a la AEAT sin registros no tiene sentido.');
  }
  if (registros.length > MAX_REGISTROS_POR_ENVIO) {
    throw new Error(
      `El esquema admite ${MAX_REGISTROS_POR_ENVIO} registros por envío como mucho y se han pasado ${registros.length}.`,
    );
  }

  const cuerpoRegistros = registros.map(r =>
    '<sfLR:RegistroFactura>'
    + (r.tipo === 'alta'
        ? registroAltaXml(r.datos, sistema)
        : registroAnulacionXml(r.datos, sistema))
    + '</sfLR:RegistroFactura>').join('');

  return '<?xml version="1.0" encoding="UTF-8"?>'
    + `<soapenv:Envelope xmlns:soapenv="${NS_SOAP}"`
    + ` xmlns:sfLR="${NS_SUMINISTRO_LR}" xmlns:sf="${NS_SUMINISTRO_INFORMACION}">`
    + '<soapenv:Header/><soapenv:Body>'
    + '<sfLR:RegFactuSistemaFacturacion>'
    + '<sfLR:Cabecera>'
    + persona('ObligadoEmision', {
        nombreRazon: cabecera.obligadoEmision.nombreRazon,
        nif: cabecera.obligadoEmision.nif,
      })
    + (cabecera.representante
        ? persona('Representante', {
            nombreRazon: cabecera.representante.nombreRazon,
            nif: cabecera.representante.nif,
          })
        : '')
    + '</sfLR:Cabecera>'
    + cuerpoRegistros
    + '</sfLR:RegFactuSistemaFacturacion>'
    + '</soapenv:Body></soapenv:Envelope>';
}
