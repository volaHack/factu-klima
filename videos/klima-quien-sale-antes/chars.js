// Los muñecos: una sola construcción de judía (cuerpo-cabeza, brazos cortos con manopla, pies), y cada personaje
// se distingue por su color, una prenda y un rasgo de pelo. Coordenadas locales: base en (0,0), cabeza hasta y = −380.
import { K, ellipse, rr, clamp, lerp } from './kit.js';

const BW = 300, BH = 380, R = BW / 2;
const HAIR = { lucia: '#3A2230', javier: '#2B1E16', host: '#2B1E16' };
const BLUSH = { lucia: '#FF4F8E', javier: '#FF9DB5', host: '#FF9F6E', crowd: '#FF9DB5' };

export function beanPath(g) {
  g.beginPath();
  g.moveTo(-R, -BH * .42);
  g.bezierCurveTo(-R, -BH * .84, -R * .6, -BH, 0, -BH);
  g.bezierCurveTo(R * .6, -BH, R, -BH * .84, R, -BH * .42);
  g.bezierCurveTo(R, -BH * .06, R * .8, 0, 0, 0);
  g.bezierCurveTo(-R * .8, 0, -R, -BH * .06, -R, -BH * .42);
  g.closePath();
}

// postura por defecto de las manos (locales)
const ARMS = {
  down: [[-178, -110], [178, -110]], up: [[-190, -440], [190, -440]], hips: [[-175, -150], [175, -150]],
  shrug: [[-210, -235], [210, -235]],
};

/**
 * o: { who, color, s (escala), sq (estirar + / aplastar −), lean, L, R (manos [x,y] locales), propL, propR,
 *      eyes: open|happy|closed|wide|tired|wink|shock, look [dx,dy], mouth 0..1, shape smile|flat|frown|o|grin,
 *      brows: none|worried|angry|up, sweat 0..1, blush, lw (contorno en px de pantalla), name }
 */
export function bean(g, x, y, o) {
  const s = o.s ?? 1, who = o.who || 'crowd', col = o.color || K[who] || K.pink, lw = (o.lw ?? 8) / s;
  const sq = o.sq || 0, sx = 1 - sq * .55, sy = 1 + sq;
  g.save(); g.translate(x, y); g.rotate(o.lean || 0); g.scale(s * sx, s * sy);
  g.lineJoin = 'round'; g.lineCap = 'round';
  const arms = o.arms ? ARMS[o.arms] || ARMS.down : ARMS.down;
  const L = o.L || arms[0], Rh = o.R || arms[1];
  const sleeve = who === 'lucia' ? K.wine : who === 'host' ? K.ol : who === 'javier' ? K.white : col;

  // moño de Lucía: detrás de la cabeza
  if (who === 'lucia') { ellipse(g, 18, -BH - 22, 58, 52, HAIR.lucia, lw); ellipse(g, 0, -BH + 6, 30, 14, HAIR.lucia); }
  // pies
  ellipse(g, -78, -6, 62, 30, who === 'host' ? K.ol : col, lw); ellipse(g, 78, -6, 62, 30, who === 'host' ? K.ol : col, lw);
  // brazo de detrás (si la mano cruza por detrás del cuerpo no hace falta: los brazos van delante)
  // cuerpo
  beanPath(g); g.fillStyle = col; g.fill();
  // ropa, recortada al cuerpo
  g.save(); beanPath(g); g.clip();
  if (who === 'lucia') {
    g.fillStyle = K.wine; g.fillRect(-R - 10, -178, BW + 20, 200);
    g.fillStyle = K.white; g.beginPath(); g.moveTo(-58, -182); g.lineTo(58, -182); g.lineTo(0, -88); g.closePath(); g.fill();
    g.strokeStyle = K.ol; g.lineWidth = lw * .8;
    g.beginPath(); g.moveTo(-58, -182); g.lineTo(0, -88); g.lineTo(58, -182); g.stroke();
    g.fillStyle = K.wineD; g.beginPath(); g.moveTo(-58, -182); g.lineTo(-96, -150); g.lineTo(-30, -126); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(58, -182); g.lineTo(96, -150); g.lineTo(30, -126); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(-R - 10, -178); g.lineTo(-58, -182); g.moveTo(58, -182); g.lineTo(R + 10, -178); g.stroke();
    ellipse(g, 0, -60, 9, 9, K.gold, lw * .5);
  } else if (who === 'javier') {
    g.fillStyle = K.white; g.beginPath(); g.moveTo(-70, -186); g.lineTo(70, -186); g.lineTo(46, -150); g.lineTo(0, -168); g.lineTo(-46, -150); g.closePath(); g.fill();
    g.strokeStyle = K.ol; g.lineWidth = lw * .8; g.stroke();
    // corbata
    g.fillStyle = K.red; g.beginPath(); g.moveTo(-16, -172); g.lineTo(16, -172); g.lineTo(11, -150); g.lineTo(-11, -150); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(-11, -150); g.lineTo(11, -150); g.lineTo(26, -62); g.lineTo(0, -36); g.lineTo(-26, -62); g.closePath(); g.fill(); g.stroke();
    g.strokeStyle = '#D9434A'; g.lineWidth = lw * .6; g.beginPath(); g.moveTo(-14, -110); g.lineTo(16, -126); g.moveTo(-20, -80); g.lineTo(20, -100); g.stroke();
  } else if (who === 'host') {
    g.fillStyle = K.ol; g.fillRect(-R - 10, -182, BW + 20, 200);
    g.fillStyle = K.white; g.beginPath(); g.moveTo(-54, -186); g.lineTo(54, -186); g.lineTo(0, -70); g.closePath(); g.fill();
    g.fillStyle = '#3A3A3A'; g.beginPath(); g.moveTo(-54, -186); g.lineTo(-92, -150); g.lineTo(-22, -110); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(54, -186); g.lineTo(92, -150); g.lineTo(22, -110); g.closePath(); g.fill();
    ellipse(g, 0, -130, 6, 6, K.ol); ellipse(g, 0, -104, 6, 6, K.ol);
  }
  // pelo (gorro recortado al cuerpo)
  if (who === 'lucia') {
    g.fillStyle = HAIR.lucia; g.beginPath(); g.moveTo(-R - 10, -230); g.lineTo(-R - 10, -BH - 20); g.lineTo(R + 10, -BH - 20); g.lineTo(R + 10, -250);
    g.bezierCurveTo(120, -300, 60, -338, -10, -330); g.bezierCurveTo(-80, -322, -120, -290, -R - 10, -230); g.closePath(); g.fill();
    g.strokeStyle = K.ol; g.lineWidth = lw; g.beginPath(); g.moveTo(R + 10, -250); g.bezierCurveTo(120, -300, 60, -338, -10, -330); g.bezierCurveTo(-80, -322, -120, -290, -R - 10, -230); g.stroke();
  } else if (who === 'javier') {
    g.fillStyle = HAIR.javier; g.beginPath(); g.moveTo(-R - 10, -300); g.lineTo(-R - 10, -BH - 20); g.lineTo(R + 10, -BH - 20); g.lineTo(R + 10, -300);
    for (let i = 0; i <= 6; i++) { const xx = R + 10 - i * (BW + 20) / 6; g.lineTo(xx, -322 + (i % 2) * 22); }
    g.closePath(); g.fill();
  } else if (who === 'host') {
    g.fillStyle = HAIR.host; g.beginPath(); g.moveTo(-R - 10, -290); g.lineTo(-R - 10, -BH - 20); g.lineTo(R + 10, -BH - 20); g.lineTo(R + 10, -290);
    g.bezierCurveTo(80, -330, -40, -350, -R - 10, -290); g.closePath(); g.fill();
  }
  g.restore();
  // contorno del cuerpo encima de la ropa
  beanPath(g); g.lineWidth = lw; g.strokeStyle = K.ol; g.stroke();
  // mechones por encima del contorno
  if (who === 'javier') {
    g.fillStyle = HAIR.javier;
    for (const [px, py, a] of [[-70, -366, -.5], [-20, -384, -.15], [32, -382, .2], [80, -360, .55]]) {
      g.save(); g.translate(px, py); g.rotate(a); g.beginPath(); g.moveTo(-22, 10); g.quadraticCurveTo(-8, -44, 6, -58); g.quadraticCurveTo(10, -20, 22, 10); g.closePath();
      g.fill(); g.lineWidth = lw * .9; g.strokeStyle = K.ol; g.stroke(); g.restore();
    }
  } else if (who === 'host') {
    g.fillStyle = HAIR.host; g.beginPath(); g.moveTo(-110, -340); g.bezierCurveTo(-120, -430, 20, -470, 110, -420); g.bezierCurveTo(60, -440, -10, -420, 10, -372); g.bezierCurveTo(-30, -390, -70, -370, -110, -340); g.closePath();
    g.fill(); g.lineWidth = lw; g.strokeStyle = K.ol; g.stroke();
    g.strokeStyle = '#5A4636'; g.lineWidth = lw * .7; g.beginPath(); g.moveTo(-60, -400); g.quadraticCurveTo(0, -440, 60, -432); g.stroke();
  }

  face(g, o, who, lw);

  // brazos y manos (delante)
  arm(g, [-138, -178], L, sleeve, lw, -1, o.propL, who);
  arm(g, [138, -178], Rh, sleeve, lw, 1, o.propR, who);
  if (o.sweat > 0) for (const [sx2, sy2, k] of [[-150, -330, 1], [158, -300, .8]]) {
    const a = clamp(o.sweat * k); if (a <= 0) continue;
    g.save(); g.translate(sx2, sy2 + (1 - a) * 20); g.scale(a, a);
    g.beginPath(); g.moveTo(0, -26); g.bezierCurveTo(16, -4, 16, 14, 0, 16); g.bezierCurveTo(-16, 14, -16, -4, 0, -26); g.fillStyle = '#BDEBFF'; g.fill(); g.lineWidth = lw * .7; g.strokeStyle = K.ol; g.stroke(); g.restore();
  }
  g.restore();
}

function face(g, o, who, lw) {
  const ex = 54, ey = -262, [lx, ly] = o.look || [0, 0];
  const eyes = o.blink && (o.eyes || 'open') === 'open' ? 'closed' : (o.eyes || 'open');
  // rubor
  if (o.blush !== false) { ellipse(g, -100, -214, 27, 15, BLUSH[who] || BLUSH.crowd); ellipse(g, 100, -214, 27, 15, BLUSH[who] || BLUSH.crowd); }
  g.lineCap = 'round';
  const drawEye = (cx, kind) => {
    const x = cx + lx * 10, y = ey + ly * 8;
    if (kind === 'open' || kind === 'tired') {
      ellipse(g, x, y, 21, 30, K.ol); ellipse(g, x - 7, y - 10, 7.5, 7.5, K.white); ellipse(g, x + 6, y + 9, 3.5, 3.5, K.white);
      if (kind === 'tired') {
        g.save(); g.beginPath(); g.ellipse(x, y, 23, 32, 0, 0, Math.PI * 2); g.clip(); g.fillStyle = o.color || K[who]; g.fillRect(x - 30, y - 40, 60, 38); g.restore();
        g.lineWidth = lw * .9; g.strokeStyle = K.ol; g.beginPath(); g.moveTo(x - 23, y - 3); g.lineTo(x + 23, y - 3); g.stroke();
        g.lineWidth = lw * .55; g.beginPath(); g.arc(x, y + 22, 18, .3, Math.PI - .3); g.stroke();
      }
    } else if (kind === 'happy') {
      g.lineWidth = lw * 1.15; g.strokeStyle = K.ol; g.beginPath(); g.arc(x, y + 8, 20, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
    } else if (kind === 'closed') {
      g.lineWidth = lw * 1.1; g.strokeStyle = K.ol; g.beginPath(); g.moveTo(x - 19, y + 2); g.quadraticCurveTo(x, y + 10, x + 19, y + 2); g.stroke();
    } else if (kind === 'wide' || kind === 'shock') {
      ellipse(g, x, y, 28, 36, K.white, lw * .9); ellipse(g, x + lx * 6, y + ly * 6, kind === 'shock' ? 8 : 13, kind === 'shock' ? 8 : 13, K.ol);
    }
  };
  if (eyes === 'wink') { drawEye(-ex, 'open'); drawEye(ex, 'happy'); } else { drawEye(-ex, eyes); drawEye(ex, eyes); }
  // cejas
  const br = o.brows || 'none';
  if (br !== 'none') {
    g.lineWidth = lw * 1.2; g.strokeStyle = K.ol;
    const yb = ey - 52 + (br === 'up' ? -12 : 0), din = br === 'worried' ? -12 : br === 'angry' ? 12 : 0;
    g.beginPath(); g.moveTo(-ex - 26, yb); g.lineTo(-ex + 22, yb + din); g.stroke();
    g.beginPath(); g.moveTo(ex + 26, yb); g.lineTo(ex - 22, yb + din); g.stroke();
  }
  // gafas de Lucía
  if (who === 'lucia') {
    g.lineWidth = lw * .85; g.strokeStyle = K.ol;
    for (const cx of [-ex, ex]) { g.beginPath(); g.arc(cx, ey + 2, 42, 0, Math.PI * 2); g.stroke(); g.save(); g.globalAlpha = .55; g.strokeStyle = K.white; g.lineWidth = lw * .6; g.beginPath(); g.arc(cx, ey + 2, 30, -2.4, -1.7); g.stroke(); g.restore(); }
    g.beginPath(); g.moveTo(-ex + 42, ey); g.quadraticCurveTo(0, ey - 12, ex - 42, ey); g.stroke();
    g.beginPath(); g.moveTo(-ex - 42, ey - 4); g.lineTo(-R + 6, ey - 14); g.moveTo(ex + 42, ey - 4); g.lineTo(R - 6, ey - 14); g.stroke();
  }
  // boca
  const m = clamp(o.mouth || 0), shp = o.shape || 'smile', my = -202;
  g.lineWidth = lw; g.strokeStyle = K.ol;
  if (m > .06 || shp === 'o' || shp === 'grin') {
    const w = shp === 'o' ? 16 + 10 * m : 24 + 22 * m + (shp === 'grin' ? 18 : 0), h = shp === 'o' ? 14 + 18 * m : 8 + 40 * m + (shp === 'grin' ? 10 : 0);
    g.save(); g.beginPath();
    if (shp === 'o') g.ellipse(0, my + 4, w, h, 0, 0, Math.PI * 2);
    else { g.moveTo(-w, my - 4); g.quadraticCurveTo(0, my - 4 - h * .25, w, my - 4); g.quadraticCurveTo(w * .9, my + h * 1.15, 0, my + h * 1.2); g.quadraticCurveTo(-w * .9, my + h * 1.15, -w, my - 4); g.closePath(); }
    g.fillStyle = '#5E1222'; g.fill(); g.clip();
    ellipse(g, 0, my + h * 1.15, w * .62, h * .55, '#FF6F7D');
    g.restore(); g.lineWidth = lw * .9; g.stroke();
  } else if (shp === 'frown') {
    g.beginPath(); g.moveTo(-24, my + 8); g.quadraticCurveTo(0, my - 10, 24, my + 8); g.stroke();
  } else if (shp === 'flat') {
    g.beginPath(); g.moveTo(-20, my); g.lineTo(20, my); g.stroke();
  } else {
    g.beginPath(); g.moveTo(-26, my - 6); g.quadraticCurveTo(0, my + 16, 26, my - 6); g.stroke();
  }
}

function arm(g, [sx, sy], [hx, hy], sleeve, lw, side, prop, who) {
  const mx = (sx + hx) / 2 + side * 34, my = (sy + hy) / 2 + 18;
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo(mx, my, hx, hy);
  g.strokeStyle = K.ol; g.lineWidth = 46 + lw * 2; g.stroke();
  g.strokeStyle = sleeve; g.lineWidth = 46; g.stroke();
  if (sleeve === K.ol) { g.strokeStyle = '#3A3A3A'; g.lineWidth = 18; g.globalAlpha = 1; }
  // puño blanco del esmoquin / de la camisa
  if (who === 'host' || who === 'lucia') { const a = Math.atan2(hy - my, hx - mx); ellipse(g, hx - Math.cos(a) * 20, hy - Math.sin(a) * 20, 14, 26, K.white, lw * .7, a); }
  if (prop && PROPS[prop]) PROPS[prop](g, hx, hy, side, lw);
  mitten(g, hx, hy, side, lw);
  if (prop && PROPS_FRONT[prop]) PROPS_FRONT[prop](g, hx, hy, side, lw);
}

export function mitten(g, x, y, side, lw, s = 1) {
  g.save(); g.translate(x, y); g.scale(s, s);
  g.beginPath(); g.ellipse(-side * 22, -10, 15, 22, side * -.6, 0, Math.PI * 2); g.fillStyle = K.white; g.fill(); g.lineWidth = lw; g.strokeStyle = K.ol; g.stroke();
  g.beginPath(); g.arc(0, 0, 34, 0, Math.PI * 2); g.fillStyle = K.white; g.fill(); g.stroke();
  g.lineWidth = lw * .55; g.beginPath(); g.moveTo(side * 8, -14); g.lineTo(side * 22, -6); g.moveTo(side * 6, 4); g.lineTo(side * 22, 10); g.stroke();
  g.restore();
}

// objetos que se dibujan DETRÁS de la manopla
const PROPS = {
  mic(g, x, y, side, lw) {
    g.save(); g.translate(x, y); g.rotate(side * -.35 - .1);
    rr(g, -12, -96, 24, 104, 10); g.fillStyle = K.ol; g.fill();
    g.beginPath(); g.arc(0, -122, 36, 0, Math.PI * 2); g.fillStyle = K.gray; g.fill(); g.lineWidth = lw; g.strokeStyle = K.ol; g.stroke();
    g.save(); g.clip(); g.strokeStyle = K.grayD; g.lineWidth = lw * .45;
    for (let i = -40; i <= 40; i += 13) { g.beginPath(); g.moveTo(i, -170); g.lineTo(i, -80); g.stroke(); g.beginPath(); g.moveTo(-40, -122 + i); g.lineTo(40, -122 + i); g.stroke(); }
    g.restore(); rr(g, -22, -96, 44, 20, 6); g.fillStyle = K.red; g.fill(); g.lineWidth = lw * .8; g.stroke();
    g.restore();
  },
  phone(g, x, y, side, lw) {
    g.save(); g.translate(x - side * 6, y - 70); g.rotate(side * .12);
    rr(g, -52, -96, 104, 188, 20); g.fillStyle = K.ol; g.fill();
    rr(g, -42, -84, 84, 164, 12); g.fillStyle = K.paper; g.fill();
    rr(g, -30, 40, 60, 22, 8); g.fillStyle = K.wine; g.fill();
    g.fillStyle = '#E9DED6'; rr(g, -30, -60, 60, 14, 5); g.fill(); rr(g, -30, -36, 44, 14, 5); g.fill(); rr(g, -30, -12, 60, 34, 7); g.fill();
    g.restore();
  },
  handset(g, x, y, side, lw) {
    g.save(); g.translate(x + side * 6, y - 20); g.rotate(side * .5 - .2);
    g.beginPath(); g.moveTo(-30, -150); g.quadraticCurveTo(-58, -40, -26, 60); g.lineTo(18, 60); g.quadraticCurveTo(-8, -40, 18, -150); g.closePath();
    g.fillStyle = K.red; g.fill(); g.lineWidth = lw; g.strokeStyle = K.ol; g.stroke();
    rr(g, -52, -196, 84, 60, 26); g.fill(); g.stroke(); rr(g, -48, 44, 84, 60, 26); g.fill(); g.stroke();
    g.restore();
  },
  bag(g, x, y, side, lw) {
    g.save(); g.translate(x, y + 10);
    g.beginPath(); g.arc(0, 0, 44, Math.PI, 0); g.lineWidth = 12; g.strokeStyle = K.ol; g.stroke(); g.lineWidth = 6; g.strokeStyle = K.wineD; g.stroke();
    rr(g, -78, 0, 156, 120, 22); g.fillStyle = K.wine; g.fill(); g.lineWidth = lw; g.strokeStyle = K.ol; g.stroke();
    rr(g, -22, 16, 44, 18, 6); g.fillStyle = K.gold; g.fill(); g.stroke();
    g.restore();
  },
};
const PROPS_FRONT = {};

// cabeza del público: versión pequeña y sin prendas
export function crowdBean(g, x, y, s, col, t, i, cheer = 0) {
  const ph = (i % 2) * .25, hop = cheer > 0 ? -Math.abs(Math.sin((t + ph) * 9)) * 26 * cheer : -Math.max(0, Math.sin(((t + ph) / .5) * Math.PI)) * 10;
  const up = cheer > .1;
  bean(g, x, y + hop, { who: 'crowd', color: col, s, arms: up ? 'up' : 'down', eyes: up ? 'happy' : 'open', mouth: up ? .8 : 0, shape: up ? 'grin' : 'smile', lw: 6, blink: ((t * 1.3 + i * .71) % 3.3) < .1 });
}
