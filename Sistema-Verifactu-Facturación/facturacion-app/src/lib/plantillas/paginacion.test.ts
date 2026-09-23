import { describe, it, expect } from 'vitest';

import {
  pareceDato,
  pareceNumeroDePagina,
  pareceNumeroDePaginaSinDuda,
} from './deteccion';

/**
 * RECONOCER LA PAGINACIÓN DE UN DOCUMENTO
 *
 * Una factura larga ocupa varias hojas y casi todos los impresos llevan el
 * contador al pie. Sin reconocerlo, ese texto se calcaba como parte del
 * diseño: la factura de cinco páginas salía con «Página 1 de 1» impreso en
 * las cinco, porque era el número que traía el PDF de muestra.
 *
 * Reconocido, se convierte en el campo `doc_pagina`, que pdfme sustituye
 * en cada hoja por el contador de verdad.
 */

describe('qué texto es una paginación', () => {
  it('con la palabra escrita, en todas sus formas', () => {
    for (const texto of [
      'Página 1 de 2', 'Pagina 1 de 2', 'PÁGINA 1 DE 2',
      'Pág. 3/4', 'Pag 3 de 4', 'pág 1',
      'Hoja 2 de 5', 'Página: 1 de 3', 'Page 1 of 2',
    ]) {
      expect(pareceNumeroDePagina(texto), `«${texto}»`).toBe(true);
      expect(pareceNumeroDePaginaSinDuda(texto), `«${texto}» no deja dudas`).toBe(true);
    }
  });

  it('sin la palabra, se reconoce pero con dudas', () => {
    // «1/2» también puede ser media unidad en una línea de factura. Por eso
    // quien lo use exige además que esté en el borde de la hoja.
    for (const texto of ['1 de 2', '1/2', '10 de 12']) {
      expect(pareceNumeroDePagina(texto), `«${texto}»`).toBe(true);
      expect(pareceNumeroDePaginaSinDuda(texto), `«${texto}» sí deja dudas`).toBe(false);
    }
  });

  it('no confunde lo que no es', () => {
    for (const texto of [
      'Factura', '1.250,00 €', '12/03/2026', 'B12345678',
      'Paginación del catálogo', 'Calle Página 3', '',
    ]) {
      expect(pareceNumeroDePagina(texto), `«${texto}» no es una paginación`).toBe(false);
    }
  });

  it('una fecha no es una paginación', () => {
    // «1/2» y «1/2/2026» empiezan igual: si la fecha colara, el día de la
    // factura acabaría imprimiéndose como número de página.
    expect(pareceNumeroDePagina('1/2/2026')).toBe(false);
    expect(pareceNumeroDePagina('01/02/26')).toBe(false);
  });

  it('cuenta como dato, no como rótulo del diseño', () => {
    // Si no contara como dato, el detector lo dejaría formando parte del
    // calco y se imprimiría siempre el mismo número.
    expect(pareceDato('Página 1 de 2')).toBe(true);
    expect(pareceDato('Pág. 3/4')).toBe(true);
  });
});
