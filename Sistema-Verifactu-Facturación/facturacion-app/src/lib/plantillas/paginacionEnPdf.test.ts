/**
 * EL CONTADOR DE PÁGINAS, COMPROBADO SOBRE EL PDF
 *
 * Que el texto se reconozca como paginación lo comprueba
 * `paginacion.test.ts`. Eso es sólo la mitad: entre reconocerlo y que en
 * la quinta hoja ponga «5 de 5» están pdfme, su sustitución de marcadores
 * y el repaginador, y ninguno de los tres se entera de lo que diga una
 * función pura.
 *
 * Así que aquí se genera una factura de varias páginas de verdad y se lee
 * el texto que ha quedado impreso en cada hoja.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import type { CompanySettings, Invoice } from '../types';
import { construirDatos, facturaDeMuestra } from './datos';
import { facturaDesdeCero } from './desdeCero';
import { campoNuevo } from './editor';
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

function facturaCon(lineas: number): Invoice {
  const muestra = facturaDeMuestra();
  const base = muestra.lineItems[0];
  return {
    ...muestra,
    lineItems: Array.from({ length: lineas }, (_, i) => ({
      ...base,
      id: `l${i}`,
      productName: `${base.productName} ${i + 1}`,
    })),
  } as Invoice;
}

/**
 * Una factura con un contador de páginas al pie, como el que el detector
 * reconoce en un PDF subido que lleve «Página 1 de 2».
 */
async function pdfConPaginacion(lineas: number): Promise<Uint8Array> {
  const analisis = facturaDesdeCero('generico', AJUSTES);
  const contador = campoNuevo('paginacion', { x: 150, y: 285, ancho: 45, alto: 5 });
  contador.clave = 'doc_pagina';
  contador.alineacion = 'right';
  analisis.campos.push(contador);

  const { plantilla } = compilarPlantilla(analisis, { fondo: FONDO, archivoOrigen: '' });
  const datos = construirDatos({ tipo: 'factura', documento: facturaCon(lineas) }, AJUSTES);
  return generarPdf(plantilla, datos, { titulo: 'Prueba' });
}

/** El texto impreso en una hoja del PDF, junto en una sola cadena. */
async function textoDeLaHoja(bytes: Uint8Array, numero: number): Promise<string> {
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise;
  const pagina = await doc.getPage(numero);
  const contenido = await pagina.getTextContent();
  return contenido.items.map((i: { str?: string }) => i.str ?? '').join(' ');
}

async function cuantasHojas(bytes: Uint8Array): Promise<number> {
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  return (await pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise).numPages;
}

describe('el contador de páginas cuenta de verdad', () => {
  it('en una factura de una hoja pone «1 de 1»', async () => {
    const bytes = await pdfConPaginacion(3);
    expect(await cuantasHojas(bytes)).toBe(1);
    expect(await textoDeLaHoja(bytes, 1)).toContain('Página 1 de 1');
  }, 60000);

  it('en una factura larga, cada hoja lleva su número', async () => {
    // Éste es el caso que estaba mal: con el texto calcado del PDF de
    // muestra, las cinco hojas salían con «Página 1 de 1».
    const bytes = await pdfConPaginacion(60);
    const hojas = await cuantasHojas(bytes);
    expect(hojas, 'hacen falta al menos dos hojas para que esto pruebe algo').toBeGreaterThan(1);

    for (let n = 1; n <= hojas; n++) {
      expect(await textoDeLaHoja(bytes, n), `la hoja ${n}`).toContain(`Página ${n} de ${hojas}`);
    }
  }, 120000);

  it('no queda ningún marcador sin sustituir', async () => {
    // Si `{currentPage}` llegara al papel, el cliente vería la fontanería.
    const texto = await textoDeLaHoja(await pdfConPaginacion(60), 1);
    expect(texto).not.toContain('{currentPage}');
    expect(texto).not.toContain('{totalPages}');
    expect(texto).not.toContain('{doc_pagina}');
  }, 120000);
});
