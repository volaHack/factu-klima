/**
 * El formato de cada campo, comprobado en el PDF de verdad: se compila una
 * plantilla, se le pone formato a unos campos, se imprime una factura y se
 * vuelve a leer el texto del PDF.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { InvoiceStatus, PaymentMethod, UnitOfMeasure, type CompanySettings, type Invoice } from '../types';
import { construirDatos } from './datos';
import { detectar } from './deteccion';
import { agruparEnLineas } from './extraccion';
import { construirEntrada, generarPdf } from './generar';
import { compilarPlantilla, presentacionesDePlantilla } from './plantilla';
import type { AnalisisPdf, CampoDetectado, ItemTexto, PaginaExtraida } from './tipos';

const FONDO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const MM = 0.3528;

const t = (texto: string, x: number, y: number, tamano = 9, negrita = false): ItemTexto => ({
  texto, x, y, ancho: texto.length * tamano * 0.5 * MM, alto: tamano * MM, tamano,
  fuente: 'Helvetica', negrita, cursiva: false, serif: false, monoespaciada: false, color: '#000000',
});

function pagina(): PaginaExtraida {
  const items = [
    t('MI EMPRESA S.L.', 15, 18, 13, true), t('NIF: B12345678', 15, 25),
    t('FACTURA', 150, 18, 16, true),
    t('Nº factura:', 140, 28), t('AAA-0000-0000', 168, 28),
    t('Fecha:', 140, 33), t('01/01/2020', 168, 33),
    t('FACTURAR A:', 15, 52, 9, true), t('CLIENTE DE MUESTRA S.A.', 15, 58, 10, true), t('NIF: A87654321', 15, 63),
    t('Ref.', 15, 90, 9, true), t('Descripción', 32, 90, 9, true), t('Cant.', 118, 90, 9, true), t('Importe', 170, 90, 9, true),
    t('REF-001', 15, 98), t('Producto de muestra', 32, 98), t('1', 120, 98), t('10,00 €', 172, 98),
    t('TOTAL:', 140, 250, 11, true), t('12,10 €', 168, 250, 11, true),
  ];
  return { ancho: 210, alto: 297, items, lineas: agruparEnLineas(items), totalPaginas: 1, bitmap: { dataUrl: FONDO, anchoPx: 1654, altoPx: 2339, pxPorMm: 7.87 } };
}

const AJUSTES = { businessName: 'Mi Empresa S.L.', nif: 'B12345678', address: 'Calle Mayor 1', city: 'Madrid', postalCode: '28001', province: 'Madrid', igicEnabled: false } as CompanySettings;

const FACTURA: Invoice = {
  id: 'f1', number: 'FAC-2026-0042', series: 'FAC', clientId: 'c1', clientName: 'comercial rodríguez s.l.', clientNif: 'A87654321',
  clientAddress: 'Avenida del Puerto 45', issueDate: '2026-10-05', dueDate: '2026-11-04', status: InvoiceStatus.EMITIDA,
  lineItems: [{ id: 'l1', productId: 'p1', productName: 'Producto', productRef: 'R1', quantity: 1, unitPrice: 1234.5, unit: UnitOfMeasure.UNIDAD, taxRate: 21, discountPercent: 0, subtotal: 1234.5, taxAmount: 259.25, total: 1493.75 }],
  subtotal: 1234.5, totalDiscount: 0, taxBreakdown: [{ rate: 21, base: 1234.5, amount: 259.25 }], totalTax: 259.25, total: 1493.75,
  paymentMethod: PaymentMethod.TRANSFERENCIA, notes: '', createdAt: '2026-10-05T10:00:00.000Z', updatedAt: '2026-10-05T10:00:00.000Z',
};

async function textoDelPdf(bytes: Uint8Array): Promise<string> {
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, isEvalSupported: false }).promise;
  let salida = '';
  for (let n = 1; n <= doc.numPages; n++) {
    const contenido = await (await doc.getPage(n)).getTextContent();
    salida += (contenido.items as { str: string }[]).map(i => i.str).join(' ') + '\n';
  }
  return salida;
}

beforeAll(() => {
  globalThis.fetch = (async (entrada: RequestInfo | URL) => {
    const archivo = readFileSync(join(process.cwd(), 'public', String(entrada).replace(/^\//, '')));
    return new Response(new Uint8Array(archivo), { status: 200 });
  }) as typeof fetch;
});

function conFormato(analisis: AnalisisPdf, clave: string, cambios: Partial<CampoDetectado>): AnalisisPdf {
  return { ...analisis, campos: analisis.campos.map(c => (c.clave === clave ? { ...c, ...cambios } : c)) };
}

describe('formato de campo en el PDF', () => {
  let analisis = detectar(pagina(), { ajustes: AJUSTES });
  analisis = conFormato(analisis, 'doc_fecha', { presentacion: { fecha: 'd de mmmm de aaaa' } });
  analisis = conFormato(analisis, 'cliente_nombre', { presentacion: { letras: 'mayusculas' } });
  analisis = conFormato(analisis, 'total_general', { presentacion: { simbolo: 'eur' } });
  analisis = {
    ...analisis,
    campos: [...analisis.campos, {
      ...analisis.campos[0], id: 'rotulo-1', clave: null, fijo: true, manual: true, presentacion: undefined,
      texto: 'Pág. {pagina}/{paginas} · NIF {cliente_nif} {inventado}', x: 15, y: 280, ancho: 120, alto: 5,
    }],
  };

  analisis = {
    ...analisis,
    formas: [
      { id: 'a', tipo: 'linea', x: 140, y: 255, ancho: 55, alto: 1, color: '#b02a5c', grosor: 0.6, relleno: '', radio: 0 },
      { id: 'b', tipo: 'rectangulo', x: 12, y: 240, ancho: 100, alto: 30, color: '#333333', grosor: 0.3, relleno: '#f3f3f3', radio: 2 },
      { id: 'c', tipo: 'elipse', x: 180, y: 10, ancho: 15, alto: 15, color: '#333333', grosor: 0.5, relleno: '', radio: 0 },
    ],
  };
  const { plantilla } = compilarPlantilla(analisis, { fondo: FONDO, archivoOrigen: 'muestra.pdf' });
  const datos = construirDatos({ tipo: 'factura', documento: FACTURA }, AJUSTES);

  it('la plantilla guarda qué campos llevan formato', () => {
    const p = presentacionesDePlantilla(plantilla);
    expect(Object.values(p).map(x => x.clave).sort()).toEqual(['cliente_nombre', 'doc_fecha', 'total_general']);
  });

  it('la entrada lleva el dato ya presentado', () => {
    const entrada = construirEntrada(plantilla, datos);
    const valores = Object.entries(entrada).filter(([k]) => k.startsWith('__p_')).map(([, v]) => v);
    expect(valores).toContain('5 de octubre de 2026');
    expect(valores).toContain('COMERCIAL RODRÍGUEZ S.L.');
    expect(valores).toContain('1.493,75 EUR');
  });

  it('y el PDF lo imprime así', async () => {
    const texto = await textoDelPdf(await generarPdf(plantilla, datos));
    expect(texto).toContain('5 de octubre de 2026');
    expect(texto).toContain('COMERCIAL RODRÍGUEZ S.L.');
    expect(texto).toContain('1.493,75 EUR');
    expect(texto).not.toContain('05/10/2026');
    expect(texto).toContain('Pág. 1/1 · NIF A87654321');
    expect(texto).not.toContain('inventado');
  }, 30_000);

  it('las formas van entre el calco y los textos', () => {
    const nombres = ((plantilla.basePdf as { staticSchema: { name: string }[] }).staticSchema).map(e => e.name);
    expect(nombres.slice(0, 4)).toEqual(['__calco', '__forma_0', '__forma_1', '__forma_2']);
  });

  it('una plantilla sin formatos sigue imprimiendo como siempre', async () => {
    const { plantilla: normal } = compilarPlantilla(detectar(pagina(), { ajustes: AJUSTES }), { fondo: FONDO, archivoOrigen: 'muestra.pdf' });
    expect(presentacionesDePlantilla(normal)).toEqual({});
    const texto = await textoDelPdf(await generarPdf(normal, datos));
    expect(texto).toContain('05/10/2026');
  }, 30_000);
});
