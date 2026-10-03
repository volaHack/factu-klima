import { describe, expect, it } from 'vitest';
import { aplicarFormato, formatoVigente, rotuloDeTipo } from './rotuloTipo';

const ALBARAN = { doc_tipo: 'ALBARÁN', doc_tipo_nombre: 'Albarán', doc_tipo_minus: 'albarán' };

describe('rotuloDeTipo', () => {
  it.each([
    ['FACTURA VENTA', '{doc_tipo} VENTA', 'ALBARÁN VENTA'],
    ['Factura venta', '{doc_tipo_nombre} venta', 'Albarán venta'],
    ['factura de venta', '{doc_tipo_minus} de venta', 'albarán de venta'],
    ['ALBARÁN VENTA', '{doc_tipo} VENTA', 'ALBARÁN VENTA'],
    ['Pedido venta', '{doc_tipo_nombre} venta', 'Albarán venta'],
    ['PRESUPUESTO', '{doc_tipo}', 'ALBARÁN'],
    ['Nº Factura:', 'Nº {doc_tipo_nombre}:', 'Nº Albarán:'],
    ['N.º FACTURA', 'N.º {doc_tipo}', 'N.º ALBARÁN'],
    ['FACTURA RECTIFICATIVA', '{doc_tipo}', 'ALBARÁN'],
    ['Factura simplificada', '{doc_tipo_nombre}', 'Albarán'],
    ['Albarán de entrega', '{doc_tipo_nombre}', 'Albarán'],
  ])('«%s» → %s', (texto, formato, impreso) => {
    const r = rotuloDeTipo(texto);
    expect(r?.formato).toBe(formato);
    expect(aplicarFormato(r!.formato, ALBARAN)).toBe(impreso);
  });

  it.each([
    'Total factura', 'Datos de la factura', 'Fecha factura', 'Este albarán no es una factura',
    'Factura / Albarán', 'Forma de pago', 'Pendiente de factura', '',
  ])('no toma por rótulo «%s»', texto => {
    expect(rotuloDeTipo(texto)).toBeNull();
  });

  it('«Nº Pedido:» al lado de un valor es la referencia del cliente, no el tipo', () => {
    expect(rotuloDeTipo('Nº Pedido:', true)).toBeNull();
    expect(rotuloDeTipo('Nº Factura:', true)?.formato).toBe('Nº {doc_tipo_nombre}:');
    // Como título grande, en cambio, «PEDIDO» sí dice lo que es el documento.
    expect(rotuloDeTipo('PEDIDO')?.formato).toBe('{doc_tipo}');
  });
});

describe('formatoVigente', () => {
  it('vale mientras la clave del campo sea la del formato', () => {
    expect(formatoVigente({ clave: 'doc_tipo', formato: '{doc_tipo} VENTA' })).toBe('{doc_tipo} VENTA');
    expect(formatoVigente({ clave: 'cliente_nombre', formato: '{doc_tipo} VENTA' })).toBeNull();
    expect(formatoVigente({ clave: 'doc_tipo' })).toBeNull();
  });
});
