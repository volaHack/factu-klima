// «7 errores» · reel de Klimafacturas (1080×1920, 30 fps, 29,5 s). Una sola toma sobre una factura de verdad hecha a
// mano con siete fallos. Reto de 3 segundos, la cámara se lanza a cada fallo y lo marca en rojo, y al final la factura
// falla, se rebobina y se reimprime bien hecha por Klimafacturas: cada círculo pasa a verde. Obturador real de 180°.
import { W, H, clamp, lerp, seg, ease, spring, kick, hash, text, measure, rr } from './lib.js';
import { C } from './world.js';
import { seal } from './pieces.js';
import { LOGOSPR } from './cards.js';
import { shockwave, glow, glitch, spark, flapTile } from './fx.js';

const FPS = 30, DUR = 33;
const R0 = 3.6, RS = 2.6;                       // empieza la revisión; cada fallo dura 2,6 s
const rev = k => R0 + RS * k;
const T = { go: 3.5, pull: [21.7, 22.3], fix: 22.5, scan: [22.8, 23.9], seal: 24.2, ok: 24.4, end: 28.0, still: 29.4 };
const cv = document.getElementById('c'), G = cv.getContext('2d');
const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
const ACC = mk(), SUB = mk(), A = ACC.getContext('2d'), B = SUB.getContext('2d');
for (const w of [500, 600, 700]) { await document.fonts.load(`${w} 40px "Plex"`); await document.fonts.load(`${w} 40px "PlexMono"`); }

// ——— la factura (coordenadas de mundo: 900 × 1270) ———
const PW = 900, PH = 1270;
const ERR = [   // [x, y, radio x, radio y, título, explicación]
  [745, 158, 150, 44, 'Sin número', 'Obligatorio y correlativo'],
  [745, 212, 150, 42, 'Sin fecha', 'La de expedición, siempre'],
  [250, 352, 200, 42, 'Falta el NIF', 'Del cliente: sin él no es factura completa'],
  [280, 398, 230, 42, 'Sin domicilio', 'El del cliente también va'],
  [690, 808, 190, 46, 'IVA en Canarias', 'Aquí se aplica IGIC (7 %)'],
  [705, 880, 200, 54, 'No cuadra', '100 + 21 son 121, no 112'],
  [175, 1095, 135, 135, 'Sin QR Verifactu', 'Lo exigirá Verifactu'],
];
function qr(g, x, y, s) {   // un QR de muestra (módulos deterministas, con sus tres esquinas)
  const n = 25, m = s / n; g.fillStyle = C.ink;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (hash(i * 31.7 + j * 7.3) > .52) g.fillRect(x + i * m, y + j * m, m + .3, m + .3);
  for (const [a, b] of [[0, 0], [n - 7, 0], [0, n - 7]]) { g.fillStyle = C.ink; g.fillRect(x + a * m, y + b * m, 7 * m, 7 * m); g.fillStyle = '#fff'; g.fillRect(x + (a + 1) * m, y + (b + 1) * m, 5 * m, 5 * m); g.fillStyle = C.ink; g.fillRect(x + (a + 2) * m, y + (b + 2) * m, 3 * m, 3 * m); }
}
// good = 0 → la factura mal hecha; 1 → la de Klimafacturas
function invoice(g, good) {
  g.save(); g.shadowColor = 'rgba(10,2,6,.6)'; g.shadowBlur = 60; g.shadowOffsetY = 30; g.fillStyle = '#fdfbf8'; g.fillRect(0, 0, PW, PH); g.restore();
  g.fillStyle = 'rgba(58,20,32,.02)'; for (let y = 0; y < PH; y += 4) g.fillRect(0, y, PW, 1);
  const ink = C.ink, mut = C.txt3, line = (y) => { g.fillStyle = 'rgba(58,20,32,.15)'; g.fillRect(50, y, PW - 100, 2); };
  const blank = (x, y, w) => { g.save(); g.setLineDash([8, 7]); g.strokeStyle = 'rgba(58,20,32,.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y); g.stroke(); g.restore(); };
  if (good) { g.fillStyle = C.rose; g.fillRect(0, 0, 12, PH); }
  text(g, 'Frutas Lola', 60, 100, 46, ink, { w: 700, ls: -1 });
  text(g, 'Lola Pérez Santana · NIF 12345678Z', 60, 145, 24, mut, { w: 500 });
  text(g, 'C/ La Marina 12 · Santa Cruz de Tenerife', 60, 178, 24, mut, { w: 500 });
  text(g, 'FACTURA', 845, 100, 60, ink, { w: 700, align: 'right', ls: 2 });
  text(g, 'Nº', 610, 168, 26, mut, { w: 600 }); text(g, 'Fecha', 610, 222, 26, mut, { w: 600 });
  if (good) { text(g, 'FAC-2026/0142', 845, 168, 28, ink, { w: 600, fam: 'PlexMono', align: 'right' }); text(g, '20/10/2026', 845, 222, 28, ink, { w: 600, fam: 'PlexMono', align: 'right' }); }
  else { blank(660, 172, 185); blank(700, 226, 145); }
  line(262);
  text(g, 'CLIENTE', 60, 300, 22, mut, { w: 700, fam: 'PlexMono', ls: 3 });
  text(g, 'Bar El Puerto', 60, 336, 32, ink, { w: 700 });
  text(g, 'NIF:', 60, 372, 26, mut, { w: 600 }); text(g, 'Domicilio:', 60, 414, 26, mut, { w: 600 });
  if (good) { text(g, 'B38765432', 120, 372, 26, ink, { w: 600, fam: 'PlexMono' }); text(g, 'Av. Marítima 5 · Los Cristianos', 190, 414, 26, ink, { w: 500 }); }
  else { blank(120, 376, 200); blank(190, 418, 300); }
  line(462);
  const cols = [[60, 'Concepto', 'left'], [560, 'Cant.', 'right'], [690, 'Precio', 'right'], [845, 'Importe', 'right']];
  cols.forEach(([x, s, al]) => text(g, s, x, 510, 22, mut, { w: 700, fam: 'PlexMono', align: al }));
  [['Plátano de Canarias (caja)', '4', '15,00', '60,00'], ['Aguacate (caja)', '2', '20,00', '40,00']].forEach((r, i) => {
    const y = 566 + i * 56; r.forEach((s, j) => text(g, s, cols[j][0], y, 28, ink, { w: j ? 600 : 500, fam: j ? 'PlexMono' : 'Plex', align: cols[j][2] }));
  });
  line(660);
  text(g, 'Base imponible', 520, 750, 26, mut, { w: 600 }); text(g, '100,00', 845, 750, 28, ink, { w: 600, fam: 'PlexMono', align: 'right' });
  text(g, good ? 'IGIC 7 %' : 'IVA 21 %', 520, 818, 26, mut, { w: 600 }); text(g, good ? '7,00' : '21,00', 845, 818, 28, ink, { w: 600, fam: 'PlexMono', align: 'right' });
  g.fillStyle = 'rgba(58,20,32,.5)'; g.fillRect(520, 842, 325, 3);
  text(g, 'TOTAL', 520, 898, 34, ink, { w: 700 }); text(g, good ? '107,00 €' : '112,00 €', 845, 898, 42, ink, { w: 700, fam: 'PlexMono', align: 'right' });
  if (good) {
    qr(g, 60, 985, 230);
    text(g, 'VERI*FACTU', 310, 1020, 30, ink, { w: 700, fam: 'PlexMono', ls: 2 });
    text(g, 'Factura verificable en la sede', 310, 1062, 24, mut, { w: 500 }); text(g, 'electrónica de la AEAT', 310, 1094, 24, mut, { w: 500 });
    text(g, 'Huella SHA-256 encadenada', 310, 1140, 22, C.rose, { w: 600, fam: 'PlexMono' });
  } else {
    g.save(); g.setLineDash([10, 8]); g.strokeStyle = 'rgba(58,20,32,.3)'; g.lineWidth = 3; g.strokeRect(60, 985, 230, 230); g.restore();
    text(g, 'Gracias por su compra', 330, 1100, 26, mut, { w: 500, it: false });
  }
  text(g, good ? 'Emitida con Klimafacturas' : 'Plantilla_factura_final_v3.docx', 450, 1238, 20, 'rgba(58,20,32,.4)', { w: 500, fam: 'PlexMono', align: 'center' });
}
const PAPER = { bad: mk(), good: mk() };
for (const [k, gd] of [['bad', 0], ['good', 1]]) { const c = PAPER[k]; c.width = PW * 2; c.height = PH * 2; const q = c.getContext('2d'); q.scale(2, 2); invoice(q, gd); }

// ——— la cámara: encuadres y claves (una sola toma) ———
const OV = { x: 450, y: 440, z: .95, r: 0 };
const pose = k => ({ x: ERR[k][0], y: ERR[k][1] - 150 / (k === 6 ? 1.75 : 2.15), z: k === 6 ? 1.75 : 2.15, r: (k % 2 ? .02 : -.02) });
const CAM = [[0, { ...OV, z: .9 }, 'lin'], [T.go, OV, 'expoInOut']];
for (let k = 0; k < 7; k++) CAM.push([rev(k) + .5, pose(k), 'lin'], [rev(k + 1) - .02, { ...pose(k), z: pose(k).z * 1.04 }, 'expoInOut']);
CAM.length -= 1; CAM.push([T.pull[0], { ...pose(6), z: pose(6).z * 1.04 }, 'expoInOut'], [T.pull[1], { ...OV, z: .82, y: 560 }, 'hold'], [T.fix, { ...OV, z: .82, y: 560 }, 'lin'],
  [T.end, { ...OV, z: .86, y: 560 }, 'expoInOut'], [T.end + .7, { ...OV, z: .5, y: 900 }, 'hold'], [DUR, { ...OV, z: .5, y: 900 }, 'hold']);
function camBase(t) {
  let i = 0; while (i < CAM.length - 1 && t >= CAM[i + 1][0]) i++;
  const a = CAM[i], b = CAM[Math.min(i + 1, CAM.length - 1)], u = b === a ? 0 : clamp((t - a[0]) / (b[0] - a[0])), e = ease[a[2]](u);
  const z = Math.exp(lerp(Math.log(a[1].z), Math.log(b[1].z), e));
  return { x: lerp(a[1].x, b[1].x, e), y: lerp(a[1].y, b[1].y, e), z: z * (1 - .22 * Math.sin(Math.PI * e) * (a[2] === 'expoInOut' && Math.abs(a[1].x - b[1].x) > 200 ? 1 : 0)), r: lerp(a[1].r, b[1].r, e), hold: a[2] === 'hold' };
}
const BUZZ = ERR.map((_, k) => rev(k) + .62);
function camera(t) {
  const c = camBase(t), hand = c.hold || t > T.still ? 0 : 1;
  c.sx = (3 * Math.sin(t * 1.7) + 1.5 * Math.sin(t * 3.1 + 1.3)) * hand; c.sy = (2.6 * Math.sin(t * 1.4 + .5) + 1.3 * Math.sin(t * 3.7 + 2)) * hand;
  let kz = 1, sh = 0;
  for (const b of BUZZ) if (t > b && t < b + .5) { const u = t - b; sh += Math.exp(-u * 12) * Math.sin(u * 90) * 14; kz *= 1 + .03 * Math.exp(-u * 10); }
  for (const p of [T.fix, T.seal]) if (t > p && t < p + .6) kz *= 1 + .05 * Math.exp(-(t - p) * 9) * Math.cos((t - p) * 24);
  c.sx += sh; c.kz = kz; return c;
}
const matrix = c => new DOMMatrix().translate(W / 2 + c.sx, H / 2 + c.sy).rotate(c.r * 180 / Math.PI).scale(c.z * c.kz).translate(-c.x, -c.y);
const proj = (M, [x, y]) => { const p = M.transformPoint(new DOMPoint(x, y)); return [p.x, p.y]; };

// ——— el círculo de rotulador: dos pasadas a mano alzada que se dibujan, rojo y luego verde ———
function marker(g, k, t) {
  const [x, y, rx, ry] = ERR[k], t0 = rev(k) + .52; if (t < t0) return;
  const d = ease.cubicOut(seg(t, t0, t0 + .3)), gpass = T.scan[0] + (y / PH) * (T.scan[1] - T.scan[0]), gr = seg(t, gpass, gpass + .2);
  const col = gr > 0 ? `rgba(30,170,90,${.9})` : 'rgba(225,30,45,.92)';
  g.save(); g.lineCap = 'round'; g.strokeStyle = col;
  for (const p of [0, 1]) {
    g.lineWidth = p ? 4 : 9; g.beginPath(); const n = 60, end = d * (1.12 + p * .05);
    for (let i = 0; i <= n * end; i++) { const a = -2.2 + (i / n) * Math.PI * 2, w = 1 + .06 * Math.sin(a * 3 + k + p) ; const px = x + Math.cos(a) * rx * w, py = y + Math.sin(a) * ry * w * (1 + p * .06); i ? g.lineTo(px, py) : g.moveTo(px, py); }
    g.stroke();
  }
  if (gr > 0) { g.fillStyle = 'rgba(30,170,90,.95)'; g.beginPath(); g.arc(x + rx * .82, y - ry * .9, 26 * ease.backOut(gr), 0, Math.PI * 2); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 6; g.beginPath(); g.moveTo(x + rx * .82 - 11, y - ry * .9); g.lineTo(x + rx * .82 - 3, y - ry * .9 + 9); g.lineTo(x + rx * .82 + 12, y - ry * .9 - 9); g.stroke(); }
  g.restore();
}

// ——— el fondo: escritorio oscuro con la retícula y el brillo rosa ———
function backdrop(g, t, c) {
  const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#1b0910'); gr.addColorStop(.55, '#2a0f19'); gr.addColorStop(1, '#3a1420');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  glow(g, 540, 1000, 1000, t > T.scan[0] ? '60,190,120' : '176,42,92', .22);
  const z = Math.pow(c.z, .55), step = 96 * z, ox = W / 2 + c.sx - c.x * z, oy = H / 2 + c.sy - c.y * z;
  g.fillStyle = 'rgba(246,185,207,.07)';
  for (let y = ((oy % step) + step) % step; y < H; y += step) for (let x = ((ox % step) + step) % step; x < W; x += step) g.fillRect(x - 1.5, y - 1.5, 3, 3);
}

let TX = [];
const tx = (id, s, b) => TX.push({ id, text: s, x0: b[0], y0: b[1], x1: b[2], y1: b[3] });
function banner(g, l1, l2, a, y, col = C.paper, c2 = C.pink, s1 = 84, s2 = 60) {
  if (a <= 0) return; g.save(); g.globalAlpha = a;
  text(g, l1, 540, y, s1, col, { w: 700, align: 'center', ls: -s1 * .03 }); if (l2) text(g, l2, 540, y + s2 * 1.35, s2, c2, { w: 700, align: 'center', ls: -s2 * .02 });
  g.restore();
}

function drawFrame(g, t, rep) {
  const c = camera(t), M = matrix(c);
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; backdrop(g, t, c);
  g.setTransform(M);
  // la factura: mal hecha hasta que pasa el escáner; entonces se reimprime de arriba abajo
  const sc = seg(t, T.scan[0], T.scan[1]), sy = ease.sine(sc) * PH, gl = t >= T.fix && t < T.fix + .3;
  const paint = q => {
    q.drawImage(PAPER.bad, 0, 0, PW * 2, PH * 2, 0, 0, PW, PH);
    if (sc > 0) { q.save(); q.beginPath(); q.rect(-40, -40, PW + 80, sy + 40); q.clip(); q.drawImage(PAPER.good, 0, 0, PW * 2, PH * 2, 0, 0, PW, PH); q.restore(); }
  };
  if (gl) glitch(g, paint, [-60, -60, PW + 120, PH + 120], Math.sin(seg(t, T.fix, T.fix + .3) * Math.PI), Math.floor(t * FPS) * 3.1, Math.min(1.2, Math.hypot(M.a, M.b)));
  else paint(g);
  if (sc > 0 && sc < 1) { const gb = g.createLinearGradient(0, sy - 120, 0, sy + 4); gb.addColorStop(0, 'rgba(80,220,140,0)'); gb.addColorStop(1, 'rgba(80,220,140,.45)'); g.fillStyle = gb; g.fillRect(-40, sy - 120, PW + 80, 124); g.fillStyle = 'rgba(190,255,215,.95)'; g.fillRect(-60, sy, PW + 120, 6); }
  for (let k = 0; k < 7; k++) marker(g, k, t);
  if (t >= T.seal - .22 && t < T.end + .6) { const f = ease.expoIn(seg(t, T.seal - .2, T.seal)), s = t < T.seal ? lerp(2.6, 1, f) : 1 - kick(t, T.seal, 6, 9) * .1; seal(g, 700, 1110, 120, { rot: -.2, scale: s, alpha: clamp(seg(t, T.seal - .2, T.seal - .12)) * (1 - seg(t, T.end, T.end + .5)) }); shockwave(g, 700, 1110, t, T.seal, { r0: 120, r1: 700, dur: .55, lw: 14 }); }
  g.setTransform(1, 0, 0, 1, 0, 0);
  // rojo en los bordes en cada fallo; rebobinado al arreglarlo
  for (const b of BUZZ) if (t > b && t < b + .45) { const a = .5 * (1 - (t - b) / .45), v = g.createRadialGradient(W / 2, H / 2, H * .3, W / 2, H / 2, H * .75); v.addColorStop(0, 'rgba(220,20,40,0)'); v.addColorStop(1, `rgba(220,20,40,${a})`); g.fillStyle = v; g.fillRect(0, 0, W, H); }
  if (t >= T.fix && t < T.scan[0]) { const u = seg(t, T.fix, T.scan[0]); for (let i = 0; i < 8; i++) { const y = (hash(i * 7.7) * H + t * 2600 * (1 + hash(i))) % H; g.fillStyle = `rgba(246,185,207,${.12 * (1 - u)})`; g.fillRect(0, y, W, 6 + hash(i) * 20); } text(g, '◀◀', 80, 1600, 64, `rgba(251,246,242,${.85 * (1 - u)})`, { w: 700 }); }
  // velo arriba para los rótulos
  const vg = g.createLinearGradient(0, 0, 0, 640); vg.addColorStop(0, 'rgba(20,7,12,.92)'); vg.addColorStop(.7, 'rgba(20,7,12,.7)'); vg.addColorStop(1, 'rgba(20,7,12,0)'); g.fillStyle = vg; g.fillRect(0, 0, W, 640);
  // el reto: 3, 2, 1
  if (t < T.go + .4) {
    const a = 1 - seg(t, T.go + .42, T.go + .62);
    banner(g, 'Esta factura tiene', '7 errores', a, 230, C.paper, C.pink, 76, 116);
    banner(g, '¿Cuántos ves?', null, a, 470, C.paper, C.pink, 64);
    if (rep && t < T.go + .42) tx('hook', 'Esta factura tiene 7 errores ¿Cuántos ves?', [80, 150, 1000, 500]);
    const n = t < .5 ? 3 : 3 - Math.floor(t - .5), p = t < .5 ? 0 : (t - .5) % 1, show = Math.max(0, n);
    if (t < T.go) { g.save(); g.translate(540, 1500); const s = 1 + .25 * Math.exp(-p * 8); g.scale(s, s); g.fillStyle = 'rgba(176,42,92,.92)'; g.beginPath(); g.arc(0, 0, 120, 0, Math.PI * 2); g.fill(); g.strokeStyle = C.pink; g.lineWidth = 8; g.beginPath(); g.arc(0, 0, 132, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - p)); g.stroke(); text(g, String(show || 1), 0, 52, 150, C.paper, { w: 700, align: 'center' }); g.restore(); }
    else { const u = seg(t, T.go, T.go + .4); g.save(); g.globalAlpha = 1 - u; g.translate(540, 1500); g.scale(1 + u, 1 + u); text(g, '¡TIEMPO!', 0, 30, 110, C.pink, { w: 700, align: 'center' }); g.restore(); }
  }
  // cada fallo: su número, el título y por qué
  for (let k = 0; k < 7; k++) {
    const t0 = rev(k) + .62, t1 = k < 6 ? rev(k + 1) + .62 : T.fix + .3; if (t < t0 || t > t1 + .25) continue;
    const u = spring(t, t0, 2.6, .55), out = ease.cubicIn(seg(t, t1, t1 + .25)), a = clamp(u) * (1 - out);
    g.save(); g.globalAlpha = a; g.translate(540, 300 - out * 60); g.scale(lerp(.6, 1, clamp(u, 0, 1.1)), lerp(.6, 1, clamp(u, 0, 1.1)));
    const tl = `${k + 1}/7  ${ERR[k][4]}`, w = measure(g, tl, 700, 70, 'Plex', false, -2) + 90;
    g.fillStyle = 'rgba(205,25,45,.95)'; rr(g, -w / 2, -78, w, 112, 56); g.fill();
    text(g, tl, 0, 2, 70, '#fff', { w: 700, align: 'center', ls: -2 });
    const sw2 = measure(g, ERR[k][5], 600, 48) + 60; g.fillStyle = 'rgba(20,7,12,.88)'; rr(g, -sw2 / 2, 70, sw2, 76, 38); g.fill();
    text(g, ERR[k][5], 0, 124, 48, C.paper, { w: 600, align: 'center', ls: -1 });
    g.restore();
    if (rep && t > t0 + .12 && t < t1) tx(`e${k}`, ERR[k][4], [100, 210, 980, 340]);
  }
  // el arreglo: el titular verde, y el cierre
  const fa = clamp(seg(t, T.ok, T.ok + .3)) * (1 - seg(t, T.end, T.end + .3));
  banner(g, 'Con Klimafacturas,', 'ni uno.', fa, 230, C.paper, '#5fe39b', 76, 116);
  if (rep && t > T.ok + .25 && t < T.end) tx('fix', 'Con Klimafacturas, ni uno.', [100, 150, 980, 400]);
  if (t >= T.end) {
    const r = spring(t, T.end + .2, 2.2, .55), a = clamp(seg(t, T.end, T.end + .35));
    g.save(); g.globalAlpha = a; g.fillStyle = 'rgba(20,7,12,.55)'; g.fillRect(0, 0, W, H); g.restore();
    banner(g, '¿Cuántos habías visto?', 'Coméntalo ↓', a, 300, C.paper, C.pink, 80, 76);
    const L = 360 * clamp(r, 0, 1.15), lx = 540 - L / 2, ly = 900 - L / 2;
    if (L > 4) { g.save(); g.lineWidth = 60; g.strokeStyle = 'rgba(246,185,207,.14)'; rr(g, lx, ly, L, L, L * 18 / 64); g.stroke(); g.restore(); g.drawImage(LOGOSPR, lx, ly, L, L); spark(g, lx + 51.8 * L / 64, ly + 12.2 * L / 64, 6.1 * L / 64); }
    g.save(); g.globalAlpha = clamp(seg(t, T.end + .5, T.end + .9));
    text(g, 'Klimafacturas', 540, 1210, 96, C.paper, { w: 700, align: 'center', ls: -3.2 });
    text(g, 'Facturas con Verifactu e IGIC, sin fallos', 540, 1286, 38, C.pink2, { w: 600, align: 'center' });
    const bw = 600, bh = 104; g.fillStyle = C.rose; rr(g, 540 - bw / 2, 1340, bw, bh, bh / 2); g.fill(); text(g, 'klimafacturas.com', 540, 1408, 46, C.paper, { w: 700, align: 'center' });
    g.restore();
    if (rep && t > T.end + .45) tx('q', '¿Cuántos habías visto? Coméntalo', [80, 220, 1000, 420]);
    if (rep && t > T.end + .95) { tx('brand', 'Klimafacturas', [180, 1120, 900, 1220]); tx('tag', 'Facturas con Verifactu e IGIC, sin fallos', [100, 1250, 980, 1300]); tx('url', 'klimafacturas.com', [240, 1340, 840, 1444]); }
    if (t > T.end + .2 && t < T.end + .9) shockwave(g, 540, 900, t, T.end + .2, { r0: 100, r1: 900, dur: .7, lw: 14 });
  }
  // la chispa: el rotulador que marca cada fallo y vuelve al logo
  const target = () => {
    for (let k = 6; k >= 0; k--) if (t >= rev(k) + .3 && t < rev(k) + 1.1) { const u = seg(t, rev(k) + .52, rev(k) + .82), a = -2.2 + u * Math.PI * 2.2; return proj(M, [ERR[k][0] + Math.cos(a) * ERR[k][2], ERR[k][1] + Math.sin(a) * ERR[k][3]]); }
    if (t >= T.scan[0] && t < T.scan[1]) return proj(M, [PW + 20, ease.sine(seg(t, T.scan[0], T.scan[1])) * PH]);
    return null;
  };
  const sp = target(); if (sp) spark(g, sp[0], sp[1], 24);
  const v = g.createRadialGradient(W / 2, H / 2, H * .35, W / 2, H / 2, H * .78); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(8,2,5,.45)'); g.fillStyle = v; g.fillRect(0, 0, W, H);
  for (const [ft, a] of [[T.fix, .35], [T.seal, .2], [T.end + .2, .2]]) if (t >= ft && t < ft + .1) { g.fillStyle = `rgba(255,240,246,${a * (1 - (t - ft) / .1)})`; g.fillRect(0, 0, W, H); }
}

// ——— obturador real: media de varias muestras cuando la cámara se mueve ———
function samples(t) {
  const h = .5 / FPS / 2, Ma = matrix(camera(t - h)), Mb = matrix(camera(t + h)); let d = 0;
  for (const p of [[0, 0], [W, 0], [0, H], [W, H], [W / 2, H / 2]]) { const q = Ma.inverse().transformPoint(new DOMPoint(...p)), b = Mb.transformPoint(q); d = Math.max(d, Math.hypot(b.x - p[0], b.y - p[1])); }
  if (t > T.fix && t < T.scan[1]) d = Math.max(d, 40);
  return Math.min(11, 2 * Math.ceil(d / 16) + 1);
}
window.render = (t) => {
  t = clamp(t, 0, DUR - 1e-4); TX = []; const n = samples(t);
  if (n <= 1) { drawFrame(G, t, true); return; }
  for (let i = 0; i < n; i++) { const ts = t + (i / (n - 1) - .5) * (.5 / FPS); drawFrame(B, ts, i === (n - 1) / 2); A.setTransform(1, 0, 0, 1, 0, 0); A.globalAlpha = 1 / (i + 1); A.drawImage(SUB, 0, 0); }
  G.setTransform(1, 0, 0, 1, 0, 0); G.globalAlpha = 1; G.drawImage(ACC, 0, 0);
};
const EV = [{ t: 0, type: 'meta', bpm: 120, bar0: .5, dur: DUR }];
[.5, 1.5, 2.5].forEach((t, i) => EV.push({ t, type: 'count', n: 3 - i })); EV.push({ t: T.go, type: 'go' });
for (let k = 0; k < 7; k++) EV.push({ t: +(rev(k)).toFixed(3), type: 'whoosh' }, { t: +(rev(k) + .52).toFixed(3), type: 'marker' }, { t: +BUZZ[k].toFixed(3), type: 'buzz', k });
EV.push({ t: T.pull[0], type: 'whoosh' }, { t: T.fix, type: 'glitch' }, { t: T.scan[0], type: 'scan', t1: T.scan[1] });
for (let k = 0; k < 7; k++) EV.push({ t: +(T.scan[0] + (ERR[k][1] / PH) * (T.scan[1] - T.scan[0])).toFixed(3), type: 'ok', k });
EV.push({ t: T.seal, type: 'seal' }, { t: T.end + .2, type: 'logo' });
EV.sort((a, b) => a.t - b.t);
window.EV = EV; window.DUR = DUR; window.TEXTS = () => TX; window.READY = true;
