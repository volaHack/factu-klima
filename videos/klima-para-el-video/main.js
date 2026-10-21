// «Para el vídeo» · reel de Klimafacturas (1080×1920, 30 fps, 13 s, en bucle). Una sola toma: la cámara se desliza por
// el tablero de los 30 mientras en el centro van cambiando las tarjetas resueltas, cada una nítida durante 8
// fotogramas, para que quien pare el vídeo lea la suya. Después: «¿Qué te ha tocado?» y la marca; el final enlaza con
// el principio para que el bucle no se note.
import { W, H, clamp, lerp, seg, ease, spring, kick, hash, text, measure, rr } from './lib.js';
import { C, CARD, LOGO } from './world.js';
import { ITEMS } from './data.js';
import { layout, sprites, drawCard, LOGOSPR } from './cards.js';
import { glow, shockwave, spark } from './fx.js';

const FPS = 30, DUR = 13, STEP = 9 / FPS, N = 30, T0 = .0, T1 = T0 + N * STEP;   // 30 tarjetas, 0,3 s cada una
const END = 9.3, LOOP = 12.4;
const cv = document.getElementById('c'), G = cv.getContext('2d');
for (const w of [500, 600, 700]) { await document.fonts.load(`${w} 40px "Plex"`); await document.fonts.load(`${w} 40px "PlexMono"`); }
const SPR = ITEMS.map(it => sprites(it, layout(G, it)));
// el orden de la ruleta: barajado (siempre el mismo), para que cada pausa dé un número distinto
const ORDER = ITEMS.map((it, j) => j).sort((a, b) => hash(a * 7.3 + 1) - hash(b * 7.3 + 1));

// el fondo: el tablero de las 30, pequeño y oscurecido, que se desliza despacio (la toma)
function backdrop(g, t) {
  const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#1b0910'); gr.addColorStop(.55, '#2a0f19'); gr.addColorStop(1, '#3a1420');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  const sy = -((t / DUR) * 1200) % 1200, s = .42;
  g.save(); g.globalAlpha = .28;
  for (let r = -1; r < 9; r++) for (let c = 0; c < 2; c++) {
    const j = ((r % 6) + 6) % 6 * 5 + c * 2 + (r & 1), it = ITEMS[j % 30];
    const x = 290 + c * 500 + (r & 1 ? -40 : 40), y = sy + r * 240 + 120;
    g.save(); g.translate(x, y); g.rotate((hash(j + r) - .5) * .12); g.scale(s, s); drawCard(g, { a: SPR[it.n - 1].pain, b: SPR[it.n - 1].fix, theta: (r + c) % 2 ? Math.PI : 0 }); g.restore();
  }
  g.restore();
  const v = g.createRadialGradient(W / 2, 1010, 200, W / 2, 1010, 1100); v.addColorStop(0, 'rgba(20,7,12,.25)'); v.addColorStop(1, 'rgba(20,7,12,.88)');
  g.fillStyle = v; g.fillRect(0, 0, W, H);
  glow(g, W / 2, 1010, 900, '176,42,92', .26 + .06 * Math.sin(t * 3));
}

// la tarjeta del centro: la que toca en este instante, y el salto (2 fotogramas) a la siguiente
function slot(g, t) {
  const u = (t - T0) / STEP, k = Math.floor(u), f = u - k;
  if (t < T0 || t >= T1 + .9) return null;
  const i = Math.min(N - 1, k), it = ITEMS[ORDER[i]], last = k >= N - 1;
  const swap = !last && f > 1 - 1 / 9 ? 1 : 0, s = 1.08 * (1 + .05 * Math.exp(-f * 9));
  g.save(); g.translate(540, 1010);
  // la pila de detrás: dos tarjetas asomando, como una baraja
  for (const [dy, a] of [[46, .35], [24, .6]]) { g.save(); g.translate(0, dy); g.scale(s * .94, s * .94); g.globalAlpha = a; drawCard(g, { a: SPR[it.n - 1].fix, b: SPR[it.n - 1].fix }); g.restore(); }
  g.save(); g.scale(s, s * (swap ? .2 : 1)); g.shadowColor = 'rgba(10,2,6,.7)'; g.shadowBlur = 50; g.shadowOffsetY = 20;
  drawCard(g, { a: SPR[it.n - 1].fix, b: SPR[it.n - 1].fix }); g.restore();
  g.restore();
  return { it, k, f };
}

function pill(g, x, y, s, col, bg) {
  const w = measure(g, s, 700, 34, 'PlexMono') + 56;
  g.fillStyle = bg; rr(g, x - w / 2, y - 34, w, 60, 30); g.fill(); text(g, s, x, y + 6, 34, col, { w: 700, fam: 'PlexMono', align: 'center' });
}

let TX = [];
const tx = (id, s, b) => TX.push({ id, text: s, x0: b[0], y0: b[1], x1: b[2], y1: b[3] });
window.render = (t) => {
  t = clamp(t, 0, DUR - 1e-4); TX = [];
  const g = G; g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
  backdrop(g, t);
  const endA = ease.cubic(seg(t, END - .15, END + .25)) * (1 - ease.cubic(seg(t, LOOP, DUR)));
  // el gancho: arriba, fijo durante toda la ruleta
  const hookA = 1 - endA;
  if (hookA > 0) {
    g.save(); g.globalAlpha = hookA;
    const pk = 1 + .04 * Math.abs(Math.sin(t * Math.PI * 2));   // late a 120 BPM
    g.save(); g.translate(540, 410); g.scale(pk, pk);
    text(g, 'PARA EL VÍDEO', 8, 10, 136, C.rose7, { w: 700, align: 'center', ls: -4 });
    text(g, 'PARA EL VÍDEO', 0, 0, 136, C.pink, { w: 700, align: 'center', ls: -4 });
    g.restore();
    text(g, 'y mira qué dolor de cabeza te toca', 540, 520, 54, C.paper, { w: 700, align: 'center', ls: -1.2 });
    text(g, '(y cómo se acaba)', 540, 590, 46, C.pink2, { w: 600, align: 'center', ls: -.8 });
    g.restore();
    if (t < END - .2) tx('hook', 'PARA EL VÍDEO y mira qué dolor de cabeza te toca (y cómo se acaba)', [70, 270, 1010, 610]);
  }
  const sl = hookA > 0 ? slot(g, t) : null;
  if (sl && hookA > .5) {
    pill(g, 540, 1268, `Nº ${String(sl.it.n).padStart(2, '0')} DE 30`, C.paper, 'rgba(176,42,92,.9)');
    if (sl.f < .12) { g.fillStyle = `rgba(255,240,246,${.08 * (1 - sl.f / .12)})`; g.fillRect(0, 0, W, H); }
  }
  // el cierre: la pregunta, el logo y la web; se queda quieto y vuelve al principio
  if (endA > 0) {
    g.save(); g.globalAlpha = endA;
    const r = spring(t, END, 2.2, .55);
    text(g, '¿Qué te ha tocado?', 540, 420, 92, C.paper, { w: 700, align: 'center', ls: -2.4 });
    text(g, 'Comenta tu número ↓', 540, 530, 70, C.pink, { w: 700, align: 'center', ls: -1.6 });
    const L = 380 * clamp(r, 0, 1.15), lx = 540 - L / 2, ly = 860 - L / 2;
    if (L > 4) { g.save(); g.lineWidth = 60; g.strokeStyle = 'rgba(246,185,207,.14)'; rr(g, lx, ly, L, L, L * 18 / 64); g.stroke(); g.restore(); g.drawImage(LOGOSPR, lx, ly, L, L); spark(g, lx + 51.8 * L / 64, ly + 12.2 * L / 64, 6.1 * L / 64); }
    text(g, 'Klimafacturas', 540, 1180, 96, C.paper, { w: 700, align: 'center', ls: -3.2 });
    text(g, 'Las 30, resueltas en un solo programa', 540, 1256, 40, C.pink2, { w: 600, align: 'center', ls: -.6 });
    pill(g, 540, 1390, 'klimafacturas.com', C.paper, C.rose);
    g.restore();
    if (t > END + .4 && t < LOOP) { tx('q', '¿Qué te ha tocado? Comenta tu número', [100, 330, 980, 560]); tx('brand', 'Klimafacturas Las 30, resueltas en un solo programa klimafacturas.com', [120, 1100, 960, 1430]); }
  }
  if (t >= END && t < END + .7) shockwave(g, 540, 860, t, END, { r0: 120, r1: 900, dur: .6, lw: 16 });
  const v = g.createRadialGradient(W / 2, H / 2, H * .35, W / 2, H / 2, H * .78); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(8,2,5,.45)'); g.fillStyle = v; g.fillRect(0, 0, W, H);
};
// eventos de sonido: un tic por tarjeta (sube de tono hacia el final), el golpe del cierre
const EV = [{ t: 0, type: 'meta', bpm: 120, bar0: 0, dur: DUR }];
for (let k = 0; k < N; k++) EV.push({ t: +(T0 + k * STEP).toFixed(3), type: 'tick', k });
EV.push({ t: END, type: 'logo' }, { t: LOOP, type: 'loop' });
window.EV = EV; window.DUR = DUR; window.TEXTS = () => TX; window.READY = true;
