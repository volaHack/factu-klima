/**
 * REGRESIÓN: el repaginador de pdfme no debe reventar cuando la tabla deja
 * una altura de contenido nula.
 *
 * `@pdfme/common` divide `startGlobalY / contentHeight` y `% contentHeight`.
 * Si una plantilla tiene la tabla tan abajo que `height - paddingTop -
 * paddingBottom` es 0 (o menor), el resultado es NaN, `pages[NaN].push(...)`
 * revienta con "Cannot read properties of undefined (reading 'push')" y el
 * PDF no se genera. El parche de `scripts/parchear-pdfme.mjs` fuerza una
 * altura mínima de 0.1pt antes de ese cálculo.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCanvas, DOMMatrix } from '@napi-rs/canvas';
import { beforeAll, describe, expect, it } from 'vitest';
import { getDynamicTemplate } from '@pdfme/common';
import { UnitOfMeasure, type CompanySettings, type Invoice } from '../types';
import { compilarPlantilla, tablaPorDefecto } from './plantilla';
import { generarPdf } from './generar';
import { construirDatos } from './datos';
import type { AnalisisPdf } from './tipos';

const RAIZ = process.cwd();

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
    status: 'emitida' as never,
    lineItems,
    subtotal: 20 * cuantas,
    totalDiscount: 0,
    taxBreakdown: [{ rate: 21, base: 20 * cuantas, amount: 4.2 * cuantas }],
    totalTax: 4.2 * cuantas,
    total: 24.2 * cuantas,
    paymentMethod: 'transferencia' as never,
    notes: '',
    createdAt: '2026-01-12T10:00:00.000Z',
    updatedAt: '2026-01-12T10:00:00.000Z',
  };
}

beforeAll(async () => {
  globalThis.fetch = (async (entrada: RequestInfo | URL) => {
    const ruta = String(entrada);
    const archivo = readFileSync(join(RAIZ, 'public', ruta.replace(/^\//, '')));
    return new Response(new Uint8Array(archivo), { status: 200 });
  }) as typeof fetch;

  // @ts-expect-error shim
  globalThis.DOMMatrix = DOMMatrix;
  // @ts-expect-error shim
  globalThis.ImageData = class {};
});

describe('repaginador pdfme con altura de contenido nula', () => {
  it('no revienta cuando contentHeight es exactamente 0', async () => {
    const plantilla = {
      basePdf: { width: 210, height: 297, padding: [285, 0, 12, 0], staticSchema: [] },
      schemas: [[
        {
          name: 'lineas',
          type: 'table',
          position: { x: 17, y: 285 },
          width: 178,
          height: 10,
          content: JSON.stringify([['a']]),
          head: ['H'],
          headWidthPercentages: [100],
          showHead: true,
          repeatHead: true,
          headStyles: {},
          bodyStyles: {},
          tableStyles: {},
          columnStyles: {},
        },
      ]],
    };

    expect(plantilla.basePdf.height - plantilla.basePdf.padding[0] - plantilla.basePdf.padding[2]).toBe(0);

    const salida = await getDynamicTemplate({
      template: plantilla as never,
      input: {},
      options: {},
      _cache: new Map(),
      getDynamicHeights: async () => [10],
    });

    expect(salida.schemas.flat().length).toBeGreaterThan(0);
  });
});

describe('plantilla con la tabla pegada al pie de página', () => {
  it('genera el PDF aunque la tabla deje contentHeight 0', async () => {
    // A4 en puntos: 297.04. Con la tabla empezando a 285.04 y el pie en 12,
    // height - paddingTop - paddingBottom da 0 (o un residuo de coma flotante
    // ≤ 0), que es la condición que hacía reventar el repaginador.
    const tabla = { ...tablaPorDefecto(210, 297.04), y: 285.04, altoTotal: 10 };
    const lienzo = createCanvas(1, 1);
    const fondo = lienzo.toDataURL('image/png');

    const analisis: AnalisisPdf = {
      pagina: {
        ancho: 210,
        alto: 297.04,
        items: [],
        lineas: [],
        totalPaginas: 1,
        bitmap: { dataUrl: fondo, anchoPx: 1, altoPx: 1, pxPorMm: 1 },
      },
      campos: [],
      tabla,
      avisos: [],
      zonasExtra: [],
      familia: 'sans',
    };

    const { plantilla } = compilarPlantilla(analisis, { fondo, archivoOrigen: 'prueba.pdf' });
    const base = plantilla.basePdf as { height: number; padding: number[] };
    const contentHeight = base.height - base.padding[0] - base.padding[2];

    expect(contentHeight).toBeLessThanOrEqual(0);

    const datos = construirDatos({ tipo: 'factura', documento: facturaConLineas(3) }, AJUSTES);
    const bytes = await generarPdf(plantilla, datos, { titulo: 'borde-inferior' });

    expect(bytes.length).toBeGreaterThan(0);
  }, 60_000);
});
