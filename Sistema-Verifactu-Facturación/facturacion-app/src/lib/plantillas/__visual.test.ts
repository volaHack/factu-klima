// @ts-nocheck
/** TEMPORAL — verificación visual del pipeline completo. Se borra al terminar. */

import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const SALIDA = 'C:/Users/volit/AppData/Local/Temp/claude/C--Users-volit-Documents-Sistema-Verifactu-Facturaci-n/3b6ccbe1-04b0-4a5b-b884-1f8458b0cffc/scratchpad';

beforeAll(() => {
  globalThis.fetch = (async (entrada: RequestInfo | URL) => {
    const ruta = String(entrada);
    const archivo = readFileSync(join(process.cwd(), 'public', ruta.replace(/^\//, '')));
    return new Response(new Uint8Array(archivo), { status: 200 });
  }) as typeof fetch;

  // @ts-expect-error shim mínimo para que el código de navegador funcione aquí
  globalThis.document = {
    createElement: (etiqueta: string) => {
      if (etiqueta !== 'canvas') throw new Error('sólo canvas');
      const lienzo = createCanvas(1, 1);
      return lienzo;
    },
  };
  // @ts-expect-error shim
  globalThis.ImageData = class {};
  void loadImage;
});

/** Factura de aspecto realista, con logo, marcos y sello. */
async function facturaOriginal(): Promise<ArrayBuffer> {
  const { generate } = await import('@pdfme/generator');
  const esquemas = await import('@pdfme/schemas');
  const { cargarFuentes } = await import('./fuentes');

  const logo = createCanvas(240, 90);
  const lctx = logo.getContext('2d');
  lctx.fillStyle = '#ffffff'; lctx.fillRect(0, 0, 240, 90);
  lctx.fillStyle = '#1d4ed8';
  lctx.beginPath(); lctx.arc(120, 60, 52, Math.PI, 0); lctx.fill();
  lctx.fillStyle = '#1d4ed8'; lctx.font = 'bold 34px sans-serif';
  lctx.fillText('megabi', 55, 88);

  const t = (
    name: string, contenido: string, x: number, y: number, tamano = 9,
    color = '#111111', negrita = false, alineacion: 'left' | 'right' = 'left', ancho = 80,
  ) => ({
    name, type: 'text', content: contenido, readOnly: true,
    // Con alineación a la derecha, x es el borde derecho del texto.
    position: { x: alineacion === 'right' ? x - ancho : x, y }, width: ancho, height: tamano * 0.42,
    fontName: negrita ? 'sans-bold' : 'sans',
    fontSize: tamano, fontColor: color, backgroundColor: '',
    alignment: alineacion, verticalAlignment: 'top', lineHeight: 1.1, characterSpacing: 0,
  });

  const plantilla = {
    basePdf: { width: 210, height: 297, padding: [0, 0, 0, 0] as [number, number, number, number] },
    schemas: [[
      { name: 'logo', type: 'image', content: logo.toDataURL('image/png'), readOnly: true,
        position: { x: 15, y: 15 }, width: 40, height: 15 },

      t('e1', 'DistAlSur', 12, 36, 10),
      t('e2', 'Polígono Industrial Calonge, Nave 24', 12, 41, 10),
      t('e3', '41007 Sevilla', 12, 46, 10),
      t('e4', 'CIF: B41567890', 12, 51, 10),
      t('e5', 'Email: administracion@megabisoluciones.net', 12, 60, 10),
      t('e6', 'Tel. 943 35 75 37', 12, 65, 10),

      t('tit', 'Factura', 195, 20, 17, '#000000', true, 'right', 60),
      t('c0', 'Facturado a:', 138, 36, 10, '#000000', false, 'left', 50),
      t('c1', 'Comercial Ejemplo S.L.', 138, 41, 10, '#111111', false, 'left', 60),
      t('c2', 'Calle Larga 12', 138, 46, 10, '#111111', false, 'left', 60),
      t('c3', '41010 Sevilla', 138, 51, 10, '#111111', false, 'left', 60),
      t('c4', 'CIF: B99887766', 138, 58, 10, '#111111', false, 'left', 60),

      // Caja de datos del documento
      { name: 'caja', type: 'rectangle', position: { x: 12, y: 70 }, width: 186, height: 9,
        color: '', borderColor: '#555555', borderWidth: 0.3, readOnly: true, content: '' },
      t('d1', 'Factura Nº :', 32, 72.5, 11, '#000000', false, 'left', 30),
      t('d2', 'ALB-2026-0009', 56, 72.5, 11, '#000000', false, 'left', 35),
      t('d3', 'Cliente:', 100, 72.5, 11, '#000000', false, 'left', 20),
      t('d4', '36', 118, 72.5, 11, '#000000', false, 'left', 15),
      t('d5', 'Fecha:', 148, 72.5, 11, '#000000', false, 'left', 18),
      t('d6', '12/08/2026', 170, 72.5, 11, '#000000', false, 'left', 28),

      t('concepto', 'Mantenimiento Faxmaker 2020', 12, 84, 11, '#000000', true, 'left', 120),

      // Tabla con marco
      { name: 'marco', type: 'rectangle', position: { x: 12, y: 94 }, width: 186, height: 26,
        color: '', borderColor: '#555555', borderWidth: 0.3, readOnly: true, content: '' },
      { name: 'lineacab', type: 'line', position: { x: 12, y: 101 }, width: 186, height: 0.3,
        color: '#555555', readOnly: true, content: '' },
      t('h1', 'Fecha', 17, 96, 10, '#000000', true, 'left', 18),
      t('h2', 'Descripción', 30, 96, 10, '#000000', true, 'left', 40),
      t('h3', 'Cantidad', 128, 96, 10, '#000000', true, 'right', 20),
      t('h4', 'Otros', 152, 96, 10, '#000000', true, 'right', 16),
      t('h5', 'Precio Total', 195, 96, 10, '#000000', true, 'right', 26),

      t('r1', 'Leche Asturiana', 30, 103, 10, '#111111', false, 'left', 60),
      t('r2', '5', 128, 103, 10, '#111111', false, 'right', 20),
      t('r3', '1,20 €', 195, 103, 10, '#111111', false, 'right', 26),
      t('r4', '7,26 €', 195, 112, 10, '#111111', false, 'right', 26),

      // Totales
      t('g1', '21%', 22, 128, 10, '#111111', false, 'left', 20),
      t('g2', '660,00 €', 60, 128, 10, '#111111', false, 'right', 25),
      t('g3', '112,00 €', 95, 128, 10, '#111111', false, 'right', 25),
      t('s1', 'Subtotal', 140, 128, 10, '#111111', false, 'left', 25),
      t('s2', '660,00 €', 195, 128, 10, '#111111', false, 'right', 25),
      t('s3', 'Total I.V.A.', 140, 134, 10, '#111111', false, 'left', 25),
      t('s4', '142,80 €', 195, 134, 10, '#111111', false, 'right', 25),
      t('s5', 'Total', 140, 140, 11, '#000000', true, 'left', 25),
      t('s6', '802,80 €', 195, 140, 11, '#000000', true, 'right', 25),

      t('b1', 'DATOS BANCARIOS (Banco Santander, S.A.)', 12, 155, 11, '#cc0000', true, 'left', 120),
      t('b2', 'Cuenta Corriente: ES19 0049 5992 70 2416016088', 12, 161, 10, '#cc0000', false, 'left', 120),
    ]],
  };

  const bytes = await generate({
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    template: plantilla as any,
    inputs: [{}],
    plugins: { text: esquemas.text, rectangle: esquemas.rectangle, line: esquemas.line, image: esquemas.image },
    options: { font: await cargarFuentes() },
  });
  return new Uint8Array(bytes).slice().buffer;
}

async function aPng(bytes: Uint8Array, destino: string) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise;
  const pagina = await doc.getPage(1);
  const vista = pagina.getViewport({ scale: 2 });
  const lienzo = createCanvas(Math.round(vista.width), Math.round(vista.height));
  const ctx = lienzo.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  await pagina.render({ canvasContext: ctx as any, viewport: vista }).promise;
  writeFileSync(destino, lienzo.toBuffer('image/png'));
  return doc.numPages;
}

describe('verificación visual', () => {
  it('produce una factura limpia sin parches', async () => {
    const original = await facturaOriginal();
    await aPng(new Uint8Array(original), join(SALIDA, 'v-original.png'));

    const { extraerPagina, muestrearColor, lineasHorizontales } = await import('./extraccion');
    const { detectar } = await import('./deteccion');
    const { compilar } = await import('./analisis');
    const { construirDatos, facturaDeMuestra } = await import('./datos');
    const { generarPdf } = await import('./generar');

    const pagina = await extraerPagina(original);
    const analisis = detectar(pagina, {
      ajustes: { businessName: 'DistAlSur', nif: 'B41567890' } as never,
      buscarLineas: (x, ancho, y, alto) => lineasHorizontales(
        pagina.pixeles,
        x * pagina.bitmap.pxPorMm, (x + ancho) * pagina.bitmap.pxPorMm,
        y * pagina.bitmap.pxPorMm, (y + alto) * pagina.bitmap.pxPorMm,
      ).map(p => p / pagina.bitmap.pxPorMm),
      muestrear: (x, y, ancho, alto) => {
        const { pxPorMm } = pagina.bitmap;
        return muestrearColor(pagina.pixeles, x * pxPorMm, y * pxPorMm, ancho * pxPorMm, alto * pxPorMm);
      },
    });

    console.log('CAMPOS:', analisis.campos.filter(c => c.clave).map(c => `${c.clave}="${c.valorOriginal}"`).join(' | '));
    console.log('TABLA:', analisis.tabla
      ? `x=${analisis.tabla.x.toFixed(1)} y=${analisis.tabla.y.toFixed(1)} alto=${analisis.tabla.altoTotal.toFixed(1)} cols=${analisis.tabla.columnas.map(c => c.cabecera + '→' + c.clave).join(',')}`
      : 'ninguna');
    console.log('AVISOS:', analisis.avisos.map(a => a.texto).join(' // '));

    const { plantilla } = compilar({ analisis, pagina, nombreArchivo: 'original.pdf' });

    // El calco tiene que quedar en blanco puro donde se ha borrado.
    const base = plantilla.basePdf as { staticSchema?: { name: string; content?: string }[] };
    const calco = base.staticSchema?.find(s => s.name === '__calco')?.content ?? '';
    writeFileSync(join(SALIDA, 'v-calco.png'), Buffer.from(calco.split(',')[1], 'base64'));

    const datos = construirDatos({ tipo: 'factura', documento: facturaDeMuestra() }, {
      businessName: 'DistAlSur', tradeName: 'DistAlSur', nif: 'B41567890',
      address: 'Polígono Industrial Calonge, Nave 24', city: 'Sevilla', postalCode: '41007',
      province: 'Sevilla', email: 'administracion@megabisoluciones.net', phone: '943 35 75 37',
      iban: 'ES19 0049 5992 70 2416016088', bankName: 'Banco Santander',
      invoiceFooterText: '', igicEnabled: false,
    } as never);

    const final = await generarPdf(plantilla, datos);
    const paginas = await aPng(final, join(SALIDA, 'v-final.png'));
    console.log('PAGINAS FINAL:', paginas);

    expect(calco.startsWith('data:image/')).toBe(true);
  }, 180_000);
});
