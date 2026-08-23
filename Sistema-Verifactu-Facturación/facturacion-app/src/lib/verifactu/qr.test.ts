import { describe, it, expect } from 'vitest';
import { urlCotejoAeat, generarQrVerifactu } from './qr';

const datos = {
  nifEmisor: 'B12345678',
  numeroFactura: 'FAC-2026-0042',
  fechaEmision: '2026-08-19',
  importeTotal: 1234.5,
};

describe('urlCotejoAeat', () => {
  it('apunta al servicio de cotejo de la AEAT, siempre en producción', () => {
    // Nunca al sandbox: una factura de verdad no se enlaza a un entorno de
    // pruebas, aunque la empresa tenga elegido "test" para el envío SOAP.
    expect(urlCotejoAeat(datos)).toMatch(/^https:\/\/www2\.agenciatributaria\.gob\.es\/wlpl\/TIKE-CONT\/ValidarQR\?/);
  });

  it('lleva los cuatro parámetros que pide la AEAT', () => {
    const url = new URL(urlCotejoAeat(datos));
    expect(url.searchParams.get('nif')).toBe('B12345678');
    expect(url.searchParams.get('numserie')).toBe('FAC-2026-0042');
    expect(url.searchParams.get('fecha')).toBe('19-08-2026');
    expect(url.searchParams.get('importe')).toBe('1234.50');
  });

  it('la fecha lleva guiones, no barras: el formato que pide la AEAT, no el de pantalla', () => {
    const url = new URL(urlCotejoAeat(datos));
    expect(url.searchParams.get('fecha')).not.toContain('/');
  });

  it('el NIF se limpia de espacios y guiones', () => {
    const url = new URL(urlCotejoAeat({ ...datos, nifEmisor: ' b 1234-5678 ' }));
    expect(url.searchParams.get('nif')).toBe('B12345678');
  });

  it('el importe siempre lleva dos decimales, aunque sean redondos', () => {
    const url = new URL(urlCotejoAeat({ ...datos, importeTotal: 100 }));
    expect(url.searchParams.get('importe')).toBe('100.00');
  });
});

describe('generarQrVerifactu', () => {
  it('devuelve una imagen PNG en base64, no la URL en texto', async () => {
    const qr = await generarQrVerifactu(datos);
    expect(qr).toMatch(/^data:image\/png;base64,/);
  });

  it('sin NIF no genera nada: no hay factura que identificar', async () => {
    expect(await generarQrVerifactu({ ...datos, nifEmisor: '' })).toBe('');
  });

  it('sin número de factura tampoco', async () => {
    expect(await generarQrVerifactu({ ...datos, numeroFactura: '' })).toBe('');
  });

  it('sin fecha tampoco', async () => {
    expect(await generarQrVerifactu({ ...datos, fechaEmision: '' })).toBe('');
  });
});
