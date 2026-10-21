// «El portal del martes»: promo de Klimafacturas en el estilo Sci-Fi Sitcom Toon (Lemo-Opuscar), 1080×1920.
import { clamp, lerp, seg, ss, eo, ei, eio, back, hash, TAU } from '/core/lib.js';
import { W, H, INK, init, frame, g, push, pop, translate, rotate, scale, shape, fillOnly, stroke, ell, arc, rr, rect, spline, dot, text, screenRect, reset } from './toon.js';
import { paco, nuria, tecnico, bicho, tpv, phone, kMark, coin, PAL } from './chars.js';
import * as Wd from './worlds.js';

init(document.getElementById('c'));
const J = async f => { try { const r = await fetch(f); if (r.ok) return await r.json(); } catch (e) { } return null; };
const LINES = await J('lines.json'), DURS = (await J('voices/dur.json')) || {}, LIPS = (await J('voices/lips.json')) || {};
const LINE = Object.fromEntries(LINES.map(l => [l.id, l]));
const vdur = id => DURS[id] ?? LINE[id].text.length * .07;
const q = t => Math.floor(t * 12 + 1e-6) / 12;          // personajes a 12 fps; cámara y portal a 24

export const DUR = 46.0;   // duración de la historia; con el gancho delante, DUR_ALL
let DUR_ALL = DUR;
// —— una sola línea de tiempo ——
const VO = { n1: .35, p1: 2.75, p2: 5.95, n2: 9.45, p3: 13.75, n3: 17.75, n4: 21.25, n5: 24.2, n6: 27.75, n7: 31.2, t1: 34.55, p4: 36.95, n8: 38.95 };
const T = {
  burst: 5.75, leverUp: 5.35, leverDn: 5.55, title: [5.9, 9.6], ticket: [8.35, 8.75], shakeN: 12.05,
  rumble: 15.15, rush: [15.75, 16.15], spitB: 16.9, landB: 17.3, burp: 18.3, pileH: 380,
  reach: 20.1, raise: 20.45, ding: 20.95, suck: [22.3, 23.15], wipe: [23.15, 23.55],
  tap1: 25.3, tap2: 29.3, bubble: 29.45, gulp: 29.85, coins: [30.1, 30.55], papersIn: [31.3, 32.8], fold: [31.6, 32.3],
  reopen: 34.2, tecPop: 34.4, lever2: [37.72, 37.92], close: [37.95, 38.12], end: 38.45,
};
const SHOTS = [
  [0, 1.3, 'open', 'sab'], [1.3, 2.65, 'tpvIns', 'sab'], [2.65, 5.35, 'pacoCU1', 'sab'], [5.35, 9.3, 'lever', 'sab'],
  [9.3, 13.55, 'nuriaCU', 'sab'], [13.55, 16.15, 'pacoMed', 'sab'], [16.15, 19.5, 'avalanche', 'trim'], [19.5, 23.55, 'silence', 'trim'],
  [23.55, 27.55, 'cobro', 'norm'], [27.55, 31.0, 'deben', 'norm'], [31.0, 33.05, 'gestoria', 'norm'], [33.05, 34.15, 'pacoNod', 'norm'],
  [34.15, 36.7, 'callback', 'norm'], [36.7, 37.7, 'yaNo', 'norm'], [37.7, T.end, 'close', 'norm'], [T.end, DUR, 'end', 'end'],
];
const shotAt = t => SHOTS.find(s => t >= s[0] && t < s[1]) || SHOTS[SHOTS.length - 1];

// —— boca: apertura de la frase que suena (a 12 fps) ——
function talk(who, t) {
  const tq = q(t);
  for (const [id, t0] of Object.entries(VO)) {
    const L = LINE[id]; if (L.who !== who) continue;
    if (tq >= t0 && tq < t0 + vdur(id)) {
      const k = Math.floor((tq - t0) * 24), lp = LIPS[id];
      const o = lp ? (lp.o[k] ?? 0) : .4, b = lp ? (lp.b[k] ?? .5) : .5;
      return { o, w: .8 + .45 * b - .2 * o, talking: true };
    }
  }
  return { o: 0, w: 1, talking: false };
}
const blinkAt = (t, list, d = .12) => list.some(b => t >= b && t < b + d);
const autoBlink = (t, seed) => { const k = Math.floor(t * 12); return k % 31 === Math.floor(hash(seed) * 6) || k % 31 === Math.floor(hash(seed) * 6) + 1; };
const popOpen = x => x <= 0 ? 0 : back(clamp(x / .32), 1.7);
const landSq = (t, tl) => { const u = t - tl; if (u < 0 || u > .5) return 1; return 1 - .22 * Math.exp(-u * 9) * Math.cos(u * 30); };
const arcPos = (t, t0, t1, a, b, h) => { const u = clamp((t - t0) / (t1 - t0)); return [lerp(a[0], b[0], u), lerp(a[1], b[1], u) - Math.sin(u * Math.PI) * h]; };

// —— cámara: una sola función mundo → pantalla ——
let CAM = { cx: 540, cy: 960, z: 1 }, CAMO = null, NOW = 0;
// golpes de cámara en las palabras clave (tiempo de historia): un 7 % hacia dentro y vuelta
const PUNCH = [1.95, 10.75, 15.25, 21.85, 26.3, 36.95];
const punch = s => { let k = 0; for (const p of PUNCH) { const u = s - p; if (u >= 0 && u < .6) k = Math.max(k, u < .05 ? u / .05 : Math.exp(-(u - .05) * 9)); } return 1 + .07 * k; };
function cam(cx, cy, z, shake = 0, t = 0) {
  if (CAMO) ({ cx, cy, z } = CAMO); else z *= punch(NOW);
  CAM = { cx, cy, z }; reset(); translate(W / 2, H / 2);
  if (shake) { const f = Math.floor(t * 24); translate((hash(f) - .5) * shake * 2, (hash(f + 77) - .5) * shake * 2); }
  scale(z); translate(-cx, -cy);
}
const toScreen = (x, y) => [W / 2 + (x - CAM.cx) * CAM.z, H / 2 + (y - CAM.cy) * CAM.z];

// —— reparto en sus marcas ——
const PX = 800, PY = 1600, NX = 290, NY = 1520;
let PACO_O = null;   // en el gancho Paco habla a cámara con el mundo congelado
function Pc(t, o = {}) {
  if (PACO_O) o = { ...o, ...PACO_O };
  const m = talk('PACO', t), tq = q(t);
  return { x: PX, y: PY, s: 1, face: -1, lid: .52, look: [.35, 0], blink: autoBlink(t, 3), armR: { h: [34, 176], bend: 34 }, armL: { h: [-24, 192], bend: -26 },
    mouth: { o: m.o, w: m.w, sm: -.3 }, sq: 1 + .008 * Math.sin(tq * 2.3), headTilt: m.talking ? (m.o - .3) * .06 : .02, ...o };
}
function Nu(t, o = {}) {
  const m = talk('NURIA', t), tq = q(t);
  return { x: NX, y: NY, s: 1, face: 1, t, nerv: .35, look: [.5, -.1], blink: autoBlink(t, 7), brow: 1, mouth: { o: m.o * 1.15, w: m.w, sm: -.4 },
    armR: { h: [20, 150], bend: 16 }, armL: { h: [-20, 150], bend: -16 }, sq: 1 + .012 * Math.sin(tq * 3.1), headTilt: m.talking ? (m.o - .3) * .08 : Math.sin(tq * 1.7) * .03, ...o };
}
// mano delantera de Nuria con el móvil: brazo levantado; devuelve dónde queda la pantalla (mundo)
const PHONE_ARM = { h: [90, -170], bend: 30 };
const PHONE_AT = [NX + 58 + 90 + 6, NY - 440 - 170 - 70];

// —— el bar completo, en orden de capas ——
function scene(t, mode, o = {}) {
  Wd.barBack(t, mode);
  if (o.portal) Wd.portal(o.portal[0], o.portal[1], o.portal[2], t, { open: o.portal[3] ?? 1, spin: o.portal[4] ?? 1 });
  if (o.portalSign) portalSign(o.portalSign, o.portal);
  if (o.tec) tecnico(o.tec[0], o.tec[1], o.tec[2], o.tec[3] || {});
  Wd.counterTop(mode);
  if (o.tpv) tpv(500, 1124, .85, t, o.tpv); else if (mode === 'norm') Wd.tabletStand(500, 1124, .8);
  if (o.nuria) nuria(o.nuria);
  Wd.counterFront(mode);
  Wd.lever(o.lever ?? 0, mode);
  if (o.bicho) bicho(o.bicho.x, o.bicho.y, o.bicho.s, t, o.bicho);
  if (o.paco) paco(o.paco);
  if (o.pile) Wd.pile(o.pile, t);
  if (o.extra) o.extra();
}
function portalSign(txt, p) {
  if (!p || (p[3] ?? 1) < .5) return;
  push(); translate(p[0], p[1] - p[2] - 46);
  shape(rr(-170, -30, 340, 60, 10), { fill: '#13202a', lw: 6 });
  text(txt, 0, 2, { font: '400 44px VT323', fill: PAL.glow });
  pop();
}

// ———————————————— PLANOS ————————————————
const SH = {};
SH.open = (t, tq) => {
  const z = lerp(1.6, 1.38, back(seg(t, 0, .35), 1.6));
  cam(560, 1150, z, 10 * (1 - seg(t, 0, 1.2)), t);
  scene(t, 'sab', {
    tpv: { frozen: 1, smoke: 1, paper: .3 + seg(t, 0, 1.3) * .3 },
    nuria: Nu(t, { nerv: 1, eyeS: 1.15, pupil: 3, brow: 1.4, armR: { h: [150, -140], bend: 20, fist: false }, armL: { h: [-80, -170], bend: -30 }, look: [.7, .2], sweat: t * 1.4 }),
    paco: Pc(t, { look: [.6, .2], lid: .55 }),
  });
};
SH.tpvIns = (t, tq) => {
  cam(474, lerp(950, 925, seg(t, 1.3, 2.65)), lerp(3.0, 3.25, seg(t, 1.3, 2.65)), 4, t);
  scene(t, 'sab', { tpv: { frozen: 1, smoke: 1, paper: .6 + seg(t, 1.3, 2.6) * .5 }, nuria: Nu(t, { nerv: 1 }), paco: Pc(t) });
};
SH.pacoCU1 = (t, tq) => {
  cam(795, lerp(1110, 1095, seg(t, 2.65, 5.35)), 2.25);
  const up = seg(tq, 4.9, 5.2);
  scene(t, 'sab', { tpv: { frozen: 1, smoke: .6 }, nuria: Nu(t, { nerv: .8 }), paco: Pc(t, { blink: blinkAt(tq, [3.1, 4.4]), look: [lerp(.35, -.2, up), lerp(0, -.5, up)], lid: .56, brow: -.1 }) });
};
SH.lever = (t, tq) => {
  const sh = t > T.burst && t < T.burst + .45 ? 14 * (1 - seg(t, T.burst, T.burst + .45)) : 0;
  cam(545, lerp(1170, 1080, ss(seg(t, 5.35, 9.3))), lerp(1.45, 1.3, ss(seg(t, 5.35, 9.3))), sh, t);
  // palanca: preparación, tirón, vuelta
  const up = ss(seg(tq, T.leverUp, T.leverDn)), dn = ss(seg(tq, T.leverDn, T.burst));
  const pull = dn - ss(seg(tq, 6.6, 7.0)) * dn;
  const reach = { h: [lerp(26, 78, up) + lerp(0, -159, dn), lerp(200, -336, up) + lerp(0, 87, dn)], bend: 20 };
  const armR = tq < 6.6 ? reach : { h: [lerp(-81, 26, ss(seg(tq, 6.6, 7.0))), lerp(-249, 200, ss(seg(tq, 6.6, 7.0)))], bend: 30 };
  const op = t < T.burst ? 0 : popOpen(t - T.burst);
  // Nuria se lleva un susto
  const hop = seg(tq, T.burst + .05, T.burst + .45);
  const nu = Nu(t, { y: NY - Math.sin(hop * Math.PI) * 60, nerv: 1, eyeS: 1.18, pupil: 2.8, look: [.5, -.8], armR: hop > 0 && hop < 1 ? { h: [60, -150], bend: 30 } : { h: [40, 120], bend: 20 }, armL: hop > 0 && hop < 1 ? { h: [-60, -150], bend: -30 } : { h: [-40, 120], bend: -20 }, sweat: t * 1.3 });
  // el ticket del turno sale del portal y se le pega en la cara a Paco
  const extra = () => {
    if (t >= T.ticket[0]) {
      const [x, y] = t < T.ticket[1] ? arcPos(t, T.ticket[0], T.ticket[1], Wd.PORTAL, [800, 1030], 120) : [800, 1030];
      push(); translate(x, y); rotate(t < T.ticket[1] ? (t - T.ticket[0]) * 18 : -.12);
      shape(rr(-90, -42, 180, 84, 8), { fill: '#fbf8ef', lw: 6 }); text('TURNO', 0, -12, { font: '400 30px VT323', fill: INK }); text('847', 0, 20, { font: '400 40px VT323', fill: '#c23b3b' });
      pop();
    }
  };
  scene(t, 'sab', {
    tpv: { frozen: 1, smoke: .5 }, nuria: nu, lever: pull,
    portal: [Wd.PORTAL[0], Wd.PORTAL[1], 190, op], portalSign: 'MARTES 09:00',
    paco: Pc(t, { armR, look: t > 5.9 ? [.25, -.75] : [.3, -.2], lid: .55, sq: landSq(t, T.ticket[1] + .02) }), extra,
  });
};
SH.nuriaCU = (t, tq) => {
  const sh = t > T.shakeN && t < T.shakeN + .4 ? 12 * (1 - seg(t, T.shakeN, T.shakeN + .4)) : 0;
  cam(310, lerp(1050, 1030, seg(t, 9.3, 13.55)), 2.3, sh, t);
  const point = ss(seg(tq, 11.3, 11.6));
  scene(t, 'sab', {
    tpv: { frozen: 1, smoke: .5 }, portal: [Wd.PORTAL[0], Wd.PORTAL[1], 190, 1], portalSign: 'MARTES 09:00',
    nuria: Nu(t, { nerv: .95, eyeS: 1.1, pupil: 3, brow: 1.3, sweat: t * 1.5, look: [lerp(-.2, .7, point), .1], armR: { h: [lerp(30, 170, point), lerp(140, -60, point)], bend: 16 }, armL: { h: [-70, -40 + Math.sin(tq * 9) * 20], bend: -40 } }),
    paco: Pc(t),
  });
};
SH.pacoMed = (t, tq) => {
  const r = seg(t, T.rush[0], T.rush[1]);
  const sh = t > T.rumble && t < T.rush[0] ? 6 : 0;
  const z = lerp(1.55, 7, ei(r)), cx = lerp(700, Wd.PORTAL[0], eio(r)), cy = lerp(1010, Wd.PORTAL[1], eio(r));
  cam(cx, cy, z, sh, t);
  const sign = t < T.rumble ? 'MARTES 09:00' : 'FIN DE TRIMESTRE';
  const extra = () => { if (t > 15.4) for (let i = 0; i < 6; i++) { const u = seg(t, 15.4 + i * .05, 16.1); Wd.sheet(Wd.PORTAL[0] + Math.cos(i * 1.7) * 90 * u, Wd.PORTAL[1] + Math.sin(i * 1.7) * 70 * u, i + u * 3, .7 * u); } };
  scene(t, 'sab', {
    tpv: { frozen: 1, smoke: .4 }, portal: [Wd.PORTAL[0], Wd.PORTAL[1], 190, 1, t > T.rumble ? 2.2 : 1], portalSign: sign,
    nuria: Nu(t, { nerv: .7, look: [.4, -.8] }), paco: Pc(t, { look: [.3, -.7], lid: .55, brow: -.15 }), extra,
  });
};
// avalancha de papel
const FLY = Array.from({ length: 70 }, (_, i) => ({ t0: 16.2 + i * .03 + hash(i) * .2, d: .5 + hash(i + 3) * .35, x: -60 + hash(i * 7.3) * 1200, y: 1300 + hash(i * 2.1) * 300, h: 200 + hash(i * 4.4) * 400, r: (hash(i * 9.9) - .5) * 14 }));
function flyingPapers(t, src = Wd.PORTAL) {
  for (const f of FLY) { if (t < f.t0 || t > f.t0 + f.d) continue; const u = (t - f.t0) / f.d, [x, y] = arcPos(t, f.t0, f.t0 + f.d, src, [f.x, f.y], f.h); Wd.sheet(x, y, f.r * u, .5 + u * .5); }
}
const B_T = [612, 1124], B_N = [612, 1124];
const pileH = t => T.pileH * ss(seg(t, 16.3, 18.6)) * (1 - ss(seg(t, T.papersIn[0], T.papersIn[1])));
function bichoAt(t) {
  if (t < T.spitB) return null;
  if (t < T.landB) { const [x, y] = arcPos(t, T.spitB, T.landB, Wd.PORTAL, B_T, 160); return { x, y, s: .5 * lerp(.4, 1, seg(t, T.spitB, T.landB)) }; }
  return { x: B_T[0], y: B_T[1], s: .5 * (1 + (1 - landSq(t, T.landB)) * .4) };
}
SH.avalanche = (t, tq) => {
  const sh = 12 * (1 - seg(t, 16.15, 17.2)) + (t > T.landB && t < T.landB + .3 ? 8 : 0);
  const push_ = ss(seg(t, 18.9, 19.5));
  cam(lerp(545, 760, push_), lerp(1080, 1110, push_), lerp(1.3, 1.65, push_), sh, t);
  const b = bichoAt(t);
  const burp = seg(t, T.burp, T.burp + .4);
  scene(t, 'trim', {
    tpv: { frozen: 1, smoke: .3 }, portal: [Wd.PORTAL[0], Wd.PORTAL[1], 190, 1, 2.2], portalSign: 'FIN DE TRIMESTRE',
    nuria: Nu(t, { nerv: 1, eyeS: 1.2, pupil: 2.6, brow: 1.5, sweat: t * 1.6, look: [-.6, .3], armR: { h: [-40, -190], bend: 40 }, armL: { h: [40, -190], bend: -40 } }),
    bicho: b ? { ...b, look: [.6, -.2], o: burp > 0 && burp < 1 ? .6 : 0, blink: blinkAt(tq, [17.9]) } : null,
    paco: Pc(t, { blink: blinkAt(tq, [18.95]), lid: .6, look: [.1, .1] }),
    pile: pileH(t),
    extra: () => { flyingPapers(t); if (burp > 0 && burp < 1) for (let i = 0; i < 3; i++) Wd.sheet(B_T[0] + 80 * burp * (i + 1), B_T[1] - 80 - 120 * burp + i * 20, burp * 4 + i, .6); },
  });
};
// silencio, el móvil y el portal que se mete en la pantalla
function silenceScene(t, tq, mode) {
  const s = seg(t, T.suck[0], T.suck[1]);
  const pp = [lerp(Wd.PORTAL[0], PHONE_AT[0], eio(s)), lerp(Wd.PORTAL[1], PHONE_AT[1], eio(s)), lerp(190, 30, ei(s)), s >= 1 ? 0 : 1, 1 + s * 3];
  const reach = ss(seg(tq, T.reach, T.raise)), up = ss(seg(tq, T.raise, T.raise + .3));
  const armR = { h: [lerp(20, 30, reach) + up * 60, lerp(150, 110, reach) - up * 280], bend: lerp(16, 30, up) };
  const on = t >= T.ding;
  const mode_ = s > .02 ? 'portal' : on ? 'portal' : 'apagado';
  scene(t, mode, {
    tpv: mode === 'norm' ? null : { frozen: 1, smoke: .2 },
    portal: mode === 'norm' ? null : pp, portalSign: s < .05 && mode !== 'norm' ? 'FIN DE TRIMESTRE' : null,
    nuria: Nu(t, { nerv: on ? .1 : .5, brow: on ? .2 : 1.2, look: on ? [.2, -.3] : [.6, .2], armR, holdR: up > .05 ? 'phone' : null, phoneP: { mode: mode === 'norm' ? 'cobro' : mode_, t } }),
    bicho: mode === 'norm' ? { x: B_N[0], y: B_N[1], s: .5, look: [.8, -.3] } : { x: B_T[0], y: B_T[1], s: .5, look: on ? [.8, -.4] : [.5, 0] },
    paco: Pc(t, { lid: .6, look: on ? [.4, -.3] : [.2, 0] }),
    pile: mode === 'norm' ? T.pileH : T.pileH,
    extra: () => {
      if (on && mode !== 'norm') { // brillo de la pantalla (cian: es el portal entrando)
        const k = s > 0 ? .25 + s * .6 : .25;
        push(); translate(PHONE_AT[0], PHONE_AT[1]);
        fillOnly(ell(0, 0, 150 + s * 60, 220 + s * 80, 30), `rgba(63,240,224,${k * .35})`, { boil: .6 });
        pop();
      }
    },
  });
}
SH.silence = (t, tq) => {
  const z = lerp(1.32, 1.5, ss(seg(t, 19.5, 23.1)));
  cam(lerp(560, 500, seg(t, 19.5, 23.1)), lerp(1090, 1020, seg(t, 19.5, 23.1)), z);
  silenceScene(t, tq, 'trim');
  if (t >= T.wipe[0]) {
    const u = seg(t, T.wipe[0], T.wipe[1]), [sx, sy] = toScreen(PHONE_AT[0], PHONE_AT[1]), R = 2300 * Math.pow(u, 1.6);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.beginPath(); g.arc(sx, sy, R, 0, TAU); g.clip();
    cam(CAM.cx, CAM.cy, CAM.z); silenceScene(t, tq, 'norm'); g.restore();
    reset(); stroke(arc(sx, sy, R, R, 0, TAU, 60), 22, { line: PAL.glow, boil: .5 }); stroke(arc(sx, sy, R + 16, R + 16, 0, TAU, 60), 7, { boil: .5 });
  }
};
SH.cobro = (t, tq) => {
  cam(PHONE_AT[0], lerp(950, 925, seg(t, 23.55, 27.55)), lerp(2.25, 2.4, seg(t, 23.55, 27.55)));
  const u = seg(t, 24.2, 27.2);
  scene(t, 'norm', {
    nuria: Nu(t, { nerv: 0, brow: .1, look: [.3, -.4], armR: PHONE_ARM, holdR: 'phone', phoneP: { mode: 'cobro', u, off: 1, t } }),
    bicho: { x: B_N[0], y: B_N[1], s: .5, look: [.8, -.3] }, paco: Pc(t), pile: T.pileH,
    extra: () => { const tp = T.tap1; if (t > tp - .05 && t < tp + .35) { const k = seg(t, tp - .05, tp + .35); push(); translate(PHONE_AT[0], PHONE_AT[1] + 66); fillOnly(ell(0, 0, 30 + k * 40, 30 + k * 40, 24), `rgba(29,16,19,${.35 * (1 - k)})`, { boil: .3 }); pop(); } },
  });
};
SH.deben = (t, tq) => {
  cam(lerp(420, 440, seg(t, 27.55, 31)), 1030, 1.5);
  const u = seg(t, 27.75, 30.6), bub = back(seg(t, T.bubble, T.bubble + .25), 2) * (1 - seg(t, 30.4, 30.7));
  const gulp = seg(tq, T.gulp, T.gulp + .3);
  const cough = seg(t, T.coins[0], T.coins[1]);
  scene(t, 'norm', {
    nuria: Nu(t, { nerv: 0, brow: .1, look: [-.6, .1], armR: PHONE_ARM, holdR: 'phone', phoneP: { mode: 'deben', u, t } }),
    bicho: { x: B_N[0], y: B_N[1], s: .5 * (1 - Math.sin(gulp * Math.PI) * .06), look: [.5, -.6], bubble: bub, o: cough > 0 && cough < 1 ? .7 : 0, happy: t > T.coins[1] ? 1 : 0 },
    paco: Pc(t), pile: T.pileH,
    extra: () => { if (cough > 0 && cough < 1) for (let i = 0; i < 4; i++) { const [x, y] = arcPos(t, T.coins[0] + i * .05, T.coins[1] + i * .05, [B_N[0] + 30, B_N[1] - 60], [860, 1080], 200); coin(x, y, 22); } },
  });
};
SH.gestoria = (t, tq) => {
  cam(545, lerp(1100, 1080, seg(t, 31, 33.05)), lerp(1.36, 1.3, seg(t, 31, 33.05)));
  const u = seg(t, 31.2, 33.0), fold = ss(seg(t, T.fold[0], T.fold[1]));
  scene(t, 'norm', {
    nuria: Nu(t, { nerv: 0, brow: 0, look: [.6, .3], armR: PHONE_ARM, holdR: 'phone', phoneP: { mode: 'gestoria', u, t }, mouth: { o: talk('NURIA', t).o, sm: .5 } }),
    bicho: { x: B_N[0], y: B_N[1], s: .5, fold, look: [.5, -.3], happy: 1 },
    paco: Pc(t, { holdR: 'coins', armR: { h: [80, 40], bend: 40 }, look: [.5, -.2], brow: .3 }), pile: pileH(t),
    extra: () => { // las hojas vuelan dentro del móvil
      for (let i = 0; i < 26; i++) { const t0 = T.papersIn[0] + i * .05, d = .55; if (t < t0 || t > t0 + d) continue; const from = [-100 + hash(i * 3.1) * 1300, 1500 - hash(i * 1.3) * 200]; const [x, y] = arcPos(t, t0, t0 + d, from, PHONE_AT, 160); const k = (t - t0) / d; Wd.sheet(x, y, k * 6 + i, .9 * (1 - k * .8)); }
    },
  });
};
SH.pacoNod = (t, tq) => {
  cam(795, 1100, 2.25);
  const nod = Math.sin(seg(tq, 33.4, 34.0) * Math.PI * 2) * .08;
  scene(t, 'norm', { nuria: Nu(t), bicho: { x: B_N[0], y: B_N[1], s: .5, fold: 1 }, paco: Pc(t, { headTilt: .02 + nod, brow: lerp(-.1, .5, seg(tq, 33.1, 33.3)), lid: .45, look: [.4, -.1], mouth: { o: 0, sm: .45 }, holdR: 'coins', armR: { h: [80, 40], bend: 40 } }) });
};
SH.callback = (t, tq) => {
  const sh = t > T.reopen && t < T.reopen + .35 ? 10 * (1 - seg(t, T.reopen, T.reopen + .35)) : 0;
  cam(545, 1070, 1.3, sh, t);
  const op = popOpen(t - T.reopen), up = back(seg(t, T.tecPop, T.tecPop + .3), 2);
  const m = talk('TÉCNICO', t);
  scene(t, 'norm', {
    portal: [Wd.PORTAL[0], Wd.PORTAL[1], 190, op], portalSign: 'MARTES 09:00',
    tec: t > T.tecPop ? [Wd.PORTAL[0], Wd.PORTAL[1] + 70 - up * 40, .95 * up, { mouth: { o: m.o, w: m.w, sm: .6 }, look: [.4, .3] }] : null,
    nuria: Nu(t, { look: [.4, -.9], brow: .6 }), bicho: { x: B_N[0], y: B_N[1], s: .5, fold: 1 },
    paco: Pc(t, { look: [.3, -.8], lid: .55, holdR: 'coins', armR: { h: [80, 40], bend: 40 } }),
  });
};
SH.yaNo = (t, tq) => {
  cam(795, 1100, 2.4);
  scene(t, 'norm', { portal: [Wd.PORTAL[0], Wd.PORTAL[1], 190, 1], nuria: Nu(t), paco: Pc(t, { look: [.3, -.6], lid: .64, blink: blinkAt(tq, [37.5]), holdR: 'coins', armR: { h: [80, 40], bend: 40 } }) });
};
SH.close = (t, tq) => {
  cam(545, 1070, 1.3, t > T.close[0] && t < T.close[0] + .3 ? 8 : 0, t);
  const dn = ss(seg(tq, T.lever2[0], T.lever2[1])), cl = seg(t, T.close[0], T.close[1]);
  const op = 1 - eo(cl);
  scene(t, 'norm', {
    portal: [Wd.PORTAL[0], Wd.PORTAL[1], 190, op], lever: dn,
    tec: op > .25 ? [Wd.PORTAL[0], Wd.PORTAL[1] + 30, .95 * op, { mouth: { o: .7, sm: -.6 }, look: [0, 0] }] : null,
    nuria: Nu(t, { look: [.4, -.6], mouth: { o: 0, sm: .7 } }), bicho: { x: B_N[0], y: B_N[1], s: .5, fold: 1 },
    paco: Pc(t, { armR: { h: [lerp(26, -81, dn), lerp(200, -249, dn)], bend: 20 }, look: [.3, -.5], lid: .6 }),
  });
};

// ———————————————— EL GANCHO: avance del desastre, congelado, «el del bigote soy yo», rebobinado ————————————————
const OFF = 7.35;                 // la historia empieza aquí; todo lo de arriba va en tiempo de historia (s = t − OFF)
const FZ = 1.6, FS = 18.36;       // congelado: momento de la pantalla y momento de la historia que se congela
const HVO = { h1: 1.85, h2: 4.05 };
const RW = [6.45, OFF];           // rebobinado
DUR_ALL = 46.0 + OFF;
function talkHook(t) {
  for (const [id, t0] of Object.entries(HVO)) {
    if (t >= t0 && t < t0 + vdur(id)) { const k = Math.floor((q(t) - t0) * 24), lp = LIPS[id]; return { o: lp ? (lp.o[k] ?? 0) : .4, w: .8 + .45 * (lp ? (lp.b[k] ?? .5) : .5) }; }
  }
  return { o: 0, w: 1 };
}
function arrowLabel(from, to, label, u, col = '#ffd84d') {
  if (u <= 0) return;
  const k = back(clamp(u / .25), 2.2), [x0, y0] = from, [x1, y1] = to;
  const mx = (x0 + x1) / 2 + (y1 - y0) * .25, my = (y0 + y1) / 2 - (x1 - x0) * .25;
  const P = []; for (let i = 0; i <= 16; i++) { const v = i / 16 * Math.min(1, u / .3), w = 1 - v; P.push([w * w * x0 + 2 * w * v * mx + v * v * x1, w * w * y0 + 2 * w * v * my + v * v * y1]); }
  reset(); stroke(P, 13, { boil: .8 }); stroke(P, 7, { line: col, boil: .8 });
  if (u > .3) { const [ax, ay] = P[P.length - 1], [bx, by] = P[P.length - 3], a = Math.atan2(ay - by, ax - bx);
    shape([[ax, ay], [ax - Math.cos(a - .5) * 34, ay - Math.sin(a - .5) * 34], [ax - Math.cos(a + .5) * 34, ay - Math.sin(a + .5) * 34]], { fill: col, lw: 6 }); }
  reset(); translate(x0, y0); scale(k); rotate(-.04);
  text(label, 0, 0, { font: '800 50px "Baloo 2"', fill: col, outlineW: 13 });
}
function hook(t) {
  const frozen = t >= FZ;
  if (t < RW[0]) {
    const s = frozen ? FS : 17.0 + t * .85;
    // avance: empujón a la cara de Paco; congelado: un acercamiento lentísimo
    const u = frozen ? seg(t, FZ, RW[0]) : seg(t, 0, FZ);
    CAMO = frozen ? { cx: lerp(640, 700, u), cy: lerp(1060, 1050, u), z: lerp(1.42, 1.55, u) } : { cx: lerp(545, 640, ei(u)), cy: lerp(1080, 1060, u), z: lerp(1.3, 1.42, ei(u)) };
    if (frozen) { const m = talkHook(t); PACO_O = { look: [0, .05], lid: .5, brow: .2, blink: blinkAt(q(t), [3.95, 5.6]), mouth: { o: m.o, w: m.w, sm: -.2 } }; }
    NOW = s; SH.avalanche(s, q(s)); CAMO = null; PACO_O = null;
    if (frozen) {
      reset(); screenRect('rgba(255,236,190,1)', .10);                       // un punto de foto fija
      const L = (wx, wy) => toScreen(wx, wy);
      arrowLabel([300, 330], L(470, 900), 'Su TPV de 2004', t - (FZ + .15), '#ffd84d');
      arrowLabel([150, 560], L(270, 930), 'Su sobrina', t - (FZ + .4), '#7fe7ff');
      arrowLabel([870, 650], L(600, 990), 'El trimestre', t - (FZ + .65), '#ff9fc4');
      arrowLabel([760, 1820 - 520], L(800, 1170), 'Paco', t - (HVO.h1 + .9), '#ffffff');
      if (t < FZ + .06) screenRect('#ffffff', .85 * (1 - (t - FZ) / .06));  // destello del disco rayado
    }
  } else {
    // rebobinado VHS: la historia hacia atrás a toda velocidad
    const u = seg(t, RW[0], RW[1]), s = FS * (1 - Math.pow(u, .75));
    NOW = s; const [, , name] = shotAt(s);
    if (name !== 'end') SH[name](s, q(s));
    reset(); g.setTransform(1, 0, 0, 1, 0, 0);
    for (let i = 0; i < 7; i++) { const y = (hash(Math.floor(t * 24) * 3.1 + i) * 2100 - 90), h = 6 + hash(i * 7 + Math.floor(t * 24)) * 26; g.fillStyle = `rgba(255,255,255,${.25 + hash(i) * .35})`; g.fillRect(0, y, W, h); }
    screenRect('#1a2a6a', .12);
    reset(); text('◀◀ REBOBINANDO', 60, 330, { font: '400 74px VT323', fill: '#ffffff', align: 'left', outlineW: 9 });
  }
}

// ———————————————— CAPA DE PANTALLA ————————————————
function titleCard(s) {
  const [a, b] = T.title; if (s < a || s >= b) return;
  const u = seg(q(s), a, a + .25), k = u < 1 ? back(u, 2.4) : 1, out = 1 - seg(s, b - .2, b);
  reset(); translate(540, 250); scale(k * out, k); rotate(-.03);
  text('EL PORTAL DEL MARTES', 7, 7, { font: '400 86px "Lilita One"', fill: '#d23a44', outlineW: 18, outlineCol: INK });
  text('EL PORTAL DEL MARTES', 0, 0, { font: '400 86px "Lilita One"', fill: '#fff3d6', outlineW: 18, outlineCol: INK });
}
// etiqueta de terminal: «SÁBADO, 14:30» tecleada al empezar la historia
const TAG = [OFF + .05, OFF + 2.6, 'SÁBADO, 14:30', 'una hora antes'];
function tag(t) {
  const [a, b, l1, l2] = TAG; if (t < a || t >= b) return;
  const n = Math.floor((t - a) * 40), s1 = l1.slice(0, n), s2 = l2.slice(0, Math.max(0, n - l1.length));
  reset(); push(); translate(60, 300); scale(back(seg(t, a, a + .18), 2.2));
  shape(rr(0, 0, 520, 128, 12), { fill: '#13202a', lw: 7 });
  text('▶ ' + s1 + (n < l1.length && Math.floor(t * 6) % 2 ? '█' : ''), 24, 44, { font: '400 60px VT323', fill: PAL.glow, align: 'left' });
  text(s2, 28, 96, { font: '400 40px VT323', fill: '#a6fff6', align: 'left' });
  pop();
}
const WHO_COL = { PACO: '#d23a44', NURIA: '#f08a24', 'TÉCNICO': '#2d5fb3', LOCUTOR: '#1b1b1b' };
const CUTS = [19.5 + OFF, T.end + OFF, RW[0]];
const ALLVO = [...Object.entries(HVO), ...Object.entries(VO).map(([id, t0]) => [id, t0 + OFF])];
const SUBS = ALLVO.map(([id, t0], i, arr) => {
  const L = LINE[id], text_ = L.sub || L.text, d = vdur(id);
  let t1 = t0 + Math.max(d + .6, 1.8);
  const next = arr[i + 1]?.[1]; if (next && t1 > next - .05) t1 = next - .05;
  const cut = CUTS.filter(c => c > t0 + .1).sort((x, y) => x - y)[0]; if (cut && t1 > cut) t1 = Math.max(cut - .02, t0 + d + .1);
  if (id === 'n8') t1 = DUR_ALL - .3;
  return { id, t0, t1, who: L.who, text: text_, burn: id !== 'n8' };
});
// subtítulos con palabras clave resaltadas: *así*
const toks = str => {
  const out = [];
  for (const p of str.split(/(\*[^*]+\*)/).filter(Boolean)) {
    const hi = p.startsWith('*') ? 1 : 0, txt = hi ? p.slice(1, -1) : p;
    txt.split(' ').forEach((w, i) => { if (!w) return; if (i === 0 && !txt.startsWith(' ') && out.length && /^[.,:;!?¡¿]+$/.test(w)) out[out.length - 1][0] += w; else if (i === 0 && !txt.startsWith(' ') && out.length && /^[.,:;!?]/.test(w)) out[out.length - 1][0] += w; else out.push([w, hi]); });
  }
  return out;
};
function wrapSub(str, max = 880) {
  g.setTransform(1, 0, 0, 1, 0, 0); g.font = '800 60px "Baloo 2"';
  const T_ = toks(str), lines = [[]]; let w = 0; const sp = g.measureText(' ').width + 16;
  const total = T_.reduce((a, [x]) => a + g.measureText(x).width + sp, 0), target = total > max * 1.9 ? total / 3 : total > max ? total / 2 : max;
  for (const tk of T_) { const tw = g.measureText(tk[0]).width; if (w + tw > target + 40 && lines[lines.length - 1].length) { lines.push([]); w = 0; } lines[lines.length - 1].push(tk); w += tw + sp; }
  return lines;
}
function subs(t) {
  const act = SUBS.filter(s => s.burn && t >= s.t0 && t < s.t1).slice(-1);
  for (const s of act) {
    const lines = wrapSub(s.text), pop_ = back(seg(t, s.t0, s.t0 + .12), 2);
    const yBase = 1470 - (lines.length - 1) * 72;
    reset(); push(); translate(540, yBase - 76); scale(pop_);
    g.setTransform(1, 0, 0, 1, 0, 0); g.font = '800 28px "Baloo 2"'; const nw = g.measureText(s.who).width + 40;
    shape(rr(-nw / 2, -24, nw, 48, 16), { fill: WHO_COL[s.who] || '#555', lw: 5 });
    text(s.who, 0, 2, { font: '800 28px "Baloo 2"', fill: '#fff' });
    pop();
    // las palabras aparecen al ritmo de la frase (estilo karaoke) y las clave van en amarillo y más grandes
    const d = vdur(s.id), all = lines.flat(), n = all.length; let idx = 0;
    lines.forEach((ln, k) => {
      g.setTransform(1, 0, 0, 1, 0, 0); g.font = '800 60px "Baloo 2"'; const sp = g.measureText(' ').width + 16;
      const ws = ln.map(([w]) => g.measureText(w).width), tw = ws.reduce((a, b) => a + b, 0) + sp * (ln.length - 1);
      let x = 540 - tw / 2;
      ln.forEach(([w, hi], j) => {
        const tOn = s.t0 + (idx / n) * d * .9, on = t >= tOn - .02, pk = back(seg(t, tOn - .02, tOn + .1), 2.4);
        if (on) { reset(); push(); translate(x + ws[j] / 2, yBase + k * 72); scale(hi ? .9 + .2 * pk : pk); rotate(hi ? -.03 : 0);
          text(w, 0, 0, { font: '800 60px "Baloo 2"', fill: hi ? '#ffd84d' : '#fff', outlineW: 13 }); pop(); }
        x += ws[j] + sp; idx++;
      });
    });
  }
}
function endCard(s) {
  reset(); screenRect(PAL.vino);
  const k = s - T.end;
  Wd.portal(540, 450, 280, s * .5, { open: back(clamp(k / .4), 1.6), sx: 1, wash: false });
  const sc = back(seg(q(s), T.end, T.end + .3), 2.2);
  reset(); translate(540, 450); scale(sc); kMark(-120, -120, 240, { sparkle: 1 + .3 * Math.sin(s * 6) });
  const tp = back(seg(q(s), T.end + .25, T.end + .55), 2.2);
  reset(); translate(540, 770); scale(tp); rotate(-.03);
  text('Klimafacturas', 8, 8, { font: '400 128px "Lilita One"', fill: PAL.rojo, outlineW: 22, outlineCol: INK });
  text('Klimafacturas', 0, 0, { font: '400 128px "Lilita One"', fill: '#fff3d6', outlineW: 22, outlineCol: INK });
  const c = ss(seg(s, T.end + .7, T.end + 1.1));
  if (c > 0) {
    reset(); g.globalAlpha = c;
    text('Factura y cobra desde el móvil', 540, 895, { font: '800 50px "Baloo 2"', fill: '#f2ebe3' });
    push(); translate(540, 1020); rotate(.02);
    shape(rr(-330, -62, 660, 124, 22), { fill: PAL.papel, lw: 7 });
    text('Código LANZAMIENTO50', 0, -16, { font: '800 44px "Baloo 2"', fill: PAL.tinta });
    text('el primer mes, a mitad de precio', 0, 30, { font: '700 32px "Baloo 2"', fill: PAL.rojo });
    pop();
    text('klimafacturas.com', 540, 1160, { font: '400 58px VT323', fill: PAL.glow, outlineW: 8 });
    g.globalAlpha = 1;
  }
  // Paco asoma por abajo y guiña (cierra el bucle con el gancho)
  const pk = ss(seg(s, T.end + 1.6, T.end + 2.1));
  if (pk > 0) { cam(540, 960, 1); NOW = s; paco({ x: 540, y: 2420 - 300 * pk, s: 1.05, face: 1, lid: .5, look: [0, 0], blink: false, brow: .4, mouth: { o: 0, sm: .55 }, armR: { h: [60, -150], bend: 40 }, armL: { h: [-30, 190], bend: -26 } }); }
}
window.TEXTS = t => {
  const out = [], s = t - OFF;
  if (t >= TAG[0] + .4 && t < TAG[1]) out.push({ id: 'tag', text: 'SÁBADO, 14:30 una hora antes', x0: 60, y0: 300, x1: 580, y1: 428 });
  if (t >= FZ + .4 && t < RW[0]) out.push({ id: 'labels', text: 'Su TPV de 2004 Su sobrina El trimestre', x0: 40, y0: 260, x1: 1040, y1: 620 });
  if (s >= T.title[0] + .3 && s < T.title[1] - .2) out.push({ id: 'title', text: 'EL PORTAL DEL MARTES', x0: 70, y0: 195, x1: 1010, y1: 305 });
  if (s >= T.end + 1.1) { out.push({ id: 'claim', text: 'Factura y cobra desde el móvil', x0: 160, y0: 865, x1: 920, y1: 925 }); out.push({ id: 'code', text: 'Código LANZAMIENTO50 el primer mes, a mitad de precio', x0: 210, y0: 958, x1: 870, y1: 1082 }); out.push({ id: 'url', text: 'klimafacturas.com', x0: 280, y0: 1130, x1: 800, y1: 1190 }); }
  if (s >= T.end + .55) out.push({ id: 'brand', text: 'Klimafacturas', x0: 110, y0: 700, x1: 970, y1: 840 });
  return out;
};

// fotograma de impacto: dos fotogramas en negativo cuando revienta el portal
const IMPACT = [T.burst, T.reopen];
function story(s) {
  NOW = s;
  const [, , name] = shotAt(s), sq = q(s);
  if (name === 'end') endCard(s); else SH[name](s, sq);
  if (IMPACT.some(x => s >= x && s < x + 2 / 24)) { g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'difference'; g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'source-over'; }
  titleCard(s);
}
function render(t) {
  frame(t);
  screenRect('#000');
  if (t < OFF) hook(t); else story(t - OFF);
  tag(t);
  subs(t);
}

// —— eventos de sonido (tiempo de pantalla; para mix.py) ——
function events() {
  const ev = [], add = (type, t, o = {}) => ev.push({ type, t: +t.toFixed(3), ...o });
  const S = (type, s, o = {}) => add(type, s + OFF, o);
  for (const [id, t0] of ALLVO) add('vo', t0, { id, who: LINE[id].who });
  for (const c of SUBS) add('sub', c.t0, { t1: +c.t1.toFixed(3), text: c.text.replace(/\*/g, '') });
  // gancho
  add('amb', 0, { w: 'bar', d: FZ }); add('paperStorm', 0, { d: FZ + .1 }); add('alarm', 0, { d: FZ }); add('glorp', .5, { v: .8 });
  add('scratch', FZ); add('amb', FZ + .05, { w: 'fluor', d: RW[0] - FZ - .05 }); add('pop', FZ + .2, { v: .5 }); add('pop', FZ + .45, { v: .5 }); add('pop', FZ + .7, { v: .5 }); add('pop', HVO.h1 + .9, { v: .5 });
  add('rewind', RW[0], { d: RW[1] - RW[0] }); add('typing', OFF + .05, { d: .6 });
  // historia
  S('amb', 0, { w: 'bar', d: 19.5 }); S('amb', 19.5, { w: 'fluor', d: 1.5 }); S('amb', 21.0, { w: 'calm', d: T.end - 21.0 });
  S('alarm', 0, { d: 2.6 }); S('crackle', .1, { d: 2.4 }); S('printer', 1.3, { d: 1.2 });
  S('cloth', T.leverUp); S('lever', T.leverDn + .1); S('portalOpen', T.burst); S('impact', T.burst); S('portalHum', T.burst + .1, { d: 16.15 - T.burst - .1 });
  S('boing', T.burst + .1, { v: .6 }); S('slam', T.title[0]);
  S('whoosh', T.ticket[0]); S('slap', T.ticket[1]);
  S('thump', T.shakeN, { v: .6 }); S('rumble', T.rumble, { d: T.rush[0] - T.rumble });
  S('whooshBig', T.rush[0] - .05); S('paperStorm', 16.15, { d: 2.5 });
  S('glorp', T.spitB); S('squish', T.landB); S('paperBurp', T.burp);
  S('blip', 18.95, { v: .5 });
  S('ding', T.ding); S('suck', T.suck[0], { d: T.suck[1] - T.suck[0] }); S('swirl', T.wipe[0] - .05);
  S('tap', T.tap1); S('kaching', T.tap1 + .3); S('tap', T.tap2); S('notif', T.bubble); S('gulp', T.gulp); S('coins', T.coins[0]);
  S('paperSuck', T.papersIn[0], { d: T.papersIn[1] - T.papersIn[0] }); S('fold', T.fold[1]);
  S('portalOpen', T.reopen, { v: .8 }); S('impact', T.reopen, { v: .6 }); S('pop', T.tecPop); S('lever', T.lever2[0] + .1);
  S('horn', T.close[0]); S('fwump', T.close[0] + .05); S('slam', T.end, { v: .9 }); S('boing', T.end + 1.7, { v: .5 });
  for (const p of PUNCH) S('punch', p, { v: .5 });
  add('meta', 0, { off: OFF, fz: FZ, rw: RW });
  return ev.sort((a, b) => a.t - b.t);
}

window.render = render; window.DUR = DUR_ALL; window.EV = events(); window.SUBS = SUBS; window.T = T;
for (const f of ['800 60px "Baloo 2"', '700 30px "Baloo 2"', '400 60px "Lilita One"', '400 40px VT323']) await document.fonts.load(f);
render(parseFloat(new URLSearchParams(location.search).get('t') ?? '2.5'));
window.READY = true;
