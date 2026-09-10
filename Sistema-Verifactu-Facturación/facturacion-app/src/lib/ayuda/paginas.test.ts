/**
 * NINGUNA PANTALLA SE PUEDE QUEDAR SIN AYUDA
 *
 * Esta prueba recorre las rutas de verdad del programa —las lee del disco,
 * no de una lista escrita a mano— y comprueba que todas tienen ayuda. Es la
 * única manera de que la ayuda no se pudra: el día que alguien añada una
 * pantalla nueva, esto se pone rojo y le obliga a escribir para qué sirve.
 *
 * Un manual que se queda a medias es peor que no tenerlo, porque se deja de
 * mirar en cuanto falla una vez.
 */

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AYUDA_PAGINAS, ayudaDe } from './paginas';

/** Las rutas reales de la aplicación, leídas de `src/app/(app)`. */
function rutasDelPrograma(): string[] {
  const raiz = join(process.cwd(), 'src', 'app', '(app)');
  const rutas: string[] = [];

  const recorrer = (dir: string, prefijo: string) => {
    for (const entrada of readdirSync(dir)) {
      const completa = join(dir, entrada);
      if (statSync(completa).isDirectory()) {
        recorrer(completa, `${prefijo}/${entrada}`);
      } else if (entrada === 'page.tsx') {
        rutas.push(prefijo || '/');
      }
    }
  };

  recorrer(raiz, '');
  return rutas;
}

/** Las rutas con parámetro (`/facturas/[id]`) heredan la de su padre. */
const esFicha = (ruta: string) => ruta.includes('[');

describe('la ayuda cubre el programa entero', () => {
  const rutas = rutasDelPrograma();

  it('encuentra las pantallas del programa', () => {
    // Si esto baja de golpe es que la lectura del disco se ha roto y el
    // resto de la comprobación estaría pasando en vano.
    expect(rutas.length).toBeGreaterThan(30);
  });

  it.each(rutas.filter(r => !esFicha(r)))('«%s» tiene ayuda', ruta => {
    expect(ayudaDe(ruta), `Falta la ayuda de ${ruta}`).not.toBeNull();
  });

  it('las fichas y los formularios heredan la ayuda de su listado', () => {
    expect(ayudaDe('/facturas/abc-123')?.ruta).toBe('/facturas');
    expect(ayudaDe('/facturas/abc-123/editar')?.ruta).toBe('/facturas');
    expect(ayudaDe('/clientes/xyz')?.ruta).toBe('/clientes');
    expect(ayudaDe('/listados-fiscales/303')?.ruta).toBe('/listados-fiscales');
  });

  it('la ruta más específica gana sobre la general', () => {
    // `/facturas/nueva` tiene la suya propia y no debe caer en `/facturas`.
    expect(ayudaDe('/facturas/nueva')?.ruta).toBe('/facturas/nueva');
  });

  it('una ruta que no existe no devuelve nada, en vez de inventarse ayuda', () => {
    expect(ayudaDe('/no-existe')).toBeNull();
    expect(ayudaDe('/')).toBeNull();
  });

  it('la barra final no cambia el resultado', () => {
    expect(ayudaDe('/facturas/')?.ruta).toBe('/facturas');
  });
});

describe('cómo está escrita', () => {
  it.each(AYUDA_PAGINAS)('«$titulo» está completa', ayuda => {
    expect(ayuda.titulo.trim()).not.toBe('');
    expect(ayuda.paraQue.trim().length).toBeGreaterThan(20);
    expect(ayuda.pasos.length).toBeGreaterThanOrEqual(2);
    ayuda.pasos.forEach(p => expect(p.trim().length).toBeGreaterThan(10));
  });

  it('no hay dos entradas para la misma ruta', () => {
    const rutas = AYUDA_PAGINAS.map(a => a.ruta);
    expect(new Set(rutas).size).toBe(rutas.length);
  });

  it('los enlaces «sigue por aquí» apuntan a pantallas que existen', () => {
    // Un enlace roto dentro de la ayuda es peor que no ponerlo: manda al
    // usuario a una pantalla en blanco justo cuando estaba perdido.
    const reales = new Set(rutasDelPrograma().filter(r => !esFicha(r)));
    for (const ayuda of AYUDA_PAGINAS) {
      for (const rel of ayuda.relacionadas ?? []) {
        expect(reales.has(rel.ruta), `${ayuda.ruta} enlaza a ${rel.ruta}, que no existe`).toBe(true);
      }
    }
  });

  it('no se cuela jerga de folleto', () => {
    // «El sistema permite gestionar» no le dice nada a nadie. Si aparece, es
    // que se escribió pensando en un catálogo y no en quien está delante.
    const jerga = /el sistema permite|potente herramienta|solución integral|de forma sencilla y r[áa]pida/i;
    for (const ayuda of AYUDA_PAGINAS) {
      const todo = [ayuda.paraQue, ...ayuda.pasos, ...(ayuda.saber ?? [])].join(' ');
      expect(jerga.test(todo), `${ayuda.ruta} tiene jerga de folleto`).toBe(false);
    }
  });
});
