import { describe, expect, it } from 'vitest';
import { direccionDeCuenta, leerCorreoPostmark } from './correo';

const PDF = Buffer.from('%PDF-1.4 factura de prueba'.repeat(1000)).toString('base64');
const CLAVE = 'abcdefghijklmnop1234';

describe('leerCorreoPostmark', () => {
  it('saca la clave del MailboxHash y se queda con el PDF', () => {
    const c = leerCorreoPostmark({
      MailboxHash: CLAVE, FromFull: { Email: 'facturas@proveedor.es' }, Subject: 'Factura 123',
      Attachments: [{ Name: 'F123.pdf', Content: PDF, ContentType: 'application/pdf', ContentLength: 26000 }],
    });
    expect(c.clave).toBe(CLAVE);
    expect(c.remitente).toBe('facturas@proveedor.es');
    expect(c.adjuntos).toHaveLength(1);
    expect(c.adjuntos[0].mime).toBe('application/pdf');
  });

  it('si no viene MailboxHash, la clave sale de la dirección', () => {
    const c = leerCorreoPostmark({ ToFull: [{ Email: `abc123+${CLAVE}@inbound.postmarkapp.com` }], Attachments: [] });
    expect(c.clave).toBe(CLAVE);
  });

  it('un PDF que llega como octet-stream se reconoce por la extensión', () => {
    const c = leerCorreoPostmark({ MailboxHash: CLAVE, Attachments: [{ Name: 'factura.PDF', Content: PDF, ContentType: 'application/octet-stream', ContentLength: 26000 }] });
    expect(c.adjuntos[0].mime).toBe('application/pdf');
  });

  it('fuera los logos de la firma, los .docx y lo demasiado grande', () => {
    const c = leerCorreoPostmark({
      MailboxHash: CLAVE,
      Attachments: [
        { Name: 'logo.png', Content: 'aGVsbG8=', ContentType: 'image/png', ContentLength: 3000 },
        { Name: 'contrato.docx', Content: PDF, ContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ContentLength: 26000 },
        { Name: 'enorme.pdf', Content: PDF, ContentType: 'application/pdf', ContentLength: 50_000_000 },
      ],
    });
    expect(c.adjuntos).toHaveLength(0);
    expect(c.descartados).toBe(3);
  });

  it('una clave con otra forma no vale', () => {
    expect(leerCorreoPostmark({ MailboxHash: 'corta' }).clave).toBeNull();
  });
});

describe('direccionDeCuenta', () => {
  it('pone la clave con «+» delante de la arroba', () => {
    expect(direccionDeCuenta('abc123@inbound.postmarkapp.com', CLAVE)).toBe(`abc123+${CLAVE}@inbound.postmarkapp.com`);
    expect(direccionDeCuenta('no es un correo', CLAVE)).toBeNull();
  });
});
