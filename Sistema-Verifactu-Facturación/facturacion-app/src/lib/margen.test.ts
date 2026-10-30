import { describe, it, expect } from 'vitest';
import { margenDeLinea, precioParaMargen, textoMargen, MARGEN_BAJO } from './margen';

const linea = (o: Partial<{ productId: string; unitPrice: number; discountPercent: number; discountPercent2: number; discountPercent3: number }> = {}) => ({
  productId: 'agua', unitPrice: 10, discountPercent: 0, ...o,
});

describe('el margen de la línea', () => {
  it('es sobre la venta y con el precio neto de los tres descuentos', () => {
    const m = margenDeLinea(linea({ unitPrice: 10 }), { costePmp: 6 })!;
    expect(m.porcentaje).toBe(40);
    expect(m.porUnidad).toBeCloseTo(4);
    expect(m.nivel).toBe('normal');

    // 10 € −10 % −10 % = 8,10 € netos; con 6 € de coste quedan 2,10 €.
    const conDtos = margenDeLinea(linea({ unitPrice: 10, discountPercent: 10, discountPercent2: 10 }), { costePmp: 6 })!;
    expect(conDtos.neto).toBeCloseTo(8.1);
    expect(conDtos.porcentaje).toBe(25.9);
  });

  it('toma el precio medio y, sin él, la última compra o el precio de compra', () => {
    expect(margenDeLinea(linea(), { costePmp: 5, costeUltimaCompra: 7, purchasePrice: 8 })!.coste).toBe(5);
    expect(margenDeLinea(linea(), { costeUltimaCompra: 7, purchasePrice: 8 })!.coste).toBe(7);
    expect(margenDeLinea(linea(), { purchasePrice: 8 })!.coste).toBe(8);
  });

  it('avisa del margen bajo y de la venta a pérdida', () => {
    expect(margenDeLinea(linea({ unitPrice: 10 }), { costePmp: 9.5 })!.nivel).toBe('bajo');
    const perdida = margenDeLinea(linea({ unitPrice: 10, discountPercent: 20 }), { costePmp: 9 })!;
    expect(perdida.nivel).toBe('perdida');
    expect(perdida.porUnidad).toBeCloseTo(-1);
    // Justo al coste no se pierde nada: margen cero, bajo.
    expect(margenDeLinea(linea({ unitPrice: 9 }), { costePmp: 9 })!.nivel).toBe('bajo');
    // El umbral se puede cambiar.
    expect(margenDeLinea(linea({ unitPrice: 10 }), { costePmp: 8.5 }, 20)!.nivel).toBe('bajo');
    expect(MARGEN_BAJO).toBeGreaterThan(0);
  });

  it('sin coste, sin precio o sin artículo no hay margen que enseñar', () => {
    expect(margenDeLinea(linea(), {})).toBeNull();
    expect(margenDeLinea(linea(), { costePmp: 0, purchasePrice: 0 })).toBeNull();
    expect(margenDeLinea(linea({ unitPrice: 0 }), { costePmp: 3 })).toBeNull();
    expect(margenDeLinea(linea({ productId: '' }), { costePmp: 3 })).toBeNull();
    expect(margenDeLinea(linea(), undefined)).toBeNull();
  });

  it('un descuento del 100 % es perder todo el coste', () => {
    expect(margenDeLinea(linea({ discountPercent: 100 }), { costePmp: 3 })!.nivel).toBe('perdida');
  });
});

describe('el precio para un margen', () => {
  it('deja el margen pedido sobre la venta, redondeado al céntimo hacia arriba', () => {
    expect(precioParaMargen(8, 20)).toBe(10);
    expect(precioParaMargen(7, 20)).toBe(8.75);
    expect(precioParaMargen(1, 30)).toBe(1.43);
  });

  it('tiene en cuenta los descuentos de la línea', () => {
    // 10 € netos con un 20 % de descuento: 12,50 € de tarifa.
    expect(precioParaMargen(8, 20, [20])).toBe(12.5);
    const p = precioParaMargen(7.3, 15, [10, 5, 0])!;
    const margen = margenDeLinea(linea({ unitPrice: p, discountPercent: 10, discountPercent2: 5 }), { costePmp: 7.3 })!;
    expect(margen.porcentaje).toBeGreaterThanOrEqual(15);
  });

  it('no inventa precios imposibles', () => {
    expect(precioParaMargen(0, 20)).toBeNull();
    expect(precioParaMargen(5, 100)).toBeNull();
    expect(precioParaMargen(5, 20, [100])).toBeNull();
  });

  it('se dice en corto, con el signo menos tipográfico', () => {
    expect(textoMargen({ porcentaje: 32.5 })).toBe('Margen 32,5 %');
    expect(textoMargen({ porcentaje: -8 })).toBe('Margen −8 %');
  });
});
