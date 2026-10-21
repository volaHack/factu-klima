// El mundo: todo está colocado sobre la K del logo. La K de klima-mark.svg (caja de 64) a escala S: la cadena de
// cinco facturas es el asta, las tarjetas de cobro, contabilidad y Hacienda van por el brazo de arriba y dos más por la
// pierna. Cuando la cámara sale lejos al final, lo que se ve es la K.
export const C = {
  ink: '#1a1216', paper: '#fbf6f2', papel: '#f8f1e9', blush: '#f2e7e0',
  rose: '#b02a5c', rose6: '#9c2856', rose7: '#7a1f44', spark: '#c9407a',
  pink: '#f6b9cf', pink2: '#f0a8c4', pink1: '#fbd7e3',
  wine: '#4c1a28', wine2: '#3a1420', deep: '#230c14', deeper: '#160810',
  txt2: '#4a3a40', txt3: '#6b5a60', muted: '#6f5d63',
  ok: '#1e7a45', okBg: 'rgba(30,122,69,.14)', warn: '#92660a', warnBg: 'rgba(217,158,26,.18)',
  bad: '#b8261f', badBg: 'rgba(220,38,38,.13)', red: '#ff4d57',
};

export const S = 140;                       // unidades de mundo por unidad de la caja del logo
export const KPATH = [[19, 16], [26, 16], [26, 29.6], [38.2, 16], [47.4, 16], [34.6, 30.2], [47.6, 48], [38.4, 48], [29.52, 35.83], [26, 39.74], [26, 48], [19, 48]];
export const SPARKP = [[51.8, 6.1], [53.18, 10.82], [57.9, 12.2], [53.18, 13.58], [51.8, 18.3], [50.42, 13.58], [45.7, 12.2], [50.42, 10.82]];
export const SPARKC = [51.8 * S, 12.2 * S];
export const TILE = { x: 0, y: 0, w: 64 * S, h: 64 * S, r: 18 * S };

// las facturas: del asta de la K (x 19–26, y 16–48). La más nueva arriba, bajo el cabezal
export const REC = { w: 600, h: 780, x: 22.5 * S, top: 16 * S, gap: (32 * S - 5 * 780) / 4 };
export const recTop = i => REC.top + (4 - i) * (REC.h + REC.gap);   // i = 0 (la más antigua) … 4 (la más nueva)
export const recX = () => REC.x - REC.w / 2;

// por el brazo de arriba (de la unión con el asta hacia la esquina) y por la pierna
const arm = u => [(30.3 + 12.5 * u) * S, (29.9 - 13.9 * u) * S];
const leg = u => [(27.76 + 15.24 * u) * S, (37.785 + 10.215 * u) * S];
export const CARD = {
  cobro: { c: arm(.22), w: 680, h: 640 },
  conta: { c: arm(.55), w: 720, h: 600 },
  hacienda: { c: arm(.86), w: 680, h: 600 },
  tpv: { c: leg(.45), w: 560, h: 520 },
  linea: { c: leg(.85), w: 600, h: 440 },
};

// encuadres de cámara: centro en el mundo y zoom (1 = un píxel por unidad)
const HOOK = { x: REC.x, y: REC.top + 240 };
export const POSES = {
  hook0: { ...HOOK, z: .93 }, hook: { ...HOOK, z: 1 },
  hash: { x: recX() + 205, y: REC.top + 470, z: 2.6 }, hash2: { x: recX() + 205, y: REC.top + 470, z: 2.72 },
  chain: { x: REC.x, y: REC.top + (960 - 470) / .34, z: .34 },
  chain1: { x: REC.x, y: REC.top + (960 - 470) / .34, z: .345 },
  tamper: { x: REC.x, y: recTop(1) + 170, z: 1.15 }, tamper2: { x: REC.x, y: recTop(1) + 170, z: 1.18 },
  chainV: { x: REC.x, y: REC.top + (960 - 470) / .34, z: .36 },
  cobro: { x: CARD.cobro.c[0], y: CARD.cobro.c[1] - 110, z: 1.28 }, cobro2: { x: CARD.cobro.c[0], y: CARD.cobro.c[1] - 110, z: 1.31 },
  conta: { x: CARD.conta.c[0], y: CARD.conta.c[1] - 110, z: 1.28 }, conta2: { x: CARD.conta.c[0], y: CARD.conta.c[1] - 110, z: 1.31 },
  hacienda: { x: CARD.hacienda.c[0], y: CARD.hacienda.c[1] - 110, z: 1.28 }, hacienda2: { x: CARD.hacienda.c[0], y: CARD.hacienda.c[1] - 110, z: 1.31 },
  reveal: { x: 33.3 * S, y: 32 * S + 60 / .19, z: .19 }, reveal2: { x: 33.3 * S, y: 32 * S + 60 / .182, z: .182 },
  logo: { x: 32 * S, y: 32 * S + 400 / .0446, z: .0446 },
};

export const kPath = (g, s = S) => { g.beginPath(); KPATH.forEach(([x, y], i) => i ? g.lineTo(x * s, y * s) : g.moveTo(x * s, y * s)); g.closePath(); };
export const sparkPath = (g, cx, cy, r) => {   // la chispa del logo centrada en (cx, cy) con radio exterior r
  g.beginPath();
  SPARKP.forEach(([x, y], i) => { const px = cx + (x - 51.8) / 6.1 * r, py = cy + (y - 12.2) / 6.1 * r; i ? g.lineTo(px, py) : g.moveTo(px, py); });
  g.closePath();
};
