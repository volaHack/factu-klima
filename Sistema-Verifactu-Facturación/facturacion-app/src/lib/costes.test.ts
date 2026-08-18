import { describe, it, expect } from 'vitest';
import {
  moviemientosDeDocumento, movimientosDeProducto, reproducirCostes,
  type DocumentoParaCostes, type MovimientoCoste,
} from './costes';

const compra = (fecha: string, cantidad: number, precio: number, referencia = `c-${fecha}`): MovimientoCoste =>
  ({ fecha, tipo: 'compra', cantidad, precio, referencia });
const venta = (fecha: string, cantidad: number, referencia = `v-${fecha}`): MovimientoCoste =>
  ({ fecha, tipo: 'venta', cantidad, referencia });

describe('el precio medio ponderado', () => {
  it('mezcla lo que había con lo que entra', () => {
    // 10 a 2 € y 10 a 4 € = 20 a 3 €.
    const { pmpFinal } = reproducirCostes([compra('2026-01-01', 10, 2), compra('2026-01-02', 10, 4)]);
    expect(pmpFinal).toBe(3);
  });

  it('pondera por cantidad, no a partes iguales', () => {
    // 90 a 1 € y 10 a 11 € = 100 a 2 €, no a 6 €.
    const { pmpFinal } = reproducirCostes([compra('2026-01-01', 90, 1), compra('2026-01-02', 10, 11)]);
    expect(pmpFinal).toBe(2);
  });

  it('una venta no mueve el medio', () => {
    // Vender no cambia lo que costó el género que queda en la estantería.
    const { pmpFinal } = reproducirCostes([compra('2026-01-01', 10, 5), venta('2026-01-02', 4)]);
    expect(pmpFinal).toBe(5);
  });
});

describe('la compra que se mete después de la venta', () => {
  // El caso de verdad: se vende el lunes y la factura del proveedor llega el
  // día 20 del mes siguiente.
  const historico = [
    compra('2026-01-10', 100, 2, 'compra-enero'),
    venta('2026-02-05', 30, 'venta-febrero'),
    compra('2026-02-20', 100, 4, 'compra-febrero'),
    venta('2026-03-01', 50, 'venta-marzo'),
  ];

  it('cada venta lleva el coste que tocaba EN SU FECHA', () => {
    const { costes } = reproducirCostes(historico);
    // La de febrero se llevó género comprado a 2 €...
    expect(costes.find(c => c.referencia === 'venta-febrero')!.costeUnitario).toBe(2);
    // ...y la de marzo ya mezcla: quedaban 70 a 2 € y entraron 100 a 4 €.
    // (70×2 + 100×4) / 170 = 3,176…
    expect(costes.find(c => c.referencia === 'venta-marzo')!.costeUnitario).toBeCloseTo(3.1765, 3);
  });

  it('el orden en que se metan los papeles da igual', () => {
    // Es la garantía que hace falta: meter la compra tarde no puede cambiar
    // el resultado, sólo la fecha del movimiento.
    const alReves = [...historico].reverse();
    expect(reproducirCostes(alReves)).toEqual(reproducirCostes(historico));
  });

  it('no deja el coste a cero cuando la venta va antes de toda compra', () => {
    // Aquí está el estropicio: sin esto la venta se apunta a coste cero y el
    // informe canta un beneficio del cien por cien que nadie ha tenido.
    const { costes } = reproducirCostes([venta('2026-01-05', 10, 'v'), compra('2026-01-20', 100, 7)]);
    expect(costes[0].costeUnitario).toBe(7);
    expect(costes[0].estimado).toBe(true);
  });

  it('avisa de que se vendió lo que no constaba comprado', () => {
    const { huboDescubierto } = reproducirCostes([venta('2026-01-05', 10, 'v'), compra('2026-01-20', 100, 7)]);
    expect(huboDescubierto).toBe(true);
  });

  it('lo comprado y vendido el mismo día entra antes de salir', () => {
    // El género que se recibe por la mañana y sale por la tarde. Procesando
    // la venta primero se quedaría sin coste y las existencias en negativo.
    const { costes, huboDescubierto } = reproducirCostes([
      venta('2026-01-10', 5, 'v'), compra('2026-01-10', 10, 3),
    ]);
    expect(costes[0].costeUnitario).toBe(3);
    expect(costes[0].estimado).toBe(false);
    expect(huboDescubierto).toBe(false);
  });
});

describe('los ajustes de almacén', () => {
  it('una merma quita género sin cambiar lo que costó el resto', () => {
    const { pmpFinal, existenciasFinales } = reproducirCostes([
      compra('2026-01-01', 100, 5),
      { fecha: '2026-01-15', tipo: 'ajuste', cantidad: -10, referencia: 'rotura' },
    ]);
    expect(pmpFinal).toBe(5);
    expect(existenciasFinales).toBe(90);
  });

  it('una entrada de inventario con precio sí entra en el medio', () => {
    const { pmpFinal } = reproducirCostes([
      compra('2026-01-01', 10, 2),
      { fecha: '2026-01-15', tipo: 'ajuste', cantidad: 10, precio: 4, referencia: 'inventario' },
    ]);
    expect(pmpFinal).toBe(3);
  });
});

describe('los casos que rompen las fórmulas', () => {
  it('sin ningún movimiento no revienta', () => {
    expect(reproducirCostes([])).toMatchObject({ pmpFinal: 0, existenciasFinales: 0, costes: [] });
  });

  it('con las existencias en negativo, lo que entra fija el medio', () => {
    // Mezclar una compra con un saldo negativo da un medio disparatado, y de
    // ahí salen los costes negativos que no hay quien explique.
    const { pmpFinal } = reproducirCostes([
      compra('2026-01-01', 10, 2), venta('2026-01-02', 50, 'v'), compra('2026-01-03', 10, 6),
    ]);
    expect(pmpFinal).toBe(6);
    expect(pmpFinal).toBeGreaterThan(0);
  });

  it('un movimiento de cero unidades no cuenta', () => {
    const { costes } = reproducirCostes([compra('2026-01-01', 10, 5), venta('2026-01-02', 0, 'v')]);
    expect(costes).toHaveLength(0);
  });

  it('el coste total es la cantidad por el unitario', () => {
    const { costes } = reproducirCostes([compra('2026-01-01', 100, 2.5), venta('2026-01-02', 7, 'v')]);
    expect(costes[0].costeTotal).toBe(17.5);
  });
});

describe('qué documentos mueven existencias', () => {
  const doc = (extra: Partial<DocumentoParaCostes>): DocumentoParaCostes => ({
    id: 'd1', number: 'X-1', issueDate: '2026-01-10', status: 'expedido',
    lineItems: [{ id: 'l1', productId: 'p1', quantity: 10, unitPrice: 3 }],
    ...extra,
  });

  it('un presupuesto y un pedido no mueven nada', () => {
    // Son intenciones: hasta que no sale el género no hay nada que costear.
    expect(moviemientosDeDocumento(doc({ tipo: 'presupuesto' }), 'p1')).toEqual([]);
    expect(moviemientosDeDocumento(doc({ tipo: 'pedido' }), 'p1')).toEqual([]);
  });

  it('un albarán sin expedir tampoco', () => {
    expect(moviemientosDeDocumento(doc({ tipo: 'albaran', status: 'borrador' }), 'p1')).toEqual([]);
  });

  it('un albarán expedido sí', () => {
    expect(moviemientosDeDocumento(doc({ tipo: 'albaran' }), 'p1')).toHaveLength(1);
  });

  it('una factura anulada no cuenta', () => {
    expect(moviemientosDeDocumento(doc({ tipo: 'factura', status: 'anulada' }), 'p1')).toEqual([]);
  });

  it('la compra lleva su precio con los tres descuentos aplicados', () => {
    // Si no, el medio sale calculado sobre la tarifa y no sobre lo pagado.
    const compra = doc({
      sentido: 'compra', tipo: 'albaran',
      lineItems: [{ id: 'l1', productId: 'p1', quantity: 10, unitPrice: 10, discountPercent: 10, discountPercent2: 10 }],
    });
    expect(moviemientosDeDocumento(compra, 'p1')[0].precio).toBeCloseTo(8.1, 4);
  });

  it('la venta no lleva precio: es lo que se calcula', () => {
    expect(moviemientosDeDocumento(doc({ tipo: 'albaran' }), 'p1')[0].precio).toBeUndefined();
  });

  it('sólo salen las líneas del producto que se pregunta', () => {
    const mixto = doc({
      tipo: 'albaran',
      lineItems: [
        { id: 'l1', productId: 'p1', quantity: 10, unitPrice: 3 },
        { id: 'l2', productId: 'p2', quantity: 5, unitPrice: 9 },
      ],
    });
    expect(moviemientosDeDocumento(mixto, 'p1')).toHaveLength(1);
  });

  it('la factura que nace de un albarán no cuenta dos veces la salida', () => {
    // El albarán ya sacó el género; contar también su factura duplicaría la
    // salida y dejaría las existencias a la mitad de lo que hay.
    const albaran = doc({ id: 'a1', number: 'ALB-1', tipo: 'albaran' });
    const factura = doc({ id: 'f1', number: 'FAC-1', tipo: 'factura', status: 'emitida' });
    const movs = movimientosDeProducto('p1', [albaran, factura], [], d => d.id === 'f1');
    expect(movs).toHaveLength(1);
    expect(movs[0].referencia).toContain('ALB-1');
  });

  it('una regularización entra como ajuste sin precio', () => {
    const movs = movimientosDeProducto('p1', [], [
      { id: 'r1', fecha: '2026-02-01', productId: 'p1', diferencia: -3 },
    ], () => false);
    expect(movs[0]).toMatchObject({ tipo: 'ajuste', cantidad: -3 });
    // Sin precio: una merma o un recuento no cambian lo que costó el resto.
    expect(movs[0].precio).toBeUndefined();
  });
});
