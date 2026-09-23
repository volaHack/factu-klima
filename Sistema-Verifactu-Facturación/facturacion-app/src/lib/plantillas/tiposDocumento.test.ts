import { describe, it, expect } from 'vitest';

import {
  algunoLlevaQr,
  PERSONALIDADES,
  personalidadDe,
  reconocerTipo,
  TIPOS_PLANTILLA,
  tipoDominante,
  type TextoDelDocumento,
} from './tiposDocumento';

/** Un titular: letra grande, arriba del todo. */
function titular(texto: string): TextoDelDocumento {
  return { texto, tamano: 22, y: 25 };
}

/** Letra pequeña del pie, donde van las condiciones. */
function letraPequena(texto: string): TextoDelDocumento {
  return { texto, tamano: 7, y: 270 };
}

describe('reconocer qué documento han subido', () => {
  it('lee el titular de cada tipo', () => {
    const casos: [string, string][] = [
      ['FACTURA', 'factura'],
      ['ALBARÁN', 'albaran'],
      ['PRESUPUESTO', 'presupuesto'],
      ['PEDIDO', 'pedido'],
      ['FACTURA RECTIFICATIVA', 'rectificativa'],
    ];
    for (const [texto, esperado] of casos) {
      expect(reconocerTipo([titular(texto)])?.tipo, `«${texto}»`).toBe(esperado);
    }
  });

  it('da igual cómo esté escrito', () => {
    // Acentos, minúsculas y puntuación: en los impresos sale de todo.
    for (const texto of ['Albarán', 'ALBARAN', 'albaran de entrega', 'A L B A R Á N'.replace(/ /g, '')]) {
      expect(reconocerTipo([titular(texto)])?.tipo, `«${texto}»`).toBe('albaran');
    }
  });

  it('entiende los nombres que la gente usa de verdad', () => {
    expect(reconocerTipo([titular('NOTA DE ENTREGA')])?.tipo).toBe('albaran');
    expect(reconocerTipo([titular('FACTURA PROFORMA')])?.tipo).toBe('presupuesto');
    expect(reconocerTipo([titular('NOTA DE PEDIDO')])?.tipo).toBe('pedido');
    expect(reconocerTipo([titular('TICKET')])?.tipo).toBe('factura');
  });

  it('el titular manda sobre la letra pequeña', () => {
    // Éste es el caso que lo rompía todo: casi cualquier albarán lleva
    // «pendiente de factura» en las condiciones del pie. Sin pesar dónde
    // aparece la palabra, todos se habrían tomado por facturas.
    const albaran = [
      titular('ALBARÁN DE ENTREGA'),
      letraPequena('Pendiente de factura. Se facturará a fin de mes.'),
    ];
    expect(reconocerTipo(albaran)?.tipo).toBe('albaran');
  });

  it('entre dos palabras que encajan, gana la que describe mejor', () => {
    // «factura rectificativa» contiene «factura»: si ganara la corta, una
    // rectificativa se guardaría como factura normal.
    const r = reconocerTipo([titular('FACTURA RECTIFICATIVA')]);
    expect(r?.tipo).toBe('rectificativa');
    expect(r?.palabra).toBe('factura rectificativa');
  });

  it('un titular grande da más confianza que una mención suelta', () => {
    const claro = reconocerTipo([titular('FACTURA')])!;
    const dudoso = reconocerTipo([letraPequena('adjuntamos la factura')])!;
    expect(claro.confianza).toBeGreaterThan(dudoso.confianza);
    expect(claro.confianza).toBeGreaterThan(0.6);
  });

  it('si no reconoce nada, lo dice en vez de inventárselo', () => {
    // Que el usuario elija a mano es mejor que acertar de casualidad.
    expect(reconocerTipo([titular('HOJA DE RUTA'), letraPequena('Ruta 4')])).toBeNull();
    expect(reconocerTipo([])).toBeNull();
    expect(reconocerTipo([titular('   ')])).toBeNull();
  });

  it('no se cae si el PDF viene sin tamaños ni posiciones', () => {
    const sinDatos = [{ texto: 'FACTURA', tamano: 0, y: 0 }];
    expect(reconocerTipo(sinDatos)?.tipo).toBe('factura');
  });
});

describe('el QR va donde tiene que ir y en ningún otro sitio', () => {
  it('sólo lo llevan la factura y la rectificativa', () => {
    // Ponerlo en un presupuesto o un albarán sería decirle al cliente que
    // ese papel está declarado a Hacienda cuando no lo está.
    expect(personalidadDe('factura').llevaQr).toBe(true);
    expect(personalidadDe('rectificativa').llevaQr).toBe(true);
    expect(personalidadDe('albaran').llevaQr).toBe(false);
    expect(personalidadDe('presupuesto').llevaQr).toBe(false);
    expect(personalidadDe('pedido').llevaQr).toBe(false);
  });

  it('una plantilla sin ningún tipo fiscal no lleva QR', () => {
    expect(algunoLlevaQr(['albaran'])).toBe(false);
    expect(algunoLlevaQr(['presupuesto', 'pedido', 'albaran'])).toBe(false);
    expect(algunoLlevaQr([])).toBe(false);
  });

  it('si vale para albarán Y para factura, sí lo lleva', () => {
    expect(algunoLlevaQr(['albaran', 'factura'])).toBe(true);
  });

  it('se previsualiza con el tipo más comprometido de los marcados', () => {
    // Enseñarla sin QR escondería justo el problema: que al diseño le
    // falte sitio para el código cuando se use como factura.
    expect(tipoDominante(['albaran', 'factura'])).toBe('factura');
    expect(tipoDominante(['presupuesto', 'albaran'])).toBe('albaran');
    expect(tipoDominante(['rectificativa', 'factura'])).toBe('rectificativa');
    expect(tipoDominante([])).toBe('factura');
  });
});

describe('la tabla de personalidades está completa', () => {
  it('cada tipo tiene la suya, y coincide su id', () => {
    for (const tipo of TIPOS_PLANTILLA) {
      const p = PERSONALIDADES[tipo];
      expect(p, `falta la personalidad de ${tipo}`).toBeDefined();
      expect(p.id).toBe(tipo);
    }
  });

  it('ninguna se queda sin rótulos ni sin explicación', () => {
    for (const tipo of TIPOS_PLANTILLA) {
      const p = PERSONALIDADES[tipo];
      for (const campo of ['etiqueta', 'plural', 'tituloImpreso', 'paraQue', 'notaQr'] as const) {
        expect(p[campo].trim().length, `${tipo}.${campo} está vacío`).toBeGreaterThan(0);
      }
      expect(p.palabras.length, `${tipo} no tiene palabras que lo delaten`).toBeGreaterThan(0);
    }
  });

  it('todas las palabras están ya normalizadas', () => {
    // Se comparan contra texto sin acentos ni mayúsculas: una palabra con
    // tilde en esta tabla no encajaría nunca, en silencio.
    for (const tipo of TIPOS_PLANTILLA) {
      for (const palabra of PERSONALIDADES[tipo].palabras) {
        expect(palabra, `«${palabra}» debe ir en minúsculas y sin acentos`).toBe(
          palabra.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''),
        );
      }
    }
  });
});
