import { describe, it, expect } from 'vitest';

import { ATAJOS, accionDeAtajo, atajoDe, type TeclaPulsada } from './atajos';

const LIBRE = { escribiendo: false, hayModal: false };

function tecla(key: string, extra: Partial<TeclaPulsada> = {}): TeclaPulsada {
  return { key, ...extra };
}

describe('qué atajo dispara cada tecla', () => {
  it('las cuatro letras llevan a donde dice su rótulo', () => {
    expect(accionDeAtajo(tecla('d'), LIBRE)).toBe('panel');
    expect(accionDeAtajo(tecla('f'), LIBRE)).toBe('facturas');
    expect(accionDeAtajo(tecla('n'), LIBRE)).toBe('nueva-factura');
    expect(accionDeAtajo(tecla('r'), LIBRE)).toBe('refrescar');
  });

  it('da igual mayúscula que minúscula', () => {
    expect(accionDeAtajo(tecla('N'), LIBRE)).toBe('nueva-factura');
    expect(accionDeAtajo(tecla('F'), LIBRE)).toBe('facturas');
  });

  it('Ctrl+K y Cmd+K abren la búsqueda', () => {
    expect(accionDeAtajo(tecla('k', { ctrlKey: true }), LIBRE)).toBe('buscar');
    expect(accionDeAtajo(tecla('K', { metaKey: true }), LIBRE)).toBe('buscar');
  });

  it('una tecla cualquiera no hace nada', () => {
    for (const k of ['a', 'z', '7', 'Enter', 'Escape', 'ArrowDown', ' ']) {
      expect(accionDeAtajo(tecla(k), LIBRE), `«${k}» no debería disparar nada`).toBeNull();
    }
  });
});

describe('cuándo NO debe dispararse', () => {
  it('no se dispara mientras se escribe', () => {
    // La misma «n» que abre una factura nueva es la de «Antonio».
    const escribiendo = { escribiendo: true, hayModal: false };
    expect(accionDeAtajo(tecla('n'), escribiendo)).toBeNull();
    expect(accionDeAtajo(tecla('f'), escribiendo)).toBeNull();
  });

  it('pero Ctrl+K sigue valiendo mientras se escribe', () => {
    expect(
      accionDeAtajo(tecla('k', { ctrlKey: true }), { escribiendo: true, hayModal: false }),
    ).toBe('buscar');
  });

  it('no se dispara con una modal abierta, ni siquiera Ctrl+K', () => {
    // Navegar por detrás de un diálogo deja al usuario mirando una ventana
    // que ya no corresponde a la página de debajo.
    const conModal = { escribiendo: false, hayModal: true };
    expect(accionDeAtajo(tecla('n'), conModal)).toBeNull();
    expect(accionDeAtajo(tecla('k', { ctrlKey: true }), conModal)).toBeNull();
  });

  it('no roba las combinaciones del navegador', () => {
    // Ctrl+F busca en la página, Ctrl+D guarda el marcador, Ctrl+N abre
    // ventana y Alt+F abre el menú. Ninguna es nuestra.
    expect(accionDeAtajo(tecla('f', { ctrlKey: true }), LIBRE)).toBeNull();
    expect(accionDeAtajo(tecla('d', { ctrlKey: true }), LIBRE)).toBeNull();
    expect(accionDeAtajo(tecla('n', { ctrlKey: true }), LIBRE)).toBeNull();
    expect(accionDeAtajo(tecla('n', { metaKey: true }), LIBRE)).toBeNull();
    expect(accionDeAtajo(tecla('f', { altKey: true }), LIBRE)).toBeNull();
    expect(accionDeAtajo(tecla('k', { ctrlKey: true, altKey: true }), LIBRE)).toBeNull();
  });

  it('no se dispara con un acento a medio componer', () => {
    // Al teclear «ñ» o «á» el navegador manda la tecla antes de que el
    // carácter exista; si se atendiera, escribir «Núñez» navegaría.
    expect(accionDeAtajo(tecla('n', { isComposing: true }), LIBRE)).toBeNull();
  });
});

describe('la lista de atajos y los rótulos no pueden separarse', () => {
  it('todo lo que se anuncia responde de verdad al teclado', () => {
    // Éste era el fallo: los rótulos enseñaban D y F y no los escuchaba
    // nadie. Quien probaba D y no veía nada dejaba de fiarse del resto.
    for (const atajo of ATAJOS) {
      const pulsacion: TeclaPulsada = atajo.tecla.startsWith('Ctrl+')
        ? tecla(atajo.tecla.replace('Ctrl+', '').toLowerCase(), { ctrlKey: true })
        : tecla(atajo.tecla.toLowerCase());
      expect(
        accionDeAtajo(pulsacion, LIBRE),
        `el rótulo anuncia «${atajo.tecla}» para ${atajo.etiqueta}`,
      ).toBe(atajo.accion);
    }
  });

  it('ninguna tecla está anunciada dos veces', () => {
    const teclas = ATAJOS.map(a => a.tecla.toLowerCase());
    expect(new Set(teclas).size).toBe(teclas.length);
  });

  it('los que navegan llevan su destino', () => {
    for (const accion of ['panel', 'facturas', 'nueva-factura'] as const) {
      expect(atajoDe(accion).href).toMatch(/^\//);
    }
  });

  it('avisa si se pide un atajo que no existe', () => {
    // @ts-expect-error a propósito: comprobamos que no devuelve undefined en silencio
    expect(() => atajoDe('inventado')).toThrow(/desconocido/);
  });
});
