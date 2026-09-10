/**
 * LEER DE VERDAD EL CERTIFICADO — SOLO SERVIDOR
 *
 * Hasta ahora la subida de certificados era un formulario con buenos
 * modales: comprobaba que el fichero fuera BASE64 y que la contraseña no
 * estuviera vacía, y guardaba «(sin verificar)» en el nombre del titular
 * y una fecha de caducidad inventada a un año vista. Lo decía en sus
 * comentarios, que es más honesto que la mayoría, pero seguía siendo un
 * formulario, no una validación.
 *
 * Resulta que no hacía falta ninguna biblioteca para hacerlo bien. Node
 * ya trae un intérprete de PKCS#12 dentro de `tls.createSecureContext`
 * —es el mismo que usa para presentar el certificado en una conexión— y
 * el contexto que devuelve deja sacar el certificado en DER, que
 * `crypto.X509Certificate` sí sabe leer. Con eso salen el titular, el
 * emisor, el número de serie y las fechas REALES.
 *
 * Y de propina, lo más útil de todo: si la contraseña no es la buena,
 * `createSecureContext` falla con «mac verify failure». Es decir, se
 * puede comprobar la contraseña EN EL MOMENTO DE SUBIRLA en vez de
 * descubrirlo semanas después, cuando la AEAT rechace el saludo TLS y el
 * usuario no tenga ni idea de por qué.
 *
 * LO QUE SIGUE SIN COMPROBARSE
 * Que el certificado esté revocado. Eso exige consultar la CRL o el OCSP
 * del emisor, que es una petición de red a un tercero con sus propios
 * fallos y sus propios tiempos de espera. No está hecho, y se dice aquí
 * en vez de dejarlo entender.
 */

import crypto from 'node:crypto';
import tls from 'node:tls';

export interface DatosCertificado {
  subjectName: string;
  issuerName: string;
  serialNumber: string;
  notBefore: Date;
  notAfter: Date;
  /** El certificado dice ser de una autoridad reconocida y conocida. */
  emisorReconocido: boolean;
  /** NIF que aparece en el certificado, si se puede leer del titular. */
  nifTitular: string | null;
}

/**
 * Autoridades de certificación admitidas por la AEAT que se pueden
 * reconocer por el nombre del emisor.
 *
 * Esto NO es una lista de confianza: no decide si el certificado vale,
 * sólo sirve para poder decirle al usuario «esto no parece un
 * certificado de los que valen» antes de que lo descubra la Agencia. La
 * lista de prestadores cualificados es larga y cambia, así que un emisor
 * que no esté aquí se acepta igual y se deja anotado.
 */
const EMISORES_CONOCIDOS = [
  'FNMT', 'AC CAMERFIRMA', 'CAMERFIRMA', 'ANF', 'FIRMAPROFESIONAL',
  'IZENPE', 'ACCV', 'AC ABOGACIA', 'DNIE', 'SECTIGO', 'VINTEGRIS', 'EADTRUST',
];

/** Un NIF español dentro del nombre del titular: «... - NIF B12345678». */
const NIF_EN_TEXTO = /\b([0-9XYZ][0-9]{7}[A-Z]|[A-HJNPQRSUVW][0-9]{7}[0-9A-J])\b/;

/**
 * Abre el PKCS#12 con su contraseña y devuelve lo que dice de verdad.
 *
 * Lanza si el fichero no es un PKCS#12 o si la contraseña está mal, con
 * un mensaje que se le pueda enseñar a alguien que no sabe qué es un
 * PKCS#12 — porque quien sube esto tiene una frutería, no un
 * departamento de sistemas.
 */
export function leerCertificado(pfx: Buffer, passphrase: string): DatosCertificado {
  let contexto: tls.SecureContext;
  try {
    contexto = tls.createSecureContext({ pfx, passphrase });
  } catch (e) {
    const texto = e instanceof Error ? e.message : String(e);
    if (/mac verify failure|invalid password|wrong final block/i.test(texto)) {
      throw new Error('La contraseña del certificado no es correcta.');
    }
    if (/not enough data|asn1|header too long|nested asn1/i.test(texto)) {
      throw new Error('El archivo no es un certificado .p12/.pfx. Si has descargado un .cer o un .crt, ése no lleva la clave privada y no sirve para conectar con la AEAT.');
    }
    throw new Error(`No se ha podido abrir el certificado: ${texto}`);
  }

  // getCertificate() no está en la documentación pública de Node, pero
  // es la vía que existe para sacar el certificado ya cargado sin
  // instalar un intérprete de PKCS#12. Si un día desapareciera, esto se
  // entera aquí y no en mitad de un envío.
  const contextoInterno = (contexto as unknown as { context?: { getCertificate?: () => Buffer } }).context;
  const der = contextoInterno?.getCertificate?.();
  if (!der || der.length === 0) {
    throw new Error('El archivo se ha abierto pero no contiene ningún certificado. Comprueba que exportaste el certificado con su clave privada.');
  }

  const x509 = new crypto.X509Certificate(der);
  const subject = x509.subject.replace(/\n/g, ', ');
  const issuer = x509.issuer.replace(/\n/g, ', ');

  return {
    subjectName: subject.slice(0, 500),
    issuerName: issuer.slice(0, 500),
    serialNumber: x509.serialNumber.slice(0, 64),
    notBefore: new Date(x509.validFrom),
    notAfter: new Date(x509.validTo),
    emisorReconocido: EMISORES_CONOCIDOS.some(a => issuer.toUpperCase().includes(a)),
    nifTitular: NIF_EN_TEXTO.exec(subject.toUpperCase())?.[1] ?? null,
  };
}

/**
 * Los avisos que hay que enseñarle al usuario nada más subirlo.
 *
 * Devuelve textos, no códigos: cada uno de estos casos acaba en la
 * pantalla tal cual, y son justo las cosas que uno quiere saber ANTES de
 * emitir facturas, no cuando la Agencia devuelva un error de saludo TLS.
 */
export function avisosDelCertificado(datos: DatosCertificado, nifEmpresa?: string | null): string[] {
  const avisos: string[] = [];
  const ahora = new Date();
  const dias = Math.floor((datos.notAfter.getTime() - ahora.getTime()) / 86_400_000);

  if (datos.notAfter < ahora) {
    avisos.push(`El certificado caducó el ${datos.notAfter.toLocaleDateString('es-ES')}. No se puede enviar nada con él.`);
  } else if (dias <= 30) {
    avisos.push(`El certificado caduca en ${dias} ${dias === 1 ? 'día' : 'días'}, el ${datos.notAfter.toLocaleDateString('es-ES')}. Renuévalo antes de que te pille.`);
  }

  if (datos.notBefore > ahora) {
    avisos.push(`Este certificado no empieza a ser válido hasta el ${datos.notBefore.toLocaleDateString('es-ES')}.`);
  }

  if (!datos.emisorReconocido) {
    avisos.push(`El emisor del certificado (${datos.issuerName}) no está entre las autoridades que sabemos reconocer. Puede ser válido igualmente, pero comprueba que sea un certificado admitido por la AEAT.`);
  }

  const nif = nifEmpresa?.trim().toUpperCase();
  if (nif && datos.nifTitular && datos.nifTitular !== nif) {
    avisos.push(`El certificado es de ${datos.nifTitular} y tus facturas las emite ${nif}. La AEAT rechazará el envío salvo que actúes como representante de esa otra empresa.`);
  }

  return avisos;
}
