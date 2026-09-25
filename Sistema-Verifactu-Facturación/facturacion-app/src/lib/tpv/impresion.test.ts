import { beforeEach, describe, expect, it } from 'vitest';
import { estilosTicket, guardarAjustesImpresion, leerAjustesImpresion } from './impresion';

describe('impresión del ticket', () => {
  it('cada papel con su página y sin márgenes en los rollos', () => {
    expect(estilosTicket('80')).toContain('size: 80mm auto; margin: 0;');
    expect(estilosTicket('80')).toContain('width: 72mm');
    expect(estilosTicket('58')).toContain('size: 58mm auto; margin: 0;');
    expect(estilosTicket('58')).toContain('width: 48mm');
    expect(estilosTicket('a4')).toContain('size: A4 portrait');
  });

  it('el QR mide 35 mm en cualquier papel (entre 30 y 40, art. 21.1 Orden HAC/1177/2024)', () => {
    for (const p of ['80', '58', 'a4'] as const) expect(estilosTicket(p)).toContain('width: 35mm; height: 35mm');
  });

  describe('ajustes del equipo', () => {
    const almacen = new Map<string, string>();
    beforeEach(() => {
      almacen.clear();
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: { getItem: (k: string) => almacen.get(k) ?? null, setItem: (k: string, v: string) => { almacen.set(k, v); } },
      });
    });

    it('por defecto, 80 mm y sin imprimir solo', () => {
      expect(leerAjustesImpresion()).toEqual({ papel: '80', alCobrar: false });
    });

    it('se guardan y se leen; lo raro vuelve al valor por defecto', () => {
      guardarAjustesImpresion({ papel: '58', alCobrar: true });
      expect(leerAjustesImpresion()).toEqual({ papel: '58', alCobrar: true });
      almacen.set('klima-tpv-impresion', '{"papel":"110","alCobrar":"si"}');
      expect(leerAjustesImpresion()).toEqual({ papel: '80', alCobrar: false });
      almacen.set('klima-tpv-impresion', 'no es json');
      expect(leerAjustesImpresion()).toEqual({ papel: '80', alCobrar: false });
    });
  });
});
