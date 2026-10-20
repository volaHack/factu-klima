// Las tarjetas. Cara A: el dolor, en papel térmico, con su número y una ✕. Cara B: la solución, en rosa de la marca, con
// el dolor tachado encima y una ✓. Cara C (al final): su trozo del logo. Las caras se pintan una vez en sprites y se
// dibujan en franjas con perspectiva cuando la tarjeta gira, para que el giro tenga profundidad de verdad.
import { C, CARD, LOGO, kPath, sparkPath } from './world.js';
import { text, setFont, measure, rr, clamp, lerp, ease, hash } from './lib.js';

const RES = 1.25;                               // los sprites, un poco por encima del tamaño de mundo
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.ceil(w); c.height = Math.ceil(h); return c; };
const W = CARD.w, H = CARD.h;

// reparte un texto en líneas que quepan en maxW a ese cuerpo
function wrap(g, s, w, size, maxW, ls = 0) {
  const words = s.split(' '), lines = []; let cur = '';
  for (const wd of words) { const t = cur ? cur + ' ' + wd : wd; if (cur && measure(g, t, w, size, 'Plex', false, ls) > maxW) { lines.push(cur); cur = wd; } else cur = t; }
  if (cur) lines.push(cur);
  return lines;
}
// el cuerpo más grande (entre lo y hi) con el que el texto cabe en maxLines líneas
function fit(g, s, w, hi, lo, maxW, maxLines, ls = k => 0) {
  for (let size = hi; size >= lo; size -= 1) { const lines = wrap(g, s, w, size, maxW, ls(size)); if (lines.length <= maxLines) return { size, lines }; }
  return { size: lo, lines: wrap(g, s, w, lo, maxW, ls(lo)) };
}

const X0 = 112, TXW = 612;                      // dónde empieza el texto y cuánto puede ocupar (deja sitio a la insignia)
const BX = W - 74, BY = H / 2;                  // la insignia ✕ / ✓

function paperFace(q) {
  const gr = q.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#fdf9f4'); gr.addColorStop(.55, C.papel); gr.addColorStop(1, '#efe2d6');
  q.fillStyle = gr; rr(q, 0, 0, W, H, CARD.r); q.fill();
  q.save(); rr(q, 0, 0, W, H, CARD.r); q.clip();
  q.fillStyle = 'rgba(58,20,32,.028)'; for (let y = 0; y < H; y += 3) q.fillRect(0, y, W, 1);
  const cv = q.createLinearGradient(0, 0, 0, H); cv.addColorStop(0, 'rgba(255,255,255,.5)'); cv.addColorStop(.12, 'rgba(255,255,255,0)'); cv.addColorStop(.85, 'rgba(58,20,32,0)'); cv.addColorStop(1, 'rgba(58,20,32,.08)');
  q.fillStyle = cv; q.fillRect(0, 0, W, H);
  // el raíl rosa de la cinta, en el margen
  q.fillStyle = 'rgba(176,42,92,.85)'; q.fillRect(0, 0, 10, H);
  q.restore();
}
function roseFace(q) {
  const gr = q.createLinearGradient(0, 0, W * .6, H * 1.6); gr.addColorStop(0, '#bf3769'); gr.addColorStop(.6, C.rose); gr.addColorStop(1, C.rose6);
  q.fillStyle = gr; rr(q, 0, 0, W, H, CARD.r); q.fill();
  q.save(); rr(q, 0, 0, W, H, CARD.r); q.clip();
  const hl = q.createLinearGradient(0, 0, 0, H); hl.addColorStop(0, 'rgba(255,225,238,.22)'); hl.addColorStop(.1, 'rgba(255,225,238,0)'); hl.addColorStop(1, 'rgba(60,8,28,.18)');
  q.fillStyle = hl; q.fillRect(0, 0, W, H);
  q.fillStyle = 'rgba(255,225,238,.55)'; q.fillRect(0, 0, 10, H);
  q.restore();
}
function cross(q, x, y) {
  q.save(); q.strokeStyle = 'rgba(184,38,31,.85)'; q.lineWidth = 5; q.beginPath(); q.arc(x, y, 34, 0, Math.PI * 2); q.stroke();
  q.lineCap = 'round'; q.lineWidth = 7; q.beginPath(); q.moveTo(x - 12, y - 12); q.lineTo(x + 12, y + 12); q.moveTo(x + 12, y - 12); q.lineTo(x - 12, y + 12); q.stroke(); q.restore();
}
export function check(q, x, y, r = 36, s = 1) {
  if (s <= 0) return;
  q.save(); q.translate(x, y); q.scale(s, s);
  q.fillStyle = C.paper; q.beginPath(); q.arc(0, 0, r, 0, Math.PI * 2); q.fill();
  q.strokeStyle = C.rose; q.lineWidth = r * .2; q.lineCap = 'round'; q.lineJoin = 'round';
  q.beginPath(); q.moveTo(-r * .4, r * .02); q.lineTo(-r * .1, r * .32); q.lineTo(r * .44, -r * .3); q.stroke(); q.restore();
}

// la maqueta de cada tarjeta (se calcula una vez): líneas y cuerpos de las dos caras
export function layout(g, it) {
  const p = fit(g, it.pain, 700, 50, 40, TXW, 2, s => -s * .02);
  const f = fit(g, it.fix, 700, 48, 38, TXW, 2, s => -s * .02);
  const sp = fit(g, it.pain, 600, 29, 21, TXW, 1);
  return { p, f, sp };
}

export function sprites(it, lay) {
  const pain = mk(W * RES, H * RES), fix = mk(W * RES, H * RES);
  const num = String(it.n).padStart(2, '0');
  { // cara A: el dolor
    const q = pain.getContext('2d'); q.scale(RES, RES); paperFace(q);
    text(q, num, 38, H / 2 + 11, 30, C.rose, { w: 600, fam: 'PlexMono' });
    const { size, lines } = lay.p, lh = size * 1.12, y0 = H / 2 - (lines.length - 1) * lh / 2 + size * .36;
    lines.forEach((l, j) => text(q, l, X0, y0 + j * lh, size, C.ink, { w: 700, ls: -size * .02 }));
    cross(q, BX, BY);
  }
  { // cara B: la solución, con el dolor tachado encima
    const q = fix.getContext('2d'); q.scale(RES, RES); roseFace(q);
    text(q, num, 38, H / 2 + 11, 30, C.pink1, { w: 600, fam: 'PlexMono' });
    const s = lay.sp, sy = 60, sw = measure(q, s.lines[0], 600, s.size);
    text(q, s.lines[0], X0, sy, s.size, 'rgba(251,246,242,.66)', { w: 600 });
    q.fillStyle = 'rgba(251,246,242,.8)'; q.fillRect(X0 - 4, sy - s.size * .33, sw + 8, 3);
    const { size, lines } = lay.f, lh = size * 1.1, top = 82, room = H - top - 22;
    const y0 = top + (room - (lines.length - 1) * lh) / 2 + size * .36;
    lines.forEach((l, j) => text(q, l, X0, y0 + j * lh, size, C.paper, { w: 700, ls: -size * .02 }));
    check(q, BX, BY);
  }
  return { pain, fix };
}

// el logo entero, una vez: el cuadrado tinta, la K papel y la chispa
export const LOGOSPR = (() => {
  const c = mk(LOGO.w, LOGO.h), q = c.getContext('2d');
  q.fillStyle = C.ink; rr(q, 0, 0, LOGO.w, LOGO.h, LOGO.r); q.fill();
  q.save(); rr(q, 0, 0, LOGO.w, LOGO.h, LOGO.r); q.clip();
  const gl = q.createRadialGradient(LOGO.w * .3, LOGO.h * .2, 0, LOGO.w * .3, LOGO.h * .2, LOGO.w);
  gl.addColorStop(0, 'rgba(176,42,92,.16)'); gl.addColorStop(1, 'rgba(176,42,92,0)'); q.fillStyle = gl; q.fillRect(0, 0, LOGO.w, LOGO.h);
  q.restore();
  kPath(q, LOGO.s); q.fillStyle = C.paper; q.fill();
  sparkPath(q, 51.8 * LOGO.s, 12.2 * LOGO.s, 6.1 * LOGO.s); q.fillStyle = C.spark; q.fill();
  return c;
})();

// una cara dibujada en franjas con perspectiva: theta = giro alrededor del eje horizontal (0 = de frente)
const F = 2600;
function stripes(g, img, sx, sy, sw, sh, w, h, theta, n = 14) {
  const c = Math.cos(theta), s = Math.sin(theta);
  for (let k = 0; k < n; k++) {
    const v0 = k / n, v1 = (k + 1) / n, y0 = (v0 - .5) * h, y1 = (v1 - .5) * h;
    const p0 = F / (F - y0 * s), p1 = F / (F - y1 * s), Y0 = y0 * c * p0, Y1 = y1 * c * p1, pw = (p0 + p1) / 2;
    if (Math.abs(Y1 - Y0) < .05) continue;
    const top = Math.min(Y0, Y1), hh = Math.abs(Y1 - Y0) + .6;
    g.save(); if (Y1 < Y0) { g.translate(0, Y0 + Y1); g.scale(1, -1); }
    g.drawImage(img, sx, sy + v0 * sh, sw, (v1 - v0) * sh, -w * pw / 2, top, w * pw, hh);
    g.restore();
  }
}

// una tarjeta centrada en (0, 0) del contexto actual. o: { a, b: sprites o 'logo'; theta; w, h; tile: [k, i]; shade }
export function drawCard(g, o) {
  const th = o.theta || 0, w = o.w || W, h = o.h || H, back = th > Math.PI / 2;
  const face = back ? o.b : o.a, ang = back ? th - Math.PI : th;
  const src = face === 'logo'
    ? [LOGOSPR, o.tile[0] * LOGO.tw, o.tile[1] * LOGO.th, LOGO.tw, LOGO.th]
    : [face, 0, 0, face.width, face.height];
  if (Math.abs(ang) < 1e-3) g.drawImage(src[0], src[1], src[2], src[3], src[4], -w / 2, -h / 2, w, h);
  else stripes(g, src[0], src[1], src[2], src[3], src[4], w, h, ang);
  // la luz: la cara se oscurece al ponerse de canto y brilla un instante al volver de frente
  const edge = 1 - Math.abs(Math.cos(th));
  if (edge > .01) { g.save(); g.globalAlpha = edge * .55; g.fillStyle = C.deeper; g.fillRect(-w / 2, -h / 2 * Math.abs(Math.cos(th)) - 2, w, h * Math.abs(Math.cos(th)) + 4); g.restore(); }
}

// el contrato que se rompe: la cara A partida en dos por una línea dentada; cada mitad cae girando
const TEAR = (() => { const pts = []; for (let k = 0; k <= 9; k++) pts.push([W * .52 + (hash(k * 3.3) - .5) * 70 + (k % 2 ? 22 : -22), H * k / 9]); return pts; })();
export function drawTorn(g, pain, u) {
  const halves = [[[0, 0], ...TEAR, [0, H]], [[W, 0], ...TEAR, [W, H]]];
  halves.forEach((poly, side) => {
    const sg = side ? 1 : -1, fall = u * u, out = ease.expoOut(clamp(u * 1.6));
    g.save();
    g.translate(sg * (30 + 560 * out), -40 * out + 1700 * fall);
    g.rotate(sg * (.1 + .75 * out + .6 * u) * (side ? 1.15 : 1));
    g.globalAlpha *= 1 - clamp((u - .6) / .4);
    g.beginPath(); poly.forEach(([x, y], j) => j ? g.lineTo(x - W / 2, y - H / 2) : g.moveTo(x - W / 2, y - H / 2)); g.closePath(); g.clip();
    g.drawImage(pain, -W / 2, -H / 2, W, H);
    g.restore();
  });
}
