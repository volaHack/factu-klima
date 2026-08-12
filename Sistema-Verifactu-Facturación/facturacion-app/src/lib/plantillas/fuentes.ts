/**
 * FUENTES DEL GENERADOR DE PDF
 *
 * pdfme incrusta las fuentes en el PDF, así que necesita el fichero .ttf de
 * cada variante que se use. Se sirven desde `/fuentes/` y se piden sólo la
 * primera vez que se genera un PDF: el service worker las guarda en caché,
 * de modo que a partir de ahí también funciona sin conexión.
 *
 * Se llevan dos familias porque el calco conserva la tipografía original del
 * membrete y los datos que pintamos encima tienen que pegar con ella: una
 * factura con el diseño en Times y los importes en una tipografía de palo
 * seco se nota a la primera.
 */

import type { Font } from '@pdfme/common';

const ARCHIVOS: Record<string, string> = {
  'sans': '/fuentes/sans-regular.ttf',
  'sans-bold': '/fuentes/sans-bold.ttf',
  'sans-italic': '/fuentes/sans-italic.ttf',
  'serif': '/fuentes/serif-regular.ttf',
  'serif-bold': '/fuentes/serif-bold.ttf',
  'serif-italic': '/fuentes/serif-italic.ttf',
};

/** La que usa pdfme cuando un campo no dice de qué fuente es. */
const FUENTE_DE_RESERVA = 'sans';

let cache: Promise<Font> | null = null;

export class ErrorFuentes extends Error {}

export async function cargarFuentes(): Promise<Font> {
  if (!cache) {
    cache = (async () => {
      const nombres = Object.keys(ARCHIVOS);
      const datos = await Promise.all(
        nombres.map(async (nombre) => {
          const respuesta = await fetch(ARCHIVOS[nombre]);
          if (!respuesta.ok) {
            throw new ErrorFuentes(
              `No se ha podido cargar la tipografía «${nombre}». Vuelve a intentarlo con conexión.`,
            );
          }
          return respuesta.arrayBuffer();
        }),
      );

      const fuentes: Font = {};
      nombres.forEach((nombre, i) => {
        fuentes[nombre] = { data: datos[i], fallback: nombre === FUENTE_DE_RESERVA };
      });
      return fuentes;
    })();

    // Un fallo de red no puede dejar la promesa fallida guardada para
    // siempre: sin esto, el primer intento sin conexión rompería la
    // descarga de PDF durante el resto de la sesión.
    cache.catch(() => { cache = null; });
  }
  return cache;
}
