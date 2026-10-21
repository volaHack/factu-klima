// «Ni un corte» · reel de agencia (1080×1920, 30 fps). Zoom infinito en una sola toma: cada escena vive dentro de la
// «O» de la anterior, a 1/26 de su tamaño (así, ya ampliado, el hueco de la O tapa la pantalla entera). La cámara se mete por la O, explica un truco del plano secuencia, vuelve a
// meterse… y al final sale por todas las O hasta el principio, que es también el primer fotograma: el bucle no se ve.
import { W, H, clamp, lerp, seg, ease, spring, kick, hash, text, measure, rr } from './lib.js';
import { C } from './world.js';
import { glow, shockwave, spark } from './fx.js';

const FPS = 30, R = 26;
const cv = document.getElementById('c'), G = cv.getContext('2d');
const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
const ACC = mk(), SUB = mk(), A = ACC.getContext('2d'), B = SUB.getContext('2d');
for (const w of [500, 600, 700]) { await document.fonts.load(`${w} 40px "Plex"`); await document.fonts.load(`${w} 40px "PlexMono"`); }

// ——— tiempos: cada escena se queda quieta un rato y luego la cámara se mete por su O ———
const HOLD = [3.3, 4.0, 3.8, 4.0, 3.8, 5.6], ZOOM = 1.0, BACK = 2.0;
const ST = []; { let t = 0; for (let k = 0; k < 6; k++) { ST.push(t); t += HOLD[k] + (k < 5 ? ZOOM : 0); } }
const T_BACK = ST[5] + HOLD[5], DUR = T_BACK + BACK + .4;
// nivel de zoom continuo: 0 = escena 0, 1 = escena 1… (e = avance dentro del salto)
function level(t) {
  if (t >= T_BACK) return { L: 5 * (1 - ease.expoInOut(seg(t, T_BACK, T_BACK + BACK))), back: true };
  let k = 0; while (k < 5 && t >= ST[k + 1]) k++;
  const z0 = ST[k] + HOLD[k];
  if (k < 5 && t >= z0) return { L: k + ease.expoInOut(seg(t, z0, z0 + ZOOM)), back: false };
  return { L: k + .05 * ease.sine(seg(t, ST[k], z0)), back: false };   // deriva lenta mientras se lee
}

// ——— el texto y la O de cada título (coordenadas de escena: origen en el centro de la pantalla) ———
const SIZES = [0, 230, 230, 230, 230];
const holeOf = (word, idx, x, y, size) => {   // el centro del hueco de la letra idx de word, centrada en x
  const w = measure(G, word, 700, size, 'Plex', false, -size * .03), pre = measure(G, word.slice(0, idx), 700, size, 'Plex', false, -size * .03), ow = measure(G, 'O', 700, size, 'Plex');
  return [x - w / 2 + pre + ow / 2 - size * .015, y - size * .355];
};
const HOLES = [holeOf('NI UN CORTE.', 7, 0, 260, 150)], HR = [150];
for (let k = 1; k < 5; k++) { HOLES.push(holeOf(`TRUCO ${k}`, 4, 0, -360, SIZES[k])); HR.push(SIZES[k]); }

function bg(g, k) {
  const c = [['#1b0910', '#3a1420'], ['#0e1424', '#1f1140'], ['#10201c', '#14303a'], ['#22100a', '#3a1a2a'], ['#0c0c18', '#1d1030'], ['#1b0910', '#4c1a28']][k];
  const gr = g.createLinearGradient(0, -H, 0, H); gr.addColorStop(0, c[0]); gr.addColorStop(1, c[1]);
  g.fillStyle = gr; g.fillRect(-W * 1.6, -H * 1.6, W * 3.2, H * 3.2);
  g.fillStyle = 'rgba(246,185,207,.06)'; for (let y = -1440; y <= 1440; y += 80) for (let x = -800; x <= 800; x += 80) g.fillRect(x - 1.5, y - 1.5, 3, 3);
}
const tc = (g, s, x, y, size, col, w = 700, fam = 'Plex') => text(g, s, x, y, size, col, { w, fam, align: 'center', ls: fam === 'Plex' ? -size * .03 : 0 });

// cada escena, en su tiempo local u (segundos desde que se llega a ella)
const SCENES = [
  (g, u, t) => {   // 0: el gancho
    const rec = Math.floor(t * 2) % 2;
    g.fillStyle = rec ? '#ff3b4e' : 'rgba(255,59,78,.35)'; g.beginPath(); g.arc(-300, -640, 18, 0, Math.PI * 2); g.fill();
    const s = Math.floor(t % 60), f = Math.floor((t * 30) % 30);
    text(g, `REC  00:00:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`, -268, -628, 40, C.paper, { w: 600, fam: 'PlexMono' });
    tc(g, 'ESTE VÍDEO', 0, -250, 150, C.paper); tc(g, 'NO TIENE', 0, -40, 150, C.paper); tc(g, 'NI UN CORTE.', 0, 260, 150, C.pink);
    tc(g, 'Míralo hasta el final y compruébalo ↓', 0, 520, 46, C.pink2, 600);
  },
  (g, u) => {      // 1: la cámara nunca corta
    tc(g, 'TRUCO 1', 0, -360, 230, C.paper);
    tc(g, 'La cámara nunca corta:', 0, -150, 66, C.paper, 600); tc(g, 'solo se mueve.', 0, -70, 66, '#8fd3ff', 600);
    const P = q => [Math.sin(q * 6.3) * 330, 120 + q * 520 + Math.sin(q * 11) * 30];
    g.save(); g.setLineDash([14, 14]); g.lineDashOffset = -u * 60; g.strokeStyle = 'rgba(143,211,255,.7)'; g.lineWidth = 6; g.beginPath();
    for (let i = 0; i <= 80; i++) { const [x, y] = P(i / 80); i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); g.restore();
    for (let i = 0; i < 5; i++) { const [x, y] = P(i / 4); g.strokeStyle = 'rgba(251,246,242,.5)'; g.lineWidth = 4; rr(g, x - 50, y - 34, 100, 68, 8); g.stroke(); }
    const q = (u * .32) % 1, [cx, cy] = P(q), [nx, ny] = P(Math.min(1, q + .01)), a = Math.atan2(ny - cy, nx - cx);
    g.save(); g.translate(cx, cy); g.rotate(a); g.fillStyle = '#8fd3ff'; rr(g, -46, -30, 74, 60, 10); g.fill(); g.beginPath(); g.moveTo(28, -14); g.lineTo(58, -30); g.lineTo(58, 30); g.lineTo(28, 14); g.fill();
    g.fillStyle = '#ff3b4e'; g.beginPath(); g.arc(-26, -14, 7, 0, Math.PI * 2); g.fill(); g.restore();
  },
  (g, u) => {      // 2: cada golpe empuja al siguiente (fichas de dominó)
    tc(g, 'TRUCO 2', 0, -360, 230, C.paper);
    tc(g, 'Cada golpe empuja', 0, -150, 66, C.paper, 600); tc(g, 'al siguiente.', 0, -70, 66, '#7ff0c4', 600);
    const n = 8, t0 = .5, dt = .16;
    for (let i = 0; i < n; i++) {
      const fall = ease.cubicIn(clamp((u % 3.2 - t0 - i * dt) / .22)), x = -385 + i * 110;
      g.save(); g.translate(x + 30, 600); g.rotate(fall * 1.05); g.fillStyle = i === n - 1 ? '#7ff0c4' : C.paper; rr(g, -30, -230, 60, 230, 10); g.fill();
      g.fillStyle = 'rgba(16,32,28,.8)'; g.beginPath(); g.arc(0, -170, 9, 0, Math.PI * 2); g.arc(0, -120, 9, 0, Math.PI * 2); g.fill(); g.restore();
    }
    g.fillStyle = 'rgba(127,240,196,.25)'; g.fillRect(-460, 600, 920, 6);
  },
  (g, u) => {      // 3: desenfoque de movimiento de verdad
    tc(g, 'TRUCO 3', 0, -360, 230, C.paper);
    tc(g, 'Desenfoque de movimiento', 0, -150, 66, C.paper, 600); tc(g, 'de verdad.', 0, -70, 66, '#ffb36b', 600);
    const pos = s => Math.sin(s * 5.2) * 300;
    tc(g, 'SIN', -260, 140, 40, 'rgba(251,246,242,.6)', 700, 'PlexMono'); tc(g, 'CON', 260, 140, 40, '#ffb36b', 700, 'PlexMono');
    g.fillStyle = C.paper; g.beginPath(); g.arc(-260 + pos(Math.round(u * 12) / 12) * .5, 380, 70, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 16; i++) { g.globalAlpha = .1; g.fillStyle = '#ffb36b'; g.beginPath(); g.arc(260 + pos(u + i * .006 - .045) * .5, 380, 70, 0, Math.PI * 2); g.fill(); }
    g.globalAlpha = 1; g.fillStyle = 'rgba(251,246,242,.15)'; g.fillRect(-2, 120, 4, 520);
  },
  (g, u) => {      // 4: todo es código
    tc(g, 'TRUCO 4', 0, -360, 230, C.paper);
    tc(g, 'Todo es código.', 0, -150, 66, C.paper, 600); tc(g, 'Lo escribe la IA.', 0, -70, 66, '#c9a6ff', 600);
    g.fillStyle = 'rgba(10,8,20,.9)'; rr(g, -460, 60, 920, 600, 28); g.fill(); g.strokeStyle = 'rgba(201,166,255,.4)'; g.lineWidth = 3; g.stroke();
    ['#ff5f57', '#febc2e', '#28c840'].forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(-420 + i * 34, 100, 10, 0, Math.PI * 2); g.fill(); });
    const code = ['const camara = new Toma();', 'camara.vuela({ hacia: "O" });', 'camara.zoom(12, "expo");', 'efectos.desenfoque(180);', 'render(30 /* fps */);', '// sin cortes ✓'];
    const chars = Math.floor(u * 38); let left = chars;
    code.forEach((l, i) => { const s = l.slice(0, Math.max(0, left)); left -= l.length; text(g, s, -420, 180 + i * 72, 38, i === 5 ? '#7ff0c4' : '#e7dcff', { w: 500, fam: 'PlexMono' }); if (left < 0 && left > -l.length - 1 && Math.floor(u * 3) % 2) { const w = measure(g, s, 500, 38, 'PlexMono'); g.fillStyle = '#c9a6ff'; g.fillRect(-420 + w + 4, 150 + i * 72, 18, 38); } });
  },
  (g, u) => {      // 5: la llamada
    tc(g, '¿Quieres vídeos así', 0, -560, 88, C.paper); tc(g, 'para tu negocio?', 0, -450, 88, C.paper);
    const p = 1 + .06 * Math.sin(u * Math.PI * 4);
    tc(g, 'Comenta', 0, -230, 80, C.pink2, 600);
    g.save(); g.translate(0, 20); g.scale(p, p); text(g, 'VÍDEO', 10, 12, 250, C.rose7, { w: 700, align: 'center', ls: -8 }); text(g, 'VÍDEO', 0, 0, 250, C.pink, { w: 700, align: 'center', ls: -8 }); g.restore();
    tc(g, 'y te cuento cómo ↓', 0, 170, 70, C.paper, 600);
    g.fillStyle = 'rgba(176,42,92,.9)'; rr(g, -330, 300, 660, 110, 55); g.fill(); tc(g, '@klima.io', 0, 375, 56, C.paper);
    tc(g, 'Webs · Redes · Vídeos con IA', 0, 480, 44, C.pink2, 600);
  },
];
const TXT = [['hook', 'ESTE VÍDEO NO TIENE NI UN CORTE.', [60, -400, 1020, 300]], ['t1', 'TRUCO 1 La cámara nunca corta: solo se mueve.', [60, -560, 1020, -40]],
  ['t2', 'TRUCO 2 Cada golpe empuja al siguiente.', [60, -560, 1020, -40]], ['t3', 'TRUCO 3 Desenfoque de movimiento de verdad.', [60, -560, 1020, -40]],
  ['t4', 'TRUCO 4 Todo es código. Lo escribe la IA.', [60, -560, 1020, -40]], ['cta', '¿Quieres vídeos así para tu negocio? Comenta VÍDEO y te cuento cómo', [60, -640, 1020, 200]]];

// ——— un instante: se dibuja la escena actual, su madre (por fuera) y sus hijas (dentro de la O) ———
let TX = [];
function drawFrame(g, t, rep) {
  const { L, back } = level(t), k = Math.min(5, Math.floor(L + 1e-9)), e = L - k;
  // la cámara en coordenadas de la escena k: zoom R^e y foco que lleva la O al centro
  const z = Math.pow(R, e), Hk = HOLES[Math.min(k, 4)] || [0, 0], fx = k < 5 ? Hk[0] * (1 - (1 - e) / z) : 0, fy = k < 5 ? Hk[1] * (1 - (1 - e) / z) : 0;
  const hand = back ? 0 : 1, sx = (3 * Math.sin(t * 1.7) + 1.5 * Math.sin(t * 3.1)) * hand, sy = (2.5 * Math.sin(t * 1.3 + .5)) * hand;
  const arr = ST.map((s, i) => i).filter(i => i > 0 && t >= ST[i] && t < ST[i] + .6 && !back), pk = arr.length ? 1 + .04 * Math.exp(-(t - ST[arr[0]]) * 9) * Math.cos((t - ST[arr[0]]) * 25) : 1;
  const base = new DOMMatrix().translate(W / 2 + sx, H / 2 + sy).scale(z * pk).translate(-fx, -fy);
  // la madre (si la hay) por fuera, y luego la escena k y sus hijas, cada una recortada a la O de la anterior
  let M = base, from = k;
  g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  for (let j = from, Mj = M; j <= Math.min(5, k + 2); j++) {
    g.save(); g.setTransform(Mj);
    if (j > from) {   // recorte: el hueco de la O de la escena madre (en coordenadas de la hija, una elipse)
      const hs = HR[j - 1] * R; g.beginPath(); g.ellipse(0, 0, hs * .175, hs * .255, 0, 0, Math.PI * 2); g.clip();
    }
    bg(g, j); SCENES[j](g, Math.max(0, t - ST[j]), t);
    g.restore();
    if (j >= 5) break;
    const Hj = HOLES[j]; Mj = Mj.translate(Hj[0], Hj[1]).scale(1 / R);
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  // al llegar a cada escena: onda y destello; en el viaje de vuelta, el túnel
  for (let i = 1; i < 6; i++) if (!back && t >= ST[i] && t < ST[i] + .7) { shockwave(g, 540, 960, t, ST[i], { r0: 60, r1: 1100, dur: .7, lw: 18 }); if (t < ST[i] + .08) { g.fillStyle = `rgba(255,240,246,${.3 * (1 - (t - ST[i]) / .08)})`; g.fillRect(0, 0, W, H); } }
  const v = g.createRadialGradient(W / 2, H / 2, H * .32, W / 2, H / 2, H * .78); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(4,2,8,.5)'); g.fillStyle = v; g.fillRect(0, 0, W, H);
  if (!back && e < .06) { const [id, s, [x0, y0, x1, y1]] = TXT[k], u = t - ST[k]; if (rep && (k === 0 || u > .05)) TX.push({ id, text: s, x0, y0: y0 + 960, x1, y1: y1 + 960 }); }
}

// ——— obturador: en los saltos, la media de varios instantes ———
function samples(t) { const { L } = level(t), { L: L2 } = level(t + 1 / FPS); const d = Math.abs(L2 - L); return d < .002 ? 1 : Math.min(13, 2 * Math.ceil(d * 60) + 1); }
window.render = (t) => {
  t = clamp(t, 0, DUR - 1e-4); TX = []; const n = samples(t);
  if (n <= 1) { drawFrame(G, t, true); return; }
  for (let i = 0; i < n; i++) { const ts = t + (i / (n - 1) - .5) * (.5 / FPS); drawFrame(B, ts, i === (n - 1) / 2); A.setTransform(1, 0, 0, 1, 0, 0); A.globalAlpha = 1 / (i + 1); A.drawImage(SUB, 0, 0); }
  G.setTransform(1, 0, 0, 1, 0, 0); G.globalAlpha = 1; G.drawImage(ACC, 0, 0);
};
const EV = [{ t: 0, type: 'meta', bpm: 120, bar0: 0, dur: DUR }];
for (let k = 0; k < 5; k++) EV.push({ t: +(ST[k] + HOLD[k]).toFixed(3), type: 'zoom', d: ZOOM }, { t: +ST[k + 1].toFixed(3), type: 'land', k: k + 1 });
for (let i = 0; i < 8; i++) EV.push({ t: +(ST[2] + .5 + i * .16).toFixed(3), type: 'domino', i });
for (let i = 0; i < 22; i++) EV.push({ t: +(ST[4] + .1 + i * .13).toFixed(3), type: 'key' });
EV.push({ t: T_BACK, type: 'back', d: BACK }, { t: T_BACK + BACK, type: 'home' });
EV.sort((a, b) => a.t - b.t);
window.EV = EV; window.DUR = DUR; window.TEXTS = () => TX; window.READY = true;
