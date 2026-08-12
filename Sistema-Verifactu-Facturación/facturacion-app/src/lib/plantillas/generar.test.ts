/**
 * Prueba de extremo a extremo del generador: se compila una plantilla a
 * partir de un análisis, se imprime una factura con datos reales y se vuelve
 * a leer el PDF resultante para comprobar que dentro está lo que tiene que
 * estar.
 *
 * Es la prueba que de verdad importa. Que la detección acierte no sirve de
 * nada si luego el PDF sale con el número de factura en blanco, y eso sólo
 * se ve abriendo el PDF generado.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { InvoiceStatus, PaymentMethod, UnitOfMeasure, type CompanySettings, type Invoice } from '../types';
import { construirDatos } from './datos';
import { detectar } from './deteccion';
import { agruparEnLineas } from './extraccion';
import { construirEntrada, generarPdf } from './generar';
import { compilarPlantilla } from './plantilla';
import type { ItemTexto, PaginaExtraida } from './tipos';

const RAIZ = process.cwd();

// PNG de 1×1 transparente: en las pruebas no hace falta el calco de verdad,
// sólo que el hueco del fondo esté ocupado por una imagen válida.
const FONDO =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const MM_POR_PUNTO = 0.3528;

function texto(contenido: string, x: number, y: number, tamano = 9, negrita = false): ItemTexto {
  return {
    texto: contenido,
    x,
    y,
    ancho: contenido.length * tamano * 0.5 * MM_POR_PUNTO,
    alto: tamano * MM_POR_PUNTO,
    tamano,
    fuente: 'Helvetica',
    negrita,
    cursiva: false,
    serif: false,
    monoespaciada: false,
    color: '#000000',
  };
}

function paginaDeEjemplo(): PaginaExtraida {
  const items: ItemTexto[] = [
    texto('MI EMPRESA S.L.', 15, 18, 13, true),
    texto('NIF: B12345678', 15, 25),
    texto('Calle Mayor 1', 15, 29),
    texto('28001 Madrid (Madrid)', 15, 33),

    texto('FACTURA', 150, 18, 16, true),
    texto('Nº factura:', 140, 28),
    texto('AAA-0000-0000', 168, 28),
    texto('Fecha:', 140, 33),
    texto('01/01/2020', 168, 33),
    texto('Vencimiento:', 140, 38),
    texto('31/01/2020', 168, 38),

    texto('FACTURAR A:', 15, 52, 9, true),
    texto('CLIENTE DE MUESTRA S.A.', 15, 58, 10, true),
    texto('NIF: A87654321', 15, 63),
    texto('Calle Falsa 123', 15, 67),
    texto('46023 Valencia (Valencia)', 15, 71),

    texto('Ref.', 15, 90, 9, true),
    texto('Descripción', 32, 90, 9, true),
    texto('Cant.', 118, 90, 9, true),
    texto('Precio', 135, 90, 9, true),
    texto('IVA', 155, 90, 9, true),
    texto('Importe', 170, 90, 9, true),

    texto('REF-000', 15, 98),
    texto('Artículo de muestra', 32, 98),
    texto('1 ud', 118, 98),
    texto('1,00 €', 135, 98),
    texto('21%', 155, 98),
    texto('1,00 €', 170, 98),

    texto('Base imponible', 140, 125),
    texto('1,00 €', 172, 125),
    texto('TOTAL', 140, 138, 11, true),
    texto('1,21 €', 170, 138, 11, true),

    texto('Gracias por su confianza.', 15, 275, 8),
  ];

  return {
    ancho: 210,
    alto: 297,
    items,
    lineas: agruparEnLineas(items),
    totalPaginas: 1,
    bitmap: { dataUrl: FONDO, anchoPx: 1654, altoPx: 2339, pxPorMm: 7.87 },
  };
}

const AJUSTES = {
  businessName: 'Mi Empresa S.L.',
  tradeName: 'Mi Empresa',
  nif: 'B12345678',
  address: 'Calle Mayor 1',
  city: 'Madrid',
  postalCode: '28001',
  province: 'Madrid',
  email: 'hola@miempresa.es',
  phone: '910 000 000',
  iban: 'ES12 1234 1234 1212 3456 7890',
  bankName: 'Banco Ejemplo',
  invoiceFooterText: 'Gracias por su confianza.',
  igicEnabled: false,
} as CompanySettings;

function facturaConLineas(cuantas: number): Invoice {
  const lineItems = Array.from({ length: cuantas }, (_, i) => ({
    id: `l${i}`,
    productId: `p${i}`,
    productName: `Producto de prueba número ${i + 1}`,
    productRef: `REF-${String(i + 1).padStart(3, '0')}`,
    quantity: 2,
    unitPrice: 10,
    unit: UnitOfMeasure.UNIDAD,
    taxRate: 21,
    discountPercent: 0,
    subtotal: 20,
    taxAmount: 4.2,
    total: 24.2,
  }));

  return {
    id: 'f1',
    number: 'FAC-2026-0042',
    series: 'FAC',
    clientId: 'c1',
    clientName: 'Comercial Hermanos Rodríguez e Hijos S.L.',
    clientNif: 'A87654321',
    clientAddress: 'Avenida del Puerto 45',
    issueDate: '2026-01-12',
    dueDate: '2026-02-11',
    status: InvoiceStatus.EMITIDA,
    lineItems,
    subtotal: 20 * cuantas,
    totalDiscount: 0,
    taxBreakdown: [{ rate: 21, base: 20 * cuantas, amount: 4.2 * cuantas }],
    totalTax: 4.2 * cuantas,
    total: 24.2 * cuantas,
    paymentMethod: PaymentMethod.TRANSFERENCIA,
    notes: '',
    createdAt: '2026-01-12T10:00:00.000Z',
    updatedAt: '2026-01-12T10:00:00.000Z',
  };
}

function compilar() {
  const pagina = paginaDeEjemplo();
  const analisis = detectar(pagina, { ajustes: AJUSTES });
  return compilarPlantilla(analisis, { fondo: FONDO, archivoOrigen: 'muestra.pdf' });
}

/** Lee el PDF generado y devuelve su texto y su número de páginas. */
async function leerPdf(bytes: Uint8Array): Promise<{ texto: string; paginas: number }> {
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const documento = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: false,
    isEvalSupported: false,
  }).promise;

  let texto = '';
  for (let n = 1; n <= documento.numPages; n++) {
    const pagina = await documento.getPage(n);
    const contenido = await pagina.getTextContent();
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    texto += contenido.items.map((i: any) => i.str).join(' ') + '\n';
  }
  return { texto, paginas: documento.numPages };
}

beforeAll(() => {
  // El generador pide las tipografías por HTTP como en el navegador; aquí se
  // sirven desde `public/`.
  globalThis.fetch = (async (entrada: RequestInfo | URL) => {
    const ruta = String(entrada);
    const archivo = readFileSync(join(RAIZ, 'public', ruta.replace(/^\//, '')));
    return new Response(new Uint8Array(archivo), { status: 200 });
  }) as typeof fetch;
});

describe('compilación de la plantilla', () => {
  const { plantilla } = compilar();

  it('deja el calco y la cabecera como elementos que se repiten en cada página', () => {
    const base = plantilla.basePdf as { staticSchema?: { name: string }[]; padding: number[] };
    const nombres = (base.staticSchema ?? []).map(s => s.name);
    expect(nombres[0]).toBe('__calco');
    expect(nombres).toContain('doc_numero');
    expect(nombres).toContain('cliente_nombre');
  });

  it('reserva el margen superior justo donde empieza la tabla', () => {
    const base = plantilla.basePdf as { padding: number[] };
    expect(base.padding[0]).toBeGreaterThan(80);
    expect(base.padding[0]).toBeLessThan(95);
  });

  it('pone la tabla y los totales en la parte que fluye', () => {
    const nombres = plantilla.schemas[0].map(s => s.name);
    expect(nombres).toContain('lineas');
    expect(nombres).toContain('total_general');
  });

  it('reparte el ancho de las columnas sumando el 100 %', () => {
    const tabla = plantilla.schemas[0].find(s => s.name === 'lineas') as unknown as {
      headWidthPercentages: number[];
    };
    const suma = tabla.headWidthPercentages.reduce((a, b) => a + b, 0);
    expect(suma).toBeCloseTo(100, 5);
  });
});

describe('generación del PDF', () => {
  it('imprime los datos de la factura, no los del PDF de muestra', async () => {
    const { plantilla } = compilar();
    const datos = construirDatos({ tipo: 'factura', documento: facturaConLineas(3) }, AJUSTES);
    const bytes = await generarPdf(plantilla, datos, { titulo: 'Factura' });
    const { texto, paginas } = await leerPdf(bytes);

    expect(paginas).toBe(1);
    expect(texto).toContain('FAC-2026-0042');
    expect(texto).toContain('12/01/2026');
    expect(texto).toContain('Comercial Hermanos Rodríguez e Hijos S.L.');
    expect(texto).toContain('Producto de prueba número 1');
    expect(texto).toContain('72,60');

    // Y nada de lo que traía el PDF de muestra.
    expect(texto).not.toContain('AAA-0000-0000');
    expect(texto).not.toContain('CLIENTE DE MUESTRA');
    expect(texto).not.toContain('01/01/2020');
  }, 60_000);

  it('reparte en varias páginas una factura con muchas líneas', async () => {
    const { plantilla } = compilar();
    const datos = construirDatos({ tipo: 'factura', documento: facturaConLineas(60) }, AJUSTES);
    const bytes = await generarPdf(plantilla, datos);
    const { texto, paginas } = await leerPdf(bytes);

    expect(paginas).toBeGreaterThan(1);
    // La cabecera se repite: el número de factura tiene que estar tantas
    // veces como páginas haya.
    expect(texto.split('FAC-2026-0042').length - 1).toBe(paginas);
    // Ni una sola línea se queda por el camino.
    expect(texto).toContain('Producto de prueba número 60');
  }, 60_000);

  it('deja en blanco los campos sin dato en vez de arrastrar el del ejemplo', async () => {
    const { plantilla } = compilar();
    const factura = facturaConLineas(1);
    factura.clientNif = '';
    const datos = construirDatos({ tipo: 'factura', documento: factura }, AJUSTES);
    const bytes = await generarPdf(plantilla, datos);
    const { texto } = await leerPdf(bytes);

    expect(texto).not.toContain('A87654321');
  }, 60_000);

  it('soporta claves duplicadas (un mismo dato usado varias veces en la plantilla)', async () => {
    const { plantilla } = compilar();
    const datos = construirDatos({ tipo: 'factura', documento: facturaConLineas(1) }, AJUSTES);
    const entrada = construirEntrada(plantilla, datos);
    expect(entrada.doc_numero).toBe('FAC-2026-0042');

    const plantillaConDuplicado = JSON.parse(JSON.stringify(plantilla));
    plantillaConDuplicado.schemas[0].push({
      name: 'doc_numero_2',
      type: 'text',
      position: { x: 10, y: 10 },
      width: 50,
      height: 10,
    });
    const entradaDuplicada = construirEntrada(plantillaConDuplicado, datos);
    expect(entradaDuplicada.doc_numero_2).toBe('FAC-2026-0042');
  });
});
