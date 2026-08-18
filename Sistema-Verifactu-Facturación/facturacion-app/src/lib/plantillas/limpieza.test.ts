/**
 * El borrado de los datos de muestra es lo que más se ve cuando falla: si el
 * color con el que se tapa no es exactamente el del papel, la factura sale
 * con parches de otro tono, y si el rectángulo corta un texto por la mitad,
 * quedan medias letras impresas. Las dos cosas se comprueban aquí.
 */

import { describe, expect, it } from 'vitest';
import { fondoAlrededor, muestrearColor } from './extraccion';
import { zonasABorrar } from './analisis';
import type { AnalisisPdf, CampoDetectado, ItemTexto, PaginaExtraida } from './tipos';
import { agruparEnLineas } from './extraccion';

/** ImageData de mentira: en Node no existe, pero su forma es trivial. */
function lienzoDePrueba(
  ancho: number,
  alto: number,
  fondo: [number, number, number],
  pintar?: (x: number, y: number) => [number, number, number] | null,
): ImageData {
  const data = new Uint8ClampedArray(ancho * alto * 4);
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const i = (y * ancho + x) * 4;
      const color = pintar?.(x, y) ?? fondo;
      data[i] = color[0]; data[i + 1] = color[1]; data[i + 2] = color[2]; data[i + 3] = 255;
    }
  }
  return { data, width: ancho, height: alto, colorSpace: 'srgb' } as ImageData;
}

describe('color con el que se tapa', () => {
  it('devuelve blanco exacto sobre papel blanco', () => {
    // Este es el fallo que dejaba recuadros grises por toda la factura: al
    // agrupar los colores en cubos se devolvía el centro del cubo (240) en
    // vez del blanco real (255).
    const lienzo = lienzoDePrueba(60, 40, [255, 255, 255]);
    expect(fondoAlrededor(lienzo, 10, 10, 20, 10)).toBe('#ffffff');
  });

  it('respeta el color exacto de una franja de color', () => {
    const verde: [number, number, number] = [15, 118, 110];
    const lienzo = lienzoDePrueba(60, 40, verde);
    expect(fondoAlrededor(lienzo, 10, 10, 20, 10)).toBe('#0f766e');
  });

  it('no se deja llevar por el texto que hay dentro de la caja', () => {
    // Caja llena de tinta negra, papel blanco alrededor: hay que devolver el
    // papel, porque es el color con el que se va a tapar.
    const lienzo = lienzoDePrueba(60, 40, [255, 255, 255], (x, y) =>
      x >= 12 && x <= 28 && y >= 12 && y <= 18 ? [0, 0, 0] : null,
    );
    expect(fondoAlrededor(lienzo, 12, 12, 16, 6)).toBe('#ffffff');
  });

  it('separa tinta de papel al muestrear un texto', () => {
    const lienzo = lienzoDePrueba(60, 40, [255, 255, 255], (x, y) =>
      y >= 14 && y <= 16 ? [17, 24, 39] : null,
    );
    const muestra = muestrearColor(lienzo, 10, 10, 30, 12);
    expect(muestra.fondo).toBe('#ffffff');
    expect(muestra.texto).toBe('#111827');
    expect(muestra.densidad).toBeGreaterThan(0);
    expect(muestra.densidad).toBeLessThan(1);
  });
});

// ============================================================

const MM_POR_PUNTO = 0.3528;

function texto(contenido: string, x: number, y: number, tamano = 9): ItemTexto {
  return {
    texto: contenido, x, y,
    ancho: contenido.length * tamano * 0.5 * MM_POR_PUNTO,
    alto: tamano * MM_POR_PUNTO,
    tamano, fuente: 'Helvetica',
    negrita: false, cursiva: false, serif: false, monoespaciada: false,
    color: '#000000',
  };
}

function analisisConTabla(altoTabla: number): AnalisisPdf {
  const items = [
    texto('Descripción', 15, 90),
    texto('Importe', 170, 90),
    texto('Artículo uno', 15, 98),
    texto('100,00 €', 170, 98),
    // Fila de desglose justo debajo: es la que se cortaba por la mitad.
    texto('21%', 15, 112),
    texto('21,00 €', 170, 112),
  ];
  const pagina: PaginaExtraida = {
    ancho: 210, alto: 297, items, lineas: agruparEnLineas(items), totalPaginas: 1,
    bitmap: { dataUrl: '', anchoPx: 100, altoPx: 140, pxPorMm: 1 },
  };

  return {
    pagina,
    campos: [] as CampoDetectado[],
    tabla: {
      x: 15, ancho: 180, y: 88, altoCabecera: 7, altoFila: 6,
      altoTotal: altoTabla,
      columnas: [], filasOriginales: 1,
      estilo: {
        cabeceraFondo: '#ffffff', cabeceraTexto: '#000000', cabeceraNegrita: true,
        cuerpoTexto: '#000000', bordeColor: '#dddddd', bordeAncho: 0, bordeFilas: 0.1,
        tamanoCabecera: 9, tamanoCuerpo: 9, relleno: [1, 1, 1, 1], filaAlterna: '',
      },
    },
    avisos: [],
    zonasExtra: [],
    familia: 'sans',
  };
}

describe('zonas que se borran', () => {
  it('estira la zona hasta cubrir entero el texto que sólo tapaba a medias', () => {
    // La tabla termina a media altura de la fila del 21 %: sin ajuste queda
    // la mitad de arriba borrada y la de abajo impresa.
    const analisis = analisisConTabla(21);
    const zonaTabla = zonasABorrar(analisis)[0];
    const finTexto = 112 + 9 * MM_POR_PUNTO;
    expect(zonaTabla.y + zonaTabla.alto).toBeGreaterThanOrEqual(finTexto);
  });

  it('deja un margen bajo la tabla para la última línea partida', () => {
    // Una descripción que envuelve a dos líneas deja su continuación justo
    // debajo del cuerpo; el borrado baja un poco para llevársela. Si además
    // hay texto que la zona sólo corta a medias, ajustarAlTexto la estira.
    const analisis = analisisConTabla(15);
    const zonaTabla = zonasABorrar(analisis)[0];
    expect(zonaTabla.y + zonaTabla.alto).toBeCloseTo(88 + 15 + 6 * 0.6, 5);
  });

  it('incluye las zonas que el usuario ha tapado a mano', () => {
    const analisis = analisisConTabla(15);
    analisis.zonasExtra = [{ id: 'z1', x: 10, y: 200, ancho: 40, alto: 20 }];
    const zonas = zonasABorrar(analisis);
    expect(zonas.some(z => z.y === 200 && z.ancho === 40)).toBe(true);
  });

  it('borra todo dato de la muestra que no esté marcado como fijo', () => {
    // Un campo sin clave es un dato de la factura de muestra que no sabemos a
    // qué corresponde y que nadie va a rellenar. Si no se borra, queda
    // impreso en TODAS las facturas que se emitan con esta plantilla: con los
    // datos de la empresa sólo queda feo, con los del cliente de la muestra
    // es enseñarle a un cliente los datos de otro.
    //
    // Marcar el campo como fijo en el revisor es lo que lo conserva, y es la
    // única excepción.
    const analisis = analisisConTabla(15);
    analisis.campos = [
      { clave: 'total_general', valorOriginal: '100,00 €', x: 170, y: 200, ancho: 20, alto: 4, fijo: false },
      { clave: null, valorOriginal: '21,00 €', x: 170, y: 120, ancho: 15, alto: 4, fijo: false },
      { clave: null, valorOriginal: 'Nota suelta', x: 20, y: 60, ancho: 30, alto: 4, fijo: false },
      { clave: null, valorOriginal: '10,00 €', x: 170, y: 130, ancho: 15, alto: 4, fijo: true },
    ] as unknown as CampoDetectado[];
    const zonas = zonasABorrar(analisis);
    // Las zonas llevan holgura alrededor del texto, así que se comprueba que
    // lo cubran, no que coincidan al milímetro con su caja.
    const cubre = (y: number) => zonas.some(z => z.y <= y && z.y + z.alto >= y + 4);
    // El total (y=200), el desglose sin asignar (y=120) y la nota suelta de
    // la cabecera (y=60) se borran…
    expect(cubre(200)).toBe(true);
    expect(cubre(120)).toBe(true);
    expect(cubre(60)).toBe(true);
    // …y el que el usuario marcó como fijo se queda impreso.
    expect(cubre(130)).toBe(false);
  });
});

describe('cuánto blanco se come alrededor de un campo', () => {
  /** Un campo suelto, sin tabla, del cuerpo de letra que se le pida. */
  function analisisConCampo(tamano: number): AnalisisPdf {
    const items = [texto('169,78', 90, 250, tamano)];
    const pagina: PaginaExtraida = {
      ancho: 210, alto: 297, items, lineas: agruparEnLineas(items), totalPaginas: 1,
      bitmap: { dataUrl: '', anchoPx: 100, altoPx: 140, pxPorMm: 1 },
    };
    const campo = {
      id: 'c1', clave: 'total_general', tipo: 'texto', fijo: false,
      valorOriginal: '169,78', etiquetaCercana: '',
      x: 90, y: 250, ancho: items[0].ancho, alto: items[0].alto,
      tamano, alineacion: 'right', color: '#000000',
      negrita: false, cursiva: false, serif: false,
      interlineado: 1.15, confianza: 0.9, motivo: '',
    } as unknown as CampoDetectado;
    return { pagina, campos: [campo], tabla: null, avisos: [], zonasExtra: [], familia: 'sans' };
  }

  const sobresale = (tamano: number) => {
    const zona = zonasABorrar(analisisConCampo(tamano))[0];
    return 90 - zona.x;
  };

  it('tapa el campo entero, que es para lo que está', () => {
    // Si no cubre el dato de la muestra, ese dato sale impreso en todas las
    // facturas que se emitan con la plantilla.
    const a = analisisConCampo(9);
    const zona = zonasABorrar(a)[0];
    expect(zona.x).toBeLessThanOrEqual(a.campos[0].x);
    expect(zona.x + zona.ancho).toBeGreaterThanOrEqual(a.campos[0].x + a.campos[0].ancho);
  });

  it('no se come medio milímetro por cada lado de una cifra normal', () => {
    // Era un milímetro fijo. En una casilla estrecha el blanco sobresalía del
    // recuadro impreso y se llevaba por delante el filete de la de al lado;
    // en el editor se veía como un pegote más grande que el propio campo.
    expect(sobresale(9)).toBeLessThan(0.6);
  });

  it('un titular grande se lleva más holgura que una cifra pequeña', () => {
    // El trazo que asoma es proporcional al cuerpo de la letra, así que la
    // holgura también: un milímetro fijo es poco al lado de un rótulo de 18
    // puntos y muchísimo al lado de un 7.
    expect(sobresale(18)).toBeGreaterThan(sobresale(7));
  });
});
