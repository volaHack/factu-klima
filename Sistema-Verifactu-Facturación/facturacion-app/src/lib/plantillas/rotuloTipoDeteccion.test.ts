/**
 * Una plantilla subida desde una factura tiene que titular cada documento
 * con su tipo: el rótulo «FACTURA VENTA» del PDF se convierte en un campo
 * que imprime «ALBARÁN VENTA» en un albarán, sin tocar lo demás.
 */

import { describe, expect, it } from 'vitest';
import { replacePlaceholders, type Schema } from '@pdfme/common';
import { agruparEnLineas } from './extraccion';
import { detectar } from './deteccion';
import { compilarPlantilla } from './plantilla';
import { construirDatos, facturaDeMuestra } from './datos';
import type { TipoDocumentoPlantilla } from './tiposDocumento';
import type { CompanySettings } from '../types';
import type { ItemTexto, PaginaExtraida } from './tipos';

const MM_POR_PUNTO = 0.3528;

function texto(contenido: string, x: number, y: number, tamano = 9, extra: Partial<ItemTexto> = {}): ItemTexto {
  return {
    texto: contenido, x, y,
    ancho: contenido.length * tamano * 0.5 * MM_POR_PUNTO,
    alto: tamano * MM_POR_PUNTO,
    tamano, fuente: 'Helvetica', negrita: false, cursiva: false, serif: false, monoespaciada: false, color: '#000000',
    ...extra,
  };
}
const NEGRITA = { negrita: true };

function pagina(items: ItemTexto[]): PaginaExtraida {
  return {
    ancho: 210, alto: 297, items, lineas: agruparEnLineas(items), totalPaginas: 1,
    bitmap: { dataUrl: '', anchoPx: 1654, altoPx: 2339, pxPorMm: 7.87 },
  };
}

const AJUSTES = { businessName: 'Distribuciones Ejemplo S.L.', tradeName: 'Distribuciones Ejemplo', nif: 'B12345678' } as CompanySettings;

/** Lo que imprime cada rótulo de tipo de la plantilla para un documento de ese tipo. */
function rotulosImpresos(items: ItemTexto[], tipo: TipoDocumentoPlantilla): string[] {
  const analisis = detectar(pagina(items), { ajustes: AJUSTES });
  const { plantilla } = compilarPlantilla(analisis, { fondo: '', archivoOrigen: 'muestra.pdf' });
  const estaticos = (plantilla.basePdf as { staticSchema: Schema[] }).staticSchema;
  const datos = construirDatos({ tipo, documento: facturaDeMuestra() } as Parameters<typeof construirDatos>[0], AJUSTES);
  return estaticos
    .filter(e => e.name.startsWith('doc_tipo'))
    .map(e => replacePlaceholders({ content: String((e as { content?: string }).content), variables: datos.campos, schemas: [[]] }));
}

const MAYORISTA = [
  texto('FACTURA VENTA', 13.4, 59.7, 9, NEGRITA),
  texto('FECHA', 49.7, 59.7, 9, NEGRITA),
  texto('26 / 26003239', 16.8, 66.1),
  texto('12/08/2026', 46.9, 66.3),
];

describe('el rótulo del tipo de documento', () => {
  it('«FACTURA VENTA» sobre el número pasa a ser un campo con formato', () => {
    const analisis = detectar(pagina(MAYORISTA), { ajustes: AJUSTES });
    const rotulo = analisis.campos.find(c => c.clave === 'doc_tipo');
    expect(rotulo?.formato).toBe('{doc_tipo} VENTA');
    expect(rotulo?.valorOriginal).toBe('FACTURA VENTA');
    // El número sigue detectándose como antes.
    expect(analisis.campos.find(c => c.clave === 'doc_numero')?.valorOriginal).toBe('26 / 26003239');
  });

  it.each([
    ['factura', 'FACTURA VENTA'],
    ['albaran', 'ALBARÁN VENTA'],
    ['pedido', 'PEDIDO VENTA'],
    ['presupuesto', 'PRESUPUESTO VENTA'],
    ['rectificativa', 'FACTURA RECTIFICATIVA VENTA'],
  ] as const)('un %s generado con esa plantilla dice «%s»', (tipo, esperado) => {
    expect(rotulosImpresos(MAYORISTA, tipo)).toEqual([esperado]);
  });

  it('respeta las mayúsculas: «Factura venta» sale «Albarán venta»', () => {
    const items = [texto('Factura venta', 13.4, 59.7, 9, NEGRITA), texto('26 / 26003239', 16.8, 66.1)];
    expect(rotulosImpresos(items, 'albaran')).toEqual(['Albarán venta']);
  });

  it('el título grande y la etiqueta del número cambian los dos', () => {
    const items = [
      texto('DISTRIBUCIONES EJEMPLO S.L.', 15, 18, 13, NEGRITA),
      texto('FACTURA', 150, 18, 16, NEGRITA),
      texto('Nº factura:', 140, 28),
      texto('FAC-2026-0001', 168, 28),
      texto('Fecha:', 140, 33),
      texto('12/01/2026', 168, 33),
    ];
    expect(rotulosImpresos(items, 'presupuesto').sort()).toEqual(['Nº presupuesto:', 'PRESUPUESTO']);
  });

  it('con el número pegado («Factura nº: 2026-001») sólo cambia la parte del rótulo', () => {
    const analisis = detectar(pagina([texto('Factura nº: 2026-001', 140, 28)]), { ajustes: AJUSTES });
    const rotulo = analisis.campos.find(c => c.clave === 'doc_tipo_nombre')!;
    const numero = analisis.campos.find(c => c.clave === 'doc_numero')!;
    expect(rotulo.formato).toBe('{doc_tipo_nombre} nº:');
    expect(numero.valorOriginal).toBe('2026-001');
    // El rótulo acaba donde empieza el número: no se pisan.
    expect(rotulo.x + rotulo.ancho).toBeLessThanOrEqual(numero.x + 0.01);
  });

  it('«Nº Pedido:» de una factura es la referencia del cliente y no se toca', () => {
    const items = [
      texto('FACTURA', 150, 18, 16, NEGRITA),
      texto('Nº factura:', 140, 28),
      texto('FAC-2026-0001', 168, 28),
      texto('Nº Pedido:', 140, 38),
      texto('PED-4567', 168, 38),
    ];
    const analisis = detectar(pagina(items), { ajustes: AJUSTES });
    const deTipo = analisis.campos.filter(c => c.clave?.startsWith('doc_tipo')).map(c => c.valorOriginal);
    expect(deTipo.sort()).toEqual(['FACTURA', 'Nº factura:']);
  });

  it('no toca frases ni lo que está en la mitad de abajo', () => {
    const items = [
      texto('Datos de la factura', 15, 60, 9, NEGRITA),
      texto('Total factura', 140, 250, 11, NEGRITA),
      texto('FACTURA', 90, 280, 14, NEGRITA),
    ];
    const analisis = detectar(pagina(items), { ajustes: AJUSTES });
    expect(analisis.campos.filter(c => c.clave?.startsWith('doc_tipo'))).toEqual([]);
  });
});
