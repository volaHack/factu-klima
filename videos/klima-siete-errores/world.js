// El mundo: un tablero de seis bloques (uno por capítulo), cada bloque una pila de cinco tarjetas. Los bloques están un
// poco girados, como papeles clavados en una pared; la cámara gira con cada uno para verlo derecho. Al final las 30
// tarjetas vuelan y forman el logo: cada capítulo es una columna y cada dolor una fila.
export const C = {
  ink: '#1a1216', paper: '#fbf6f2', papel: '#f8f1e9', blush: '#f2e7e0',
  rose: '#b02a5c', rose6: '#9c2856', rose7: '#7a1f44', spark: '#c9407a',
  pink: '#f6b9cf', pink2: '#f0a8c4', pink1: '#fbd7e3',
  wine: '#4c1a28', wine2: '#3a1420', deep: '#230c14', deeper: '#160810',
  txt2: '#4a3a40', txt3: '#6b5a60', muted: '#6f5d63',
  ok: '#1e7a45', bad: '#b8261f', red: '#ff4d57',
};

// el logo de la app (klima-mark.svg, caja de 64): la K y la chispa
export const KPATH = [[19, 16], [26, 16], [26, 29.6], [38.2, 16], [47.4, 16], [34.6, 30.2], [47.6, 48], [38.4, 48], [29.52, 35.83], [26, 39.74], [26, 48], [19, 48]];
export const SPARKP = [[51.8, 6.1], [53.18, 10.82], [57.9, 12.2], [53.18, 13.58], [51.8, 18.3], [50.42, 13.58], [45.7, 12.2], [50.42, 10.82]];
export const kPath = (g, s, ox = 0, oy = 0) => { g.beginPath(); KPATH.forEach(([x, y], i) => i ? g.lineTo(ox + x * s, oy + y * s) : g.moveTo(ox + x * s, oy + y * s)); g.closePath(); };
export const sparkPath = (g, cx, cy, r) => {   // la chispa centrada en (cx, cy) con radio exterior r
  g.beginPath();
  SPARKP.forEach(([x, y], i) => { const px = cx + (x - 51.8) / 6.1 * r, py = cy + (y - 12.2) / 6.1 * r; i ? g.lineTo(px, py) : g.moveTo(px, py); });
  g.closePath();
};

// ——— las tarjetas y los bloques ———
export const CARD = { w: 860, h: 210, r: 22, gap: 24 };
export const BLOCK_H = 5 * CARD.h + 4 * CARD.gap;               // 1146
export const PIV = [CARD.w / 2, 513];                           // el centro de un bloque contando el título de encima
const COLX = [0, 1220], ROWY = [0, 1700, 3400];
const PLACE = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 2], [1, 2]];   // capítulo → (columna, fila): la cámara va en zigzag
const ROT = [-.034, .029, -.024, .038, -.03, .022];
export const BLOCKS = PLACE.map(([c, r], k) => ({ x: COLX[c] + PIV[0], y: ROWY[r] + PIV[1], rot: ROT[k] }));   // (x, y) = pivote

// de coordenadas del bloque k (arriba a la izquierda de la primera tarjeta = 0, 0) al mundo
export function blockToWorld(k, [lx, ly]) {
  const b = BLOCKS[k], dx = lx - PIV[0], dy = ly - PIV[1], c = Math.cos(b.rot), s = Math.sin(b.rot);
  return [b.x + dx * c - dy * s, b.y + dx * s + dy * c];
}
export const cardTop = i => i * (CARD.h + CARD.gap);
export const cardCenter = (k, i) => blockToWorld(k, [CARD.w / 2, cardTop(i) + CARD.h / 2]);
export const badgeLocal = i => [CARD.w - 74, cardTop(i) + CARD.h / 2];
export const badgeWorld = (k, i) => blockToWorld(k, badgeLocal(i));

// el tablero entero (para el plano general)
export const BOARD = { x: (COLX[1] + CARD.w) / 2, y: (ROWY[2] + BLOCK_H - 130) / 2 };

// ——— el logo que forman las 30 al final: 6 columnas (capítulos) × 5 filas, casi cuadrado ———
export const LOGO = { cols: 6, rows: 5, tw: 208, th: 250 };
LOGO.w = LOGO.cols * LOGO.tw; LOGO.h = LOGO.rows * LOGO.th;   // 1248 × 1250
LOGO.x = BOARD.x - LOGO.w / 2; LOGO.y = BOARD.y - LOGO.h / 2 + 40;
LOGO.s = LOGO.w / 64;                                          // la caja de 64 del SVG, a esta escala
LOGO.r = 18 * LOGO.s;
export const tileRect = (k, i, gap = 0) => {                   // la casilla del capítulo k, fila i (con hueco)
  const x = LOGO.x + k * LOGO.tw, y = LOGO.y + i * LOGO.th, gx = (k - 2.5) * gap, gy = (i - 2) * gap;
  return [x + gx, y + gy, LOGO.tw, LOGO.th];
};
export const SPARKW = [LOGO.x + 51.8 * LOGO.s, LOGO.y + 12.2 * LOGO.s];

// ——— encuadres de cámara: centro en el mundo, zoom y giro ———
// en los capítulos, el bloque sale derecho (la cámara gira lo que gira él) y algo por debajo del centro de la pantalla
const Z = .9, OFF = [20, -30];
const chapterPose = (k, z) => {
  const b = BLOCKS[k], c = Math.cos(b.rot), s = Math.sin(b.rot), ux = OFF[0] / z, uy = OFF[1] / z;
  return { x: b.x + ux * c - uy * s, y: b.y + ux * s + uy * c, z, r: -b.rot };
};
export const POSES = {
  hook0: { x: BOARD.x, y: -130 - (1130 - 960) / .366, z: .366, r: 0 }, hook: { x: BOARD.x, y: -130 - (1120 - 960) / .384, z: .384, r: 0 },
  board: { x: BOARD.x, y: BOARD.y, z: .38, r: 0 },
  logo: { x: BOARD.x, y: LOGO.y + LOGO.h / 2 + 30, z: .43, r: 0 },
  end: { x: BOARD.x, y: LOGO.y + LOGO.h / 2 + (960 - 760) / .37, z: .37, r: 0 },
};
for (let k = 0; k < 6; k++) { POSES[`c${k}`] = chapterPose(k, Z); POSES[`c${k}b`] = chapterPose(k, Z * 1.035); }
