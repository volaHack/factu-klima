/**
 * EL DESGLOSE DEL PIE, QUE CRECE CON LA FACTURA
 *
 * Cuántos renglones lleva el cuadro de impuestos lo dice la factura, no el
 * impreso. Antes eran cuatro casillas ancladas con el cuatro clavado en el
 * código; ahora es una rejilla que se expande al imprimir.
 *
 * Lo que se fija aquí es que crezca sin despegarse de su recuadro: en pdfme,
 * todo lo que va detrás de una tabla que crece se desplaza hacia abajo, así
 * que si esto viviera en el flujo de la página se saldría del cuadro impreso
 * en cuanto la factura trajera unas cuantas líneas.
 */

import { describe, expect, it } from 'vitest';
import type { Schema, Template } from '@pdfme/common';
import { materializarRejillas } from './plantilla';
import { hacerSitio, redimensionarColumnaRejilla, rejillaNueva } from './editor';
import type { CampoDetectado, RejillaDetectada, TablaDetectada } from './tipos';

const REJILLA: RejillaDetectada = {
  id: 'r1',
  fuente: 'impuestos',
  x: 11, y: 212, ancho: 91, alto: 34,
  yPrimerRenglon: 218,
  altoRenglon: 5,
  columnas: [
    { clave: 'nombre', cabecera: 'IMPUESTO', x: 11, ancho: 28, alineacion: 'left' },
    { clave: 'base', cabecera: 'BASE IMP.', x: 39, ancho: 28, alineacion: 'right' },
    { clave: 'tipo', cabecera: '%', x: 68, ancho: 13, alineacion: 'right' },
    { clave: 'cuota', cabecera: 'CUOTA', x: 81, ancho: 21, alineacion: 'right' },
    // Sin asignar a propósito: unas retenciones que no son dato nuestro.
    { clave: null, cabecera: 'RETENCIONES', x: 102, ancho: 10, alineacion: 'right' },
  ],
  celdasMuestra: [], contorno: { marco: false, renglones: false, columnas: false, grosor: 0.2 }, cabecera: false,
  tamano: 9, negrita: false, cursiva: false, serif: false, color: '#000000',
};

function plantillaCon(rejilla: RejillaDetectada): Template {
  return {
    basePdf: { width: 210, height: 297, padding: [0, 0, 0, 0], staticSchema: [] },
    schemas: [[]],
    __rejillas: [rejilla],
  } as unknown as Template;
}

const tramo = (pct: string, base: string) => ({
  tipo: pct, nombre: 'I.G.I.C.', base, cuota: '1,00', total: '2,00',
});

function casillas(plantilla: Template): (Schema & { position: { x: number; y: number } })[] {
  const base = plantilla.basePdf as { staticSchema: Schema[] };
  return base.staticSchema.filter(s => String(s.name).startsWith('__rej_')) as never;
}

describe('el desglose del pie se expande al imprimir', () => {
  it('saca un renglón por tipo impositivo, no cuatro siempre', () => {
    const plantilla = plantillaCon(REJILLA);
    materializarRejillas(plantilla, { impuestos: [tramo('3,0', '109,03'), tramo('7,0', '14,93')] });
    // Cuatro columnas asignadas por renglón, y dos renglones.
    expect(casillas(plantilla)).toHaveLength(8);
  });

  it('los pone sobre las rayas que el impreso ya trae pintadas', () => {
    const plantilla = plantillaCon(REJILLA);
    materializarRejillas(plantilla, { impuestos: [tramo('3,0', '1'), tramo('7,0', '2'), tramo('15,0', '3')] });
    const alturas = [...new Set(casillas(plantilla).map(c => c.position.y))].sort((a, b) => a - b);
    expect(alturas).toEqual([218, 223, 228]);
  });

  it('deja en blanco la columna que nadie ha asignado', () => {
    // Las retenciones no son parte del desglose de impuestos repercutidos.
    // Inventarles un valor sería peor que dejarlas vacías.
    const plantilla = plantillaCon(REJILLA);
    materializarRejillas(plantilla, { impuestos: [tramo('3,0', '109,03')] });
    expect(casillas(plantilla).some(c => String(c.name).includes('RETENCIONES'))).toBe(false);
  });

  it('no se sale del recuadro: aprieta los renglones para que quepan', () => {
    // El desglose por tipos es obligatorio en una factura. Si no cabe, más
    // vale apretado que incompleto, y desde luego mejor que desbordado por
    // debajo del cuadro impreso.
    const plantilla = plantillaCon(REJILLA);
    const muchos = Array.from({ length: 12 }, (_, i) => tramo(String(i), String(i)));
    materializarRejillas(plantilla, { impuestos: muchos });

    const dentro = casillas(plantilla);
    const fondo = REJILLA.y + REJILLA.alto;
    for (const casilla of dentro) {
      expect(casilla.position.y + (casilla.height as number)).toBeLessThanOrEqual(fondo + 0.5);
    }
  });

  it('al apretar, encoge también la letra', () => {
    const holgado = plantillaCon(REJILLA);
    materializarRejillas(holgado, { impuestos: [tramo('3,0', '1')] });
    const apretado = plantillaCon(REJILLA);
    materializarRejillas(apretado, {
      impuestos: Array.from({ length: 12 }, (_, i) => tramo(String(i), String(i))),
    });

    const cuerpo = (p: Template) => (casillas(p)[0] as unknown as { fontSize: number }).fontSize;
    expect(cuerpo(holgado)).toBe(9);
    expect(cuerpo(apretado)).toBeLessThan(9);
  });

  it('avisa cuando ni apretando caben todos', () => {
    // Que el desglose salga corto es un problema del que quien emite la
    // factura tiene que enterarse, no algo que se traga en silencio.
    const plantilla = plantillaCon(REJILLA);
    const avisos = materializarRejillas(plantilla, {
      impuestos: Array.from({ length: 40 }, (_, i) => tramo(String(i), String(i))),
    });
    expect(avisos.join(' ')).toMatch(/sólo tiene sitio para/);
  });

  it('no arrastra los renglones de la factura anterior', () => {
    // La misma plantilla imprime muchas facturas seguidas. Si no se limpiara,
    // la segunda saldría con los tipos de la primera debajo.
    const plantilla = plantillaCon(REJILLA);
    materializarRejillas(plantilla, { impuestos: [tramo('3,0', '1'), tramo('7,0', '2'), tramo('15,0', '3')] });
    materializarRejillas(plantilla, { impuestos: [tramo('3,0', '1')] });
    expect(casillas(plantilla)).toHaveLength(4);
  });
});

describe('una rejilla dibujada a mano', () => {
  const caja = { x: 20, y: 200, ancho: 100, alto: 40 };

  it('nace con las columnas del desglose español', () => {
    // Sobre un impreso que el detector no reconoció, hay que poder montar el
    // cuadro sin empezar de cero: concepto, base, tipo y cuota es lo que
    // lleva casi toda factura española.
    const rejilla = rejillaNueva('r', caja, 'sans');
    expect(rejilla.columnas.map(c => c.clave)).toEqual(['nombre', 'base', 'tipo', 'cuota']);
  });

  it('deja el primer renglón por debajo de la cabecera impresa', () => {
    // El usuario rodea el cuadro entero, cabecera incluida, porque es lo que
    // ve. Escribir en el primer renglón taparía los títulos del impreso.
    const rejilla = rejillaNueva('r', caja, 'sans');
    expect(rejilla.yPrimerRenglon).toBeGreaterThan(caja.y);
  });

  it('reparte el ancho sin dejar huecos ni solapes', () => {
    const rejilla = rejillaNueva('r', caja, 'sans');
    const ultima = rejilla.columnas[rejilla.columnas.length - 1];
    expect(rejilla.columnas[0].x).toBe(caja.x);
    expect(ultima.x + ultima.ancho).toBeCloseTo(caja.x + caja.ancho, 5);
  });

  it('sirve para imprimir en cuanto se dibuja', () => {
    // Sin esto habría que tocar cuatro ajustes antes de que saliera nada, y
    // el usuario no sabría si la ha colocado bien hasta emitir una factura.
    const plantilla = plantillaCon(rejillaNueva('r', caja, 'sans'));
    materializarRejillas(plantilla, { impuestos: [tramo('21,0', '100,00')] });
    expect(casillas(plantilla).length).toBeGreaterThan(0);
  });
});

describe('el contorno que se pinta la rejilla', () => {
  const TODO = { marco: true, renglones: true, columnas: true, grosor: 0.2 };
  const conContorno = { ...REJILLA, contorno: TODO };
  const rayas = (p: Template) => {
    const base = p.basePdf as { staticSchema: Schema[] };
    return base.staticSchema.filter(s => s.type === 'line');
  };

  it('sin contorno no pinta ni una raya', () => {
    // Sobre un PDF subido el recuadro ya está en el calco; volver a dibujarlo
    // lo dejaría a doble raya.
    const plantilla = plantillaCon(REJILLA);
    materializarRejillas(plantilla, { impuestos: [tramo('21,0', '100,00')] });
    expect(rayas(plantilla)).toHaveLength(0);
  });

  it('con contorno cierra el cuadro por los cuatro lados', () => {
    // Es lo que permite hacer una factura desde cero: debajo no hay más que
    // papel en blanco, así que el cuadro tiene que dibujárselo la rejilla.
    const plantilla = plantillaCon(conContorno);
    materializarRejillas(plantilla, { impuestos: [tramo('21,0', '100,00'), tramo('10,0', '50,00')] });
    const todas = rayas(plantilla);
    // Tres horizontales para dos renglones (arriba, en medio y abajo)...
    expect(todas.filter(r => (r.width as number) > (r.height as number))).toHaveLength(3);
    // ...y una vertical por cada lado de cada columna.
    expect(todas.filter(r => (r.height as number) > (r.width as number)))
      .toHaveLength(conContorno.columnas.length + 1);
  });

  it('el marco se ajusta a los renglones que haya, no a los que cupieran', () => {
    // Una factura de un solo tipo impositivo no puede salir con el cuadro
    // dibujado hasta abajo y cuatro renglones vacíos debajo de la cifra.
    const uno = plantillaCon(conContorno);
    materializarRejillas(uno, { impuestos: [tramo('21,0', '100,00')] });
    const tres = plantillaCon(conContorno);
    materializarRejillas(tres, { impuestos: [tramo('21,0', '1'), tramo('10,0', '2'), tramo('4,0', '3')] });

    const fondo = (p: Template) => Math.max(...rayas(p).map(r => r.position.y + (r.height as number)));
    expect(fondo(uno)).toBeLessThan(fondo(tres));
  });
});

describe('hacer sitio a la tabla', () => {
  const tabla = { x: 15, y: 100, ancho: 180, altoCabecera: 8, altoFila: 7, altoTotal: 60,
    columnas: [], estilo: {}, filasOriginales: 0 } as unknown as TablaDetectada;
  const campo = (id: string, y: number) => ({
    id, clave: null, tipo: 'texto', fijo: false, valorOriginal: '', etiquetaCercana: '',
    x: 15, y, ancho: 40, alto: 4, tamano: 9, alineacion: 'left', color: '#000',
    negrita: false, cursiva: false, serif: false, interlineado: 1.15, confianza: 1, motivo: '',
  } as unknown as CampoDetectado);

  it('baja lo que está debajo tanto como crece la tabla', () => {
    // Si la tabla crece y los totales no bajan, la tabla se les echa encima:
    // están anclados y no se apartan solos.
    const hecho = hacerSitio(20, tabla, [campo('arriba', 50), campo('abajo', 180)], [], 297)!;
    expect(hecho.tabla.altoTotal).toBe(80);
    expect(hecho.campos.find(c => c.id === 'abajo')!.y).toBe(200);
  });

  it('no toca lo que está por encima de la tabla', () => {
    // El membrete y los datos del cliente no se mueven: el sitio sale de
    // abajo, no de arriba.
    const hecho = hacerSitio(20, tabla, [campo('arriba', 50)], [], 297)!;
    expect(hecho.campos.find(c => c.id === 'arriba')!.y).toBe(50);
  });

  it('la rejilla baja con sus renglones', () => {
    // Bajar el recuadro sin bajar el primer renglón dejaría las cifras fuera.
    const rejilla = { ...REJILLA, y: 220, yPrimerRenglon: 226 };
    const hecho = hacerSitio(10, tabla, [], [rejilla], 297)!;
    expect(hecho.rejillas[0].y).toBe(230);
    expect(hecho.rejillas[0].yPrimerRenglon).toBe(236);
  });

  it('no empuja nada fuera del papel', () => {
    // Bajar el pie legal fuera del A4 es peor que dejar la tabla como estaba:
    // no se imprime y nadie se entera.
    const hecho = hacerSitio(60, tabla, [campo('pie', 275)], [], 297);
    expect(hecho).not.toBeNull();
    expect(hecho!.campos[0].y + hecho!.campos[0].alto).toBeLessThanOrEqual(291);
  });

  it('dice que no cuando ya no queda hueco', () => {
    expect(hacerSitio(20, tabla, [campo('pie', 288)], [], 297)).toBeNull();
  });
});

describe('cada raya del cuadro se enciende por su lado', () => {
  const con = (contorno: Partial<typeof REJILLA.contorno>, cabecera = false) =>
    ({ ...REJILLA, cabecera, contorno: { marco: false, renglones: false, columnas: false, grosor: 0.2, ...contorno } });
  const pintar = (rejilla: RejillaDetectada, n = 2) => {
    const p = plantillaCon(rejilla);
    materializarRejillas(p, { impuestos: Array.from({ length: n }, (_, i) => tramo(String(i), String(i))) });
    return p;
  };
  const rayas = (p: Template) =>
    (p.basePdf as { staticSchema: Schema[] }).staticSchema.filter(s => s.type === 'line');

  it('sólo el marco son cuatro rayas y ni una más', () => {
    // Un impreso que trae el cuadro dividido por dentro pero abierto por
    // fuera: encender todo le doblaría las rayas interiores.
    expect(rayas(pintar(con({ marco: true })))).toHaveLength(4);
  });

  it('sólo los renglones no pinta el marco', () => {
    // Con dos renglones hay UNA raya entre ellos. Las de los extremos son del
    // marco, y repetirlas engorda el trazo al imprimir.
    expect(rayas(pintar(con({ renglones: true })))).toHaveLength(1);
  });

  it('sólo las columnas pinta las de dentro', () => {
    // Cinco columnas dejan cuatro separaciones interiores; los lados son del
    // marco.
    expect(rayas(pintar(con({ columnas: true })))).toHaveLength(REJILLA.columnas.length - 1);
  });

  it('todo apagado no pinta nada', () => {
    // Es el caso de un PDF subido: el recuadro ya está en el calco.
    expect(rayas(pintar(con({})))).toHaveLength(0);
  });

  it('el grosor es el que se le diga', () => {
    const p = pintar(con({ marco: true, grosor: 0.5 }));
    const horizontal = rayas(p).find(r => (r.width as number) > (r.height as number))!;
    expect(horizontal.height).toBe(0.5);
  });
});

describe('la cabecera del cuadro', () => {
  const conCabecera = { ...REJILLA, cabecera: true };
  const casillasDe = (rejilla: RejillaDetectada) => {
    const p = plantillaCon(rejilla);
    materializarRejillas(p, { impuestos: [tramo('21,0', '100,00')] });
    return casillas(p);
  };

  it('imprime el nombre de cada columna asignada', () => {
    // Sobre papel en blanco no hay títulos pintados: sin esto el cuadro sale
    // con las cifras y sin decir cuál es la base y cuál la cuota.
    const titulos = casillasDe(conCabecera)
      .filter(c => String(c.name).includes('_cab_'))
      .map(c => c.content);
    expect(titulos).toContain('BASE IMP.');
    expect(titulos).toContain('CUOTA');
  });

  it('apagada no imprime ninguno', () => {
    // Sobre un impreso que ya los trae, imprimirlos los pondría por duplicado.
    expect(casillasDe(REJILLA).some(c => String(c.name).includes('_cab_'))).toBe(false);
  });

  it('empuja las cifras un renglón hacia abajo', () => {
    // Si no, el primer tipo impositivo se imprimiría encima de los títulos.
    const conY = casillasDe(conCabecera).find(c => String(c.name).includes('_0_base'))!.position.y;
    const sinY = casillasDe(REJILLA).find(c => String(c.name).includes('_0_base'))!.position.y;
    expect(conY).toBe(sinY + REJILLA.altoRenglon);
  });
});

describe('repartir el ancho entre dos columnas del cuadro', () => {
  const cols = () => REJILLA.columnas.map(c => ({ ...c }));

  it('lo que gana una lo pierde la de al lado', () => {
    // El cuadro está calzado sobre un recuadro impreso: si al ensanchar una
    // columna creciera el total, se saldría de su sitio en el papel.
    const antes = cols();
    const total = antes.reduce((s, c) => s + c.ancho, 0);
    const despues = redimensionarColumnaRejilla(antes, 0, antes[0].ancho + 8);
    expect(despues.reduce((s, c) => s + c.ancho, 0)).toBeCloseTo(total, 5);
  });

  it('la de la derecha se corre para no dejar hueco', () => {
    // Si sólo se estrechara sin moverse, quedaría una franja en blanco entre
    // las dos y las cifras saldrían descolocadas respecto a las rayas.
    const despues = redimensionarColumnaRejilla(cols(), 0, cols()[0].ancho + 8);
    expect(despues[1].x).toBeCloseTo(despues[0].x + despues[0].ancho, 5);
  });

  it('ninguna se queda sin anchura utilizable', () => {
    // Una columna de cero milímetros no imprime su cifra y no hay manera de
    // volver a agarrarla con el ratón para arreglarlo.
    const despues = redimensionarColumnaRejilla(cols(), 0, 999);
    expect(despues[0].ancho).toBeGreaterThanOrEqual(6);
    expect(despues[1].ancho).toBeGreaterThanOrEqual(6);
  });

  it('la última no tiene a quién quitarle: se queda como está', () => {
    const antes = cols();
    expect(redimensionarColumnaRejilla(antes, antes.length - 1, 5)).toEqual(antes);
  });
});
