import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { calculateInvoiceTotals, desgloseDescuentos } from './utils';
import { InvoiceLineItem, TaxRate, UnitOfMeasure } from './types';

/**
 * EL DESCUENTO A PIE DE FACTURA
 *
 * Hay dos sitios donde se rebaja: en la línea, que es parte del precio de
 * ese producto, y al pie, que es una rebaja sobre el total de la factura.
 * Los dos se encadenan (un 10 % y luego un 5 % no son un 15 %).
 *
 * El número que de verdad importa lo calcula la BASE DE DATOS al sellar,
 * no la pantalla: `fn_invoice_seal` rehace los importes desde las líneas
 * porque fiarse del total que manda el cliente sería la puerta grande al
 * fraude. Así que hay una obligación que este fichero vigila: la fórmula
 * de la pantalla y la del disparador tienen que dar lo MISMO. Si no, la
 * factura se sella por un importe distinto del que se vio y del que se
 * imprime, que es lo más grave que puede pasar en un programa de facturas.
 *
 * Los números de más abajo salieron de ejecutar el disparador de verdad
 * contra la base de datos, dentro de una transacción deshecha después.
 */

function linea(campos: Partial<InvoiceLineItem>): InvoiceLineItem {
  return {
    id: 'l1',
    productId: 'p1',
    productName: 'Producto',
    productRef: 'REF',
    quantity: 1,
    unitPrice: 0,
    unit: UnitOfMeasure.UNIDAD,
    taxRate: TaxRate.GENERAL,
    discountPercent: 0,
    subtotal: 0,
    taxAmount: 0,
    total: 0,
    ...campos,
  };
}

describe('descuento a pie de factura', () => {
  // El caso que se probó contra el disparador real.
  const LINEAS = [
    linea({
      id: 'a', quantity: 2, unitPrice: 10, taxRate: 21,
      discountPercent: 10, discountPercent2: 5,
    }),
    linea({ id: 'b', quantity: 1, unitPrice: 5, taxRate: 10 }),
  ];

  it('da los mismos importes que el sellado de la base de datos', () => {
    const totales = calculateInvoiceTotals(LINEAS, [10, 0, 0]);

    // Lo que devolvió Postgres para esta misma factura:
    //   base 19.89 · descuentos 5.11 · impuestos 3.68 · total 23.57
    expect(totales.subtotal).toBe(19.89);
    expect(totales.totalDiscount).toBe(5.11);
    expect(totales.totalTax).toBe(3.68);
    expect(totales.total).toBe(23.57);
  });

  it('encadena los tres descuentos de pie, no los suma', () => {
    const lineas = [linea({ quantity: 1, unitPrice: 100, taxRate: 21 })];

    // 10 % y luego 5 % dejan 85,50 €, no 85 €.
    expect(calculateInvoiceTotals(lineas, [10, 5, 0]).subtotal).toBe(85.5);
    // Y un 15 % de una vez sí deja 85 €: la diferencia es real y es la
    // razón de encadenarlos.
    expect(calculateInvoiceTotals(lineas, [15, 0, 0]).subtotal).toBe(85);
  });

  it('reparte el impuesto por tipos después de aplicar el pie', () => {
    const totales = calculateInvoiceTotals(LINEAS, [10, 0, 0]);
    const general = totales.taxBreakdown.find(t => t.rate === 21);
    const reducido = totales.taxBreakdown.find(t => t.rate === 10);

    // 2 × 10 € con 10 % + 5 % = 17,10 €; menos el 10 % de pie = 15,39 €.
    expect(general?.base).toBe(15.39);
    expect(general?.amount).toBe(3.23);
    // 5 € menos el 10 % de pie = 4,50 €.
    expect(reducido?.base).toBe(4.5);
    expect(reducido?.amount).toBe(0.45);
  });

  it('sin descuento de pie no cambia nada de lo que ya había', () => {
    const conPie = calculateInvoiceTotals(LINEAS, [0, 0, 0]);
    const sinArgumento = calculateInvoiceTotals(LINEAS);
    expect(conPie).toEqual(sinArgumento);
    expect(sinArgumento.globalDiscountAmount).toBe(0);
  });
});

describe('desgloseDescuentos: lo de las líneas y lo del pie, por separado', () => {
  const documento = {
    lineItems: [
      linea({ id: 'a', quantity: 2, unitPrice: 10, taxRate: 21, discountPercent: 10, discountPercent2: 5 }),
      linea({ id: 'b', quantity: 1, unitPrice: 5, taxRate: 10 }),
    ],
    totalDiscount: 5.11,
    globalDiscountPercent1: 10,
  };

  it('separa los 5,11 € en lo rebajado en línea y lo rebajado al pie', () => {
    const d = desgloseDescuentos(documento);
    // Base de líneas tras sus propios descuentos: 17,10 + 5 = 22,10 €.
    // El 10 % de pie son 2,21 €; el resto venía de la línea.
    expect(d.alPie).toBe(2.21);
    expect(d.enLineas).toBe(2.9);
    expect(d.porcentajesPie).toEqual([10]);
  });

  it('los dos renglones suman siempre el descuento que la factura dice tener', () => {
    // Esto es lo que impide que la factura impresa se contradiga a sí
    // misma: se RESTA del total guardado en vez de calcularse aparte, así
    // que cuadra incluso en una factura sellada, cuyos importes ya no se
    // recalculan nunca.
    const d = desgloseDescuentos(documento);
    expect(Number((d.enLineas + d.alPie).toFixed(2))).toBe(documento.totalDiscount);
  });

  it('sin porcentajes de pie, todo el descuento es de línea', () => {
    const d = desgloseDescuentos({ ...documento, globalDiscountPercent1: 0 });
    expect(d.alPie).toBe(0);
    expect(d.enLineas).toBe(5.11);
    expect(d.porcentajesPie).toEqual([]);
  });

  it('enumera los porcentajes de pie que se hayan usado', () => {
    const d = desgloseDescuentos({
      ...documento,
      globalDiscountPercent1: 10,
      globalDiscountPercent2: 0,
      globalDiscountPercent3: 2,
    });
    expect(d.porcentajesPie).toEqual([10, 2]);
  });
});

describe('la migración 046 enseña al disparador a contar los descuentos', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase', 'migration_046_descuento_pie_factura.sql'),
    'utf8',
  );

  it('aplica los tres descuentos de pie', () => {
    for (const campo of [
      'global_discount_percent_1',
      'global_discount_percent_2',
      'global_discount_percent_3',
    ]) {
      expect(sql).toContain(campo);
    }
  });

  it('aplica los tres descuentos de línea, no sólo el primero', () => {
    // El fallo original: el disparador multiplicaba por
    // (1 - discount_percent/100) y se olvidaba de los otros dos.
    for (const campo of ['discount_percent,', 'discount_percent_2', 'discount_percent_3']) {
      expect(sql).toContain(campo);
    }
  });

  it('falla en voz alta si el parche no llega a entrar', () => {
    // Una migración que no hace nada y no lo dice deja la función a medias
    // y el fallo aparece en la primera factura con descuento, no aquí.
    expect(sql).toMatch(/RAISE EXCEPTION/);
  });
});
