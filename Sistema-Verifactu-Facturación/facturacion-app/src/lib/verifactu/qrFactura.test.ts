/**
 * LA GEOMETRÍA DEL QR TRIBUTARIO
 *
 * Todo lo que se comprueba aquí sale de dos sitios y de ninguno más: el
 * artículo 21.1 de la Orden HAC/1177/2024 y el apartado 3 del documento de la
 * AEAT «Detalle de las especificaciones técnicas del código "QR" de la
 * factura…» (v0.5.0). Cada caso lleva escrito de dónde viene.
 */

import { describe, expect, it } from 'vitest';
import {
  acotarTamanoQr, componerBloqueQr, invadenLaReserva, posicionPorDefecto, validarBloqueQr,
  LEYENDA_CORTA, LEYENDA_LARGA, MARGEN_MM, QR_DEFAULT_MM, QR_MAX_MM, QR_MIN_MM,
  RESERVA_MINIMA_MM, ROTULO_QR,
} from './qrFactura';

const A4 = { ancho: 210, alto: 297 };
const A4_APAISADO = { ancho: 297, alto: 210 };
const TICKET = { ancho: 80, alto: 200 };

describe('acotarTamanoQr', () => {
  it('deja pasar lo que está dentro del intervalo legal', () => {
    expect(acotarTamanoQr(30)).toBe(30);
    expect(acotarTamanoQr(35)).toBe(35);
    expect(acotarTamanoQr(40)).toBe(40);
  });

  it('sube al mínimo lo que se queda corto: 24 mm era el tamaño ilegal de antes', () => {
    expect(acotarTamanoQr(24)).toBe(QR_MIN_MM);
    expect(acotarTamanoQr(1)).toBe(QR_MIN_MM);
  });

  it('baja al máximo lo que se pasa', () => {
    expect(acotarTamanoQr(60)).toBe(QR_MAX_MM);
  });

  it('sin tamaño, o con uno absurdo, se queda en los 35 mm por defecto', () => {
    expect(acotarTamanoQr(undefined)).toBe(QR_DEFAULT_MM);
    expect(acotarTamanoQr(NaN)).toBe(QR_DEFAULT_MM);
    expect(acotarTamanoQr(-5)).toBe(QR_DEFAULT_MM);
    expect(acotarTamanoQr(0)).toBe(QR_DEFAULT_MM);
  });
});

describe('posicionPorDefecto', () => {
  it('vertical: centrado arriba', () => {
    expect(posicionPorDefecto(A4)).toBe('superior-centro');
    expect(posicionPorDefecto(TICKET)).toBe('superior-centro');
  });

  it('apaisado: arriba a la izquierda', () => {
    expect(posicionPorDefecto(A4_APAISADO)).toBe('superior-izquierda');
  });
});

describe('componerBloqueQr sobre A4 vertical', () => {
  const bloque = componerBloqueQr({ hoja: A4 });

  it('mide 35 mm de lado', () => {
    expect(bloque.lado).toBe(35);
    expect(bloque.qr.ancho).toBe(35);
    expect(bloque.qr.alto).toBe(35);
  });

  it('va centrado respecto a los márgenes izquierdo y derecho', () => {
    const centroQr = bloque.qr.x + bloque.qr.ancho / 2;
    expect(centroQr).toBeCloseTo(A4.ancho / 2, 5);
  });

  it('va arriba del todo, no en el pie: el bloque empieza en el margen superior', () => {
    expect(bloque.rotulo.y).toBeCloseTo(MARGEN_MM, 5);
    // Y el código, entero, en el tercio de arriba de la hoja.
    expect(bloque.qr.y + bloque.qr.alto).toBeLessThan(A4.alto / 3);
  });

  it('lleva el rótulo «QR tributario:» ENCIMA del código', () => {
    expect(bloque.rotulo.texto).toBe(ROTULO_QR);
    expect(bloque.rotulo.y + bloque.rotulo.alto).toBeLessThanOrEqual(bloque.qr.y);
  });

  it('lleva la leyenda del art. 20.1.b JUSTO DEBAJO del código', () => {
    expect(bloque.leyenda?.texto).toBe(LEYENDA_LARGA);
    expect(bloque.leyenda!.y).toBeGreaterThanOrEqual(bloque.qr.y + bloque.qr.alto);
    // «justo debajo»: pegada, no en la otra punta de la hoja.
    expect(bloque.leyenda!.y - (bloque.qr.y + bloque.qr.alto)).toBeLessThan(5);
  });

  it('los dos textos van centrados respecto al código', () => {
    const centroQr = bloque.qr.x + bloque.qr.ancho / 2;
    expect(bloque.rotulo.x + bloque.rotulo.ancho / 2).toBeCloseTo(centroQr, 5);
    expect(bloque.leyenda!.x + bloque.leyenda!.ancho / 2).toBeCloseTo(centroQr, 5);
  });

  it('los textos no se solapan con el código', () => {
    expect(bloque.rotulo.y + bloque.rotulo.alto).toBeLessThanOrEqual(bloque.qr.y);
    expect(bloque.leyenda!.y).toBeGreaterThanOrEqual(bloque.qr.y + bloque.qr.alto);
  });

  it('reserva espacio vacío por los cuatro lados del código', () => {
    const { reserva, qr } = bloque;
    expect(qr.x - reserva.x).toBeGreaterThanOrEqual(RESERVA_MINIMA_MM);
    expect(reserva.x + reserva.ancho - (qr.x + qr.ancho)).toBeGreaterThanOrEqual(RESERVA_MINIMA_MM);
    expect(qr.y - reserva.y).toBeGreaterThanOrEqual(RESERVA_MINIMA_MM);
    expect(reserva.y + reserva.alto - (qr.y + qr.alto)).toBeGreaterThanOrEqual(RESERVA_MINIMA_MM);
  });

  it('no se sale de la página', () => {
    expect(validarBloqueQr(bloque, A4)).toEqual([]);
  });
});

describe('componerBloqueQr sobre A4 apaisado', () => {
  const bloque = componerBloqueQr({ hoja: A4_APAISADO });

  it('se sitúa a la izquierda, cerca del margen superior-izquierdo', () => {
    expect(bloque.qr.x).toBeLessThan(A4_APAISADO.ancho / 4);
    expect(bloque.rotulo.y).toBeCloseTo(MARGEN_MM, 5);
  });

  it('sigue midiendo 35 mm y cabiendo entero', () => {
    expect(bloque.lado).toBe(35);
    expect(validarBloqueQr(bloque, A4_APAISADO)).toEqual([]);
  });
});

describe('componerBloqueQr sobre un ticket estrecho', () => {
  const bloque = componerBloqueQr({ hoja: TICKET });

  it('cabe en 80 mm de ancho sin salirse ni encoger por debajo del mínimo', () => {
    expect(bloque.lado).toBeGreaterThanOrEqual(QR_MIN_MM);
    expect(validarBloqueQr(bloque, TICKET)).toEqual([]);
  });

  it('la frase larga se parte en varias líneas en vez de estirar el bloque', () => {
    // «Si no cabe toda la frase en una sola línea, podrán utilizarse varias
    // líneas hasta completarla» (apartado 3).
    expect(bloque.leyenda!.ancho).toBeLessThanOrEqual(TICKET.ancho - MARGEN_MM * 2 + 0.01);
    expect(bloque.leyenda!.alto).toBeGreaterThan(bloque.rotulo.alto);
  });
});

describe('la frase corta', () => {
  it('se puede usar «VERI*FACTU» en vez de la larga: el art. 20.1.b admite las dos', () => {
    const bloque = componerBloqueQr({ hoja: A4, leyenda: 'corta' });
    expect(bloque.leyenda?.texto).toBe(LEYENDA_CORTA);
  });
});

describe('lo que decide la plantilla y lo que no', () => {
  it('respeta la esquina que pide la plantilla', () => {
    const bloque = componerBloqueQr({ hoja: A4, ancla: { x: 140, y: 60 } });
    expect(bloque.qr.x).toBeCloseTo(140, 5);
    expect(bloque.qr.y).toBeCloseTo(60, 5);
  });

  it('pero no la deja sacar el código fuera del papel', () => {
    const bloque = componerBloqueQr({ hoja: A4, ancla: { x: 400, y: 400 } });
    expect(validarBloqueQr(bloque, A4)).toEqual([]);
    expect(bloque.qr.x + bloque.qr.ancho).toBeLessThanOrEqual(A4.ancho - MARGEN_MM + 0.01);
  });

  it('ni pegarlo al borde, donde perdería el espacio vacío obligatorio', () => {
    const bloque = componerBloqueQr({ hoja: A4, ancla: { x: -50, y: -50 } });
    expect(bloque.qr.x).toBeGreaterThanOrEqual(RESERVA_MINIMA_MM);
    expect(bloque.rotulo.y).toBeGreaterThanOrEqual(0);
    expect(validarBloqueQr(bloque, A4)).toEqual([]);
  });

  it('ni pedir un tamaño ilegal: 20 mm se convierte en 30', () => {
    const bloque = componerBloqueQr({ hoja: A4, tamanoMm: 20 });
    expect(bloque.lado).toBe(QR_MIN_MM);
  });

  it('ni pedir uno enorme: 80 mm se convierte en 40', () => {
    const bloque = componerBloqueQr({ hoja: A4, tamanoMm: 80 });
    expect(bloque.lado).toBe(QR_MAX_MM);
  });
});

describe('validarBloqueQr', () => {
  it('canta un código por debajo del mínimo legal', () => {
    const bloque = { ...componerBloqueQr({ hoja: A4 }), lado: 24 };
    expect(validarBloqueQr(bloque, A4).join(' ')).toContain('mínimo legal');
  });

  it('canta un código por encima del máximo legal', () => {
    const bloque = { ...componerBloqueQr({ hoja: A4 }), lado: 45 };
    expect(validarBloqueQr(bloque, A4).join(' ')).toContain('máximo legal');
  });

  it('canta un código que se saldría de la hoja y saldría cortado', () => {
    const base = componerBloqueQr({ hoja: A4 });
    const bloque = { ...base, qr: { ...base.qr, x: 195 } };
    expect(validarBloqueQr(bloque, A4).join(' ')).toContain('cortado');
  });
});

describe('invadenLaReserva', () => {
  const bloque = componerBloqueQr({ hoja: A4 });

  it('detecta lo que se mete dentro del espacio del código', () => {
    const intruso = { x: bloque.qr.x + 5, y: bloque.qr.y + 5, ancho: 10, alto: 10 };
    expect(invadenLaReserva(bloque, [intruso])).toHaveLength(1);
  });

  it('deja en paz lo que está fuera', () => {
    const lejos = { x: 15, y: 200, ancho: 40, alto: 10 };
    expect(invadenLaReserva(bloque, [lejos])).toHaveLength(0);
  });
});
