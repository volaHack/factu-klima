/**
 * Parchea @pdfme/common para que el repaginador nunca apunte a una página
 * negativa. Cuando una plantilla tiene un campo por debajo del pie de la
 * página (o la altura de la tabla recortada deja los totales a una Y que
 * cae en la página anterior), `placeUnitsOnPages` calcula
 * `currentPageIndex = floor(startGlobalY / contentHeight)` y ese índice
 * puede ser -1; al hacer `pages[-1].push(...)` pdfme revienta con
 * "Cannot read properties of undefined (reading 'push')". El guard evita
 * que ese índice baje de 0.
 *
 * La tabla adaptativa de `plantilla.ts` evita el caso real; esto es la red
 * de seguridad para plantillas editadas a mano.
 *
 * Idempotente: si el guard ya está, no toca nada.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const fichero = join(raiz, 'node_modules', '@pdfme', 'common', 'dist', 'index.js');
const GUARD = 'if (currentPageIndex < 0) currentPageIndex = 0;';

try {
  const codigo = readFileSync(fichero, 'utf8');
  if (codigo.includes(GUARD)) {
    console.log('[pdfme] Ya está parcheado; se omite.');
    process.exit(0);
  }
  const objetivo = 'if (currentYInPage < 0) currentYInPage = 0;';
  if (!codigo.includes(objetivo)) {
    console.error('[pdfme] No se encuentra el punto de anclaje; revisa la versión del paquete.');
    process.exit(1);
  }
  writeFileSync(fichero, codigo.replace(objetivo, `${objetivo}\n\t${GUARD}`));
  console.log('[pdfme] Guard de página negativa añadido.');
} catch (err) {
  // En un postinstall con dependencias a medio instalar puede no existir.
  console.warn('[pdfme] No se pudo parchear; se omite.', err.message);
  process.exit(0);
}
