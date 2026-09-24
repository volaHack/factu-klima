/**
 * ¿ESTE NIF ES DE ESTE NOMBRE? — PREGUNTADO A LA AEAT
 *
 * La AEAT tiene un servicio web público para esto, el de «Calidad de datos
 * identificativos» (VNifV2): se le mandan pares NIF + nombre y contesta,
 * para cada uno, si están identificados en el censo. Se autentica igual
 * que Veri*Factu, con el certificado en el saludo TLS, así que se usa el
 * certificado que la empresa ya tiene subido.
 *
 * Contrato, tomado del WSDL oficial VNifV2.wsdl y sus esquemas
 * VNifV2Ent.xsd / VNifV2Sal.xsd:
 *   - SOAP 1.1, document/literal, soapAction vacío.
 *   - Entrada: <VNifV2Ent><Contribuyente><Nif/><Nombre/></Contribuyente>…
 *     (hasta 10 000), elementos calificados en el espacio de nombres del
 *     esquema de entrada.
 *   - Salida: <VNifV2Sal><Contribuyente><Nif/><Nombre/><Resultado/>…
 *     Para personas jurídicas `Nombre` trae la razón social del censo;
 *     para personas físicas, el eco de lo enviado (protección de datos).
 *
 * Resultados documentados por la AEAT:
 *   IDENTIFICADO             · existe y el nombre corresponde.
 *   NO IDENTIFICADO-SIMILAR  · existe, pero el nombre sólo se parece
 *                              (sólo personas físicas).
 *   NO IDENTIFICADO          · no existe o el nombre no corresponde.
 *   IDENTIFICADO-BAJA        · corresponde, pero está de baja.
 *   IDENTIFICADO-REVOCADO    · corresponde, pero el NIF está revocado.
 *   NO PROCESADO             · la AEAT no lo ha podido mirar; reintentar.
 *
 * El servicio sólo existe en producción: es una consulta, no declara nada,
 * y se usa aunque Veri*Factu esté en el entorno de pruebas.
 */

export const ENDPOINT_VNIF = 'https://www1.agenciatributaria.gob.es/wlpl/BURT-JDIT/ws/VNifV2SOAP';

const NS_ENT = 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/burt/jdit/ws/VNifV2Ent.xsd';

/** Lo que se pregunta cada vez. La AEAT admite 10 000; aquí no hace falta más. */
export const MAX_CONSULTAS = 50;

export type EstadoCenso = 'identificado' | 'similar' | 'no_identificado' | 'baja' | 'revocado' | 'no_procesado' | 'desconocido';

export interface ResultadoCenso {
  nif: string;
  /** El nombre que devuelve la AEAT (razón social en empresas; eco en personas). */
  nombreCenso: string;
  /** El texto tal cual lo manda la AEAT. */
  resultado: string;
  estado: EstadoCenso;
}

const escaparXml = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** El sobre SOAP de la consulta. */
export function sobreVNifV2(pares: { nif: string; nombre: string }[]): string {
  const contribuyentes = pares.map(p =>
    `<vnif:Contribuyente><vnif:Nif>${escaparXml(p.nif)}</vnif:Nif><vnif:Nombre>${escaparXml(p.nombre)}</vnif:Nombre></vnif:Contribuyente>`,
  ).join('');
  return '<?xml version="1.0" encoding="UTF-8"?>'
    + `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:vnif="${NS_ENT}">`
    + '<soapenv:Header/><soapenv:Body>'
    + `<vnif:VNifV2Ent>${contribuyentes}</vnif:VNifV2Ent>`
    + '</soapenv:Body></soapenv:Envelope>';
}

export function estadoDe(resultado: string): EstadoCenso {
  const r = resultado.trim().toUpperCase().replace(/\s+/g, ' ');
  if (r === 'IDENTIFICADO') return 'identificado';
  if (r === 'NO IDENTIFICADO-SIMILAR') return 'similar';
  if (r === 'NO IDENTIFICADO') return 'no_identificado';
  if (r === 'IDENTIFICADO-BAJA') return 'baja';
  if (r === 'IDENTIFICADO-REVOCADO') return 'revocado';
  if (r === 'NO PROCESADO') return 'no_procesado';
  return 'desconocido';
}

const desescaparXml = (t: string) =>
  t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** El texto de un elemento hijo, con o sin prefijo de espacio de nombres. */
function hijo(bloque: string, nombre: string): string {
  const m = new RegExp(`<(?:[\\w-]+:)?${nombre}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${nombre}>`).exec(bloque);
  return m ? desescaparXml(m[1].trim()) : '';
}

/**
 * Lee la respuesta. Lanza si es un SOAP Fault (certificado no admitido,
 * petición mal formada…), con el texto de la AEAT.
 */
export function parsearRespuestaVNifV2(xml: string): ResultadoCenso[] {
  if (/<(?:[\w-]+:)?Fault[\s>]/.test(xml)) {
    const motivo = hijo(xml, 'faultstring') || 'la AEAT ha rechazado la consulta';
    throw new Error(`La AEAT no ha aceptado la consulta: ${motivo}`);
  }
  const bloques = xml.match(/<(?:[\w-]+:)?Contribuyente(?:\s[^>]*)?>[\s\S]*?<\/(?:[\w-]+:)?Contribuyente>/g) ?? [];
  return bloques.map(b => {
    const resultado = hijo(b, 'Resultado');
    return { nif: hijo(b, 'Nif').toUpperCase(), nombreCenso: hijo(b, 'Nombre'), resultado, estado: estadoDe(resultado) };
  });
}
