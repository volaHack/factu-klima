// Efectos: onda de choque, brillo, contadores que ruedan, fichas de cartel que giran (split-flap), fallo de señal con
// separación de color y el rebobinado. Nada de partículas: lo que se mueve es la tipografía y el papel.
import { C, sparkPath } from './world.js';
import { text, setFont, measure, rr, clamp, lerp, ease, seg, hash } from './lib.js';

const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

export function shockwave(g, x, y, t, t0, { r0 = 30, r1 = 420, dur = .5, col = '246,185,207', lw = 10, a = .8 } = {}) {
  const u = seg(t, t0, t0 + dur); if (u <= 0 || u >= 1) return;
  const e = ease.expoOut(u);
  g.save(); g.strokeStyle = `rgba(${col},${a * (1 - u) ** 1.4})`; g.lineWidth = lw * (1 - u * .7);
  g.beginPath(); g.arc(x, y, lerp(r0, r1, e), 0, Math.PI * 2); g.stroke(); g.restore();
}
export function glow(g, x, y, r, col = '201,64,122', a = .5) {
  if (a <= 0) return;
  const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(.4, `rgba(${col},${a * .35})`); gr.addColorStop(1, `rgba(${col},0)`);
  g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); g.restore();
}

// contador mecánico: cada cifra es una tira vertical; la de los céntimos gira suave y las de arriba saltan al final
export function odometer(g, v, x, y, size, col, w = 700, fam = 'Plex', ls = 0, euro = true, align = 'left') {
  const s = v.toFixed(2), [ent] = s.split('.'), nInt = ent.length;
  setFont(g, w, size, fam, false, ls); const dw = g.measureText('0').width + ls, sep = g.measureText('.').width + ls;
  const slots = []; for (let k = nInt - 1; k >= -2; k--) { slots.push(k); if (k > 0 && k % 3 === 0) slots.push('.'); if (k === 0) slots.push(','); }
  const wid = slots.reduce((a, k) => a + (typeof k === 'number' ? dw : sep), 0) + (euro ? measure(g, ' €', w, size, fam) : 0);
  let cx = align === 'right' ? x - wid : x;
  g.save(); g.fillStyle = col; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  for (const k of slots) {
    if (typeof k !== 'number') { setFont(g, w, size, fam, false, ls); g.fillText(k, cx, y); cx += sep; continue; }
    const q = v / 10 ** k, low = (q * 10) % 10, pos = k === -2 ? q % 10 : Math.floor(q) % 10 + clamp(low - 9);
    const d0 = Math.floor(pos) % 10, fr = pos - Math.floor(pos);
    g.save(); g.beginPath(); g.rect(cx - 4, y - size * .86, dw + 8, size * 1.02); g.clip(); setFont(g, w, size, fam, false, ls);
    g.fillText(String(d0), cx, y - fr * size * .98); if (fr > .001) g.fillText(String((d0 + 1) % 10), cx, y + (1 - fr) * size * .98);
    g.restore(); cx += dw;
  }
  if (euro) { setFont(g, w, size, fam); g.fillText(' €', cx, y); }
  g.restore();
}

// ficha de cartel: medio carácter de arriba y medio de abajo; al girar, la solapa de arriba cae y enseña el nuevo
export function flapTile(g, cx, cy, s, a, b, p, { ink = C.ink, face = C.papel, edge = 'rgba(58,20,32,.18)', glowA = 0 } = {}) {
  const w = s * .82, h = s, r = s * .1, size = s * .7;
  const half = (ch, top, sq = 1) => {
    g.save(); g.beginPath(); g.rect(cx - w / 2 - 2, top ? cy - h / 2 - 2 : cy, w + 4, h / 2 + 2); g.clip();
    g.translate(cx, cy); g.scale(1, sq); g.fillStyle = face; rr(g, -w / 2, -h / 2, w, h, r); g.fill();
    text(g, ch, 0, size * .36, size, ink, { w: 600, fam: 'PlexMono', align: 'center' }); g.restore();
  };
  if (p <= 0 || p >= 1) { const ch = p >= 1 ? b : a; half(ch, true); half(ch, false); }
  else {
    half(b, true); half(a, false);                                   // detrás: el nuevo arriba y el viejo abajo
    if (p < .5) { const k = Math.cos(p * Math.PI); half(a, true, k); g.fillStyle = `rgba(26,18,22,${.25 * (1 - k)})`; g.fillRect(cx - w / 2, cy - h / 2 * k, w, h / 2 * k); }
    else { const k = -Math.cos(p * Math.PI); half(b, false, k); g.fillStyle = `rgba(26,18,22,${.25 * (1 - k)})`; g.fillRect(cx - w / 2, cy, w, h / 2 * k); }
  }
  g.fillStyle = edge; g.fillRect(cx - w / 2, cy - 1, w, 2);
  if (glowA > 0) { g.save(); g.globalAlpha = glowA; g.strokeStyle = C.pink; g.lineWidth = s * .05; rr(g, cx - w / 2, cy - h / 2, w, h, r); g.stroke(); g.restore(); }
}

// fallo de señal: lo dibujado en `draw` (dentro de [x, y, w, h] del mundo) se trocea en bandas desplazadas y se separan
// los canales rojo y cian
const GL = mk(1, 1), GR = mk(1, 1), GC = mk(1, 1);
export function glitch(g, draw, [x, y, w, h], amt, seed, scale = 1) {
  const cw = Math.ceil(w * scale), ch = Math.ceil(h * scale);
  for (const c of [GL, GR, GC]) if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
  const q = GL.getContext('2d'); q.setTransform(1, 0, 0, 1, 0, 0); q.clearRect(0, 0, cw, ch); q.setTransform(scale, 0, 0, scale, -x * scale, -y * scale); draw(q);
  const tint = (c, col) => { const k = c.getContext('2d'); k.globalCompositeOperation = 'source-over'; k.clearRect(0, 0, cw, ch); k.drawImage(GL, 0, 0); k.globalCompositeOperation = 'source-in'; k.fillStyle = col; k.fillRect(0, 0, cw, ch); };
  tint(GR, '#ff2a4d'); tint(GC, '#2af0ff');
  const off = 26 * amt;
  g.save();
  let yy = 0, i = 0;
  while (yy < h) {
    const bh = h * (.04 + hash(seed + i * 3.7) * .14), dx = (hash(seed + i * 9.1) - .5) * 2 * 70 * amt * (hash(seed + i) > .45 ? 1 : .15);
    const sy = yy * scale, sh = Math.min(bh, h - yy) * scale;
    g.drawImage(GL, 0, sy, cw, sh, x + dx, y + yy, w, sh / scale);
    yy += bh; i++;
  }
  g.globalCompositeOperation = 'screen'; g.globalAlpha = .55 * amt;
  g.drawImage(GR, x + off, y, w, h); g.drawImage(GC, x - off, y + off * .3, w, h);
  g.restore();
}

// rebobinado: bandas horizontales que se arrastran y una línea de seguimiento que baja (en pantalla)
export function rewindFX(g, t, amt) {
  if (amt <= 0) return;
  g.save();
  for (let i = 0; i < 9; i++) {
    const y = ((hash(i * 7.7) * 1920 + t * 2600 * (1 + hash(i))) % 2100) - 90, h = 6 + hash(i * 3.1) * 26;
    g.fillStyle = `rgba(246,185,207,${.07 * amt})`; g.fillRect(0, y, 1080, h);
    g.fillStyle = `rgba(255,255,255,${.05 * amt})`; g.fillRect(0, y + h, 1080, 2);
  }
  const ly = (t * 1900) % 2000 - 40; g.fillStyle = `rgba(255,255,255,${.12 * amt})`; g.fillRect(0, ly, 1080, 3);
  text(g, '◀◀', 80, 1690, 54, `rgba(251,246,242,${.8 * amt})`, { w: 700 });
  g.restore();
}

// la chispa del logo: estrella de cuatro puntas con su brillo y una estela fina detrás cuando vuela
export function spark(g, x, y, r, { trail = null, a = 1, squash = 0 } = {}) {
  if (a <= 0) return;
  g.save(); g.globalAlpha *= a;
  if (trail && trail.length > 1) {
    for (let i = 1; i < trail.length; i++) {
      const u = i / (trail.length - 1); g.strokeStyle = `rgba(246,185,207,${.55 * u})`; g.lineWidth = r * .5 * u; g.lineCap = 'round';
      g.beginPath(); g.moveTo(trail[i - 1][0], trail[i - 1][1]); g.lineTo(trail[i][0], trail[i][1]); g.stroke();
    }
  }
  glow(g, x, y, r * 4.2, '201,64,122', .55);
  g.translate(x, y); g.scale(1 + squash, 1 - squash);
  sparkPath(g, 0, 0, r); g.fillStyle = C.spark; g.fill();
  sparkPath(g, 0, 0, r * .42); g.fillStyle = 'rgba(255,225,238,.85)'; g.fill();
  g.restore();
}
