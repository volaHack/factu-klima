/**
 * LAS CUENTAS DE LAS OFERTAS
 *
 * Esto es dinero: un 3x2 mal contado es cobrarle de más a un cliente o de
 * menos a la caja, y ninguna de las dos cosas se ve mirando la pantalla.
 * Cada caso de aquí es una promoción de las que se ponen de verdad en un
 * cartel, con la cuenta hecha a mano al lado.
 */

import { describe, expect, it } from 'vitest';
import {
  aplicarOfertas, describirOferta, efectoSobreLinea, motivoNoVigente, ofertaVigente,
  type LineaOfertable,
} from './ofertas';
import type { Oferta } from './types';

const BASE: Oferta = {
  id: 'o1',
  nombre: 'Oferta',
  tipo: 'porcentaje',
  alcance: 'todo',
  alcanceIds: [],
  activa: true,
  acumulable: false,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

const oferta = (extra: Partial<Oferta>): Oferta => ({ ...BASE, ...extra });

const linea = (extra: Partial<LineaOfertable> = {}): LineaOfertable => ({
  id: 'l1',
  productId: 'p1',
  nombre: 'Caja de cerveza',
  cantidad: 1,
  precioUnitario: 10,
  ...extra,
});

// ============================================================
// LAS PROMOCIONES DEL ENCARGO
// ============================================================

describe('«10 cajas de cerveza y 1 gratis»', () => {
  // Once te llevas, diez pagas.
  const promo = oferta({ tipo: 'nxm', paramN: 11, paramM: 10, nombre: '10+1' });

  it('con 11 cajas se paga por 10', () => {
    const r = aplicarOfertas([linea({ cantidad: 11 })], [promo]);
    expect(r.lineas[0].importeSinOfertas).toBe(110);
    expect(r.lineas[0].importe).toBe(100);
    expect(r.ahorroTotal).toBe(10);
  });

  it('con 10 cajas todavía no entra: el cartel dice once', () => {
    const r = aplicarOfertas([linea({ cantidad: 10 })], [promo]);
    expect(r.ahorroTotal).toBe(0);
    expect(r.lineas[0].importe).toBe(100);
  });

  it('con 22 cajas se regalan dos, no una', () => {
    const r = aplicarOfertas([linea({ cantidad: 22 })], [promo]);
    expect(r.ahorroTotal).toBe(20);
  });

  it('con 25 se regalan dos y las tres sueltas se pagan enteras', () => {
    // Dos grupos de once (22) + 3 sueltas. Nada de medios grupos.
    const r = aplicarOfertas([linea({ cantidad: 25 })], [promo]);
    expect(r.ahorroTotal).toBe(20);
    expect(r.lineas[0].importe).toBe(230);
  });

  it('lo explica con las palabras del cartel', () => {
    expect(describirOferta(promo)).toBe('Compra 10 y llévate 11 (1 gratis)');
  });
});

describe('«paquete de pañuelos, el 50 % de la segunda»', () => {
  const promo = oferta({ tipo: 'unidad_siguiente', paramPorcentaje: 50, nombre: '2ª al 50 %' });

  it('con dos, la segunda a mitad de precio', () => {
    const r = aplicarOfertas([linea({ cantidad: 2, precioUnitario: 3 })], [promo]);
    expect(r.lineas[0].importe).toBe(4.5);
    expect(r.ahorroTotal).toBe(1.5);
  });

  it('con una sola no hay segunda que rebajar', () => {
    const r = aplicarOfertas([linea({ cantidad: 1, precioUnitario: 3 })], [promo]);
    expect(r.ahorroTotal).toBe(0);
  });

  it('con tres se rebaja una: la tercera es una unidad suelta', () => {
    const r = aplicarOfertas([linea({ cantidad: 3, precioUnitario: 3 })], [promo]);
    expect(r.ahorroTotal).toBe(1.5);
  });

  it('con cuatro se rebajan dos', () => {
    const r = aplicarOfertas([linea({ cantidad: 4, precioUnitario: 3 })], [promo]);
    expect(r.ahorroTotal).toBe(3);
  });
});

describe('el 3x2 de toda la vida', () => {
  const promo = oferta({ tipo: 'nxm', paramN: 3, paramM: 2 });

  it('tres por el precio de dos', () => {
    const r = aplicarOfertas([linea({ cantidad: 3 })], [promo]);
    expect(r.lineas[0].importe).toBe(20);
  });

  it('con siete entran dos grupos y la séptima se paga', () => {
    const r = aplicarOfertas([linea({ cantidad: 7 })], [promo]);
    expect(r.ahorroTotal).toBe(20);
    expect(r.lineas[0].importe).toBe(50);
  });
});

// ============================================================
// EL RESTO DE FORMAS
// ============================================================

describe('las demás clases de oferta', () => {
  it('porcentaje sobre la línea entera', () => {
    const r = aplicarOfertas([linea({ cantidad: 4 })], [oferta({ tipo: 'porcentaje', paramPorcentaje: 25 })]);
    expect(r.lineas[0].importe).toBe(30);
  });

  it('euros menos por unidad', () => {
    const r = aplicarOfertas([linea({ cantidad: 3 })], [oferta({ tipo: 'importe', paramImporte: 2 })]);
    expect(r.lineas[0].importe).toBe(24);
  });

  it('el descuento en euros nunca deja la línea por debajo de cero', () => {
    const r = aplicarOfertas([linea({ cantidad: 2, precioUnitario: 1 })], [oferta({ tipo: 'importe', paramImporte: 5 })]);
    expect(r.lineas[0].importe).toBe(0);
    expect(r.ahorroTotal).toBe(2);
  });

  it('precio de promoción cerrado', () => {
    const r = aplicarOfertas([linea({ cantidad: 5 })], [oferta({ tipo: 'precio_fijo', paramImporte: 7.5 })]);
    expect(r.lineas[0].importe).toBe(37.5);
  });

  it('un precio de promoción MÁS CARO que el actual no se aplica', () => {
    // Pasa al bajar el precio de tarifa y olvidarse de la promoción vieja.
    const r = aplicarOfertas([linea({ cantidad: 2 })], [oferta({ tipo: 'precio_fijo', paramImporte: 12 })]);
    expect(r.ahorroTotal).toBe(0);
  });

  it('descuento por tramos: se coge el más alto que se alcanza, no la suma', () => {
    const promo = oferta({
      tipo: 'escalado',
      tramos: [
        { desdeCantidad: 10, porcentaje: 5 },
        { desdeCantidad: 25, porcentaje: 10 },
        { desdeCantidad: 50, porcentaje: 20 },
      ],
    });
    expect(aplicarOfertas([linea({ cantidad: 12 })], [promo]).ahorroTotal).toBe(6);   // 120 · 5 %
    expect(aplicarOfertas([linea({ cantidad: 30 })], [promo]).ahorroTotal).toBe(30);  // 300 · 10 %
    expect(aplicarOfertas([linea({ cantidad: 50 })], [promo]).ahorroTotal).toBe(100); // 500 · 20 %
    expect(aplicarOfertas([linea({ cantidad: 9 })], [promo]).ahorroTotal).toBe(0);
  });

  it('regalo: no baja el precio, propone otro artículo', () => {
    const promo = oferta({
      tipo: 'regalo', paramN: 6,
      regaloProductId: 'p9', regaloNombre: 'Vaso de cristal', regaloCantidad: 1,
    });
    const r = aplicarOfertas([linea({ cantidad: 12 })], [promo]);
    expect(r.ahorroTotal).toBe(0);
    expect(r.regalos).toEqual([
      { ofertaId: 'o1', productId: 'p9', nombre: 'Vaso de cristal', cantidad: 2 },
    ]);
  });
});

// ============================================================
// A QUIÉN ALCANZA
// ============================================================

describe('el alcance', () => {
  const dos = [
    linea({ id: 'l1', productId: 'p1', categoria: 'bebidas', cantidad: 2 }),
    linea({ id: 'l2', productId: 'p2', categoria: 'limpieza', cantidad: 2 }),
  ];

  it('por producto, sólo a ese producto', () => {
    const r = aplicarOfertas(dos, [oferta({ tipo: 'porcentaje', paramPorcentaje: 50, alcance: 'producto', alcanceIds: ['p1'] })]);
    expect(r.lineas[0].importe).toBe(10);
    expect(r.lineas[1].importe).toBe(20);
  });

  it('por categoría, a toda la familia', () => {
    const r = aplicarOfertas(dos, [oferta({ tipo: 'porcentaje', paramPorcentaje: 50, alcance: 'categoria', alcanceIds: ['bebidas'] })]);
    expect(r.lineas[0].importe).toBe(10);
    expect(r.lineas[1].importe).toBe(20);
  });

  it('a todo, a las dos', () => {
    const r = aplicarOfertas(dos, [oferta({ tipo: 'porcentaje', paramPorcentaje: 10, alcance: 'todo' })]);
    expect(r.ahorroTotal).toBe(4);
  });

  it('sólo a un grupo de clientes', () => {
    const promo = oferta({ tipo: 'porcentaje', paramPorcentaje: 10, soloGrupoClienteId: 'g1' });
    expect(aplicarOfertas(dos, [promo], { grupoClienteId: 'g1' }).ahorroTotal).toBe(4);
    expect(aplicarOfertas(dos, [promo], { grupoClienteId: 'g2' }).ahorroTotal).toBe(0);
    expect(aplicarOfertas(dos, [promo], {}).ahorroTotal).toBe(0);
  });

  it('con compra mínima del ticket', () => {
    const promo = oferta({ tipo: 'porcentaje', paramPorcentaje: 10, minimoImporte: 50 });
    expect(aplicarOfertas(dos, [promo]).ahorroTotal).toBe(0); // el ticket son 40
    const grande = [linea({ cantidad: 10 })];
    expect(aplicarOfertas(grande, [promo]).ahorroTotal).toBe(10);
  });

  it('con unidades mínimas en la línea', () => {
    const promo = oferta({ tipo: 'porcentaje', paramPorcentaje: 10, minimoUnidades: 5 });
    expect(aplicarOfertas([linea({ cantidad: 4 })], [promo]).ahorroTotal).toBe(0);
    expect(aplicarOfertas([linea({ cantidad: 5 })], [promo]).ahorroTotal).toBe(5);
  });
});

// ============================================================
// CUANDO CHOCAN
// ============================================================

describe('dos ofertas sobre la misma línea', () => {
  it('gana la que MÁS LE AHORRA AL CLIENTE, no la de más prioridad', () => {
    // Un cliente que descubre que había una oferta mejor no vuelve.
    const floja = oferta({ id: 'a', nombre: 'Floja', tipo: 'porcentaje', paramPorcentaje: 10, prioridad: 99 });
    const buena = oferta({ id: 'b', nombre: 'Buena', tipo: 'porcentaje', paramPorcentaje: 30, prioridad: 1 });
    const r = aplicarOfertas([linea({ cantidad: 10 })], [floja, buena]);
    expect(r.ahorroTotal).toBe(30);
    expect(r.aplicadas.map(a => a.nombre)).toEqual(['Buena']);
  });

  it('la prioridad sólo desempata cuando ahorran lo mismo', () => {
    const a = oferta({ id: 'a', nombre: 'A', tipo: 'porcentaje', paramPorcentaje: 10, prioridad: 1 });
    const b = oferta({ id: 'b', nombre: 'B', tipo: 'porcentaje', paramPorcentaje: 10, prioridad: 5 });
    const r = aplicarOfertas([linea({ cantidad: 10 })], [a, b]);
    expect(r.aplicadas.map(x => x.nombre)).toEqual(['B']);
  });

  it('las acumulables se suman encima de la mejor exclusiva', () => {
    const exclusiva = oferta({ id: 'a', nombre: 'Exclusiva', tipo: 'porcentaje', paramPorcentaje: 20 });
    const suma = oferta({ id: 'b', nombre: 'Cupón', tipo: 'porcentaje', paramPorcentaje: 10, acumulable: true });
    const r = aplicarOfertas([linea({ cantidad: 10 })], [exclusiva, suma]);
    // 20 € + 10 €: las dos se miden sobre el importe original, no en cadena.
    expect(r.ahorroTotal).toBe(30);
    expect(r.aplicadas).toHaveLength(2);
  });

  it('por muchas que se acumulen, la línea nunca baja de cero', () => {
    const a = oferta({ id: 'a', tipo: 'porcentaje', paramPorcentaje: 80, acumulable: true });
    const b = oferta({ id: 'b', tipo: 'porcentaje', paramPorcentaje: 80, acumulable: true });
    const r = aplicarOfertas([linea({ cantidad: 1 })], [a, b]);
    expect(r.lineas[0].importe).toBe(0);
    expect(r.ahorroTotal).toBe(10);
  });
});

describe('con descuento puesto a mano por el comercial', () => {
  it('la oferta se calcula sobre lo que queda, y no se pierde', () => {
    const r = aplicarOfertas(
      [linea({ cantidad: 4, precioUnitario: 10, descuentoManual: 10 })],
      [oferta({ tipo: 'porcentaje', paramPorcentaje: 50 })],
    );
    expect(r.lineas[0].importeSinOfertas).toBe(36); // 40 − 10 %
    expect(r.lineas[0].importe).toBe(18);
  });

  it('un 3x2 con precio negociado regala la unidad al precio negociado', () => {
    const r = aplicarOfertas(
      [linea({ cantidad: 3, precioUnitario: 10, descuentoManual: 20 })],
      [oferta({ tipo: 'nxm', paramN: 3, paramM: 2 })],
    );
    expect(r.lineas[0].importeSinOfertas).toBe(24);
    expect(r.ahorroTotal).toBe(8);
  });
});

// ============================================================
// CUÁNDO VIVE
// ============================================================

describe('la vigencia', () => {
  const martes10h = new Date('2026-09-08T10:00:00');   // 2026-09-08 es martes
  const jueves10h = new Date('2026-09-10T10:00:00');

  it('desactivada no entra nunca', () => {
    expect(ofertaVigente(oferta({ activa: false }), martes10h)).toBe(false);
  });

  it('respeta el intervalo de fechas', () => {
    expect(ofertaVigente(oferta({ desde: '2026-09-09' }), martes10h)).toBe(false);
    expect(ofertaVigente(oferta({ hasta: '2026-09-07' }), martes10h)).toBe(false);
    expect(ofertaVigente(oferta({ desde: '2026-09-01', hasta: '2026-09-30' }), martes10h)).toBe(true);
  });

  it('respeta los días de la semana', () => {
    const soloMartes = oferta({ diasSemana: [2] });
    expect(ofertaVigente(soloMartes, martes10h)).toBe(true);
    expect(ofertaVigente(soloMartes, jueves10h)).toBe(false);
  });

  it('respeta la franja horaria', () => {
    const manana = oferta({ horaInicio: '09:00', horaFin: '12:00' });
    expect(ofertaVigente(manana, martes10h)).toBe(true);
    expect(ofertaVigente(manana, new Date('2026-09-08T13:00:00'))).toBe(false);
  });

  it('una franja que cruza la medianoche es una franja, no un error', () => {
    // La hora del bar: de diez de la noche a dos de la madrugada.
    const noche = oferta({ horaInicio: '22:00', horaFin: '02:00' });
    expect(ofertaVigente(noche, new Date('2026-09-08T23:30:00'))).toBe(true);
    expect(ofertaVigente(noche, new Date('2026-09-08T01:00:00'))).toBe(true);
    expect(ofertaVigente(noche, new Date('2026-09-08T15:00:00'))).toBe(false);
  });

  it('deja de entrar cuando se agotan los usos', () => {
    expect(ofertaVigente(oferta({ usosMaximos: 100, usos: 100 }), martes10h)).toBe(false);
    expect(ofertaVigente(oferta({ usosMaximos: 100, usos: 99 }), martes10h)).toBe(true);
  });

  it('y explica por qué no entra, para que no haya que adivinarlo', () => {
    expect(motivoNoVigente(oferta({ activa: false }), martes10h)).toBe('Está desactivada');
    expect(motivoNoVigente(oferta({ hasta: '2026-09-07' }), martes10h)).toContain('Terminó');
    expect(motivoNoVigente(oferta({ diasSemana: [4] }), martes10h)).toContain('días');
    expect(motivoNoVigente(oferta({}), martes10h)).toBe('');
  });
});

// ============================================================
// LOS BORDES
// ============================================================

describe('los casos raros', () => {
  it('un ticket vacío no rompe nada', () => {
    const r = aplicarOfertas([], [oferta({ tipo: 'porcentaje', paramPorcentaje: 50 })]);
    expect(r).toEqual({ lineas: [], aplicadas: [], regalos: [], ahorroTotal: 0 });
  });

  it('sin ofertas, las líneas salen tal cual', () => {
    const r = aplicarOfertas([linea({ cantidad: 3 })], []);
    expect(r.lineas[0].importe).toBe(30);
    expect(r.lineas[0].descuentoOferta).toBe(0);
  });

  it('cantidad cero no descuenta nada', () => {
    const r = aplicarOfertas([linea({ cantidad: 0 })], [oferta({ tipo: 'porcentaje', paramPorcentaje: 50 })]);
    expect(r.ahorroTotal).toBe(0);
  });

  it('un N x M mal configurado se ignora en vez de regalar el género', () => {
    expect(efectoSobreLinea(oferta({ tipo: 'nxm', paramN: 2, paramM: 3 }), linea({ cantidad: 10 })).ahorro).toBe(0);
    expect(efectoSobreLinea(oferta({ tipo: 'nxm', paramN: 0, paramM: 0 }), linea({ cantidad: 10 })).ahorro).toBe(0);
    expect(efectoSobreLinea(oferta({ tipo: 'nxm', paramN: 3, paramM: 3 }), linea({ cantidad: 10 })).ahorro).toBe(0);
  });

  it('los céntimos cuadran: se redondea una vez, al final', () => {
    // 3 × 0,333 € = 0,999 €; un 3x2 regala una: quedan 0,666 → 0,67 €.
    const r = aplicarOfertas(
      [linea({ cantidad: 3, precioUnitario: 0.333 })],
      [oferta({ tipo: 'nxm', paramN: 3, paramM: 2 })],
    );
    expect(r.lineas[0].importe).toBe(0.67);
    expect(r.lineas[0].ahorro).toBe(0.33);
    expect(r.lineas[0].importe + r.lineas[0].ahorro).toBeCloseTo(r.lineas[0].importeSinOfertas, 2);
  });

  it('cada euro descontado dice de qué oferta viene', () => {
    const r = aplicarOfertas([linea({ cantidad: 3 })], [oferta({ tipo: 'nxm', paramN: 3, paramM: 2, nombre: '3x2 de bebidas' })]);
    expect(r.aplicadas).toHaveLength(1);
    expect(r.aplicadas[0]).toMatchObject({
      nombre: '3x2 de bebidas',
      lineaId: 'l1',
      ahorro: 10,
      detalle: '3x2 · 1 unidad gratis',
    });
  });
});
