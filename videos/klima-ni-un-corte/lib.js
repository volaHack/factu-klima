// Utilidades de la película: números, curvas, muelles, azar determinista y texto. Todo es función pura del tiempo.
export const W = 1080, H = 1920;
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, u) => a + (b - a) * u;
export const seg = (t, a, b) => clamp((t - a) / (b - a));
export const mix = (a, b, u) => a.map((v, i) => lerp(v, b[i], u));

// curvas: la de entrada lenta y salida brusca (expo) es la que «aterriza»; la sinusoidal, la que sigue
export const ease = {
  lin: u => u,
  sine: u => .5 - .5 * Math.cos(Math.PI * u),
  cubic: u => u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2,
  quint: u => u < .5 ? 16 * u ** 5 : 1 - Math.pow(-2 * u + 2, 5) / 2,
  expoOut: u => u >= 1 ? 1 : 1 - Math.pow(2, -10 * u),
  expoIn: u => u <= 0 ? 0 : Math.pow(2, 10 * u - 10),
  expoInOut: u => u <= 0 ? 0 : u >= 1 ? 1 : u < .5 ? Math.pow(2, 20 * u - 10) / 2 : (2 - Math.pow(2, -20 * u + 10)) / 2,
  cubicOut: u => 1 - Math.pow(1 - u, 3),
  cubicIn: u => u * u * u,
  backOut: (u, s = 1.7) => 1 + (s + 1) * Math.pow(u - 1, 3) + s * Math.pow(u - 1, 2),
  hold: () => 0,
};
// muelle amortiguado de 0 a 1 que empieza en t0: pasa de largo y vuelve (f = oscilaciones por segundo, z = amortiguamiento)
export function spring(t, t0, f = 3.2, z = .42) {
  const u = t - t0; if (u <= 0) return 0;
  const w = 2 * Math.PI * f, wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * u) * (Math.cos(wd * u) + z * w / wd * Math.sin(wd * u));
}
// un golpe que se apaga: 0 → 1 en el instante t0 y decae oscilando (para sacudidas y aplastamientos)
export const kick = (t, t0, f = 7, d = 9) => t < t0 ? 0 : Math.exp(-(t - t0) * d) * Math.sin((t - t0) * f * 2 * Math.PI);

// azar determinista
export const hash = n => { n = Math.sin(n * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); };
export const rnd = (a, b, n) => lerp(a, b, hash(n));

// texto
export const FONT = { sans: 'Plex', serif: 'Fraunces', mono: 'PlexMono' };
export const f = (w, s, fam = FONT.sans, it = false) => `${it ? 'italic ' : ''}${w} ${s}px "${fam}"`;
export function setFont(g, w, s, fam = FONT.sans, it = false, ls = 0) { g.font = f(w, s, fam, it); g.letterSpacing = `${ls}px`; }
export function measure(g, s, w, size, fam = FONT.sans, it = false, ls = 0) { setFont(g, w, size, fam, it, ls); return g.measureText(s).width; }
export function text(g, s, x, y, size, col, { w = 700, fam = FONT.sans, it = false, align = 'left', ls = 0, base = 'alphabetic' } = {}) {
  setFont(g, w, size, fam, it, ls); g.textAlign = align; g.textBaseline = base; g.fillStyle = col; g.fillText(s, x, y);
}
export function rr(g, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2)); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
// importes como en la app (agrupando también los miles de cuatro cifras): 1.210,00
export const fmt = n => { const [e, d] = Math.abs(n).toFixed(2).split('.'); return (n < 0 ? '−' : '') + e.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + d; };
export const corta = h => `${h.slice(0, 10)}…${h.slice(-10)}`;
