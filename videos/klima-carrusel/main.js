// Carrusel «30 cosas que odias de llevar un negocio» para Instagram: 8 láminas de 1080×1350 que son una sola imagen
// panorámica (8640×1350). El raíl rosa de la cinta y las tarjetas cruzan de una lámina a la siguiente, para que deslizar
// se sienta como seguir una toma. Se pinta entero en un lienzo y luego se corta en ocho JPEG.
import { clamp, lerp, hash, text, measure, rr } from './lib.js';
import { C, kPath, sparkPath } from './world.js';
import { CHAPTERS, ITEMS } from './data.js';
import { seal } from './pieces.js';
import { glow, spark } from './fx.js';

const SW = 1080, SH = 1350, N = 8, W = SW * N;
const cv = document.getElementById('c'); cv.width = SW; cv.height = SH;
const P = document.createElement('canvas'); P.width = W; P.height = SH;   // la panorámica entera
const g = P.getContext('2d');
const SLIDE = +(new URLSearchParams(location.search).get('s') || 0);
for (const w of [500, 600, 700]) { await document.fonts.load(`${w} 40px "Plex"`); await document.fonts.load(`${w} 40px "PlexMono"`); }

function wrap(s, w, size, maxW) {
  const words = s.split(' '), lines = []; let cur = '';
  for (const wd of words) { const t = cur ? cur + ' ' + wd : wd; if (cur && measure(g, t, w, size, 'Plex', false, -size * .02) > maxW) { lines.push(cur); cur = wd; } else cur = t; }
  if (cur) lines.push(cur); return lines;
}
function fit(s, w, hi, lo, maxW, maxLines) {
  for (let size = hi; size >= lo; size--) { const l = wrap(s, w, size, maxW); if (l.length <= maxLines) return { size, lines: l }; }
  return { size: lo, lines: wrap(s, w, lo, maxW) };
}
function shadow(x, y, w, h, r, a = .55) {
  g.save(); g.shadowColor = `rgba(10,2,6,${a})`; g.shadowBlur = 40; g.shadowOffsetY = 18; g.fillStyle = '#000'; rr(g, x, y, w, h, r); g.fill(); g.restore();
}
function check(x, y, r) {
  g.fillStyle = C.paper; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.strokeStyle = C.rose; g.lineWidth = r * .2; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(x - r * .4, y + r * .02); g.lineTo(x - r * .1, y + r * .32); g.lineTo(x + r * .44, y - r * .3); g.stroke();
}
function cross(x, y, r) {
  g.save(); g.strokeStyle = 'rgba(184,38,31,.85)'; g.lineWidth = 5; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
  g.lineCap = 'round'; g.lineWidth = 7; const k = r * .36; g.beginPath(); g.moveTo(x - k, y - k); g.lineTo(x + k, y + k); g.moveTo(x + k, y - k); g.lineTo(x - k, y + k); g.stroke(); g.restore();
}
// tarjeta del dolor (papel térmico) centrada en (cx, cy), girada rot
function painCard(it, cx, cy, rot, w = 820, h = 196) {
  g.save(); g.translate(cx, cy); g.rotate(rot);
  shadow(-w / 2, -h / 2, w, h, 22);
  const gr = g.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2); gr.addColorStop(0, '#fdf9f4'); gr.addColorStop(.55, C.papel); gr.addColorStop(1, '#efe2d6');
  g.fillStyle = gr; rr(g, -w / 2, -h / 2, w, h, 22); g.fill();
  g.save(); rr(g, -w / 2, -h / 2, w, h, 22); g.clip(); g.fillStyle = 'rgba(58,20,32,.03)'; for (let y = -h / 2; y < h / 2; y += 3) g.fillRect(-w / 2, y, w, 1);
  g.fillStyle = 'rgba(176,42,92,.85)'; g.fillRect(-w / 2, -h / 2, 10, h); g.restore();
  text(g, String(it.n).padStart(2, '0'), -w / 2 + 36, 11, 30, C.rose, { w: 600, fam: 'PlexMono' });
  const f = fit(it.pain, 700, h < 170 ? 44 : 52, 38, w - 220, 2), lh = f.size * 1.12, y0 = -(f.lines.length - 1) * lh / 2 + f.size * .36;
  f.lines.forEach((l, j) => text(g, l, -w / 2 + 104, y0 + j * lh, f.size, C.ink, { w: 700, ls: -f.size * .02 }));
  cross(w / 2 - 66, 0, 32);
  g.restore();
}
// tarjeta resuelta (rosa): el dolor tachado arriba y la solución grande
function fixCard(it, x, y, w, h) {
  shadow(x, y, w, h, 24);
  const gr = g.createLinearGradient(x, y, x + w * .6, y + h * 1.6); gr.addColorStop(0, '#bf3769'); gr.addColorStop(.6, C.rose); gr.addColorStop(1, C.rose6);
  g.fillStyle = gr; rr(g, x, y, w, h, 24); g.fill();
  g.save(); rr(g, x, y, w, h, 24); g.clip();
  const hl = g.createLinearGradient(0, y, 0, y + h); hl.addColorStop(0, 'rgba(255,225,238,.22)'); hl.addColorStop(.12, 'rgba(255,225,238,0)'); hl.addColorStop(1, 'rgba(60,8,28,.18)');
  g.fillStyle = hl; g.fillRect(x, y, w, h); g.fillStyle = 'rgba(255,225,238,.55)'; g.fillRect(x, y, 10, h); g.restore();
  text(g, String(it.n).padStart(2, '0'), x + 34, y + h / 2 + 11, 30, C.pink1, { w: 600, fam: 'PlexMono' });
  const X0 = x + 100, maxW = w - 100 - 120;
  const sp = fit(it.pain, 600, 34, 26, maxW, 1), sy = y + 54, sw = measure(g, sp.lines[0], 600, sp.size);
  text(g, sp.lines[0], X0, sy, sp.size, 'rgba(251,246,242,.72)', { w: 600 });
  g.fillStyle = 'rgba(251,246,242,.85)'; g.fillRect(X0 - 4, sy - sp.size * .32, sw + 8, 3.5);
  const f = fit(it.fix, 700, 56, 42, maxW, 2), lh = f.size * 1.08, top = y + 74, room = h - 74 - 18;
  const y0 = top + (room - (f.lines.length - 1) * lh) / 2 + f.size * .36;
  f.lines.forEach((l, j) => text(g, l, X0, y0 + j * lh, f.size, C.paper, { w: 700, ls: -f.size * .02 }));
  check(x + w - 64, y + h / 2, 36);
}
function flap(cx, cy, s, ch) {
  const w = s * .82, h = s; g.fillStyle = C.papel; rr(g, cx - w / 2, cy - h / 2, w, h, s * .1); g.fill();
  text(g, ch, cx, cy + s * .25, s * .7, C.ink, { w: 600, fam: 'PlexMono', align: 'center' });
  g.fillStyle = 'rgba(58,20,32,.18)'; g.fillRect(cx - w / 2, cy - 1, w, 2);
}
function counter(cx, cy, n) {
  g.fillStyle = 'rgba(16,5,10,.72)'; rr(g, cx - 150, cy - 50, 300, 100, 26); g.fill();
  g.strokeStyle = 'rgba(246,185,207,.35)'; g.lineWidth = 3; g.stroke();
  const s = String(n).padStart(2, '0'); flap(cx - 88, cy, 62, s[0]); flap(cx - 32, cy, 62, s[1]);
  text(g, '/30', cx + 6, cy + 18, 50, C.pink, { w: 700, fam: 'PlexMono' });
}

// ——— el fondo continuo: vino, brillos rosas y la retícula de puntos, de punta a punta ———
const bg = g.createLinearGradient(0, 0, 0, SH); bg.addColorStop(0, '#1b0910'); bg.addColorStop(.55, '#2a0f19'); bg.addColorStop(1, '#3a1420');
g.fillStyle = bg; g.fillRect(0, 0, W, SH);
for (let s = 0; s < N; s++) glow(g, s * SW + 540 + (s % 2 ? 200 : -200), s % 2 ? 380 : 980, 900, '176,42,92', .22);
g.fillStyle = 'rgba(246,185,207,.07)'; for (let y = 24; y < SH; y += 64) for (let x = 24; x < W; x += 64) g.fillRect(x - 1.5, y - 1.5, 3, 3);

// ——— el raíl: una línea rosa que recorre las ocho láminas y pasa por cada capítulo ———
const RAILY = 1306;
g.save(); g.lineCap = 'round';
g.strokeStyle = 'rgba(201,64,122,.22)'; g.lineWidth = 26; g.beginPath(); g.moveTo(-20, RAILY); g.lineTo(7 * SW + 60, RAILY); g.stroke();
g.strokeStyle = 'rgba(201,64,122,.95)'; g.lineWidth = 7; g.beginPath(); g.moveTo(-20, RAILY); g.lineTo(7 * SW + 60, RAILY); g.stroke();
g.restore();
for (let s = 1; s <= 6; s++) { const x = s * SW + 540; g.fillStyle = C.paper; g.beginPath(); g.arc(x, RAILY, 13, 0, Math.PI * 2); g.fill(); g.strokeStyle = C.spark; g.lineWidth = 6; g.stroke(); }

// ——— lámina 1: el gancho ———
{
  const ox = 0;
  text(g, '30', ox + 552, 432, 380, C.rose7, { w: 700, align: 'center', ls: -16 });
  text(g, '30', ox + 540, 418, 380, C.pink, { w: 700, align: 'center', ls: -16 });
  text(g, 'cosas que odias', ox + 540, 548, 92, C.paper, { w: 700, align: 'center', ls: -2.6 });
  text(g, 'de llevar un negocio.', ox + 540, 650, 92, C.paper, { w: 700, align: 'center', ls: -2.6 });
  text(g, '¿Cuántas te pasan?', ox + 540, 770, 62, C.pink, { w: 700, align: 'center', ls: -1.4 });
  // las tarjetas del dolor, desordenadas; la última se sale hacia la lámina 2
  const pile = [[1, 520, 885, -.035], [4, 565, 1055, .028], [15, 525, 1225, -.02]];
  pile.forEach(([n, x, y, r]) => painCard(ITEMS[n - 1], ox + x, y, r, 880, 152));
  text(g, 'DESLIZA  →', ox + 1036, 80, 30, C.pink2, { w: 700, fam: 'PlexMono', align: 'right', ls: 3 });
}

// ——— láminas 2–7: un capítulo cada una, ya resuelto ———
for (let k = 0; k < 6; k++) {
  const ox = (k + 1) * SW, its = ITEMS.filter(it => it.k === k);
  text(g, `${k + 1}/6`, ox + 70, 118, 30, C.pink2, { w: 600, fam: 'PlexMono' });
  text(g, CHAPTERS[k].title, ox + 68, 196, 84, C.paper, { w: 700, ls: -2.2 });
  counter(ox + 860, 160, (k + 1) * 5);
  const cw = 960, ch = 186, gap = 16, y0 = 244;
  its.forEach((it, i) => fixCard(it, ox + 60, y0 + i * (ch + gap), cw, ch));
  // lo que se lleva cada capítulo: el lacre en Hacienda, el contrato roto que salta a la última lámina
  if (k === 1) seal(g, ox + 1010, 1262, 74, { rot: -.2 });
}

// ——— lámina 8: la respuesta, el logo y la llamada ———
{
  const ox = 7 * SW;
  // las dos mitades del contrato que se rompió en la lámina 7 caen aquí
  g.save(); g.translate(ox - 10, 1296); g.rotate(.32); g.scale(.62, .62); g.globalAlpha = .92;
  g.fillStyle = C.papel; g.beginPath(); g.moveTo(-200, -70); g.lineTo(60, -70); g.lineTo(40, -30); g.lineTo(70, 10); g.lineTo(45, 50); g.lineTo(65, 80); g.lineTo(-200, 80); g.closePath(); g.fill(); g.restore();
  text(g, '¿Cuántas te pasaban?', ox + 540, 170, 70, C.paper, { w: 700, align: 'center', ls: -1.6 });
  text(g, 'Ya ninguna.', ox + 540, 268, 88, C.pink, { w: 700, align: 'center', ls: -2 });
  const L = 420, lx = ox + 540 - L / 2, ly = 330, s = L / 64;
  g.save(); g.lineWidth = 70; g.strokeStyle = 'rgba(246,185,207,.13)'; rr(g, lx, ly, L, L, 18 * s); g.stroke(); g.restore();
  shadow(lx, ly, L, L, 18 * s, .6); g.fillStyle = C.ink; rr(g, lx, ly, L, L, 18 * s); g.fill();
  kPath(g, s, lx, ly); g.fillStyle = C.paper; g.fill();
  spark(g, lx + 51.8 * s, ly + 12.2 * s, 6.1 * s);
  text(g, 'Klimafacturas', ox + 540, 880, 100, C.paper, { w: 700, align: 'center', ls: -3.4 });
  text(g, 'CUMPLE VERIFACTU · SIN PERMANENCIA', ox + 540, 948, 28, C.pink2, { w: 600, fam: 'PlexMono', align: 'center', ls: 3.4 });
  const bw = 760, bh = 120, by = 1010;
  g.fillStyle = 'rgba(176,42,92,.35)'; rr(g, ox + 540 - bw / 2 + 6, by + 14, bw, bh, bh / 2); g.fill();
  g.fillStyle = C.rose; rr(g, ox + 540 - bw / 2, by, bw, bh, bh / 2); g.fill();
  text(g, 'Pruébalo en klimafacturas.com', ox + 540, by + 76, 46, C.paper, { w: 700, align: 'center', ls: -.8 });
  text(g, 'Guárdalo y envíaselo a quien lleve un negocio', ox + 540, 1212, 38, C.paper, { w: 600, align: 'center', ls: -.6 });
  text(g, '¿Cuántas eran? Cuéntanoslo en comentarios ↓', ox + 540, 1272, 32, C.pink2, { w: 600, align: 'center' });
}
// la chispa recorre el raíl: aparece donde cada lámina empieza, como si tirara de la siguiente
for (let s = 0; s < 7; s++) spark(g, (s + 1) * SW - 70, RAILY, 22);

cv.getContext('2d').drawImage(P, -SLIDE * SW, 0);   // la lámina que toca
window.READY = true; window.DUR = 1; window.render = () => {};
