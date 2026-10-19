// Klimafacturas en el móvil, redibujado con sus tokens reales (globals.css): papel #FBF6F2, tinta #1A1216,
// vino #B02A5C, éxito #1E7A45, aviso #92660A, bordes rgba(26,18,22,.12); IBM Plex Sans y Fraunces para las cifras.
// Todo va ampliado (≈1,5×) para que se lea en un Reel: pocas cosas por pantalla y letra grande.
import { K, rr, sticker, ellipse, clamp, seg, eo, back, hash, lerp } from './kit.js';

export const A = {
  paper: '#FBF6F2', card: '#FFFFFF', ink: '#1A1216', ink2: '#4A3A40', ink3: '#6B5A60', line: 'rgba(26,18,22,.12)', line2: 'rgba(26,18,22,.07)',
  acc: '#B02A5C', acc6: '#9C2856', acc50: '#FDEEF2', ok: '#1E7A45', okBg: '#DCEEE3', warn: '#92660A', warnBg: '#F8ECD2', spark: '#C9407A',
};
export const SW = 580, SH = 1132;          // pantalla, en píxeles locales
const UI = 'IBM Plex Sans', SERIF = 'Fraunces';
const font = (w, s, fam = UI) => `${w} ${s}px "${fam}"`;

function t(g, s, x, y, size, col = A.ink, w = 500, align = 'left', fam = UI) {
  g.font = font(w, size, fam); g.fillStyle = col; g.textAlign = align; g.textBaseline = 'alphabetic'; g.fillText(s, x, y);
}
function card(g, x, y, w, h, fill = A.card, r = 26) { g.fillStyle = fill; rr(g, x, y, w, h, r); g.fill(); g.lineWidth = 2.5; g.strokeStyle = A.line; g.stroke(); }
function chip(g, s, x, y, kind = 'ok', size = 26, align = 'left') {
  const [bg, fg] = kind === 'ok' ? [A.okBg, A.ok] : kind === 'warn' ? [A.warnBg, A.warn] : kind === 'acc' ? [A.acc50, A.acc] : ['#EEE6E1', A.ink2];
  g.font = font(600, size); const w = g.measureText(s).width + size * 1.3, h = size * 1.7, x0 = align === 'right' ? x - w : x;
  g.fillStyle = bg; rr(g, x0, y - h / 2, w, h, h / 2); g.fill(); t(g, s, x0 + w / 2, y + size * .35, size, fg, 600, 'center'); return w;
}
export function logoTile(g, x, y, s, { spark = true } = {}) {   // la marca: cuadrado tinta, K papel, destello rosa
  g.save(); g.translate(x, y); g.scale(s / 64, s / 64);
  g.fillStyle = A.ink; rr(g, 0, 0, 64, 64, 18); g.fill();
  g.fillStyle = A.paper; g.beginPath(); g.moveTo(19, 16); g.lineTo(26, 16); g.lineTo(26, 29.6); g.lineTo(38.2, 16); g.lineTo(47.4, 16); g.lineTo(34.6, 30.2); g.lineTo(47.6, 48);
  g.lineTo(38.4, 48); g.lineTo(29.52, 35.83); g.lineTo(26, 39.74); g.lineTo(26, 48); g.lineTo(19, 48); g.closePath(); g.fill();
  if (spark) { g.fillStyle = A.spark; g.beginPath(); g.moveTo(51.8, 6.1); g.lineTo(53.18, 10.82); g.lineTo(57.9, 12.2); g.lineTo(53.18, 13.58); g.lineTo(51.8, 18.3); g.lineTo(50.42, 13.58); g.lineTo(45.7, 12.2); g.lineTo(50.42, 10.82); g.closePath(); g.fill(); }
  g.restore();
}
function header(g, title, sub) {
  t(g, '9:41', 40, 50, 24, A.ink, 600);
  g.fillStyle = A.ink; rr(g, SW - 92, 32, 44, 22, 6); g.fill(); g.fillRect(SW - 46, 38, 4, 10);
  rr(g, SW - 140, 34, 8, 18, 2); g.fill(); rr(g, SW - 128, 30, 8, 22, 2); g.fill(); rr(g, SW - 116, 26, 8, 26, 2); g.fill();
  logoTile(g, 36, 92, 58);
  t(g, title, 112, 136, 40, A.ink, 600);
  if (sub) t(g, sub, 112, 172, 24, A.ink3, 500);
}
function button(g, s, y, press = 0, done = false) {
  const k = 1 - .05 * Math.sin(Math.PI * clamp(press)), w = SW - 72, h = 104;
  g.save(); g.translate(SW / 2, y + h / 2); g.scale(k, k);
  g.fillStyle = done ? A.ok : press > .5 ? A.acc6 : A.acc; rr(g, -w / 2, -h / 2, w, h, 26); g.fill();
  t(g, s, 0, 14, 38, A.paper, 600, 'center'); g.restore();
}
function row(g, y, l, r, { size = 32, col = A.ink2, rcol = A.ink, rw = 600, rsize } = {}) {
  t(g, l, 60, y, size, col, 500); t(g, r, SW - 60, y, rsize || size, rcol, rw, 'right');
}
// QR determinista con los tres cuadros de posición
export function qr(g, x, y, s, seed = 7, n = 25) {
  const m = s / n; g.fillStyle = '#FFFFFF'; g.fillRect(x - m, y - m, s + 2 * m, s + 2 * m); g.fillStyle = A.ink;
  const finder = (cx, cy) => { g.fillRect(x + cx * m, y + cy * m, 7 * m, 7 * m); g.fillStyle = '#FFFFFF'; g.fillRect(x + (cx + 1) * m, y + (cy + 1) * m, 5 * m, 5 * m); g.fillStyle = A.ink; g.fillRect(x + (cx + 2) * m, y + (cy + 2) * m, 3 * m, 3 * m); };
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const inF = (i < 8 && j < 8) || (i > n - 9 && j < 8) || (i < 8 && j > n - 9); if (inF) continue;
    if (hash(i * 31.7 + j * 7.3 + seed) > .52) g.fillRect(x + i * m, y + j * m, m + .5, m + .5);
  }
  finder(0, 0); finder(n - 7, 0); finder(0, n - 7);
}
function check(g, x, y, r, col = A.ok) { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#FFFFFF'; g.lineWidth = r * .28; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(x - r * .45, y + r * .02); g.lineTo(x - r * .1, y + r * .38); g.lineTo(x + r * .5, y - r * .35); g.stroke(); }
// sello girado, entra grande y se clava
function stamp(g, s, x, y, k, col = A.acc, size = 40, rot = -.12) {
  if (k <= 0) return; const sc = lerp(2.2, 1, eo(clamp(k))); g.save(); g.translate(x, y); g.rotate(rot); g.scale(sc, sc); g.globalAlpha = clamp(k * 3);
  g.font = font(700, size); const w = g.measureText(s).width + size * 1.2, h = size * 1.8;
  g.lineWidth = 6; g.strokeStyle = col; rr(g, -w / 2, -h / 2, w, h, 14); g.stroke(); t(g, s, 0, size * .36, size, col, 700, 'center'); g.restore();
}

// ——— pantallas: cada una recibe u = segundos desde que empieza ———
export const SCREENS = {
  // R1: la factura ya rellena; el dedo pulsa «Emitir»
  nueva(g, u, { press = 0 } = {}) {
    header(g, 'Nueva factura', 'Serie FAC · 2026');
    card(g, 36, 210, SW - 72, 170); t(g, 'Cliente', 64, 262, 28, A.ink3, 500); t(g, 'Grupo Ribera SL', 64, 318, 42, A.ink, 600); t(g, 'NIF B12345674 · Madrid', 64, 356, 26, A.ink3, 500);
    card(g, 36, 400, SW - 72, 150); t(g, 'Concepto', 64, 452, 28, A.ink3, 500); t(g, 'Consultoría · marzo', 64, 506, 38, A.ink, 600);
    card(g, 36, 570, SW - 72, 330, A.paper);
    row(g, 640, 'Base', '1.000,00 €'); row(g, 700, 'IVA 21 %', '210,00 €');
    g.fillStyle = A.line; g.fillRect(60, 736, SW - 120, 2.5);
    t(g, 'Total', 60, 830, 36, A.ink, 600); t(g, '1.210,00 €', SW - 60, 840, 70, A.ink, 600, 'right', SERIF);
    button(g, 'Emitir factura', 950, press);
  },
  // R1: emitida, con su QR y Verifactu
  emitida(g, u) {
    header(g, 'FAC-2026-0042', 'Grupo Ribera SL');
    chip(g, 'Emitida', SW - 40, 128, 'ok', 26, 'right');
    card(g, 36, 210, SW - 72, 190); t(g, 'Total', 64, 268, 30, A.ink3, 500); t(g, '1.210,00 €', 64, 356, 78, A.ink, 600, 'left', SERIF);
    const kq = back(seg(u, .05, .35), 2), qs = 300;
    card(g, 36, 420, SW - 72, 470);
    g.save(); g.translate(SW / 2, 420 + 40 + qs / 2); g.scale(kq, kq); qr(g, -qs / 2, -qs / 2, qs); g.restore();
    t(g, 'Código QR · Verifactu', SW / 2, 840, 32, A.ink, 600, 'center');
    const k2 = seg(u, .55, .75); if (k2 > 0) { g.globalAlpha = k2; check(g, 90, 950, 26); t(g, 'Huella encadenada', 132, 961, 32, A.ok, 600); g.globalAlpha = 1; }
    const k3 = seg(u, .8, 1); if (k3 > 0) { g.globalAlpha = k3; check(g, 90, 1030, 26); t(g, 'Enviada por correo', 132, 1041, 32, A.ok, 600); g.globalAlpha = 1; }
    stamp(g, 'VERIFACTU ✓', SW / 2 + 128, 742, seg(u, 1.45, 1.65), A.acc, 38, -.16);
  },
  // R2: pendiente → aviso de pago → pagada
  cobro(g, u, { payAt = .5 } = {}) {
    header(g, 'FAC-2026-0042', 'Grupo Ribera SL');
    const paid = u >= payAt + .25;
    chip(g, paid ? 'Pagada' : 'Pendiente', SW - 40, 128, paid ? 'ok' : 'warn', 26, 'right');
    card(g, 36, 210, SW - 72, 190); t(g, 'Total', 64, 268, 30, A.ink3, 500); t(g, '1.210,00 €', 64, 356, 78, A.ink, 600, 'left', SERIF);
    card(g, 36, 420, SW - 72, 300); t(g, 'Enlace de pago', 64, 476, 30, A.ink3, 500);
    // dos métodos
    for (const [i, s] of [[0, 'Tarjeta'], [1, 'Bizum']]) {
      const x = 64 + i * 238; g.fillStyle = i === 1 && paid ? A.okBg : '#F4ECE7'; rr(g, x, 506, 214, 170, 22); g.fill();
      if (i === 0) { g.fillStyle = A.ink2; rr(g, x + 60, 540, 94, 62, 10); g.fill(); g.fillStyle = '#F4ECE7'; g.fillRect(x + 60, 556, 94, 12); }
      else { g.fillStyle = '#05C3DD'; g.beginPath(); g.arc(x + 107, 572, 34, 0, Math.PI * 2); g.fill(); t(g, 'B', x + 107, 586, 40, '#FFFFFF', 700, 'center'); }
      t(g, s, x + 107, 652, 32, A.ink, 600, 'center');
    }
    card(g, 36, 740, SW - 72, 150, paid ? A.okBg : A.card);
    t(g, 'Estado', 64, 792, 28, A.ink3, 500); t(g, paid ? 'Pagada · se marca sola' : 'Esperando el pago', 64, 850, 36, paid ? A.ok : A.ink, 600);
    // aviso que baja desde arriba
    const kn = eo(seg(u, payAt, payAt + .22)) * (1 - eo(seg(u, payAt + 2.6, payAt + 2.9)));
    if (kn > 0) {
      const y = lerp(-220, 26, kn);
      g.save(); g.fillStyle = 'rgba(26,18,22,.18)'; rr(g, 26, y + 8, SW - 52, 190, 34); g.fill();
      g.fillStyle = '#FFFFFF'; rr(g, 26, y, SW - 52, 190, 34); g.fill(); g.lineWidth = 2.5; g.strokeStyle = A.line; g.stroke();
      logoTile(g, 52, y + 30, 54); t(g, 'KLIMAFACTURAS · ahora', 124, y + 64, 24, A.ink3, 600);
      t(g, 'Grupo Ribera ha pagado', 52, y + 126, 36, A.ink, 600); t(g, '1.210,00 € con Bizum', 52, y + 170, 32, A.ok, 600);
      g.restore();
    }
  },
  // R3: cámara sobre el ticket; el obturador en `shotAt`
  camara(g, u, { shotAt = .5 } = {}) {
    g.fillStyle = '#1A1216'; g.fillRect(0, 0, SW, SH);
    t(g, 'Foto del ticket', SW / 2, 118, 32, '#FBF6F2', 600, 'center');
    g.save(); g.translate(SW / 2, 560); g.rotate(-.05);
    g.fillStyle = '#FFFFFF'; g.beginPath(); g.moveTo(-190, -330);
    for (let i = 0; i <= 19; i++) g.lineTo(-190 + i * 20, -330 + (i % 2 ? 12 : 0));
    g.lineTo(190, 330); for (let i = 19; i >= 0; i--) g.lineTo(-190 + i * 20, 330 - (i % 2 ? 12 : 0)); g.closePath(); g.fill();
    const mono = (s, y, size = 26, w = 600, al = 'center', x = 0) => t(g, s, x, y, size, '#2A2226', w, al, 'IBM Plex Sans');
    mono('PAPELERÍA SOL', -240, 36, 700); mono('C/ Mayor, 12 · Madrid', -200, 22, 500);
    mono('Folios A4 ×2', -120, 26, 500, 'left', -160); mono('12,00', -120, 26, 500, 'right', 160);
    mono('Tóner negro', -76, 26, 500, 'left', -160); mono('18,00', -76, 26, 500, 'right', 160);
    g.fillStyle = '#2A2226'; g.fillRect(-160, -40, 320, 3);
    mono('Base', 10, 26, 500, 'left', -160); mono('30,00', 10, 26, 500, 'right', 160);
    mono('IVA 21 %', 54, 26, 500, 'left', -160); mono('6,30', 54, 26, 500, 'right', 160);
    mono('TOTAL', 130, 40, 700, 'left', -160); mono('36,30 €', 130, 40, 700, 'right', 160);
    mono('14/03/2026  10:42', 210, 22, 500);
    g.restore();
    // corchetes de enfoque que se cierran
    const kb = 1 - eo(seg(u, 0, .45)), pad = 40 + 60 * kb; g.strokeStyle = '#FFFFFF'; g.lineWidth = 8; g.lineCap = 'round';
    const bx0 = SW / 2 - 200 - pad, bx1 = SW / 2 + 200 + pad, by0 = 220 - pad, by1 = 900 + pad, L = 60;
    for (const [x, y, dx, dy] of [[bx0, by0, 1, 1], [bx1, by0, -1, 1], [bx0, by1, 1, -1], [bx1, by1, -1, -1]]) { g.beginPath(); g.moveTo(x, y + dy * L); g.lineTo(x, y); g.lineTo(x + dx * L, y); g.stroke(); }
    // obturador
    const kp = 1 - .12 * Math.sin(Math.PI * seg(u, shotAt - .08, shotAt + .1));
    g.save(); g.translate(SW / 2, 1036); g.scale(kp, kp); g.beginPath(); g.arc(0, 0, 58, 0, Math.PI * 2); g.lineWidth = 8; g.strokeStyle = '#FFFFFF'; g.stroke(); g.beginPath(); g.arc(0, 0, 44, 0, Math.PI * 2); g.fillStyle = '#FFFFFF'; g.fill(); g.restore();
    const fl = Math.exp(-Math.max(0, u - shotAt) * 9) * (u >= shotAt ? 1 : 0); if (fl > .01) { g.fillStyle = `rgba(255,255,255,${.85 * fl})`; g.fillRect(0, 0, SW, SH); }
  },
  // R3: el gasto, relleno a partir de la foto
  gasto(g, u, { saveAt = 1.4 } = {}) {
    header(g, 'Nuevo gasto', 'Desde la foto del ticket');
    const f = [['Proveedor', 'Papelería Sol'], ['Base', '30,00 €'], ['IVA 21 %', '6,30 €'], ['Total', '36,30 €']];
    chip(g, '✦ Leído de la foto', 36, 236, 'acc', 28);
    f.forEach(([l, v], i) => {
      const y = 290 + i * 156, k = seg(u, .1 + i * .22, .3 + i * .22);
      card(g, 36, y, SW - 72, 136, k > 0 && k < 1 ? A.acc50 : A.card);
      t(g, l, 64, y + 50, 28, A.ink3, 500);
      if (k > 0) { g.save(); g.globalAlpha = k; t(g, v, 64, y + 110, i === 3 ? 50 : 42, A.ink, 600, 'left', i === 3 ? SERIF : UI); g.restore(); }
      else { g.fillStyle = '#EEE6E1'; rr(g, 64, y + 74, 260, 36, 10); g.fill(); }
    });
    const done = u >= saveAt; button(g, done ? 'Gasto guardado ✓' : 'Guardar gasto', 950, seg(u, saveAt - .15, saveAt + .1), done);
  },
  // R4: la ficha «Para Hacienda este trimestre» del Panel
  hacienda(g, u) {
    header(g, 'Panel', 'Lunes, 8 de abril');
    card(g, 36, 210, SW - 72, 880);
    t(g, 'Para Hacienda', 64, 278, 44, A.ink, 600); t(g, 'este trimestre', 64, 328, 44, A.ink, 600);
    t(g, '1.er trimestre · hasta el 20 de abril', 64, 380, 26, A.ink3, 500);
    chip(g, 'Quedan 12 días', 64, 432, 'warn', 26);
    const rows = [['IVA · modelo 303', 'A pagar', '1.260,00 €'], ['IRPF · modelo 130', 'A pagar', '580,00 €']];
    rows.forEach(([a, b, v], i) => {
      const y = 500 + i * 150, k = seg(u, .15 + i * .25, .35 + i * .25); g.save(); g.globalAlpha = clamp(k * 1.5);
      g.fillStyle = A.line2; g.fillRect(64, y, SW - 128, 2.5);
      t(g, a, 64, y + 58, 34, A.ink, 600); t(g, b, 64, y + 110, 28, A.ink3, 500); t(g, v, SW - 64, y + 112, 42, A.ink, 600, 'right');
      g.restore();
    });
    const k = seg(u, .7, .95), kk = back(seg(u, .7, .95), 2);
    if (k > 0) {
      g.save(); g.translate(SW / 2, 960); g.scale(kk, kk); g.fillStyle = A.acc50; rr(g, -(SW - 120) / 2, -120, SW - 120, 220, 26); g.fill(); g.lineWidth = 4; g.strokeStyle = A.acc; g.stroke();
      t(g, 'Apártalo ya', -(SW - 120) / 2 + 30, -60, 34, A.acc, 600); t(g, 'No es tuyo aunque esté en tu cuenta', -(SW - 120) / 2 + 30, -18, 23, A.ink2, 500);
      t(g, '1.840,00 €', (SW - 120) / 2 - 30, 70, 74, A.acc, 600, 'right', SERIF); g.restore();
    }
  },
  // R5: libro diario cuadrado + la gestoría dentro
  diario(g, u, { stampAt = .9, gestAt = 1.4 } = {}) {
    header(g, 'Contabilidad', 'Libro diario · PGC');
    const E = [
      ['Nº 14 · Factura FAC-0042', [['430 Clientes', '1.210,00', ''], ['705 Servicios', '', '1.000,00'], ['477 IVA 21 %', '', '210,00']]],
      ['Nº 15 · Cobro Bizum', [['572 Bancos', '1.210,00', ''], ['430 Clientes', '', '1.210,00']]],
    ];
    let y = 214;
    E.forEach(([h, ls], i) => {
      const k = seg(u, .05 + i * .25, .3 + i * .25), hh = 70 + ls.length * 62;
      g.save(); g.globalAlpha = clamp(k * 1.4); card(g, 36, y, SW - 72, hh);
      t(g, h, 60, y + 48, 28, A.ink3, 600);
      ls.forEach(([c, d, hb], j) => { const yy = y + 104 + j * 62; t(g, c, 60, yy, 30, A.ink, 500); if (d) t(g, d, SW - 200, yy, 30, A.ink, 600, 'right'); if (hb) t(g, hb, SW - 56, yy, 30, A.ink, 600, 'right'); });
      g.restore(); y += hh + 18;
    });
    t(g, 'Debe', SW - 200, 196, 22, A.ink3, 600, 'right'); t(g, 'Haber', SW - 56, 196, 22, A.ink3, 600, 'right');
    const ks = back(seg(u, stampAt, stampAt + .2), 2.4);
    if (ks > 0) { g.save(); g.translate(SW / 2, 820); g.scale(ks, ks); g.fillStyle = A.okBg; rr(g, -250, -56, 500, 112, 56); g.fill(); check(g, -190, 0, 30); t(g, 'Debe = Haber', 30, 14, 40, A.ok, 700, 'center'); g.restore(); }
    const kg = eo(seg(u, gestAt, gestAt + .25));
    if (kg > 0) {
      g.save(); g.translate(0, (1 - kg) * 80); g.globalAlpha = kg; card(g, 36, 900, SW - 72, 170, A.card);
      g.fillStyle = A.ink; rr(g, 64, 940, 80, 80, 18); g.fill(); g.fillStyle = A.paper; rr(g, 82, 966, 44, 34, 6); g.fill(); g.fillStyle = A.ink; g.fillRect(96, 958, 16, 10);
      t(g, 'Gestoría García', 166, 974, 34, A.ink, 600); t(g, 'Ya lo ve todo · solo lectura', 166, 1018, 26, A.ok, 600); g.restore();
    }
  },
};

// el aparato: cuerpo de tinta con sombra dura, pantalla con esquinas y la isla
export function phone(g, x, y, s, screen, u, opts = {}, { tilt = 0 } = {}) {
  const PW = SW + 46, PH = SH + 46;
  g.save(); g.translate(x, y); g.rotate(tilt); g.scale(s, s);
  g.fillStyle = K.ol; rr(g, -PW / 2 + 16, -PH / 2 + 16, PW, PH, 86); g.fill();
  g.fillStyle = '#2A2A2E'; rr(g, -PW / 2, -PH / 2, PW, PH, 86); g.fill(); g.lineWidth = 8 / s; g.strokeStyle = K.ol; g.stroke();
  g.save(); g.translate(-SW / 2, -SH / 2); rr(g, 0, 0, SW, SH, 62); g.clip();
  g.fillStyle = A.paper; g.fillRect(0, 0, SW, SH);
  SCREENS[screen](g, u, opts);
  g.fillStyle = '#0D0D10'; rr(g, SW / 2 - 78, 18, 156, 44, 22); g.fill();
  g.restore(); g.restore();
}
