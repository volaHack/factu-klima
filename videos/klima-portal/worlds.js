// worlds.js — el bar en sus tres paletas (sábado, fin de trimestre, con Klimafacturas), el portal y el papel.
// Escenario: 1080×1920. La pared y el suelo se juntan en y = 1250; la barra va de x = −200 a 700, con la
// encimera en y = 1140 y el frente hasta y = 1560. Paco se pone delante, a la derecha; Nuria, detrás.
import { clamp, lerp, hash, vnoise, TAU, ss } from '/core/lib.js';
import { INK, g, push, pop, translate, rotate, scale, shape, fillOnly, stroke, ell, arc, spline, rr, rect, noodle, quad, dot, text, bands } from './toon.js';
import { PAL, kMark, tpv } from './chars.js';

export const PALS = {
  sab: { wall: '#e2a93b', wallS: '#c98f26', tile: '#2f7f86', tileL: '#3b97a0', grout: '#215c61', floor: '#6b4a33', floorS: '#5a3d29', counter: '#7a4a2c', top: '#a8703f', counterS: '#62391f', shelf: '#5a3d29', board: '#2c3a33', boardT: '#f3e3c3' },
  trim: { wall: '#c9cdb8', wallS: '#b2b79f', tile: '#8e9a7d', tileL: '#a3ae92', grout: '#6f7a61', floor: '#9a9a8a', floorS: '#86877a', counter: '#7d7f70', top: '#a3a593', counterS: '#66685b', shelf: '#6f7166', board: '#5d6253', boardT: '#e7e9dc' },
  norm: { wall: '#f2ebe3', wallS: '#e4d8cc', tile: '#3a0f1e', tileL: '#5a1d33', grout: '#250812', floor: '#d9cabd', floorS: '#c8b6a6', counter: '#3a0f1e', top: '#b8285f', counterS: '#250812', shelf: '#b8a596', board: '#3a0f1e', boardT: '#f2ebe3' },
};
export const PORTAL = [560, 640];
export const LEVER = [660, 1140];

// —— fondo: pared, azulejos, estante, reloj, pizarra, suelo ——
export function barBack(t, mode = 'sab', { clock = 14.5 } = {}) {
  const C = PALS[mode];
  fillOnly(rect(-2000, -2000, 5000, 3250), C.wall, { boil: 0 });
  for (let i = 0; i < 6; i++) fillOnly(rect(-2000 + i * 600, -2000, 260, 3250), C.wallS, { boil: .2 });   // bandas de pintura
  fillOnly(rect(-2000, 860, 5000, 390), C.tile, { boil: 0 });
  for (let r = 0; r < 5; r++) for (let c = -4; c < 16; c++) { const x = c * 90 + (r % 2) * 45, y = 868 + r * 76; if ((c + r) % 3 === 0) fillOnly(rect(x + 4, y + 4, 82, 68), C.tileL, { boil: .2 }); }
  for (let r = 0; r <= 5; r++) stroke([[-2000, 864 + r * 76], [3000, 864 + r * 76]], 4, { line: C.grout, boil: .3 });
  stroke([[-2000, 860], [3000, 860]], 7);
  fillOnly(rect(-2000, 1250, 5000, 2000), C.floor, { boil: 0 });
  for (let i = 0; i < 12; i++) stroke([[-400 + i * 150, 1250], [-900 + i * 260, 3000]], 4, { line: C.floorS, boil: .3 });
  stroke([[-2000, 1250], [3000, 1250]], 7);
  // estante con botellas
  shape(rect(-40, 470, 420, 26), { fill: C.shelf, lw: 6 });
  const bc = mode === 'norm' ? ['#b8285f', '#3a0f1e', '#e9dccf', '#7a4a5c'] : mode === 'trim' ? ['#8e9a7d', '#6f7a61', '#b2b79f', '#a3ae92'] : ['#7a3b1c', '#2e5d3a', '#d8e6e0', '#9c2b2b'];
  for (let i = 0; i < 6; i++) { const x = 10 + i * 62, h = 120 + hash(i * 3.3) * 50; push(); translate(x, 470); shape(spline([[-18, 0], [-20, -h * .6], [-8, -h * .75], [-7, -h], [7, -h], [8, -h * .75], [20, -h * .6], [18, 0]]), { fill: bc[i % 4], lw: 6, shade: () => fillOnly(rect(4, -h, 30, h), 'rgba(0,0,0,.15)', { boil: .2 }) }); pop(); }
  // reloj de pared
  push(); translate(930, 360);
  shape(ell(0, 0, 70, 70, 40), { fill: '#fbf6ea', lw: 7 });
  const hh = (clock / 12) * TAU - Math.PI / 2, mm = (clock % 1) * TAU - Math.PI / 2;
  stroke([[0, 0], [Math.cos(hh) * 34, Math.sin(hh) * 34]], 8); stroke([[0, 0], [Math.cos(mm) * 52, Math.sin(mm) * 52]], 6); dot(0, 0, 7);
  pop();
  // pizarra del menú
  push(); translate(880, 660); rotate(.03);
  shape(rr(-130, -110, 260, 220, 14), { fill: C.board, lw: 7 });
  text(mode === 'trim' ? 'IVA 21 %' : 'MENÚ', 0, -56, { font: '800 44px "Baloo 2"', fill: C.boardT });
  text(mode === 'trim' ? 'modelo 303' : 'del día', 0, -6, { font: '700 34px "Baloo 2"', fill: C.boardT });
  text(mode === 'trim' ? '¿¿??' : '12,50 €', 0, 56, { font: '800 46px "Baloo 2"', fill: mode === 'norm' ? '#f2b3c8' : '#f2c14e' });
  pop();
}

// —— barra: encimera (detrás de Nuria) y frente (delante de ella) ——
export function counterTop(mode) {
  const C = PALS[mode];
  shape(rect(-300, 1120, 1000, 44), { fill: C.top, lw: 7 });
}
export function counterFront(mode) {
  const C = PALS[mode];
  shape(rect(-300, 1162, 1000, 400), { fill: C.counter, lw: 7, shade: () => { fillOnly(rect(560, 1150, 200, 420), C.counterS, { boil: .3 }); for (let i = 0; i < 5; i++) stroke([[-300 + i * 200, 1200], [-300 + i * 200, 1540]], 4, { line: C.counterS }); } });
  shape(rect(-300, 1120, 1000, 44), { fill: C.top, lw: 7 });
}
// palanca de grifo que abre el portal. pull: 0 arriba → 1 bajada
export function lever(pull = 0, mode = 'sab') {
  push(); translate(LEVER[0], LEVER[1]);
  shape(rr(-26, -110, 52, 112, 12), { fill: mode === 'norm' ? '#d9cabd' : '#b8b2a6', lw: 6 });
  shape(rr(-40, -130, 80, 30, 10), { fill: '#8d96a3', lw: 6 });
  push(); translate(0, -120); rotate(lerp(-.15, 1.15, pull));
  shape(rr(-14, -150, 28, 150, 12), { fill: '#d23a44', lw: 6 });
  shape(ell(0, -150, 24, 24, 20), { fill: '#d23a44', lw: 6 });
  pop(); pop();
}
// la mesita moderna que sustituye al TPV en el mundo normal: tablet con el logo
export function tabletStand(x, y, s) {
  push(); translate(x, y); scale(s);
  shape([[-30, 0], [30, 0], [16, -60], [-16, -60]], { fill: '#d9cabd', lw: 6 });
  push(); translate(0, -150); rotate(-.06);
  shape(rr(-150, -100, 300, 200, 22), { fill: '#1d1013', lw: 7 });
  shape(rr(-134, -86, 268, 172, 14), { fill: '#fbf8f4', lw: 4 });
  kMark(-116, -70, 56);
  text('Ventas de hoy', -40, -46, { font: '700 22px "Baloo 2"', fill: '#7b6970', align: 'left' });
  text('1.284,60 €', -40, -10, { font: '800 34px "Baloo 2"', fill: '#1d1013', align: 'left' });
  for (let i = 0; i < 7; i++) { const h = [20, 34, 60, 44, 28, 52, 38][i]; fillOnly(rect(-110 + i * 30, 70 - h, 20, h), i === 2 ? '#b8285f' : '#3a0f1e', { boil: .2 }); }
  pop(); pop();
}

// —— el portal: el único brillo de la película ——
export function portal(cx, cy, r, t, { open = 1, sx = .8, spin = 1, wash = true } = {}) {
  if (open <= .001) return;
  const R = r * open;
  push(); translate(cx, cy); scale(sx, 1);
  if (wash) { fillOnly(ell(0, 0, R * 1.6, R * 1.5, 48), 'rgba(63,240,224,.13)', { boil: .6 }); fillOnly(ell(0, 0, R * 1.3, R * 1.24, 48), 'rgba(63,240,224,.17)', { boil: .6 }); }
  const rim = []; const N = 22;
  for (let i = 0; i < N; i++) { const a = i / N * TAU, k = 1 + .09 * (vnoise(i * 1.7 + t * 3) - .5) * 2 + .05 * Math.sin(a * 5 + t * 6); rim.push([Math.cos(a) * R * k, Math.sin(a) * R * k]); }
  shape(spline(rim), {
    fill: PAL.glow, lw: 8, shade: () => {
      fillOnly(ell(0, 0, R * .9, R * .9, 40), '#6ff6ea', { boil: .3 });
      for (let k = 0; k < 5; k++) {
        const p1 = [], p2 = [];
        for (let j = 0; j <= 22; j++) { const u = j / 22, rr_ = R * (1 - u) * .95, a = k / 5 * TAU + u * 3.6 + t * 2.6 * spin; p1.push([Math.cos(a) * rr_, Math.sin(a) * rr_]); const a2 = a + .55 * (1 - u * .7); p2.push([Math.cos(a2) * rr_, Math.sin(a2) * rr_]); }
        fillOnly([...p1, ...p2.reverse()], k % 2 ? PAL.glowL : PAL.glowD, { boil: .4 });
      }
      fillOnly(ell(0, 0, R * .3, R * .3, 24), '#d9fffb', { boil: .5 });
      fillOnly(ell(0, 0, R * .14, R * .14, 16), '#ffffff', { boil: .5 });
    }
  });
  for (let i = 0; i < 12; i++) { const a = hash(i) * TAU + t * (1.5 + hash(i + 4) * 2), d = R * (1.05 + .25 * ((t * .8 + hash(i + 9)) % 1)); dot(Math.cos(a) * d, Math.sin(a) * d, 5 + hash(i + 2) * 4, i % 3 ? PAL.glowL : '#ffffff'); }
  if (open > .6) for (let i = 0; i < 3; i++) { const u = (t * .9 + i / 3) % 1, x = (-.4 + i * .4) * R, y0 = R * .92; shape(spline([[x - 10, y0], [x + 10, y0], [x + 7, y0 + 20 + u * 40], [x, y0 + 32 + u * 50], [x - 7, y0 + 20 + u * 40]]), { fill: PAL.glow, lw: 6 }); }
  pop();
}

// —— papel: hojas volando y la montaña que crece ——
export function sheet(x, y, a, s = 1, col = '#fbf8ef') {
  push(); translate(x, y); rotate(a); scale(s);
  shape(rr(-34, -44, 68, 88, 4), { fill: col, lw: 5, shade: () => { for (let i = 0; i < 4; i++) fillOnly(rect(-24, -30 + i * 16, 40 - (i % 2) * 14, 5), '#c9c2b2', { boil: .2 }); } });
  pop();
}
// h: altura máxima de la montaña (px); centro sobre Paco
export function pile(h, t, { cx = 780 } = {}) {
  if (h <= 2) return;
  const base = 1610, pts = [[-400, 2200], [-400, base]];
  for (let i = 0; i <= 24; i++) { const x = -400 + i * 75, d = (x - cx) / 620, y = base - h * Math.exp(-d * d * 2.2) - Math.sin(i * 1.7) * 10 * Math.min(1, h / 80); pts.push([x, y]); }
  pts.push([1500, base], [1500, 2200]);
  shape(pts, { fill: '#f4f1e6', lw: 7, shade: () => { for (let i = 0; i < 40; i++) { const x = -300 + hash(i * 2.7) * 1700, y = base - hash(i * 5.1) * h * .9; fillOnly(rr(x, y, 60 + hash(i) * 30, 8, 3), '#cbc4b3', { boil: .2 }); } } });
  for (let i = 0; i < 16; i++) { const x = -200 + hash(i * 9.1) * 1400, d = (x - cx) / 620, y = base - h * Math.exp(-d * d * 2.2) + 14; sheet(x, y, (hash(i * 3.7) - .5) * 1.4, .9); }
}
