// El papel: cada factura de la cadena es un registro de la cinta de la web (papel térmico, raíl rosa en el margen,
// número en rosa, total en mono, la huella anterior y la propia), el cabezal que la imprime y el sello de lacre.
// Coordenadas locales del registro: (0, 0) arriba a la izquierda, REC.w × REC.h.
import { C, REC, recTop, recX } from './world.js';
import { text, setFont, measure, rr, fmt, corta, hash, clamp, lerp, ease } from './lib.js';

const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

// papel térmico: degradado cálido, trama fina de impresora y la curvatura del rollo en los bordes
export const PAPER = mk(REC.w, REC.h);
{
  const q = PAPER.getContext('2d'), gr = q.createLinearGradient(0, 0, REC.w, REC.h * .21);
  gr.addColorStop(0, '#fdf8f3'); gr.addColorStop(.48, C.papel); gr.addColorStop(1, '#efe1d5');
  q.fillStyle = gr; q.fillRect(0, 0, REC.w, REC.h);
  q.fillStyle = 'rgba(58,20,32,.03)'; for (let y = 0; y < REC.h; y += 3) q.fillRect(0, y, REC.w, 1);
  const cv = q.createLinearGradient(0, 0, REC.w, 0);
  cv.addColorStop(0, 'rgba(58,20,32,.13)'); cv.addColorStop(.13, 'rgba(58,20,32,0)'); cv.addColorStop(.85, 'rgba(58,20,32,0)'); cv.addColorStop(1, 'rgba(58,20,32,.15)');
  q.fillStyle = cv; q.fillRect(0, 0, REC.w, REC.h);
}
// sombra blanda del papel (se pinta una vez)
export function shadowSprite(w, h, blur = 46, alpha = .78) {
  const m = blur * 2, c = mk(w + 2 * m, h + 2 * m), q = c.getContext('2d');
  q.shadowColor = `rgba(14,4,8,${alpha})`; q.shadowBlur = blur; q.shadowOffsetY = 0; q.fillStyle = '#000';
  q.fillRect(m, m, w, h); q.globalCompositeOperation = 'destination-out'; q.shadowColor = 'transparent'; q.fillRect(m, m, w, h);
  return { c, m, w, h };
}
export const PSHADOW = shadowSprite(REC.w, REC.h);
export function dropShadow(g, S, x, y, w, h, dy = 26, k = 1) {   // la sombra de un rectángulo w×h en (x, y)
  const sx = w / S.w, sy = h / S.h;
  g.save(); g.globalAlpha *= k; g.drawImage(S.c, x - S.m * sx, y + dy - S.m * sy, S.c.width * sx, S.c.height * sy); g.restore();
}

// posiciones dentro del registro
export const L = { num: 66, client: 124, total: 222, dash: 262, ant: 312, hl: 362, hash: 410, hstep: 42, adv: 18, pill: 596, foot: 724, x: 62, rail: 34, node: 58 };
export const hashCharLocal = j => [L.x + (j % 16) * L.adv + L.adv / 2, L.hash + Math.floor(j / 16) * L.hstep - 11];
export const hashCharWorld = (i, j) => { const [x, y] = hashCharLocal(j); return [recX() + x, recTop(i) + y]; };

// el sello de lacre de la web: disco vino, anillo de puntos, texto en curva y el escudo con la marca
const RING = 'REGISTRO SELLADO · SHA-256 · CADENA ÍNTEGRA · ';
export function seal(g, cx, cy, r, { rot = 0, alpha = 1, crack = 0, scale = 1 } = {}) {
  if (alpha <= 0) return;
  g.save(); g.translate(cx, cy); g.scale(scale, scale); g.globalAlpha *= alpha;
  g.fillStyle = 'rgba(58,20,32,.94)'; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
  g.lineWidth = r * .028; g.strokeStyle = 'rgba(246,185,207,.5)'; g.stroke();
  g.setLineDash([r * .035, r * .07]); g.lineWidth = r * .018; g.strokeStyle = 'rgba(246,185,207,.34)';
  g.beginPath(); g.arc(0, 0, r * .8, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
  // texto en curva: cada letra en su ángulo, repartidas para cerrar la vuelta
  const size = r * .135; setFont(g, 600, size, 'PlexMono'); g.fillStyle = C.pink; g.textAlign = 'center'; g.textBaseline = 'middle';
  const chars = [...RING], ws = chars.map(ch => g.measureText(ch).width), tot = ws.reduce((a, b) => a + b, 0), R = r * .9, k = (2 * Math.PI * R) / tot;
  let a = rot - Math.PI / 2;
  chars.forEach((ch, i) => { const da = ws[i] * k / R; g.save(); g.rotate(a + da / 2); g.translate(0, -R); g.fillText(ch, 0, 0); g.restore(); a += da; });
  // escudo y marca (dibujados en la caja de 120 del SVG de la web)
  const s = r / 58 * 1.18; g.save(); g.scale(s, s); g.translate(-60, -60);
  g.strokeStyle = C.pink; g.lineJoin = 'round'; g.lineCap = 'round'; g.lineWidth = 2.4;
  g.stroke(new Path2D('M60 40 L76 46 v12 c0 10-7 18-16 22-9-4-16-12-16-22V46z')); g.lineWidth = 2.8; g.stroke(new Path2D('M53 59 l5 5 10-11'));
  g.restore();
  if (crack > 0) cracks(g, 0, 0, r * 1.05, crack, 77, 'rgba(255,90,100,.95)', r * .03);
  g.restore();
}

// grietas que crecen desde un punto (deterministas): ramas que se abren, con un trazo claro encima del oscuro
export function cracks(g, x, y, R, p, seed, col = 'rgba(120,14,26,.92)', lw = 4) {
  if (p <= 0) return;
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  const branch = (x0, y0, a, len, depth, sd) => {
    const n = 7, pts = [[x0, y0]]; let px = x0, py = y0;
    for (let k = 1; k <= n; k++) { a += (hash(sd + k * 1.7) - .5) * .9; px += Math.cos(a) * len / n; py += Math.sin(a) * len / n; pts.push([px, py]); }
    const m = Math.max(1, Math.floor(pts.length * clamp(p * (1.25 - depth * .18))));
    for (const [c, w] of [[col, lw], ['rgba(255,236,236,.55)', lw * .35]]) {
      g.strokeStyle = c; g.lineWidth = w * (1 - depth * .25); g.beginPath(); pts.slice(0, m + 1).forEach(([qx, qy], k) => k ? g.lineTo(qx, qy) : g.moveTo(qx, qy)); g.stroke();
    }
    if (depth < 2) for (let k = 2; k < m; k += 3) branch(pts[k][0], pts[k][1], a + (hash(sd + k * 9.1) - .5) * 2.2, len * .45, depth + 1, sd * 1.3 + k);
  };
  for (let b = 0; b < 6; b++) branch(x, y, b / 6 * Math.PI * 2 + hash(seed + b) * .8, R * (.6 + hash(seed + b * 3) * .5), 0, seed + b * 11);
  g.restore();
}

// la pastilla de estado al pie del registro: «✓ CADENA ÍNTEGRA», «✕ NO CUADRA» o «✕ ALTERADA»; gira al cambiar
const PILLS = { ok: ['✓ CADENA ÍNTEGRA', C.ok, 'rgba(30,122,69,.13)'], bad: ['✕ NO CUADRA', C.bad, 'rgba(220,38,38,.12)'], alt: ['✕ ALTERADA', C.bad, 'rgba(220,38,38,.12)'] };
function pill(g, state, flip) {
  const [s, col, bg] = PILLS[state], w = measure(g, s, 600, 19, 'PlexMono', false, 2) + 40;
  g.save(); g.translate(L.x + w / 2, L.pill + 24); g.scale(1, Math.abs(Math.cos(flip * Math.PI)) || .001);
  g.fillStyle = bg; rr(g, -w / 2, -24, w, 48, 24); g.fill();
  text(g, s, 0, 7, 19, col, { w: 600, fam: 'PlexMono', align: 'center', ls: 2 });
  g.restore();
}

/**
 * Un registro de la cadena en su sitio del mundo.
 * o.rec: los datos (chain.json) · o.reveal: alto visible desde arriba (la cinta saliendo del cabezal) ·
 * o.hash: { chars, col(j), alpha(j) } para imprimir, barajar o esconder caracteres · o.total: { s, glyphs } ·
 * o.state, o.flip: estado de la pastilla · o.red: tinte de rotura · o.crack: grietas · o.sheen: brillo que barre
 */
export function record(g, i, o) {
  const x0 = recX(), y0 = recTop(i) + (o.dy || 0), r = o.rec;
  g.save(); g.translate(x0, y0);
  const vis = o.reveal ?? REC.h;
  if (vis < REC.h) { g.beginPath(); g.rect(-80, 0, REC.w + 260, vis + 140); g.clip(); g.translate(0, vis - REC.h); }
  dropShadow(g, PSHADOW, 0, 0, REC.w, REC.h, 26, o.shadow ?? 1);
  g.drawImage(PAPER, 0, 0);
  // raíl y eslabón
  const rg = g.createLinearGradient(0, 0, 0, REC.h); rg.addColorStop(0, o.railCol || 'rgba(176,42,92,.6)'); rg.addColorStop(1, o.railCol2 || 'rgba(176,42,92,.22)');
  g.fillStyle = rg; g.fillRect(L.rail - 1.5, 0, 3, REC.h);
  g.fillStyle = C.papel; g.beginPath(); g.arc(L.rail, L.node, 11, 0, Math.PI * 2); g.fill();
  g.lineWidth = 3; g.strokeStyle = o.nodeCol || C.rose; g.stroke(); g.fillStyle = o.nodeCol || C.rose; g.beginPath(); g.arc(L.rail, L.node, 5, 0, Math.PI * 2); g.fill();
  // cabecera, cliente y total
  text(g, r.num, L.x, L.num, 26, C.rose, { w: 700, fam: 'PlexMono', ls: .5 });
  text(g, `${r.fecha.slice(8)}/${r.fecha.slice(5, 7)} · ${r.hora}`, REC.w - 32, L.num, 22, C.muted, { w: 500, fam: 'PlexMono', align: 'right' });
  text(g, r.cliente, L.x, L.client, 38, C.ink, { w: 600, ls: -.6 });
  totalLine(g, o.total || { s: fmt(r.total) });
  g.strokeStyle = 'rgba(58,20,32,.26)'; g.lineWidth = 2; g.setLineDash([8, 8]); g.beginPath(); g.moveTo(L.x, L.dash); g.lineTo(REC.w - 32, L.dash); g.stroke(); g.setLineDash([]);
  text(g, 'ANT', L.x, L.ant, 17, C.muted, { w: 600, fam: 'PlexMono', ls: 2.4 });
  text(g, corta(r.anterior), L.x + 70, L.ant, 21, C.txt3, { w: 500, fam: 'PlexMono' });
  text(g, 'HUELLA', L.x, L.hl, 17, C.muted, { w: 600, fam: 'PlexMono', ls: 2.4 });
  hashBlock(g, o.hash || { chars: r.huella });
  if (o.state) pill(g, o.state, o.flip || 0);
  text(g, 'VERIFACTU · SHA-256', L.x, L.foot, 16, C.muted, { w: 500, fam: 'PlexMono', ls: 2.5 });
  if (o.red > 0) {
    g.save(); g.globalCompositeOperation = 'multiply'; g.fillStyle = `rgba(255,${lerp(255, 120, o.red)},${lerp(255, 128, o.red)},1)`; g.fillRect(0, 0, REC.w, REC.h); g.restore();
    // de lejos tiene que leerse: contorno rojo encendido y una ✕ grande en la esquina
    g.save(); g.strokeStyle = `rgba(255,77,87,${.85 * o.red})`; g.lineWidth = 10; g.strokeRect(-5, -5, REC.w + 10, REC.h + 10);
    g.strokeStyle = `rgba(255,77,87,${.25 * o.red})`; g.lineWidth = 40; g.strokeRect(-20, -20, REC.w + 40, REC.h + 40);
    const k = clamp(o.red / .6); g.translate(REC.w - 70, 92); g.scale(k, k);
    g.fillStyle = '#e5313d'; g.beginPath(); g.arc(0, 0, 54, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 12; g.lineCap = 'round'; g.beginPath(); g.moveTo(-20, -20); g.lineTo(20, 20); g.moveTo(20, -20); g.lineTo(-20, 20); g.stroke();
    g.restore();
  }
  if (o.crack > 0) cracks(g, L.x + 150, L.total - 30, 420, o.crack, 31 + i);
  if (o.sheen > 0 && o.sheen < 1) sheen(g, REC.w, REC.h, o.sheen);
  g.restore();
}

// el total: «1.210,00 €»; con glyphs se colocan las cifras una a una (para quitar el cero y recolocarlas)
export function totalLine(g, T) {
  setFont(g, 700, 86, 'PlexMono'); const adv = g.measureText('0').width;
  if (!T.glyphs) { text(g, T.s, L.x, L.total, 86, T.col || C.ink, { w: 700, fam: 'PlexMono' }); text(g, '€', L.x + adv * T.s.length + 14, L.total, 50, C.txt3, { w: 600, fam: 'PlexMono' }); return; }
  for (const gl of T.glyphs) { if (gl.a <= 0) continue; g.save(); g.globalAlpha *= gl.a; g.translate(L.x + gl.x * adv + adv / 2, L.total + (gl.y || 0)); g.rotate(gl.r || 0); g.scale(gl.s || 1, gl.s || 1); text(g, gl.ch, 0, 0, 86, gl.col || C.ink, { w: 700, fam: 'PlexMono', align: 'center' }); g.restore(); }
  if (T.euroX != null) text(g, '€', L.x + adv * T.euroX + 14, L.total, 50, C.txt3, { w: 600, fam: 'PlexMono' });
}

// la huella en cuatro líneas de 16; carácter a carácter cuando hay que imprimir, barajar o esconder alguno
export function hashBlock(g, Hs) {
  if (!Hs.col && !Hs.alpha) { for (let l = 0; l < 4; l++) text(g, Hs.chars.slice(l * 16, l * 16 + 16), L.x, L.hash + l * L.hstep, 30, Hs.color || C.rose, { w: 600, fam: 'PlexMono' }); return; }
  setFont(g, 600, 30, 'PlexMono'); g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  const a0 = g.globalAlpha;
  for (let j = 0; j < 64; j++) {
    const a = Hs.alpha ? Hs.alpha(j) : 1; if (a <= 0) continue;
    g.globalAlpha = a0 * a; g.fillStyle = Hs.col ? Hs.col(j) : C.rose;
    g.fillText(Hs.chars[j], L.x + (j % 16) * L.adv + L.adv / 2, L.hash + Math.floor(j / 16) * L.hstep);
  }
  g.globalAlpha = a0;
}

// brillo que barre una superficie en diagonal (u de 0 a 1)
export function sheen(g, w, h, u) {
  const x = lerp(-w * .6, w * 1.6, ease.cubic(u)), gr = g.createLinearGradient(x - 160, 0, x + 160, h * .35);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.5, 'rgba(255,255,255,.42)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.save(); g.globalCompositeOperation = 'soft-light'; g.fillStyle = gr; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'screen'; g.globalAlpha = .35; g.fillRect(0, 0, w, h); g.restore();
}

// el cabezal de la impresora, encima del registro más nuevo
export function printer(g, t, busy, alpha = 1) {
  if (alpha <= 0) return;
  const w = REC.w + 120, x = REC.x - w / 2, y = REC.top - 92;
  g.save(); g.globalAlpha *= alpha;
  const gr = g.createLinearGradient(0, y, 0, y + 92); gr.addColorStop(0, '#2c1e24'); gr.addColorStop(.55, C.ink); gr.addColorStop(1, '#0f0a0c');
  g.fillStyle = 'rgba(0,0,0,.45)'; rr(g, x + 6, y + 14, w, 92, 26); g.fill();
  g.fillStyle = gr; rr(g, x, y, w, 92, 26); g.fill();
  g.strokeStyle = 'rgba(246,185,207,.16)'; g.lineWidth = 2; rr(g, x + 1, y + 1, w - 2, 90, 25); g.stroke();
  g.fillStyle = '#05030a'; g.fillRect(REC.x - REC.w / 2 - 12, y + 80, REC.w + 24, 8);
  const on = busy ? .55 + .45 * Math.sin(t * 40) : .35;
  g.fillStyle = `rgba(201,64,122,${on})`; g.beginPath(); g.arc(x + w - 46, y + 40, 9, 0, Math.PI * 2); g.fill();
  if (busy) { const gl = g.createRadialGradient(x + w - 46, y + 40, 0, x + w - 46, y + 40, 46); gl.addColorStop(0, 'rgba(201,64,122,.5)'); gl.addColorStop(1, 'rgba(201,64,122,0)'); g.fillStyle = gl; g.fillRect(x + w - 92, y - 6, 92, 92); }
  text(g, 'klima', x + 44, y + 54, 26, 'rgba(251,246,242,.5)', { w: 600, ls: -.4 });
  g.restore();
}
