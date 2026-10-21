// chars.js — el reparto: Paco (dueño del bar, impasible), Nuria (su sobrina, nerviosa), el técnico,
// el bicho del trimestre, el TPV viejo y el móvil con Klimafacturas.
// Coordenadas locales: origen en los pies, y hacia abajo; face = 1 mira a la derecha (3/4), −1 espejo.
// Ojos, bocas, manos y extremidades «fideo» siguen la técnica del estilo Sci-Fi Sitcom Toon de Lemo-Opuscar.
import { clamp, lerp, hash, TAU } from '/core/lib.js';
import { INK, push, pop, translate, rotate, scale, shape, fillOnly, stroke, ell, arc, spline, rr, rect, noodle, quad, dot, text } from './toon.js';

export const PAL = {
  white: '#ffffff', mouthIn: '#4a1a2a', tongue: '#e8637a',
  // Paco
  skinP: '#eab48c', skinPs: '#c98d64', shirt: '#f6f1e7', shirtS: '#d9d0c0', apron: '#2f3d63', apronS: '#222c4a', bow: '#d23a44', bowS: '#a52731',
  stache: '#4a2e22', hairP: '#8a7a70', pants: '#3a3340', shoe: '#2a2026',
  // Nuria
  skinN: '#b97a4f', skinNs: '#955c36', hood: '#f08a24', hoodS: '#c76a14', jeans: '#3b4f8a', jeansS: '#2c3b69', hairN: '#2a1d1d',
  glass: '#d0343a', lens: '#e3f6ff', pack: '#2f7f86', packS: '#21595e', sneak: '#f4f1ea', sneakS: '#cfc8bb',
  // técnico
  skinT: '#d9a27a', cap: '#2d5fb3', capS: '#204683',
  // marca
  vino: '#3a0f1e', papel: '#f2ebe3', rojo: '#b8285f', tinta: '#1d1013',
  // portal: el único brillo
  glow: '#3ff0e0', glowL: '#a6fff6', glowD: '#13b5a9',
};

// —— piezas de la cara ——
export function eye(cx, cy, rx, ry, { lid = 0, look = [0, 0], pupil = 4.5, skin = PAL.skinP, closed = false, lw = 6, jitter = 0, lower = 0 } = {}) {
  if (closed) { stroke(arc(cx, cy + ry * .15, rx * .8, ry * .45, Math.PI * .1, Math.PI * .9, 14), lw); return; }
  shape(ell(cx, cy, rx, ry, 36), {
    fill: PAL.white, lw, shade: () => {
      dot(cx + look[0] * rx * .55 + jitter, cy + look[1] * ry * .5, pupil);
      if (lid > 0) {
        const yl = cy - ry + lid * 2 * ry;
        fillOnly([[cx - rx * 1.3, cy - ry * 1.4], [cx + rx * 1.3, cy - ry * 1.4], [cx + rx * 1.3, yl], [cx - rx * 1.3, yl + ry * .08]], skin, { boil: .5 });
        stroke([[cx - rx * 1.2, yl + ry * .08], [cx + rx * 1.2, yl]], lw);
      }
      if (lower > 0) { const yb = cy + ry - lower * 2 * ry; fillOnly([[cx - rx * 1.3, yb], [cx + rx * 1.3, yb], [cx + rx * 1.3, cy + ry * 1.4], [cx - rx * 1.3, cy + ry * 1.4]], skin, { boil: .5 }); }
    }
  });
}
export function mouth(cx, cy, mw, { o = 0, w = 1, sm = 0, skew = 0, lw = 6, teeth = true, tongue = true } = {}) {
  const hw = mw * w / 2, k = mw * .22, lc = [cx - hw, cy - sm * k + skew * k], rc = [cx + hw, cy - sm * k - skew * k];
  if (o < .07) { stroke(quad(lc, [cx, cy + sm * k * 1.2], rc, 12), lw); return; }
  const h = o * mw * .62;
  const up = quad(lc, [cx, cy - h * .25 + sm * k * .4], rc, 12), dn = quad(rc, [cx, cy + h + sm * k * .6], lc, 14);
  shape([...up, ...dn], {
    fill: PAL.mouthIn, lw, shade: () => {
      if (teeth && o > .22) fillOnly(rect(cx - hw * 1.2, cy - h, hw * 2.4, h * .32 + 6), PAL.white, { boil: .3 });
      if (tongue) fillOnly(ell(cx + hw * .15, cy + h * .95, hw * .6, h * .45, 20), PAL.tongue, { boil: .3 });
    }
  });
}
export function hand(x, y, ang, r = 21, col = PAL.skinP, { fist = false, lw = 6 } = {}) {
  push(); translate(x, y); rotate(ang);
  const pts = fist ? spline([[-r * .6, -r * .8], [r * .7, -r * .9], [r * 1.1, -r * .1], [r * .8, r * .8], [-r * .5, r * .9], [-r * .9, 0]])
    : spline([[-r * .5, -r * .85], [r * .5, -r * 1.05], [r * 1.35, -r * .75], [r * 1.05, -r * .3], [r * 1.5, -r * .1], [r * 1.1, r * .3], [r * 1.35, r * .7], [r * .6, r * .95], [-r * .6, r * .8], [-r * .95, 0]]);
  shape(pts, { fill: col, lw });
  stroke([[r * .2, -r * .15], [r * .75, -r * .45]], lw * .6);
  pop();
}
export const sweat = (x, y, s = 1) => shape(spline([[x, y - 16 * s], [x + 9 * s, y + 4 * s], [x, y + 12 * s], [x - 9 * s, y + 4 * s]]), { fill: '#bfe9ff', lw: 5 });

// —— el logo de Klimafacturas, dibujado con la misma línea (unidades del SVG: 64) ——
export function kMark(x, y, s, { sparkle = 1 } = {}) {
  push(); translate(x, y); scale(s / 64);
  shape(rr(0, 0, 64, 64, 18), { fill: "#1a1216", lw: 6 });
  shape([[19, 16], [26, 16], [26, 29.6], [38.2, 16], [47.4, 16], [34.6, 30.2], [47.6, 48], [38.4, 48], [29.52, 35.83], [26, 39.74], [26, 48], [19, 48]], { fill: '#fbf6f2', line: null, boil: .4 });
  if (sparkle) { const c = [51.8, 12.2], r = 6.1 * sparkle; shape([[c[0], c[1] - r], [c[0] + r * .23, c[1] - r * .23], [c[0] + r * .77, c[1]], [c[0] + r * .23, c[1] + r * .23], [c[0], c[1] + r], [c[0] - r * .23, c[1] + r * .23], [c[0] - r * .77, c[1]], [c[0] - r * .23, c[1] - r * .23]], { fill: '#c9407a', line: null, boil: .3 }); }
  pop();
}

// —— brazo genérico: hombro → mano, con manga ——
function arm(sh, a, sleeve, sleeveS, skin, w0 = 44, w1 = 36, hr = 21) {
  const hp = [sh[0] + a.h[0], sh[1] + a.h[1]];
  shape(noodle(sh, hp, a.bend ?? 0, w0, w1), { fill: sleeve, lw: 7 });
  const ang = Math.atan2(hp[1] - sh[1], hp[0] - sh[0]);
  if (a.hand !== false) hand(hp[0] + Math.cos(ang) * 6, hp[1] + Math.sin(ang) * 6, ang, hr, skin, { fist: !!a.fist });
  return [hp, ang];
}

// ———————————————— PACO ————————————————
// P: {x,y,s,face,lean,bob,sq,lid,look,brow,mouth,blink,armR,armL,headTilt,sweat,holdR}
export function paco(P) {
  const f = P.face ?? 1, s = P.s ?? 1;
  push(); translate(P.x, P.y + (P.bob || 0)); scale(s * f, s * (P.sq ?? 1));
  for (const sx of [-1, 1]) {
    const hip = [sx * 40, -150], ank = [sx * 46, -26];
    shape(noodle(hip, ank, 0, 66, 58), { fill: PAL.pants, lw: 7 });
    shape(spline([[ank[0] - 40, ank[1] + 26], [ank[0] - 34, ank[1]], [ank[0] + 20, ank[1] - 4], [ank[0] + 56, ank[1] + 12], [ank[0] + 50, ank[1] + 28]]), { fill: PAL.shoe, lw: 7 });
  }
  push(); rotate(P.lean ?? 0);
  const shB = [-112, -392], shF = [104, -392];
  const aB = P.armL || { h: [-30, 190], bend: -24 }, aF = P.armR || { h: [36, 186], bend: 24 };
  arm(shB, aB, PAL.shirt, PAL.shirtS, PAL.skinP, 50, 42, 24);
  // cuerpo de barril
  shape(spline([[0, -440], [96, -420], [146, -330], [150, -220], [118, -140], [0, -118], [-118, -140], [-150, -220], [-146, -330], [-96, -420]]), {
    fill: PAL.shirt, lw: 7, shade: () => {
      fillOnly(spline([[60, -440], [170, -330], [160, -150], [80, -110], [120, -260]]), PAL.shirtS, { boil: .4 });
      // delantal largo
      fillOnly(spline([[-92, -330], [92, -330], [112, -200], [104, -40], [-104, -40], [-112, -200]]), PAL.apron, { boil: .4 });
      fillOnly(spline([[40, -330], [92, -330], [112, -200], [104, -40], [60, -40], [70, -200]]), PAL.apronS, { boil: .4 });
    }
  });
  shape(spline([[-104, -150], [104, -150], [100, -40], [-100, -40]]), { fill: PAL.apron, lw: 6, shade: () => fillOnly(rect(30, -160, 90, 130), PAL.apronS, { boil: .3 }) });
  stroke([[-92, -330], [-112, -200], [-104, -150]], 6); stroke([[92, -330], [112, -200], [104, -150]], 6);
  shape(rr(-46, -260, 92, 64, 10), { fill: PAL.apronS, lw: 5 });                       // bolsillo
  stroke([[-30, -246], [-10, -232]], 4, { line: '#f6f1e7' });                           // boli en el bolsillo
  // cabeza
  push(); translate(8, -540); rotate(P.headTilt ?? .04);
  headPaco(P);
  pop();
  // pajarita gigante (tan grande como su cabeza)
  push(); translate(4, -430); rotate((P.bowTilt || 0) + .04);
  shape([[0, 0], [-120, -62], [-138, 0], [-118, 64]], { fill: PAL.bow, lw: 7, shade: () => fillOnly([[-60, 10], [-140, 30], [-140, 80]], PAL.bowS, { boil: .3 }) });
  shape([[0, 0], [120, -62], [138, 0], [118, 64]], { fill: PAL.bow, lw: 7, shade: () => fillOnly([[60, 10], [140, 30], [140, 80]], PAL.bowS, { boil: .3 }) });
  shape(rr(-26, -30, 52, 60, 14), { fill: PAL.bow, lw: 7 });
  pop();
  const [hpF, angF] = arm(shF, aF, PAL.shirt, PAL.shirtS, PAL.skinP, 50, 42, 24);
  if (P.holdR === 'coins') for (let i = 0; i < 3; i++) coin(hpF[0] + 10 + i * 14, hpF[1] - 30 - i * 8, 18);
  pop();
  if (P.sweat != null) { const u = P.sweat % 1; sweat(-120, -640 + u * 40, 1.2); sweat(140, -620 + ((u + .5) % 1) * 40, 1); }
  pop();
}
function headPaco(P) {
  for (const sx of [-1, 1]) shape(ell(sx * 102, 12, 20, 28, 18), { fill: PAL.skinP, lw: 6, shade: () => fillOnly(ell(sx * 98, 14, 8, 15, 12), PAL.skinPs, { boil: .3 }) });
  shape(spline([[0, -112], [70, -100], [104, -40], [106, 40], [80, 100], [0, 118], [-80, 100], [-106, 40], [-104, -40], [-70, -100]]), {
    fill: PAL.skinP, lw: 7, shade: () => {
      fillOnly(spline([[40, -120], [120, -40], [120, 120], [30, 130], [80, 40]]), PAL.skinPs, { boil: .4 });
      fillOnly(ell(-36, -84, 26, 12, 14), 'rgba(255,255,255,.45)', { boil: .3 });      // brillo de la calva
      for (const sx of [-1, 1]) fillOnly(spline([[sx * 112, -50], [sx * 80, -36], [sx * 76, 20], [sx * 118, 30]]), PAL.hairP, { boil: .4 });
    }
  });
  const lid = P.blink ? 1 : clamp(P.lid ?? .5, 0, 1), look = P.look || [0, 0];
  eye(-34, -14, 30, 32, { lid, look, pupil: 5 });
  eye(36, -14, 30, 32, { lid, look, pupil: 5 });
  for (const ex of [-34, 36]) stroke(arc(ex, 24, 22, 8, Math.PI * .15, Math.PI * .85, 10), 4);   // ojeras
  const br = P.brow ?? 0;
  for (const sx of [-1, 1]) shape(spline([[sx * 8, -62 - br * 6], [sx * 40, -70 - br * 14], [sx * 70, -62 - br * 4 + (P.browAng || 0) * sx * 10], [sx * 66, -50 - br * 4], [sx * 36, -56 - br * 12], [sx * 8, -50 - br * 6]]), { fill: PAL.stache, lw: 5 });
  shape(spline([[-6, -8], [14, 30], [22, 44], [0, 52], [-22, 44], [-14, 30]]), { fill: PAL.skinP, lw: 6, shade: () => fillOnly(ell(8, 46, 14, 8, 12), PAL.skinPs, { boil: .3 }) });
  const m = P.mouth || {};
  mouth(0, 84, 58, { o: m.o || 0, w: m.w ?? 1, sm: m.sm ?? -.3, skew: m.skew || 0, lw: 6 });
  // bigote enorme
  const up = (m.o || 0) * 6;
  shape(spline([[0, 52], [40, 50], [92, 62], [118, 86], [86, 80], [44, 74 - up], [0, 70 - up], [-44, 74 - up], [-86, 80], [-118, 86], [-92, 62], [-40, 50]]), { fill: PAL.stache, lw: 6, shade: () => fillOnly(rect(20, 40, 120, 60), '#3a2219', { boil: .3 }) });
}
export function coin(x, y, r = 18) { shape(ell(x, y, r, r * .92, 18), { fill: '#f2c14e', lw: 5, shade: () => fillOnly(ell(x + r * .3, y + r * .2, r * .6, r * .6, 12), '#d39a2c', { boil: .3 }) }); text('€', x, y + 1, { font: `800 ${Math.round(r * 1.2)}px "Baloo 2"`, fill: INK }); }

// ———————————————— NURIA ————————————————
export function nuria(P) {
  const f = P.face ?? 1, s = P.s ?? 1, ner = P.nerv ?? 0;
  const jit = ner ? (hash(Math.floor((P.t || 0) * 12) * 3.3) - .5) * 8 * ner : 0;
  push(); translate(P.x + jit, P.y + (P.bob || 0)); scale(s * f, s * (P.sq ?? 1));
  for (const sx of [-1, 1]) {
    const hip = [sx * 26, -250], ank = [sx * 30, -26];
    shape(noodle(hip, ank, sx * -4, 46, 40), { fill: PAL.jeans, lw: 7, shade: () => fillOnly(rect(sx > 0 ? 10 : -300, -300, 300, 300), PAL.jeansS, { boil: .3 }) });
    shape(spline([[ank[0] - 30, ank[1] + 26], [ank[0] - 26, ank[1] - 2], [ank[0] + 16, ank[1] - 4], [ank[0] + 48, ank[1] + 12], [ank[0] + 42, ank[1] + 28]]), { fill: PAL.sneak, lw: 7, shade: () => fillOnly(rect(ank[0] - 40, ank[1] + 16, 100, 20), PAL.sneakS, { boil: .3 }) });
  }
  push(); rotate(P.lean ?? 0);
  const shB = [-62, -440], shF = [58, -440];
  const aB = P.armL || { h: [-16, 170], bend: -16 }, aF = P.armR || { h: [16, 170], bend: 16 };
  const [hpB, angB] = arm(shB, aB, PAL.hood, PAL.hoodS, PAL.skinN, 36, 30, 17);
  // sudadera
  shape(spline([[0, -470], [62, -452], [80, -360], [74, -250], [0, -236], [-74, -250], [-80, -360], [-62, -452]]), {
    fill: PAL.hood, lw: 7, shade: () => {
      fillOnly(spline([[30, -480], [100, -360], [90, -230], [50, -230], [60, -360]]), PAL.hoodS, { boil: .4 });
      fillOnly(rr(-40, -330, 80, 46, 14), PAL.hoodS, { boil: .3 });                    // bolsillo canguro
    }
  });
  stroke([[-14, -462], [-18, -410]], 4); stroke([[14, -462], [18, -410]], 4);          // cordones
  // riñonera con cables
  shape(rr(-70, -282, 140, 52, 18), { fill: PAL.pack, lw: 6, shade: () => fillOnly(rect(20, -290, 70, 70), PAL.packS, { boil: .3 }) });
  stroke([[-60, -256], [60, -256]], 4);
  stroke(spline([[48, -246], [78, -226], [66, -196], [92, -180], [80, -150]], false), 4, { line: '#e8392b' });
  stroke(spline([[30, -236], [44, -206], [24, -186], [40, -160]], false), 4, { line: '#f2c14e' });
  // cabeza
  push(); translate(0, -560); rotate(P.headTilt ?? 0);
  headNuria(P, ner);
  pop();
  const [hpF, angF] = arm(shF, aF, PAL.hood, PAL.hoodS, PAL.skinN, 36, 30, 17);
  if (P.holdR === 'phone') phone(hpF[0] + 6, hpF[1] - 70, P.phoneS ?? .55, P.phoneA ?? 0, P.phoneP || {});
  pop();
  if (P.sweat != null) { const u = P.sweat % 1; sweat(-90, -680 + u * 40, 1); sweat(96, -660 + ((u + .5) % 1) * 40, .8); }
  pop();
}
function headNuria(P, ner) {
  // coleta disparada hacia arriba (detrás de la cabeza)
  const sw = Math.sin((P.t || 0) * 5) * 8 * (1 + ner);
  shape(spline([[-20, -70], [-46, -150], [-30 + sw, -230], [20 + sw, -270], [70 + sw, -250], [40 + sw, -220], [10, -170], [24, -80]]), { fill: PAL.hairN, lw: 7 });
  shape(rr(-30, -96, 56, 26, 10), { fill: '#f2c14e', lw: 5 });                          // gomilla
  for (const sx of [-1, 1]) shape(ell(sx * 76, 10, 14, 20, 16), { fill: PAL.skinN, lw: 6 });
  shape(ell(0, 0, 80, 86, 50), { fill: PAL.skinN, lw: 7, shade: () => { fillOnly(ell(44, 28, 50, 64, 30), PAL.skinNs, { boil: .3 }); fillOnly(spline([[-90, -30], [-60, -92], [20, -104], [86, -60], [90, -20], [40, -54], [-30, -60]]), PAL.hairN, { boil: .4 }); } });
  const br = P.brow ?? 1;
  stroke([[-62, -44 + br * 2], [-22, -54 - br * 8]], 7); stroke([[62, -44 + br * 2], [22, -54 - br * 8]], 7);
  const look = P.look || [0, 0], shake = ner ? (hash(Math.floor((P.t || 0) * 24) * 1.7) - .5) * 3 * ner : 0;
  for (const ex of [-36, 36]) {
    shape(ell(ex, 4, 34, 34, 32), { fill: PAL.lens, lw: 8, line: PAL.glass });
    eye(ex, 4, 24 * (P.eyeS ?? 1), 25 * (P.eyeS ?? 1), { lid: P.blink ? 1 : (P.lid ?? 0), look, pupil: P.pupil ?? 3.8, skin: PAL.lens, jitter: shake, lw: 5 });
    shape(ell(ex, 4, 34, 34, 32), { line: PAL.glass, lw: 8 });
    stroke(arc(ex - 10, -6, 16, 16, Math.PI * 1.1, Math.PI * 1.45, 6), 4, { line: '#ffffff' });
  }
  stroke([[-4, 2], [4, 2]], 7, { line: PAL.glass });
  shape(ell(0, 40, 9, 7, 12), { fill: PAL.skinNs, lw: 5 });
  const m = P.mouth || {};
  mouth(0, 62, 40 * (P.mouthS ?? 1), { o: m.o || 0, w: m.w ?? 1, sm: m.sm ?? -.4, skew: m.skew || 0, lw: 5 });
}

// ———————————————— EL TÉCNICO (solo asoma por el portal) ————————————————
export function tecnico(x, y, s, P = {}) {
  push(); translate(x, y); scale(s); rotate(P.tilt || 0);
  shape(spline([[-110, 80], [-90, 20], [0, 4], [90, 20], [110, 80]]), { fill: '#5b6b7d', lw: 7 });       // mono de trabajo
  shape(ell(0, -60, 76, 80, 40), { fill: PAL.skinT, lw: 7, shade: () => { fillOnly(ell(36, -40, 46, 62, 24), '#b98258', { boil: .3 }); for (let i = 0; i < 20; i++) dot(-40 + hash(i * 3.1) * 90, -20 + hash(i * 7.7) * 36, 1.8, '#9c7050'); } });
  // gorra hacia atrás
  shape(spline([[-80, -96], [-50, -150], [30, -158], [80, -110], [70, -90], [-70, -84]]), { fill: PAL.cap, lw: 7, shade: () => fillOnly(rect(20, -170, 80, 90), PAL.capS, { boil: .3 }) });
  shape(spline([[-76, -100], [-130, -96], [-136, -82], [-74, -84]]), { fill: PAL.capS, lw: 6 });
  // destornillador en la oreja
  shape(ell(76, -60, 13, 18, 14), { fill: PAL.skinT, lw: 5 });
  shape(rr(70, -120, 18, 46, 6), { fill: '#e8392b', lw: 5 }); stroke([[79, -74], [79, -40]], 5, { line: '#9aa3ad' });
  eye(-26, -66, 20, 22, { look: P.look || [.3, 0], skin: PAL.skinT, lid: .1 });
  eye(26, -66, 20, 22, { look: P.look || [.3, 0], skin: PAL.skinT, lid: .1 });
  stroke([[-44, -98], [-10, -102]], 6); stroke([[44, -98], [10, -102]], 6);
  shape(ell(0, -36, 10, 8, 12), { fill: '#b98258', lw: 5 });
  const m = P.mouth || {};
  mouth(0, -10, 44, { o: m.o || 0, w: m.w ?? 1, sm: m.sm ?? .6, lw: 5 });
  pop();
}

// ———————————————— EL BICHO DEL TRIMESTRE ————————————————
// bola de facturas arrugadas: asquerosa y adorable. fold: 0 bicho → 1 carpeta ordenada
export function bicho(x, y, s, t, { look = [0, 0], blink = false, o = 0, fold = 0, happy = 0, bubble = 0 } = {}) {
  push(); translate(x, y); scale(s);
  const R = 140, pts = [];
  for (let i = 0; i < 18; i++) { const a = i / 18 * TAU, k = 1 + (hash(i * 4.1) - .5) * .32 + Math.sin(t * 4 + i) * .02; pts.push([Math.cos(a) * R * k, -R + Math.sin(a) * R * .9 * k]); }
  const folder = rr(-150, -230, 300, 220, 22).map(p => [p[0], p[1]]);
  const body = fold < 1 ? pts.map((p, i) => { const q = folder[Math.floor(i / 18 * folder.length)]; return [lerp(p[0], q[0], fold), lerp(p[1], q[1], fold)]; }) : folder;
  shape(fold > 0 ? body : spline(body), {
    fill: fold > .5 ? PAL.rojo : '#f4f1e6', lw: 7, shade: () => {
      if (fold < .5) {
        for (let i = 0; i < 6; i++) { const a = hash(i * 2.3) * TAU; fillOnly([[0, -R], [Math.cos(a) * 200, -R + Math.sin(a) * 200], [Math.cos(a + .35) * 200, -R + Math.sin(a + .35) * 200]], '#d8d2c2', { boil: .3 }); }
        for (let i = 0; i < 7; i++) fillOnly(rect(-110 + hash(i) * 40, -230 + i * 30, 120 + hash(i + 3) * 80, 6), '#b9b2a2', { boil: .2 });
      } else {
        fillOnly(rect(-160, -250, 320, 46), '#8f1d48', { boil: .3 });
      }
    }
  });
  if (fold < .5) {
    // sellos rojos y hojas que le cuelgan como babas
    push(); translate(-70, -70); rotate(-.25); shape(rr(-50, -18, 100, 36, 6), { fill: 'rgba(0,0,0,0)', line: '#c23b3b', lw: 5 }); text('PENDIENTE', 0, 2, { font: '800 18px "Baloo 2"', fill: '#c23b3b' }); pop();
    const dr = Math.sin(t * 3) * 6;
    shape([[-20, -40], [30, -40], [36, 30 + dr], [-14, 34 + dr]], { fill: '#fbf8ef', lw: 5 });
    eye(-46, -170, 34, 40, { look, lid: blink ? 1 : 0, skin: '#f4f1e6', pupil: 6, lw: 6 });
    eye(46, -170, 34, 40, { look, lid: blink ? 1 : 0, skin: '#f4f1e6', pupil: 6, lw: 6 });
    mouth(0, -92, 70, { o: .25 + o, sm: happy ? .9 : -.2, lw: 6, teeth: false });
    for (const sx of [-1, 1]) shape(noodle([sx * 120, -120], [sx * 170, -70 - Math.sin(t * 6 + sx) * 14], sx * 10, 26, 20), { fill: '#f4f1e6', lw: 6 });
  } else {
    text('1T 2026', 0, -180, { font: '800 44px "Baloo 2"', fill: '#fff' });
    text('Todo al día', 0, -110, { font: '700 30px "Baloo 2"', fill: '#ffd9e6' });
    // ojitos felices en la carpeta
    stroke(arc(-40, -60, 16, 12, Math.PI * 1.1, Math.PI * 1.9, 10), 6, { line: '#fff' }); stroke(arc(40, -60, 16, 12, Math.PI * 1.1, Math.PI * 1.9, 10), 6, { line: '#fff' });
  }
  if (bubble > 0) {
    push(); translate(40, -460); scale(bubble);
    shape(rr(-150, -60, 300, 110, 24), { fill: '#fff', lw: 6 }); shape([[-40, 46], [-10, 46], [-50, 86]], { fill: '#fff', lw: 6 });
    kMark(-130, -44, 56);
    text('Recordatorio:', 40, -24, { font: '800 26px "Baloo 2"', fill: INK });
    text('FAC-0042, 1.355,20 €', 40, 10, { font: '700 22px "Baloo 2"', fill: '#5a4a52' });
    pop();
  }
  pop();
}

// ———————————————— EL TPV VIEJO ————————————————
export function tpv(x, y, s, t, { frozen = 0, smoke = 0, screen = 'menu', paper = 0 } = {}) {
  push(); translate(x, y); scale(s);
  // caja registradora beige
  shape(spline([[-150, 0], [-140, -110], [140, -110], [150, 0]]), { fill: '#d6ccb2', lw: 7, shade: () => { fillOnly(rect(60, -120, 120, 130), '#bdb297', { boil: .3 }); for (let r = 0; r < 2; r++) for (let c = 0; c < 6; c++) fillOnly(rr(-120 + c * 34, -92 + r * 34, 26, 24, 5), '#9e9479', { boil: .2 }); } });
  // impresora con el rollo que se escapa
  shape(rr(70, -150, 70, 44, 8), { fill: '#b6aa8d', lw: 6 });
  if (paper > 0) shape(spline([[86, -150], [122, -150], [130, -150 - 60 * paper], [100, -150 - 120 * paper], [120, -150 - 170 * paper], [92, -150 - 160 * paper], [74, -150 - 110 * paper], [92, -150 - 60 * paper]]), { fill: '#fbf8ef', lw: 5 });
  // monitor de tubo
  push(); translate(-30, -110);
  shape(rr(-30, -24, 60, 30, 6), { fill: '#bdb297', lw: 6 });
  shape(rr(-130, -230, 260, 210, 26), { fill: '#e0d6bc', lw: 7, shade: () => fillOnly(rect(80, -240, 80, 230), '#c4b99c', { boil: .3 }) });
  const scr = rr(-104, -206, 208, 150, 18);
  shape(scr, {
    fill: screen === 'menu' ? '#0b2a8a' : '#06104a', lw: 6, shade: () => {
      if (screen === 'menu') { for (let i = 0; i < 6; i++) fillOnly(rr(-90 + (i % 3) * 64, -192 + Math.floor(i / 3) * 56, 56, 46, 4), ['#f4d03f', '#5bc0de', '#5cb85c', '#f0ad4e', '#e78fb3', '#d40000'][i], { boil: .2 }); }
      if (frozen > 0) {
        fillOnly(rect(-90, -170, 180, 80), '#c3c3c3', { boil: .2 });
        fillOnly(rect(-90, -170, 180, 18), '#0a246a', { boil: .2 });
      }
    }
  });
  if (frozen > 0) {
    text('NO RESPONDE', 0, -122, { font: '400 30px VT323', fill: '#000' });
    // ojos pixelados de cacharro enfadado
    const k = Math.floor(t * 6) % 2;
    text('x', -50, -150 + k, { font: '400 22px VT323', fill: '#d40000' }); text('x', 50, -150 + k, { font: '400 22px VT323', fill: '#d40000' });
  }
  // antena con cinta
  stroke(spline([[90, -230], [104, -280], [94, -320], [110, -350]], false), 5);
  shape(rr(88, -296, 26, 14, 3), { fill: '#f3e27a', lw: 4 });
  pop();
  // humo
  if (smoke > 0) for (let i = 0; i < 4; i++) { const u = (t * .7 + i / 4) % 1, a = smoke * (1 - u); if (a < .05) continue; shape(ell(-60 + i * 24 + Math.sin(u * 6 + i) * 20, -360 - u * 240, 30 + u * 40, 26 + u * 34, 18), { fill: `rgba(120,110,104,${a * .8})`, lw: 5, line: `rgba(42,22,48,${a})` }); }
  pop();
}

// ———————————————— EL MÓVIL ————————————————
// mode: 'apagado' | 'portal' | 'cobro' | 'deben' | 'gestoria' ; u = progreso dentro de la pantalla
export function phone(x, y, s, a = 0, { mode = 'apagado', u = 0, glow = 0, t = 0, off = 0 } = {}) {
  push(); translate(x, y); rotate(a); scale(s);
  shape(rr(-170, -330, 340, 660, 54), { fill: '#1d1013', lw: 8 });
  const S = rr(-150, -306, 300, 612, 40);
  shape(S, { fill: mode === 'apagado' ? '#2b2228' : mode === 'portal' ? PAL.glow : '#fbf8f4', lw: 5, shade: () => screenUI(mode, u, t, off) });
  shape(rr(-44, -300, 88, 22, 11), { fill: '#000', line: null, boil: 0 });
  pop();
}
function chip(x, y, w, label, bg, fg) { shape(rr(x, y, w, 44, 22), { fill: bg, lw: 4 }); text(label, x + w / 2, y + 23, { font: '800 22px "Baloo 2"', fill: fg }); }
function screenUI(mode, u, t, off) {
  if (mode === 'apagado') return;
  if (mode === 'portal') {   // el portal, ya dentro de la pantalla, sigue girando
    for (let k = 0; k < 5; k++) {
      const p1 = [], p2 = [];
      for (let j = 0; j <= 22; j++) { const v = j / 22, r = 290 * (1 - v), a = k / 5 * TAU + v * 3.6 + t * 4; p1.push([Math.cos(a) * r * .5, Math.sin(a) * r]); const a2 = a + .55 * (1 - v * .7); p2.push([Math.cos(a2) * r * .5, Math.sin(a2) * r]); }
      fillOnly([...p1, ...p2.reverse()], k % 2 ? PAL.glowL : PAL.glowD, { boil: .4 });
    }
    fillOnly(ell(0, 0, 50, 70, 20), '#ffffff', { boil: .5 });
    return;
  }
  kMark(-130, -270, 54);
  text('Klimafacturas', -64, -243, { font: '800 30px "Baloo 2"', fill: PAL.tinta, align: 'left' });
  if (mode === 'cobro') {
    text('Mesa 4', -130, -170, { font: '700 26px "Baloo 2"', fill: '#7b6970', align: 'left' });
    text('24,50 €', -130, -110, { font: '800 74px "Baloo 2"', fill: PAL.tinta, align: 'left' });
    if (off) chip(-130, -40, 210, 'Sin conexión', '#f6dbe5', PAL.rojo); else chip(-130, -40, 160, 'En línea', '#dceee0', '#23663b');
    const press = u > .35 && u < .45 ? .96 : 1;
    push(); translate(0, 120); scale(press); shape(rr(-130, -40, 260, 80, 40), { fill: PAL.tinta, lw: 5 }); text('Cobrar', 0, 2, { font: '800 32px "Baloo 2"', fill: '#fff' }); pop();
    if (u > .45) {
      const k = Math.min(1, (u - .45) / .12);
      push(); translate(0, 150); scale(.6 + .4 * k); shape(rr(-140, -100, 280, 200, 30), { fill: PAL.vino, lw: 6 }); text('¡Cobrado!', 0, -26, { font: '800 50px "Baloo 2"', fill: '#fff' }); text(off ? 'Se registra al volver la red' : 'Ticket listo', 0, 34, { font: '700 21px "Baloo 2"', fill: '#f2b3c8' }); pop();
    }
  } else if (mode === 'deben') {
    text('Te deben', -130, -170, { font: '700 28px "Baloo 2"', fill: '#7b6970', align: 'left' });
    text('1.677,50 €', -130, -112, { font: '800 60px "Baloo 2"', fill: PAL.tinta, align: 'left' });
    [['Talleres del Norte', '32 días'], ['Café Central', '18 días'], ['Óptica Navarro', '9 días']].forEach(([n, d], i) => {
      const y = -40 + i * 66; stroke([[-130, y + 30], [130, y + 30]], 3, { line: '#e5d9d0' });
      text(n, -130, y, { font: '700 25px "Baloo 2"', fill: PAL.tinta, align: 'left' }); text(d, 130, y, { font: '700 23px "Baloo 2"', fill: '#7b6970', align: 'right' });
    });
    const press = u > .4 && u < .5 ? .95 : 1;
    push(); translate(0, 210); scale(press); shape(rr(-130, -38, 260, 76, 38), { fill: PAL.rojo, lw: 5 }); text('Recordar', 0, 2, { font: '800 30px "Baloo 2"', fill: '#fff' }); pop();
    if (u > .5) { const k = Math.min(1, (u - .5) / .1); push(); translate(0, -250 + 40 * (1 - k)); shape(rr(-140, -36, 280, 72, 24), { fill: PAL.tinta, lw: 5 }); text('Recordatorio enviado', 0, 2, { font: '800 24px "Baloo 2"', fill: '#fff' }); pop(); }
  } else if (mode === 'gestoria') {
    text('Tu gestoría', -130, -170, { font: '800 40px "Baloo 2"', fill: PAL.tinta, align: 'left' });
    text('Acceso de solo lectura', -130, -126, { font: '700 22px "Baloo 2"', fill: '#7b6970', align: 'left' });
    ['Facturas emitidas', 'Gastos', 'Libro diario', 'Modelo 303'].forEach((n, i) => {
      const y = -60 + i * 70, on = u > .15 + i * .15;
      shape(rr(-130, y - 26, 260, 56, 16), { fill: on ? '#f6dbe5' : '#efe6df', lw: 4 });
      text(n, -110, y + 2, { font: '700 24px "Baloo 2"', fill: PAL.tinta, align: 'left' });
      if (on) text('✓', 108, 2 + y, { font: '800 30px "Baloo 2"', fill: PAL.rojo, align: 'right' });
    });
  }
}
