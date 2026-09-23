import { describe, it, expect } from 'vitest';

import { campoNuevo } from './editor';
import { compilarPlantilla } from './plantilla';
import type { AnalisisPdf, CampoDetectado } from './tipos';

/**
 * CENTRAR UN CAMPO NO PUEDE MOVERLO DE SITIO
 *
 * Al elegir «centrado» en el editor, el dato parecía desaparecer. No
 * desaparecía: se imprimía 63 mm más a la derecha.
 *
 * La causa estaba en el estirado de la caja. Un valor real puede ser más
 * largo que el de la muestra —«Bar Paco» en el PDF de ejemplo y
 * «Comercial Hermanos Rodríguez e Hijos S.L.» en la factura de verdad—,
 * así que la caja se ensancha hasta lo que tenga al lado. Ese ensanchado
 * trataba «centrado» como si fuera «izquierda»: crecía SÓLO hacia la
 * derecha, y después el texto se centraba dentro de la caja ya estirada,
 * que es otro sitio del papel.
 *
 * Lo que hay que mantener quieto es el centro, que es lo que el usuario
 * ha colocado con el ratón.
 */

const ANCHO_PAGINA = 210;

function analisisCon(alineacion: CampoDetectado['alineacion']): AnalisisPdf {
  const vecino = campoNuevo('vecino', { x: 20, y: 40, ancho: 30, alto: 6 });
  vecino.clave = 'doc_numero';
  vecino.valorOriginal = 'F-1';

  const campo = campoNuevo('campo', { x: 80, y: 40, ancho: 50, alto: 6 });
  campo.clave = 'cliente_nombre';
  campo.alineacion = alineacion;
  campo.valorOriginal = 'Bar Paco';

  return {
    pagina: {
      ancho: ANCHO_PAGINA, alto: 297, items: [], lineas: [], totalPaginas: 1,
      bitmap: { dataUrl: '', anchoPx: 1, altoPx: 1, pxPorMm: 1 },
    },
    campos: [vecino, campo],
    tabla: null, rejillas: [], avisos: [], zonasExtra: [], familia: 'sans',
  } as unknown as AnalisisPdf;
}

/** La caja con la que acaba el campo en la plantilla compilada. */
function cajaCompilada(alineacion: CampoDetectado['alineacion']) {
  const { plantilla } = compilarPlantilla(analisisCon(alineacion), { fondo: '', archivoOrigen: '' });
  const estaticos = (plantilla.basePdf as { staticSchema?: unknown[] })?.staticSchema ?? [];
  const todos = [...(plantilla.schemas ?? []).flat(), ...estaticos] as {
    name?: string; position?: { x: number }; width?: number; alignment?: string;
  }[];
  const campo = todos.find(e => e.name === 'cliente_nombre');
  if (!campo?.position || typeof campo.width !== 'number') throw new Error('no se ha compilado el campo');
  return { x: campo.position.x, ancho: campo.width, alineacion: campo.alignment };
}

describe('el campo acaba donde el usuario lo puso', () => {
  // El usuario lo colocó de 80 a 130 mm: su centro está en 105.
  const CENTRO_PUESTO = 105;

  it('centrado: el centro no se mueve', () => {
    const caja = cajaCompilada('center');
    expect(caja.x + caja.ancho / 2).toBeCloseTo(CENTRO_PUESTO, 1);
    expect(caja.alineacion).toBe('center');
  });

  it('centrado: la caja crece, para que quepa un nombre largo', () => {
    // Que el centro no se mueva no puede conseguirse a costa de no
    // ensanchar: entonces el nombre largo se encogería hasta ser ilegible.
    expect(cajaCompilada('center').ancho).toBeGreaterThan(50);
  });

  it('centrado: crece lo mismo por los dos lados', () => {
    const caja = cajaCompilada('center');
    const porIzquierda = 80 - caja.x;
    const porDerecha = (caja.x + caja.ancho) - 130;
    expect(porIzquierda).toBeCloseTo(porDerecha, 1);
  });

  it('centrado: no invade al vecino de la izquierda', () => {
    // El vecino ocupa de 20 a 50 mm.
    expect(cajaCompilada('center').x).toBeGreaterThanOrEqual(50);
  });

  it('a la izquierda: el borde izquierdo no se mueve', () => {
    expect(cajaCompilada('left').x).toBeCloseTo(80, 1);
  });

  it('a la derecha: el borde derecho no se mueve', () => {
    const caja = cajaCompilada('right');
    expect(caja.x + caja.ancho).toBeCloseTo(130, 1);
  });

  it('ninguna alineación se sale del papel', () => {
    for (const alineacion of ['left', 'center', 'right'] as const) {
      const caja = cajaCompilada(alineacion);
      expect(caja.x, alineacion).toBeGreaterThanOrEqual(0);
      expect(caja.x + caja.ancho, alineacion).toBeLessThanOrEqual(ANCHO_PAGINA);
    }
  });
});
