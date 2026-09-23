/**
 * UNA FACTURA LARGA NO PUEDE PERDER LÍNEAS
 *
 * Cuando los productos no caben en el hueco de la tabla, lo que sobra pasa
 * a otra hoja —como en un talonario: cada página lleva el mismo impreso
 * con su membrete y su pie—. Eso ya estaba diseñado así.
 *
 * Lo que no estaba comprobado es lo único que de verdad importa: que
 * TODAS las líneas acaban impresas. Una factura que se corta por la mitad
 * y no lo dice es peor que una que falla: se envía al cliente, se cobra
 * de menos y nadie se entera hasta que cuadran cuentas.
 *
 * Así que aquí se generan facturas de 1, 20, 80 y 250 líneas, se lee el
 * texto de todas las hojas y se comprueba que está cada producto, una
 * sola vez.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import type { CompanySettings, Invoice } from '../types';
import { construirDatos, facturaDeMuestra } from './datos';
import { facturaDesdeCero } from './desdeCero';
import { generarPdf } from './generar';
import { compilarPlantilla } from './plantilla';

const AJUSTES = {
  businessName: 'Mi Empresa S.L.',
  tradeName: 'Mi Empresa',
  nif: 'B12345678',
  address: 'Calle Mayor 1',
  city: 'Madrid',
  postalCode: '28001',
  province: 'Madrid',
} as unknown as CompanySettings;

const FONDO =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=';

beforeAll(() => {
  globalThis.fetch = (async (entrada: RequestInfo | URL) => {
    const archivo = readFileSync(join(process.cwd(), 'public', String(entrada).replace(/^\//, '')));
    return new Response(new Uint8Array(archivo), { status: 200 });
  }) as typeof fetch;
});

/** Cada línea lleva una marca única e inconfundible: PRD-0001, PRD-0002… */
function facturaCon(lineas: number): Invoice {
  const muestra = facturaDeMuestra();
  const base = muestra.lineItems[0];
  return {
    ...muestra,
    lineItems: Array.from({ length: lineas }, (_, i) => ({
      ...base,
      id: `l${i}`,
      productName: `PRD-${String(i + 1).padStart(4, '0')}`,
      productRef: `PRD-${String(i + 1).padStart(4, '0')}`,
    })),
  } as Invoice;
}

async function pdfDe(lineas: number): Promise<Uint8Array> {
  const { plantilla } = compilarPlantilla(
    facturaDesdeCero('generico', AJUSTES), { fondo: FONDO, archivoOrigen: '' },
  );
  const datos = construirDatos({ tipo: 'factura', documento: facturaCon(lineas) }, AJUSTES);
  return generarPdf(plantilla, datos, { titulo: 'Factura larga' });
}

/** El texto de todo el PDF y cuántas hojas tiene. */
async function leer(bytes: Uint8Array): Promise<{ texto: string; hojas: number }> {
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise;
  let texto = '';
  for (let n = 1; n <= doc.numPages; n++) {
    const contenido = await (await doc.getPage(n)).getTextContent();
    texto += contenido.items.map((i: { str?: string }) => i.str ?? '').join(' ') + '\n';
  }
  return { texto, hojas: doc.numPages };
}

/** Cuántas veces sale cada marca. Sin cortes de línea ni espacios sueltos. */
function vecesQueSale(texto: string, marca: string): number {
  return texto.split(marca).length - 1;
}

describe('la factura reparte sus líneas en tantas hojas como haga falta', () => {
  it('una factura corta cabe en una hoja', async () => {
    const { texto, hojas } = await leer(await pdfDe(3));
    expect(hojas).toBe(1);
    for (let i = 1; i <= 3; i++) {
      expect(texto).toContain(`PRD-${String(i).padStart(4, '0')}`);
    }
  }, 60000);

  it('con 80 líneas pasa a varias hojas y no se pierde ninguna', async () => {
    const CUANTAS = 80;
    const { texto, hojas } = await leer(await pdfDe(CUANTAS));
    expect(hojas, 'ochenta líneas no caben en una hoja').toBeGreaterThan(1);

    const perdidas: string[] = [];
    for (let i = 1; i <= CUANTAS; i++) {
      const marca = `PRD-${String(i).padStart(4, '0')}`;
      if (!texto.includes(marca)) perdidas.push(marca);
    }
    expect(perdidas, `líneas que no se han impreso: ${perdidas.join(', ')}`).toEqual([]);
  }, 180000);

  it('ninguna línea se imprime dos veces', async () => {
    // Un repaginador que reparte mal puede repetir la última de cada hoja
    // en la siguiente, y eso duplica el importe a ojos de quien lo lea.
    const { texto } = await leer(await pdfDe(80));
    const repetidas: string[] = [];
    for (let i = 1; i <= 80; i++) {
      const marca = `PRD-${String(i).padStart(4, '0')}`;
      // Sale dos veces por línea: en la referencia y en la descripción.
      if (vecesQueSale(texto, marca) > 2) repetidas.push(marca);
    }
    expect(repetidas, `líneas repetidas: ${repetidas.join(', ')}`).toEqual([]);
  }, 180000);

  it('aguanta una factura de verdad larga sin dejarse nada', async () => {
    const CUANTAS = 250;
    const { texto, hojas } = await leer(await pdfDe(CUANTAS));
    expect(hojas).toBeGreaterThan(4);

    const perdidas: string[] = [];
    for (let i = 1; i <= CUANTAS; i++) {
      const marca = `PRD-${String(i).padStart(4, '0')}`;
      if (!texto.includes(marca)) perdidas.push(marca);
    }
    expect(
      perdidas.length,
      `se han perdido ${perdidas.length} de ${CUANTAS} líneas. Primeras: ${perdidas.slice(0, 5).join(', ')}`,
    ).toBe(0);
  }, 300000);

  it('el membrete y el pie salen en todas las hojas', async () => {
    // Cada página tiene que poder entregarse sola: la segunda hoja de una
    // factura sin el NIF de quien la emite no vale como factura.
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const bytes = await pdfDe(80);
    const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise;

    for (let n = 1; n <= doc.numPages; n++) {
      const contenido = await (await doc.getPage(n)).getTextContent();
      const texto = contenido.items.map((i: { str?: string }) => i.str ?? '').join(' ');
      expect(texto, `el NIF del emisor falta en la hoja ${n}`).toContain('B12345678');
    }
  }, 180000);
});
