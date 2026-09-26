import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import forge from 'node-forge';
import type { Invoice } from '../types';
import { generarFacturae } from './generar';
import { conEspaciosHeredados, firmarFacturae, leerMaterialFirma } from './firmar';

/** Un certificado de pruebas en .p12, como el que sube un negocio. */
function p12DePrueba(contrasena: string): Buffer {
  const claves = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = claves.publicKey;
  cert.serialNumber = '0a1b2c3d';
  cert.validity.notBefore = new Date(Date.now() - 86_400_000);
  cert.validity.notAfter = new Date(Date.now() + 365 * 86_400_000);
  const sujeto = [{ name: 'commonName', value: 'GARCIA LOPEZ ALEXANDER - 78837942Z' }, { name: 'countryName', value: 'ES' }];
  cert.setSubject(sujeto);
  cert.setIssuer([{ name: 'commonName', value: 'AC Pruebas' }, { name: 'organizationName', value: 'FNMT-RCM' }, { name: 'countryName', value: 'ES' }]);
  cert.sign(claves.privateKey, forge.md.sha256.create());
  const asn1 = forge.pkcs12.toPkcs12Asn1(claves.privateKey, [cert], contrasena, { algorithm: '3des' });
  return Buffer.from(forge.asn1.toDer(asn1).getBytes(), 'binary');
}

const factura = {
  id: 'f1', number: 'FAC-2026-0012', series: 'FAC', clientId: 'c1', clientName: 'Ayuntamiento de Ejemplo', clientNif: 'P4600000J',
  clientAddress: 'Plaza Mayor 1', issueDate: '2026-09-20', dueDate: '2026-10-20', status: 'emitida',
  lineItems: [{ id: 'l1', productId: 'p1', productName: 'Mantenimiento "anual" & revisión', productRef: '', quantity: 1, unitPrice: 100, unit: 'ud', taxRate: 21, discountPercent: 0, subtotal: 100, taxAmount: 21, total: 121 }],
  subtotal: 100, totalDiscount: 0, taxBreakdown: [{ rate: 21, base: 100, amount: 21 }], totalTax: 21, total: 121,
  paymentMethod: 'transferencia', notes: '', createdAt: '', updatedAt: '', tipo: 'factura',
} as unknown as Invoice;

const EMPRESA = { businessName: 'GARCIA LOPEZ ALEXANDER', nif: '78837942Z', address: 'Calle Mayor 1', city: 'Valencia', postalCode: '46001', province: 'Valencia', iban: '', igicEnabled: false };

describe('firmarFacturae', () => {
  const material = leerMaterialFirma(p12DePrueba('1234'), '1234');

  it('abre el .p12 y saca clave, certificado y emisor', () => {
    expect(material.certificados).toHaveLength(1);
    expect(material.emisorDN).toBe('C=ES, O=FNMT-RCM, CN=AC Pruebas');
    expect(material.serie).toBe(String(0x0a1b2c3d));
  });

  it('con la contraseña mala avisa en cristiano', () => {
    expect(() => leerMaterialFirma(p12DePrueba('1234'), 'otra')).toThrow(/contraseña/);
  });

  it('firma: la firma del SignedInfo se verifica con la clave pública del certificado', () => {
    const xml = generarFacturae({ factura, empresa: EMPRESA });
    const firmada = firmarFacturae(xml, material, new Date('2026-09-26T10:00:00Z'));
    if (process.env.FACTURAE_SALIDA) writeFileSync(join(process.env.FACTURAE_SALIDA, 'firmada.xsig'), firmada);

    expect(firmada).toContain('<ds:Signature xmlns:xades="http://uri.etsi.org/01903/v1.3.2#"');
    expect(firmada).toContain('<xades:Identifier>http://www.facturae.es/politica_de_firma_formato_facturae/politica_de_firma_formato_facturae_v3_1.pdf</xades:Identifier>');

    const infoFirmada = /<ds:SignedInfo[\s\S]*?<\/ds:SignedInfo>/.exec(firmada)![0];
    const valor = /<ds:SignatureValue[^>]*>([^<]+)<\/ds:SignatureValue>/.exec(firmada)![1];
    const certDer = Buffer.from(/<ds:X509Certificate>([^<]+)</.exec(firmada)![1], 'base64');
    const publica = new crypto.X509Certificate(certDer).publicKey;
    expect(crypto.verify('sha512', Buffer.from(conEspaciosHeredados(infoFirmada)), publica, Buffer.from(valor, 'base64'))).toBe(true);
  });
});
