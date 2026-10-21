// La pantalla vertical gigante del plató. En reposo enseña el logo del concurso; en la ronda extra la cámara entra en
// ella y la pantalla se vuelve un collage editorial de papel, con la gramática visual de darin-broll-skill (licencia
// MIT, © 2026 狗哥笔记 / Darin Ji): un campo de papel mostaza plano, sin degradados ni viñeta; recortes de pantallas
// reales de Klimafacturas (capturas del programa con datos inventados) impresos en semitono blanco y negro, con corte
// limpio, filete crema y sombra de papel suave; dos cartulinas de acento (teja y verde petróleo) y tiras negras con el
// nombre de cada función. Se monta pieza a pieza desde el campo vacío, cada una con su gesto (cae, entra deslizando,
// sube, se abre), a 12 fotogramas por segundo como un stop-motion; cuando aterriza la última, todo se queda quieto.
// Coordenadas locales 1080×1920: quien llama escala esto al tamaño de la pantalla en el plató.
import { K, SETS, W, H, starPath, rays, measure, telop, text } from './kit.js';
import { STICKERS, BONUS, MORE } from './timeline.js';

const SF = 12;                                                     // fotogramas por segundo del stop-motion
const frameOf = t => Math.floor(t * SF + 1e-4);
export const landAt = t => Math.round(t * SF) / SF;                // el fotograma del stop-motion más cercano a t

// paleta de darin-broll: mostaza para las herramientas; teja y petróleo de acento; crema para filetes y letra
const MOSTAZA = '#D3A72C', CREMA = '#F1E6CF', TEJA = '#D95D39', PETROLEO = '#174F52', TINTA = '#1E1A17';

// fibra de papel sin estucar: grano de un píxel y fibras cortas, claras y oscuras (se genera una vez, determinista)
const FIBRA = document.createElement('canvas'); FIBRA.width = W; FIBRA.height = H;
{
  const q = FIBRA.getContext('2d'), im = q.createImageData(W, H), d = im.data;
  let s = 0x2545F491; const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
  for (let i = 0; i < W * H; i++) { const v = rnd() < .5 ? 255 : 50; d[i * 4] = d[i * 4 + 1] = v; d[i * 4 + 2] = v * .9; d[i * 4 + 3] = 4 + rnd() * 9; }
  q.putImageData(im, 0, 0);
  q.lineCap = 'round';
  for (let i = 0; i < 3200; i++) {
    const x = rnd() * W, y = rnd() * H, a = rnd() * Math.PI, l = 4 + rnd() * 14, b = (rnd() - .5) * 4;
    q.strokeStyle = rnd() < .55 ? 'rgba(255,248,228,.16)' : 'rgba(70,45,10,.1)'; q.lineWidth = .5 + rnd() * .7;
    q.beginPath(); q.moveTo(x, y);
    q.quadraticCurveTo(x + Math.cos(a) * l / 2 - Math.sin(a) * b, y + Math.sin(a) * l / 2 + Math.cos(a) * b, x + Math.cos(a) * l, y + Math.sin(a) * l); q.stroke();
  }
}

// dónde queda cada recorte (centro, ancho, qué franja de la captura se usa de arriba abajo, giro), la cartulina que lleva
// detrás (color, desplazamiento y giro), cómo entra y su etiqueta encima del borde de arriba:
// [−1 izquierda · 0 centro · 1 derecha, giro]. La franja deja fuera el título de cada pantalla: el título es la etiqueta.
// Los anchos son los de halftone.py (ANCHO): la trama sale al tamaño justo.
const LAYOUT = {
  tpv:           { x: 300, y: 735,  w: 420, crop: [.09, 1],   rot: -.03,  mat: [TEJA, -18, 16, -.065],  enter: 'drop',  lab: [-1, -.035] },
  presupuesto:   { x: 790, y: 720,  w: 390, crop: [.19, 1],   rot: .035,  mat: [PETROLEO, 16, 18, .07], enter: 'right', lab: [1, .03] },
  fe:            { x: 360, y: 1160, w: 560, crop: [.275, 1],   rot: -.02,  enter: 'left',  lab: [-1, -.025] },
  recordatorios: { x: 240, y: 1470, w: 330, crop: [.3, .76],  rot: -.035, enter: 'rise',  lab: [-1, -.03] },
  empresas:      { x: 850, y: 1150, w: 330, crop: [.12, 1],   rot: .04,   enter: 'right', lab: [0, .035] },
  asistente:     { x: 820, y: 1492, w: 330, crop: [.23, 1],   rot: .045,  enter: 'rise',  lab: [1, .03] },
};
const TITLE = { s: '¡Y además!', x: 540, y: 330, rot: -.025, t: BONUS + .65, enter: 'left' };   // la cámara ya ha entrado
const BADGE = { s: ['y mucho', 'más'], x: 540, y: 1500, r: 112, rot: -.07 };                    // con «y mucho más»
const KEY = 7, MAT = 24;                                                                       // filete crema y margen de la cartulina

// los tres fotogramas antes de aterrizar: desplazamiento, escala (más grande = más cerca de la cámara), altura sobre el
// papel (la sombra se aleja y se difumina) y giro extra
const ENTER = {
  drop:  [[0, -1150, 1.1, 1, .06], [0, -330, 1.05, .6, .025], [0, 22, 1.01, .15, -.008]],
  left:  [[-1300, 0, 1, .35, -.06], [-380, 0, 1, .3, -.025], [24, 0, 1, .1, .008]],
  right: [[1300, 0, 1, .35, .06], [380, 0, 1, .3, .025], [-24, 0, 1, .1, -.008]],
  rise:  [[0, 1250, 1, .35, .06], [0, 360, 1, .3, .025], [0, -24, 1, .1, -.008]],
};
// pose de una pieza `fr` fotogramas después de aterrizar (negativo: aún en el aire); null si todavía no ha entrado
function poseOf(L, fr) {
  if (fr < -3) return null;
  if (fr >= 0) return { x: L.x, y: L.y, rot: L.rot, s: 1, lift: 0 };
  const [dx, dy, s, lift, r] = ENTER[L.enter][fr + 3];
  return { x: L.x + dx, y: L.y + dy, rot: L.rot + r, s, lift };
}

// un recorte de tijera: casi un rectángulo, con las esquinas un pelo fuera de escuadra
const hash1 = n => { n = Math.sin(n * 91.7 + 17.3) * 43758.5453; return n - Math.floor(n); };
const cut = (w, h, seed, j = 2.5) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy], i) =>
  [sx * w / 2 + (hash1(seed + i * 3.1) - .5) * 2 * j, sy * h / 2 + (hash1(seed + i * 5.7) - .5) * 2 * j]);
const poly = (g, pts) => { g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); };
// sombra de papel suave; cuanto más levantada la pieza, más lejos y más difusa (las sombras van en píxeles de pantalla)
function shadowed(g, lift, fn) {
  const m = g.getTransform(), sc = Math.hypot(m.a, m.b);
  g.shadowColor = `rgba(52,32,6,${.3 - .12 * lift})`; g.shadowBlur = (9 + 30 * lift) * sc;
  g.shadowOffsetX = (4 + 14 * lift) * sc; g.shadowOffsetY = (7 + 24 * lift) * sc;
  fn();
  g.shadowColor = 'rgba(0,0,0,0)'; g.shadowBlur = g.shadowOffsetX = g.shadowOffsetY = 0;
}
// la fibra del papel dentro de una cartulina (se mueve con ella)
function fibre(g, pts, seed) {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0, h = Math.max(...ys) - y0;
  const ox = Math.floor(hash1(seed) * (W - w)), oy = Math.floor(hash1(seed + 1) * (H - h));
  g.save(); poly(g, pts); g.clip(); g.drawImage(FIBRA, ox, oy, w, h, x0, y0, w, h); g.restore();
}

// un recorte: la cartulina de color, el filete crema con su sombra y la captura en semitono encima
function piece(g, img, L, P, seed) {
  const [c0, c1] = L.crop, sy = img.height * c0, ih = img.height * (c1 - c0), w = L.w, h = w * ih / img.width;
  g.save(); g.translate(P.x, P.y); g.rotate(P.rot); g.scale(P.s, P.s);
  if (L.mat) {
    const [col, mx, my, mr] = L.mat, mp = cut(w + 2 * MAT, h + 2 * MAT, seed + 50, 3);
    g.save(); g.translate(mx, my); g.rotate(mr - L.rot);
    shadowed(g, P.lift, () => { g.fillStyle = col; poly(g, mp); g.fill(); });
    fibre(g, mp, seed + 7); g.restore();
  }
  shadowed(g, L.mat ? 0 : P.lift, () => { g.fillStyle = CREMA; poly(g, cut(w + 2 * KEY, h + 2 * KEY, seed, 2)); g.fill(); });
  g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, sy, img.width, ih, -w / 2, -h / 2, w, h);
  g.restore();
  return { w, h };
}

// tira de papel con letra: negra con letra crema (etiquetas) o crema con letra negra (el título)
function strip(g, s, x, y, rot, k, { size = 38, fill = TINTA, ink = CREMA, fam = 'Fredoka', w: wt = 600, lift = 0 } = {}) {
  const tw = measure(g, s, size, wt, fam), w = tw + size * 1.15, h = size * 1.6;
  g.save(); g.translate(x, y); g.rotate(rot); g.scale(k, k);
  const pts = cut(w, h, s.length * 7.3, 1.6);
  shadowed(g, lift, () => { g.fillStyle = fill; poly(g, pts); g.fill(); });
  fibre(g, pts, s.length);
  text(g, s, 0, size * .35, size, ink, { w: wt, fam, align: 'center' });
  g.restore();
  return { w, h };
}
// caja de un rectángulo girado (para el control de lectura)
function box(x, y, w, h, rot, k = 1) {
  const c = Math.abs(Math.cos(rot)), s = Math.abs(Math.sin(rot)), bw = (w * c + h * s) / 2 * k, bh = (h * c + w * s) / 2 * k;
  return [x - bw, y - bh, x + bw, y + bh];
}

// la etiqueta de una pieza, pegada sobre su borde de arriba (lo pisa 14 px); entra un fotograma después de que aterrice
function label(g, s, L, P, dims, fr, id, tx) {
  if (fr < 1) return;
  const size = 38, k = fr === 1 ? 1.16 : 1, [side, rot] = L.lab, lw = measure(g, s, size, 600) + size * 1.15;
  const ax = side * Math.max(0, dims.w / 2 - lw / 2 - 14), ay = -dims.h / 2 - size * .8 + 14, c = Math.cos(L.rot), sn = Math.sin(L.rot);
  const x = Math.min(Math.max(P.x + ax * c - ay * sn, 30 + lw / 2), W - 30 - lw / 2), y = P.y + ax * sn + ay * c;
  const { w, h } = strip(g, s, x, y, L.rot + rot, k, { size });
  if (fr >= 2) tx(id, s, box(x, y, w, h, L.rot + rot));
}

// el título: tira crema con letra negra, entra deslizando desde la izquierda
function title(g, fr, tx) {
  const P = poseOf(TITLE, fr); if (!P) return;
  const { w, h } = strip(g, TITLE.s, P.x, P.y, P.rot, 1, { size: 92, fill: CREMA, ink: TINTA, fam: 'Fraunces', w: 600, lift: P.lift });
  if (fr >= 0) tx('bonus', TITLE.s, box(TITLE.x, TITLE.y, w, h, TITLE.rot));
}

// «y mucho más»: un disco de cartulina petróleo con filete crema que se abre de golpe
function badge(g, fr, tx) {
  if (fr < 0) return;
  const k = [.45, 1.13, .96][fr] ?? 1, { x, y, r, rot } = BADGE;
  g.save(); g.translate(x, y); g.rotate(rot); g.scale(k, k);
  shadowed(g, fr < 2 ? .3 : 0, () => { g.fillStyle = CREMA; g.beginPath(); g.arc(0, 0, r + KEY, 0, Math.PI * 2); g.fill(); });
  const disc = Array.from({ length: 48 }, (_, i) => [Math.cos(i / 48 * Math.PI * 2) * r, Math.sin(i / 48 * Math.PI * 2) * r]);
  g.fillStyle = PETROLEO; poly(g, disc); g.fill(); fibre(g, disc, 99);
  text(g, BADGE.s[0], 0, -10, 50, CREMA, { w: 700, align: 'center' });
  text(g, BADGE.s[1], 0, 46, 50, CREMA, { w: 700, align: 'center' });
  g.restore();
  if (fr >= 2) tx('more', BADGE.s.join(' '), box(x, y, 2 * r, 2 * r, 0));
}

// en reposo: el logo del concurso con rayos
function idle(g, t) {
  const [bg, p] = SETS.hook;
  g.fillStyle = bg; g.fillRect(0, 0, W, H); rays(g, 540, 760, 16, p, t * .25);
  g.save(); g.translate(540, 760); g.rotate(-.04);
  telop(g, '¿QUIÉN', 0, -150, 170, { fill: K.yellow, sw: .15, sh: 12 }); telop(g, 'SALE', 0, 30, 190, { fill: K.white, sw: .15, sh: 12 }); telop(g, 'ANTES?', 0, 220, 190, { fill: K.yellow, sw: .15, sh: 12 });
  g.restore();
  for (let i = 0; i < 5; i++) { const on = (Math.floor(t * 3) + i) % 2 === 0; g.save(); g.translate(150 + i * 195, 1450 + Math.sin(t * 3 + i) * 20); starPath(g, 5, 46, 20, t * .5 + i); g.fillStyle = on ? K.yellow : K.white; g.fill(); g.lineWidth = 8; g.strokeStyle = K.ol; g.stroke(); g.restore(); }
}

// lo que suena en el collage (para events): cada pieza al aterrizar, el título al deslizar y el disco al abrirse
export function collageEvents() {
  const out = [{ t: landAt(TITLE.t) - 2 / SF, type: 'slide', x: TITLE.x }];
  STICKERS.forEach(([, t0, key]) => out.push({ t: landAt(t0), type: 'card', x: LAYOUT[key].x }));
  out.push({ t: landAt(MORE), type: 'card', x: BADGE.x, big: 1 });
  return out;
}

/**
 * Contenido de la pantalla en coordenadas 1080×1920. IMG: { tpv, presupuesto, … } (los recortes en semitono, ya
 * decodificados). tx(id, texto, [x0,y0,x1,y1]): informa de un texto legible (coordenadas locales).
 */
export function screenContent(g, t, IMG, tx) {
  if (t < BONUS) return idle(g, t);
  g.fillStyle = MOSTAZA; g.fillRect(0, 0, W, H); g.drawImage(FIBRA, 0, 0);
  const f = frameOf(t);
  title(g, f - Math.round(TITLE.t * SF), tx);
  // en el orden en que aterrizan: la que está en el aire siempre va por encima
  STICKERS.forEach(([s, t0, key], i) => {
    const L = LAYOUT[key], fr = f - Math.round(t0 * SF), P = poseOf(L, fr); if (!P) return;
    const dims = piece(g, IMG[key], L, P, i * 13 + 5);
    label(g, s, L, P, dims, fr, 'st' + i, tx);
  });
  badge(g, f - Math.round(MORE * SF), tx);
}
