/**
 * BORRADO DE LOS DATOS DE MUESTRA
 *
 * El PDF que sube el usuario es una factura suya de verdad: trae el nombre
 * de un cliente concreto, unos importes y unas fechas. El diseño hay que
 * conservarlo; esos datos, no. Este módulo produce el «calco»: la misma
 * página con los huecos de los datos tapados con el color que tenían detrás.
 *
 * El color de relleno se toma del contorno de cada hueco en vez de usar
 * blanco fijo. Así funciona igual sobre una franja de color, sobre una caja
 * gris o sobre papel blanco, que es lo que permite aceptar cualquier
 * factura sin que aparezcan parches blancos en mitad del diseño.
 */

import { aDataUrlOptimo, fondoAlrededor, type PaginaConLienzo } from './extraccion';
import type { Zona } from './tipos';

export type { Zona };
export { aDataUrlOptimo };

/** Milímetros que se añaden a cada lado para llevarse el antialias del texto. */
const HOLGURA_MM = 0.45;

export function construirCalco(pagina: PaginaConLienzo, zonas: Zona[]): string {
  const { pxPorMm } = pagina.bitmap;
  const lienzo = document.createElement('canvas');
  lienzo.width = pagina.lienzo.width;
  lienzo.height = pagina.lienzo.height;
  const ctx = lienzo.getContext('2d');
  if (!ctx) return pagina.bitmap.dataUrl;

  ctx.drawImage(pagina.lienzo, 0, 0);

  for (const zona of zonas) {
    const x = (zona.x - HOLGURA_MM) * pxPorMm;
    const y = (zona.y - HOLGURA_MM) * pxPorMm;
    const ancho = (zona.ancho + HOLGURA_MM * 2) * pxPorMm;
    const alto = (zona.alto + HOLGURA_MM * 2) * pxPorMm;
    if (ancho <= 0 || alto <= 0) continue;

    // El contorno se mide sobre los píxeles originales: si se midiera sobre
    // el lienzo que ya se está borrando, una zona pegada a otra copiaría el
    // relleno de la anterior y el parche se iría extendiendo.
    ctx.fillStyle = fondoAlrededor(pagina.pixeles, x, y, ancho, alto, Math.max(2, Math.round(pxPorMm)));
    ctx.fillRect(Math.floor(x), Math.floor(y), Math.ceil(ancho), Math.ceil(alto));
  }

  return aDataUrlOptimo(lienzo);
}
