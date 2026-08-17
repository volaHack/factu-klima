import { describe, expect, it } from 'vitest';
import {
  alinear, anadirColumna, calcularImanes, distribuir, ejemploDeColumna,
  escalarColumnas, igualarColumnas, intersecan, moverColumna, ordenDeLectura,
  quitarColumna, recolocarColumnas, redimensionarColumna, ANCHO_MINIMO_COLUMNA,
} from './editor';
import type { ColumnaDetectada, TablaDetectada } from './tipos';

const PAGINA = { ancho: 210, alto: 297 };

function columna(clave: string | null, x: number, ancho: number): ColumnaDetectada {
  return { clave, cabecera: clave ?? '', x, ancho, alineacion: 'left' };
}

/** Cuatro columnas contiguas que suman 100 mm empezando en x = 20. */
function columnasBase(): ColumnaDetectada[] {
  return [
    columna('ref', 20, 20),
    columna('descripcion', 40, 40),
    columna('cantidad', 80, 15),
    columna('importe', 95, 25),
  ];
}

/** Las columnas siempre tienen que quedar pegadas unas a otras y sin huecos. */
function estanEncadenadas(columnas: ColumnaDetectada[], inicio: number): boolean {
  let cursor = inicio;
  for (const c of columnas) {
    if (Math.abs(c.x - cursor) > 1e-9) return false;
    cursor += c.ancho;
  }
  return true;
}

describe('imanes de alineación', () => {
  it('pega el borde izquierdo al de otra caja cercana', () => {
    const resultado = calcularImanes(
      { x: 20.6, y: 100, ancho: 30, alto: 5 },
      [{ x: 20, y: 80, ancho: 40, alto: 5 }],
      PAGINA,
      1,
    );
    expect(resultado.x).toBeCloseTo(20);
    expect(resultado.guias.some(g => g.eje === 'x' && g.valor === 20)).toBe(true);
  });

  it('no mueve nada si no hay nada cerca', () => {
    const resultado = calcularImanes(
      { x: 120, y: 100, ancho: 30, alto: 5 },
      [{ x: 20, y: 80, ancho: 40, alto: 5 }],
      PAGINA,
      1,
    );
    expect(resultado.x).toBe(120);
    expect(resultado.y).toBe(100);
    expect(resultado.guias).toHaveLength(0);
  });

  it('reconoce el centro de la página como referencia', () => {
    const resultado = calcularImanes(
      { x: 79.5, y: 10, ancho: 50, alto: 5 },
      [],
      PAGINA,
      1.5,
    );
    // El centro de la caja (104,5) se pega al centro del papel (105).
    expect(resultado.x).toBeCloseTo(80);
  });

  it('elige el imán más cercano cuando hay varios candidatos', () => {
    const resultado = calcularImanes(
      { x: 30.4, y: 50, ancho: 10, alto: 5 },
      [
        { x: 29, y: 20, ancho: 10, alto: 5 },
        { x: 30.5, y: 20, ancho: 10, alto: 5 },
      ],
      PAGINA,
      2,
    );
    expect(resultado.x).toBeCloseTo(30.5);
  });
});

describe('alinear y repartir', () => {
  const cajas = [
    { x: 10, y: 10, ancho: 20, alto: 5 },
    { x: 15, y: 30, ancho: 40, alto: 5 },
    { x: 12, y: 50, ancho: 30, alto: 5 },
  ];

  it('alinea a la izquierda por el borde más a la izquierda', () => {
    expect(alinear(cajas, 'izquierda').map(c => c.x)).toEqual([10, 10, 10]);
  });

  it('alinea a la derecha respetando el ancho de cada caja', () => {
    // El borde derecho común es 55 (15 + 40).
    expect(alinear(cajas, 'derecha').map(c => c.x + c.ancho)).toEqual([55, 55, 55]);
  });

  it('no toca nada si hay menos de dos cajas', () => {
    expect(alinear([cajas[0]], 'derecha')).toEqual([cajas[0]]);
  });

  it('reparte el hueco dejando fijos los extremos', () => {
    const repartidas = distribuir(cajas, 'vertical');
    expect(repartidas[0].y).toBe(10);
    expect(repartidas[2].y).toBe(50);
    const huecoPrimero = repartidas[2].y - (repartidas[0].y + repartidas[0].alto);
    expect(huecoPrimero).toBeGreaterThan(0);
    // Los dos huecos resultantes son iguales.
    const h1 = repartidas[1].y - (repartidas[0].y + repartidas[0].alto);
    const h2 = repartidas[2].y - (repartidas[1].y + repartidas[1].alto);
    expect(h1).toBeCloseTo(h2);
  });

  it('devuelve las cajas en el orden de entrada al repartir', () => {
    const desordenadas = [cajas[2], cajas[0], cajas[1]];
    const repartidas = distribuir(desordenadas, 'vertical');
    expect(repartidas.map(c => c.ancho)).toEqual(desordenadas.map(c => c.ancho));
  });
});

describe('orden de las columnas', () => {
  it('lleva una columna a otra posición conservando su ancho', () => {
    const movidas = moverColumna(columnasBase(), 0, 2, 20);
    expect(movidas.map(c => c.clave)).toEqual(['descripcion', 'cantidad', 'ref', 'importe']);
    expect(movidas.find(c => c.clave === 'ref')!.ancho).toBe(20);
  });

  it('deja las columnas encadenadas después de reordenar', () => {
    const movidas = moverColumna(columnasBase(), 3, 0, 20);
    expect(estanEncadenadas(movidas, 20)).toBe(true);
    expect(movidas[0].clave).toBe('importe');
  });

  it('no cambia nada si el origen y el destino son el mismo', () => {
    expect(moverColumna(columnasBase(), 1, 1, 20)).toEqual(columnasBase());
  });

  it('ignora índices fuera de rango', () => {
    expect(moverColumna(columnasBase(), 0, 9, 20)).toEqual(columnasBase());
  });

  it('conserva el ancho total tras cualquier reordenación', () => {
    const original = columnasBase();
    const total = original.reduce((s, c) => s + c.ancho, 0);
    const movidas = moverColumna(original, 2, 0, 20);
    expect(movidas.reduce((s, c) => s + c.ancho, 0)).toBeCloseTo(total);
  });
});

describe('ancho de las columnas', () => {
  it('reparte el ancho entre la columna y su vecina sin tocar el total', () => {
    const original = columnasBase();
    // Las columnas 1 y 2 suman 55 mm; pedir 45 deja 10 a la vecina, holgado.
    const ajustadas = redimensionarColumna(original, 1, 45, 20);
    expect(ajustadas[1].ancho).toBe(45);
    expect(ajustadas[1].ancho + ajustadas[2].ancho).toBe(original[1].ancho + original[2].ancho);
    expect(estanEncadenadas(ajustadas, 20)).toBe(true);
  });

  it('no deja que una columna se quede sin ancho utilizable', () => {
    const ajustadas = redimensionarColumna(columnasBase(), 1, 0, 20);
    expect(ajustadas[1].ancho).toBe(ANCHO_MINIMO_COLUMNA);
    expect(ajustadas[2].ancho).toBeGreaterThanOrEqual(ANCHO_MINIMO_COLUMNA);
  });

  it('tampoco deja que se coma entera a la vecina', () => {
    const ajustadas = redimensionarColumna(columnasBase(), 1, 999, 20);
    expect(ajustadas[2].ancho).toBe(ANCHO_MINIMO_COLUMNA);
  });

  it('ignora el separador de la última columna, que no tiene vecina', () => {
    const original = columnasBase();
    expect(redimensionarColumna(original, 3, 10, 20)).toEqual(original);
  });

  it('escala las columnas al estirar la tabla manteniendo proporciones', () => {
    const original = columnasBase();
    const escaladas = escalarColumnas(original, 100, 150, 20);
    expect(escaladas.reduce((s, c) => s + c.ancho, 0)).toBeCloseTo(150);
    expect(escaladas[0].ancho / escaladas[1].ancho).toBeCloseTo(original[0].ancho / original[1].ancho);
    expect(estanEncadenadas(escaladas, 20)).toBe(true);
  });
});

describe('añadir y quitar columnas', () => {
  it('al quitar una columna su ancho pasa a la vecina', () => {
    const original = columnasBase();
    const total = original.reduce((s, c) => s + c.ancho, 0);
    const restantes = quitarColumna(original, 1, 20);
    expect(restantes).toHaveLength(3);
    expect(restantes.reduce((s, c) => s + c.ancho, 0)).toBeCloseTo(total);
    expect(estanEncadenadas(restantes, 20)).toBe(true);
  });

  it('nunca deja la tabla sin columnas', () => {
    const una = [columna('descripcion', 20, 100)];
    expect(quitarColumna(una, 0, 20)).toEqual(una);
  });

  it('la columna nueva parte por la mitad la última y respeta el total', () => {
    const original = columnasBase();
    const total = original.reduce((s, c) => s + c.ancho, 0);
    const ampliadas = anadirColumna(original, 20);
    expect(ampliadas).toHaveLength(5);
    expect(ampliadas.reduce((s, c) => s + c.ancho, 0)).toBeCloseTo(total);
    expect(estanEncadenadas(ampliadas, 20)).toBe(true);
  });

  it('la columna nueva hereda la alineación que le toca por su contenido', () => {
    const ampliadas = anadirColumna(columnasBase(), 20, 'importe_total');
    expect(ampliadas[ampliadas.length - 1].alineacion).toBe('right');
  });

  it('igualar reparte el ancho de la tabla a partes iguales', () => {
    const tabla = {
      x: 20, ancho: 100, columnas: columnasBase(),
    } as unknown as TablaDetectada;
    const iguales = igualarColumnas(tabla);
    expect(new Set(iguales.map(c => c.ancho))).toEqual(new Set([25]));
    expect(estanEncadenadas(iguales, 20)).toBe(true);
  });
});

describe('utilidades varias', () => {
  it('recolocar encadena las columnas desde el inicio dado', () => {
    const sueltas = [columna('a', 999, 10), columna('b', -5, 20)];
    expect(recolocarColumnas(sueltas, 30).map(c => c.x)).toEqual([30, 40]);
  });

  it('detecta el solape entre dos cajas', () => {
    expect(intersecan({ x: 0, y: 0, ancho: 10, alto: 10 }, { x: 5, y: 5, ancho: 10, alto: 10 })).toBe(true);
    expect(intersecan({ x: 0, y: 0, ancho: 10, alto: 10 }, { x: 20, y: 0, ancho: 10, alto: 10 })).toBe(false);
  });

  it('ordena de arriba abajo y, a la misma altura, de izquierda a derecha', () => {
    const cajas = [
      { x: 100, y: 10, ancho: 5, alto: 5 },
      { x: 10, y: 10, ancho: 5, alto: 5 },
      { x: 50, y: 5, ancho: 5, alto: 5 },
    ];
    expect([...cajas].sort(ordenDeLectura).map(c => c.x)).toEqual([50, 10, 100]);
  });

  it('da un valor de muestra distinto por fila para ver la tabla poblada', () => {
    expect(ejemploDeColumna('descripcion', 0)).not.toBe(ejemploDeColumna('descripcion', 1));
    expect(ejemploDeColumna(null, 0)).toBe('');
  });

  it('sabe poner muestra a una columna propia de la plantilla', () => {
    expect(ejemploDeColumna('custom_col_1', 0)).not.toBe('');
  });
});
