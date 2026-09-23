/**
 * EL QR NO PUEDE APARECER EN UN ALBARÁN. COMPROBADO SOBRE EL PAPEL.
 *
 * El usuario diseñó un albarán, pulsó «Ver cómo queda» y salió un código
 * QR que no había puesto en ninguna parte. Venía de que la pantalla de
 * diseño montaba TODO como si fuera una factura y le pasaba siempre el QR
 * tributario; el generador, al no encontrarle hueco reservado, lo
 * estampaba solo en una esquina.
 *
 * No es un detalle estético. Ese código lleva a la sede de la AEAT a
 * cotejar una factura: puesto en un albarán, le está diciendo al cliente
 * que ese papel está declarado a Hacienda cuando no lo está.
 *
 * Que la decisión sea correcta ya lo comprueba `vistaPreviaTipos.test.ts`
 * con funciones puras. Eso no basta: entre la decisión y el papel están
 * pdfme, el estampado con pdf-lib y el repaginador. Así que aquí se
 * genera el PDF de verdad, se pinta la hoja a mapa de bits y se busca el
 * código CON UN LECTOR DE QR. Si `jsQR` no lo encuentra, un móvil
 * tampoco.
 */

import { createCanvas } from '@napi-rs/canvas';
import jsQR from 'jsqr';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import type { CompanySettings } from '../types';
import { construirDatos, facturaDeMuestra } from './datos';
import { facturaDesdeCero } from './desdeCero';
import { generarPdf } from './generar';
import { compilarPlantilla } from './plantilla';
import { algunoLlevaQr, tipoDominante, type TipoDocumentoPlantilla } from './tiposDocumento';
import { QR_MIN_MM } from '../verifactu/qrFactura';

const PX_POR_MM = 6;

const AJUSTES = {
  businessName: 'Mi Empresa S.L.',
  tradeName: 'Mi Empresa',
  nif: 'B12345678',
  address: 'Calle Mayor 1',
  city: 'Madrid',
  postalCode: '28001',
  province: 'Madrid',
} as unknown as CompanySettings;

/** Papel blanco de verdad: un píxel opaco. */
const FONDO =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=';

beforeAll(() => {
  globalThis.fetch = (async (entrada: RequestInfo | URL) => {
    const archivo = readFileSync(join(process.cwd(), 'public', String(entrada).replace(/^\//, '')));
    return new Response(new Uint8Array(archivo), { status: 200 });
  }) as typeof fetch;
});

interface QrEnPapel {
  contenido: string;
  /** Centro del código, en milímetros de papel. */
  centroX: number;
  centroY: number;
  lado: number;
}

/** ¿Hay algún QR legible en esta hoja, y dónde cae? */
async function localizarQr(bytes: Uint8Array): Promise<QrEnPapel | null> {
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise;
  const pagina = await doc.getPage(1);
  const vista = pagina.getViewport({ scale: (PX_POR_MM * 25.4) / 72 });
  const lienzo = createCanvas(Math.round(vista.width), Math.round(vista.height));
  const ctx = lienzo.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  await pagina.render({ canvasContext: ctx as any, viewport: vista }).promise;
  const imagen = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
  const leido = jsQR(imagen.data as unknown as Uint8ClampedArray, lienzo.width, lienzo.height);
  if (!leido) return null;

  const esquinas = [
    leido.location.topLeftCorner, leido.location.topRightCorner,
    leido.location.bottomLeftCorner, leido.location.bottomRightCorner,
  ];
  const xs = esquinas.map(p => p.x / PX_POR_MM);
  const ys = esquinas.map(p => p.y / PX_POR_MM);
  return {
    contenido: leido.data,
    centroX: (Math.min(...xs) + Math.max(...xs)) / 2,
    centroY: (Math.min(...ys) + Math.max(...ys)) / 2,
    lado: Math.max(...xs) - Math.min(...xs),
  };
}

/** ¿Hay algún QR legible en esta hoja? */
async function hayQrEnLaHoja(bytes: Uint8Array): Promise<string | null> {
  return (await localizarQr(bytes))?.contenido ?? null;
}

/**
 * Monta el PDF exactamente como lo monta «Ver cómo queda»: el mismo tipo
 * dominante y la misma decisión sobre el QR.
 */
async function comoLaVistaPrevia(tipos: TipoDocumentoPlantilla[]): Promise<Uint8Array> {
  const { plantilla } = compilarPlantilla(
    facturaDesdeCero('generico', AJUSTES),
    { fondo: FONDO, archivoOrigen: '' },
  );
  const documento = facturaDeMuestra();
  const tipo = tipoDominante(tipos);
  const datos = construirDatos(
    { tipo, documento } as Parameters<typeof construirDatos>[0],
    AJUSTES,
  );
  const qr = algunoLlevaQr(tipos)
    ? {
      exigido: false,
      datos: {
        nifEmisor: AJUSTES.nif,
        numeroFactura: documento.number,
        fechaEmision: documento.issueDate,
        importeTotal: documento.total,
      },
    }
    : undefined;
  return generarPdf(plantilla, datos, { titulo: 'Vista previa', qr });
}

describe('el QR sobre el papel, según el tipo de documento', () => {
  it('un albarán sale SIN código QR', async () => {
    // Éste es el fallo que se reportó: un QR que nadie había colocado.
    expect(await hayQrEnLaHoja(await comoLaVistaPrevia(['albaran']))).toBeNull();
  }, 60000);

  it('un presupuesto tampoco lo lleva', async () => {
    expect(await hayQrEnLaHoja(await comoLaVistaPrevia(['presupuesto']))).toBeNull();
  }, 60000);

  it('un pedido tampoco', async () => {
    expect(await hayQrEnLaHoja(await comoLaVistaPrevia(['pedido']))).toBeNull();
  }, 60000);

  it('una factura SÍ lo lleva, y apunta a la sede de la AEAT', async () => {
    // La otra mitad de la comprobación: quitarlo de los albaranes no
    // puede habérselo quitado también a quien está obligado a llevarlo.
    const leido = await hayQrEnLaHoja(await comoLaVistaPrevia(['factura']));
    expect(leido).not.toBeNull();
    expect(leido).toContain('agenciatributaria');
  }, 60000);

  it('una plantilla que vale para albarán y para factura lo lleva', async () => {
    // Se previsualiza con el caso más comprometido, para que se vea si al
    // diseño le falta sitio justo cuando el código es obligatorio.
    expect(await hayQrEnLaHoja(await comoLaVistaPrevia(['albaran', 'factura']))).not.toBeNull();
  }, 60000);
});

describe('el QR se puede mover, que es lo que permite la norma', () => {
  /**
   * El documento técnico de la AEAT pide la esquina superior, pero cierra
   * con la salida: «Si existen obstáculos que hagan inconveniente esa
   * ubicación, puede utilizarse otra ubicación, siempre que el código
   * "QR" sea claramente visible y se distinga de otros códigos "QR"».
   *
   * Aquí se comprueba que esa salida existe de verdad sobre el papel:
   * que arrastrar el recuadro en el editor mueve el código impreso.
   */
  async function facturaConElQrEn(x: number, y: number): Promise<Uint8Array> {
    const analisis = facturaDesdeCero('generico', AJUSTES);
    const hueco = analisis.campos.find(c => c.clave === 'verifactu_qr');
    expect(hueco, 'la factura desde cero tiene que traer su recuadro de QR').toBeDefined();
    hueco!.x = x;
    hueco!.y = y;

    const { plantilla } = compilarPlantilla(analisis, { fondo: FONDO, archivoOrigen: '' });
    const documento = facturaDeMuestra();
    const datos = construirDatos({ tipo: 'factura', documento }, AJUSTES);
    return generarPdf(plantilla, datos, {
      titulo: 'Vista previa',
      qr: {
        exigido: false,
        datos: {
          nifEmisor: AJUSTES.nif,
          numeroFactura: documento.number,
          fechaEmision: documento.issueDate,
          importeTotal: documento.total,
        },
      },
    });
  }

  it('arrastrado al pie derecho, se imprime en el pie derecho', async () => {
    // Que es el caso de uso: arriba tapaba el membrete.
    const qr = await localizarQr(await facturaConElQrEn(160, 235));
    expect(qr).not.toBeNull();
    expect(qr!.centroX).toBeGreaterThan(210 / 2);
    expect(qr!.centroY).toBeGreaterThan(297 * 0.66);
  }, 60000);

  it('arrastrado a la izquierda, se imprime a la izquierda', async () => {
    const qr = await localizarQr(await facturaConElQrEn(12, 20));
    expect(qr).not.toBeNull();
    expect(qr!.centroX).toBeLessThan(210 / 3);
  }, 60000);

  it('siga donde siga, se imprime con tamaño legal y se lee', async () => {
    // Moverlo no puede costarle al usuario que el código deje de cumplir.
    const qr = await localizarQr(await facturaConElQrEn(160, 235));
    expect(qr!.lado).toBeGreaterThanOrEqual(QR_MIN_MM - 1);
    expect(qr!.contenido).toContain('agenciatributaria');
  }, 60000);
});
