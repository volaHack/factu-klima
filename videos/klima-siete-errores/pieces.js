// Los golpes propios de cada capítulo: el tampón de «PAGADA», el lacre de la web, las hojas que se traga el buzón, el
// «Debe = Haber» que encaja y el escáner del TPV. Todo dibujado aquí; main.js decide cuándo y dónde.
import { C } from './world.js';
import { text, setFont, measure, rr, clamp, lerp, ease, seg, hash, kick } from './lib.js';

const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.ceil(w); c.height = Math.ceil(h); return c; };

// tampón de goma: doble marco y letras con la tinta un poco gastada (motas sin tinta, siempre las mismas)
export const STAMP = (() => {
  const w = 640, h = 210, c = mk(w, h), q = c.getContext('2d'), col = '#fff6f8';
  q.strokeStyle = col; q.lineWidth = 12; rr(q, 8, 8, w - 16, h - 16, 26); q.stroke();
  q.lineWidth = 4; rr(q, 26, 26, w - 52, h - 52, 16); q.stroke();
  text(q, 'PAGADA', w / 2, h / 2 + 42, 118, col, { w: 700, fam: 'PlexMono', align: 'center', ls: 10 });
  q.globalCompositeOperation = 'destination-out';
  for (let k = 0; k < 900; k++) { const x = hash(k * 1.7) * w, y = hash(k * 3.1 + 2) * h, r = .6 + hash(k * 5.3) ** 3 * 4.2; q.globalAlpha = .35 + hash(k * 7.9) * .65; q.beginPath(); q.arc(x, y, r, 0, Math.PI * 2); q.fill(); }
  for (let k = 0; k < 14; k++) { const y = hash(k * 11.3) * h; q.globalAlpha = .25; q.fillRect(0, y, w, 1 + hash(k) * 2); }
  return c;
})();
export function stamp(g, x, y, rot, t, t0, tOut) {
  if (t < t0 - .2 || t > tOut + .35) return;
  const fall = ease.expoIn(seg(t, t0 - .18, t0)), sq = kick(t, t0, 6, 9) * .09;
  const s = t < t0 ? lerp(2.4, 1, fall) : 1 - sq, a = clamp(seg(t, t0 - .18, t0 - .1)) * (1 - ease.cubic(seg(t, tOut, tOut + .35)));
  g.save(); g.translate(x, y); g.rotate(rot + (t < t0 ? (1 - fall) * -.3 : 0)); g.scale(s, s); g.globalAlpha *= a * .94;
  g.drawImage(STAMP, -STAMP.width / 2, -STAMP.height / 2); g.restore();
}

// el sello de lacre de la web: disco vino, anillo de puntos, texto en curva y el escudo con la marca
const RING = 'REGISTRO SELLADO · SHA-256 · CADENA ÍNTEGRA · ';
export function seal(g, cx, cy, r, { rot = 0, alpha = 1, scale = 1 } = {}) {
  if (alpha <= 0) return;
  g.save(); g.translate(cx, cy); g.scale(scale, scale); g.globalAlpha *= alpha;
  g.fillStyle = 'rgba(58,20,32,.95)'; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
  g.lineWidth = r * .028; g.strokeStyle = 'rgba(246,185,207,.5)'; g.stroke();
  g.setLineDash([r * .035, r * .07]); g.lineWidth = r * .018; g.strokeStyle = 'rgba(246,185,207,.34)';
  g.beginPath(); g.arc(0, 0, r * .8, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
  const size = r * .135; setFont(g, 600, size, 'PlexMono'); g.fillStyle = C.pink; g.textAlign = 'center'; g.textBaseline = 'middle';
  const chars = [...RING], ws = chars.map(ch => g.measureText(ch).width), tot = ws.reduce((a, b) => a + b, 0), R = r * .9, k = (2 * Math.PI * R) / tot;
  let a = rot - Math.PI / 2;
  chars.forEach((ch, i) => { const da = ws[i] * k / R; g.save(); g.rotate(a + da / 2); g.translate(0, -R); g.fillText(ch, 0, 0); g.restore(); a += da; });
  const s = r / 58 * 1.18; g.save(); g.scale(s, s); g.translate(-60, -60);
  g.strokeStyle = C.pink; g.lineJoin = 'round'; g.lineCap = 'round'; g.lineWidth = 2.4;
  g.stroke(new Path2D('M60 40 L76 46 v12 c0 10-7 18-16 22-9-4-16-12-16-22V46z')); g.lineWidth = 2.8; g.stroke(new Path2D('M53 59 l5 5 10-11'));
  g.restore();
  g.restore();
}

// una hoja (factura de proveedor o ticket) que vuela: papel con renglones y una cabecera de color
export function sheet(g, x, y, rot, s, kind, a = 1) {
  if (a <= 0 || s <= 0) return;
  const w = 170, h = kind === 'ticket' ? 250 : 220;
  g.save(); g.translate(x, y); g.rotate(rot); g.scale(s, s); g.globalAlpha *= a;
  g.fillStyle = 'rgba(14,4,8,.3)'; rr(g, -w / 2 + 8, -h / 2 + 14, w, h, 10); g.fill();
  g.fillStyle = kind === 'ticket' ? C.papel : '#ffffff'; rr(g, -w / 2, -h / 2, w, h, kind === 'ticket' ? 4 : 10); g.fill();
  g.fillStyle = kind === 'pdf' ? '#d9473f' : kind === 'xls' ? '#2f8a57' : C.rose; g.fillRect(-w / 2 + 16, -h / 2 + 18, 46, 14);
  g.fillStyle = 'rgba(58,20,32,.22)';
  for (let k = 0; k < 6; k++) g.fillRect(-w / 2 + 16, -h / 2 + 52 + k * 24, (w - 32) * (k % 3 === 2 ? .55 : .9), 7);
  g.fillStyle = 'rgba(58,20,32,.5)'; g.fillRect(w / 2 - 70, h / 2 - 34, 54, 10);
  g.restore();
}

// una pastilla con texto (para «Debe» y «Haber»)
export function tag(g, x, y, label, amount, col, a = 1) {
  if (a <= 0) return;
  const s1 = 30, s2 = 50, w = Math.max(measure(g, label, 600, s1, 'PlexMono'), measure(g, amount, 700, s2, 'PlexMono')) + 64, h = 130;
  g.save(); g.globalAlpha *= a; g.translate(x, y);
  g.fillStyle = 'rgba(14,4,8,.4)'; rr(g, -w / 2 + 6, -h / 2 + 14, w, h, 24); g.fill();
  g.fillStyle = C.paper; rr(g, -w / 2, -h / 2, w, h, 24); g.fill();
  g.fillStyle = col; g.fillRect(-w / 2, -h / 2 + 18, 8, h - 36);
  text(g, label, -w / 2 + 32, -h / 2 + 44, s1, C.txt3, { w: 600, fam: 'PlexMono', ls: 2 });
  text(g, amount, -w / 2 + 32, -h / 2 + 104, s2, C.ink, { w: 700, fam: 'PlexMono' });
  g.restore();
  return w;
}
