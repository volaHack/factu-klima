/**
 * EL QR DE COTEJO DE LA FACTURA
 *
 * El reglamento Veri*Factu exige que la factura impresa lleve un código QR
 * que cualquiera pueda escanear para comprobarla en la sede electrónica de
 * la Agencia Tributaria. El campo existía en la plantilla desde hacía
 * tiempo —`verifactu_qr`, con su hueco reservado en el pie de cada
 * factura— pero nada lo rellenaba nunca: dependía de una URL que tenía que
 * traer la propia factura (`invoice.verifactu.qrCodeUrl`) y ese dato no lo
 * escribía nadie en ningún sitio. El campo estaba siempre en blanco, en
 * todas las facturas, siempre.
 *
 * Esto no necesita ninguna conexión con la AEAT para funcionar: el QR de
 * cotejo es la misma URL pública que llevan las facturas simplificadas
 * desde 2023, con cuatro datos que la propia factura ya tiene —el NIF de
 * quien la emite, su número, su fecha y su importe—. Generarlo es trabajo
 * local, no una integración pendiente.
 */

import QRCode from 'qrcode';

/**
 * El servicio de cotejo de facturas de la Agencia Tributaria.
 *
 * Es el mismo que valida las facturas simplificadas desde el Real Decreto
 * 1619/2012, ampliado para Veri*Factu: cuatro parámetros y ya está. No hay
 * un entorno de pruebas para este servicio en concreto —a diferencia del
 * envío SOAP, que si lo tiene—, así que una factura de verdad siempre
 * enlaza aquí, nunca a un sandbox.
 */
const URL_COTEJO_AEAT = 'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR';

/**
 * El mismo servicio en el Portal de Pruebas Externas.
 *
 * No se usa al imprimir —una factura de verdad enlaza siempre a producción—
 * pero está aquí porque el documento técnico lo publica junto al otro y
 * tenerlo escrito evita que alguien lo teclee mal el día que haga falta
 * probar el cotejo de punta a punta.
 */
export const URL_COTEJO_PRUEBAS = 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR';

/** DD-MM-YYYY con guiones, que es el formato que pide la AEAT para este campo — no el DD/MM/YYYY con barras que se usa en pantalla. */
function fechaParaQr(fechaIso: string): string {
  const fecha = new Date(fechaIso);
  if (Number.isNaN(fecha.getTime())) return '';
  const dd = String(fecha.getDate()).padStart(2, '0');
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  const yyyy = fecha.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

/** El NIF sin espacios ni guiones: la AEAT lo quiere limpio. */
function nifParaQr(nif: string): string {
  return nif.replace(/[\s-]/g, '').toUpperCase();
}

export interface DatosQrVerifactu {
  nifEmisor: string;
  numeroFactura: string;
  fechaEmision: string;
  importeTotal: number;
}

/**
 * COMPROBAR LOS CUATRO DATOS ANTES DE CODIFICARLOS
 *
 * El apartado 6 del documento técnico de la AEAT fija el formato exacto de
 * cada parámetro, y el servicio de cotejo devuelve error si alguno no encaja.
 * Un QR mal formado no se ve mal: se ve perfecto, se escanea perfecto, y sólo
 * falla cuando el cliente lo abre y la sede electrónica le contesta que la
 * factura no existe. Así que se comprueba aquí, antes de imprimir nada.
 *
 * Devuelve los problemas en castellano llano, vacío si todo está bien.
 */
export function validarDatosQr(datos: DatosQrVerifactu): string[] {
  const problemas: string[] = [];

  const nif = nifParaQr(datos.nifEmisor || '');
  if (!nif) {
    problemas.push('falta el NIF del expedidor');
  } else if (!/^[A-Z0-9]{9}$/.test(nif)) {
    // «Formato NIF», longitud 9. No se comprueba el dígito de control aquí:
    // de eso ya se encarga `validation/nif.ts` al dar de alta la empresa, y
    // duplicar la regla sólo serviría para que discreparan.
    problemas.push(`el NIF del expedidor («${datos.nifEmisor}») no tiene los 9 caracteres que exige la AEAT`);
  }

  const numero = datos.numeroFactura || '';
  if (!numero) {
    problemas.push('falta el número de la factura');
  } else if (numero.length > 60) {
    problemas.push('el número de serie y factura pasa de 60 caracteres');
  } else if (/[^\x20-\x7e]/.test(numero)) {
    // «las cadenas de texto solo pueden contener caracteres ASCII con códigos
    // del 32 al 126» (apartado 4 del documento técnico).
    problemas.push(`el número de factura («${numero}») lleva caracteres que la AEAT no admite`);
  }

  if (!datos.fechaEmision || !fechaParaQr(datos.fechaEmision)) {
    problemas.push('falta la fecha de expedición o no se entiende');
  }

  if (typeof datos.importeTotal !== 'number' || !Number.isFinite(datos.importeTotal)) {
    problemas.push('falta el importe total de la factura');
  } else if (Math.abs(datos.importeTotal) >= 1e12) {
    problemas.push('el importe total pasa de los 12 dígitos que admite la AEAT');
  }

  return problemas;
}

/**
 * La URL exacta que codifica el QR: la que abre quien lo escanea.
 *
 * `URLSearchParams` codifica exactamente igual que el
 * `java.net.URLEncoder.encode(param, "UTF-8")` del ejemplo que la propia AEAT
 * publica en el apartado 4.1 de su documento técnico —el «&» de un número de
 * serie sale como `%26`, el espacio como `+`—, así que no hay que inventar
 * ninguna codificación propia: la de la plataforma ya es la buena.
 */
export function urlCotejoAeat(datos: DatosQrVerifactu): string {
  const params = new URLSearchParams({
    nif: nifParaQr(datos.nifEmisor),
    numserie: datos.numeroFactura,
    fecha: fechaParaQr(datos.fechaEmision),
    // Con punto decimal y dos cifras, sin separador de miles ni símbolo de
    // moneda: es el único formato de número que la AEAT acepta aquí.
    importe: datos.importeTotal.toFixed(2),
  });
  return `${URL_COTEJO_AEAT}?${params.toString()}`;
}

/**
 * El QR ya renderizado, listo para meter en el campo `type: 'image'` de la
 * plantilla: un PNG en base64, no la URL en texto.
 *
 * Sin NIF, sin número o sin fecha no hay nada que codificar de verdad —
 * sería un QR que apunta a una factura que no se puede identificar—, así
 * que en ese caso no se genera nada y el campo se queda vacío, no con un
 * QR roto.
 */
export async function generarQrVerifactu(datos: DatosQrVerifactu): Promise<string> {
  if (validarDatosQr(datos).length > 0) return '';
  const url = urlCotejoAeat(datos);
  return QRCode.toDataURL(url, {
    // Nivel M, que es el que exige el art. 21.1 de la Orden HAC/1177/2024.
    // La librería sigue la ISO/IEC 18004 que cita el mismo artículo.
    errorCorrectionLevel: 'M',
    // El espacio vacío alrededor lo pone el bloque (6 mm de papel de verdad,
    // ver `qrFactura.ts`), no la imagen: dejar aquí un margen ancho sólo
    // encogería los módulos dentro del cuadrado de 35 mm y haría el código
    // más difícil de leer, no más fácil.
    margin: 0,
    // 1.200 px sobre un cuadrado de 35 mm son ~870 ppp: de sobra para que la
    // impresión salga nítida y los módulos no queden dentados.
    width: 1200,
  });
}
