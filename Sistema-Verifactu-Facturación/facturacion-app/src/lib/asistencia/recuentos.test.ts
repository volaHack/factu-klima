import { describe, it, expect } from 'vitest';

import {
  acotarSituacion, recuentosEnPalabras, retratoDelPanel, retratoEnPalabras,
  type DocumentoDetalleIA,
} from './contexto';
import { InvoiceStatus, type Invoice } from '../types';

/**
 * LO QUE LA ASISTENCIA SABE DE CUÁNTOS DOCUMENTOS HAY
 *
 * «¿Cuántos borradores tengo?» se contestaba con 3 cuando había más de
 * diez, y al preguntar cuáles, el modelo se inventó números de factura.
 * No era el modelo: le llegaba una lista recortada —la ruta se quedaba con
 * las 20 primeras líneas— y le tocaba contarla. Aquí se fija lo que lo
 * arregla: los números van hechos, arriba y enteros.
 */

/** 80 facturas: 20 de 2024, 25 de 2025 y 35 de 2026, con 20 borradores. */
function negocio(): Invoice[] {
  const facturas: Invoice[] = [];
  for (let i = 1; i <= 80; i++) {
    const ano = i <= 20 ? 2024 : i <= 45 ? 2025 : 2026;
    const borrador = i % 5 === 0 || i > 74;
    facturas.push({
      id: 'f' + i, number: `FAC-${ano}-${String(i).padStart(4, '0')}`, tipo: 'factura', sentido: 'venta',
      clientName: 'Cliente ' + (i % 12), clientNif: 'B1234567' + (i % 10),
      issueDate: `${ano}-0${(i % 9) + 1}-1${i % 9}`, dueDate: `${ano}-1${i % 3}-10`,
      status: borrador ? InvoiceStatus.BORRADOR : InvoiceStatus.EMITIDA,
      total: 10, subtotal: 8, totalTax: 2,
      lineItems: [{ productName: 'Producto ' + i, quantity: 2 }],
    } as unknown as Invoice);
  }
  return facturas;
}

function retrato() {
  return retratoEnPalabras(
    retratoDelPanel({ facturas: negocio(), clientes: [], ajustes: null, tienePlantillaPropia: true } as never),
  ).join('\n');
}

describe('los recuentos van hechos', () => {
  it('cuenta TODOS los borradores, no los primeros de una lista', () => {
    expect(retrato()).toMatch(/Factura: 80 en total → Emitida: 60 \([^)]*\); Borrador: 20/);
  });

  it('los reparte por año', () => {
    const texto = retrato();
    expect(texto).toMatch(/- 2026: Factura: 35 \(24 emitida, 11 borrador\)/);
    expect(texto).toMatch(/- 2025: Factura: 25 \(20 emitida, 5 borrador\)/);
    expect(texto).toMatch(/- 2024: Factura: 20 \(16 emitida, 4 borrador\)/);
  });

  it('y ya suma «desde cada año hasta hoy»', () => {
    // «A partir de 2024» se contestaba con los de 2024 solos: 4 en vez
    // de 20. Pedirle al modelo que sume no bastó; dárselo sumado, sí.
    const texto = retrato();
    expect(texto).toMatch(/Desde 2024 hasta hoy: Factura: 80 \(60 emitida, 20 borrador\)/);
    expect(texto).toMatch(/Desde 2025 hasta hoy: Factura: 60 \(44 emitida, 16 borrador\)/);
  });

  it('da el NÚMERO de cada borrador, para que no tenga que inventarlo', () => {
    // Con el listado recortado, el modelo nombró cuatro FAC-2024 que no
    // existían. Los reales tienen que estar escritos.
    const texto = retrato();
    const linea = texto.split('\n').find(l => l.includes('Factura · Borrador · 2024'))!;
    for (const n of ['FAC-2024-0005', 'FAC-2024-0010', 'FAC-2024-0015', 'FAC-2024-0020']) {
      expect(linea, `falta ${n}`).toContain(n);
    }
    expect(linea).toContain('(4)');
  });

  it('los recuentos van antes que cualquier listado', () => {
    // Si hay que recortar, se recorta por el final: lo de arriba llega
    // siempre entero.
    const texto = retrato();
    expect(texto.indexOf('RECUENTO EXACTO')).toBeLessThan(texto.indexOf('REGISTRO DETALLADO'));
    expect(texto.indexOf('A MEDIAS')).toBeLessThan(texto.indexOf('REGISTRO DETALLADO'));
  });

  it('sin documentos lo dice, no se inventa un cero en cada tipo', () => {
    expect(recuentosEnPalabras([])).toEqual(['- No hay ningún documento creado todavía.']);
  });

  it('los emitidos no salen en la lista de los que están a medias', () => {
    const docs = [
      { tipo: 'Factura', estado: 'Emitida', numero: 'FAC-1', fechaEmision: '2026-01-01', total: 1 },
      { tipo: 'Factura', estado: 'Borrador', numero: 'FAC-2', fechaEmision: '2026-01-01', total: 1 },
    ] as DocumentoDetalleIA[];
    const lineas = recuentosEnPalabras(docs).join('\n');
    const aMedias = lineas.slice(lineas.indexOf('A MEDIAS'));
    expect(aMedias).toContain('FAC-2');
    expect(aMedias).not.toContain('FAC-1');
  });
});

describe('recortar sin perder los números', () => {
  it('corta por el final y avisa de que ha cortado', () => {
    const lineas = ['RECUENTO: 20 borradores', ...Array.from({ length: 200 }, (_, i) => `documento ${i} `.repeat(10))];
    const acotado = acotarSituacion(lineas, 2_000);
    expect(acotado[0]).toBe('RECUENTO: 20 borradores');
    expect(acotado.join('\n').length).toBeLessThanOrEqual(2_300);
    // Sin el aviso, el modelo toma un listado parcial por completo.
    expect(acotado[acotado.length - 1]).toMatch(/no caben aquí.*RECUENTOS/);
  });

  it('si cabe todo, no toca nada ni añade avisos', () => {
    const lineas = ['a', 'b', 'c'];
    expect(acotarSituacion(lineas, 1_000)).toEqual(lineas);
  });

  it('el retrato de un negocio de 80 documentos conserva sus recuentos con el tope del modelo local', () => {
    // 7.500 caracteres es lo que le cabe al Qwen local de 8.192 tokens.
    const acotado = acotarSituacion(retrato().split('\n'), 7_500).join('\n');
    expect(acotado).toMatch(/Borrador: 20/);
    expect(acotado).toMatch(/Desde 2024 hasta hoy/);
    expect(acotado).toContain('FAC-2024-0005');
  });
});
