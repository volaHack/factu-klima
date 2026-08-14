/**
 * Parchea @pdfme/common para que el repaginador nunca apunte a una pǭgina
 * negativa ni divida entre una altura de contenido nula.
 *
 * `placeUnitsOnPages` calcula `currentPageIndex = floor(startGlobalY /
 * contentHeight)` y `currentYInPage = startGlobalY % contentHeight`. Dos
 * plantillas pueden romper ese cálculo:
 *
 * 1. Un campo por debajo del pie de la pǭgina (o una tabla recortada que
 *    deja los totales en una Y de la pǭgina anterior) produce un
 *    `currentPageIndex` negativo; al hacer `pages[-1].push(...)` pdfme
 *    revienta con "Cannot read properties of undefined (reading 'push')".
 *
 * 2. Cuando la tabla empieza tan abajo que `height - paddingTop -
 *    paddingBottom` es exactamente 0 (o menor), la división por `contentHeight`
 *    da NaN, y `NaN < 0` es false, así que el guard del caso 1 no lo cubre:
 *    `pages[NaN].push(...)` vuelve a reventar con el mismo mensaje. Forzar
 *    una altura de contenido mínima de 0.1pt lo evita: la tabla se parte
 *    fila a fila entre páginas, como ya ocurre con alturas positivas mínimas.
 *
 * La tabla adaptativa de `plantilla.ts` evita el caso real; esto es la red
 * de seguridad para plantillas editadas a mano.
 *
 * Idempotente: si los guards ya estǭn, no toca nada.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const fichero = join(raiz, 'node_modules', '@pdfme', 'common', 'dist', 'index.js');
const GUARD_PAGINA_NEGATIVA = 'if (currentPageIndex < 0) currentPageIndex = 0;';
const GUARD_ALTURA = 'if (!(contentHeight > 0)) contentHeight = 0.1;';
const ANCLA_ALTURA = '\tconst dynamicHeights = dynamicLayout.heights;\n';
const ANCLA_PAGINA_NEGATIVA = 'if (currentYInPage < 0) currentYInPage = 0;';

try {
  const codigo = readFileSync(fichero, 'utf8');
  let salida = codigo;
  if (codigo.includes(GUARD_PAGINA_NEGATIVA) && codigo.includes(GUARD_ALTURA)) {
    console.log('[pdfme] Ya estǭ parcheado; se omite.');
    process.exit(0);
  }
  if (!salida.includes(ANCLA_PAGINA_NEGATIVA) || !salida.includes(ANCLA_ALTURA)) {
    console.error('[pdfme] No se encuentran los puntos de anclaje; revisa la versi��n del paquete.');
    process.exit(1);
  }
  if (!salida.includes(GUARD_PAGINA_NEGATIVA)) {
    salida = salida.replace(ANCLA_PAGINA_NEGATIVA, `${ANCLA_PAGINA_NEGATIVA}\n\t${GUARD_PAGINA_NEGATIVA}`);
  }
  if (!salida.includes(GUARD_ALTURA)) {
    salida = salida.replace(ANCLA_ALTURA, `${ANCLA_ALTURA}\t${GUARD_ALTURA}\n`);
  }
  writeFileSync(fichero, salida);
  console.log('[pdfme] Guards de pǭgina negativa y de altura de contenido a��adidos.');
} catch (err) {
  // En un postinstall con dependencias a medio instalar puede no existir.
  console.warn('[pdfme] No se pudo parchear; se omite.', err.message);
  process.exit(0);
}
