/**
 * FIRMA XAdES-EPES DE UNA FACTURAE — SOLO SERVIDOR
 *
 * Una Facturae para una Administración (FACe) tiene que ir firmada con el
 * certificado del emisor, en XAdES-EPES con la política de firma de
 * Facturae v3.1. El resultado es el fichero «.xsig».
 *
 * Se sigue lo que hace Facturae-PHP (josemmo/Facturae-PHP), cuyas firmas
 * acepta FACe: RSA-SHA512, huellas SHA-512, la política con su huella
 * SHA-1 publicada, y los elementos firmados canonizados «a mano». Eso es
 * seguro porque el XML lo genera este programa ya en forma canónica (ver
 * `generarFacturae`); lo único que hay que añadir al calcular la huella de
 * un trozo son los espacios de nombres que hereda de sus antepasados, que
 * la canonización inclusiva copia en su primera etiqueta.
 */

import crypto from 'node:crypto';
import forge from 'node-forge';
import { NS_DS, NS_FACTURAE } from './generar';

export const NS_XADES = 'http://uri.etsi.org/01903/v1.3.2#';
const POLITICA_URL = 'http://www.facturae.es/politica_de_firma_formato_facturae/politica_de_firma_formato_facturae_v3_1.pdf';
const POLITICA_NOMBRE = 'Política de Firma FacturaE v3.1';
const POLITICA_HUELLA_SHA1 = 'Ohixl6upD6av8N7pEvDABhEL6hM=';

const ESPACIOS: Record<string, string> = { 'xmlns:ds': NS_DS, 'xmlns:fe': NS_FACTURAE, 'xmlns:xades': NS_XADES };

export interface MaterialFirma {
  clave: crypto.KeyObject;
  /** Certificados en DER (el del firmante primero). */
  certificados: Buffer[];
  emisorDN: string;
  serie: string;
  modulo: Buffer;
  exponente: Buffer;
}

/** Nombres de atributo de un DN, como los escribe Facturae-PHP (RFC 4514). */
const TIPOS_DN: Record<string, string> = {
  CN: 'CN', L: 'L', ST: 'ST', O: 'O', OU: 'OU', C: 'C', STREET: 'STREET', DC: 'DC', UID: 'UID', GN: 'GN', SN: 'SN',
  givenName: 'GN', surname: 'SN', commonName: 'CN', organizationName: 'O', organizationalUnitName: 'OU', countryName: 'C',
  localityName: 'L', stateOrProvinceName: 'ST',
};
const OIDS_DN: Record<string, string> = { '2.5.4.97': 'OID.2.5.4.97', '2.5.4.5': 'OID.2.5.4.5', '2.5.4.12': 'OID.2.5.4.12', '2.5.4.4': 'SN', '2.5.4.42': 'GN' };

function dn(atributos: forge.pki.CertificateField[]): string {
  const partes: string[] = [];
  for (const a of atributos) {
    const tipo = (a.shortName && TIPOS_DN[a.shortName]) || (a.name && TIPOS_DN[a.name]) || (a.type && OIDS_DN[a.type]);
    if (tipo) partes.push(`${tipo}=${String(a.value)}`);
  }
  return partes.reverse().join(', ');
}

const aBuffer = (bytes: string) => Buffer.from(bytes, 'binary');

/** Abre el .p12/.pfx y saca la clave y el certificado del firmante. */
export function leerMaterialFirma(p12: Buffer, contrasena: string): MaterialFirma {
  let pkcs12: forge.pkcs12.Pkcs12Pfx;
  try {
    pkcs12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(p12.toString('binary')), contrasena);
  } catch {
    throw new Error('No se ha podido abrir el certificado: la contraseña no es correcta o el fichero está dañado.');
  }
  const claves = [
    ...(pkcs12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? []),
    ...(pkcs12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? []),
  ].map(b => b.key).filter((k): k is forge.pki.rsa.PrivateKey => !!k);
  const certs = (pkcs12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [])
    .map(b => b.cert).filter((c): c is forge.pki.Certificate => !!c);
  const clave = claves[0];
  if (!clave || certs.length === 0) throw new Error('El certificado no trae clave privada y certificado.');

  // El del firmante es el que casa con la clave; los demás, la cadena.
  const propio = certs.find(c => (c.publicKey as forge.pki.rsa.PublicKey).n?.equals(clave.n)) ?? certs[0];
  const ordenados = [propio, ...certs.filter(c => c !== propio)];

  return {
    clave: crypto.createPrivateKey(forge.pki.privateKeyToPem(clave)),
    certificados: ordenados.map(c => aBuffer(forge.asn1.toDer(forge.pki.certificateToAsn1(c)).getBytes())),
    emisorDN: dn(propio.issuer.attributes),
    serie: BigInt(`0x${propio.serialNumber}`).toString(10),
    modulo: Buffer.from(clave.n.toByteArray()).subarray(clave.n.toByteArray()[0] === 0 ? 1 : 0),
    exponente: Buffer.from(clave.e.toByteArray()),
  };
}

const sha512 = (texto: string | Buffer) => crypto.createHash('sha512').update(texto).digest('base64');

/**
 * Pone en la primera etiqueta de `xml` los espacios de nombres heredados,
 * con todos los atributos en el orden de la canonización (primero los
 * espacios de nombres, luego los demás, cada grupo por nombre).
 */
export function conEspaciosHeredados(xml: string, espacios: Record<string, string> = ESPACIOS): string {
  const fin = xml.indexOf('>');
  const apertura = xml.slice(0, fin);
  const nombre = apertura.split(/\s/, 1)[0];
  const atributos: Record<string, string> = { ...espacios };
  for (const m of apertura.matchAll(/\s([0-9A-Za-z:_-]+)="([^"]*)"/g)) atributos[m[1]] = m[2];
  const ns = Object.keys(atributos).filter(k => k.startsWith('xmlns:')).sort();
  const resto = Object.keys(atributos).filter(k => !k.startsWith('xmlns:')).sort();
  return `${nombre}${[...ns, ...resto].map(k => ` ${k}="${atributos[k]}"`).join('')}${xml.slice(fin)}`;
}

/** Fecha con zona horaria, como `date('c')` de PHP. */
function fechaConZona(d: Date): string {
  const z = -d.getTimezoneOffset();
  const s = z >= 0 ? '+' : '-';
  const p = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${s}${p(z / 60)}:${p(z % 60)}`;
}

export function firmarFacturae(xml: string, material: MaterialFirma, ahora: Date = new Date()): string {
  const inicio = xml.indexOf('<fe:Facturae ');
  const cierre = xml.lastIndexOf('</fe:Facturae>');
  if (inicio < 0 || cierre < 0) throw new Error('El XML no es una Facturae.');
  const raiz = conEspaciosHeredados(xml.slice(inicio, cierre + '</fe:Facturae>'.length), { 'xmlns:ds': NS_DS });

  const id = crypto.randomInt(1, 2 ** 31).toString();
  const ids = {
    firma: `Signature${id}`, infoFirmada: `Signature${id}-SignedInfo`, propiedades: `Signature${id}-SignedProperties`,
    refPropiedades: `SignedPropertiesID${id}`, certificado: `Certificate${id}`, referencia: `Reference-ID-${id}`,
    valor: `SignatureValue${id}`, objeto: `Signature${id}-Object`,
  };

  const propiedades = `<xades:SignedProperties Id="${ids.propiedades}">`
    + '<xades:SignedSignatureProperties>'
    + `<xades:SigningTime>${fechaConZona(ahora)}</xades:SigningTime>`
    + '<xades:SigningCertificate><xades:Cert><xades:CertDigest>'
    + '<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha512"></ds:DigestMethod>'
    + `<ds:DigestValue>${sha512(material.certificados[0])}</ds:DigestValue>`
    + '</xades:CertDigest><xades:IssuerSerial>'
    + `<ds:X509IssuerName>${material.emisorDN.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</ds:X509IssuerName>`
    + `<ds:X509SerialNumber>${material.serie}</ds:X509SerialNumber>`
    + '</xades:IssuerSerial></xades:Cert></xades:SigningCertificate>'
    + '<xades:SignaturePolicyIdentifier><xades:SignaturePolicyId><xades:SigPolicyId>'
    + `<xades:Identifier>${POLITICA_URL}</xades:Identifier><xades:Description>${POLITICA_NOMBRE}</xades:Description>`
    + '</xades:SigPolicyId><xades:SigPolicyHash>'
    + '<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></ds:DigestMethod>'
    + `<ds:DigestValue>${POLITICA_HUELLA_SHA1}</ds:DigestValue>`
    + '</xades:SigPolicyHash></xades:SignaturePolicyId></xades:SignaturePolicyIdentifier>'
    + '<xades:SignerRole><xades:ClaimedRoles><xades:ClaimedRole>emisor</xades:ClaimedRole></xades:ClaimedRoles></xades:SignerRole>'
    + '</xades:SignedSignatureProperties>'
    + '<xades:SignedDataObjectProperties>'
    + `<xades:DataObjectFormat ObjectReference="#${ids.referencia}">`
    + '<xades:Description>Factura electrónica</xades:Description>'
    + '<xades:ObjectIdentifier><xades:Identifier Qualifier="OIDAsURN">urn:oid:1.2.840.10003.5.109.10</xades:Identifier></xades:ObjectIdentifier>'
    + '<xades:MimeType>text/xml</xades:MimeType>'
    + '</xades:DataObjectFormat>'
    + '</xades:SignedDataObjectProperties>'
    + '</xades:SignedProperties>';

  const infoClave = `<ds:KeyInfo Id="${ids.certificado}"><ds:X509Data>`
    + material.certificados.map(c => `<ds:X509Certificate>${c.toString('base64')}</ds:X509Certificate>`).join('')
    + '</ds:X509Data><ds:KeyValue><ds:RSAKeyValue>'
    + `<ds:Modulus>${material.modulo.toString('base64')}</ds:Modulus><ds:Exponent>${material.exponente.toString('base64')}</ds:Exponent>`
    + '</ds:RSAKeyValue></ds:KeyValue></ds:KeyInfo>';

  const infoFirmada = `<ds:SignedInfo Id="${ids.infoFirmada}">`
    + '<ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></ds:CanonicalizationMethod>'
    + '<ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha512"></ds:SignatureMethod>'
    + `<ds:Reference Id="${ids.refPropiedades}" Type="http://uri.etsi.org/01903#SignedProperties" URI="#${ids.propiedades}">`
    + '<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha512"></ds:DigestMethod>'
    + `<ds:DigestValue>${sha512(conEspaciosHeredados(propiedades))}</ds:DigestValue>`
    + '</ds:Reference>'
    + `<ds:Reference URI="#${ids.certificado}">`
    + '<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha512"></ds:DigestMethod>'
    + `<ds:DigestValue>${sha512(conEspaciosHeredados(infoClave))}</ds:DigestValue>`
    + '</ds:Reference>'
    + `<ds:Reference Id="${ids.referencia}" Type="http://www.w3.org/2000/09/xmldsig#Object" URI="">`
    + '<ds:Transforms><ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></ds:Transform></ds:Transforms>'
    + '<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha512"></ds:DigestMethod>'
    + `<ds:DigestValue>${sha512(raiz)}</ds:DigestValue>`
    + '</ds:Reference>'
    + '</ds:SignedInfo>';

  const valor = crypto.sign('sha512', Buffer.from(conEspaciosHeredados(infoFirmada)), material.clave).toString('base64');

  const firma = `<ds:Signature xmlns:xades="${NS_XADES}" Id="${ids.firma}">`
    + infoFirmada
    + `<ds:SignatureValue Id="${ids.valor}">${valor}</ds:SignatureValue>`
    + infoClave
    + `<ds:Object Id="${ids.objeto}"><xades:QualifyingProperties Target="#${ids.firma}">${propiedades}</xades:QualifyingProperties></ds:Object>`
    + '</ds:Signature>';

  const firmada = raiz.replace(/<\/fe:Facturae>$/, `${firma}</fe:Facturae>`);
  return xml.slice(0, inicio) + firmada + xml.slice(cierre + '</fe:Facturae>'.length);
}
