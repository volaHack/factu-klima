import { describe, it, expect } from 'vitest';

import { campoNuevo, rejillaNueva } from './editor';
import { compilarPlantilla, decidirAlineaciones, tablaPorDefecto } from './plantilla';
import type { AnalisisPdf, CampoDetectado } from './tipos';

/**
 * GUARDAR TIENE QUE GUARDAR LO QUE SE VE
 *
 * «Guardo los cambios, vuelvo a entrar y siempre hay algo que no se
 * guardó.» La causa no estaba en el guardado sino en el compilado:
 * `compilarPlantilla` llamaba a `decidirAlineaciones` pasándole los
 * MISMOS objetos que tiene el editor en pantalla, y esa función los muta.
 *
 * Compilar ocurre al previsualizar y al guardar. Así que el programa
 * reescribía la alineación que el usuario acababa de elegir, y lo que se
 * guardaba era su decisión, no la de la persona. Como la detección
 * automática acierta casi siempre, el estropicio sólo se veía en los
 * campos donde el usuario le había llevado la contraria — que son
 * justamente los que se había molestado en tocar.
 *
 * Dos reglas, y las dos se comprueban aquí:
 *  1. Compilar es una LECTURA del diseño: no puede cambiarlo.
 *  2. Lo que el usuario elige a mano manda sobre lo que el programa adivina.
 */

function campoEn(id: string, x: number, ancho: number, valor = ''): CampoDetectado {
  const c = campoNuevo(id, { x, y: 100, ancho, alto: 6 });
  c.clave = 'total_general';
  c.valorOriginal = valor;
  return c;
}

/** Dos campos que comparten borde derecho: la detección los alinea a la derecha. */
function analisisConColumnaDeImportes(): AnalisisPdf {
  return {
    pagina: {
      ancho: 210, alto: 297, items: [], lineas: [], totalPaginas: 1,
      bitmap: { dataUrl: '', anchoPx: 1, altoPx: 1, pxPorMm: 1 },
    },
    campos: [campoEn('a', 120, 60, '1.250,00 €'), campoEn('b', 150, 30, '262,50 €')],
    tabla: tablaPorDefecto(210, 297),
    rejillas: [rejillaNueva('r1', { x: 100, y: 200, ancho: 80, alto: 30 }, 'sans', 'impuestos')],
    avisos: [], zonasExtra: [{ id: 'z1', x: 5, y: 5, ancho: 20, alto: 10 }], familia: 'sans',
  } as unknown as AnalisisPdf;
}

describe('compilar no toca el diseño', () => {
  it('el análisis queda exactamente igual después de compilar', () => {
    // Todo el análisis, no sólo los campos: lo que se guarda al pulsar
    // «Guardar cambios» es esto entero, así que cualquier cosa que
    // compilar tocara se quedaría guardada sin que nadie lo pidiera.
    const analisis = analisisConColumnaDeImportes();
    const antes = JSON.parse(JSON.stringify({
      campos: analisis.campos,
      tabla: analisis.tabla,
      rejillas: analisis.rejillas,
      zonasExtra: analisis.zonasExtra,
      familia: analisis.familia,
    }));

    compilarPlantilla(analisis, { fondo: '', archivoOrigen: '' });

    expect({
      campos: analisis.campos,
      tabla: analisis.tabla,
      rejillas: analisis.rejillas,
      zonasExtra: analisis.zonasExtra,
      familia: analisis.familia,
    }).toEqual(antes);
  });

  it('tampoco al compilar dos veces seguidas', () => {
    // Previsualizar y luego guardar son dos compilados: si el primero
    // cambiara algo, el segundo partiría de otro diseño.
    const analisis = analisisConColumnaDeImportes();
    compilarPlantilla(analisis, { fondo: '', archivoOrigen: '' });
    const trasLaPrimera = JSON.parse(JSON.stringify(analisis.campos));
    compilarPlantilla(analisis, { fondo: '', archivoOrigen: '' });
    expect(analisis.campos).toEqual(trasLaPrimera);
  });
});

describe('lo que elige el usuario manda', () => {
  it('la detección alinea sola una columna de importes', () => {
    // Sin tocar nada, el programa acierta: por eso el fallo tardó en verse.
    const campos = [campoEn('a', 120, 60, '1.250,00 €'), campoEn('b', 150, 30, '262,50 €')];
    decidirAlineaciones(campos, 210);
    expect(campos.map(c => c.alineacion)).toEqual(['right', 'right']);
  });

  it('pero no le lleva la contraria a quien la ha elegido a mano', () => {
    const campos = [campoEn('a', 120, 60, '1.250,00 €'), campoEn('b', 150, 30, '262,50 €')];
    campos[0].alineacion = 'center';
    campos[0].alineacionManual = true;

    decidirAlineaciones(campos, 210);

    expect(campos[0].alineacion, 'la elegida a mano se queda').toBe('center');
    expect(campos[1].alineacion, 'la otra la sigue decidiendo el programa').toBe('right');
  });

  it('tampoco con la regla del importe pegado al margen', () => {
    const campo = campoEn('solo', 150, 40, '1.250,00 €');
    campo.alineacion = 'left';
    campo.alineacionManual = true;
    decidirAlineaciones([campo], 210);
    expect(campo.alineacion).toBe('left');
  });

  it('y la elección llega hasta el PDF, no sólo hasta la pantalla', () => {
    const analisis = analisisConColumnaDeImportes();
    analisis.campos[0].alineacion = 'center';
    analisis.campos[0].alineacionManual = true;

    const { plantilla } = compilarPlantilla(analisis, { fondo: '', archivoOrigen: '' });
    const estaticos = (plantilla.basePdf as { staticSchema?: unknown[] })?.staticSchema ?? [];
    const todos = [...(plantilla.schemas ?? []).flat(), ...estaticos] as {
      name?: string; alignment?: string;
    }[];

    const compilado = todos.find(e => e.name === 'total_general');
    expect(compilado?.alignment).toBe('center');
  });
});
