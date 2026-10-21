// Kit de dibujo «Game Show Flat» para lienzo 2D: tinta + papel + caramelos, contorno de tinta grueso,
// sombra dura desplazada (nunca difuminada), rótulos con el trazo por DEBAJO del relleno.
import { clamp, lerp, seg, hash, back, eo, ei } from '/core/lib.js';
export { clamp, lerp, seg, hash, back, eo, ei };

export const K = {
  ol: '#1B1B1B', white: '#FFFFFF', cream: '#FFF6E5', paper: '#FBF6F2',
  yellow: '#FFD23F', orange: '#FF8C42', red: '#FF5A5F', pink: '#FF8FB1', green: '#5BD68A', lime: '#C6F16D',
  sky: '#8ED1FC', blue: '#4D7CFE', violet: '#6B4FBB', violetL: '#7C62CB', teal: '#3FB8AF', navy: '#26264A',
  wine: '#B02A5C', wineD: '#7A1F44', gold: '#FFC928', gray: '#C3CAD9', grayD: '#8D96A8', wood: '#C98A52', woodD: '#8E5530',
  card: '#C9A27A', cardD: '#A87F57',
  // personajes: cada uno es dueño de su color
  lucia: '#FF7EB0', javier: '#6CCBF6', host: '#FFD23F',
};
// los fondos de cada prueba: [fondo, patrón, suelo]
export const SETS = {
  hook: ['#6B4FBB', '#7C62CB', '#4E3893'],
  r1: ['#FFB870', '#FFA85A', '#E8894A'],
  r2: ['#3FB8AF', '#5FC9C1', '#2B8F88'],
  r3: ['#C6F16D', '#B6E35A', '#93C243'],
  r4: ['#FF5A5F', '#FF7276', '#D9434A'],
  r5: ['#4D7CFE', '#6A92FF', '#3A5FCC'],
  bonus: ['#5BD68A', '#73E09C', '#3FAE6C'],
  night: ['#26264A', '#2E2E58', '#1A1A36'],
  gold: ['#FFC928', '#FFD95E', '#E0A800'],
  wine: ['#B02A5C', '#C0386B', '#7A1F44'],
};

export const W = 1080, H = 1920;
export const FONT = { round: 'Fredoka', ui: 'IBM Plex Sans', serif: 'Fraunces' };
export const f = (w, s, fam = FONT.round) => `${w} ${s}px "${fam}"`;

// ——— tiempo ———
export const near = (t, t0, d = .35) => t >= t0 && t < t0 + d;
export const hopY = (t, h, ph = 0) => { const u = ((t + ph) / .5) % 1; return -h * 4 * u * (1 - u); };   // un salto por tiempo (120 BPM)
export const hitSq = (t, t0, a = .14) => t < t0 ? 0 : a * Math.exp(-(t - t0) * 7) * Math.cos((t - t0) * 30);
export const pop = (t, t0, d = .25) => back(seg(t, t0, t0 + d), 2.6);   // entrada con rebote (0→1, pasa de 1)

// ——— formas ———
export function rr(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
// pegatina: sombra dura desplazada + relleno + contorno
export function sticker(g, x, y, w, h, r, fill, { sh = 10, ow = 8, ol = K.ol } = {}) {
  if (sh) { g.fillStyle = ol; rr(g, x + sh, y + sh, w, h, r); g.fill(); }
  g.fillStyle = fill; rr(g, x, y, w, h, r); g.fill();
  if (ow) { g.lineWidth = ow; g.strokeStyle = ol; g.lineJoin = 'round'; g.stroke(); }
}
export function shape(g, path, fill, ow = 8, sh = 0) {   // path(g) traza la forma
  if (sh) { g.save(); g.translate(sh, sh); g.fillStyle = K.ol; path(g); g.fill(); g.restore(); }
  path(g); g.fillStyle = fill; g.fill(); if (ow) { g.lineWidth = ow; g.strokeStyle = K.ol; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(); }
}
export function ellipse(g, x, y, rx, ry, fill, ow = 0, rot = 0) {
  g.beginPath(); g.ellipse(x, y, Math.max(.1, rx), Math.max(.1, ry), rot, 0, Math.PI * 2);
  if (fill) { g.fillStyle = fill; g.fill(); } if (ow) { g.lineWidth = ow; g.strokeStyle = K.ol; g.stroke(); }
}
export function starPath(g, n, r1, r2, rot = 0) {
  g.beginPath(); for (let i = 0; i < n * 2; i++) { const a = rot + i * Math.PI / n - Math.PI / 2, r = i % 2 ? r2 : r1; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath();
}

// ——— fondos ———
export function stripes(g, col, w, ang, scroll = 0) {
  g.save(); g.translate(W / 2, H / 2); g.rotate(ang); g.fillStyle = col;
  const D = 2300, o = ((scroll % (2 * w)) + 2 * w) % (2 * w);
  for (let x = -D + o; x < D; x += 2 * w) g.fillRect(x, -D, w, 2 * D);
  g.restore();
}
export function dots(g, col, step, r, ox = 0, oy = 0) {
  g.fillStyle = col;
  for (let j = -1, y = -step + (oy % step); y < H + step; y += step * .866, j++)
    for (let x = -step + (ox % step) + (j % 2 ? step / 2 : 0); x < W + step; x += step) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
}
export function rays(g, cx, cy, n, col, rot, R = 2600) {
  g.fillStyle = col; const a0 = Math.PI / n;
  for (let i = 0; i < n; i++) {
    const a = rot + i * 2 * a0; g.beginPath(); g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); g.lineTo(cx + Math.cos(a + a0) * R, cy + Math.sin(a + a0) * R); g.closePath(); g.fill();
  }
}
// un plató completo: color, patrón y banda de suelo con su línea de tinta
export function set(g, key, t, { pat = 'stripes', floor = 1500, cx = W / 2, cy = 760 } = {}) {
  const [bg, p, fl] = SETS[key];
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  if (pat === 'stripes') stripes(g, p, 70, -.35, t * 40);
  else if (pat === 'dots') dots(g, p, 96, 17, t * 18, t * 10);
  else if (pat === 'rays') rays(g, cx, cy, 16, p, t * .25);
  if (floor < H) { g.fillStyle = fl; g.fillRect(0, floor, W, H - floor); g.fillStyle = K.ol; g.fillRect(0, floor - 4, W, 8); }
}

// ——— letras ———
export function measure(g, s, size, w = 700, fam = FONT.round, ls = 0) {
  g.font = f(w, size, fam); g.letterSpacing = `${ls}px`; const m = g.measureText(s).width; g.letterSpacing = '0px'; return m;
}
// rótulo: trazo de tinta por debajo (≈14 % del cuerpo a cada lado) y relleno encima
export function telop(g, s, x, y, size, { fill = K.white, stroke = K.ol, sw = .14, align = 'center', w = 700, fam = FONT.round, ls = 0, base = 'alphabetic', sh = 0 } = {}) {
  g.font = f(w, size, fam); g.textAlign = align; g.textBaseline = base; g.letterSpacing = `${ls}px`; g.lineJoin = 'round';
  if (sh) { g.fillStyle = stroke; g.lineWidth = size * sw * 2; g.strokeStyle = stroke; g.strokeText(s, x + sh, y + sh); g.fillText(s, x + sh, y + sh); }
  if (sw) { g.lineWidth = size * sw * 2; g.strokeStyle = stroke; g.strokeText(s, x, y); }
  g.fillStyle = fill; g.fillText(s, x, y); g.letterSpacing = '0px';
}
export function text(g, s, x, y, size, col = K.ol, { w = 700, fam = FONT.round, align = 'left', base = 'alphabetic', ls = 0 } = {}) {
  g.font = f(w, size, fam); g.textAlign = align; g.textBaseline = base; g.letterSpacing = `${ls}px`; g.fillStyle = col; g.fillText(s, x, y); g.letterSpacing = '0px';
}
// letra a letra: cada glifo entra con rebote, `stg` segundos después del anterior
export function telopPop(g, s, x, y, size, t, t0, { stg = .035, d = .22, align = 'center', ...o } = {}) {
  const chars = [...s], ws = chars.map(c => measure(g, c, size, o.w || 700, o.fam || FONT.round, o.ls || 0));
  const tot = ws.reduce((a, b) => a + b, 0); let cx = align === 'center' ? x - tot / 2 : align === 'right' ? x - tot : x;
  chars.forEach((c, i) => {
    const k = pop(t, t0 + i * stg, d);
    if (k > 0 && c !== ' ') { g.save(); g.translate(cx + ws[i] / 2, y - size * .35); g.scale(k, k); g.rotate((1 - Math.min(1, k)) * .3); telop(g, c, 0, size * .35, size, { ...o, align: 'center' }); g.restore(); }
    cx += ws[i];
  });
  return tot;
}

// ——— efectos ———
// estallido: estrella de 8 puntas + anillo blanco que se abre + 8 líneas de velocidad, 0,35 s
export function burst(g, x, y, t, t0, col = K.yellow, s = 1) {
  const u = (t - t0) / .35; if (u < 0 || u > 1) return;
  g.save(); g.translate(x, y); g.scale(s, s);
  const k = eo(u);
  if (u < .55) { g.save(); g.rotate(u * .6); g.scale(.4 + k, .4 + k); starPath(g, 8, 150, 70); g.fillStyle = col; g.fill(); g.lineWidth = 8; g.strokeStyle = K.ol; g.stroke(); g.restore(); }
  g.beginPath(); g.arc(0, 0, 60 + 210 * k, 0, Math.PI * 2); g.lineWidth = 18 * (1 - u); g.strokeStyle = K.white; g.stroke();
  g.strokeStyle = K.ol; g.lineCap = 'round'; g.lineWidth = 9 * (1 - u * .6);
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + .2, r0 = 150 + 150 * k, r1 = r0 + 70 * (1 - u); g.beginPath(); g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); g.stroke(); }
  g.restore();
}
// veredicto: palabra grande inclinada −6°, entra con rebote, se queda y sale encogiendo
export function judge(g, word, x, y, t, t0, { col = K.yellow, size = 128, dur = 1.25, rot = -.1 } = {}) {
  if (t < t0 || t > t0 + dur + .2) return;
  const kin = pop(t, t0, .22), kout = 1 - ei(seg(t, t0 + dur, t0 + dur + .2)), wob = 1 + .05 * Math.sin((t - t0) * 18) * Math.exp(-(t - t0) * 5);
  g.save(); g.translate(x, y); g.rotate(rot); g.scale(kin * kout * wob, kin * kout * wob);
  telop(g, word, 0, size * .36, size, { fill: col, sw: .16, sh: 10 });
  g.restore();
}
// confeti determinista: n papelitos desde (x, y) con gravedad
export function confetti(g, x, y, t, t0, n = 60, spread = 1, seed = 1) {
  const u = t - t0; if (u < 0 || u > 2.6) return;
  const cols = [K.yellow, K.pink, K.sky, K.green, K.orange, K.white, K.lime];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (hash(i * 7.3 + seed) - .5) * 2.6 * spread, v = 900 + hash(i * 3.1 + seed) * 1100;
    const px = x + Math.cos(a) * v * u * .9 + Math.sin(u * 6 + i) * 18, py = y + Math.sin(a) * v * u + 1300 * u * u;
    if (py > H + 40) continue;
    g.save(); g.translate(px, py); g.rotate(u * (6 + hash(i) * 8) + i); g.scale(1, Math.cos(u * 9 + i));
    g.fillStyle = cols[i % cols.length]; g.fillRect(-11, -6, 22, 12); g.lineWidth = 3; g.strokeStyle = K.ol; g.strokeRect(-11, -6, 22, 12); g.restore();
  }
}
// bocadillo con cola hacia (tx, ty)
export function bubble(g, s, x, y, tx, ty, k = 1, { size = 52, w = 600, fill = K.cream } = {}) {
  if (k <= 0) return;
  g.save(); g.translate(tx, ty); g.scale(k, k); g.translate(-tx, -ty);
  const tw = measure(g, s, size, w), bw = tw + 70, bh = size * 1.75, bx = x - bw / 2, by = y - bh / 2;
  // cola
  g.beginPath(); g.moveTo(x - 30, y + bh / 2 - 6); g.lineTo(tx, ty); g.lineTo(x + 30, y + bh / 2 - 6); g.closePath();
  g.fillStyle = K.ol; g.save(); g.translate(8, 8); g.fill(); g.restore();
  sticker(g, bx, by, bw, bh, bh / 2, fill, { sh: 8, ow: 7 });
  g.beginPath(); g.moveTo(x - 30, y + bh / 2 - 6); g.lineTo(tx, ty); g.lineTo(x + 30, y + bh / 2 - 6); g.fillStyle = fill; g.fill();
  g.lineWidth = 7; g.strokeStyle = K.ol; g.lineJoin = 'round'; g.beginPath(); g.moveTo(x - 30, y + bh / 2 - 1); g.lineTo(tx, ty); g.lineTo(x + 30, y + bh / 2 - 1); g.stroke();
  text(g, s, x, y + size * .36, size, K.ol, { w, align: 'center' });
  g.restore();
  return { x0: bx, y0: by, x1: bx + bw, y1: by + bh };
}
// pastilla de texto (etiquetas, «PRUEBA 2»)
export function pill(g, s, x, y, size, fill, col, { w = 700, padX = .7, sh = 6, ow = 6, align = 'center' } = {}) {
  const tw = measure(g, s, size, w), pw = tw + size * padX * 2, ph = size * 1.5;
  const px = align === 'center' ? x - pw / 2 : align === 'right' ? x - pw : x;
  sticker(g, px, y - ph / 2, pw, ph, ph / 2, fill, { sh, ow });
  text(g, s, px + pw / 2, y + size * .36, size, col, { w, align: 'center' });
  return { x0: px, y0: y - ph / 2, x1: px + pw, y1: y + ph / 2 };
}
