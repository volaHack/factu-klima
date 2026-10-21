// «¿Cuántas te pasan?» · reel de Klimafacturas (1080×1920, 30 fps, 62 s). Una sola toma: la cámara nunca corta.
// render(t) es una función pura de t. Cada fotograma en movimiento es la media de varios instantes dentro de un
// obturador de 180°: los látigos y los giros se emborronan como en una cámara de verdad.
import { W, H, clamp, lerp, seg, ease, spring, kick, hash, text, measure, rr } from './lib.js';
import { T, CAM, CAPTIONS, CH, snapAt, flipAt, FLIP_D, setAt, leaveAt, landAt, DUR, FPS, BPM, BAR0 } from './timeline.js';
import { C, CARD, BLOCKS, BLOCK_H, POSES, blockToWorld, cardTop, badgeWorld, BOARD, LOGO, tileRect, SPARKW } from './world.js';
import { CHAPTERS, ITEMS } from './data.js';
import { layout, sprites, drawCard, drawTorn } from './cards.js';
import { stamp, seal, sheet } from './pieces.js';
import { shockwave, glow, flapTile, glitch, spark } from './fx.js';

const cv = document.getElementById('c'), G = cv.getContext('2d');
const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
const ACC = mk(), SUB = mk(), A = ACC.getContext('2d'), B = SUB.getContext('2d');

for (const w of [500, 600, 700]) { await document.fonts.load(`${w} 40px "Plex"`); await document.fonts.load(`${w} 40px "PlexMono"`); }
const LAY = ITEMS.map(it => layout(G, it));
const SPR = ITEMS.map((it, j) => sprites(it, LAY[j]));
const SHADOW = (() => {   // la sombra blanda de una tarjeta (se pinta una vez)
  const m = 60, c = document.createElement('canvas'); c.width = CARD.w + 2 * m; c.height = CARD.h + 2 * m;
  const q = c.getContext('2d'); q.shadowColor = 'rgba(10,2,6,.75)'; q.shadowBlur = 38; q.fillStyle = '#000';
  rr(q, m, m, CARD.w, CARD.h, CARD.r); q.fill(); q.globalCompositeOperation = 'destination-out'; q.shadowColor = 'transparent'; rr(q, m, m, CARD.w, CARD.h, CARD.r); q.fill();
  return { c, m };
})();

// ——— la cámara ———
const POSE = k => POSES[k];
const HOP = .3;   // en los látigos entre bloques la cámara se separa un poco a mitad de camino: se ve que es el mismo tablero
function camBase(t) {
  let i = 0; while (i < CAM.length - 1 && t >= CAM[i + 1][0]) i++;
  const a = CAM[i], b = CAM[Math.min(i + 1, CAM.length - 1)], pa = POSE(a[1]), pb = POSE(b[1]);
  const u = b === a ? 0 : clamp((t - a[0]) / (b[0] - a[0])), e = ease[a[2]](u);
  let z = Math.exp(lerp(Math.log(pa.z), Math.log(pb.z), e)), x, y;
  if (Math.abs(Math.log(pb.z / pa.z)) > .05) {   // zoom alrededor del punto fijo de los dos encuadres: un solo gesto
    const fx = (pa.x * pa.z - pb.x * pb.z) / (pa.z - pb.z), fy = (pa.y * pa.z - pb.y * pb.z) / (pa.z - pb.z);
    x = fx - (fx - pa.x) * pa.z / z; y = fy - (fy - pa.y) * pa.z / z;
  } else { x = lerp(pa.x, pb.x, e); y = lerp(pa.y, pb.y, e); }
  const between = a[1].startsWith('c') && b[1].startsWith('c') && a[1][1] !== b[1][1];
  if (between) z *= 1 - HOP * Math.sin(Math.PI * e);
  return { x, y, z, rb: lerp(pa.r, pb.r, e) };
}
const HOLDS = CAM.slice(0, -1).map((k, i) => [k, CAM[i + 1]]).filter(([a]) => a[2] === 'hold').map(([a, b]) => [a[0], b[0]]);
const holdAt = t => Math.max(0, ...HOLDS.map(([a, b]) => clamp(seg(t, a, a + .25)) * (1 - seg(t, b, b + .2))));
const LANDS = [];
for (let i = 0; i < CAM.length - 1; i++) {
  const [, a, e] = CAM[i], [t1, b] = CAM[i + 1];
  if (a === b || e === 'lin' || e === 'hold') continue;
  const pa = POSE(a), pb = POSE(b), dx = pb.x - pa.x, dy = pb.y - pa.y, l = Math.hypot(dx, dy) || 1;
  LANDS.push({ t: t1, ux: dx / l, uy: dy / l, z: Math.sign(Math.log(pb.z / pa.z)), a: e === 'expoInOut' ? 10 : 5 });
}
const PUNCH = [];
const punch = (t, a) => PUNCH.push([t, a]);
function camera(t) {
  const c = camBase(t), hand = (1 - holdAt(t)) * (t > T.still ? 0 : 1);
  c.sx = (3.2 * Math.sin(t * 1.7) + 1.6 * Math.sin(t * 3.1 + 1.3)) * hand;
  c.sy = (2.6 * Math.sin(t * 1.4 + .5) + 1.4 * Math.sin(t * 3.7 + 2.1)) * hand;
  c.r = c.rb + .0016 * Math.sin(t * 1.2 + .8) * hand;
  let kz = 1;
  for (const Ld of LANDS) { const u = t - Ld.t; if (u < 0 || u > .7) continue; const w = Math.exp(-u * 9) * Math.sin(u * 2 * Math.PI * 5.5); c.sx -= Ld.ux * Ld.a * w; c.sy -= Ld.uy * Ld.a * w; kz *= 1 + Ld.z * .007 * w; }
  for (const [ti, a] of PUNCH) if (t >= ti && t < ti + .6) kz *= 1 + a * Math.exp(-(t - ti) * 10) * Math.cos((t - ti) * 26);
  c.kz = kz;
  return c;
}
const matrix = c => new DOMMatrix().translate(W / 2 + c.sx, H / 2 + c.sy).rotate(c.r * 180 / Math.PI).scale(c.z * c.kz).translate(-c.x, -c.y);
const proj = (M, [x, y]) => { const p = M.transformPoint(new DOMPoint(x, y)); return [p.x, p.y]; };
const zoomOf = M => Math.hypot(M.a, M.b);

// ——— cuándo cuenta cada una como resuelta (para el contador y el sonido) ———
const doneAt = it => it.n === 30 ? T.tear + .1 : flipAt(it.k, it.i) + FLIP_D * .55;
const DONE = ITEMS.map(doneAt).sort((a, b) => a - b);
const solvedBy = t => { let n = 0; for (const d of DONE) if (t >= d) n++; return n; };

// ——— el enjambre final: cada tarjeta sale cuando le toca y llega a su casilla del logo ———
const swarmGo = it => T.swarm[0] + (it.k * 5 + it.i) * .028 + hash(it.n * 9.7) * .12;
const SWARM_D = .95;

// ——— golpes de cámara y eventos de sonido (se calculan una vez) ———
const EV = [];
const ev = (t, type, o = {}) => EV.push({ t: +t.toFixed(3), type, ...o });
punch(T.hit, .045); punch(setAt(0), .03); punch(setAt(1), .035); punch(T.tear, .03); punch(T.logo, .06); punch(T.pull[1], .02);
ev(0, 'riser', { t1: T.hit }); ev(0, 'rain', { t1: 1.85 }); ev(T.hit, 'hit', { big: 1 });
ITEMS.forEach(it => ev(landAt(it.k, it.i), 'land', { n: it.n, pan: +(((it.k % 2) ? .35 : -.35) + (hash(it.n) - .5) * .3).toFixed(2) }));
ev(T.ask, 'counter', { n: 0 });
for (let i = 0; i < CAM.length - 1; i++) {   // cada movimiento de cámara suena a aire, panoramizado hacia donde va
  const [t0, a, e] = CAM[i], [t1, b] = CAM[i + 1]; if (a === b || e === 'lin' || e === 'hold') continue;
  const pa = POSE(a), pb = POSE(b), pan = clamp((pb.x - pa.x) / 1500, -.7, .7), zoom = Math.log(pb.z / pa.z);
  ev(t0, 'whoosh', { d: +(t1 - t0).toFixed(3), pan: +pan.toFixed(2), up: zoom > 0 ? 1 : 0, big: Math.abs(zoom) > .6 ? 1 : 0 });
}
ITEMS.forEach(it => {
  const pan = +(((it.k % 2) ? .25 : -.25)).toFixed(2);
  ev(snapAt(it.k, it.i), 'snap', { k: it.k, i: it.i, pan });
  if (it.n !== 30) ev(flipAt(it.k, it.i), 'flip', { k: it.k, i: it.i, pan });
  ev(doneAt(it), 'count', { n: it.n });
});
ev(setAt(0), 'stamp', { big: 1 }); ev(setAt(1), 'seal', { big: 1 });
ev(flipAt(2, 3) - .02, 'shutter'); [0, 1, 2].forEach(j => ev(setAt(2) - .05 + j * .15, 'sheet', { n: j })); ev(setAt(2) + .55, 'pop');
ev(CH[3] - .12, 'glitch', { t1: CH[3] + .4 }); ev(setAt(3), 'scan', { t1: setAt(3) + .55 });
ev(setAt(4), 'balance'); ev(setAt(4) + .62, 'snapok');
ev(flipAt(5, 1) - .26, 'beep'); ev(T.tear, 'tear');
ev(T.pull[1], 'thirty'); ev(T.swarm[0] - .3, 'swell', { t1: T.logo });
ITEMS.forEach(it => ev(swarmGo(it) + SWARM_D, 'tile', { n: it.n }));
ev(T.close[0], 'close'); ev(T.logo, 'logo'); ev(T.word, 'word'); ev(T.ctaTap, 'tap', { soft: 1 });
EV.push({ t: 0, type: 'meta', bpm: BPM, bar0: BAR0, dur: DUR, ch: CH });
EV.sort((a, b) => a.t - b.t);
window.EV = EV; window.DUR = DUR;

// ——— la chispa (el dedo de la película): claves con destino en el mundo (w) o en pantalla (s) ———
const cardEdge = (k, i, side) => blockToWorld(k, [side ? CARD.w + 30 : -30, cardTop(i) + CARD.h / 2]);
const SP = [[0, { s: [1300, -200] }, 'lin', 26, 0]];
for (let k = 0; k < 6; k++) {
  SP.push([flipAt(k, 0) - .6, { s: [1300, 560] }, 'expoInOut', 26, 1]);
  for (let i = 0; i < 5; i++) {
    if (k === 5 && i === 4) { SP.push([T.tear - .12, { w: cardEdge(5, 4, 0) }, 'expoIn', 26, 1]); SP.push([T.tear + .1, { w: cardEdge(5, 4, 1) }, 'cubicOut', 26, 1]); continue; }
    SP.push([flipAt(k, i), { w: badgeWorld(k, i) }, 'expoInOut', 26, 1]);
  }
  const s = setAt(k);
  if (k === 0) SP.push([s - .02, { w: blockToWorld(0, [CARD.w / 2, BLOCK_H / 2]) }, 'expoInOut', 26, 1]);
  if (k === 1) SP.push([s - .02, { w: blockToWorld(1, [CARD.w - 22, BLOCK_H - 44]) }, 'expoInOut', 26, 1]);
  if (k === 2) SP.push([s + .5, { w: badgeWorld(2, 4) }, 'expoInOut', 26, 1]);
  if (k === 3) { SP.push([s, { w: blockToWorld(3, [CARD.w + 10, -20]) }, 'cubic', 26, 1]); SP.push([s + .55, { w: blockToWorld(3, [CARD.w + 10, BLOCK_H + 20]) }, 'expoInOut', 26, 1]); }
  if (k === 4) SP.push([s + .6, { w: blockToWorld(4, [CARD.w - 120, -64]) }, 'expoInOut', 26, 1]);
  const last = SP[SP.length - 1][0];
  SP.push([last + .55, { s: [1320, -160] }, 'lin', 26, 0]);
}
SP.push([T.swarm[1] - .7, { s: [1320, 380] }, 'expoInOut', 26, 1]);
SP.push([T.logo, { w: SPARKW }, 'lin', 0, 1]); SP.push([DUR, { w: SPARKW }, 'lin', 0, 1]);
SP.sort((a, b) => a[0] - b[0]);
function sparkAt(t, M) {
  let i = 0; while (i < SP.length - 1 && t >= SP[i + 1][0]) i++;
  const a = SP[i], b = SP[Math.min(i + 1, SP.length - 1)], u = b === a ? 1 : clamp((t - a[0]) / (b[0] - a[0])), e = ease[a[2]](u);
  const pa = a[1].s || proj(M, a[1].w), pb = b[1].s || proj(M, b[1].w);
  return { x: lerp(pa[0], pb[0], e), y: lerp(pa[1], pb[1], e), vis: a[4] && (b[4] || u < .98), r: lerp(a[3], b[3], e) };
}

// ——— el fondo: vino oscuro con un brillo rosa que sigue a la acción y una retícula lejana ———
function backdrop(g, t, c) {
  const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#1b0910'); gr.addColorStop(.55, '#2a0f19'); gr.addColorStop(1, '#3a1420');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  glow(g, 540, 1000 + 120 * Math.sin(t * .4), 1000, '176,42,92', .2 + .05 * Math.sin(t * .9));
  const za = clamp((c.z - .12) / .3);
  if (za > 0) {
    const k = .55, z = Math.pow(c.z, k), step = 96 * z;
    const ox = W / 2 + c.sx - c.x * z, oy = H / 2 + c.sy - c.y * z;
    g.save(); g.translate(W / 2, H / 2); g.rotate(c.r * .6); g.translate(-W / 2, -H / 2);
    g.fillStyle = `rgba(246,185,207,${.07 * za})`;
    for (let y = ((oy % step) + step) % step - step; y < H + step; y += step) for (let x = ((ox % step) + step) % step - step; x < W + step; x += step) g.fillRect(x - 1.5, y - 1.5, 3, 3);
    g.restore();
  }
}
function vignette(g) {
  const v = g.createRadialGradient(W / 2, H / 2, H * .35, W / 2, H / 2, H * .78); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(8,2,5,.45)');
  g.fillStyle = v; g.fillRect(0, 0, W, H);
}

// ——— cada tarjeta en el instante t ———
const CHAOS = ITEMS.map(it => ({ dx: (hash(it.n * 1.31) - .5) * 150, dy: (hash(it.n * 2.73) - .5) * 60, dr: (hash(it.n * 4.11) - .5) * .28, spin: (hash(it.n * 6.7) - .5) * 2.6, drift: (hash(it.n * 8.3) - .5) * 700 }));
const blockRot = (k, t) => BLOCKS[k].rot + (k === 4 ? kick(t, setAt(4), 1.25, 3.6) * .07 : 0);   // la balanza de Gestoría
function pose(it, t) {
  const { k, i, n } = it, ch = CHAOS[n - 1], tl = landAt(k, i), ts = snapAt(k, i), tf = flipAt(k, i);
  const order = t < ts ? 0 : spring(t, ts, 2.6, .5), mess = 1 - order;
  let lx = ch.dx * mess, ly = ch.dy * mess, lr = ch.dr * mess, fall = 0, sq = 0;
  if (t < tl) { const u = clamp((tl - t) / .8); fall = 3200 * u * u; lr += ch.spin * u; lx += ch.drift * u * u; }
  else { sq = kick(t, tl, 5, 12) * .05; lr += kick(t, tl, 3, 7) * .04; }
  // la balanza: el bloque de Gestoría gira sobre su pivote
  const wob = blockRot(k, t) - BLOCKS[k].rot;
  let [x, y] = blockToWorld(k, [CARD.w / 2 + lx, cardTop(i) + CARD.h / 2 + ly]);
  if (wob) { const b = BLOCKS[k], dx = x - b.x, dy = y - b.y, c = Math.cos(wob), s = Math.sin(wob); x = b.x + dx * c - dy * s; y = b.y + dx * s + dy * c; }
  y -= fall;
  let rot = blockRot(k, t) + lr, theta = n === 30 ? (t >= T.tear ? Math.PI : 0) : Math.PI * ease.cubic(seg(t, tf, tf + FLIP_D));
  const lift = n === 30 ? 0 : Math.sin(Math.PI * seg(t, tf - .05, tf + FLIP_D + .08));
  const o = { x, y, rot, theta, a: SPR[n - 1].pain, b: SPR[n - 1].fix, w: CARD.w, h: CARD.h, lift, s: 1 - sq, fly: t < tl };
  // el enjambre: de su sitio en el tablero a su casilla del logo, girando hacia la cara del logo
  const go = swarmGo(it);
  if (t >= go) {
    const u = seg(t, go, go + SWARM_D), e = ease.cubic(u), gap = 14 * (1 - ease.cubic(seg(t, T.close[0], T.close[1])));
    const [tx0, ty0, tw, th] = tileRect(k, i, gap), tx = tx0 + tw / 2, ty = ty0 + th / 2;
    const mx = lerp(x, tx, .5) + (hash(n * 3.9) - .5) * 700, my = lerp(y, ty, .5) - 500 - hash(n * 5.1) * 400;   // por encima, en curva
    o.x = (1 - e) ** 2 * x + 2 * (1 - e) * e * mx + e * e * tx; o.y = (1 - e) ** 2 * y + 2 * (1 - e) * e * my + e * e * ty;
    o.rot = lerp(rot, 0, e) + Math.sin(Math.PI * u) * (hash(n * 7.3) - .5) * 1.4;
    o.w = lerp(CARD.w, tw, ease.cubic(seg(u, .2, .9))); o.h = lerp(CARD.h, th, ease.cubic(seg(u, .2, .9)));
    o.a = SPR[n - 1].fix; o.b = 'logo'; o.tile = [k, i];
    o.theta = Math.PI * ease.cubic(seg(u, .25, .75)); o.lift = Math.sin(Math.PI * u) * 1.6; o.s = 1 + .35 * Math.sin(Math.PI * u); o.fly = u < 1;
  }
  return o;
}
function drawShadow(g, o) {
  const k = 1 + o.lift * .35, dy = 16 + o.lift * 70, a = (o.fly ? .5 : .8) / (1 + o.lift * .6);
  const sw = (o.w / CARD.w) * k * o.s, sh = (o.h / CARD.h) * k * o.s * Math.max(.15, Math.abs(Math.cos(o.theta)));
  g.save(); g.translate(o.x, o.y + dy); g.rotate(o.rot); g.globalAlpha *= a;
  g.drawImage(SHADOW.c, -(CARD.w / 2 + SHADOW.m) * sw, -(CARD.h / 2 + SHADOW.m) * sh, SHADOW.c.width * sw, SHADOW.c.height * sh);
  g.restore();
}
function drawOne(g, it, o, t) {
  g.save(); g.translate(o.x, o.y); g.rotate(o.rot);
  const s = o.s * (1 + o.lift * .06); g.scale(s, s);
  drawCard(g, o);
  // Errores: las del capítulo 4 llegan en rojo; se apagan al girar
  if (it.k === 3 && t < flipAt(3, it.i) + .1 && t > CH[3] - 1.5) {
    const a = (1 - seg(t, flipAt(3, it.i) - .05, flipAt(3, it.i) + .1)) * (.75 + .25 * Math.sin(t * 18 + it.i));
    g.strokeStyle = `rgba(255,77,87,${a})`; g.lineWidth = 7; rr(g, -CARD.w / 2 - 6, -CARD.h / 2 - 6, CARD.w + 12, CARD.h + 12, CARD.r + 5); g.stroke();
  }
  // Errores: el barrido verde enciende el borde de cada tarjeta al pasar
  if (it.k === 3) {
    const pass = setAt(3) + .55 * (cardTop(it.i) + CARD.h / 2) / BLOCK_H, a = t > pass ? 1 - seg(t, pass, pass + .55) : 0;
    if (a > 0) { g.strokeStyle = `rgba(80,220,140,${.9 * a})`; g.lineWidth = 8; rr(g, -CARD.w / 2 - 6, -CARD.h / 2 - 6, CARD.w + 12, CARD.h + 12, CARD.r + 5); g.stroke(); }
  }
  // la ✓ estalla al quedar de frente
  const tf = it.n === 30 ? T.tear : flipAt(it.k, it.i) + FLIP_D;
  if (t >= tf && t < tf + .5 && t < swarmGo(it)) { const u = seg(t, tf, tf + .45); g.strokeStyle = `rgba(251,246,242,${.8 * (1 - u)})`; g.lineWidth = 6 * (1 - u); g.beginPath(); g.arc(CARD.w / 2 - 74, 0, 36 + 60 * ease.expoOut(u), 0, Math.PI * 2); g.stroke(); }
  g.restore();
}

// ——— el tablero: títulos, tarjetas y lo que pasa encima de ellas ———
function titles(g, t, M, rep) {
  const a = clamp(seg(t, .7, 1.5)) * (1 - ease.cubic(seg(t, T.swarm[0], T.swarm[0] + .5)));
  if (a <= 0) return;
  for (let k = 0; k < 6; k++) {
    const [x, y] = blockToWorld(k, [0, -46]);
    g.save(); g.translate(x, y); g.rotate(blockRot(k, t)); g.globalAlpha *= a;
    text(g, CHAPTERS[k].title, 6, 0, 66, C.paper, { w: 700, ls: -1.6 });
    text(g, `${k + 1}/6`, CARD.w - 4, -4, 30, C.pink2, { w: 600, fam: 'PlexMono', align: 'right' });
    // Gestoría: «DEBE = HABER» encaja en la fila del título
    if (k === 4 && t >= setAt(4)) {
      const u = ease.expoOut(seg(t, setAt(4), setAt(4) + .6)), ok = seg(t, setAt(4) + .6, setAt(4) + .75);
      const cx = CARD.w - 300, sz = 30;
      text(g, 'DEBE', cx - 34 - lerp(140, 0, u), -6, sz, C.pink, { w: 700, fam: 'PlexMono', align: 'right', ls: 2 });
      text(g, 'HABER', cx + 34 + lerp(140, 0, u), -6, sz, C.pink, { w: 700, fam: 'PlexMono', ls: 2 });
      g.globalAlpha *= ok; text(g, '=', cx, -4, 40, C.paper, { w: 700, fam: 'PlexMono', align: 'center' });
    }
    g.restore();
    if (rep && t > CH[k] + .1 && t < leaveAt(k)) tx(`t${k}`, CHAPTERS[k].title, box(M, k, [0, -110, 420, -30]));
  }
}
const box = (M, k, [x0, y0, x1, y1]) => { const p = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(q => proj(M, blockToWorld(k, q))); return [Math.min(...p.map(q => q[0])), Math.min(...p.map(q => q[1])), Math.max(...p.map(q => q[0])), Math.max(...p.map(q => q[1]))]; };

function board(g, t, M, rep) {
  titles(g, t, M, rep);
  const P = ITEMS.map(it => pose(it, t));
  const rest = [], top = [];
  ITEMS.forEach((it, j) => { const o = P[j]; (o.fly || o.lift > .01 ? top : rest).push(j); });
  const glitching = t >= CH[3] - .12 && t < CH[3] + .4;
  for (const j of rest) drawShadow(g, P[j]);
  for (const j of rest) { if (glitching && ITEMS[j].k === 3) continue; drawOne(g, ITEMS[j], P[j], t); }
  if (glitching) {   // Errores llega con un fallo de señal: bandas desplazadas y los canales separados
    const amt = Math.sin(seg(t, CH[3] - .12, CH[3] + .4) * Math.PI) * (.55 + .45 * hash(Math.floor(t * FPS))), [x0, y0] = blockToWorld(3, [-80, -140]);
    glitch(g, q => ITEMS.forEach((it, j) => { if (it.k === 3) drawOne(q, it, P[j], t); }), [x0 - 120, y0 - 80, CARD.w + 400, BLOCK_H + 360], amt, Math.floor(t * FPS) * 3.3, Math.min(1.2, zoomOf(M)));
  }
  // los golpes que caen sobre las tarjetas
  stamp(g, ...blockToWorld(0, [CARD.w / 2, BLOCK_H / 2 + 10]), BLOCKS[0].rot - .2, t, setAt(0), setAt(0) + 1.05);
  if (t >= setAt(0) && t < setAt(0) + .6) { const [x, y] = blockToWorld(0, [CARD.w / 2, BLOCK_H / 2]); shockwave(g, x, y, t, setAt(0), { r0: 260, r1: 900, dur: .55, lw: 18, col: '255,240,246' }); }
  if (t >= setAt(1) - .25 && t < T.swarm[0] + .4) {
    const s0 = setAt(1), fall = ease.expoIn(seg(t, s0 - .22, s0)), sq = kick(t, s0, 6, 9) * .1, [x, y] = blockToWorld(1, [CARD.w - 40, BLOCK_H - 10]);
    seal(g, x, y, 128, { rot: (t < s0 ? lerp(-.8, -.14, fall) : -.14) + BLOCKS[1].rot, alpha: clamp(seg(t, s0 - .22, s0 - .14)) * (1 - seg(t, T.swarm[0], T.swarm[0] + .3)), scale: t < s0 ? lerp(2.6, 1, fall) : 1 - sq });
    shockwave(g, x, y, t, s0, { r0: 112, r1: 620, dur: .5, lw: 14 });
  }
  // Papeleo: el visor de la foto alrededor del ticket
  { const t0 = flipAt(2, 3) - .15, u = seg(t, t0, t0 + .5); if (u > 0 && u < 1) {
    const [x, y] = blockToWorld(2, [CARD.w / 2, cardTop(3) + CARD.h / 2]), s = lerp(1.18, 1, ease.expoOut(seg(t, t0, t0 + .15))), a = 1 - seg(u, .7, 1);
    g.save(); g.translate(x, y); g.rotate(BLOCKS[2].rot); g.scale(s, s); g.strokeStyle = `rgba(251,246,242,${a})`; g.lineWidth = 8; g.lineCap = 'square';
    const w = CARD.w / 2 + 34, h = CARD.h / 2 + 30, L = 70;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { g.beginPath(); g.moveTo(sx * w, sy * (h - L)); g.lineTo(sx * w, sy * h); g.lineTo(sx * (w - L), sy * h); g.stroke(); }
    g.restore();
  } }
  // Errores: el barrido verde que lo comprueba todo
  { const u = seg(t, setAt(3), setAt(3) + .55); if (u > 0 && u < 1) {
    const ly = lerp(-30, BLOCK_H + 30, ease.sine(u)), [x, y] = blockToWorld(3, [CARD.w / 2, ly]);
    g.save(); g.translate(x, y); g.rotate(BLOCKS[3].rot);
    const gb = g.createLinearGradient(0, -90, 0, 6); gb.addColorStop(0, 'rgba(80,220,140,0)'); gb.addColorStop(1, 'rgba(80,220,140,.35)');
    g.fillStyle = gb; g.fillRect(-CARD.w / 2 - 40, -90, CARD.w + 80, 96); g.fillStyle = 'rgba(170,255,200,.95)'; g.fillRect(-CARD.w / 2 - 40, 0, CARD.w + 80, 5);
    g.restore();
  } }
  // Día a día: el láser del lector pasa por la cola de la caja
  { const t0 = flipAt(5, 1) - .3, u = seg(t, t0, t0 + .28); if (u > 0 && u < 1) {
    const [x, y] = blockToWorld(5, [lerp(-20, CARD.w + 20, ease.sine(u)), cardTop(1) + CARD.h / 2]);
    g.save(); g.translate(x, y); g.rotate(BLOCKS[5].rot);
    const gl = g.createLinearGradient(-60, 0, 6, 0); gl.addColorStop(0, 'rgba(255,60,70,0)'); gl.addColorStop(1, 'rgba(255,60,70,.4)');
    g.fillStyle = gl; g.fillRect(-60, -CARD.h / 2 - 20, 66, CARD.h + 40); g.fillStyle = 'rgba(255,120,120,.95)'; g.fillRect(0, -CARD.h / 2 - 20, 5, CARD.h + 40);
    g.restore();
  } }
  // encima: las que giran, caen o vuelan
  top.sort((a, b) => P[a].lift - P[b].lift);
  for (const j of top) { drawShadow(g, P[j]); drawOne(g, ITEMS[j], P[j], t); }
  // el contrato roto (la última): las dos mitades caen
  if (t >= T.tear && t < T.tear + 1.15) {
    const o = P[29]; g.save(); g.translate(o.x, o.y); g.rotate(o.rot); drawTorn(g, SPR[29].pain, seg(t, T.tear, T.tear + 1.1)); g.restore();
  }
  // el logo, ya entero: el borde rosa que respira
  if (t >= T.close[1] - .05) {
    const a = ease.cubic(seg(t, T.close[1] - .05, T.close[1] + .3));
    g.save(); g.globalAlpha = a; rr(g, LOGO.x, LOGO.y, LOGO.w, LOGO.h, LOGO.r); g.lineWidth = 90; g.strokeStyle = 'rgba(246,185,207,.14)'; g.stroke(); g.restore();
  }
  // lo que se lee: el dolor desde que llega la cámara; la solución desde que queda de frente
  if (rep) ITEMS.forEach((it, j) => {
    const k = it.k; if (t < CH[k] + .1 || t > leaveAt(k)) return;
    const bx = box(M, k, [0, cardTop(it.i), CARD.w, cardTop(it.i) + CARD.h]);
    tx(`p${it.n}`, it.pain, bx);
    if (t >= (it.n === 30 ? T.tear + .1 : flipAt(k, it.i) + FLIP_D)) tx(`s${it.n}`, it.fix, bx);
  });
  return P;
}

// ——— el contador de resueltas: fichas de cartel arriba ———
function counter(g, t) {
  const a = clamp(seg(t, T.ask, T.ask + .25)) * (1 - seg(t, T.q - .15, T.q + .05));
  if (a <= 0) return;
  const n = solvedBy(t), prev = Math.max(0, n - 1), tc = n ? DONE[n - 1] : 0, p = n ? seg(t, tc, tc + .16) : 1;
  const from = String(prev).padStart(2, '0'), to = String(n).padStart(2, '0'), pop = n ? Math.exp(-(t - tc) * 7) : 0;
  const s = 76, cy = 268, big = n === 30 ? 1 + .12 * Math.exp(-Math.max(0, t - T.pull[1]) * 4) * (t >= T.pull[1] ? 1 : 0) : 1;
  g.save(); g.globalAlpha *= a; g.translate(540, cy); g.scale(big * (1 + pop * .06), big * (1 + pop * .06)); g.translate(-540, -cy);
  g.fillStyle = 'rgba(16,5,10,.72)'; rr(g, 540 - 190, cy - 62, 380, 124, 30); g.fill();
  g.strokeStyle = `rgba(246,185,207,${.25 + .5 * pop})`; g.lineWidth = 3; g.stroke();
  for (let d = 0; d < 2; d++) flapTile(g, 540 - 112 + d * 70, cy, s, from[d], to[d], from[d] === to[d] ? 1 : p, { ink: C.ink, face: C.papel, glowA: pop * .8 });
  text(g, '/30', 540 + 10, cy + 22, 62, C.pink, { w: 700, fam: 'PlexMono' });
  g.restore();
}

// ——— el gancho: 30, enorme, y la frase ———
function hook(g, t, rep) {
  if (t > T.dive[0] + .5) return;
  const out = ease.cubicIn(seg(t, T.dive[0], T.dive[0] + .35)), pk = kick(t, T.hit, 4, 7) * .06, grow = 1 + .04 * seg(t, 0, T.dive[0]);
  g.save(); g.globalAlpha = 1 - out;
  g.save(); g.translate(540, 650 - out * 260); g.scale(grow * (1 + pk), grow * (1 + pk));
  text(g, '30', 10, 18, 430, C.rose7, { w: 700, align: 'center', ls: -18 });
  text(g, '30', 0, 0, 430, C.pink, { w: 700, align: 'center', ls: -18 });
  g.restore();
  const lines = [['cosas que odias', 776], ['de llevar un negocio.', 878]];
  lines.forEach(([s, y], j) => text(g, s, 540, y - out * (300 + j * 60), 90, C.paper, { w: 700, align: 'center', ls: -2.6 }));
  g.restore();
  if (rep && t < T.dive[0]) tx('hook', '30 cosas que odias de llevar un negocio.', [80, 330, 1000, 900]);
}

// ——— rótulos de pantalla: Plex Sans en negrita, palabra a palabra; *así* = en rosa ———
let TX = [];
const tx = (id, s, b) => TX.push({ id, text: s, x0: b[0], y0: b[1], x1: b[2], y1: b[3] });
function caption(g, t, [id, t0, t1, lines, size, y0], rep) {
  if (t < t0 - .01 || t > t1 + .3) return;
  const lh = size * 1.12, items = [];
  lines.forEach((ws, li) => {
    const parts = ws.map(w => { const pk = w.startsWith('*'), s = w.replace(/\*/g, ''); return { s, pk, w: measure(g, s, 700, size, 'Plex', false, -size * .03) }; });
    const sp = size * .26, tw = parts.reduce((a, p) => a + p.w, 0) + sp * (parts.length - 1); let x = W / 2 - tw / 2;
    parts.forEach(p => { items.push({ ...p, x, y: y0 + li * lh }); x += p.w + sp; });
  });
  let n = 0; const all = items.length;
  for (const it of items) {
    const k = n++, tin = t0 + k * .05, tout = t1 - (all - 1 - k) * .03, uIn = spring(t, tin, 2.4, .62), uOut = ease.cubicIn(seg(t, tout, tout + .24));
    if (t < tin) continue;
    g.save(); g.beginPath(); g.rect(0, it.y - size * 1.02, W, size * 1.34); g.clip();
    const dy = (1 - clamp(uIn)) * size * .95 - uOut * size * 1.25, sc = 1 + (uIn - clamp(uIn)) * .25;
    g.translate(it.x + it.w / 2, it.y + dy); g.scale(sc, sc);
    text(g, it.s, 0, 0, size, it.pk ? C.pink : C.paper, { w: 700, align: 'center', ls: -size * .03 });
    g.restore();
  }
  if (rep && t > t0 + (all - 1) * .05 + .12 && t < t1 - (all - 1) * .03) {
    const x0 = Math.min(...items.map(i => i.x)), x1 = Math.max(...items.map(i => i.x + i.w));
    tx(id, lines.map(l => l.join(' ')).join(' ').replace(/\*/g, ''), [x0, y0 - size * .8, x1, y0 + (lines.length - 1) * lh + size * .25]);
  }
}

// ——— Papeleo: las hojas que vuelan al buzón ———
function sheets(g, t, M) {
  const dst = proj(M, badgeWorld(2, 4));
  [[-260, 520, 'pdf', 0], [1340, 860, 'xls', 1], [-220, 1500, 'ticket', 2]].forEach(([sx, sy, kind, j]) => {
    const t0 = setAt(2) - .05 + j * .15, u = seg(t, t0, t0 + .5); if (u <= 0 || u >= 1) return;
    const e = ease.cubicIn(u), x = lerp(sx, dst[0], e), y = lerp(sy, dst[1], e) - Math.sin(u * Math.PI) * 180;
    sheet(g, x, y, (1 - u) * (j - 1) * 1.2 + u * 3, lerp(1.25, .08, e), kind, 1 - seg(u, .85, 1));
  });
  const tp = setAt(2) + .55; if (t >= tp && t < tp + .5) shockwave(g, dst[0], dst[1], t, tp, { r0: 30, r1: 240, dur: .45, lw: 10 });
}

// ——— el cierre ———
function endCard(g, t, rep) {
  if (t < T.word - .05) return;
  const rise = (t0, d = .45) => ease.expoOut(seg(t, t0, t0 + d));
  const kw = rise(T.word);
  g.save(); g.beginPath(); g.rect(0, 1020, W, 120); g.clip();
  text(g, 'Klimafacturas', 540, 1112 + (1 - kw) * 110, 104, C.paper, { w: 700, align: 'center', ls: lerp(6, -3.6, kw) });
  g.restore();
  if (rep && kw > .98) tx('brand', 'Klimafacturas', [190, 1030, 890, 1135]);
  const kc = rise(T.chips);
  if (kc > 0) { g.save(); g.globalAlpha = kc; text(g, 'CUMPLE VERIFACTU · SIN PERMANENCIA', 540, 1196 + (1 - kc) * 24, 27, C.pink2, { w: 600, fam: 'PlexMono', align: 'center', ls: 3.4 }); g.restore(); if (rep && kc > .98) tx('chips', 'CUMPLE VERIFACTU · SIN PERMANENCIA', [110, 1167, 970, 1207]); }
  const kb = spring(t, T.cta, 2.4, .55);
  if (t >= T.cta) {
    const pr = t >= T.ctaTap ? Math.exp(-(t - T.ctaTap) * 12) : 0, s = clamp(kb, 0, 1.2) * (1 - .05 * pr), bw = 540, bh = 112;
    g.save(); g.translate(540, 1318); g.scale(s, s);
    g.fillStyle = 'rgba(176,42,92,.35)'; rr(g, -bw / 2 + 6, -bh / 2 + 14, bw, bh, bh / 2); g.fill();
    g.fillStyle = C.rose; rr(g, -bw / 2, -bh / 2, bw, bh, bh / 2); g.fill();
    if (t > T.ctaTap && t < T.ctaTap + .55) { const u = seg(t, T.ctaTap, T.ctaTap + .55); g.save(); rr(g, -bw / 2, -bh / 2, bw, bh, bh / 2); g.clip(); g.fillStyle = `rgba(255,255,255,${.3 * (1 - u)})`; g.beginPath(); g.arc(60, 0, 30 + 380 * ease.cubicOut(u), 0, Math.PI * 2); g.fill(); g.restore(); }
    text(g, 'Crear cuenta  →', 0, 13, 40, C.paper, { w: 600, align: 'center', ls: -.6 });
    g.restore();
    const ku = rise(T.cta + .15);
    g.save(); g.globalAlpha = ku; text(g, 'klimafacturas.com', 540, 1458 + (1 - ku) * 20, 44, C.paper, { w: 600, align: 'center', ls: -.8 }); g.restore();
    if (rep && t > T.cta + .5) { tx('cta', 'Crear cuenta', [270, 1262, 810, 1374]); tx('url', 'klimafacturas.com', [330, 1414, 750, 1474]); }
  }
}

// ——— un instante ———
function drawFrame(g, t, rep) {
  const c = camera(t), M = matrix(c);
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  backdrop(g, t, c);
  g.setTransform(M);
  board(g, t, M, rep);
  g.setTransform(1, 0, 0, 1, 0, 0);
  // velo oscuro arriba detrás de los textos (el gancho y el final)
  const veil = Math.max((1 - ease.cubic(seg(t, T.dive[0], T.dive[1]))), clamp(seg(t, T.q - .3, T.q + .1)));
  if (veil > 0) {
    const bot = t < T.dive[1] + .1 ? 1110 : 560, vg = g.createLinearGradient(0, 0, 0, bot);
    vg.addColorStop(0, `rgba(20,7,12,${.9 * veil})`); vg.addColorStop(.75, `rgba(20,7,12,${.78 * veil})`); vg.addColorStop(1, 'rgba(20,7,12,0)');
    g.fillStyle = vg; g.fillRect(0, 0, W, bot);
  }
  hook(g, t, rep);
  sheets(g, t, M);
  vignette(g);
  counter(g, t);
  for (const cp of CAPTIONS) caption(g, t, cp, rep);
  // la chispa, con su estela
  const sp = sparkAt(t, M);
  if (sp.vis) {
    const trail = []; for (let k = 8; k >= 0; k--) { const tt = t - k * .014, q = sparkAt(tt, matrix(camera(tt))); trail.push([q.x, q.y]); }
    let r = sp.r || 26; if (t >= T.swarm[1] - .7) r = lerp(26, 6.1 * LOGO.s * zoomOf(M), ease.cubic(seg(t, T.logo - .45, T.logo)));
    const sq = t >= T.logo ? kick(t, T.logo, 5, 7) * .25 : 0;
    spark(g, sp.x, sp.y, r, { trail: t < T.logo - .05 ? trail : null, squash: sq });
  }
  if (t >= T.hit && t < T.hit + .7) shockwave(g, 540, 1000, t, T.hit, { r0: 120, r1: 1100, dur: .6, lw: 18 });
  if (t >= T.logo && t < T.logo + .8) { const p = proj(M, SPARKW); shockwave(g, p[0], p[1], t, T.logo, { r0: 30, r1: 760, dur: .7, lw: 14 }); }
  endCard(g, t, rep);
  // destellos: el golpe inicial, la foto del ticket y el logo
  for (const [ft, a] of [[T.hit, .4], [flipAt(2, 3) - .02, .55], [T.logo, .22]]) if (t >= ft && t < ft + .1) { g.fillStyle = `rgba(255,240,246,${a * (1 - (t - ft) / .1)})`; g.fillRect(0, 0, W, H); }
}

// ——— el obturador: media de varias muestras dentro de medio fotograma (180°) ———
const MOTION = [[0, 1.95, 130], [T.swarm[0], T.swarm[1] + .2, 120], [T.tear - .15, T.tear + 1.1, 70], [setAt(0) - .2, setAt(0) + .1, 70], [setAt(1) - .25, setAt(1) + .1, 70],
  [setAt(2) - .1, setAt(2) + .6, 60], [CH[3] - .15, CH[3] + .45, 40], ...CH.map(c => [c + 1.45, c + 3.9, 30])];
function samples(t) {
  const h = .5 / FPS / 2, Ma = matrix(camera(t - h)), Mb = matrix(camera(t + h));
  let d = 0; for (const p of [[0, 0], [W, 0], [0, H], [W, H], [W / 2, H / 2]]) { const ia = Ma.inverse(), q = ia.transformPoint(new DOMPoint(...p)), b = Mb.transformPoint(q); d = Math.max(d, Math.hypot(b.x - p[0], b.y - p[1])); }
  for (const [a, b, px] of MOTION) if (t >= a && t <= b) d = Math.max(d, px);
  return Math.min(13, 2 * Math.ceil(d / 14) + 1);
}
window.render = (t) => {
  t = clamp(t, 0, DUR - 1e-4); TX = [];
  const n = samples(t);
  if (n <= 1) { drawFrame(G, t, true); return; }
  for (let i = 0; i < n; i++) {
    const ts = t + (i / (n - 1) - .5) * (.5 / FPS);
    drawFrame(B, ts, i === (n - 1) / 2);
    A.setTransform(1, 0, 0, 1, 0, 0); A.globalAlpha = 1 / (i + 1); A.drawImage(SUB, 0, 0);
  }
  G.setTransform(1, 0, 0, 1, 0, 0); G.globalAlpha = 1; G.drawImage(ACC, 0, 0);
};
window.TEXTS = () => TX;
window.READY = true;
