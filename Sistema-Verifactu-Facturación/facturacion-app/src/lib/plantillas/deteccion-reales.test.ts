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

describe('el membrete y el bloque del cliente', () => {
  /** Membrete de dos columnas, como el de cualquier impreso de mayorista. */
  function membrete(): ItemTexto[] {
    return [
      // Marca, en grande y a dos líneas.
      texto('ROGAR', 63, 14.7, 18),
      texto('DISTRIBUCIONES', 49, 21.4, 18),
      // Y los datos, en cuerpo normal.
      texto('MARCOS RODRIGUEZ GUILLEN', 48, 26.9),
      texto('ISA NUM 15 ARGANA ALTA', 52, 30.9),
      texto('ARRECIFE (LANZAROTE)', 53, 35.1),
      texto('35000 LAS PALMAS', 57, 38.8),
      texto('Tfno: 629529015', 60, 42.6),
      texto('CIF: 44708081Z', 60, 46.8),
    ];
  }

  it('guarda la dirección entera, no sólo su primera línea', () => {
    // Registrar una línea por campo no valía: la segunda y las siguientes se
    // descartaban por llevar una clave ya usada, se quedaban sin borrar del
    // calco y la dirección de la muestra salía impresa debajo de la nueva.
    const analisis = detectar(pagina(membrete()), { ajustes: AJUSTES });
    const direccion = claves(analisis).empresa_direccion ?? '';
    expect(direccion).toContain('ISA NUM 15 ARGANA ALTA');
    expect(direccion).toContain('ARRECIFE (LANZAROTE)');
  });

  it('reconoce como nombre las dos líneas del rótulo grande', () => {
    const analisis = detectar(pagina(membrete()), { ajustes: AJUSTES });
    expect(claves(analisis).empresa_nombre).toBe('ROGAR DISTRIBUCIONES');
  });

  it('no mete un rótulo suelto en la dirección', () => {
    // «Tfno:» sin número detrás es del impreso: se queda como está.
    const analisis = detectar(pagina([
      ...membrete().slice(0, 6),
      texto('Tfno:', 60, 42.6),
      texto('CIF: 44708081Z', 60, 46.8),
    ]), { ajustes: AJUSTES });
    expect(claves(analisis).empresa_direccion ?? '').not.toContain('Tfno');
  });

  it('recoge la ciudad aunque venga en la columna de al lado del código postal', () => {
    // En los impresos con casillas el CP y la ciudad van separados. Sueltos
    // no son nada; juntos son la población. Si nadie los reclama, la ciudad
    // del cliente anterior se queda impresa en todas las facturas.
    const analisis = detectar(pagina([
      // Membrete propio a la izquierda, para que el de la derecha sea el
      // cliente y no haya que adivinarlo.
      ...membrete(),
      texto('SUPERMERCADOS LOS MOJONES S.L.', 107.8, 25.6),
      texto('C JUAN CARLOS I LOCAL 2', 107.8, 30.4),
      texto('ARRECIFE', 107.8, 35.2),
      texto('35510', 107.8, 40),
      texto('Las Palmas', 121.8, 40),
      texto('Tfno:', 107.8, 44.8),
      texto('N.I.F. / C.I.F.: B35045590', 107.8, 49.8),
    ]), { ajustes: { ...AJUSTES, nif: '44708081Z' } });
    expect(claves(analisis).cliente_poblacion).toBe('35510 Las Palmas');
  });
});

describe('el número de factura', () => {
  it('lo encuentra bajo el rótulo «FACTURA VENTA»', () => {
    // Sin reconocer la coletilla, el número no se detectaba y, al no borrarse
    // del calco, el de la factura de muestra salía impreso en TODAS las
    // facturas emitidas con la plantilla.
    const analisis = detectar(pagina([
      texto('FACTURA VENTA', 13.4, 59.7, 9, NEGRITA),
      texto('FECHA', 49.7, 59.7, 9, NEGRITA),
      texto('26 / 26003239', 16.8, 66.1),
      texto('12/08/2026', 46.9, 66.3),
    ]), { ajustes: AJUSTES });
    expect(claves(analisis).doc_numero).toBe('26 / 26003239');
    expect(claves(analisis).doc_fecha).toBe('12/08/2026');
  });

  it('no confunde un código postal con el número de factura', () => {
    const analisis = detectar(pagina([
      texto('SUPERMERCADOS LOS MOJONES S.L.', 107.8, 25.6),
      texto('C JUAN CARLOS I LOCAL 2', 107.8, 30.4),
      texto('35510 Las Palmas', 107.8, 40),
      texto('Tfno:', 107.8, 44.8),
      texto('N.I.F. / C.I.F.: B35045590', 107.8, 49.8),
    ]), { ajustes: AJUSTES });
    expect(claves(analisis).doc_numero).toBeUndefined();
  });
});

describe('etiqueta y valor dentro del mismo trozo de texto', () => {
  it('corta por donde acaba la etiqueta, no por el número de letras', () => {
    // «N.I.F. / C.I.F.: B35045590» llega como un único trozo y hay que
    // estimar dónde empieza el valor. Repartir el ancho a partes iguales
    // entre los caracteres se equivoca en milímetros —una etiqueta llena de
    // puntos ocupa mucho menos de lo que su número de letras sugiere— y el
    // corte caía dentro del valor: lo que quedaba fuera no se borraba y
    // aparecía media «B» del NIF anterior pegada al NIF nuevo.
    const item = texto('N.I.F. / C.I.F.: B35045590', 107.8, 49.8);
    item.ancho = 37;
    const analisis = detectar(pagina([item]), { ajustes: AJUSTES });
    const nif = analisis.campos.find(c => c.clave === 'cliente_nif' || c.clave === 'empresa_nif');
    expect(nif).toBeDefined();
    // La «B» empieza de verdad en x≈128,3. Vale acercarse por la izquierda
    // (se borra un poco de blanco), nunca pasarse por la derecha.
    expect(nif!.x).toBeLessThanOrEqual(128.5);
    expect(nif!.x).toBeGreaterThan(124);
  });
});

describe('el cuadro de impuestos y las casillas de recuento del pie', () => {
  /** Pie de un impreso de reparto: rejilla de impuestos y recuentos al lado. */
  function pieDeImpreso(): ItemTexto[] {
    return [
      // La tabla de líneas, para que existan las columnas del recuento.
      ...tablaCon(
        [['CÓDIGO', 13], ['DESCRIPCIÓN', 40], ['CAJ.', 100], ['UDES.', 120], ['TOTAL', 170]],
        [
          [['PRD-1', 13], ['Leche', 40], ['4', 100], ['96', 120], ['80,00', 170]],
          [['PRD-2', 13], ['Galletas', 40], ['5', 100], ['100', 120], ['82,00', 170]],
        ],
      ),
      // Y el cuadro del pie.
      texto('IMPUESTO', 13.8, 212.3, 9, NEGRITA),
      texto('BASE IMP.', 48.3, 212.3, 9, NEGRITA),
      texto('%', 71, 212.3, 9, NEGRITA),
      texto('CUOTA', 88.8, 212.3, 9, NEGRITA),
      texto('I.G.I.C.', 13.1, 218.7), texto('15,00', 57.7, 218.8), texto('0,0', 72.7, 218.8), texto('0,00', 94.3, 218.8),
      texto('I.G.I.C.', 13.1, 223.7), texto('109,03', 56, 223.7), texto('3,0', 72.7, 223.7), texto('3,27', 94.3, 223.7),
      texto('I.G.I.C.', 13.1, 228.7), texto('14,93', 57.7, 228.7), texto('7,0', 72.7, 228.7), texto('1,05', 94.3, 228.7),
      // Casillas de recuento, en su propia columna a la derecha.
      texto('CAJAS', 108.1, 214.5),
      texto('9,00', 112.8, 217.2),
      texto('UNIDADES', 108.1, 221.3),
      texto('196,00', 111, 225.9),
    ];
  }

  it('reparte la rejilla por renglones, uno por tipo impositivo', () => {
    // Sin esto las cifras eran datos sueltos que nadie sabía rellenar: se
    // borraban del calco y el cuadro salía vacío en todas las facturas, con
    // el desglose de impuestos —que es obligatorio— sin imprimir.
    const c = claves(detectar(pagina(pieDeImpreso()), { ajustes: AJUSTES }));
    expect(c.impuesto_1_base).toBe('15,00');
    expect(c.impuesto_1_pct).toBe('0,0');
    expect(c.impuesto_1_cuota).toBe('0,00');
    expect(c.impuesto_2_base).toBe('109,03');
    expect(c.impuesto_3_cuota).toBe('1,05');
  });

  it('no cuenta como renglón lo que está fuera de las columnas del cuadro', () => {
    // «CAJAS» y «UNIDADES» van a la derecha de la rejilla, en sus propias
    // filas. Contarlas descolocaba el desglose: el segundo tipo impositivo
    // acababa impreso en el tercer renglón.
    const c = claves(detectar(pagina(pieDeImpreso()), { ajustes: AJUSTES }));
    expect(c.impuesto_2_base).toBe('109,03');
    expect(c.impuesto_4_base).toBeUndefined();
  });

  it('ata la casilla «CAJAS» a la suma de la columna «CAJ.»', () => {
    // El impreso no dice de qué es el recuento; lo dice la tabla. Así el
    // mecanismo vale para palés, horas o metros sin saber nada de cajas.
    const analisis = detectar(pagina(pieDeImpreso()), { ajustes: AJUSTES });
    const cajas = analisis.tabla!.columnas.find(col => col.cabecera === 'CAJ.');
    expect(cajas!.clave).toMatch(/^custom_col_\d+$/);
    expect(claves(analisis).total_col_1).toBe('9,00');
  });

  it('reconoce «UNIDADES» como el total de la columna de cantidad', () => {
    expect(claves(detectar(pagina(pieDeImpreso()), { ajustes: AJUSTES })).total_unidades).toBe('196,00');
  });
});
