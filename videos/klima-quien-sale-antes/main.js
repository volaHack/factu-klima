// «¿Quién sale antes?» · plano secuencia — anuncio vertical de Klimafacturas en Game Show Flat (Lemo-Opuscar), 1080×1920.
// Un solo plató y una sola toma: la cámara nunca corta. Entra en Javier (que lo hace todo a mano), barre hasta el móvil
// de Lucía (que lo acerca a la cámara), sale al plano general en cada veredicto, se mete en la pantalla gigante para la
// ronda extra (un collage de papel con pantallas reales del programa) y acaba delante del telón.
// El mundo: el presentador a la izquierda, el concurso en el centro (0…1080, el plano general de siempre) y la pantalla
// vertical a la derecha. Tres capas de profundidad: pared (0,6), plató (1) y público (1,25).
// render(t) es una función pura de t: todo se recalcula en cada fotograma.
import {
  K, SETS, W, H, f, sticker, ellipse, rr, starPath, rays, measure, telop, text, telopPop, burst, judge,
  clamp, lerp, seg, hash, back, eo, ei, pop, hopY, hitSq,
} from './kit.js';
import { bean, mitten, crowdBean } from './chars.js';
import { phone, logoTile, SW, SH } from './ui.js';
import { screenContent, collageEvents, landAt } from './collage.js';
import { VO, ROUNDS, DUR, FLY, FLYD, CAM, score, landed, roundAt, BELL, BONUS, FINAL, NIGHT, WIN, LOGO, ASK, CURTAIN, STICKERS, MORE } from './timeline.js';

const c = document.getElementById('c'), g = c.getContext('2d');
const mk = (w = W, h = H) => { const k = document.createElement('canvas'); k.width = w; k.height = h; return k; };
const LIGHT = mk(), BUF = mk();
const DURS = await (await fetch('voices/dur.json')).json();
const LIPS = await (await fetch('voices/lips.json')).json();
const LINES = await (await fetch('lines.json')).json();
const SUB = Object.fromEntries(LINES.map(l => [l.id, l.sub]));
for (const w of [500, 600, 700]) {
  await document.fonts.load(`${w} 40px Fredoka`); await document.fonts.load(`${w} 40px "IBM Plex Sans"`);
}
await document.fonts.load('600 40px Fraunces');
const IMG = {};
await Promise.all(STICKERS.map(async ([, , k]) => { const im = new Image(); im.src = `collage/ht/${k}.png`; await im.decode(); IMG[k] = im; }));

// ——— voz → boca ———
const VOL = Object.entries(VO).map(([id, [t0, who, place]]) => ({ id, t0, who, place, t1: t0 + DURS[id] }));
function mouthOf(who, t) {
  for (const v of VOL) if (v.who === who && t >= v.t0 && t < v.t1) { const o = LIPS[v.id].o; return o[Math.min(o.length - 1, Math.floor((t - v.t0) * 24))] || 0; }
  return 0;
}
const blink = (t, ph) => ((t + ph) % 3.3) < .11;

// ——— subtítulos: cada placa ≥ 1,8 s y ≥ frase + 0,6 s, recortada por la siguiente ———
const PLATES = VOL.filter(v => v.place === 'plate').map(v => ({ ...v, end: v.t0 + Math.max(1.8, DURS[v.id] + .6) }));
PLATES.forEach((p, i) => { const n = PLATES[i + 1]; if (n && p.end > n.t0 - .05) p.end = n.t0 - .05; });
const CUES = VOL.map(v => ({ ...v, end: v.t0 + Math.max(1.8, DURS[v.id] + .6) })).sort((a, b) => a.t0 - b.t0);
CUES.forEach((p, i) => { const n = CUES[i + 1]; if (n && p.end > n.t0 - .05) p.end = n.t0 - .05; });

// ——— el plató ———
const JX = 300, LX = 780, PODY = 1075, BASEY = 1150, CS = 1.15, FLOOR = 1350;
const HOST = { x: -560, y: 1520, s: 1.35 };                       // la marca del presentador
const SIGN = { x: -300, y: 700 };                                  // cartel de la prueba (baja del peine)
const VW = { x: 1640, y: 790, w: 600, h: 600 * 16 / 9 };           // la pantalla vertical gigante
const DX = 540, DY = 700, DW = 150, DH = 450;                      // la puerta de salida
// el primer plano de la mesa de Javier: las coordenadas de dibujo de los primeros planos de la versión anterior
// (Javier a 2,05×) caen exactamente sobre el plató con este cambio de escala
const JF = { s: CS / 2.05 }; JF.x = JX - 540 * JF.s; JF.y = BASEY - 1480 * JF.s;
const PH_UP = { x: 960, y: 770, s: .42 };                          // el móvil de Lucía, sacado hacia la cámara a su derecha
const PH_REST = .19;                                               // y en la mano, en el plano general

// ——— la cámara ———
const REF = { x: 540, y: 960 };
const POSES = {
  hostcu: { x: HOST.x, y: HOST.y - 760 / (3.15 / HOST.s), z: 3.15 / HOST.s },
  wide: { x: 540, y: 960, z: 1 },
  jav: { x: JF.x + 540 * JF.s, y: JF.y + 960 * JF.s, z: 1 / JF.s },
  phone: { x: PH_UP.x - 160 * PH_UP.s, y: PH_UP.y + 120 * PH_UP.s, z: 1 / PH_UP.s },   // el móvil un poco a la derecha y la cara de Lucía al lado
  card: { x: SIGN.x, y: 960, z: 1 },
  vw: { x: VW.x, y: VW.y, z: W / VW.w * 1.03 },
  night: { x: 430, y: 990, z: 1.12 },
  win: { x: 318, y: 880, z: 1.7 },
};
const EASE = {
  lin: u => u, io2: u => .5 - .5 * Math.cos(Math.PI * u), hold: () => 0,
  io: u => u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2,
  whip: u => u < .5 ? 16 * Math.pow(u, 5) : 1 - Math.pow(-2 * u + 2, 5) / 2,
};
const poseOf = k => { const p = POSES[k[1]]; return { x: p.x, y: p.y, z: p.z * k[2] }; };
// zoom en escala logarítmica alrededor del punto fijo de los dos encuadres: el movimiento se lee como un solo gesto
function camAt(t) {
  let i = 0; while (i < CAM.length - 1 && t >= CAM[i + 1][0]) i++;
  const A = CAM[i], B = CAM[Math.min(i + 1, CAM.length - 1)], pa = poseOf(A), pb = poseOf(B);
  const u = B === A ? 0 : clamp((t - A[0]) / (B[0] - A[0])), e = EASE[A[3]](u);
  const z = Math.exp(lerp(Math.log(pa.z), Math.log(pb.z), e));
  let x, y;
  if (Math.abs(Math.log(pb.z / pa.z)) > 1e-3) {
    const fx = (pa.x * pa.z - pb.x * pb.z) / (pa.z - pb.z), fy = (pa.y * pa.z - pb.y * pb.z) / (pa.z - pb.z);
    x = fx - (fx - pa.x) * pa.z / z; y = fy - (fy - pa.y) * pa.z / z;
  } else { x = lerp(pa.x, pb.x, e); y = lerp(pa.y, pb.y, e); }
  const w = {}; w[A[1]] = (w[A[1]] || 0) + 1 - e; w[B[1]] = (w[B[1]] || 0) + e;
  const r = A[3] === 'whip' ? .03 * Math.sign(pb.x - pa.x) * Math.sin(Math.PI * u) : 0;   // un poco de inclinación en el barrido
  return { x, y, z, r, w };
}
const PUNCH = [];
function kickAt(t) { let z = 1; for (const [ti, a] of PUNCH) if (t >= ti && t < ti + .6) z += a * Math.exp(-(t - ti) * 9); return Math.min(z, 1.07); }
// el operador: una mano que flota (dos senos lentos) mientras la cámara se mueve y se queda quieta del todo en las
// pausas ('hold'), y un asentamiento cada vez que llega a un encuadre nuevo: se pasa un pelo en la dirección en la que
// venía y vuelve (en el último tramo de un movimiento encadenado con otro, no)
const HOLDS = CAM.slice(0, -1).map((k, i) => [k, CAM[i + 1]]).filter(([a]) => a[3] === 'hold').map(([a, b]) => [a[0], b[0]]);
const holdAt = t => Math.max(0, ...HOLDS.map(([a, b]) => clamp(seg(t, a, a + .3)) * (1 - seg(t, b, b + .2))));
const LANDS = [];
for (let i = 0; i < CAM.length - 1; i++) {
  const [, a, , e] = CAM[i], [t1, b] = CAM[i + 1], nx = CAM[i + 2];
  if (a === b || e === 'lin' || e === 'hold' || (nx && nx[1] !== b && nx[0] - t1 < .5)) continue;
  const pa = POSES[a], pb = POSES[b], dx = pb.x - pa.x, dy = pb.y - pa.y, l = Math.hypot(dx, dy) || 1;
  LANDS.push({ t: t1, ux: dx / l, uy: dy / l, z: Math.sign(Math.log(pb.z / pa.z)), a: e === 'whip' ? 9 : 5 });
}
function camera(t) {
  const cm = camAt(t), hand = 1 - holdAt(t);
  cm.sx = (2.4 * Math.sin(t * 1.9) + 1.3 * Math.sin(t * 3.3 + 1.7)) * hand;
  cm.sy = (2 * Math.sin(t * 1.6 + .6) + 1.1 * Math.sin(t * 3.8 + 2.3)) * hand;
  cm.r += .0012 * Math.sin(t * 1.4 + .9) * hand;
  let kz = 0;
  for (const L of LANDS) {
    const u = t - L.t; if (u < 0 || u > .7) continue;
    const w = Math.exp(-u * 9) * Math.sin(u * 2 * Math.PI * 5.5);
    cm.sx -= L.ux * L.a * w; cm.sy -= L.uy * L.a * w; kz += L.z * .006 * w;
  }
  cm.kz = kickAt(t) * (1 + kz);
  return cm;
}
// la transformación de una capa de profundidad k (1 = el plató)
function layerM(cam, k = 1) {
  const z = Math.pow(cam.z, k) * cam.kz, cx = REF.x + (cam.x - REF.x) * k, cy = REF.y + (cam.y - REF.y) * k;
  return new DOMMatrix().translate(540 + cam.sx, 960 + cam.sy).rotate(cam.r * 180 / Math.PI).scale(z, z).translate(-cx, -cy);
}
let SM = new DOMMatrix(), LWK = 1;                                 // matriz del plató en este fotograma y corrección del trazo
const use = (g, M) => g.setTransform(M);
const LW = n => n * LWK;
// rectángulo del mundo que se ve en una capa
function seen(M) {
  const inv = M.inverse(), ps = [[0, 0], [W, 0], [0, H], [W, H]].map(([x, y]) => inv.transformPoint(new DOMPoint(x, y)));
  return { x0: Math.min(...ps.map(p => p.x)), x1: Math.max(...ps.map(p => p.x)), y0: Math.min(...ps.map(p => p.y)), y1: Math.max(...ps.map(p => p.y)) };
}

// ——— eventos: sonido y golpes de cámara (se calculan una vez) ———
const EV = [], FLASH = [];
const ev = (t, type, o = {}) => EV.push({ t: +t.toFixed(3), type, ...o });
const punch = (t, a) => PUNCH.push([t, a]);
const flash = (t, a = .55) => FLASH.push([t, a]);
for (const v of VOL) ev(v.t0, 'vo', { id: v.id, who: v.who });
for (const p of CUES) ev(p.t0, 'sub', { t1: +p.end.toFixed(3), text: SUB[p.id], id: p.id });
// los movimientos de cámara suenan a aire (grave, para no tapar la voz): barrido largo o empujón corto
for (let i = 0; i < CAM.length - 1; i++) {
  const [t0, a, , e] = CAM[i], b = CAM[i + 1][1]; if (a === b) continue;
  // nunca encima del arranque de una frase; si la frase ya va por la mitad, bajito
  const pan = Math.sign(POSES[b].x - POSES[a].x) * .5, arranca = VOL.some(v => v.t0 > t0 - .1 && v.t0 < t0 + .35), voz = VOL.some(v => v.t1 > t0 - .05 && v.t0 < t0 + .35);
  if (arranca) continue;
  if (e === 'whip') ev(t0, 'whip', { pan, soft: voz ? 1 : 0 }); else if (t0 > 1 && CAM[i + 1][0] - t0 < .6 && !voz) ev(t0, 'whip', { short: 1, pan });
}
// gancho
ev(0, 'mic'); punch(.06, .03); punch(.5, .02); punch(1.5, .025);
ev(1.25, 'pip', { f: 660 }); ev(1.5, 'pip', { f: 880 }); ev(2, 'slam', { big: 1 }); punch(2, .035);
ev(3.05, 'ooh'); ev(4, 'roll', { t1: 4.75 }); ev(BELL, 'bell'); punch(BELL, .05); flash(BELL, .4);
// pruebas
for (const r of [1, 2, 3, 4, 5]) {
  const R = ROUNDS[r];
  ev(R.judge, 'slam', { big: 1 }); ev(R.judge + .02, 'ding'); ev(R.judge + .45, 'cheer'); punch(R.judge, .045); flash(R.judge);
  ev(R.judge + FLY + .1, 'whoosh'); ev(R.judge + FLY + FLYD, 'land', { f: [0, 523, 587, 659, 698, 784][r] });
}
for (const t of [10.5, 21.5]) { ev(t, 'jingle'); punch(t, .03); }
// R1
[5.25, 5.5, 5.75, 6.0].forEach(t => ev(t, 'key')); ev(6.1, 'err');
ev(7.0, 'tap'); punch(7.0, .015); ev(7.15, 'pop', { f: 900 }); ev(8.55, 'stamp'); punch(8.55, .02);
ev(9.5, 'thud'); ev(9.52, 'paper'); ev(9.62, 'buzz');
// R2
ev(12.9, 'muffle'); ev(13.25, 'busy'); ev(14.25, 'chime'); ev(14.5, 'kaching'); punch(14.5, .015); ev(16.25, 'hangup');
// R3
for (let t = 17.25; t < 17.75; t += .125) ev(t, 'rattle'); ev(17.75, 'pop', { f: 500 }); ev(17.9, 'thud', { small: 1 });
ev(18.5, 'shutter'); punch(18.5, .02); [18.85, 19.07, 19.29, 19.51].forEach((t, i) => ev(t, 'tick', { f: 1200 + i * 150 }));
ev(20.0, 'tap'); ev(20.02, 'chime'); ev(20.75, 'boom'); ev(20.77, 'paper'); punch(20.75, .03);
// R4
ev(22.95, 'growl'); ev(23.5, 'chomp'); punch(23.5, .03); ev(24.15, 'tick', { f: 1300 }); ev(24.4, 'tick', { f: 1500 }); ev(25.2, 'kaching');
ev(26.85, 'chomp'); ev(26.87, 'yelp');
// R5
ev(27.65, 'creak'); ev(27.9, 'creak'); ev(28.2, 'crash'); punch(28.2, .04); ev(29.5, 'stamp'); ev(30.0, 'pop', { f: 700 });
// ronda extra: el collage
ev(BONUS, 'slam', { big: 1 }); ev(BONUS, 'crash', { cym: 1 }); punch(BONUS, .03);
for (const e of collageEvents()) ev(e.t, e.type, { pan: +((e.x - 540) / 540 * .6).toFixed(2), big: e.big });
punch(landAt(MORE), .012);
// final
ev(FINAL, 'slam'); flash(FINAL, .35); ev(FINAL + .05, 'cheer');
for (let t = 39; t < 40; t += .25) ev(t, 'step'); ev(39.9, 'door', { open: 1 }); ev(41.35, 'door'); punch(41.35, .015);
for (let t = 41.5; t < 44; t += .5) ev(t, 'clock', { tock: ((t - 41.5) / .5) % 2 });
for (let t = 42.25; t < 42.9; t += .2) ev(t, 'step', { soft: 1 });
ev(WIN, 'tap'); ev(WIN, 'slam', { big: 1 }); ev(WIN + .04, 'cheer'); punch(WIN, .06); flash(WIN);
ev(46.5, 'whoosh'); ev(46.62, 'whoosh'); ev(LOGO, 'stamp', { big: 1 }); punch(LOGO, .05); flash(LOGO);
ev(CURTAIN[0] - .04, 'whip', { short: 1 }); ev(CURTAIN[1], 'thud', { small: 1 });
ev(48.4, 'pop', { f: 800 }); ev(49.25, 'pop', { f: 950 }); ev(49.6, 'pop', { f: 1100 }); ev(ASK, 'slam');
ev(52.0, 'button');
// para la mezcla: qué se ve en cada momento (el murmullo del público sube en el plano general y baja en el móvil)
const SHOTS = [];
{
  const name = { hostcu: 'hostcu', wide: 'wide', jav: 'jav', phone: 'phone', card: 'card', vw: 'bonus', night: 'night', win: 'javwin' };
  for (let i = 0; i < CAM.length - 1; i++) {
    const [a, pa] = CAM[i], [b, pb] = CAM[i + 1], m = pa === pb ? b : (a + b) / 2;
    SHOTS.push([a, m, name[pa]]); if (m < b) SHOTS.push([m, b, name[pb]]);
  }
  const e = SHOTS.findIndex(s => s[0] < 47.5 && s[1] > 47.5); if (e >= 0) SHOTS.splice(e + 1, 0, [47.5, SHOTS[e][1], SHOTS[e][2]]), SHOTS[e][1] = 47.5;
  for (const s of SHOTS) { if (s[0] >= NIGHT[0] && s[1] <= NIGHT[1]) s[2] = 'night'; if (s[0] >= 46.75) s[2] = s[0] >= 47.5 ? 'end' : 'merge'; }
}
EV.push({ t: 0, type: 'meta', bpm: 120, bar0: 1.0, silence: [[4.75, 5.0], [NIGHT[0], WIN - .02]], keyUp: WIN,
  sections: [[0, 1, 'pickup'], [1, 4.75, 'hook'], [5, 10.5, 'funk'], [10.5, 17, 'quiz'], [17, 21.5, 'electro'], [21.5, 27.5, 'heavy'],
    [27.5, 32, 'dream'], [32, 38, 'jackpot'], [38, 41.5, 'pop'], [WIN, 52, 'popBig'], [52, DUR, 'end']],
  shots: SHOTS.map(s => s.map(v => typeof v === 'number' ? +v.toFixed(3) : v)), judges: [1, 2, 3, 4, 5].map(r => ROUNDS[r].judge) });
EV.sort((a, b) => a.t - b.t);
window.EV = EV; window.DUR = DUR;

// ——— textos visibles (para readcheck): los del plató se pasan a pantalla con la cámara ———
let TX = [];
const tx = (id, s, b) => TX.push({ id, text: s, x0: b[0], y0: b[1], x1: b[2], y1: b[3] });
function txw(id, s, [x0, y0, x1, y1], M = SM) {
  const ps = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => M.transformPoint(new DOMPoint(x, y)));
  const b = [Math.min(...ps.map(p => p.x)), Math.min(...ps.map(p => p.y)), Math.max(...ps.map(p => p.x)), Math.max(...ps.map(p => p.y))];
  if (b[3] - b[1] < 22 || b[2] < 0 || b[0] > W || b[3] < 0 || b[1] > H) return;   // fuera de cuadro o demasiado pequeño para leerse
  tx(id, s, b);
}

// ——— la luz del plató: color y trama de cada prueba; los cambios entran en círculo desde el centro ———
const LIGHTS = [
  [0, 'hook', 'rays'], [BELL, 'r1', 'stripes'], [10.5, 'r2', 'dots'], [17.0, 'r3', 'stripes'], [21.5, 'r4', 'rays'], [27.5, 'r5', 'dots'],
  [BONUS, 'bonus', 'rays'], [FINAL, 'hook', 'rays'], [NIGHT[0], 'night', 'none'], [WIN, 'gold', 'rays'], [CURTAIN[0], 'wine', 'stripes'],
];
function paintSet(g, key, pat, t, cam) {
  const [bg, p, fl] = SETS[key];
  g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const M = layerM(cam, .6), v = seen(M); use(g, M); g.fillStyle = p;
  if (pat === 'rays') rays(g, 540, 700, 16, p, t * .25, 9000);
  else if (pat === 'stripes') {
    g.save(); g.translate(540, 960); g.rotate(-.35); const w = 70, o = (t * 40) % (2 * w);
    for (let x = -6000 + o; x < 6000; x += 2 * w) g.fillRect(x, -6000, w, 12000); g.restore();
  } else if (pat === 'dots') {
    const st = 96, ox = (t * 18) % st, oy = (t * 10) % (st * .866 * 2);
    for (let j = Math.floor((v.y0 - oy) / (st * .866)) - 1; j * st * .866 + oy < v.y1 + st; j++) {
      const y = j * st * .866 + oy, sh = (j & 1) ? st / 2 : 0;
      for (let x = Math.floor((v.x0 - ox - sh) / st) * st + ox + sh - st; x < v.x1 + st; x += st) { g.beginPath(); g.arc(x, y, 17, 0, Math.PI * 2); g.fill(); }
    }
  }
  use(g, SM); g.fillStyle = fl; g.fillRect(-5000, FLOOR, 12000, 6000); g.fillStyle = K.ol; g.fillRect(-5000, FLOOR - 4, 12000, 8);
}
function backdrop(g, t, cam) {
  let i = 0; while (i < LIGHTS.length - 1 && t >= LIGHTS[i + 1][0]) i++;
  const [t0, key, pat] = LIGHTS[i], d = key === 'night' ? .08 : .35, u = i ? seg(t, t0, t0 + d) : 1;
  if (u < 1) { const [, k0, p0] = LIGHTS[i - 1]; paintSet(g, k0, p0, t, cam); }
  g.save();
  if (u < 1) { g.setTransform(1, 0, 0, 1, 0, 0); const o = key === 'gold' ? SM.transformPoint(new DOMPoint(318, 1000)) : { x: 540, y: 960 }; g.beginPath(); g.arc(o.x, o.y, 1500 * eo(u), 0, Math.PI * 2); g.clip(); }
  paintSet(g, key, pat, t, cam);
  g.restore();
}

// ——— piezas del plató ———
function bulbColumn(g, x, y0, n, t, ph = 0) {
  for (let i = 0; i < n; i++) { const on = (Math.floor(t * 4) + i + ph) % 2 === 0; ellipse(g, x, y0 + i * 105, 13, 13, on ? K.yellow : '#B79A3A', LW(4)); }
}
function podium(g, x, name, sub, val, col, t, judgeTimes) {
  const w = 340, h = 290, y = PODY;
  sticker(g, x - w / 2, y, w, h, 34, K.cream, { sh: 12, ow: LW(9) });
  g.save(); rr(g, x - w / 2, y, w, h, 34); g.clip(); g.fillStyle = col; g.fillRect(x - w / 2, y, w, 30); g.restore();
  g.lineWidth = LW(9); g.strokeStyle = K.ol; rr(g, x - w / 2, y, w, h, 34); g.stroke();
  g.fillStyle = K.ol; g.fillRect(x - w / 2, y + 30, w, 6);
  text(g, name, x, y + 92, 50, K.ol, { w: 700, align: 'center' });
  text(g, sub, x, y + 130, 28, '#5A4A50', { w: 600, align: 'center' });
  const last = judgeTimes.filter(tt => tt <= t).pop();
  const k = last != null ? .55 + .45 * back(seg(t, last, last + .3), 3) : 1;
  sticker(g, x - 74, y + 150, 148, 118, 24, K.ol, { sh: 0, ow: 0 });
  g.save(); g.translate(x, y + 212); g.scale(k, k); telop(g, String(val), 0, 38, 104, { fill: K.yellow, sw: 0 }); g.restore();
}
const SLOT = { n: 5, s: 104, gap: 20, y: 175 }; SLOT.x0 = W / 2 - (SLOT.n * SLOT.s + (SLOT.n - 1) * SLOT.gap) / 2;
const slotXY = i => [SLOT.x0 + (i - 1) * (SLOT.s + SLOT.gap) + SLOT.s / 2, SLOT.y + SLOT.s / 2];
// el marcador cuelga del peine con dos cables
function scoreboard(g, t) {
  const drop = t < 9.3 ? lerp(-900, 0, back(seg(t, 8.7, 9.05), 1.6)) : 0; if (drop <= -880) return;
  g.save(); g.translate(0, drop);
  const x0 = SLOT.x0 - 34, x1 = SLOT.x0 + 5 * SLOT.s + 4 * SLOT.gap + 34, y0 = SLOT.y - 30, y1 = SLOT.y + SLOT.s + 30;
  g.lineWidth = LW(6); g.strokeStyle = K.ol; for (const cx of [x0 + 60, x1 - 60]) { g.beginPath(); g.moveTo(cx, y0); g.lineTo(cx, -2000); g.stroke(); }
  sticker(g, x0, y0, x1 - x0, y1 - y0, 34, K.navy, { sh: 10, ow: LW(8) });
  for (let i = 0; i < 12; i++) { const on = (Math.floor(t * 4) + i) % 2 === 0, x = lerp(x0 + 30, x1 - 30, i / 11); ellipse(g, x, y0 + 14, 7, 7, on ? K.yellow : '#6B5E2A'); ellipse(g, x, y1 - 14, 7, 7, on ? '#6B5E2A' : K.yellow); }
  for (let i = 1; i <= 5; i++) {
    const [cx, cy] = slotXY(i), filled = landed(i, t), lt = ROUNDS[i].judge + FLY + FLYD, s = SLOT.s;
    const k = filled ? 1 + .25 * Math.exp(-(t - lt) * 8) * Math.cos((t - lt) * 30) : 1;
    const bob = t > FINAL && t < NIGHT[0] ? hopY(t, 10, i * .1) : 0, gone = t >= 46.5;
    if (gone) { sticker(g, cx - s / 2, cy - s / 2, s, s, 26, 'rgba(255,255,255,.22)', { sh: 0, ow: LW(5), ol: 'rgba(27,27,27,.55)' }); continue; }
    g.save(); g.translate(cx, cy + bob); g.scale(k, k);
    sticker(g, -s / 2, -s / 2, s, s, 26, filled ? K.cream : 'rgba(255,255,255,.22)', { sh: filled ? 8 : 0, ow: LW(filled ? 7 : 5), ol: filled ? K.ol : 'rgba(27,27,27,.55)' });
    if (filled) icon(g, ROUNDS[i].icon, 0, 0, .62, t); else text(g, String(i), 0, 16, 46, 'rgba(27,27,27,.45)', { w: 700, align: 'center' });
    g.restore();
  }
  g.restore();
}
// trofeos de cada prueba
function icon(g, kind, x, y, s, t = 0) {
  g.save(); g.translate(x, y); g.scale(s, s); g.lineJoin = 'round'; g.lineCap = 'round';
  const ow = 8;
  if (kind === 'invoice') {
    sticker(g, -58, -74, 116, 148, 12, K.white, { sh: 8, ow });
    g.fillStyle = K.ol; for (const [yy, w] of [[-44, 70], [-22, 50], [0, 74], [22, 40]]) { rr(g, -38, yy, w, 9, 4); g.fill(); }
    g.fillStyle = K.ol; g.fillRect(14, 30, 28, 28); g.fillStyle = K.white; g.fillRect(19, 35, 7, 7); g.fillRect(30, 46, 7, 7);
  } else if (kind === 'coin') {
    ellipse(g, 8, 8, 72, 72, K.ol); ellipse(g, 0, 0, 72, 72, K.gold, ow); ellipse(g, 0, 0, 52, 52, null, 5);
    telop(g, '€', 0, 30, 84, { fill: K.ol, sw: 0, w: 700 });
  } else if (kind === 'ticket') {
    g.save(); g.rotate(-.12);
    const path = () => { g.beginPath(); g.moveTo(-50, -78); g.lineTo(50, -78); g.lineTo(50, 66); for (let i = 0; i <= 10; i++) g.lineTo(50 - i * 10, 66 + (i % 2 ? 12 : 0)); g.closePath(); };
    g.save(); g.translate(8, 8); path(); g.fillStyle = K.ol; g.fill(); g.restore();
    path(); g.fillStyle = K.white; g.fill(); g.lineWidth = ow; g.strokeStyle = K.ol; g.stroke();
    g.fillStyle = K.ol; for (const [yy, w] of [[-56, 60], [-36, 44], [-16, 64]]) { rr(g, -34, yy, w, 8, 4); g.fill(); }
    rr(g, -34, 22, 68, 14, 5); g.fillStyle = K.green; g.fill(); g.restore();
  } else if (kind === 'calendar') {
    sticker(g, -64, -66, 128, 136, 16, K.white, { sh: 8, ow });
    g.save(); rr(g, -64, -66, 128, 136, 16); g.clip(); g.fillStyle = K.red; g.fillRect(-64, -66, 128, 38); g.restore();
    g.lineWidth = ow; g.strokeStyle = K.ol; rr(g, -64, -66, 128, 136, 16); g.stroke(); g.beginPath(); g.moveTo(-64, -28); g.lineTo(64, -28); g.stroke();
    telop(g, '20', 0, 50, 70, { fill: K.ol, sw: 0 });
    g.fillStyle = K.ol; rr(g, -40, -82, 14, 30, 6); g.fill(); rr(g, 26, -82, 14, 30, 6); g.fill();
  } else if (kind === 'book') {
    sticker(g, -62, -74, 124, 148, 14, K.wine, { sh: 8, ow });
    sticker(g, -46, -58, 92, 116, 8, K.cream, { sh: 0, ow: 5 });
    g.lineWidth = 10; g.strokeStyle = K.green; g.beginPath(); g.moveTo(-24, 2); g.lineTo(-6, 22); g.lineTo(28, -22); g.stroke();
    g.fillStyle = K.ol; g.fillRect(-62, -74, 16, 148);
  }
  g.restore();
}
const cheerAt = t => {
  let c = 0;
  for (const r of [1, 2, 3, 4, 5]) { const j = ROUNDS[r].judge; if (t >= j && t < j + 1.2) c = Math.max(c, 1 - seg(t, j + .7, j + 1.2)); }
  if (t >= WIN && t < WIN + 2.2) c = 1; if (t >= FINAL && t < FINAL + 1.2) c = 1 - seg(t, FINAL + .8, FINAL + 1.2);
  if (t > 3.05 && t < 3.8) c = Math.max(c, .5); if (t >= CURTAIN[1] && t < CURTAIN[1] + 1.2) c = 1 - seg(t, CURTAIN[1] + .8, CURTAIN[1] + 1.2);
  return c;
};
// el público: dos filas que siguen por todo el plató (capa cercana, se mueve más deprisa que el plató)
function crowd(g, t, M) {
  const v = seen(M), sink = 420 * eo(seg(t, 47.3, 47.8)), cols = [K.orange, K.green, K.sky, K.yellow, K.red, K.lime, K.pink, K.blue, K.teal];
  if (v.y1 < 1500) return;
  for (let row = 0; row < 2; row++) for (let i = -10; i < 18; i++) {
    const x = 70 + i * 157 + (row ? 78 : 0), y = 1700 + row * 150 + sink; if (x < v.x0 - 160 || x > v.x1 + 160) continue;
    crowdBean(g, x, y, .42, cols[((i % 9) + 9 + row * 3) % cols.length], t, i + row * 7 + 20, cheerAt(t));
  }
}

// cartel de la prueba: grande en el plató (cuelga junto al presentador) o pequeño en la esquina (rótulo de tele)
function roundBanner(g, r, t, mode, t0, kout = 1) {
  const R = ROUNDS[r], k = pop(t, t0, .25) * kout; if (k <= 0) return;
  const big = mode === 'center', size = big ? 60 : 44, num = String(r);
  const nameW = measure(g, R.name, size, 700), w = nameW + (big ? 190 : 150), h = big ? 132 : 104;
  const x = big ? W / 2 - w / 2 : 44, y = big ? 500 : 150;
  g.save(); g.translate(x + w / 2, y + h / 2); g.scale(k, k); g.rotate(big ? -.03 : -.02); g.translate(-(x + w / 2), -(y + h / 2));
  sticker(g, x, y, w, h, h / 2, K.cream, { sh: 10, ow: 8 });
  const dr = h * .36, dx = x + h / 2 + 4, dy = y + h / 2;
  ellipse(g, dx, dy, dr, dr, SETS[R.set][2], 7); telop(g, num, dx, dy + dr * .48, dr * 1.35, { fill: K.white, sw: .12 });
  text(g, 'PRUEBA', dx + dr + 22, y + h * .36, big ? 26 : 20, '#6B5A60', { w: 700, ls: 3 });
  text(g, R.name, dx + dr + 22, y + h * .8, size, K.ol, { w: 700 });
  g.restore();
  if (k > .98) tx('round', `PRUEBA ${r} · ${R.name}`, [x, y, x + w, y + h]);
}
function sign(g, t) {
  for (const r of [2, 4]) {
    const R = ROUNDS[r], up = r === 2 ? 12.0 : 22.75, d = seg(t, R.start - .05, R.start + .3), u = seg(t, up, up + .3);
    if (d <= 0 || u >= 1) continue;
    const y = lerp(-1200, SIGN.y, back(d, 1.4)) - 1900 * ei(u), sw = Math.sin(t * 2.2) * .015 * (1 - d * .5);
    g.save(); g.translate(SIGN.x, y); g.rotate(sw);
    g.lineWidth = 6; g.strokeStyle = K.ol; for (const cx of [-330, 330]) { g.beginPath(); g.moveTo(cx, -250); g.lineTo(cx, -2400); g.stroke(); }
    sticker(g, -440, -250, 880, 500, 56, K.cream, { sh: 16, ow: 10 });
    const pw = measure(g, `PRUEBA ${r}`, 50, 700) + 80; sticker(g, -pw / 2, -290, pw, 84, 42, K.ol, { sh: 0, ow: 0 }); text(g, `PRUEBA ${r}`, 0, -230, 50, K.white, { w: 700, align: 'center' });
    const sz = Math.min(150, 150 * 780 / measure(g, R.name, 150, 700));
    telop(g, R.name, 0, 30 + sz * .3, sz, { fill: SETS[R.set][2], sw: .1, sh: 8 });
    icon(g, R.icon, 360, -260 + hopY(t, 14), 1.25, t);
    g.restore();
    if (d >= 1 && u <= 0) txw('round', `PRUEBA ${r} · ${R.name}`, [SIGN.x - 440, SIGN.y - 290, SIGN.x + 440, SIGN.y + 250]);
  }
}
// placa de subtítulo: pegatina crema con el punto de color de quien habla
const WHO = { host: K.yellow, javier: K.javier, lucia: K.lucia };
function plate(g, t) {
  const p = PLATES.find(p => t >= p.t0 && t < p.end); if (!p) return;
  const s = SUB[p.id]; let lines = [s], size = 50;
  if (measure(g, s, size, 600) > 820) {
    const words = s.split(' '); let best = 1, bd = 1e9;
    for (let i = 1; i < words.length; i++) { const a = words.slice(0, i).join(' '), b = words.slice(i).join(' '), d = Math.abs(measure(g, a, size, 600) - measure(g, b, size, 600)); if (d < bd) { bd = d; best = i; } }
    lines = [words.slice(0, best).join(' '), words.slice(best).join(' ')];
  }
  const tw = Math.max(...lines.map(l => measure(g, l, size, 600))), w = tw + 130, h = lines.length === 1 ? 104 : 164, x = W / 2 - w / 2, y = 1488 - h / 2;
  const k = .9 + .1 * back(seg(t, p.t0, p.t0 + .14), 3);
  g.save(); g.translate(W / 2, 1488); g.scale(k, k); g.translate(-W / 2, -1488);
  sticker(g, x, y, w, h, 40, K.cream, { sh: 8, ow: 7 });
  ellipse(g, x + 46, y + h / 2, 17, 17, WHO[p.who], 5);
  lines.forEach((l, i) => text(g, l, x + 80, y + (lines.length === 1 ? 68 : 66 + i * 60), size, K.ol, { w: 600 }));
  g.restore();
}

// ——— el atrezo de Javier (consecuencias de cada prueba) ———
function paperTower(g, t, x0, base, n, wob) {
  for (let i = 0; i < n; i++) {
    const y = base - i * 17, dx = Math.sin(t * 3 + i * .5) * i * wob + (hash(i) - .5) * 10;
    g.save(); g.translate(x0 + dx, y); g.rotate((hash(i * 3) - .5) * .06);
    g.fillStyle = i % 5 === 4 ? '#F3E6D0' : K.white; g.fillRect(-62, -14, 124, 15); g.lineWidth = 4; g.strokeStyle = K.ol; g.strokeRect(-62, -14, 124, 15); g.restore();
  }
}
function fallingPapers(g, t, t0, x0, y0, n, seed, tx0 = JX, ty0 = 980) {
  const u = t - t0; if (u < 0) return;
  for (let i = 0; i < n; i++) {
    const p = clamp(u / (.55 + hash(i + seed) * .3)), sx = x0 + (hash(i * 2 + seed) - .5) * 80, sy = y0 - i * 16;
    const ex = tx0 + (hash(i * 5 + seed) - .5) * 360, ey = ty0 + 180 + hash(i * 7 + seed) * 150;
    const x = lerp(sx, ex, p), y = lerp(sy, ey, p) - Math.sin(p * Math.PI) * 120;
    g.save(); g.translate(x, y); g.rotate(p * (3 + hash(i) * 5) * (i % 2 ? 1 : -1)); g.fillStyle = K.white; g.fillRect(-46, -30, 92, 60); g.lineWidth = 4; g.strokeStyle = K.ol; g.strokeRect(-46, -30, 92, 60);
    g.fillStyle = '#C9C9C9'; g.fillRect(-32, -14, 50, 6); g.fillRect(-32, 2, 64, 6); g.restore();
  }
}
function floorMess(g, t) {
  if (t >= 10.5) for (let i = 0; i < 9; i++) { g.save(); g.translate(40 + i * 46 + hash(i) * 20, 1330 - hash(i * 3) * 30); g.rotate((hash(i * 9) - .5) * 1.4); g.fillStyle = K.white; g.fillRect(-40, -24, 80, 48); g.lineWidth = 4; g.strokeStyle = K.ol; g.strokeRect(-40, -24, 80, 48); g.restore(); }
  if (t >= 21.5) for (let i = 0; i < 7; i++) { g.save(); g.translate(520 - i * 50, 1335 - hash(i * 4) * 22); g.rotate((hash(i * 5) - .5) * 1.6); g.fillStyle = '#FFFDF4'; g.fillRect(-18, -34, 36, 68); g.lineWidth = 3; g.strokeStyle = K.ol; g.strokeRect(-18, -34, 36, 68); g.restore(); }
}
function shoebox(g, x, y, s, t, lid = 0) {   // (x, y) = centro de la base
  g.save(); g.translate(x, y); g.scale(s, s);
  g.save(); g.translate(0, -122 - lid * 70); g.rotate(-lid * .25);
  for (let i = 0; i < 6; i++) { g.save(); g.translate(-120 + i * 48, 12 + lid * 40); g.rotate((hash(i) - .5) * .5); g.fillStyle = K.white; g.fillRect(-16, -44, 32, 60); g.lineWidth = 4; g.strokeStyle = K.ol; g.strokeRect(-16, -44, 32, 60); g.restore(); }
  sticker(g, -170, -16, 340, 46, 10, K.cardD, { sh: 0, ow: 7 }); g.restore();
  sticker(g, -150, -110, 300, 110, 10, K.card, { sh: 8, ow: 7 });
  sticker(g, -78, -84, 156, 52, 8, K.white, { sh: 0, ow: 5 }); text(g, 'TICKETS', 0, -46, 30, K.ol, { w: 700, align: 'center' });
  g.restore();
}
function calendarMonster(g, x, y, s, t, awake, bite) {
  g.save(); g.translate(x, y); g.scale(s, s);
  sticker(g, -120, -150, 240, 300, 24, K.white, { sh: 12, ow: 9 });
  g.save(); rr(g, -120, -150, 240, 300, 24); g.clip(); g.fillStyle = K.red; g.fillRect(-120, -150, 240, 70); g.restore();
  g.lineWidth = 9; g.strokeStyle = K.ol; rr(g, -120, -150, 240, 300, 24); g.stroke(); g.beginPath(); g.moveTo(-120, -80); g.lineTo(120, -80); g.stroke();
  text(g, 'ABRIL', 0, -100, 40, K.white, { w: 700, align: 'center' });
  for (const rx of [-70, 70]) { g.fillStyle = K.ol; rr(g, rx - 10, -176, 20, 44, 8); g.fill(); }
  if (awake <= 0) telop(g, '20', 0, 92, 150, { fill: K.ol, sw: 0 });
  else {
    const op = .35 + .65 * Math.abs(Math.sin(bite * Math.PI));
    for (const ex of [-50, 50]) { ellipse(g, ex, -30, 30 * awake, 34 * awake, K.white, 7); ellipse(g, ex + 6, -24, 12 * awake, 12 * awake, K.ol); }
    g.lineWidth = 10; g.strokeStyle = K.ol; g.beginPath(); g.moveTo(-86, -72); g.lineTo(-22, -54); g.moveTo(86, -72); g.lineTo(22, -54); g.stroke();
    g.fillStyle = '#5E1222'; rr(g, -84, 20, 168, 40 + 70 * op * awake, 30); g.fill(); g.stroke();
    g.fillStyle = K.white; for (let i = 0; i < 6; i++) { const tx0 = -78 + i * 28; g.beginPath(); g.moveTo(tx0, 22); g.lineTo(tx0 + 14, 50); g.lineTo(tx0 + 28, 22); g.fill(); g.beginPath(); g.moveTo(tx0, 60 + 70 * op * awake); g.lineTo(tx0 + 14, 34 + 70 * op * awake); g.lineTo(tx0 + 28, 60 + 70 * op * awake); g.fill(); }
    text(g, '20', 92, 128, 40, K.red, { w: 700, align: 'right' });
  }
  g.restore();
}
const BINDERS = [[K.red, 'IVA'], [K.blue, 'BANCOS'], [K.yellow, '2026'], [K.green, 'NÓMINAS'], [K.orange, 'GASTOS'], [K.sky, 'FACTURAS'], [K.pink, 'MODELOS'], [K.lime, 'CAJA'], [K.violetL, 'PROVEEDORES']];
function binderStack(g, x, base, s, t, wob, fall = -1, dir = 0) {
  BINDERS.forEach(([col, lab], i) => {
    let bx = x + Math.sin(t * 7 + i * .6) * wob * i * 2.2, by = base - i * 74 * s, rot = Math.sin(t * 7 + i * .6) * wob * .02 * i;
    if (fall >= 0) { const p = clamp(fall / (.5 + hash(i) * .25)); bx += ((hash(i * 3) - .5) * 700 + dir * (200 + i * 45)) * p; by += -260 * Math.sin(p * Math.PI) + p * (540 + i * 40); rot += p * (hash(i * 7) - .5) * 9; }
    g.save(); g.translate(bx, by); g.rotate(rot); g.scale(s, s);
    sticker(g, -190, -66, 380, 66, 10, col, { sh: 6, ow: 7 });
    sticker(g, -60, -52, 120, 38, 8, K.white, { sh: 0, ow: 4 }); text(g, lab, 0, -24, lab.length > 8 ? 17 : 22, K.ol, { w: 700, align: 'center' });
    ellipse(g, 150, -33, 12, 12, K.white, 4);
    g.restore();
  });
}
// el reloj de la puerta corre durante el concurso: Lucía sale a las tres; Javier sigue a las nueve
const clockAt = t => {
  if (t >= NIGHT[0]) return '21:00';
  if (t >= FINAL) return '15:00';
  const m = Math.floor(lerp(9 * 60, 14 * 60 + 40, clamp(t / FINAL)) / 20) * 20;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
function door(g, t, open) {
  const x = DX - DW / 2, y = DY, clk = clockAt(t);
  sticker(g, x, y, DW, DH, 18, open > 0 ? '#FFF1B8' : K.wood, { sh: 10, ow: LW(9) });
  if (open > 0) {
    g.save(); g.translate(x, y); g.scale(1 - open * .8, 1); sticker(g, 0, 0, DW, DH, 18, K.wood, { sh: 0, ow: LW(9) }); g.restore();
    g.fillStyle = 'rgba(255,224,110,.32)'; g.beginPath(); g.moveTo(x + DW * .25, y + 30); g.lineTo(x + DW, y + 30); g.lineTo(x + DW + 150, y + DH); g.lineTo(x - 100, y + DH); g.closePath(); g.fill();
  } else { ellipse(g, x + DW - 30, y + DH / 2, 13, 13, K.gold, 6); g.lineWidth = 6; g.strokeStyle = K.woodD; rr(g, x + 26, y + 40, DW - 52, DH * .38, 10); g.stroke(); rr(g, x + 26, y + DH * .5, DW - 52, DH * .38, 10); g.stroke(); }
  sticker(g, DX - 84, 530, 168, 66, 16, '#1FA35A', { sh: 6, ow: LW(6) }); text(g, 'SALIDA', DX, 576, 34, K.white, { w: 700, align: 'center' });
  sticker(g, DX - 72, 440, 144, 74, 14, K.ol, { sh: 0, ow: LW(6) }); text(g, clk, DX, 492, 46, clk === '21:00' ? K.red : K.yellow, { w: 700, align: 'center' });
  if (t >= FINAL) { txw('salida', 'SALIDA', [DX - 84, 530, DX + 84, 596]); txw('clock', clk, [DX - 72, 440, DX + 72, 514]); }
}
function live(g, t) {
  const on = Math.floor(t * 2) % 2 === 0;
  sticker(g, 44, 128, 262, 64, 32, K.red, { sh: 6, ow: 6 }); ellipse(g, 82, 160, 12, 12, on ? K.white : '#FFB1B3');
  text(g, 'EN DIRECTO', 104, 172, 32, K.white, { w: 700 }); tx('live', 'EN DIRECTO', [44, 128, 306, 192]);
}
function invoiceSheet(g, x, y) {
  g.save(); g.translate(x, y); g.rotate(-.08); sticker(g, -170, -70, 340, 150, 8, K.white, { sh: 6, ow: 6 });
  text(g, 'FACTURA', -140, -26, 34, K.ol, { w: 700 }); g.fillStyle = '#CFCFCF'; for (let i = 0; i < 3; i++) g.fillRect(-140, 0 + i * 22, 200 - i * 40, 9);
  text(g, '¿IVA?', 150, 58, 30, K.red, { w: 700, align: 'right' }); g.restore();
}
function calculator(g, x, y, t) {
  g.save(); g.translate(x, y); g.rotate(.06); sticker(g, -130, -150, 260, 300, 26, '#9AA3B5', { sh: 8, ow: 8 });
  sticker(g, -104, -128, 208, 74, 10, '#2F5D50', { sh: 0, ow: 5 });
  const d = t < 5.25 ? '0' : t < 5.5 ? '1000' : t < 5.75 ? '1000×' : t < 6.1 ? '1000×0,21' : (Math.floor(t * 6) % 2 ? 'E' : ' ');
  text(g, d, 92, -72, d === 'E' ? 54 : 38, d === 'E' ? '#FF8A8A' : '#C6F16D', { w: 700, align: 'right' });
  for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) sticker(g, -98 + j * 50, -34 + i * 56, 40, 44, 10, j === 3 ? K.orange : K.white, { sh: 0, ow: 4 });
  g.restore();
}
function deskPhone(g, x, y) { g.save(); g.translate(x, y); sticker(g, -110, -70, 220, 110, 30, K.red, { sh: 8, ow: 8 }); ellipse(g, 0, -12, 40, 40, K.cream, 6); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; ellipse(g, Math.cos(a) * 26, -12 + Math.sin(a) * 26, 6, 6, K.ol); } g.restore(); }
function cord(g, x0, y0, x1, y1) {
  g.lineWidth = 7; g.strokeStyle = K.ol; g.beginPath();
  for (let i = 0; i <= 40; i++) { const u = i / 40, x = lerp(x0, x1, u) + Math.sin(u * 40) * 14, y = lerp(y0, y1, u) + Math.cos(u * 40) * 10 + Math.sin(u * Math.PI) * 120; i ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.stroke();
}
function muffleBubble(g, x, y, t, t0) {
  const k = pop(t, t0, .15); if (k <= 0) return; g.save(); g.translate(x, y); g.scale(k, k);
  g.fillStyle = K.ol; g.beginPath(); g.moveTo(-40, 50); g.lineTo(-110, 150); g.lineTo(10, 60); g.fill();
  sticker(g, -170, -70, 340, 140, 70, '#D9DCE6', { sh: 8, ow: 7 });
  g.lineWidth = 8; g.strokeStyle = K.ol; g.beginPath(); for (let i = 0; i <= 30; i++) { const xx = -120 + i * 8, yy = Math.sin(i * 1.3 + t * 30) * 22 * (1 - Math.abs(i - 15) / 18); i ? g.lineTo(xx, yy) : g.moveTo(xx, yy); } g.stroke();
  g.restore();
}
function flag(g, x, y, t) {
  g.lineWidth = 8; g.strokeStyle = K.ol; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y + 110); g.lineTo(x, y - 60); g.stroke();
  g.beginPath(); g.moveTo(x, y - 60); for (let i = 0; i <= 8; i++) g.lineTo(x + i * 12, y - 60 + Math.sin(t * 9 + i * .7) * 7); for (let i = 8; i >= 0; i--) g.lineTo(x + i * 12, y - 6 + Math.sin(t * 9 + i * .7) * 7); g.closePath();
  g.fillStyle = K.white; g.fill(); g.lineWidth = 5; g.stroke();
}
function ticketsBurst(g, t, t0, x, y) {
  const u = t - t0;
  if (u < .12) { const k = 1 + u * 4; g.save(); g.translate(x, y + 40); g.scale(k, 2 - k); g.translate(-x, -y - 40); shoebox(g, x, PODY + 4, .7, t, 0); g.restore(); }
  burst(g, x, y, t, t0, K.white, .8);
  for (let i = 0; i < 26; i++) {
    const a = -Math.PI / 2 + (hash(i * 3.3) - .5) * 2.4, v = 700 + hash(i) * 700, px = x + Math.cos(a) * v * u, py = y + Math.sin(a) * v * u + 1500 * u * u;
    if (py > 2600) continue; g.save(); g.translate(px, py); g.rotate(u * 8 * (hash(i * 5) - .5) * 2); g.fillStyle = '#FFFDF4'; g.fillRect(-20, -36, 40, 72); g.lineWidth = 4; g.strokeStyle = K.ol; g.strokeRect(-20, -36, 40, 72);
    g.fillStyle = '#BBB'; g.fillRect(-12, -22, 24, 5); g.fillRect(-12, -10, 18, 5); g.restore();
  }
}
function trophyFlight(g, t, r) {
  const R = ROUNDS[r], u = seg(t, R.judge + FLY, R.judge + FLY + FLYD); if (u <= 0 || u >= 1) return;
  const [tx1, ty1] = slotXY(r), e = ei(u) * .3 + eo(u) * .7, x = lerp(LX, tx1, e), y = lerp(760, ty1, e) - Math.sin(u * Math.PI) * 160;
  icon(g, R.icon, x, y, lerp(1.1, .62, e), t);
}

// ——— Javier: un solo muñeco que pasa por todas las pruebas ———
const inCU = (g, fn) => { g.save(); g.translate(JF.x, JF.y); g.scale(JF.s, JF.s); fn(); g.restore(); };   // coordenadas del primer plano
const MON = [[0, 850, 1192, .9], [23.35, 850, 1192, .9], [23.55, 700, 640, 1.45], [23.95, 700, 660, 1.4], [24.4, 868, 1180, .95], [26.65, 868, 1180, .95], [26.85, 690, 1000, 1.05], [27.25, 700, 1010, 1.05], [27.5, 1250, 1700, .9]];
function monsterPose(t) {
  let i = 0; while (i < MON.length - 1 && t >= MON[i + 1][0]) i++;
  const a = MON[i], b = MON[Math.min(i + 1, MON.length - 1)], u = b === a ? 0 : eo(seg(t, a[0], b[0]));
  return [lerp(a[1], b[1], u), lerp(a[2], b[2], u) - (b[0] === 27.5 ? Math.sin(u * Math.PI) * 300 : 0), lerp(a[3], b[3], u)];
}
function javier(g, t, cam) {
  const R1 = ROUNDS[1].judge, R2 = ROUNDS[2].judge, R3 = ROUNDS[3].judge, R4 = ROUNDS[4].judge, R5 = ROUNDS[5].judge;
  const o = { who: 'javier', s: CS, lw: LW(8), mouth: mouthOf('javier', t), blink: blink(t, .7), eyes: 'open', brows: 'worried', sweat: .5, shape: 'flat' };
  let x = JX, y = BASEY + hopY(t, 6, .25);
  const press = (() => { const k = [5.25, 5.5, 5.75, 6.0].filter(k => k <= t).pop() ?? -1; return k > 0 ? Math.exp(-(t - k) * 14) : 0; })();
  if (t < BELL) { o.look = [.6, 0]; o.sweat = .35; o.shape = 'smile'; if (t > 4.2) { o.sq = -.05; o.L = [-160, -230]; o.R = [160, -230]; } }
  else if (t < 10.5) {
    if (t < R1 - .3) { o.R = [118, -128 + press * 22]; o.L = [-128 + Math.sin(t * 22) * 8, -372]; o.look = [.6, .6]; o.eyes = t >= 6.1 ? 'wide' : 'open'; o.brows = t >= 6.1 ? 'up' : 'worried'; }
    else { o.look = [1, -.3]; o.eyes = 'wide'; }
    const u = t - (R1 + .5); if (u > 0) { o.eyes = 'shock'; o.shape = 'o'; o.mouth = .6; o.sq = -.12 * Math.exp(-u * 3); o.arms = 'up'; o.L = o.R = undefined; o.sweat = 1; }
  } else if (t < 17.0) {
    o.eyes = 'tired'; o.shape = 'frown';
    if (t < R2 + .25) { if (t > 11.6) { o.R = [176, -292]; o.propR = 'handset'; o.look = [.8, 0]; } if (t < 13.25) { o.eyes = 'open'; o.shape = 'flat'; o.brows = 'up'; } }
    else o.R = [190, -60];
  } else if (t < 21.5) {
    const burstT = R3 + .25;
    o.L = [-85, -100]; o.R = [85, -100]; o.eyes = 'wide'; o.look = [0, .8]; o.sweat = 1; o.sq = t > 17.9 && t < 18.1 ? -.06 : 0;
    if (t >= R3 - .3) { o.look = [.4, -.2]; o.shape = 'o'; o.mouth = .4; }
    if (t >= burstT) { o.eyes = 'shock'; o.L = [-120, -60]; o.R = [120, -60]; }
  } else if (t < 27.5) {
    const lunge = eo(seg(t, 23.35, 23.55)) * (1 - eo(seg(t, 23.95, 24.4))), u = t - (R4 + .35);
    o.eyes = lunge > 0 ? 'shock' : 'open'; o.shape = lunge > 0 ? 'o' : 'flat'; o.mouth = Math.max(o.mouth, lunge * .7); o.look = [1, -.4]; o.sweat = 1;
    if (t >= 22.95) o.look = [1, -.1];
    if (lunge > 0) { o.arms = 'up'; o.lean = -.1; x -= 22 * lunge; }
    if (t >= 24.4) { o.eyes = 'open'; o.brows = 'worried'; o.look = [.8, .2]; }
    if (u > 0) { o.eyes = 'shock'; o.shape = 'o'; o.mouth = .7; o.arms = 'up'; o.lean = -.12; x -= 30; y -= 30 * Math.exp(-u * 4); }
  } else if (t < BONUS + 1) {
    const fall = t >= 28.2 ? t - 28.2 : -1;
    o.R = [128, -250]; o.L = [-150, -420 + Math.sin(t * 16) * 14]; o.eyes = fall >= 0 ? 'shock' : 'wide'; o.shape = fall >= 0 ? 'o' : 'flat'; o.mouth = Math.max(o.mouth, fall >= 0 ? .8 : 0); o.look = [.7, -1];
    if (fall >= 0) { o.arms = 'up'; o.L = o.R = undefined; o.lean = -.08; }
    if (t >= R5 - .3) { o.eyes = 'closed'; o.shape = 'frown'; o.arms = undefined; o.L = [-160, -120]; o.R = [150, -300]; o.lean = 0; y += 60; }
  } else if (t < NIGHT[0]) { o.eyes = 'tired'; o.shape = 'frown'; o.look = [1, 0]; o.sq = -.06; o.sweat = 0; }
  else if (t < 44.0) {
    const up = t > 43; Object.assign(o, { eyes: up ? 'open' : 'tired', brows: up ? 'up' : 'worried', shape: up ? 'o' : 'frown', mouth: up ? .25 : 0, look: [up ? 1 : 0, 0], sq: -.07, lean: .03, sweat: 0 });
    y = BASEY + 8; if (t > 43.55) { o.L = [-60, -110]; o.R = [150, -140]; o.look = [.3, .9]; o.eyes = 'wide'; }
  } else {
    const won = t >= WIN, m = mouthOf('javier', t); o.sweat = 0; o.mouth = m;
    if (!won) Object.assign(o, { eyes: 'wide', brows: 'up', shape: 'o', mouth: .2, look: [.3, .9], L: [-60, -110], R: [150, -140] });
    else if (t < WIN + .45) Object.assign(o, { eyes: 'wide', brows: 'up', shape: 'o', mouth: .8, sq: hitSq(t, WIN, .16), L: [-60, -110], R: [150, -140] });
    else { Object.assign(o, { eyes: 'happy', shape: 'grin', mouth: Math.max(m, .5), arms: 'up', sq: hitSq(t, WIN + .45, .1) }); y = BASEY + hopY(t, 22); }
  }
  bean(g, x, y, o);
  return { x, y, o };
}
// lo que Javier tiene encima de su atril en cada prueba (dibujado en coordenadas del primer plano)
function javierDesk(g, t, J) {
  const R1 = ROUNDS[1].judge, R3 = ROUNDS[3].judge;
  const inOut = (a, b) => clamp(back(seg(t, a, a + .22), 2)) * (1 - ei(seg(t, b - .2, b)));
  inCU(g, () => {
    if (t >= BELL && t < 10.5) { const k = inOut(BELL, 10.5); g.save(); g.translate(300, 1340); g.scale(k, k); invoiceSheet(g, 0, 0); g.restore(); g.save(); g.translate(790, 1215); g.scale(k, k); calculator(g, 0, 0, t); g.restore(); }
    if (t >= 10.5 && t < 17.0) {
      const k = inOut(10.5, 17.0); g.save(); g.translate(250, 1300); g.scale(k, k); deskPhone(g, 0, 0); g.restore();
      if (J.o.propR === 'handset') cord(g, 250, 1265, 540 + 176 * 2.05 - 10, (J.y - JF.y) / JF.s - 200 * 2.05);
      if (t > 12.85 && t < 13.3) muffleBubble(g, 860, 520, t, 12.85);
    }
    if (t >= 17.0 && t < R3 + .25) {
      const tremble = t > 17.25 && t < 17.75 ? Math.sin(t * 90) * 6 : 0, lid = t > 17.75 && t < 17.95 ? Math.sin(seg(t, 17.75, 17.95) * Math.PI) : 0, k = inOut(17.0, 99);
      g.save(); g.translate(540 + tremble, 1350); g.rotate(tremble * .002); g.scale(k, k); shoebox(g, 0, 0, 1.25, t, lid); g.restore();
      const hy = 1275 - lid * 70; mitten(g, 366 + tremble, hy, 1, 10, 2.05); mitten(g, 714 + tremble, hy, -1, 10, 2.05);
    }
    if (t >= 21.5 && t < 27.5) {
      const [mx, my, ms] = monsterPose(t), awake = t < 22.95 ? 0 : eo(seg(t, 22.95, 23.15));
      const bite = t < 23.45 ? 0 : t < 23.95 ? seg(t, 23.45, 23.95) * 2 : t < 26.85 ? .25 + .25 * Math.sin(t * 9) : seg(t, 26.85, 27.25) * 2;
      const k = clamp(back(seg(t, 21.5, 21.72), 2));
      g.save(); g.translate(mx, my); g.scale(k, k); calendarMonster(g, 0, 0, ms, t, awake, bite); g.restore();
    }
    if (t >= 27.5 && t < 44.0) {
      const wob = clamp(seg(t, 27.55, 28.15)) * 4, fall = t >= 28.2 ? Math.min(1.2, t - 28.2) : -1, k = clamp(back(seg(t, 27.5, 27.72), 2));
      g.save(); g.translate(830, 1346); g.scale(k, k); binderStack(g, 0, 0, .82, t, fall >= 0 ? 0 : wob, fall, -1); g.restore();
    }
  });
  if (t >= ROUNDS[5].judge - .3 && t < BONUS + 1) flag(g, JX + 40, PODY - 150 + 50, t);
}

// ——— Lucía y su móvil ———
function phoneState(t) {
  if (t < 6.95) return ['nueva', 0, {}];
  if (t < 7.1) return ['nueva', 0, { press: seg(t, 6.95, 7.1) }];
  if (t < 10.5) return ['emitida', t - 7.1, {}];
  if (t < 17.0) { const t0 = ROUNDS[2].phone; return ['cobro', Math.max(0, t - t0), { payAt: 14.25 - t0 }]; }
  if (t < 18.75) { const t0 = ROUNDS[3].phone; return ['camara', Math.max(0, t - t0), { shotAt: 18.5 - t0 }]; }
  if (t < 21.5) return ['gasto', t - 18.75, { saveAt: 20.0 - 18.75 }];
  if (t < 27.5) return ['hacienda', Math.max(0, t - ROUNDS[4].phone), {}];
  const t0 = ROUNDS[5].phone; return ['diario', Math.max(0, t - t0), { stampAt: 29.5 - t0, gestAt: 30.0 - t0 }];
}
const TAPS = [[7.0, 540, 1276], [18.5, 540, 1310], [20.0, 540, 1276]];   // [t, x, y] en la pantalla del móvil a 1:1 (centro en 540, 840)
function lucia(g, t, cam) {
  if (t >= 41.3) return;
  const up = cam.w.phone || 0, o = { who: 'lucia', s: CS, lw: LW(8), mouth: mouthOf('lucia', t), blink: blink(t, 1.9), eyes: 'open', shape: 'smile' };
  let x = LX, y = BASEY + hopY(t, 8) * (1 - up);
  const jT = [1, 2, 3, 4, 5].map(r => ROUNDS[r].judge), ch = jT.some(j => t >= j && t < j + .8);
  const hasPhone = t < 38.5;
  // mano derecha: sujeta el móvil (en reposo, en alto al celebrar o acercándolo a la cámara)
  const rest = ch ? [190, -440] : [104, -176], s = Math.exp(lerp(Math.log(PH_REST), Math.log(PH_UP.s), up));
  const restC = [LX + (rest[0] - 6) * CS, BASEY + (rest[1] - 70) * CS], c = [lerp(restC[0], PH_UP.x, up), lerp(restC[1], PH_UP.y, up)];
  const grip = [c[0] + (SW / 2 - 40) * s * up, c[1] + (SH / 2 - 150) * s * up + 70 * CS * (1 - up)];
  if (hasPhone) o.R = [(grip[0] - LX) / CS, (grip[1] - BASEY) / CS];
  if (ch) { o.arms = 'up'; o.L = [-190, -440]; o.eyes = 'happy'; o.shape = 'grin'; o.mouth = .7; o.sq = hitSq(t, jT.filter(j => j <= t).pop(), .1); }
  if (t < BELL) { o.eyes = t > 2.6 && t < 3.0 ? 'wink' : 'open'; o.look = [-.6, 0]; if (t > 4.2) o.sq = -.05; }
  if (up > .3 && !ch) {   // mirando su móvil: sonríe cuando sale bien
    const r = roundAt(t), happy = (r === 1 && t > 7.2) || (r === 2 && t > 14.6) || (r === 3 && t > 20.05) || r === 4 || (r === 5 && t > 29.6);
    o.look = [.7, -.2]; o.eyes = happy ? (r === 1 ? 'wink' : 'happy') : 'open'; o.shape = happy ? 'grin' : 'smile'; o.mouth = Math.max(o.mouth, happy ? .45 : 0);
  }
  if (t >= FINAL) {
    o.eyes = 'happy'; o.shape = 'grin'; o.L = [-150, -150]; o.propL = t >= 38.5 ? 'bag' : null; if (!hasPhone) o.R = [170, -150];
    const u = seg(t, 39, 40); x = lerp(LX, DX, eo(u)); y = BASEY + (u > 0 && u < 1 ? hopY(t, 22) : 0);
    if (t >= 40.1) { o.R = [200 + Math.sin(t * 14) * 30, -400]; o.mouth = mouthOf('lucia', t); o.shape = 'smile'; }
  }
  const k = t >= 41.05 ? 1 - ei(seg(t, 41.05, 41.3)) : 1;
  g.save(); g.translate(x, BASEY); g.scale(k, k); g.translate(-x, -BASEY);
  bean(g, x, y, o);
  g.restore();
  return { hasPhone, c, s, tilt: .12 * (1 - up), up, grip };
}
function luciaPhone(g, t, P) {
  if (!P || !P.hasPhone) return;
  const [scr, u, opts] = phoneState(t);
  phone(g, P.c[0], P.c[1], P.s, scr, u, opts, { tilt: P.tilt });
  mitten(g, P.grip[0], P.grip[1], 1, LW(8) / CS, CS);                // la mano que lo sujeta, por delante
  // la otra manopla pulsa la pantalla
  for (const [tt, sx, sy] of TAPS) {
    if (t < tt - .5 || t > tt + .35) continue;
    const a = seg(t, tt - .45, tt - .08), b = seg(t, tt, tt + .3);
    const px = lerp(lerp(960, sx + 40, eo(a)), 980, ei(b)), py = lerp(lerp(1750, sy - 60, eo(a)), 1780, ei(b)) + (t > tt - .08 && t < tt + .05 ? 50 : 0);
    const cs = Math.cos(P.tilt), sn = Math.sin(P.tilt), dx = (px - 540) * P.s, dy = (py - 840) * P.s;
    mitten(g, P.c[0] + dx * cs - dy * sn, P.c[1] + dx * sn + dy * cs, -1, 9, 1.8 * P.s);
  }
}

// ——— el presentador ———
function host(g, t) {
  const m = mouthOf('host', t);
  if (t < 41.0) {   // en su marca, a la izquierda del plató
    const card = (t >= 10.5 && t < 12.0) || (t >= 21.5 && t < 22.75);
    const o = { who: 'host', s: HOST.s, lw: LW(8), mouth: m, shape: m > .05 ? 'smile' : 'grin', eyes: 'open', brows: 'up', R: [96, -232], propR: 'mic', blink: t < 1.5 ? false : blink(t, .4) };
    o.L = t < 1.5 ? [-215, -250] : card ? [-180, -440 + Math.sin(t * 8) * 20] : [-200, -300];
    if (t < 1.5) o.sq = hitSq(t, .06, .05);
    bean(g, HOST.x, HOST.y + hopY(t, t < 1.5 ? 10 : 12), o);
    return;
  }
  // de noche sale por la puerta con su móvil; luego celebra con Javier
  if (t < NIGHT[0]) return;
  const open = clamp(seg(t, 42.05, 42.25)); if (open <= 0) return;
  const u = seg(t, 42.25, 42.95), hx = lerp(DX, 568, eo(u)), hs = lerp(.75, 1.08, eo(u)), won = t >= WIN;
  const o = { who: 'host', s: hs, lw: LW(8), mouth: m, shape: 'smile', eyes: 'open', look: [-1, 0], R: [150, -110], blink: blink(t, 1.2) };
  o.L = t < 43.55 ? (u > .6 ? [-215, -255] : [-170, -150]) : [-200, -200];
  if (won) Object.assign(o, { arms: 'up', L: undefined, R: undefined, eyes: 'happy', shape: 'grin', mouth: Math.max(m, .5), look: [0, 0] });
  bean(g, hx, BASEY + (u > 0 && u < 1 ? hopY(t, 16) : won ? hopY(t, 18, .25) : 0), o);
  return { hx, hs, o };
}
// el móvil que el presentador le presta a Javier
function lentPhone(g, t, Hs) {
  if (t < 42.05 || t >= 46.75) return;
  const J = [JX + 18, 1025], won = t >= WIN, hand = Hs && Hs.o.L ? [Hs.hx + Hs.o.L[0] * Hs.hs, BASEY + Hs.o.L[1] * Hs.hs - 60] : null;
  const k = eo(seg(t, 43.55, 43.9));
  if (!hand && k < 1) return;
  let x = hand ? lerp(hand[0], J[0], k) : J[0], y = hand ? lerp(hand[1], J[1], k) : J[1], s = lerp(.11, .16, k), rot = lerp(.15, -.05, k);
  if (won && t > WIN + .45) { const a = eo(seg(t, WIN + .45, WIN + .7)); x = lerp(J[0], JX - 70, a); y = lerp(J[1], 1060, a) - Math.sin(a * Math.PI) * 60; rot = lerp(-.05, -1.35, a); }
  phone(g, x, y, s, won ? 'emitida' : 'nueva', won ? t - WIN : 0, { press: seg(t, WIN, WIN + .3) }, { tilt: rot });
  if (k >= 1 && !(won && t > WIN + .45)) {
    const a = seg(t, 44.0, 44.42);
    mitten(g, lerp(JX + 150, J[0] + 4, eo(a)), lerp(1180, J[1] + 62, eo(a)), -1, LW(8) / (CS * .75), CS * .75);
  }
}

// ——— la pantalla gigante ———
function videowall(g, t, v) {
  const x0 = VW.x - VW.w / 2, y0 = VW.y - VW.h / 2;
  if (x0 - 120 > v.x1 || x0 + VW.w + 120 < v.x0 || y0 - 120 > v.y1 || y0 + VW.h + 120 < v.y0) return;
  g.lineWidth = LW(10); g.strokeStyle = K.ol; for (const lx of [x0 + 90, x0 + VW.w - 90]) { g.beginPath(); g.moveTo(lx, y0 + VW.h); g.lineTo(lx, FLOOR); g.stroke(); }
  sticker(g, x0 - 44, y0 - 44, VW.w + 88, VW.h + 88, 46, '#15152A', { sh: 14, ow: LW(10) });
  const n = 18; for (let i = 0; i < n; i++) {   // bombillas de marquesina alrededor
    const u = i / n, on = (Math.floor(t * 6) + i) % 3 === 0, px = x0 - 22 + u * (VW.w + 44), col = on ? K.yellow : '#7A6A2E';
    ellipse(g, px, y0 - 22, 9, 9, col); ellipse(g, x0 + VW.w + 22 - u * (VW.w + 44), y0 + VW.h + 22, 9, 9, col);
  }
  for (let i = 0; i < 26; i++) { const u = i / 26, on = (Math.floor(t * 6) + i) % 3 === 0, col = on ? K.yellow : '#7A6A2E'; ellipse(g, x0 - 22, y0 + VW.h - u * VW.h, 9, 9, col); ellipse(g, x0 + VW.w + 22, y0 + u * VW.h, 9, 9, col); }
  g.save(); g.beginPath(); g.rect(x0, y0, VW.w, VW.h); g.clip(); g.translate(x0, y0); g.scale(VW.w / W, VW.h / H);
  const M = g.getTransform();
  screenContent(g, t, IMG, (id, s, b) => txw(id, s, b, M));
  g.restore();
}

// ——— la noche: todo a oscuras menos los conos de luz ———
function nightMask(g, t) {
  const mg = LIGHT.getContext('2d'); mg.setTransform(1, 0, 0, 1, 0, 0); mg.globalCompositeOperation = 'source-over'; mg.clearRect(0, 0, W, H);
  mg.fillStyle = 'rgba(10,10,32,.64)'; mg.fillRect(0, 0, W, H); mg.globalCompositeOperation = 'destination-out'; mg.fillStyle = '#000';
  mg.setTransform(SM);
  const cone = (cx, a, b) => { mg.beginPath(); mg.moveTo(cx - a, -400); mg.lineTo(cx + a, -400); mg.lineTo(cx + b, 1360); mg.lineTo(cx - b, 1360); mg.closePath(); mg.fill(); };
  const open = clamp(seg(t, 42.05, 42.25)), u = seg(t, 42.25, 42.95);
  cone(JX, 70, 260); if (open > 0) cone(lerp(DX, 568, eo(u)), 40, 150 + 60 * u);
  g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(LIGHT, 0, 0);
}

// ——— el final: los cinco trofeos se funden en el logo y cae el telón ———
function merge(g, t) {
  if (t < 46.5) return;
  if (t < LOGO + .02) for (let i = 1; i <= 5; i++) {
    const u = seg(t, 46.5 + (i - 1) * .04, LOGO), e = ei(u), [sx, sy] = slotXY(i);
    const ang = e * Math.PI * 1.2 + i, rad = (1 - e) * 260;
    const x = lerp(sx, 540, e) + Math.cos(ang) * rad * Math.sin(u * Math.PI), y = lerp(sy, 820, e) + Math.sin(ang) * rad * .6 * Math.sin(u * Math.PI);
    g.save(); g.translate(x, y); g.rotate(e * 6); icon(g, ROUNDS[i].icon, 0, 0, lerp(1.35, .7, e), t); g.restore();
  }
  if (t >= LOGO) {
    const k = back(seg(t, LOGO, LOGO + .3), 2.6), up = eo(seg(t, 47.3, 47.5)), sz = 300, bob = t > 47.5 ? Math.sin(t * Math.PI) * 6 : 0;
    g.save(); g.translate(540, lerp(820, 520, up) + bob); g.scale(k * lerp(1, .77, up), k * lerp(1, .77, up));
    g.fillStyle = K.ol; rr(g, -sz / 2 + 16, -sz / 2 + 16, sz, sz, 84); g.fill(); logoTile(g, -sz / 2, -sz / 2, sz);
    g.restore();
  }
}
function curtain(g, t) {
  const d = seg(t, CURTAIN[0], CURTAIN[1]); if (d <= 0) return;
  const bottom = lerp(-300, 1362, back(d, 1.3)), sway = t > CURTAIN[1] ? Math.sin((t - CURTAIN[1]) * 5) * 6 * Math.exp(-(t - CURTAIN[1]) * 1.6) : 0;
  const x0 = -700, x1 = 1780, fw = 90;
  g.save();
  for (let i = 0, x = x0; x < x1; i++, x += fw) {
    const ox = Math.sin(i * 1.7 + t * 1.3) * 3 + sway * (i % 2 ? 1 : -1);
    g.fillStyle = i % 2 ? K.wine : '#9A2350'; g.fillRect(x + ox, -2600, fw + 2, bottom + 2600);
    g.fillStyle = i % 2 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.06)'; g.fillRect(x + ox + fw * .3, -2600, fw * .25, bottom + 2600);
  }
  g.lineWidth = 4; g.strokeStyle = 'rgba(27,27,27,.45)';
  for (let x = x0; x < x1; x += fw) { g.beginPath(); g.moveTo(x, -2600); g.lineTo(x, bottom); g.stroke(); }
  // flecos dorados abajo
  g.fillStyle = K.gold; g.fillRect(x0, bottom - 34, x1 - x0, 34); g.fillStyle = K.ol; g.fillRect(x0, bottom - 38, x1 - x0, 6); g.fillRect(x0, bottom - 2, x1 - x0, 6);
  for (let x = x0; x < x1; x += 26) { g.beginPath(); g.moveTo(x, bottom); g.lineTo(x + 13, bottom + 22); g.lineTo(x + 26, bottom); g.fillStyle = K.gold; g.fill(); g.lineWidth = 3; g.strokeStyle = K.ol; g.stroke(); }
  g.restore();
}
function endCard(g, t) {
  if (t < CURTAIN[1]) return;
  const kb = pop(t, 47.6, .25);
  if (kb > 0) { g.save(); g.translate(540, 790); g.scale(kb, kb); g.font = f(600, 112, 'Fraunces'); g.textAlign = 'center'; g.fillStyle = K.ol; g.fillText('Klimafacturas', 8, 8); g.fillStyle = K.paper; g.fillText('Klimafacturas', 0, 0); g.restore(); txw('brand', 'Klimafacturas', [150, 700, 930, 810]); }
  const k1 = pop(t, 48.4, .25), k2 = pop(t, 49.25, .25), k3 = pop(t, 49.6, .25);
  if (k1 > 0) { g.save(); g.translate(540, 900); g.scale(k1, k1); telop(g, 'Factura, cobra… y sal antes.', 0, 22, 62, { fill: K.white, sw: .14, sh: 6 }); g.restore(); txw('tag', 'Factura, cobra… y sal antes.', [90, 850, 990, 940]); }
  if (k2 > 0) { g.save(); g.translate(540, 1050); g.scale(k2, k2); const w = measure(g, 'klimafacturas.com', 60, 700) + 100; sticker(g, -w / 2, -56, w, 112, 56, K.cream, { sh: 10, ow: 8 }); text(g, 'klimafacturas.com', 0, 21, 60, K.ol, { w: 700, align: 'center' }); g.restore(); txw('url', 'klimafacturas.com', [180, 990, 900, 1110]); }
  if (k3 > 0) { g.save(); g.translate(540, 1185); g.scale(k3, k3); text(g, 'Sin permanencia', 0, 16, 46, K.paper, { w: 600, align: 'center' }); g.restore(); txw('perm', 'Sin permanencia', [330, 1140, 750, 1200]); }
  // los tres saludan delante del telón
  const m = mouthOf('host', t), kj = pop(t, 47.62, .3), kl = pop(t, 47.72, .3), kh = pop(t, 47.82, .3);
  const at = (k, x, y, fn) => { if (k <= 0) return; g.save(); g.translate(x, y); g.scale(k, k); g.translate(-x, -y); fn(); g.restore(); };
  at(kj, 250, 1660, () => bean(g, 250, 1660 + hopY(t, 14, .25), { who: 'javier', s: .82, lw: 7, eyes: 'happy', shape: 'grin', mouth: .4, arms: 'up', blink: false }));
  at(kl, 830, 1660, () => bean(g, 830, 1660 + hopY(t, 14, .25), { who: 'lucia', s: .82, lw: 7, eyes: 'happy', shape: 'grin', mouth: .4, R: [200 + Math.sin(t * 12) * 26, -400], L: [-178, -110], blink: false }));
  at(kh, 540, 1700, () => bean(g, 540, 1700 + hopY(t, 10), { who: 'host', s: .9, lw: 7, mouth: m, shape: m > .05 ? 'smile' : 'grin', R: [96, -232], propR: 'mic', L: [-200, -380], blink: blink(t, .6) }));
}

// ——— un fotograma ———
function world(g, t, cam) {
  backdrop(g, t, cam);
  use(g, SM); const v = seen(SM);
  // pared: columnas de bombillas, marcador, puerta, pantalla gigante y cartel colgante
  for (const [x, ph] of [[26, 0], [1054, 1], [-1180, 0], [1200, 1]]) if (x > v.x0 - 60 && x < v.x1 + 60) bulbColumn(g, x, 380, 9, t, ph);
  scoreboard(g, t);
  const doorOpen = t >= FINAL && t < NIGHT[0] ? clamp(seg(t, 39.9, 40.1)) * (1 - seg(t, 41.25, 41.4)) : t >= NIGHT[0] ? clamp(seg(t, 42.05, 42.25)) : 0;
  door(g, t, doorOpen);
  videowall(g, t, v);
  sign(g, t);
  // suelo: el desorden de Javier
  floorMess(g, t);
  if (t < ROUNDS[1].judge + .5) paperTower(g, t, 92, 1340, 38, t > 4 ? .5 : .25);
  // personajes y atriles
  const J = javier(g, t, cam);
  podium(g, JX, 'JAVIER', 'a mano', 0, K.javier, t, []);
  javierDesk(g, t, J);
  const P = lucia(g, t, cam);
  podium(g, LX, 'LUCÍA', 'con Klimafacturas', score(t), K.lucia, t, [1, 2, 3, 4, 5].map(r => ROUNDS[r].judge));
  luciaPhone(g, t, P);
  if (t >= 1.5 && t < 5) { txw('pj', 'JAVIER', [JX - 170, PODY + 40, JX + 170, PODY + 110]); txw('pl', 'LUCÍA', [LX - 170, PODY + 40, LX + 170, PODY + 110]); txw('pls', 'con Klimafacturas', [LX - 170, PODY + 105, LX + 170, PODY + 140]); }
  const Hs = host(g, t);
  lentPhone(g, t, Hs);
  // consecuencias y celebraciones
  const R1 = ROUNDS[1].judge, R3 = ROUNDS[3].judge;
  if (t >= R1 + .5 && t < R1 + 2) fallingPapers(g, t, R1 + .5, 92, 1100, 16, 1, JX, 860);
  if (t >= R3 + .25 && t < R3 + 2) ticketsBurst(g, t, R3 + .25, JX, PODY - 40);
  for (const r of [1, 2, 3, 4, 5]) { const R = ROUNDS[r]; burst(g, LX, 760, t, R.judge, K.yellow, .9); trophyFlight(g, t, r); }
  if (t >= WIN) burst(g, JX, 900, t, WIN, K.white, 1.2);
  curtain(g, t);
  merge(g, t);
  endCard(g, t);
  // el público, delante de todo
  const MC = layerM(cam, 1.25); use(g, MC); crowd(g, t, MC);
  if (t >= NIGHT[0] && t < WIN) nightMask(g, t);
}
// desenfoque de movimiento: la imagen se promedia con la cámara de medio fotograma antes y después
function motionBlur(t, cam) {
  const M0 = SM, inv = M0.inverse(), A = layerM(camera(t - 1 / 96), 1).multiply(inv), B = layerM(camera(t + 1 / 96), 1).multiply(inv);
  let d = 0; for (const [x, y] of [[0, 0], [W, 0], [0, H], [W, H], [540, 960]]) { const a = A.transformPoint(new DOMPoint(x, y)), b = B.transformPoint(new DOMPoint(x, y)); d = Math.max(d, Math.hypot(a.x - b.x, a.y - b.y)); }
  if (d < 5) return;
  const n = Math.min(14, Math.ceil(d / 7) + 1), bg = BUF.getContext('2d');
  bg.setTransform(1, 0, 0, 1, 0, 0); bg.clearRect(0, 0, W, H); bg.drawImage(c, 0, 0);
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1), M = layerM(camera(t - 1 / 96 + u / 48), 1).multiply(inv);
    g.setTransform(M); g.globalAlpha = 1 / (i + 1); g.drawImage(BUF, 0, 0);
  }
  g.globalAlpha = 1; g.setTransform(1, 0, 0, 1, 0, 0);
}
function overlays(g, t, cam) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  if (t < BELL) live(g, t);
  if (t >= 2 && t < BELL) { telopPop(g, '¿QUIÉN SALE', W / 2, 340, 124, t, 2.0, { fill: K.yellow, sw: .15, sh: 10 }); telopPop(g, 'ANTES?', W / 2, 478, 150, t, 2.3, { fill: K.white, sw: .15, sh: 10 }); tx('title', '¿QUIÉN SALE ANTES?', [90, 240, 990, 500]); }
  if (t >= VO.c1[0] && t < BELL) roundBanner(g, 1, t, 'center', VO.c1[0]);
  // rótulo de la prueba en la esquina mientras la cámara está cerca (no en el plano general del veredicto)
  const r = roundAt(t);
  if (r) { const R = ROUNDS[r], a = r === 1 ? BELL : R.start, kout = 1 - ei(seg(t, R.judge - .3, R.judge - .1)); if (t >= a && t < R.judge - .1) roundBanner(g, r, t, 'corner', r === 1 ? BELL - .25 : a, kout); }
  for (const i of [1, 2, 3, 4, 5]) { const R = ROUNDS[i]; judge(g, R.word, W / 2, 520, t, R.judge, { col: K.yellow, size: R.word.length > 10 ? 104 : 124, dur: i === 1 ? 1.25 : .8 }); }
  if (t >= FINAL && t < NIGHT[0]) { const k = pop(t, FINAL, .3); g.save(); g.translate(W / 2, 345); g.scale(k, k); telop(g, '5 · 0', 0, 40, 112, { fill: K.yellow, sw: .15, sh: 10 }); g.restore(); }
  if (t >= WIN && t < WIN + 1.9) judge(g, '¡PERFECTO!', W / 2, 470, t, WIN, { col: K.yellow, size: 150, dur: 1.6 });
  if (t >= ASK) { telopPop(g, '¿Y TÚ, A QUÉ HORA', W / 2, 250, 76, t, ASK, { fill: K.yellow, sw: .15, sh: 7, stg: .02 }); telopPop(g, 'SALES HOY?', W / 2, 345, 84, t, ASK + .2, { fill: K.yellow, sw: .15, sh: 7, stg: .02 }); tx('ask', '¿Y TÚ, A QUÉ HORA SALES HOY?', [150, 180, 930, 370]); }
  plate(g, t);
  for (const [ft, a] of FLASH) if (t >= ft && t < ft + .08) { g.fillStyle = `rgba(255,255,255,${a * (1 - (t - ft) / .08)})`; g.fillRect(0, 0, W, H); }
}
window.render = (t) => {
  t = clamp(t, 0, DUR - 1e-4); TX = [];
  const cam = camera(t);
  SM = layerM(cam, 1); LWK = Math.pow(cam.z, -.4);
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  world(g, t, cam);
  motionBlur(t, cam);
  overlays(g, t, cam);
  // el último fotograma se queda; nada se funde a negro
};
window.TEXTS = () => TX;
window.READY = true;
