import { describe, it, expect } from 'vitest';
import { urlCotejoAeat, generarQrVerifactu, validarDatosQr } from './qr';

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

/**
 * Los formatos salen del apartado 6 del documento técnico de la AEAT, que es
 * el que fija qué acepta el servicio de cotejo. Un QR con un parámetro mal
 * formado se escanea perfectamente y falla al abrirlo, que es la peor manera
 * de fallar: se descubre en casa del cliente.
 */
describe('validarDatosQr', () => {
  it('unos datos completos y bien formados no tienen nada que objetar', () => {
    expect(validarDatosQr(datos)).toEqual([]);
  });

  it('sin NIF lo dice con esas palabras', () => {
    expect(validarDatosQr({ ...datos, nifEmisor: '' }).join(' ')).toContain('falta el NIF del expedidor');
  });

  it('un NIF que no llega a nueve caracteres tampoco vale', () => {
    expect(validarDatosQr({ ...datos, nifEmisor: 'B123' })).not.toEqual([]);
  });

  it('un NIF con espacios y guiones sí vale: se limpia antes de mirarlo', () => {
    expect(validarDatosQr({ ...datos, nifEmisor: ' b 1234-5678 ' })).toEqual([]);
  });

  it('sin número de factura no hay nada que identificar', () => {
    expect(validarDatosQr({ ...datos, numeroFactura: '' }).join(' ')).toContain('falta el número');
  });

  it('el número de serie no puede pasar de 60 caracteres', () => {
    expect(validarDatosQr({ ...datos, numeroFactura: 'F'.repeat(61) }).join(' ')).toContain('60 caracteres');
  });

  it('el número de serie sólo admite ASCII imprimible', () => {
    // «las cadenas de texto solo pueden contener caracteres ASCII con códigos
    // del 32 al 126» (apartado 4).
    expect(validarDatosQr({ ...datos, numeroFactura: 'FAC-2026-Ñ42' })).not.toEqual([]);
  });

  it('una fecha que no se entiende se canta', () => {
    expect(validarDatosQr({ ...datos, fechaEmision: 'ayer' }).join(' ')).toContain('fecha');
  });

  it('un importe de más de doce dígitos enteros no lo admite la AEAT', () => {
    expect(validarDatosQr({ ...datos, importeTotal: 1e13 }).join(' ')).toContain('12 dígitos');
  });

  it('un importe grande pero razonable sí', () => {
    expect(validarDatosQr({ ...datos, importeTotal: 987654321.99 })).toEqual([]);
  });
});
