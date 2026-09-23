import { describe, it, expect } from 'vitest';

import { campoNuevo, quitarSeleccionados, rejillaNueva, type ContenidoLienzo } from './editor';
import { tablaPorDefecto } from './plantilla';
import { CLAVE_QR } from './huecoQr';
import type { CampoDetectado } from './tipos';

/**
 * TODO LO QUE SE PONE EN EL LIENZO SE TIENE QUE PODER QUITAR
 *
 * El borrado sólo contemplaba campos y zonas. Un cuadro de desglose o de
 * vencimientos se seleccionaba, se movía, se estiraba... y al pulsar Supr
 * no pasaba nada, en silencio. Como el panel del campo anuncia «Eliminar
 * (Supr)», quien aprendía la tecla con un campo la probaba con una
 * rejilla y concluía que eso no se podía quitar. Lo mismo con la tabla.
 */

function campo(id: string, clave: string | null = 'cliente_nombre'): CampoDetectado {
  const c = campoNuevo(id, { x: 10, y: 10, ancho: 30, alto: 6 });
  c.clave = clave;
  return c;
}

function lienzo(): ContenidoLienzo {
  return {
    campos: [campo('c1'), campo('c2', 'doc_numero')],
    zonasExtra: [{ id: 'z1', x: 5, y: 5, ancho: 20, alto: 10 }],
    rejillas: [rejillaNueva('r1', { x: 100, y: 200, ancho: 80, alto: 30 }, 'sans', 'impuestos')],
    tabla: tablaPorDefecto(210, 297),
  };
}

describe('Supr quita cada clase de elemento', () => {
  it('un campo', () => {
    const { cambios } = quitarSeleccionados(['campo:c1'], lienzo());
    expect(cambios.campos?.map(c => c.id)).toEqual(['c2']);
  });

  it('una zona tapada', () => {
    const { cambios } = quitarSeleccionados(['zona:z1'], lienzo());
    expect(cambios.zonasExtra).toEqual([]);
  });

  it('un cuadro de desglose', () => {
    // Éste no se quitaba de ninguna manera con el teclado.
    const { cambios } = quitarSeleccionados(['rejilla:r1'], lienzo());
    expect(cambios.rejillas).toEqual([]);
  });

  it('la tabla de líneas', () => {
    const { cambios } = quitarSeleccionados(['tabla'], lienzo());
    expect(cambios.tabla).toBeNull();
  });

  it('varias cosas de golpe', () => {
    const { cambios } = quitarSeleccionados(['campo:c1', 'zona:z1', 'rejilla:r1', 'tabla'], lienzo());
    expect(cambios.campos?.map(c => c.id)).toEqual(['c2']);
    expect(cambios.zonasExtra).toEqual([]);
    expect(cambios.rejillas).toEqual([]);
    expect(cambios.tabla).toBeNull();
  });
});

describe('lo que no toca, no se toca', () => {
  it('sin selección no cambia nada', () => {
    expect(quitarSeleccionados([], lienzo()).cambios).toEqual({});
  });

  it('una selección de algo que ya no existe no cambia nada', () => {
    expect(quitarSeleccionados(['campo:fantasma'], lienzo()).cambios).toEqual({});
  });

  it('borrar un campo no toca las zonas, ni las rejillas, ni la tabla', () => {
    // Devolver de más obliga a repintar el editor entero sin motivo.
    const { cambios } = quitarSeleccionados(['campo:c1'], lienzo());
    expect(cambios.zonasExtra).toBeUndefined();
    expect(cambios.rejillas).toBeUndefined();
    expect(cambios.tabla).toBeUndefined();
  });

  it('pedir borrar la tabla cuando no hay ninguna no cambia nada', () => {
    const sinTabla = { ...lienzo(), tabla: null };
    expect(quitarSeleccionados(['tabla'], sinTabla).cambios).toEqual({});
  });
});

describe('el QR tributario es la única excepción, y se explica', () => {
  function conQr(): ContenidoLienzo {
    const base = lienzo();
    return { ...base, campos: [...base.campos, campo('qr', CLAVE_QR)] };
  }

  it('no se borra: una factura sin su código no cumple', () => {
    const { cambios } = quitarSeleccionados(['campo:qr'], conQr());
    expect(cambios.campos).toBeUndefined();
  });

  it('y se dice por qué, en vez de no hacer nada en silencio', () => {
    // Antes tampoco se podía, sólo que se quitaba y volvía a aparecer
    // sola en cuanto se tocaba el tipo de documento. Eso es peor que no
    // dejar: parece que el programa se equivoca.
    const { motivoDeLoQueSeQueda } = quitarSeleccionados(['campo:qr'], conQr());
    expect(motivoDeLoQueSeQueda).toMatch(/no se puede quitar/i);
    expect(motivoDeLoQueSeQueda).toMatch(/mu[eé]velo|tama[ñn]o/i);
  });

  it('protegerlo no impide borrar lo demás de la misma selección', () => {
    const { cambios, motivoDeLoQueSeQueda } = quitarSeleccionados(
      ['campo:qr', 'campo:c1', 'zona:z1'], conQr(),
    );
    expect(cambios.campos?.map(c => c.id).sort()).toEqual(['c2', 'qr']);
    expect(cambios.zonasExtra).toEqual([]);
    expect(motivoDeLoQueSeQueda).not.toBeNull();
  });

  it('cuando no hay QR en la selección, no se avisa de nada', () => {
    expect(quitarSeleccionados(['campo:c1'], conQr()).motivoDeLoQueSeQueda).toBeNull();
  });
});
