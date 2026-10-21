// Las tarjetas del brazo y la pierna de la K: lo que le pasa a la factura FAC-2026/0149 después de emitirla (se cobra,
// se asienta, se aparta lo de Hacienda) y dos más que solo se ven al final (TPV y sin conexión). Estilo de la app:
// papel #fbf6f2, radio grande, IBM Plex Sans y cifras en Plex Mono.
import { C, CARD } from './world.js';
import { text, setFont, measure, rr, fmt, clamp, lerp, ease, seg, spring } from './lib.js';
import { shadowSprite, dropShadow, sheen } from './paper.js';
import { T } from './timeline.js';

const SH = shadowSprite(680, 620, 50, .7);
export const cardOrigin = k => { const c = CARD[k]; return [c.c[0] - c.w / 2, c.c[1] - c.h / 2]; };

function base(g, k, { lift = 0 } = {}) {
  const c = CARD[k], [x, y] = cardOrigin(k);
  g.translate(x, y);
  dropShadow(g, SH, 0, 0, c.w, c.h, 30 + lift * 30, 1);
  g.fillStyle = C.paper; rr(g, 0, 0, c.w, c.h, 34); g.fill();
  g.strokeStyle = 'rgba(26,18,22,.12)'; g.lineWidth = 2; rr(g, 1, 1, c.w - 2, c.h - 2, 33); g.stroke();
  return c;
}
const label = (g, s, x, y, col = C.muted, size = 18, align = 'left') => text(g, s, x, y, size, col, { w: 600, fam: 'PlexMono', ls: 2.4, align });
function statusPill(g, xr, y, ok, flip) {   // «Pendiente» → «Pagada ✓», girando sobre su eje
  const s = ok ? 'Pagada ✓' : 'Pendiente', col = ok ? C.ok : C.warn, bg = ok ? C.okBg : C.warnBg, w = measure(g, s, 600, 24) + 44;
  g.save(); g.translate(xr - w / 2, y); g.scale(1, Math.max(.001, Math.abs(Math.cos(flip * Math.PI))));
  g.fillStyle = bg; rr(g, -w / 2, -24, w, 48, 24); g.fill(); text(g, s, 0, 8, 24, col, { w: 600, align: 'center' }); g.restore();
}
export function kTile(g, x, y, s) {   // el logo pequeño (la app en el aviso)
  g.save(); g.translate(x, y); g.scale(s / 64, s / 64);
  g.fillStyle = C.ink; rr(g, 0, 0, 64, 64, 18); g.fill();
  g.fillStyle = C.paper; g.fill(new Path2D('M19 16H26V29.6L38.2 16H47.4L34.6 30.2L47.6 48H38.4L29.52 35.83L26 39.74V48H19Z'));
  g.fillStyle = C.spark; g.fill(new Path2D('M51.80 6.10L53.18 10.82L57.90 12.20L53.18 13.58L51.80 18.30L50.42 13.58L45.70 12.20L50.42 10.82Z'));
  g.restore();
}

// cobro: la factura con su enlace de pago; la chispa toca «Pagar con Bizum», sube la hoja de Bizum, llega el aviso
export function cobro(g, t) {
  g.save(); const c = base(g, 'cobro');
  const paid = t >= T.paid + .1, flip = seg(t, T.paid - .05, T.paid + .15);
  label(g, 'FAC-2026/0149', 40, 66, C.rose, 22);
  statusPill(g, c.w - 40, 58, t >= T.paid + .05, flip);
  text(g, 'Grupo Ribera SL', 40, 130, 36, C.ink, { w: 600, ls: -.6 });
  text(g, '1.210,00 €', 40, 238, 100, C.ink, { w: 700, ls: -3 });
  text(g, 'IVA incluido · vence el 19/11', 40, 284, 24, C.txt3, { w: 500 });
  g.fillStyle = 'rgba(26,18,22,.08)'; g.fillRect(40, 318, c.w - 80, 2);
  label(g, 'ENLACE DE PAGO', 40, 368);
  g.fillStyle = C.blush; rr(g, 40, 388, c.w - 80, 64, 18); g.fill();
  text(g, 'klimafacturas.com/pagar/7da777a8', 64, 430, 23, C.txt2, { w: 500, fam: 'PlexMono' });
  // el botón: se hunde al tocarlo y suelta una onda
  const press = Math.exp(-Math.max(0, t - T.payTap) * 12) * (t >= T.payTap ? 1 : 0), bx = 40, by = 480, bw = c.w - 80, bh = 92;
  g.save(); g.translate(bx + bw / 2, by + bh / 2); g.scale(1 - .04 * press, 1 - .04 * press);
  g.fillStyle = paid ? C.ok : C.rose; rr(g, -bw / 2, -bh / 2, bw, bh, 46); g.fill();
  text(g, paid ? 'Pagada con Bizum' : 'Pagar con Bizum', 0, 11, 32, C.paper, { w: 600, align: 'center', ls: -.3 });
  if (t > T.payTap && t < T.payTap + .5) { const u = seg(t, T.payTap, T.payTap + .5); g.save(); rr(g, -bw / 2, -bh / 2, bw, bh, 46); g.clip(); g.fillStyle = `rgba(255,255,255,${.35 * (1 - u)})`; g.beginPath(); g.arc(-bw * .15, 0, 40 + 420 * ease.cubicOut(u), 0, Math.PI * 2); g.fill(); g.restore(); }
  g.restore();
  text(g, 'o con tarjeta', c.w / 2, 618, 24, C.muted, { w: 500, align: 'center' });
  if (t > T.paid + .05 && t < T.paid + .75) sheen(g, c.w, c.h, seg(t, T.paid + .05, T.paid + .75));
  // la hoja de Bizum, por encima de la mitad de abajo
  const up = ease.expoOut(seg(t, T.sheet[0], T.sheet[0] + .25)) * (1 - ease.expoIn(seg(t, T.sheet[1] - .12, T.sheet[1])));
  if (up > 0) {
    g.save(); rr(g, 0, 0, c.w, c.h, 34); g.clip();
    g.fillStyle = `rgba(26,18,22,${.32 * up})`; g.fillRect(0, 0, c.w, c.h);
    const sy = lerp(c.h + 10, c.h - 330, up);
    g.fillStyle = '#ffffff'; rr(g, 16, sy, c.w - 32, 360, 30); g.fill();
    g.fillStyle = '#e8dcd5'; rr(g, c.w / 2 - 40, sy + 14, 80, 8, 4); g.fill();
    g.fillStyle = '#0fa3b1'; g.beginPath(); g.arc(70, sy + 76, 28, 0, Math.PI * 2); g.fill();
    text(g, 'B', 70, sy + 88, 32, '#fff', { w: 700, align: 'center' });
    text(g, 'Bizum', 114, sy + 88, 34, C.ink, { w: 700 });
    text(g, '1.210,00 €', 40, sy + 176, 64, C.ink, { w: 700, ls: -2 });
    const ok = t >= T.confirm, pr = t >= T.confirm ? Math.exp(-(t - T.confirm) * 12) : 0;
    g.save(); g.translate(c.w / 2, sy + 262); g.scale(1 - .04 * pr, 1 - .04 * pr);
    g.fillStyle = ok ? C.ok : '#0fa3b1'; rr(g, -(c.w - 112) / 2, -40, c.w - 112, 80, 40); g.fill();
    if (!ok) text(g, 'Confirmar pago', 0, 10, 30, '#fff', { w: 600, align: 'center' });
    else { const p = ease.cubicOut(seg(t, T.confirm, T.confirm + .18)); g.strokeStyle = '#fff'; g.lineWidth = 8; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(-26, 0); g.lineTo(-26 + 18 * clamp(p * 2), 18 * clamp(p * 2)); if (p > .5) g.lineTo(-8 + 40 * (p - .5) * 2, 18 - 40 * (p - .5) * 2); g.stroke(); }
    g.restore();
    g.restore();
  }
  // el aviso de pago, que cae desde arriba sobre el borde de la tarjeta
  const nd = spring(t, T.notif, 2.6, .5);
  if (t >= T.notif) {
    const ny = lerp(-420, -158, nd), nw = c.w - 20;
    g.save(); g.translate(10, ny);
    g.fillStyle = 'rgba(14,4,8,.35)'; rr(g, 6, 14, nw, 110, 30); g.fill();
    g.fillStyle = '#ffffff'; rr(g, 0, 0, nw, 110, 30); g.fill();
    kTile(g, 22, 23, 64);
    text(g, 'Grupo Ribera ha pagado 1.210,00 €', 104, 50, 26, C.ink, { w: 600, ls: -.3 });
    text(g, 'Klimafacturas · con Bizum · ahora', 104, 86, 21, C.muted, { w: 500 });
    g.restore();
  }
  g.restore();
}

// contabilidad: el asiento se escribe solo y Debe = Haber encaja de golpe
const ROWS = [['430', 'Clientes', '1.210,00', ''], ['705', 'Prestación de servicios', '', '1.000,00'], ['477', 'H.P. IVA repercutido 21 %', '', '210,00']];
export function ledger(g, t, { ivaGone = 0 } = {}) {
  g.save(); const c = base(g, 'conta');
  label(g, 'LIBRO DIARIO', 40, 66);
  text(g, 'Asiento 152 · 19/10', c.w - 40, 66, 21, C.muted, { w: 500, fam: 'PlexMono', align: 'right' });
  text(g, 'FAC-2026/0149 · Grupo Ribera SL', 40, 128, 32, C.ink, { w: 600, ls: -.5 });
  const cD = c.w - 210, cH = c.w - 40;
  text(g, 'Cuenta', 40, 192, 21, C.muted, { w: 600 }); text(g, 'Debe', cD, 192, 21, C.muted, { w: 600, align: 'right' }); text(g, 'Haber', cH, 192, 21, C.muted, { w: 600, align: 'right' });
  g.fillStyle = 'rgba(26,18,22,.1)'; g.fillRect(40, 210, c.w - 80, 2);
  ROWS.forEach(([cta, nom, d, h], i) => {
    const t0 = T.ledger[0] + i * .1, u = ease.expoOut(seg(t, t0, t0 + .28)); if (u <= 0) return;
    const y = 266 + i * 64; g.save(); g.globalAlpha *= u; g.translate((1 - u) * 90, 0);
    text(g, cta, 40, y, 26, C.rose, { w: 600, fam: 'PlexMono' }); text(g, nom, 110, y, 25, C.txt2, { w: 500 });
    if (d) text(g, d, cD, y, 27, C.ink, { w: 600, fam: 'PlexMono', align: 'right' });
    if (h) { g.globalAlpha *= i === 2 ? 1 - .75 * ivaGone : 1; text(g, h, cH, y, 27, C.ink, { w: 600, fam: 'PlexMono', align: 'right' }); }
    g.restore();
  });
  // Debe = Haber: las dos barras crecen y se igualan de golpe
  const by = 452, maxw = c.w - 80, sd = spring(t, T.ledger[0] + .15, 2.2, .55), sh = spring(t, T.ledger[0] + .32, 2.2, .55);
  const snap = spring(t, T.balance, 4, .35), wD = maxw * clamp(sd) * lerp(1, 1, snap), wH = maxw * lerp(.82 * clamp(sh), 1, clamp(snap));
  for (const [lab, w, yy] of [['Debe', wD, by], ['Haber', wH, by + 58]]) {
    g.fillStyle = C.blush; rr(g, 40, yy, maxw, 24, 12); g.fill();
    if (w > 4) { const gr = g.createLinearGradient(40, 0, 40 + maxw, 0); gr.addColorStop(0, C.rose7); gr.addColorStop(1, C.rose); g.fillStyle = gr; rr(g, 40, yy, w, 24, 12); g.fill(); }
    text(g, lab, 40, yy - 10, 18, C.muted, { w: 600 });
  }
  if (t >= T.balance) {
    const k = clamp(spring(t, T.balance, 3, .45)), s = 'Debe = Haber · cuadrado ✓', w = measure(g, s, 600, 22, 'PlexMono') + 44;
    g.save(); g.translate(40 + w / 2, 566); g.scale(k, k); g.fillStyle = C.okBg; rr(g, -w / 2, -26, w, 52, 26); g.fill();
    text(g, s, 0, 8, 22, C.ok, { w: 600, fam: 'PlexMono', align: 'center' }); g.restore();
    if (t < T.balance + .7) sheen(g, c.w, c.h, seg(t, T.balance, T.balance + .7));
  }
  g.restore();
}

// Hacienda: el IVA de la factura cae en lo que hay que apartar; los contadores ruedan
export function hacienda(g, t, odometer) {
  g.save(); const c = base(g, 'hacienda');
  label(g, 'PARA HACIENDA · ESTE TRIMESTRE', 40, 66);
  const u = ease.cubic(seg(t, T.odo[0], T.odo[1]));
  odometer(g, 1630 + 210 * u, 40, 190, 96, C.ink, 700, 'Plex', -3, true);
  g.fillStyle = 'rgba(26,18,22,.08)'; g.fillRect(40, 236, c.w - 80, 2);
  text(g, 'IVA · modelo 303', 40, 300, 28, C.txt2, { w: 500 }); odometer(g, 1050 + 210 * u, c.w - 40, 300, 30, C.ink, 600, 'PlexMono', 0, false, 'right');
  text(g, 'IRPF · modelo 130', 40, 360, 28, C.txt2, { w: 500 }); text(g, '580,00 €', c.w - 40, 360, 30, C.ink, { w: 600, fam: 'PlexMono', align: 'right' });
  const fill = lerp(.886, 1, u), gr = g.createLinearGradient(40, 0, c.w - 40, 0); gr.addColorStop(0, C.rose7); gr.addColorStop(1, C.rose);
  g.fillStyle = C.blush; rr(g, 40, 412, c.w - 80, 26, 13); g.fill(); g.fillStyle = gr; rr(g, 40, 412, (c.w - 80) * fill, 26, 13); g.fill();
  if (t >= T.odo[1]) {
    const k = clamp(spring(t, T.odo[1], 3, .45)), s = '✓ Al día con cada factura', w = measure(g, s, 600, 24) + 44;
    g.save(); g.translate(40 + w / 2, 516); g.scale(k, k); g.fillStyle = C.okBg; rr(g, -w / 2, -28, w, 56, 28); g.fill();
    text(g, s, 0, 9, 24, C.ok, { w: 600, align: 'center' }); g.restore();
  }
  if (t > T.odo[1] && t < T.odo[1] + .7) sheen(g, c.w, c.h, seg(t, T.odo[1], T.odo[1] + .7));
  g.restore();
}

// las dos de la pierna: solo se ven de lejos, al final (TPV y sin conexión)
export function legCards(g, which) {
  let c;
  if (which === 'tpv') {
  g.save(); c = base(g, 'tpv');
  label(g, 'TPV · TICKET 0087', 36, 62);
  [['Café con leche', '1,80'], ['Tostada', '2,40'], ['Zumo natural', '3,20']].forEach(([a, b], i) => { text(g, a, 36, 130 + i * 52, 26, C.txt2, { w: 500 }); text(g, b, c.w - 36, 130 + i * 52, 26, C.ink, { w: 600, fam: 'PlexMono', align: 'right' }); });
  text(g, 'Total', 36, 330, 30, C.ink, { w: 600 }); text(g, '7,40 €', c.w - 36, 330, 44, C.ink, { w: 700, align: 'right' });
  for (let i = 0; i < 38; i++) { g.fillStyle = C.ink; g.fillRect(36 + i * 12.6, 380, (i * 7) % 3 + 2, 90); }
  g.restore();
  return;
  }
  g.save(); c = base(g, 'linea');
  label(g, 'SIN CONEXIÓN', 36, 62, C.warn);
  text(g, 'El cobro se guarda', 36, 140, 40, C.ink, { w: 600, ls: -.6 }); text(g, 'en el dispositivo', 36, 192, 40, C.ink, { w: 600, ls: -.6 });
  g.fillStyle = C.okBg; rr(g, 36, 260, 330, 56, 28); g.fill(); text(g, '✓ Sincronizado', 60, 298, 26, C.ok, { w: 600 });
  g.restore();
}
