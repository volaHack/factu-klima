/**
 * El detector se prueba con una factura sintética montada a mano, con las
 * posiciones en milímetros que tendría una factura A4 de verdad. Es la forma
 * de comprobar las reglas sin depender de pdf.js ni de un canvas: lo que
 * sale de la extracción es exactamente esta lista de textos con su caja.
 */

import { describe, expect, it } from 'vitest';
import { agruparEnLineas } from './extraccion';
import { detectar, pareceImporte, pareceNif, separarEtiquetaYValor } from './deteccion';
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
  const alto = tamano * MM_POR_PUNTO;
  return {
    texto: contenido,
    x,
    y,
    // Ancho aproximado de una tipografía normal: medio cuadratín por letra.
    ancho: contenido.length * tamano * 0.5 * MM_POR_PUNTO,
    alto,
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

/** Factura de ejemplo con la disposición más habitual en España. */
function facturaDeEjemplo(): ItemTexto[] {
  return [
    // Membrete del emisor
    texto('DISTRIBUCIONES EJEMPLO S.L.', 15, 18, 13, NEGRITA),
    texto('NIF: B12345678', 15, 25),
    texto('Calle Mayor 1', 15, 29),
    texto('28001 Madrid (Madrid)', 15, 33),
    texto('Tel. 910 000 000', 15, 37),

    // Caja de datos del documento, arriba a la derecha
    texto('FACTURA', 150, 18, 16, NEGRITA),
    texto('Nº factura:', 140, 28),
    texto('FAC-2026-0001', 168, 28),
    texto('Fecha:', 140, 33),
    texto('12/01/2026', 168, 33),
    texto('Vencimiento:', 140, 38),
    texto('11/02/2026', 168, 38),

    // Destinatario
    texto('FACTURAR A:', 15, 52, 9, NEGRITA),
    texto('SUPERMERCADOS DEL NORTE S.A.', 15, 58, 10, NEGRITA),
    texto('NIF: A87654321', 15, 63),
    texto('Avenida del Puerto 45', 15, 67),
    texto('46023 Valencia (Valencia)', 15, 71),

    // Tabla de líneas
    texto('Ref.', 15, 90, 9, NEGRITA),
    texto('Descripción', 32, 90, 9, NEGRITA),
    texto('Cant.', 118, 90, 9, NEGRITA),
    texto('Precio', 135, 90, 9, NEGRITA),
    texto('IVA', 155, 90, 9, NEGRITA),
    texto('Importe', 170, 90, 9, NEGRITA),

    texto('REF-001', 15, 98),
    texto('Tomate rama caja 5 kg', 32, 98),
    texto('10 ud', 118, 98),
    texto('12,50 €', 135, 98),
    texto('21%', 155, 98),
    texto('125,00 €', 170, 98),

    texto('REF-002', 15, 104),
    texto('Patata nueva saco 10 kg', 32, 104),
    texto('20 ud', 118, 104),
    texto('8,00 €', 135, 104),
    texto('21%', 155, 104),
    texto('160,00 €', 170, 104),

    texto('REF-003', 15, 110),
    texto('Cebolla dulce malla 2 kg', 32, 110),
    texto('30 ud', 118, 110),
    texto('3,20 €', 135, 110),
    texto('21%', 155, 110),
    texto('96,00 €', 170, 110),

    // Totales
    texto('Base imponible', 140, 125),
    texto('381,00 €', 172, 125),
    texto('IVA 21%', 140, 131),
    texto('80,01 €', 172, 131),
    texto('TOTAL', 140, 138, 11, NEGRITA),
    texto('461,01 €', 170, 138, 11, NEGRITA),

    // Pie
    texto('Forma de pago: Transferencia', 15, 155, 8),
    texto('IBAN: ES12 1234 1234 1212 3456 7890', 15, 160, 8),
    texto('Gracias por su confianza.', 15, 275, 8),
  ];
}

function paginaDeEjemplo(items: ItemTexto[] = facturaDeEjemplo()): PaginaExtraida {
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

// ============================================================

describe('formas reconocibles', () => {
  it('reconoce importes en formato español', () => {
    expect(pareceImporte('1.250,00 €')).toBe(true);
    expect(pareceImporte('461,01 €')).toBe(true);
    expect(pareceImporte('12')).toBe(true);
    expect(pareceImporte('Base imponible')).toBe(false);
    expect(pareceImporte('REF-001')).toBe(false);
  });

  it('reconoce NIF, CIF y NIE', () => {
    expect(pareceNif('B12345678')).toBe(true);
    expect(pareceNif('12345678Z')).toBe(true);
    expect(pareceNif('X1234567L')).toBe(true);
    expect(pareceNif('Calle Mayor')).toBe(false);
  });

  it('separa etiqueta y valor cuando comparten trozo de texto', () => {
    const [linea] = agruparEnLineas([texto('Forma de pago: Transferencia', 15, 10)]);
    const pareja = separarEtiquetaYValor(linea.segmentos[0]);
    expect(pareja?.etiqueta.trim()).toBe('Forma de pago');
    expect(pareja?.valorItems.map(i => i.texto).join('')).toBe('Transferencia');
  });
});

describe('agrupación de textos', () => {
  it('separa en segmentos los textos lejanos de una misma fila', () => {
    const lineas = agruparEnLineas([
      texto('Calle Mayor 1', 15, 29),
      texto('Fecha:', 140, 29),
      texto('12/01/2026', 168, 29),
    ]);
    expect(lineas).toHaveLength(1);
    expect(lineas[0].segmentos.map(s => s.texto)).toEqual(['Calle Mayor 1', 'Fecha:', '12/01/2026']);
  });

  it('junta en un segmento los trozos pegados', () => {
    const lineas = agruparEnLineas([
      texto('Nº fact', 140, 28),
      texto('ura:', 152.3, 28),
    ]);
    expect(lineas[0].segmentos).toHaveLength(1);
  });
});

describe('detección de la tabla de líneas', () => {
  const analisis = detectar(paginaDeEjemplo(), { ajustes: AJUSTES });

  it('encuentra la tabla y sus columnas', () => {
    expect(analisis.tabla).not.toBeNull();
    expect(analisis.tabla!.columnas.map(c => c.clave)).toEqual([
      'ref', 'descripcion', 'cantidad', 'precio', 'impuesto_pct', 'importe',
    ]);
  });

  it('cuenta sólo las filas de la tabla, sin arrastrar los totales', () => {
    expect(analisis.tabla!.filasOriginales).toBe(3);
  });

  it('alinea a la derecha las columnas de importes', () => {
    const columnas = analisis.tabla!.columnas;
    expect(columnas[1].alineacion).toBe('left');
    expect(columnas[5].alineacion).toBe('right');
  });

  it('deja la tabla dentro de la página', () => {
    const tabla = analisis.tabla!;
    expect(tabla.x).toBeGreaterThanOrEqual(0);
    expect(tabla.x + tabla.ancho).toBeLessThanOrEqual(210);
    expect(tabla.y).toBeGreaterThan(80);
  });
});

describe('detección de campos', () => {
  const analisis = detectar(paginaDeEjemplo(), { ajustes: AJUSTES });
  const encontrados = claves(analisis);

  it('reconoce los datos del documento', () => {
    expect(encontrados.doc_numero).toBe('FAC-2026-0001');
    expect(encontrados.doc_fecha).toBe('12/01/2026');
    expect(encontrados.doc_vencimiento).toBe('11/02/2026');
    expect(encontrados.doc_forma_pago).toBe('Transferencia');
  });

  it('reconoce los totales', () => {
    expect(encontrados.total_base).toBe('381,00 €');
    expect(encontrados.total_impuestos).toBe('80,01 €');
    expect(encontrados.total_general).toBe('461,01 €');
  });

  it('distingue el bloque del emisor del bloque del cliente', () => {
    expect(encontrados.empresa_nombre).toContain('DISTRIBUCIONES EJEMPLO');
    expect(encontrados.empresa_nif).toBe('B12345678');
    expect(encontrados.cliente_nombre).toBe('SUPERMERCADOS DEL NORTE S.A.');
    expect(encontrados.cliente_nif).toBe('A87654321');
    expect(encontrados.cliente_poblacion).toBe('46023 Valencia (Valencia)');
  });

  it('no confunde el rótulo «FACTURAR A:» con el nombre del cliente', () => {
    const campoRotulo = analisis.campos.find(c => c.valorOriginal.includes('FACTURAR A'));
    expect(campoRotulo).toBeUndefined();
  });

  it('reconoce el IBAN del pie', () => {
    expect(encontrados.empresa_iban).toBe('ES12 1234 1234 1212 3456 7890');
  });

  it('no convierte en campo el texto de cortesía del pie', () => {
    const cortesia = analisis.campos.find(c => c.valorOriginal.includes('Gracias'));
    expect(cortesia).toBeUndefined();
  });

  it('no deja ningún campo fuera de la página', () => {
    for (const campo of analisis.campos) {
      expect(campo.x).toBeGreaterThanOrEqual(0);
      expect(campo.y).toBeGreaterThanOrEqual(0);
      expect(campo.x + campo.ancho).toBeLessThanOrEqual(210.5);
      expect(campo.y + campo.alto).toBeLessThanOrEqual(297.5);
    }
  });

  it('no asigna dos veces la misma clave', () => {
    const asignadas = analisis.campos.map(c => c.clave).filter(Boolean);
    expect(new Set(asignadas).size).toBe(asignadas.length);
  });
});

describe('cuando faltan los datos de la empresa', () => {
  it('sigue distinguiendo los dos bloques y avisa de la duda', () => {
    const analisis = detectar(paginaDeEjemplo(), {});
    const encontrados = claves(analisis);
    expect(encontrados.cliente_nombre).toBe('SUPERMERCADOS DEL NORTE S.A.');
    expect(encontrados.empresa_nombre).toContain('DISTRIBUCIONES');
  });
});

describe('detección ampliada por diccionario', () => {
  // El valor va justo detrás de la etiqueta y con cifras dentro, como en
  // cualquier factura: el detector rechaza a propósito los valores que están
  // en la otra punta de la hoja o que no son más que otro rótulo.
  const asignar = (etiqueta: string): Record<string, string> => {
    const analisis = detectar(
      paginaDeEjemplo([texto(etiqueta, 20, 120), texto('12345', 70, 120)]),
      { ajustes: AJUSTES },
    );
    return claves(analisis);
  };

  it.each([
    ['Numero de factura', 'doc_numero'],
    ['Invoice number', 'doc_numero'],
    ['Fecha de la factura', 'doc_fecha'],
    ['Issue date', 'doc_fecha'],
    ['Vencimiento de la factura', 'doc_vencimiento'],
    ['Forma de cobro', 'doc_forma_pago'],
    ['Payment method', 'doc_forma_pago'],
    ['Importe a facturar', 'total_base'],
    ['Neto a pagar', 'total_general'],
    ['IVA repercutido', 'total_impuestos'],
    ['Descuento aplicado', 'total_descuento'],
    ['Nº de pedido', 'custom_1'],
    ['Order number', 'custom_1'],
    ['Nº de bastidor', 'custom_2'],
    ['Vendedor', 'custom_3'],
    ['Método de envío', 'custom_4'],
    ['Fecha de entrega prevista', 'custom_5'],
  ])('reconoce «%s» como %s', (etiqueta, claveEsperada) => {
    const mapa = asignar(etiqueta);
    const encontrado = Object.entries(mapa).find(([k]) => k === claveEsperada);
    expect(encontrado).toBeDefined();
  });
});

describe('PDF que no se parece a nada', () => {
  it('no revienta y avisa de lo que no ha encontrado', () => {
    const analisis = detectar(paginaDeEjemplo([texto('Documento sin estructura', 20, 20)]), {});
    expect(analisis.tabla).toBeNull();
    expect(analisis.avisos.some(a => a.nivel === 'aviso')).toBe(true);
  });

  it('avisa cuando el PDF no tiene texto seleccionable', () => {
    const analisis = detectar(paginaDeEjemplo([]), {});
    expect(analisis.avisos.some(a => a.nivel === 'error')).toBe(true);
  });
});
