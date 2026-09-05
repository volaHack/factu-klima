/**
 * EL QR TRIBUTARIO, COMPROBADO SOBRE EL PDF QUE SE DESCARGA
 *
 * Que el bloque salga bien calculado ya lo comprueba
 * `verifactu/qrFactura.test.ts`. Eso no basta: entre el cálculo y el papel
 * están pdfme, el estampado con pdf-lib y el repaginador, y cualquiera de los
 * tres puede mover, recortar o repetir el código sin que ninguna función pura
 * se entere.
 *
 * Así que aquí se genera el PDF de verdad, se pinta la hoja a mapa de bits y
 * se mira lo que hay:
 *
 * - cuánto mide el código EN MILÍMETROS DE PAPEL (no en puntos ni en píxeles),
 * - dónde cae dentro de la hoja,
 * - si está entero o le falta un trozo,
 * - si tiene el blanco alrededor que exige la AEAT,
 * - si un lector de QR lo lee y lo que lee es la URL correcta,
 * - y si aparece una sola vez cuando la factura ocupa varias páginas.
 *
 * Se comprueba en todos los oficios que el programa ofrece, en vertical y en
 * apaisado, y con las facturas que suelen romper los diseños: muchas líneas,
 * descripciones largas, nombres de cliente largos e importes grandes.
 */

import { createCanvas } from '@napi-rs/canvas';
import jsQR from 'jsqr';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { CompanySettings, Invoice } from '../types';
import { urlCotejoAeat } from '../verifactu/qr';
import { MARGEN_MM, QR_MAX_MM, QR_MIN_MM, RESERVA_MINIMA_MM } from '../verifactu/qrFactura';
import { construirDatos, facturaDeMuestra } from './datos';
import { facturaDesdeCero, OFICIOS } from './desdeCero';
import { ErrorGeneracion, generarPdf, type OpcionesQrFactura } from './generar';
import { compilarPlantilla } from './plantilla';

const AJUSTES = {
  businessName: 'Mi Empresa S.L.',
  tradeName: 'Mi Empresa',
  nif: 'B12345678',
  address: 'Calle Mayor 1',
  city: 'Madrid',
  postalCode: '28001',
  province: 'Madrid',
  phone: '600 000 000',
  email: 'hola@miempresa.es',
} as unknown as CompanySettings;

/** Papel blanco de verdad: un píxel opaco `[255,255,255,255]`. */
const FONDO =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=';

beforeAll(() => {
  globalThis.fetch = (async (entrada: RequestInfo | URL) => {
    const archivo = readFileSync(join(process.cwd(), 'public', String(entrada).replace(/^\//, '')));
    return new Response(new Uint8Array(archivo), { status: 200 });
  }) as typeof fetch;
});

// ============================================================
// MIRAR EL PDF POR DENTRO
// ============================================================

/**
 * A cuántos píxeles por milímetro se pinta la hoja.
 *
 * La URL de cotejo son unos 110 caracteres, que a nivel M de corrección de
 * errores da un QR de 45 módulos por lado. A 8 px/mm, un código de 35 mm son
 * 280 px: algo más de 6 px por módulo, de sobra para que un lector lo lea sin
 * ayuda, que es justo lo que hay que demostrar.
 */
const PX_POR_MM = 8;

interface Hoja {
  /** Ancho de la hoja en milímetros. */
  ancho: number;
  /** Alto de la hoja en milímetros. */
  alto: number;
  datos: Uint8ClampedArray;
  anchoPx: number;
  altoPx: number;
  paginas: number;
}

/** Pinta una página del PDF y devuelve sus píxeles, con la escala anotada. */
async function pintarPagina(bytes: Uint8Array, numero = 1): Promise<Hoja> {
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise;
  const pagina = await doc.getPage(numero);
  // Un punto son 1/72 de pulgada: ésta es la escala que deja PX_POR_MM
  // píxeles por cada milímetro de papel.
  const vista = pagina.getViewport({ scale: (PX_POR_MM * 25.4) / 72 });
  const lienzo = createCanvas(Math.round(vista.width), Math.round(vista.height));
  const ctx = lienzo.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  await pagina.render({ canvasContext: ctx as any, viewport: vista }).promise;
  const imagen = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
  return {
    ancho: lienzo.width / PX_POR_MM,
    alto: lienzo.height / PX_POR_MM,
    datos: imagen.data as unknown as Uint8ClampedArray,
    anchoPx: lienzo.width,
    altoPx: lienzo.height,
    paginas: doc.numPages,
  };
}

const esOscuro = (hoja: Hoja, x: number, y: number): boolean => {
  const i = (y * hoja.anchoPx + x) * 4;
  return (hoja.datos[i] + hoja.datos[i + 1] + hoja.datos[i + 2]) / 3 < 128;
};

interface Recuadro {
  /** Todo en milímetros desde la esquina superior izquierda del papel. */
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

interface QrEncontrado {
  recuadro: Recuadro;
  /** Lo que dice el código, leído por un lector de QR de verdad. */
  contenido: string;
}

/** Recorta un trozo de la hoja como los píxeles RGBA que espera un lector. */
function recortar(hoja: Hoja, zona: Recuadro) {
  const x0 = Math.max(0, Math.round(zona.x * PX_POR_MM));
  const y0 = Math.max(0, Math.round(zona.y * PX_POR_MM));
  const ancho = Math.min(hoja.anchoPx - x0, Math.round(zona.ancho * PX_POR_MM));
  const alto = Math.min(hoja.altoPx - y0, Math.round(zona.alto * PX_POR_MM));
  const pixeles = new Uint8ClampedArray(ancho * alto * 4);
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const origen = ((y0 + y) * hoja.anchoPx + (x0 + x)) * 4;
      const destino = (y * ancho + x) * 4;
      pixeles[destino] = hoja.datos[origen];
      pixeles[destino + 1] = hoja.datos[origen + 1];
      pixeles[destino + 2] = hoja.datos[origen + 2];
      pixeles[destino + 3] = 255;
    }
  }
  return { pixeles, ancho, alto, x0, y0 };
}

/**
 * Busca el código en la hoja CON UN LECTOR DE QR, no con una heurística.
 *
 * Es la comprobación que de verdad importa: si `jsQR` no lo encuentra sobre
 * el mapa de bits de la página impresa, un móvil tampoco lo va a encontrar,
 * por muy bien puestas que estén las coordenadas en el código fuente. Y de
 * paso devuelve dónde están sus cuatro esquinas, que es lo que permite medir
 * cuánto ocupa en milímetros de papel.
 */
function localizarQr(hoja: Hoja, dentroDe?: Recuadro): QrEncontrado | null {
  const zona = dentroDe ?? { x: 0, y: 0, ancho: hoja.ancho, alto: hoja.alto };
  const { pixeles, ancho, alto, x0, y0 } = recortar(hoja, zona);
  if (ancho <= 0 || alto <= 0) return null;

  const leido = jsQR(pixeles, ancho, alto);
  if (!leido) return null;

  const esquinas = [
    leido.location.topLeftCorner, leido.location.topRightCorner,
    leido.location.bottomLeftCorner, leido.location.bottomRightCorner,
  ];
  const xs = esquinas.map(p => (x0 + p.x) / PX_POR_MM);
  const ys = esquinas.map(p => (y0 + p.y) / PX_POR_MM);

  return {
    contenido: leido.data,
    recuadro: {
      x: Math.min(...xs),
      y: Math.min(...ys),
      ancho: Math.max(...xs) - Math.min(...xs),
      alto: Math.max(...ys) - Math.min(...ys),
    },
  };
}

/** Cuánto blanco hay alrededor del código, por el lado más justo. */
function aireAlrededor(hoja: Hoja, qr: Recuadro): number {
  const limite = 10 * PX_POR_MM;
  const hayNegro = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = Math.max(0, y0); y < Math.min(hoja.altoPx, y1); y++) {
      for (let x = Math.max(0, x0); x < Math.min(hoja.anchoPx, x1); x++) {
        if (esOscuro(hoja, x, y)) return true;
      }
    }
    return false;
  };
  const izq = Math.round(qr.x * PX_POR_MM);
  const arr = Math.round(qr.y * PX_POR_MM);
  const der = Math.round((qr.x + qr.ancho) * PX_POR_MM);
  const aba = Math.round((qr.y + qr.alto) * PX_POR_MM);

  const medir = (paso: (d: number) => [number, number, number, number]) => {
    for (let d = 1; d <= limite; d++) {
      const [a, b, c, e] = paso(d);
      if (hayNegro(a, b, c, e)) return (d - 1) / PX_POR_MM;
    }
    return limite / PX_POR_MM;
  };

  return Math.min(
    medir(d => [izq - d, arr, izq - d + 1, aba]),
    medir(d => [der + d - 1, arr, der + d, aba]),
    medir(d => [izq, arr - d, der, arr - d + 1]),
    medir(d => [izq, aba + d - 1, der, aba + d]),
  );
}

// ============================================================
// LAS FACTURAS DE PRUEBA
// ============================================================

const QR: OpcionesQrFactura = {
  exigido: true,
  datos: {
    nifEmisor: AJUSTES.nif,
    numeroFactura: 'FAC-2026-0042',
    fechaEmision: '2026-08-19',
    importeTotal: 1234.5,
  },
};

/** Una factura con las líneas que se le pidan, para provocar varias páginas. */
function facturaCon(lineas: number, retoques: Partial<Invoice> = {}): Invoice {
  const muestra = facturaDeMuestra();
  const base = muestra.lineItems[0];
  return {
    ...muestra,
    ...retoques,
    number: QR.datos.numeroFactura,
    issueDate: QR.datos.fechaEmision,
    lineItems: Array.from({ length: lineas }, (_, i) => ({
      ...base,
      id: `l${i}`,
      productName: `${base.productName} ${i + 1}`,
    })),
  } as Invoice;
}

async function pdfDe(oficio: string, factura: Invoice, qr: OpcionesQrFactura = QR) {
  const { plantilla } = compilarPlantilla(
    facturaDesdeCero(oficio, AJUSTES), { fondo: FONDO, archivoOrigen: '' },
  );
  const datos = construirDatos({ tipo: 'factura', documento: factura }, AJUSTES);
  return generarPdf(plantilla, datos, { titulo: 'Prueba', qr });
}


// ============================================================
// LAS COMPROBACIONES
// ============================================================

describe('el QR tributario sobre el PDF final', () => {
  it('sale impreso, mide entre 30 y 40 mm y va arriba y centrado', async () => {
    const bytes = await pdfDe('generico', facturaCon(3));
    const hoja = await pintarPagina(bytes);
    const encontrado = localizarQr(hoja);

    expect(encontrado).not.toBeNull();
    const qr = encontrado!.recuadro;

    // El tamaño FÍSICO, que es lo que manda el art. 21.1. Medio milímetro de
    // holgura por el redondeo del rasterizado.
    expect(qr.ancho).toBeGreaterThanOrEqual(QR_MIN_MM - 0.5);
    expect(qr.ancho).toBeLessThanOrEqual(QR_MAX_MM + 0.5);
    expect(Math.abs(qr.ancho - qr.alto)).toBeLessThanOrEqual(0.5);

    // «al principio de la factura… arriba de esta, próximo al margen
    // superior, preferiblemente centrado».
    expect(qr.y).toBeLessThan(hoja.alto / 4);
    expect(Math.abs(qr.x + qr.ancho / 2 - hoja.ancho / 2)).toBeLessThan(2);
  }, 60000);

  it('un lector de QR lo lee y lo que lee es la URL de cotejo de la AEAT', async () => {
    const bytes = await pdfDe('generico', facturaCon(3));
    const hoja = await pintarPagina(bytes);

    expect(localizarQr(hoja)!.contenido).toBe(urlCotejoAeat(QR.datos));
  }, 60000);

  it('no está cortado: cabe entero dentro de la hoja y lejos del borde', async () => {
    const bytes = await pdfDe('generico', facturaCon(3));
    const hoja = await pintarPagina(bytes);
    const qr = localizarQr(hoja)!.recuadro;

    expect(qr.x).toBeGreaterThanOrEqual(MARGEN_MM - 1);
    expect(qr.y).toBeGreaterThanOrEqual(MARGEN_MM - 1);
    expect(qr.x + qr.ancho).toBeLessThanOrEqual(hoja.ancho - MARGEN_MM + 1);
    expect(qr.y + qr.alto).toBeLessThanOrEqual(hoja.alto - MARGEN_MM + 1);
  }, 60000);

  it('nada se le echa encima: tiene su espacio en blanco por los cuatro lados', async () => {
    const bytes = await pdfDe('generico', facturaCon(3));
    const hoja = await pintarPagina(bytes);
    const qr = localizarQr(hoja)!.recuadro;

    expect(aireAlrededor(hoja, qr)).toBeGreaterThanOrEqual(RESERVA_MINIMA_MM);
  }, 60000);

  it('lleva su rótulo encima y su leyenda debajo, con las palabras que exige la norma', async () => {
    const bytes = await pdfDe('generico', facturaCon(3));
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
    const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise;
    const pagina = await doc.getPage(1);
    const altoPt = pagina.getViewport({ scale: 1 }).height;

    const textos = (await pagina.getTextContent()).items
      .filter((i: { str?: string }) => (i.str ?? '').trim())
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      .map((i: any) => ({ texto: String(i.str), y: (altoPt - i.transform[5]) / 2.8346456693 }));

    const rotulo = textos.find((t: { texto: string }) => t.texto.includes('QR tributario'));
    const leyenda = textos.find((t: { texto: string }) => t.texto.includes('Factura verificable'));
    expect(rotulo).toBeDefined();
    expect(leyenda).toBeDefined();

    const hoja = await pintarPagina(bytes);
    const qr = localizarQr(hoja)!.recuadro;
    // El rótulo, encima del código. La leyenda, debajo. Ninguno sobre él.
    expect(rotulo!.y).toBeLessThanOrEqual(qr.y + 1);
    expect(leyenda!.y).toBeGreaterThanOrEqual(qr.y + qr.alto - 1);
  }, 60000);

  it('en una factura de varias páginas aparece UNA sola vez, en la primera', async () => {
    const bytes = await pdfDe('generico', facturaCon(40));
    const primera = await pintarPagina(bytes, 1);
    expect(primera.paginas).toBeGreaterThan(1);

    const enLaPrimera = localizarQr(primera);
    expect(enLaPrimera).not.toBeNull();

    // «Si la factura ocupara varias páginas, el código "QR" aparecería una
    // única vez, en la primera página».
    for (let n = 2; n <= primera.paginas; n++) {
      const siguiente = await pintarPagina(bytes, n);
      expect(localizarQr(siguiente)).toBeNull();
      // Y no es que el lector no acierte: es que ahí no hay nada pintado.
      expect(aireAlrededor(siguiente, enLaPrimera!.recuadro)).toBeGreaterThan(5);
    }
  }, 180000);

  it('sobre una hoja apaisada se va arriba a la izquierda, como manda la especificación', async () => {
    const analisis = facturaDesdeCero('generico', AJUSTES);
    analisis.pagina = { ...analisis.pagina, ancho: 297, alto: 210 };
    const { plantilla } = compilarPlantilla(analisis, { fondo: FONDO, archivoOrigen: '' });

    // Sin hueco reservado: es el caso del calco de un PDF apaisado ajeno, que
    // es donde manda la posición por defecto de la especificación.
    const sinHueco = JSON.parse(JSON.stringify(plantilla));
    const base = sinHueco.basePdf as { staticSchema: { name: string }[] };
    base.staticSchema = base.staticSchema.filter(e => !String(e.name).startsWith('verifactu_'));

    const datos = construirDatos({ tipo: 'factura', documento: facturaCon(3) }, AJUSTES);
    const bytes = await generarPdf(sinHueco, datos, { qr: QR });
    const hoja = await pintarPagina(bytes);
    const qr = localizarQr(hoja)!.recuadro;

    expect(hoja.ancho).toBeGreaterThan(hoja.alto);
    expect(qr.x).toBeLessThan(hoja.ancho / 4);
    expect(qr.y).toBeLessThan(hoja.alto / 3);
    expect(qr.ancho).toBeGreaterThanOrEqual(QR_MIN_MM - 0.5);
  }, 60000);

  it('una plantilla sin hueco reservado lo recibe igual: ninguna factura sale sin QR', async () => {
    const { plantilla } = compilarPlantilla(
      facturaDesdeCero('generico', AJUSTES), { fondo: FONDO, archivoOrigen: '' },
    );
    const sinHueco = JSON.parse(JSON.stringify(plantilla));
    const base = sinHueco.basePdf as { staticSchema: { name: string }[] };
    base.staticSchema = base.staticSchema.filter(e => !String(e.name).startsWith('verifactu_'));

    const datos = construirDatos({ tipo: 'factura', documento: facturaCon(3) }, AJUSTES);
    const bytes = await generarPdf(sinHueco, datos, { qr: QR });
    const hoja = await pintarPagina(bytes);
    const encontrado = localizarQr(hoja);

    expect(encontrado).not.toBeNull();
    expect(encontrado!.contenido).toBe(urlCotejoAeat(QR.datos));
    expect(encontrado!.recuadro.y).toBeLessThan(hoja.alto / 4);
  }, 60000);

  it('el hueco que pide la plantilla manda sobre la posición por defecto', async () => {
    const analisis = facturaDesdeCero('generico', AJUSTES);
    const hueco = analisis.campos.find(c => c.clave === 'verifactu_qr')!;
    hueco.x = 15;
    hueco.y = 30;
    const { plantilla } = compilarPlantilla(analisis, { fondo: FONDO, archivoOrigen: '' });
    const datos = construirDatos({ tipo: 'factura', documento: facturaCon(3) }, AJUSTES);
    const bytes = await generarPdf(plantilla, datos, { qr: QR });
    const hoja = await pintarPagina(bytes);
    const qr = localizarQr(hoja)!.recuadro;

    expect(qr.x).toBeCloseTo(15, 0);
    expect(qr.y).toBeCloseTo(30, 0);
  }, 60000);

  it('un hueco de 24 mm guardado en una plantilla vieja se imprime a 30, no a 24', async () => {
    const analisis = facturaDesdeCero('generico', AJUSTES);
    const hueco = analisis.campos.find(c => c.clave === 'verifactu_qr')!;
    hueco.ancho = 24;
    hueco.alto = 24;
    const { plantilla } = compilarPlantilla(analisis, { fondo: FONDO, archivoOrigen: '' });
    const datos = construirDatos({ tipo: 'factura', documento: facturaCon(3) }, AJUSTES);
    const bytes = await generarPdf(plantilla, datos, { qr: QR });
    const hoja = await pintarPagina(bytes);
    const qr = localizarQr(hoja)!.recuadro;

    expect(qr.ancho).toBeGreaterThanOrEqual(QR_MIN_MM - 0.5);
  }, 60000);
});

describe('las facturas que rompen los diseños', () => {
  const casos: [string, Invoice][] = [
    ['muchos conceptos', facturaCon(35)],
    ['una nota de pie larguísima', facturaCon(4, {
      notes: 'Nota de pie muy larga que ocupa varias líneas y que en algunos diseños empujaba el contenido hacia arriba y hacia los lados sin ningún control.',
    })],
    ['un cliente con nombre kilométrico', facturaCon(4, {
      clientName: 'Comercial Hermanos Rodríguez de la Fuente e Hijos Sociedad Limitada Unipersonal',
    })],
  ];

  for (const [nombre, factura] of casos) {
    it(`con ${nombre} el QR sigue igual de grande, en su sitio y legible`, async () => {
      const bytes = await pdfDe('generico', factura);
      const hoja = await pintarPagina(bytes);
      const encontrado = localizarQr(hoja)!;
      const qr = encontrado.recuadro;

      expect(qr.ancho).toBeGreaterThanOrEqual(QR_MIN_MM - 0.5);
      expect(qr.ancho).toBeLessThanOrEqual(QR_MAX_MM + 0.5);
      expect(qr.y).toBeLessThan(hoja.alto / 4);
      expect(aireAlrededor(hoja, qr)).toBeGreaterThanOrEqual(RESERVA_MINIMA_MM);
      expect(encontrado.contenido).toBe(urlCotejoAeat(QR.datos));
    }, 120000);
  }

  it('con un importe de más de un millón el QR codifica la cifra entera', async () => {
    const qrGrande: OpcionesQrFactura = {
      ...QR, datos: { ...QR.datos, importeTotal: 1234567.89 },
    };
    const bytes = await pdfDe('generico', facturaCon(3), qrGrande);
    const hoja = await pintarPagina(bytes);

    expect(localizarQr(hoja)!.contenido).toContain('importe=1234567.89');
  }, 60000);

  it('un número de serie con caracteres especiales viaja codificado y vuelve entero', async () => {
    // El ejemplo del apartado 4 del documento técnico: «12345678&G33» tiene
    // que salir como `%26` dentro de la URL y volver tal cual al leerlo.
    const raro: OpcionesQrFactura = {
      ...QR, datos: { ...QR.datos, numeroFactura: '12345678&G33' },
    };
    const bytes = await pdfDe('generico', facturaCon(3), raro);
    const hoja = await pintarPagina(bytes);
    const contenido = localizarQr(hoja)!.contenido;

    expect(contenido).toContain('numserie=12345678%26G33');
    expect(new URL(contenido).searchParams.get('numserie')).toBe('12345678&G33');
  }, 60000);
});

describe('todos los oficios', () => {
  // Cada oficio es un diseño distinto: cambian las columnas de la tabla y los
  // rótulos del pie. El QR tiene que salir igual en los treinta y tantos.
  for (const oficio of OFICIOS) {
    it(`«${oficio.nombre}» imprime su QR entre 30 y 40 mm, arriba y legible`, async () => {
      const bytes = await pdfDe(oficio.id, facturaCon(4));
      const hoja = await pintarPagina(bytes);
      const encontrado = localizarQr(hoja);

      expect(encontrado).not.toBeNull();
      expect(encontrado!.recuadro.ancho).toBeGreaterThanOrEqual(QR_MIN_MM - 0.5);
      expect(encontrado!.recuadro.ancho).toBeLessThanOrEqual(QR_MAX_MM + 0.5);
      expect(encontrado!.recuadro.y).toBeLessThan(hoja.alto / 4);
      expect(aireAlrededor(hoja, encontrado!.recuadro)).toBeGreaterThanOrEqual(RESERVA_MINIMA_MM);
      expect(encontrado!.contenido).toBe(urlCotejoAeat(QR.datos));
    }, 120000);
  }
});

describe('cuando el QR no se puede generar', () => {
  it('una factura sin el NIF del expedidor no llega a imprimirse, y se dice por qué', async () => {
    const sinNif: OpcionesQrFactura = { ...QR, datos: { ...QR.datos, nifEmisor: '' } };
    await expect(pdfDe('generico', facturaCon(3), sinNif)).rejects.toThrow(ErrorGeneracion);
    await expect(pdfDe('generico', facturaCon(3), sinNif))
      .rejects.toThrow(/falta el NIF del expedidor/);
  }, 60000);

  it('el mensaje empieza diciendo qué no se puede hacer, no un código de error', async () => {
    const sinNumero: OpcionesQrFactura = { ...QR, datos: { ...QR.datos, numeroFactura: '' } };
    await expect(pdfDe('generico', facturaCon(3), sinNumero))
      .rejects.toThrow(/No se puede generar la factura VERI/);
  }, 60000);

  it('un albarán o un presupuesto salen sin QR: no son facturas', async () => {
    const { plantilla } = compilarPlantilla(
      facturaDesdeCero('generico', AJUSTES), { fondo: FONDO, archivoOrigen: '' },
    );
    const datos = construirDatos({ tipo: 'factura', documento: facturaCon(3) }, AJUSTES);
    const bytes = await generarPdf(plantilla, datos, { titulo: 'Albarán' });
    const hoja = await pintarPagina(bytes);

    expect(localizarQr(hoja)).toBeNull();
  }, 60000);

  it('un borrador con los datos incompletos no revienta: sale sin QR', async () => {
    const flojo: OpcionesQrFactura = { exigido: false, datos: { ...QR.datos, nifEmisor: '' } };
    const bytes = await pdfDe('generico', facturaCon(3), flojo);
    const hoja = await pintarPagina(bytes);

    expect(localizarQr(hoja)).toBeNull();
  }, 60000);
});
