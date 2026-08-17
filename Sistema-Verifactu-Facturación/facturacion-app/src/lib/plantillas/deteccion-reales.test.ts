/**
 * LO QUE APRENDIMOS DE LAS FACTURAS REALES
 *
 * Cada caso de este fichero salió de un PDF de verdad que el detector leía
 * mal: un rótulo guardado como si fuera el número de factura, una cabecera
 * partida que se convertía en dos columnas, una descripción de dos líneas que
 * cortaba la tabla por la mitad. Están aquí para que no vuelvan.
 */

import { describe, expect, it } from 'vitest';
import { agruparEnLineas } from './extraccion';
import { detectar } from './deteccion';
import type { CompanySettings } from '../types';
import type { ItemTexto, PaginaExtraida } from './tipos';

const MM_POR_PUNTO = 0.3528;

function texto(
  contenido: string,
  x: number,
  y: number,
  tamano = 9,
  extra: Partial<ItemTexto> = {},
): ItemTexto {
  return {
    texto: contenido,
    x,
    y,
    ancho: contenido.length * tamano * 0.5 * MM_POR_PUNTO,
    alto: tamano * MM_POR_PUNTO,
    tamano,
    fuente: 'Helvetica',
    negrita: false,
    cursiva: false,
    serif: false,
    monoespaciada: false,
    color: '#000000',
    ...extra,
  };
}

const NEGRITA = { negrita: true };

function pagina(items: ItemTexto[]): PaginaExtraida {
  return {
    ancho: 210,
    alto: 297,
    items,
    lineas: agruparEnLineas(items),
    totalPaginas: 1,
    bitmap: { dataUrl: '', anchoPx: 1654, altoPx: 2339, pxPorMm: 7.87 },
  };
}

const AJUSTES = {
  businessName: 'Distribuciones Ejemplo S.L.',
  tradeName: 'Distribuciones Ejemplo',
  nif: 'B12345678',
} as CompanySettings;

function claves(analisis: ReturnType<typeof detectar>): Record<string, string> {
  const mapa: Record<string, string> = {};
  for (const campo of analisis.campos) {
    if (campo.clave) mapa[campo.clave] = campo.valorOriginal;
  }
  return mapa;
}

/** Cabecera y filas de una tabla, en la posición habitual de una factura. */
function tablaCon(cabeceras: [string, number][], filas: [string, number][][]): ItemTexto[] {
  const items = cabeceras.map(([t, x]) => texto(t, x, 90, 9, NEGRITA));
  filas.forEach((fila, i) => {
    for (const [t, x] of fila) items.push(texto(t, x, 98 + i * 6));
  });
  return items;
}

// ============================================================

describe('rótulos que no son datos', () => {
  it('no toma por dato lo que termina en dos puntos', () => {
    // En una plantilla en blanco, a la derecha de «Numero de factura:» no hay
    // un número: hay el rótulo de la casilla siguiente. Antes se guardaba como
    // número de factura y la plantilla imprimía rótulos donde van los datos.
    const analisis = detectar(pagina([
      texto('Numero de factura:', 20, 120),
      texto('POBLACIÓN DEL CLIENTE:', 70, 120),
    ]), { ajustes: AJUSTES });
    expect(claves(analisis).doc_numero).toBeUndefined();
  });

  it('no acepta un valor sin cifras para un número, una fecha o un importe', () => {
    const analisis = detectar(pagina([
      texto('Total', 20, 120),
      texto('RETENCIONES', 60, 120),
    ]), { ajustes: AJUSTES });
    expect(claves(analisis).total_general).toBeUndefined();
  });

  it('sí acepta el mismo hueco cuando lo que hay lleva cifras', () => {
    const analisis = detectar(pagina([
      texto('Total', 20, 120),
      texto('461,01 €', 60, 120),
    ]), { ajustes: AJUSTES });
    expect(claves(analisis).total_general).toBe('461,01 €');
  });

  it('no empareja una etiqueta con algo que está en la otra punta de la hoja', () => {
    const analisis = detectar(pagina([
      texto('Vencimiento', 15, 120),
      texto('Avenida del Puerto 45', 150, 120),
    ]), { ajustes: AJUSTES });
    expect(claves(analisis).doc_vencimiento).toBeUndefined();
  });
});

describe('columnas de la tabla', () => {
  it('junta una cabecera partida por el PDF en vez de hacer dos columnas', () => {
    // Los PDFs cortan una palabra en cuanto cambia el interletrado: «P» y
    // «RECIO» llegan como dos trozos que se tocan. Son una sola columna.
    const analisis = detectar(pagina(tablaCon(
      [['Descripción', 20], ['Cant.', 100], ['P', 130], ['RECIO', 131.6], ['Importe', 170]],
      [
        [['Tomate', 20], ['10', 100], ['12,50', 130], ['125,00', 170]],
        [['Patata', 20], ['20', 100], ['8,00', 130], ['160,00', 170]],
      ],
    )), { ajustes: AJUSTES });

    const cabeceras = analisis.tabla!.columnas.map(c => c.cabecera);
    expect(cabeceras).toContain('PRECIO');
    expect(cabeceras).not.toContain('RECIO');
    expect(analisis.tabla!.columnas.find(c => c.cabecera === 'PRECIO')?.clave).toBe('precio');
  });

  it('no fusiona dos columnas estrechas que están cerca', () => {
    // En las facturas de mayorista «CAJ.», «U/C» y «UDES.» van a 2-4 mm unas
    // de otras y son tres columnas distintas.
    const analisis = detectar(pagina(tablaCon(
      [['Descripción', 20], ['CAJ.', 110], ['U/C', 121], ['UDES.', 131], ['Importe', 170]],
      [
        [['Tomate', 20], ['1', 110], ['12', 121], ['12,00', 131], ['125,00', 170]],
        [['Patata', 20], ['2', 110], ['6', 121], ['12,00', 131], ['160,00', 170]],
      ],
    )), { ajustes: AJUSTES });

    const cabeceras = analisis.tabla!.columnas.map(c => c.cabecera);
    expect(cabeceras).toContain('CAJ.');
    expect(cabeceras).toContain('U/C');
    expect(cabeceras).toContain('UDES.');
  });

  it('reconoce cabeceras con coletilla y no sólo la palabra exacta', () => {
    const analisis = detectar(pagina(tablaCon(
      [['CÓDIGO SIG', 20], ['CANTIDAD', 60], ['CONCEPTO', 100], ['IMPORTE €', 170]],
      [
        [['REF-1', 20], ['2,5', 60], ['Corte de hierba', 100], ['150,00 €', 170]],
        [['REF-2', 20], ['25', 60], ['Empaquetado', 100], ['350,00 €', 170]],
      ],
    )), { ajustes: AJUSTES });

    const porCabecera = new Map(analisis.tabla!.columnas.map(c => [c.cabecera, c.clave]));
    expect(porCabecera.get('CÓDIGO SIG')).toBe('ref');
    expect(porCabecera.get('CANTIDAD')).toBe('cantidad');
    expect(porCabecera.get('CONCEPTO')).toBe('descripcion');
    expect(porCabecera.get('IMPORTE €')).toBe('importe');
  });

  it('convierte en dato propio una columna que no encaja con nada conocido', () => {
    // Así se pide línea a línea al crear la factura en vez de salir en blanco.
    const analisis = detectar(pagina(tablaCon(
      [['Descripción', 20], ['Cant.', 100], ['LOTE', 130], ['Importe', 170]],
      [
        [['Tomate', 20], ['10', 100], ['L-114', 130], ['125,00', 170]],
        [['Patata', 20], ['20', 100], ['L-115', 130], ['160,00', 170]],
      ],
    )), { ajustes: AJUSTES });

    expect(analisis.tabla!.columnas.find(c => c.cabecera === 'LOTE')?.clave)
      .toMatch(/^custom_col_\d+$/);
  });

  it('alinea a la izquierda los textos y a la derecha los importes', () => {
    const analisis = detectar(pagina(tablaCon(
      [['Descripción', 20], ['Importe', 168]],
      [
        [['Tomate rama caja de 5 kg', 20], ['1.125,00', 168]],
        [['Patata', 20], ['160,00', 175]],
        [['Cebolla dulce', 20], ['96,00', 178]],
      ],
    )), { ajustes: AJUSTES });

    const porCabecera = new Map(analisis.tabla!.columnas.map(c => [c.cabecera, c.alineacion]));
    expect(porCabecera.get('Descripción')).toBe('left');
    expect(porCabecera.get('Importe')).toBe('right');
  });
});

describe('hasta dónde llega la tabla', () => {
  it('no la corta cuando una descripción ocupa dos líneas', () => {
    // Cortar ahí dejaba media docena de líneas de la factura de muestra
    // impresas debajo de la tabla nueva.
    const analisis = detectar(pagina([
      texto('Descripción', 20, 90, 9, NEGRITA),
      texto('Cant.', 120, 90, 9, NEGRITA),
      texto('Importe', 170, 90, 9, NEGRITA),
      texto('HARIBO MEGA TORCIDAS REGALIZ 200', 20, 98),
      texto('10', 120, 98),
      texto('125,00', 170, 98),
      texto('GRS 14 UNDS', 20, 101),
      texto('CAPRI SUN MULTIVITAMIN 200ML', 20, 105),
      texto('20', 120, 105),
      texto('160,00', 170, 105),
    ]), { ajustes: AJUSTES });

    expect(analisis.tabla!.filasOriginales).toBeGreaterThanOrEqual(3);
    expect(analisis.tabla!.y + analisis.tabla!.altoTotal).toBeGreaterThan(105);
  });

  it('se detiene en la raya que cierra la tabla y no invade los totales', () => {
    const analisis = detectar(pagina([
      texto('Descripción', 20, 90, 9, NEGRITA),
      texto('Cant.', 120, 90, 9, NEGRITA),
      texto('Importe', 170, 90, 9, NEGRITA),
      texto('Tomate', 20, 98), texto('10', 120, 98), texto('125,00', 170, 98),
      texto('Patata', 20, 104), texto('20', 120, 104), texto('160,00', 170, 104),
      // Bloque de totales, tras la raya de cierre y un hueco mayor que una fila.
      texto('IMPUESTO', 20, 116), texto('BASE IMP.', 60, 116), texto('CUOTA', 120, 116),
      texto('I.G.I.C.', 20, 122), texto('381,00', 60, 122), texto('80,01', 120, 122),
    ]), {
      ajustes: AJUSTES,
      buscarLineas: () => [110],
    });

    expect(analisis.tabla!.y + analisis.tabla!.altoTotal).toBeLessThan(116);
  });
});
