// «La cadena» · reel de Klimafacturas (1080×1920, 30 fps, 30 s). Una sola toma: la cámara nunca corta.
// render(t) es una función pura de t. Cada fotograma en movimiento es la media de varios instantes dentro de un
// obturador de 180°: los látigos se emborronan como en una cámara de verdad.
import { W, H, clamp, lerp, seg, ease, spring, kick, hash, text, setFont, measure, rr, fmt } from './lib.js';
import { T, CAM, CAPTIONS, DUR, FPS, BPM, BAR0 } from './timeline.js';
import { C, S, POSES, REC, recTop, recX, CARD, TILE, SPARKC, kPath, sparkPath } from './world.js';
import { record, printer, seal, hashCharWorld, L, cracks } from './paper.js';
import { cobro, ledger, hacienda, legCards, cardOrigin } from './cards.js';
import { shockwave, glow, odometer, flapTile, glitch, rewindFX, spark } from './fx.js';

const cv = document.getElementById('c'), G = cv.getContext('2d');
const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
const ACC = mk(), SUB = mk(), A = ACC.getContext('2d'), B = SUB.getContext('2d');

await document.fonts.load('700 40px "Plex"'); await document.fonts.load('600 40px "Plex"'); await document.fonts.load('500 40px "Plex"');
await document.fonts.load('italic 600 40px "Fraunces"'); await document.fonts.load('600 40px "Fraunces"');
for (const w of [500, 600, 700]) await document.fonts.load(`${w} 40px "PlexMono"`);
const CH = await (await fetch('chain.json')).json();
const REG = CH.cadena;                                  // 0 = la más antigua … 4 = la más nueva (FAC-2026/0149)
const PHOTO = new Image(); PHOTO.src = 'img/mostrador-1920.webp'; await PHOTO.decode();
const blurred = px => { const c = document.createElement('canvas'); c.width = 960; c.height = 540; const q = c.getContext('2d'); q.filter = `blur(${px}px)`; q.drawImage(PHOTO, 0, 0, 960, 540); return c; };
const PH = [PHOTO, blurred(3), blurred(10)];

// ——— la cámara ———
const POSE = k => POSES[k];
function camBase(t) {
  let i = 0; while (i < CAM.length - 1 && t >= CAM[i + 1][0]) i++;
  const a = CAM[i], b = CAM[Math.min(i + 1, CAM.length - 1)], pa = POSE(a[1]), pb = POSE(b[1]);
  const u = b === a ? 0 : clamp((t - a[0]) / (b[0] - a[0])), e = ease[a[2]](u);
  const z = Math.exp(lerp(Math.log(pa.z), Math.log(pb.z), e));
  let x, y;
  if (Math.abs(Math.log(pb.z / pa.z)) > 1e-3) {   // zoom alrededor del punto fijo de los dos encuadres: un solo gesto
    const fx = (pa.x * pa.z - pb.x * pb.z) / (pa.z - pb.z), fy = (pa.y * pa.z - pb.y * pb.z) / (pa.z - pb.z);
    x = fx - (fx - pa.x) * pa.z / z; y = fy - (fy - pa.y) * pa.z / z;
  } else { x = lerp(pa.x, pb.x, e); y = lerp(pa.y, pb.y, e); }
  return { x, y, z };
}
// pausas (curva 'hold'): la mano se va del todo; vuelve cuando la cámara se mueve
const HOLDS = CAM.slice(0, -1).map((k, i) => [k, CAM[i + 1]]).filter(([a]) => a[2] === 'hold').map(([a, b]) => [a[0], b[0]]);
const holdAt = t => Math.max(0, ...HOLDS.map(([a, b]) => clamp(seg(t, a, a + .25)) * (1 - seg(t, b, b + .2))));
// llegadas: al acabar un movimiento hacia otro encuadre, la cámara se pasa un pelo y se asienta
const LANDS = [];
for (let i = 0; i < CAM.length - 1; i++) {
  const [, a, e] = CAM[i], [t1, b] = CAM[i + 1];
  if (a === b || e === 'lin' || e === 'hold') continue;
  const pa = POSE(a), pb = POSE(b), dx = pb.x - pa.x, dy = pb.y - pa.y, l = Math.hypot(dx, dy) || 1;
  LANDS.push({ t: t1, ux: dx / l, uy: dy / l, z: Math.sign(Math.log(pb.z / pa.z)), a: e === 'expoInOut' ? 11 : 6 });
}
const PUNCH = [];
const punch = (t, a) => PUNCH.push([t, a]);
function camera(t) {
  const c = camBase(t), hand = (1 - holdAt(t)) * (t > T.still ? 0 : 1);
  c.sx = (3.2 * Math.sin(t * 1.7) + 1.6 * Math.sin(t * 3.1 + 1.3)) * hand;
  c.sy = (2.6 * Math.sin(t * 1.4 + .5) + 1.4 * Math.sin(t * 3.7 + 2.1)) * hand;
  c.r = .0016 * Math.sin(t * 1.2 + .8) * hand;
  let kz = 1;
  for (const Ld of LANDS) { const u = t - Ld.t; if (u < 0 || u > .7) continue; const w = Math.exp(-u * 9) * Math.sin(u * 2 * Math.PI * 5.5); c.sx -= Ld.ux * Ld.a * w; c.sy -= Ld.uy * Ld.a * w; kz *= 1 + Ld.z * .007 * w; }
  for (const [ti, a] of PUNCH) if (t >= ti && t < ti + .6) kz *= 1 + a * Math.exp(-(t - ti) * 10) * Math.cos((t - ti) * 26);
  c.kz = kz;
  return c;
}
const matrix = c => new DOMMatrix().translate(W / 2 + c.sx, H / 2 + c.sy).rotate(c.r * 180 / Math.PI).scale(c.z * c.kz).translate(-c.x, -c.y);
const proj = (M, [x, y]) => { const p = M.transformPoint(new DOMPoint(x, y)); return [p.x, p.y]; };

// ——— golpes de cámara y eventos de sonido (se calculan una vez) ———
const EV = [];
const ev = (t, type, o = {}) => EV.push({ t: +t.toFixed(3), type, ...o });
punch(T.hit, .05); punch(T.seal, .035); punch(T.aval, .03); punch(T.pluck, .02); punch(T.wave[0], .03); punch(T.verifactu, .045);
punch(T.paid, .02); punch(T.balance, .025); punch(T.logo, .06);
ev(0, 'riser', { t1: T.hit }); ev(.02, 'comet', { pan: .5 }); ev(T.hit, 'hit', { big: 1 }); ev(T.paper[0] + .02, 'feed', { t1: T.paper[1] });
ev(T.print[0], 'buzz', { t1: T.print[1] }); ev(T.seal, 'stamp', { big: 1 });
for (let i = 0; i < CAM.length - 1; i++) {   // cada movimiento de cámara suena a aire, panoramizado hacia donde va
  const [t0, a, e] = CAM[i], [t1, b] = CAM[i + 1]; if (a === b || e === 'lin' || e === 'hold') continue;
  const pa = POSE(a), pb = POSE(b), pan = clamp((pb.x - pa.x) / 1500, -.7, .7), zoom = Math.log(pb.z / pa.z);
  ev(t0, 'whoosh', { d: +(t1 - t0).toFixed(3), pan: +pan.toFixed(2), up: zoom > 0 ? 1 : 0, big: Math.abs(zoom) > 1.2 ? 1 : 0 });
}
ev(T.fly[0], 'lift'); ev(T.cent, 'tick', { f: 2400 }); ev(T.aval, 'drop'); ev(T.aval, 'flaps', { t1: T.aval + .75 });
ev(T.back[0] + .05, 'lift', { soft: 1 });
for (let i = 0; i < 4; i++) ev(T.links[0] + i * .12 + .15, 'link', { n: i });
ev(T.pluck, 'pluck'); ev(T.glitch[0], 'glitch'); ev(T.crack[0], 'crack');
[0, 1, 2].forEach(i => ev(T.wave[0] + i * .28, 'snap', { n: i })); ev(T.wave[0], 'alarm', { t1: T.wave[1] });
ev(T.freeze[0], 'stop'); ev(T.rewind[0], 'rewind', { t1: T.rewind[1] });
for (let i = 0; i < 5; i++) ev(T.green[0] + i * .06, 'check', { n: i });
ev(T.verifactu, 'stamp', { big: 2 }); ev(T.implode[0], 'implode');
ev(T.payTap, 'tap'); ev(T.sheet[0], 'sheet'); ev(T.confirm, 'tap', { soft: 1 }); ev(T.notif, 'coin'); ev(T.paid, 'flip');
ev(18.56, 'chip'); [0, 1, 2].forEach(i => ev(T.ledger[0] + i * .1, 'row', { n: i })); ev(T.balance, 'snapok');
ev(21.86, 'chip'); ev(T.iva[1], 'drop2'); ev(T.odo[0], 'odo', { t1: T.odo[1] }); ev(T.odo[1], 'check', { n: 4 });
ev(T.breath[0], 'breath'); ev(T.reveal[0], 'swell', { t1: T.logo }); ev(T.logo, 'logo'); ev(T.word, 'word'); ev(T.ctaTap, 'tap', { soft: 1 });
EV.push({ t: 0, type: 'meta', bpm: BPM, bar0: BAR0, dur: DUR });
EV.sort((a, b) => a.t - b.t);
window.EV = EV; window.DUR = DUR;

// ——— la chispa (el dedo de la película): claves con destino en el mundo (w) o en pantalla (s) ———
const GRID = { x: 540, y: 1010, pitch: 112, s: 104 }, AMT = { x: 540, y: 498, size: 96 };
const gridXY = j => [GRID.x + ((j % 8) - 3.5) * GRID.pitch, GRID.y + (Math.floor(j / 8) - 3.5) * GRID.pitch];
const wallK = t => 1 + .05 * ease.sine(seg(t, T.aval + .5, T.back[0] + .2));   // la pared se acerca despacio tras la avalancha
const wallXY = (p, t) => { const k = wallK(t); return [GRID.x + (p[0] - GRID.x) * k, GRID.y + (p[1] - GRID.y) * k]; };
const ROLL = [1292, 566];                                    // el rollo en la foto (píxeles de la foto)
const totalDigitWorld = (i, slot) => { G.font = '700 86px "PlexMono"'; const adv = G.measureText('0').width; return [recX() + L.x + slot * adv + adv / 2, recTop(i) + L.total - 30]; };
const SP = [   // [t, destino, curva hasta la siguiente, radio, visible]
  [0, { s: [1240, -160] }, 'cubicIn', 30, 1], [T.hit, { photo: ROLL }, 'expoOut', 30, 1], [T.hit + .14, { photo: ROLL }, 'lin', 0, 0],
  [6.05, { s: [1200, 260] }, 'expoInOut', 26, 1], [T.cent - .02, { amt: 7 }, 'sine', 26, 1], [6.42, { amt: 7 }, 'expoIn', 26, 1], [6.62, { s: [1220, 120] }, 'lin', 26, 0],
  [9.55, { s: [1200, 380] }, 'expoInOut', 26, 1], [T.pluck, { w: totalDigitWorld(1, 4) }, 'expoInOut', 26, 1], [T.pluck + .4, { s: [1240, 300] }, 'lin', 26, 0],
  [T.rewind[0], { s: [1240, 300] }, 'expoInOut', 26, 1], [T.rewind[1] - .1, { w: totalDigitWorld(1, 4) }, 'lin', 26, 0],
  [15.05, { s: [1200, 1700] }, 'expoInOut', 26, 1], [T.payTap, { w: [cardOrigin('cobro')[0] + 220, cardOrigin('cobro')[1] + 526] }, 'sine', 26, 1],
  [T.confirm - .2, { w: [cardOrigin('cobro')[0] + 300, cardOrigin('cobro')[1] + 530] }, 'expoInOut', 26, 1], [T.confirm, { w: [cardOrigin('cobro')[0] + 330, cardOrigin('cobro')[1] + 580] }, 'expoIn', 26, 1],
  [T.notif, { s: [1240, 1500] }, 'lin', 26, 0],
  [T.reveal[0] + .3, { s: [880, 1200] }, 'expoInOut', 26, 1], [T.logo, { w: SPARKC }, 'lin', 0, 1], [DUR, { w: SPARKC }, 'lin', 0, 1],
];
function sparkTarget(d, M, t) {
  if (d.s) return d.s;
  if (d.w) return proj(M, d.w);
  if (d.photo) return photoXY(t, d.photo);
  if (d.amt) return amtDigitXY(d.amt);
}
function sparkAt(t, M) {
  let i = 0; while (i < SP.length - 1 && t >= SP[i + 1][0]) i++;
  const a = SP[i], b = SP[Math.min(i + 1, SP.length - 1)], u = b === a ? 1 : clamp((t - a[0]) / (b[0] - a[0])), e = ease[a[2]](u);
  const pa = sparkTarget(a[1], M, t), pb = sparkTarget(b[1], M, t);
  return { x: lerp(pa[0], pb[0], e), y: lerp(pa[1], pb[1], e), vis: a[4] && (b[4] || u < .98), r: lerp(a[3], b[3], e) };
}

// ——— la foto del mostrador (la portada de la web) ———
// una banda panorámica nítida (sin ampliar más de lo que da la foto) que, al golpe, se echa encima de la cámara y se
// desenfoca mientras aparece la cinta
function photoScale(t) { return lerp(.94, 1.02, ease.sine(seg(t, 0, T.hit))) * (1 + 1.6 * ease.expoOut(seg(t, T.hit, T.hit + 1.2))); }
const PHC = [1292, 566], PHS = [540, 1170];   // el rollo de la foto, y dónde cae en pantalla
function photoXY(t, [px, py]) { const s = photoScale(t); return [PHS[0] + (px - PHC[0]) * s, PHS[1] + (py - PHC[1]) * s]; }
const PC = mk(), PQ = PC.getContext('2d');
function photo(g, t) {
  const a = 1 - ease.cubic(seg(t, T.hit, T.hit + 1.1)) * .88 - .12 * seg(t, 3.6, 4.6); if (a <= 0) return;
  const s = photoScale(t), bl = seg(t, T.hit, T.hit + .5), x = PHS[0] - PHC[0] * s, y = PHS[1] - PHC[1] * s, w = 1920 * s, h = 1080 * s;
  const q = PQ; q.setTransform(1, 0, 0, 1, 0, 0); q.globalCompositeOperation = 'source-over'; q.globalAlpha = 1; q.clearRect(0, 0, W, H);
  const im = bl < .5 ? PH[0] : PH[1], im2 = bl < .5 ? PH[1] : PH[2], k = bl < .5 ? bl * 2 : bl * 2 - 1;
  q.drawImage(im, x, y, w, h); if (k > 0) { q.globalAlpha = k; q.drawImage(im2, x, y, w, h); q.globalAlpha = 1; }
  // la luz de la portada: más oscuro arriba, donde va el titular
  const sc = q.createLinearGradient(0, y, 0, y + h);
  sc.addColorStop(0, 'rgba(35,12,20,.75)'); sc.addColorStop(.3, 'rgba(35,12,20,.4)'); sc.addColorStop(.6, 'rgba(58,20,32,.08)'); sc.addColorStop(1, 'rgba(42,15,25,.45)');
  q.globalCompositeOperation = 'source-atop'; q.fillStyle = sc; q.fillRect(0, 0, W, H);
  // y los bordes de la banda fundidos de verdad (máscara), sin costura con el fondo
  const m = q.createLinearGradient(0, y, 0, y + h);
  m.addColorStop(0, 'rgba(0,0,0,0)'); m.addColorStop(.24, 'rgba(0,0,0,1)'); m.addColorStop(.8, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)');
  q.globalCompositeOperation = 'destination-in'; q.fillStyle = m; q.fillRect(0, 0, W, H);
  g.save(); g.globalAlpha = a; g.drawImage(PC, 0, 0); g.restore();
}

// ——— el fondo: vino oscuro con un brillo rosa que sigue a la acción y una retícula lejana ———
function backdrop(g, t, c) {
  const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#1b0910'); gr.addColorStop(.55, '#2a0f19'); gr.addColorStop(1, '#3a1420');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  const fx = t < 14.5 ? 540 : 620, fy = t < 5 ? 1150 : t < 14.5 ? 1000 : 1080;
  glow(g, fx, fy, 980, '176,42,92', .2);
  const za = clamp((c.z - .12) / .3);   // la retícula se apaga de lejos
  if (za > 0) {
    const k = .55, z = Math.pow(c.z, k), ox = W / 2 + c.sx - c.x * z, oy = H / 2 + c.sy - c.y * z, step = 96 * z;
    g.fillStyle = `rgba(246,185,207,${.075 * za})`;
    for (let y = ((oy % step) + step) % step; y < H; y += step) for (let x = ((ox % step) + step) % step; x < W; x += step) g.fillRect(x - 1.5, y - 1.5, 3, 3);
  }
}
function vignette(g) {
  const v = g.createRadialGradient(W / 2, H / 2, H * .35, W / 2, H / 2, H * .78); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(8,2,5,.45)');
  g.fillStyle = v; g.fillRect(0, 0, W, H);
}

// ——— la cadena: estado de cada factura en el instante te (el rebobinado pasa te hacia atrás) ———
const tEff = t => t < T.rewind[0] ? Math.min(t, T.freeze[0]) : t < T.rewind[1] ? lerp(T.freeze[0], T.pluck - .05, seg(t, T.rewind[0], T.rewind[1])) : 0;
const BREAK = [[1, T.wave[0]], [2, T.wave[0] + .28], [3, T.wave[0] + .55]];   // [enlace i→i+1, cuándo se rompe]
const redAt = (i, te) => i === 1 ? ease.cubicOut(seg(te, T.crack[0], T.crack[0] + .2)) * .75 : i > 1 ? ease.expoOut(seg(te, BREAK[i - 2][1] + .05, BREAK[i - 2][1] + .25)) * .62 : 0;
const HEX = '0123456789abcdef';
const scrambleCh = (j, t, k = 0) => HEX[Math.floor(hash(j * 13.1 + Math.floor(t * FPS) * 7.7 + k) * 16)];

function recordOpts(i, t) {
  const r = REG[i], te = tEff(t), o = { rec: r, state: 'ok' };
  // la pastilla de cada factura: verde; la tocada se vuelve «alterada» y las siguientes «no cuadra»; la cascada verde
  if (i === 1 && te >= T.glitch[0] + .2) o.state = 'alt'; else if (i > 1 && te >= BREAK[i - 2][1] + .05) o.state = 'bad';
  o.flip = i === 1 ? seg(te, T.glitch[0] + .1, T.glitch[0] + .3) : i > 1 ? seg(te, BREAK[i - 2][1] - .05, BREAK[i - 2][1] + .15) : 0;
  if (t >= T.green[0]) { const g0 = T.green[0] + i * .06; o.flip = seg(t, g0 - .05, g0 + .15); }
  o.red = redAt(i, te);
  // la factura vieja: el cero que se va, las cifras que se recolocan, la huella que cambia y las grietas
  if (i === 1 && te >= T.pluck) {
    const u = ease.expoOut(seg(te, T.pluck + .08, T.pluck + .3)), slots = [[0, 0], [1, -1], [2, 1], [3, 2], [4, -2], [5, 3], [6, 4], [7, 5]], s = fmt(r.total);
    o.total = { glyphs: slots.map(([k, to]) => ({ ch: s[k], x: to >= 0 ? lerp(k, to, u) : k, a: to === -1 ? 1 - seg(te, T.pluck + .02, T.pluck + .14) : to === -2 ? 0 : 1, col: C.ink })), euroX: lerp(8, 6, u) };
    o.crack = ease.cubicOut(seg(te, T.crack[0], T.crack[1]));
    o.hash = { chars: [...CH.tocada.huella].map((ch, j) => te < T.glitch[0] + .05 ? r.huella[j] : te < T.glitch[0] + .05 + j * .004 + .12 ? scrambleCh(j, te) : ch), col: () => '#c42a3a' };
  }
  return o;
}
// el enlace entre la huella de i y la «anterior» de i+1, por el lado derecho; se dibuja, brilla y se rompe
function link(g, i, t) {
  const te = tEff(t), d = ease.cubicOut(seg(t, T.links[0] + (3 - i) * .12, T.links[0] + (3 - i) * .12 + .22)); if (d <= 0) return;
  const x0 = recX() + 360, xa = recX() + REC.w + 70, ya = recTop(i) + 470, yb = recTop(i + 1) + L.ant - 8, x1 = recX() + 470;
  const br = BREAK.find(b => b[0] === i), broken = br && te >= br[1] ? ease.expoOut(seg(te, br[1], br[1] + .35)) : 0;
  const pts = [[x0, ya], [xa, ya], [xa, yb], [x1, yb]], lens = pts.slice(1).map((p, k) => Math.hypot(p[0] - pts[k][0], p[1] - pts[k][1])), tot = lens.reduce((a, b) => a + b, 0);
  const green = t >= T.green[0] + (i + 1) * .06 && t < T.green[0] + .9 ? 1 - seg(t, T.green[0] + .4, T.green[0] + .9) : 0;
  const col = broken > 0 ? `rgba(255,77,87,${1 - broken * .25})` : green > 0 ? `rgba(70,200,120,${.6 + .4 * green})` : 'rgba(201,64,122,.95)';
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  const path = (from, to) => {   // el trazo entre las fracciones from y to del recorrido
    g.beginPath(); let acc = 0, started = false;
    for (let k = 0; k < 3; k++) {
      const a0 = acc / tot, a1 = (acc + lens[k]) / tot; acc += lens[k];
      const s0 = clamp((from - a0) / (a1 - a0)), s1 = clamp((to - a0) / (a1 - a0)); if (s1 <= s0) continue;
      const P = (s) => [lerp(pts[k][0], pts[k + 1][0], s), lerp(pts[k][1], pts[k + 1][1], s)];
      const [ax, ay] = P(s0), [bx, by] = P(s1);
      if (!started) { g.moveTo(ax, ay); started = true; } g.lineTo(bx, by);
    }
  };
  const gap = broken * .2, mid = .5;
  for (const [w, c] of [[30, broken > 0 ? 'rgba(255,77,87,.18)' : 'rgba(201,64,122,.2)'], [10, col]]) {
    g.strokeStyle = c; g.lineWidth = w;
    if (broken > 0) { path(0, Math.min(d, mid - gap)); g.stroke(); path(mid + gap, d); g.stroke(); }
    else { path(0, d); g.stroke(); }
  }
  g.restore();
}
// el raíl por el margen, también entre registros (de la más nueva a la más antigua)
function railGaps(g, t) {
  const te = tEff(t);
  for (let i = 0; i < 4; i++) {
    const y0 = recTop(i) - REC.gap, y1 = recTop(i), x = recX() + L.rail, br = BREAK.find(b => b[0] === i), broken = br && te >= br[1] ? ease.expoOut(seg(te, br[1], br[1] + .3)) : 0;
    g.fillStyle = broken > 0 ? 'rgba(255,77,87,.9)' : 'rgba(201,64,122,.75)';
    if (broken > 0) { const m = (y0 + y1) / 2, gp = 30 * broken; g.fillRect(x - 2.5, y0, 5, m - gp - y0); g.fillRect(x - 2.5, m + gp, 5, y1 - m - gp); }
    else g.fillRect(x - 2.5, y0, 5, y1 - y0);
  }
}

// ——— rótulos: Plex Sans en negrita y una sola palabra en Fraunces cursiva rosa (la firma de la marca) ———
let TX = [];
const tx = (id, s, b) => TX.push({ id, text: s, x0: b[0], y0: b[1], x1: b[2], y1: b[3] });
function caption(g, t, [id, t0, t1, lines, size, y0], rep) {
  if (t < t0 - .01 || t > t1 + .3) return;
  const lh = size * 1.1, items = [];
  lines.forEach((ws, li) => {
    const parts = ws.map(w => { const it = w.startsWith('*'), s = w.replace(/\*/g, ''); return { s, it, w: it ? measure(g, s, 600, size * 1.06, 'Fraunces', true) : measure(g, s, 700, size, 'Plex', false, -size * .035) }; });
    const sp = size * .26, tw = parts.reduce((a, p) => a + p.w, 0) + sp * (parts.length - 1); let x = W / 2 - tw / 2;
    parts.forEach(p => { items.push({ ...p, x, y: y0 + li * lh, li }); x += p.w + sp; });
  });
  let n = 0; const all = items.length;
  for (const it of items) {
    const k = n++, tin = t0 + k * .04, tout = t1 - (all - 1 - k) * .03, uIn = spring(t, tin, 2.4, .62), uOut = ease.cubicIn(seg(t, tout, tout + .24));
    if (t < tin) continue;
    g.save(); g.beginPath(); g.rect(0, it.y - size * 1.02, W, size * 1.32); g.clip();
    const dy = (1 - clamp(uIn)) * size * .95 - uOut * size * 1.25, rot = it.it ? (1 - clamp(uIn)) * -.12 : 0;
    g.translate(it.x + it.w / 2, it.y + dy); g.rotate(rot); g.scale(1 + (uIn - clamp(uIn)) * .25, 1 + (uIn - clamp(uIn)) * .25);
    if (it.it) text(g, it.s, 0, 0, size * 1.06, C.pink, { w: Math.round(lerp(420, 600, clamp(uIn))), fam: 'Fraunces', it: true, align: 'center' });
    else text(g, it.s, 0, 0, size, C.paper, { w: 700, align: 'center', ls: -size * .035 });
    g.restore();
  }
  if (rep && t > t0 + (all - 1) * .04 + .12 && t < t1 - (all - 1) * .03) {
    const x0 = Math.min(...items.map(i => i.x)), x1 = Math.max(...items.map(i => i.x + i.w));
    tx(id, lines.map(l => l.join(' ')).join(' ').replace(/\*/g, ''), [x0, y0 - size * .8, x1, y0 + (lines.length - 1) * lh + size * .25]);
  }
}

// ——— la huella a pantalla entera: 64 fichas de cartel que salen de la factura, cambian y vuelven ———
const amtDigitXY = slot => { G.font = '700 96px "PlexMono"'; const adv = G.measureText('0').width, wid = adv * 8 + G.measureText(' €').width; return [AMT.x - wid / 2 + slot * adv + adv / 2, AMT.y - 36]; };
function hashWall(g, t, M) {
  if (t < T.fly[0] || t > T.back[1] + .05) return;
  const dim = ease.cubic(seg(t, T.fly[0], T.fly[0] + .4)) * (1 - ease.cubic(seg(t, T.back[0], T.back[1])));
  g.fillStyle = `rgba(18,6,11,${.86 * dim})`; g.fillRect(0, 0, W, H);
  const zc = Math.hypot(M.a, M.b), old = REG[4].huella, nu = CH.centimo.huella;
  for (let j = 0; j < 64; j++) {
    const go = T.fly[0] + j * .006, u = ease.expoOut(seg(t, go, go + .32)), ret = T.back[0] + (63 - j) * .004, v = ease.expoIn(seg(t, ret + .08, ret + .4));
    const src = proj(M, hashCharWorld(4, j)), dst = wallXY(gridXY(j), t), p = u * (1 - v);
    if (u <= 0 || v >= 1) continue;
    const x = lerp(src[0], dst[0], p), y = lerp(src[1], dst[1], p), s = lerp(30 * zc * 1.25, GRID.s * wallK(t), p);
    // la avalancha: en ola diagonal, cada ficha gira tres veces por caracteres al azar y cae en la huella nueva
    const d = (j % 8) + Math.floor(j / 8), a0 = T.aval + d * .035 + hash(j) * .04, flips = 3, fd = .07;
    let a = old[j], b = old[j], fp = 0;
    if (t >= a0 && t < T.back[0]) { const k = Math.floor((t - a0) / fd); fp = ((t - a0) % fd) / fd; if (k >= flips) { a = b = nu[j]; fp = 0; } else { a = k === 0 ? old[j] : scrambleCh(j, a0 + k * fd, k); b = k === flips - 1 ? nu[j] : scrambleCh(j, a0 + (k + 1) * fd, k + 1); } }
    else if (t >= T.back[0]) { const r0 = T.back[0] + hash(j + 5) * .08; a = nu[j]; b = old[j]; fp = seg(t, r0, r0 + .1); }
    const lit = t >= a0 && t < a0 + .5 && t < T.back[0] ? 1 - seg(t, a0 + .2, a0 + .5) : 0;
    g.save(); g.globalAlpha = clamp(p * 1.6);
    flapTile(g, x, y, s, a, b, fp, { ink: lit > 0 ? C.rose : C.ink, glowA: lit * .9 });
    g.restore();
  }
}
// el total que sube encima de la rejilla y vuelve
function wallAmount(g, t, M, rep) {
  if (t < T.fly[0] || t > T.back[1] + .05) return;
  const zc = Math.hypot(M.a, M.b), u = ease.expoOut(seg(t, T.fly[0] + .05, T.fly[0] + .5)), v = ease.expoIn(seg(t, T.back[0] + .1, T.back[0] + .45)), p = u * (1 - v);
  G.font = '700 96px "PlexMono"'; const adv96 = G.measureText('0').width, wid = adv96 * 8 + G.measureText(' €').width;
  const src = proj(M, [recX() + L.x, recTop(4) + L.total]), dst = wallXY([AMT.x - wid / 2, AMT.y], t);
  const x = lerp(src[0], dst[0], p), y = lerp(src[1], dst[1], p), s = lerp(86 * zc, AMT.size, p) / AMT.size;
  const cent = ease.cubic(seg(t, T.cent, T.cent + .14)) * (1 - ease.cubic(seg(t, T.back[0], T.back[0] + .15)));
  const hot = t >= T.cent && t < T.back[0] ? 1 : 0;
  g.save(); g.translate(x, y); g.scale(s, s);
  odometer(g, 1210 + .01 * cent, 0, 0, AMT.size, hot ? C.pink : C.paper, 700, 'PlexMono', 0, true);
  g.restore();
}

// ——— Verifactu: el sello grande que cae y la pausa quieta ———
function verifactu(g, t) {
  if (t < T.verifactu - .2 || t > T.implode[1]) return;
  const din = ease.cubic(seg(t, T.verifactu - .15, T.verifactu + .1)), dout = ease.expoIn(seg(t, T.implode[0], T.implode[1]));
  g.fillStyle = `rgba(18,6,11,${.62 * din * (1 - dout)})`; g.fillRect(0, 0, W, H);
  const fall = ease.expoIn(seg(t, T.verifactu - .18, T.verifactu)), sq = kick(t, T.verifactu, 6, 8) * .08;
  const sc = (t < T.verifactu ? lerp(2.3, 1, fall) : 1 - sq) * (1 - dout), rot = t < T.verifactu ? lerp(-.6, -.08, fall) : -.08 - dout * 1.4;
  const a = clamp(seg(t, T.verifactu - .18, T.verifactu - .1));
  seal(g, 540, 1000, 270, { rot, alpha: a, scale: sc });
  shockwave(g, 540, 1000, t, T.verifactu, { r0: 270, r1: 760, dur: .55, lw: 14 });
  const k = ease.expoOut(seg(t, T.verifactu + .08, T.verifactu + .4)) * (1 - dout);
  if (k > 0) {
    g.save(); g.globalAlpha = k;
    text(g, 'VERIFACTU', 540, 1392 + (1 - k) * 30, 64, C.pink, { w: 700, fam: 'PlexMono', align: 'center', ls: 14 });
    text(g, 'LEY ANTIFRAUDE · CADENA ÍNTEGRA', 540, 1452 + (1 - k) * 30, 25, C.pink2, { w: 600, fam: 'PlexMono', align: 'center', ls: 4.5 });
    g.restore();
  }
}

// ——— el final: la K, el cuadrado tinta, la chispa en su sitio y el cierre ———
function logoWorld(g, t) {
  const ka = ease.cubic(seg(t, 25.45, 25.85)), fill = ease.cubic(seg(t, T.kfill[0], T.kfill[1])), tile = ease.cubic(seg(t, 26.15, 26.5));
  if (ka <= 0) return;
  if (tile > 0) { g.save(); g.globalAlpha = tile; g.fillStyle = C.ink; rr(g, TILE.x, TILE.y, TILE.w, TILE.h, TILE.r); g.fill(); g.lineWidth = 120; g.strokeStyle = `rgba(246,185,207,${.16 * tile})`; g.stroke(); g.restore(); }
  g.save(); kPath(g);
  if (fill > 0) { g.globalAlpha = fill; g.fillStyle = C.paper; g.fill(); g.globalAlpha = 1; }
  g.lineJoin = 'round'; g.strokeStyle = `rgba(246,185,207,${.75 * ka * (1 - fill * .6)})`; g.lineWidth = 46; g.stroke();
  g.strokeStyle = `rgba(201,64,122,${.35 * ka * (1 - fill)})`; g.lineWidth = 150; g.stroke();
  g.restore();
}
function endCard(g, t, rep) {
  if (t < T.word - .05) return;
  const rise = (t0, d = .45) => ease.expoOut(seg(t, t0, t0 + d));
  const kw = rise(T.word);
  g.save(); g.beginPath(); g.rect(0, 800, W, 130); g.clip();
  text(g, 'Klimafacturas', 540, 900 + (1 - kw) * 110, 108, C.paper, { w: 700, align: 'center', ls: lerp(6, -3.8, kw) });
  g.restore();
  if (rep && kw > .98) tx('brand', 'Klimafacturas', [180, 815, 900, 925]);
  const kt = rise(T.tag);
  if (kt > 0) {
    g.save(); g.globalAlpha = kt; g.translate(0, (1 - kt) * 40);
    const a = 'Una factura que ya no', b1 = 'se puede ', b2 = 'tocar.', wa = measure(g, b1, 700, 62, 'Plex', false, -2.2), wb = measure(g, b2, 600, 66, 'Fraunces', true);
    text(g, a, 540, 1030, 62, C.paper, { w: 700, align: 'center', ls: -2.2 });
    text(g, b1, 540 - (wa + wb) / 2, 1104, 62, C.paper, { w: 700, ls: -2.2 }); text(g, b2, 540 - (wa + wb) / 2 + wa, 1104, 66, C.pink, { w: 600, fam: 'Fraunces', it: true });
    g.restore();
    if (rep && kt > .98) tx('tag', 'Una factura que ya no se puede tocar.', [150, 975, 930, 1125]);
  }
  const kc = rise(T.chips);
  if (kc > 0) { g.save(); g.globalAlpha = kc; text(g, 'CUMPLE VERIFACTU · SIN PERMANENCIA', 540, 1214 + (1 - kc) * 24, 27, C.pink2, { w: 600, fam: 'PlexMono', align: 'center', ls: 3.4 }); g.restore(); if (rep && kc > .98) tx('chips', 'CUMPLE VERIFACTU · SIN PERMANENCIA', [110, 1185, 970, 1225]); }
  const kb = spring(t, T.cta, 2.4, .55);
  if (t >= T.cta) {
    const pr = t >= T.ctaTap ? Math.exp(-(t - T.ctaTap) * 12) : 0, s = clamp(kb, 0, 1.2) * (1 - .05 * pr), bw = 560, bh = 116;
    g.save(); g.translate(540, 1330); g.scale(s, s);
    g.fillStyle = 'rgba(176,42,92,.35)'; rr(g, -bw / 2 + 6, -bh / 2 + 14, bw, bh, bh / 2); g.fill();
    g.fillStyle = C.rose; rr(g, -bw / 2, -bh / 2, bw, bh, bh / 2); g.fill();
    if (t > T.ctaTap && t < T.ctaTap + .55) { const u = seg(t, T.ctaTap, T.ctaTap + .55); g.save(); rr(g, -bw / 2, -bh / 2, bw, bh, bh / 2); g.clip(); g.fillStyle = `rgba(255,255,255,${.3 * (1 - u)})`; g.beginPath(); g.arc(60, 0, 30 + 380 * ease.cubicOut(u), 0, Math.PI * 2); g.fill(); g.restore(); }
    text(g, 'Crear cuenta  →', 0, 13, 40, C.paper, { w: 600, align: 'center', ls: -.6 });
    g.restore();
    const ku = rise(T.cta + .15);
    g.save(); g.globalAlpha = ku; text(g, 'klimafacturas.com', 540, 1474 + (1 - ku) * 20, 44, C.paper, { w: 600, align: 'center', ls: -.8 }); g.restore();
    if (rep && t > T.cta + .5) { tx('cta', 'Crear cuenta', [260, 1272, 820, 1388]); tx('url', 'klimafacturas.com', [330, 1430, 750, 1490]); }
  }
}

// ——— un instante ———
function drawFrame(g, t, rep) {
  const c = camera(t), M = matrix(c);
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  backdrop(g, t, c);
  photo(g, t);
  // el mundo
  g.setTransform(M);
  const show = t >= T.hit;
  if (show) {
    printer(g, t, t < T.paper[1] || (t >= T.print[0] && t < T.print[1]), 1 - seg(t, 25.0, 25.6));
    railGaps(g, t);
    for (let i = 0; i < 4; i++) {
      const o = recordOpts(i, t);
      if (i === 1 && tEff(t) >= T.glitch[0] && tEff(t) < T.glitch[1]) {
        const amt = Math.sin(seg(tEff(t), T.glitch[0], T.glitch[1]) * Math.PI) * (.6 + .4 * hash(Math.floor(t * FPS)));
        glitch(g, q => record(q, 1, o), [recX() - 80, recTop(1) - 40, REC.w + 260, REC.h + 140], amt, Math.floor(t * FPS) * 3.3, Math.min(1.4, Math.hypot(M.a, M.b)));
      } else record(g, i, o);
    }
    // la más nueva: sale del cabezal, se imprime su huella, cae el lacre
    const o4 = recordOpts(4, t), pv = ease.expoOut(seg(t, T.paper[0], T.paper[1]));
    o4.reveal = REC.h * pv;
    const flying = t >= T.fly[0] && t < T.back[1] + .05;
    o4.hash = { chars: REG[4].huella, alpha: j => { if (t < T.print[1]) return t >= T.print[0] + j / 64 * (T.print[1] - T.print[0]) ? 1 : 0; if (flying) { const go = T.fly[0] + j * .006, ret = T.back[0] + (63 - j) * .004; return t < go || t >= ret + .4 ? 1 : 0; } return 1; }, col: j => { const pj = T.print[0] + j / 64 * (T.print[1] - T.print[0]); return t < T.print[1] + .1 && t - pj < .08 ? C.spark : C.rose; } };
    if (flying) o4.total = { s: '', glyphs: [], euroX: null };
    if (flying && (t < T.fly[0] + .05 || t > T.back[0] + .45)) delete o4.total;
    o4.state = t >= T.seal + .15 ? o4.state : null; if (t >= T.seal + .15 && t < T.seal + .45) o4.flip = .5 - .5 * seg(t, T.seal + .15, T.seal + .4);
    o4.sheen = seg(t, T.paper[1] - .1, T.paper[1] + .6);
    record(g, 4, o4);
    // el lacre de la más nueva
    if (t >= T.seal - .25) {
      const fall = ease.expoIn(seg(t, T.seal - .22, T.seal)), sq = kick(t, T.seal, 6, 9) * .1, te = tEff(t);
      const sc = t < T.seal ? lerp(2.6, 1, fall) : 1 - sq, crk = t >= T.wave[0] ? ease.cubicOut(seg(te, BREAK[2][1] + .05, BREAK[2][1] + .4)) : 0;
      seal(g, recX() + REC.w - 64, recTop(4) + REC.h - 122, 104, { rot: (t < T.seal ? lerp(-.7, -.14, fall) : -.14) + (t > T.rest[1] ? (t - T.rest[1]) * .3 : 0), alpha: clamp(seg(t, T.seal - .22, T.seal - .14)), scale: sc, crack: crk });
      shockwave(g, recX() + REC.w - 64, recTop(4) + REC.h - 122, t, T.seal, { r0: 104, r1: 470, dur: .5, lw: 12 });
    }
    for (let i = 0; i < 4; i++) link(g, i, t);
    // la cascada verde: cada eslabón se comprueba
    for (let i = 0; i < 5; i++) { const g0 = T.green[0] + i * .06, u = seg(t, g0, g0 + .45); if (u > 0 && u < 1) { g.save(); g.globalAlpha = (1 - u) * .5; g.strokeStyle = 'rgb(70,200,120)'; g.lineWidth = 18; rr(g, recX() - 9, recTop(i) - 9, REC.w + 18, REC.h + 18, 12); g.stroke(); g.restore(); } }
    // el brazo y la pierna de la K
    // las tarjetas se despliegan desde el raíl cuando llega la cámara (y las de la pierna, al salir lejos)
    unfold(g, t, 'cobro', 14.5, () => cobro(g, t));
    unfold(g, t, 'conta', 18.45, () => ledger(g, t, { ivaGone: seg(t, 21.86, 22.0) }));
    unfold(g, t, 'hacienda', 21.75, () => hacienda(g, t, odometer));
    unfold(g, t, 'tpv', 25.3, () => legCards(g, 'tpv'));
    unfold(g, t, 'linea', 25.45, () => legCards(g, 'linea'));
    logoWorld(g, t);
  }
  // pantalla: la huella a pantalla entera, el sello grande, los rótulos, la chispa, el cierre
  g.setTransform(1, 0, 0, 1, 0, 0);
  const low = 1 - ease.cubic(seg(t, T.back[0], T.back[1] + .2));
  if (low > 0) { const fd = g.createLinearGradient(0, 1430, 0, 1700); fd.addColorStop(0, 'rgba(31,11,18,0)'); fd.addColorStop(1, `rgba(31,11,18,${.96 * low})`); g.fillStyle = fd; g.fillRect(0, 1430, W, H - 1430); }
  // velo oscuro arriba, detrás de los rótulos (por debajo de la pared y del sello, que van encima)
  const veil = Math.max(0, ...CAPTIONS.map(([, a, b]) => clamp(seg(t, a - .2, a + .1)) * (1 - seg(t, b + .1, b + .45))));
  if (veil > 0) { const vg = g.createLinearGradient(0, 0, 0, 660); vg.addColorStop(0, `rgba(20,7,12,${.9 * veil})`); vg.addColorStop(.62, `rgba(20,7,12,${.62 * veil})`); vg.addColorStop(1, 'rgba(20,7,12,0)'); g.fillStyle = vg; g.fillRect(0, 0, W, 660); }
  hashWall(g, t, M);
  wallAmount(g, t, M, rep);
  verifactu(g, t);
  chips(g, t, M);
  if (t >= T.rewind[0] && t < T.rewind[1] + .05) rewindFX(g, t, Math.sin(seg(t, T.rewind[0], T.rewind[1] + .05) * Math.PI));
  vignette(g);
  for (const cp of CAPTIONS) caption(g, t, cp, rep);
  // la chispa, con su estela
  const sp = sparkAt(t, M);
  if (sp.vis) {
    const trail = []; for (let k = 8; k >= 0; k--) { const q = sparkAt(t - k * .014, matrix(camera(t - k * .014))); trail.push([q.x, q.y]); }
    let r = sp.r || 26; if (t >= T.reveal[0]) r = lerp(26, 6.1 * S * Math.hypot(M.a, M.b), ease.cubic(seg(t, T.logo - .5, T.logo)));
    const sq = t >= T.logo ? kick(t, T.logo, 5, 7) * .25 : t >= T.hit && t < T.hit + .2 ? kick(t, T.hit, 7, 10) * .3 : 0;
    spark(g, sp.x, sp.y, r, { trail: t < T.logo - .05 ? trail : null, squash: sq });
  }
  // el cero que se lleva la chispa (y que devuelve al rebobinar)
  const te = tEff(t);
  if (te >= T.pluck && te < T.pluck + .45 && t < T.rewind[1]) {
    const d = proj(M, totalDigitWorld(1, 4)), u = ease.cubicOut(seg(te, T.pluck, T.pluck + .3)), zc = Math.hypot(M.a, M.b);
    const x = lerp(d[0], sp.x - 30, u), y = lerp(d[1] + 30 * zc, sp.y + 46, u);
    g.save(); g.translate(x, y); g.rotate(u * -.8); text(g, '0', 0, 0, 86 * zc * lerp(1, .7, u), t > T.rewind[0] ? C.pink : C.paper, { w: 700, fam: 'PlexMono', align: 'center' }); g.restore();
  }
  if (t >= T.hit && t < T.hit + .6) { const p = photoXY(t, ROLL); shockwave(g, p[0], p[1], t, T.hit, { r0: 20, r1: 620, dur: .55, lw: 16 }); }
  if (t >= T.logo) { const p = proj(M, SPARKC); shockwave(g, p[0], p[1], t, T.logo, { r0: 30, r1: 700, dur: .7, lw: 14 }); }
  endCard(g, t, rep);
  // destellos de los golpes grandes
  for (const [ft, a] of [[T.hit, .45], [T.verifactu, .2], [T.logo, .22], [T.aval, .16]]) if (t >= ft && t < ft + .1) { g.fillStyle = `rgba(255,240,246,${a * (1 - (t - ft) / .1)})`; g.fillRect(0, 0, W, H); }
}

// una tarjeta que nace del raíl: crece desde su centro con un muelle y un brillo
function unfold(g, t, k, t0, draw) {
  if (t < t0) return;
  const s = spring(t, t0, 2.2, .55), c = CARD[k];
  g.save(); g.translate(c.c[0], c.c[1]); g.scale(lerp(.55, 1, s), lerp(.55, 1, s)); g.globalAlpha = clamp(seg(t, t0, t0 + .12)); g.translate(-c.c[0], -c.c[1]);
  draw(); g.restore();
}
// las fichas que viajan con la cámara: el cobro al asiento y el IVA a Hacienda
function chips(g, t, M) {
  const fly = (t0, t1, from, to, label, col) => {
    const u = seg(t, t0, t1); if (u <= 0 || u >= 1) return;
    const e = ease.expoInOut(u), a = proj(M, from), b = proj(M, to), x = lerp(a[0], b[0], e), y = lerp(a[1], b[1], e) - Math.sin(u * Math.PI) * 160;
    const w = measure(g, label, 600, 34, 'PlexMono') + 48;
    g.save(); g.translate(x, y); g.rotate(Math.sin(u * Math.PI) * -.08);
    g.fillStyle = 'rgba(14,4,8,.35)'; rr(g, -w / 2 + 4, -30 + 10, w, 60, 30); g.fill();
    g.fillStyle = col; rr(g, -w / 2, -30, w, 60, 30); g.fill(); text(g, label, 0, 12, 34, C.paper, { w: 600, fam: 'PlexMono', align: 'center' }); g.restore();
  };
  const co = cardOrigin('cobro'), ct = cardOrigin('conta'), ha = cardOrigin('hacienda');
  fly(18.56, 18.86, [co[0] + 260, co[1] + 200], [ct[0] + 500, ct[1] + 258], '1.210,00', C.rose);
  fly(21.86, 22.55, [ct[0] + 640, ct[1] + 394], [ha[0] + 560, ha[1] + 292], '+210,00 €', C.rose);
}

// ——— el obturador: media de varias muestras dentro de medio fotograma (180°) ———
const MOTION = [[0, .6, 140], [.5, 1.5, 40], [T.fly[0], T.fly[0] + .7, 120], [T.cent - .3, T.cent + .2, 60], [T.back[0], T.back[1], 120], [9.5, 10.2, 70], [T.rewind[0], T.rewind[1], 90], [15.05, 16.7, 60], [18.54, 18.9, 90], [21.84, 22.6, 90], [25.0, 26.7, 80]];
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
