/**
 * Genera los iconos de la app a partir de un único dibujo de la marca (la K con
 * la estrella), para que el logo de la web, el del móvil y el favicon sean el mismo.
 *
 *   public/klima-mark.svg          logo con esquinas redondeadas (web)
 *   src/app/apple-icon.png         180 × 180, iPhone/iPad («Añadir a pantalla de inicio»)
 *   public/icon-192.png, -512.png  Android y PWA, a sangre (el sistema recorta)
 *   public/icon-maskable-*.png     igual pero con margen: Android lo recorta en círculo
 *   src/app/favicon.ico            16, 32 y 48 px
 *   electron/icon.ico              16, 32, 48 y 256 px (escritorio)
 *   ../klima-android/…             icono adaptable de Android (vector): fondo + K con estrella
 *
 * La K es una sola pieza: el brazo de abajo sale del de arriba, sin muescas ni
 * huecos en la unión (a tamaño de icono esas muescas se veían como un píxel suelto),
 * y la estrella no toca el brazo.
 *
 * Uso: node scripts/generar-iconos.mjs
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

const FONDO = '#1a1216';
const LETRA = '#fbf6f2';
const ACENTO = '#c9407a';

const K = 'M19 16H26V29.6L38.2 16H47.4L34.6 30.2L47.6 48H38.4L29.52 35.83L26 39.74V48H19Z';

function estrella(cx, cy, r, ri) {
  const p = [];
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI / 4) * i - Math.PI / 2;
    const d = i % 2 ? ri : r;
    p.push(`${(cx + d * Math.cos(a)).toFixed(2)} ${(cy + d * Math.sin(a)).toFixed(2)}`);
  }
  return `M${p.join('L')}Z`;
}
const ESTRELLA = estrella(51.8, 12.2, 6.1, 1.95);

/** escala: tamaño del dibujo dentro del lienzo (1 = como en el logo; < 1 deja margen). */
function svg({ esquinas, escala = 1 }) {
  const t = 32 * (1 - escala);
  return `<svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Klima Solutions">
  <rect width="64" height="64"${esquinas ? ' rx="18"' : ''} fill="${FONDO}"/>
  <g transform="translate(${t} ${t}) scale(${escala})">
    <path d="${K}" fill="${LETRA}"/>
    <path d="${ESTRELLA}" fill="${ACENTO}"/>
  </g>
</svg>
`;
}

async function png(codigo, lado, ruta) {
  await sharp(Buffer.from(codigo), { density: (72 * lado) / 64 })
    .resize(lado, lado)
    .png({ compressionLevel: 9 })
    .toFile(join(raiz, ruta));
}

/** .ico con un PNG por tamaño dentro (lo admiten Windows Vista en adelante y todos los navegadores). */
async function ico(codigo, lados, ruta) {
  const pngs = await Promise.all(
    lados.map((l) => sharp(Buffer.from(codigo), { density: (72 * l) / 64 }).resize(l, l).png().toBuffer()),
  );
  const cab = Buffer.alloc(6 + 16 * lados.length);
  cab.writeUInt16LE(1, 2);
  cab.writeUInt16LE(lados.length, 4);
  let desplazamiento = cab.length;
  lados.forEach((l, i) => {
    const e = 6 + 16 * i;
    cab.writeUInt8(l >= 256 ? 0 : l, e);
    cab.writeUInt8(l >= 256 ? 0 : l, e + 1);
    cab.writeUInt16LE(1, e + 4);
    cab.writeUInt16LE(32, e + 6);
    cab.writeUInt32LE(pngs[i].length, e + 8);
    cab.writeUInt32LE(desplazamiento, e + 12);
    desplazamiento += pngs[i].length;
  });
  writeFileSync(join(raiz, ruta), Buffer.concat([cab, ...pngs]));
}

/**
 * Icono adaptable de Android (API 26+): el sistema pone el fondo, recorta con la
 * forma del fabricante y solo garantiza visible el círculo central de 66 de 108 dp.
 * La K se escala para caber ahí con el mismo margen que el icono «maskable».
 */
function android() {
  const res = join(raiz, '..', 'klima-android', 'app', 'src', 'main', 'res');
  if (!existsSync(res)) return;
  const escala = ((108 * 0.74) / 64) * (33 / 108 / 0.4);
  const desp = 54 - 32 * escala;
  mkdirSync(join(res, 'drawable'), { recursive: true });
  mkdirSync(join(res, 'mipmap-anydpi-v26'), { recursive: true });
  writeFileSync(
    join(res, 'drawable', 'ic_launcher_foreground.xml'),
    `<?xml version="1.0" encoding="utf-8"?>
<!-- Generado por facturacion-app/scripts/generar-iconos.mjs: no editar a mano. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <group
        android:translateX="${desp.toFixed(3)}"
        android:translateY="${desp.toFixed(3)}"
        android:scaleX="${escala.toFixed(4)}"
        android:scaleY="${escala.toFixed(4)}">
        <path android:fillColor="${LETRA}" android:pathData="${K}" />
        <path android:fillColor="${ACENTO}" android:pathData="${ESTRELLA}" />
    </group>
</vector>
`,
  );
  writeFileSync(
    join(res, 'mipmap-anydpi-v26', 'ic_launcher.xml'),
    `<?xml version="1.0" encoding="utf-8"?>
<!-- Generado por facturacion-app/scripts/generar-iconos.mjs: no editar a mano. -->
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/icono_fondo" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
    <monochrome android:drawable="@drawable/ic_launcher_foreground" />
</adaptive-icon>
`,
  );
}

const logo = svg({ esquinas: true });
const aSangre = svg({ esquinas: false, escala: 0.92 });
const conMargen = svg({ esquinas: false, escala: 0.74 });

writeFileSync(join(raiz, 'public', 'klima-mark.svg'), logo);
await png(aSangre, 180, 'src/app/apple-icon.png');
await png(aSangre, 192, 'public/icon-192.png');
await png(aSangre, 512, 'public/icon-512.png');
await png(conMargen, 192, 'public/icon-maskable-192.png');
await png(conMargen, 512, 'public/icon-maskable-512.png');
await ico(logo, [16, 32, 48], 'src/app/favicon.ico');
await ico(logo, [16, 32, 48, 256], 'electron/icon.ico');
android();
console.log('Iconos generados.');
