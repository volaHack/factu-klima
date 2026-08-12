/**
 * Copia el worker de pdf.js a `public/pdfjs/`.
 *
 * pdf.js hace el trabajo pesado en un worker aparte y necesita su URL. Se
 * podría dejar que lo resolviera el empaquetador con `new URL(...)`, pero
 * eso se comporta distinto en webpack y en Turbopack, y este proyecto usa
 * los dos (Turbopack en `next dev`, webpack en `next build --webpack`). Un
 * fichero estático servido desde `public/` funciona igual en desarrollo, en
 * Vercel y dentro de Electron.
 *
 * Se ejecuta solo antes de `dev` y de `build`, y también tras `npm install`.
 */

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const origen = join(raiz, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs');
const carpetaDestino = join(raiz, 'public', 'pdfjs');
const destino = join(carpetaDestino, 'pdf.worker.min.mjs');

if (!existsSync(origen)) {
  // En un `postinstall` con dependencias a medio instalar esto puede no
  // existir todavía; no es motivo para tumbar la instalación entera.
  console.warn('[pdfjs] No se encuentra el worker en node_modules; se omite la copia.');
  process.exit(0);
}

mkdirSync(carpetaDestino, { recursive: true });
copyFileSync(origen, destino);
console.log('[pdfjs] Worker copiado a public/pdfjs/pdf.worker.min.mjs');
