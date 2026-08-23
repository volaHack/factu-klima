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

/** La URL exacta que codifica el QR: la que abre quien lo escanea. */
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
  if (!datos.nifEmisor || !datos.numeroFactura || !datos.fechaEmision) return '';
  const url = urlCotejoAeat(datos);
  return QRCode.toDataURL(url, {
    margin: 1,
    width: 300,
    errorCorrectionLevel: 'M',
  });
}
