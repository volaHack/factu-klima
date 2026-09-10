/**
 * LA LLAMADA A LA AGENCIA TRIBUTARIA — SOLO SERVIDOR
 *
 * Veri*Factu no lleva usuario y contraseña ni una clave de API: la
 * autenticación es el propio canal. El cliente presenta el certificado
 * del obligado tributario (o el de su representante) en el saludo TLS, y
 * la AEAT deduce de ahí quién está enviando. Eso tiene dos consecuencias
 * que mandan sobre todo el diseño de este fichero:
 *
 *   1. La petición no se puede hacer con `fetch`. El fetch de Node no
 *      deja poner un certificado de cliente, así que hay que bajar a
 *      https.request, que sí acepta `pfx` y `passphrase`.
 *
 *   2. El certificado descifrado NO puede salir de aquí. Se descifra en
 *      memoria, se usa para el saludo y se va con la función. No se
 *      escribe en disco, no se registra, no se devuelve.
 *
 * Endpoints tomados del WSDL oficial (SistemaFacturacion.wsdl):
 *   pruebas    → prewww1.aeat.es
 *   producción → www1.agenciatributaria.gob.es
 * Los puertos «Sello» (www10/prewww10) son para certificados de sello de
 * entidad y apoderados; no se usan aquí porque el flujo de la aplicación
 * es el del obligado con su propio certificado.
 */

import https from 'node:https';
import { URL } from 'node:url';

export type EntornoAeat = 'pruebas' | 'produccion';

export const ENDPOINTS: Record<EntornoAeat, string> = {
  pruebas: 'https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP',
  produccion: 'https://www1.agenciatributaria.gob.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP',
};

export interface CredencialCertificado {
  /** Los bytes del .p12/.pfx, ya descifrados. */
  pfx: Buffer;
  passphrase: string;
}

export interface RespuestaHttp {
  estado: number;
  cuerpo: string;
}

/** Un minuto largo: la AEAT admite mil registros por envío. */
const TIEMPO_MAXIMO_MS = 60_000;

/**
 * Manda el sobre SOAP y devuelve lo que conteste, sea lo que sea.
 *
 * No lanza por un 500 ni por un 400: los devuelve. La AEAT contesta
 * errores de negocio con códigos HTTP que no son 200 y el cuerpo trae la
 * explicación, así que tragarse el cuerpo por mirar sólo el código
 * dejaría al usuario con un «error 400» y nada más.
 */
export function enviarSobreSoap(
  destino: string,
  sobre: string,
  credencial: CredencialCertificado,
): Promise<RespuestaHttp> {
  const url = new URL(destino);
  const cuerpo = Buffer.from(sobre, 'utf8');

  return new Promise((resolver, rechazar) => {
    const peticion = https.request(
      {
        host: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: 'POST',
        pfx: credencial.pfx,
        passphrase: credencial.passphrase,
        // Se deja la verificación del servidor ACTIVADA. Es la línea que
        // más veces se desactiva «temporalmente» para hacer que algo
        // funcione y luego se queda: sin ella, cualquiera que pueda
        // interceptar la conexión ve y modifica las facturas.
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'Content-Length': cuerpo.length,
          // El WSDL declara soapAction vacío, pero la cabecera tiene que
          // ir: hay pilas SOAP que rechazan la petición si falta.
          SOAPAction: '""',
        },
        timeout: TIEMPO_MAXIMO_MS,
      },
      respuesta => {
        const trozos: Buffer[] = [];
        respuesta.on('data', t => trozos.push(t));
        respuesta.on('end', () => resolver({
          estado: respuesta.statusCode ?? 0,
          cuerpo: Buffer.concat(trozos).toString('utf8'),
        }));
      },
    );

    peticion.on('timeout', () => {
      peticion.destroy(new Error(
        `La AEAT no ha contestado en ${TIEMPO_MAXIMO_MS / 1000} segundos. El envío puede haber llegado igualmente: no se marca como fallido para siempre, se deja pendiente.`,
      ));
    });

    peticion.on('error', error => rechazar(traducirErrorDeRed(error)));
    peticion.write(cuerpo);
    peticion.end();
  });
}

/**
 * Convierte los errores de OpenSSL en algo que se le pueda enseñar a
 * quien tiene una tienda y no un departamento de sistemas.
 *
 * «PKCS12_parse:mac verify failure» es literalmente lo que dice Node
 * cuando la contraseña del certificado está mal, y no hay forma humana
 * de deducirlo.
 */
function traducirErrorDeRed(error: NodeJS.ErrnoException): Error {
  const texto = String(error.message || '');

  if (/mac verify failure|wrong final block|bad decrypt/i.test(texto)) {
    return new Error('La contraseña del certificado no es correcta. Vuelve a subirlo con la contraseña buena.');
  }
  if (/unable to verify the first certificate|self.signed|UNABLE_TO_GET_ISSUER/i.test(texto)) {
    return new Error('No se ha podido verificar el certificado del servidor de la AEAT. Si estás detrás de un proxy corporativo que inspecciona el tráfico, es lo que lo está provocando.');
  }
  if (/ENOTFOUND|EAI_AGAIN/i.test(texto)) {
    return new Error('No se ha podido resolver la dirección de la AEAT. Comprueba la conexión a internet.');
  }
  if (/ECONNRESET|EPIPE|ECONNREFUSED/i.test(texto)) {
    return new Error('La AEAT ha cortado la conexión. Suele ser porque el certificado enviado no es válido para ese NIF, o porque el servicio está caído. Inténtalo de nuevo en unos minutos.');
  }
  if (/certificate|sslv3|alert|handshake/i.test(texto)) {
    return new Error(`El saludo seguro con la AEAT ha fallado: ${texto}. Suele significar que el certificado no es válido, ha caducado, o no corresponde al NIF que factura.`);
  }
  return error;
}
