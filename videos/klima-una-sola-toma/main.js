// «Una sola toma» · reel (1080×1920, 30 fps). Un plató en miniatura sobre una mesa de madera, con luz de atardecer:
// claqueta, tira de película, fichas de dominó y un móvil. Una cámara sin cortes explica tres reglas del plano
// secuencia y acaba metiéndose en la pantalla del móvil, que enseña el primer fotograma: el bucle es perfecto.
// Cadena de imagen como una cámara de verdad: render HDR, obturador de 180°, profundidad de campo por la distancia de
// enfoque, aberración cromática leve, curva ACES, grano y viñeta. render(t) es función pura de t.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const W = 1080, H = 1920, FPS = 30, FOV = 35, Q = new URLSearchParams(location.search);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x)), lerp = (a, b, u) => a + (b - a) * u, seg = (t, a, b) => clamp((t - a) / (b - a));
const sm = u => u * u * (3 - 2 * u);
const hash = n => { n = Math.sin(n * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); };
for (const w of [500, 600, 700]) { await document.fonts.load(`${w} 40px "Plex"`); await document.fonts.load(`${w} 40px "PlexMono"`); }

// ——— el renderizador 3D (lienzo propio) y el lienzo que se ve (2D: la imagen, el grano y los rótulos) ———
const view = document.getElementById('c'), V = view.getContext('2d');
const gl = document.createElement('canvas'); gl.width = W; gl.height = H;
const renderer = new THREE.WebGLRenderer({ canvas: gl, antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H, false); renderer.autoClear = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;   // la sombra solo se rehace si algo se mueve

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0705);
const pmrem = new THREE.PMREMGenerator(renderer);
// reflejos de la sala solo en lo que brilla (móvil, cristal, cerámica, fichas, película): en la mesa y la claqueta no se
// notan y sin GPU son lo más caro del render
const ENV = pmrem.fromScene(new RoomEnvironment(), .04).texture;
const gloss = (m, k = .32) => { m.envMap = ENV; m.envMapIntensity = k; return m; };

// luz de atardecer por una ventana (cálida, rasante) y un relleno frío muy suave
const sun = new THREE.DirectionalLight(0xffc48a, 3.4);
sun.position.set(-1.6, 1.3, 1.4); sun.target.position.set(1.4, 0, 0);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.radius = 5; sun.shadow.bias = -.0004; sun.shadow.normalBias = .0015;
Object.assign(sun.shadow.camera, { left: -2.3, right: 2.3, top: 1.5, bottom: -1.5, near: .1, far: 6 });
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0xfff0e0, 0x6a4630, 1.15));   // la luz rebotada de la sala (sustituye al mapa de entorno)

const tex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
const std = (o) => new THREE.MeshStandardMaterial(o);
const shadowy = m => { m.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; }); return m; };

// ——— la mesa: roble con vetas hechas a mano, con canto ———
const wood = tex(2048, 1024, (q, w, h) => {
  const g = q.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#6b4429'); g.addColorStop(.5, '#7a4e30'); g.addColorStop(1, '#5e3a22'); q.fillStyle = g; q.fillRect(0, 0, w, h);
  for (let i = 0; i < 520; i++) {
    const y = hash(i) * h, a = .04 + hash(i * 3) * .1; q.strokeStyle = hash(i * 7) > .5 ? `rgba(40,20,8,${a})` : `rgba(160,110,70,${a * .7})`; q.lineWidth = .6 + hash(i * 5) * 2.4;
    q.beginPath(); for (let x = 0; x <= w; x += 32) { const yy = y + Math.sin(x * .004 + i) * 6 + Math.sin(x * .013 + i * 2) * 2.5; x ? q.lineTo(x, yy) : q.moveTo(x, yy); } q.stroke();
  }
  for (let i = 0; i < 9; i++) { const x = hash(i * 11) * w, y = hash(i * 13) * h; q.strokeStyle = 'rgba(40,20,8,.18)'; q.lineWidth = 2; for (let r = 4; r < 40; r += 5) { q.beginPath(); q.ellipse(x, y, r * 3, r * .6, 0, 0, Math.PI * 2); q.stroke(); } }
});
wood.wrapS = wood.wrapT = THREE.RepeatWrapping; wood.repeat.set(2.2, 1.7);
const TX0 = -1.0, TX1 = 3.4, TZ0 = -.95, TZ1 = .75;
const edge = std({ color: 0x3b2414, roughness: .7 });
const table = new THREE.Mesh(new THREE.BoxGeometry(TX1 - TX0, .04, TZ1 - TZ0), [edge, edge, std({ map: wood, roughness: .58 }), edge, edge, edge]);
table.position.set((TX0 + TX1) / 2, -.02, (TZ0 + TZ1) / 2); table.receiveShadow = true; scene.add(table);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 8), std({ color: 0x120c08, roughness: .9 })); floor.rotation.x = -Math.PI / 2; floor.position.set(1.2, -.75, -2); scene.add(floor);

// ——— el fondo: la habitación, desenfocada (ventana, una planta, una estantería y una lámpara) ———
const room = tex(2048, 1024, (q, w, h) => {
  const c2 = document.createElement('canvas'); c2.width = w; c2.height = h; const r = c2.getContext('2d');
  let g = r.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#3a2516'); g.addColorStop(.45, '#1c120c'); g.addColorStop(1, '#100a07'); r.fillStyle = g; r.fillRect(0, 0, w, h);
  g = r.createRadialGradient(360, 380, 60, 360, 380, 640); g.addColorStop(0, 'rgba(255,190,120,.55)'); g.addColorStop(1, 'rgba(255,150,80,0)'); r.fillStyle = g; r.fillRect(0, 0, w, h);
  r.fillStyle = '#ffe2b8'; r.fillRect(160, 150, 400, 470);                                       // la ventana
  r.fillStyle = '#2a1a10'; r.fillRect(352, 150, 16, 470); r.fillRect(160, 378, 400, 14); r.fillRect(150, 140, 420, 12); r.fillRect(150, 618, 420, 14);
  r.fillStyle = '#140d08'; for (let i = 0; i < 34; i++) { r.save(); r.translate(560 + hash(i * 3) * 220, 330 + hash(i * 5) * 420); r.rotate(hash(i * 7) * 6.28); r.beginPath(); r.ellipse(0, 0, 54, 16, 0, 0, 6.28); r.fill(); r.restore(); }
  r.fillRect(590, 640, 150, 200);                                                                 // la maceta
  r.fillStyle = '#0d0805'; r.fillRect(1180, 330, 700, 16); r.fillRect(1180, 560, 700, 16);       // la estantería
  for (let s = 0; s < 2; s++) for (let x = 1200; x < 1860;) { const bw = 22 + hash(x + s) * 30, bh = 120 + hash(x * 3 + s) * 90, l = 30 + hash(x * 7 + s) * 30; r.fillStyle = `hsl(${20 + hash(x * 5 + s) * 30},35%,${l * .4}%)`; r.fillRect(x, (s ? 560 : 330) - bh, bw, bh); x += bw + 4; }
  for (const [x, y, rr, a] of [[1720, 200, 70, 1], [1560, 760, 46, .7], [1880, 700, 38, .6], [1000, 260, 30, .45]]) { g = r.createRadialGradient(x, y, 0, x, y, rr * 2.4); g.addColorStop(0, `rgba(255,205,140,${a})`); g.addColorStop(.35, `rgba(255,170,100,${a * .5})`); g.addColorStop(1, 'rgba(255,150,80,0)'); r.fillStyle = g; r.fillRect(x - rr * 3, y - rr * 3, rr * 6, rr * 6); }
  q.filter = 'blur(10px)'; q.drawImage(c2, 0, 0); q.filter = 'none';
});
const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(11, 3.6), new THREE.MeshBasicMaterial({ map: room, color: new THREE.Color(1.5, 1.5, 1.5) }));
backdrop.position.set(1.3, .75, -3.2); scene.add(backdrop);

// ——— sombras de la ventana sobre la mesa (marcos y unas hojas que no ve la cámara) ———
const L = sun.position.clone().sub(sun.target.position).normalize(), ghost = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
function caster(a, b, th, s = 1.1) {   // proyecta el segmento a→b de la mesa hacia el sol
  const A = new THREE.Vector3(...a).addScaledVector(L, s), B = new THREE.Vector3(...b).addScaledVector(L, s), d = B.clone().sub(A);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(th, th, d.length(), 6), ghost); m.position.copy(A).lerp(B, .5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); m.castShadow = true; scene.add(m);
}
caster([.62, 0, -1.1], [.80, 0, .9], .02); caster([1.30, 0, -1.1], [1.48, 0, .9], .02);
for (let i = 0; i < 22; i++) { const p = new THREE.Vector3(2.0 + hash(i) * .9, 0, -.25 - hash(i * 3) * .5).addScaledVector(L, .55); const m = new THREE.Mesh(new THREE.SphereGeometry(.03, 8, 6), ghost); m.scale.set(1, .25, .45); m.rotation.set(hash(i * 5) * 3, hash(i * 7) * 3, 0); m.position.copy(p); m.castShadow = true; scene.add(m); }

// ——— la claqueta ———
const slateTex = tex(1200, 960, (q, w, h) => {
  q.fillStyle = '#1b1c1e'; q.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) { q.fillStyle = `rgba(255,255,255,${hash(i) * .035})`; q.fillRect(hash(i * 2) * w, hash(i * 3) * h, 2 + hash(i * 4) * 6, 1 + hash(i * 5) * 3); }
  q.strokeStyle = 'rgba(240,236,228,.75)'; q.lineWidth = 5;
  [[0, 300, w, 300], [0, 560, w, 560], [w / 2, 300, w / 2, 560], [0, 800, w, 800]].forEach(([a, b, c, d]) => { q.beginPath(); q.moveTo(a, b); q.lineTo(c, d); q.stroke(); });
  const chalk = (s, x, y, size) => { q.font = `600 ${size}px "PlexMono"`; q.fillStyle = 'rgba(244,240,232,.9)'; q.fillText(s, x, y); q.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 260; i++) { q.fillStyle = `rgba(0,0,0,${.25 + hash(i + y) * .5})`; q.fillRect(x + hash(i * 7 + y) * size * 6, y - size + hash(i * 9 + y) * size, 2, 2); } q.globalCompositeOperation = 'source-over'; };
  q.font = '500 46px "PlexMono"'; q.fillStyle = 'rgba(244,240,232,.6)'; q.fillText('PROD.', 40, 90); q.fillText('ESCENA', 40, 360); q.fillText('TOMA', w / 2 + 40, 360); q.fillText('ROLLO', 40, 620);
  chalk('KLIMA · ESTUDIO', 40, 220, 96); chalk('01', 200, 510, 130); chalk('1 · ÚNICA', w / 2 + 40, 510, 110); chalk('SIN CORTES', 40, 740, 100);
  q.font = '500 40px "PlexMono"'; q.fillStyle = 'rgba(244,240,232,.55)'; q.fillText('DIRECTOR  @klima.io', 40, 900);
});
const stripes = tex(1024, 128, (q, w, h) => { q.fillStyle = '#f2efe8'; q.fillRect(0, 0, w, h); q.fillStyle = '#141414'; for (let x = -h; x < w + h; x += 128) { q.beginPath(); q.moveTo(x, 0); q.lineTo(x + 64, 0); q.lineTo(x + 64 - h, h); q.lineTo(x - h, h); q.closePath(); q.fill(); } });
const slate = new THREE.Group();
const SW = .30, SH = .24;
const body = new THREE.Mesh(new THREE.BoxGeometry(SW, SH, .012), [0, 0, 0, 0, std({ map: slateTex, roughness: .9 }), 0].map(m => m || std({ color: 0x1b1c1e, roughness: .8 })));
body.position.y = SH / 2; slate.add(body);
const bar = new THREE.Mesh(new THREE.BoxGeometry(SW, .034, .014), std({ map: stripes, roughness: .5 })); bar.position.y = SH + .017; slate.add(bar);
const hinge = new THREE.Group(); hinge.position.set(-SW / 2, SH + .034, 0); slate.add(hinge);
const stick = new THREE.Mesh(new THREE.BoxGeometry(SW, .034, .014), std({ map: stripes, roughness: .5 })); stick.position.set(SW / 2, .017, 0); hinge.add(stick);
slate.rotation.set(-.12, .18, 0); shadowy(slate); scene.add(slate);
const CLAP = 1.0;

// ——— atrezo: una taza de café, un lápiz y un objetivo ———
{
  const cer = gloss(std({ color: 0xcbb9a5, roughness: .3 }));
  const mug = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [.036, 0], [.04, .004], [.041, .088], [.039, .092], [.036, .092], [.035, .01], [0, .01]].map(([x, y]) => new THREE.Vector2(x, y)), 48), cer); mug.material.side = THREE.DoubleSide;
  const coffee = new THREE.Mesh(new THREE.CircleGeometry(.035, 48), gloss(std({ color: 0x1e0f06, roughness: .05 }))); coffee.rotation.x = -Math.PI / 2; coffee.position.y = .074;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(.024, .006, 12, 32, Math.PI), cer); handle.position.set(.039, .046, 0); handle.rotation.z = -Math.PI / 2;
  const g = new THREE.Group(); g.add(mug, coffee, handle); g.position.set(-.36, 0, -.22); g.rotation.y = 2.4; scene.add(shadowy(g));
  const p = new THREE.Group(), cyl = (r, l, c, o = {}) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, o.seg || 6), std({ color: c, roughness: o.ro ?? .45, metalness: o.me || 0 }));
  const pb = cyl(.0038, .16, 0xe0a92e); pb.rotation.z = Math.PI / 2;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(.0038, .02, 6), std({ color: 0xd8b48a, roughness: .7 })); tip.rotation.z = -Math.PI / 2; tip.position.x = .09;
  const lead = new THREE.Mesh(new THREE.ConeGeometry(.0013, .006, 8), std({ color: 0x222222, roughness: .4 })); lead.rotation.z = -Math.PI / 2; lead.position.x = .0975;
  const fer = cyl(.004, .012, 0xb8b2a6, { seg: 16, ro: .3, me: .9 }); fer.rotation.z = Math.PI / 2; fer.position.x = -.086; gloss(fer.material);
  const er = cyl(.004, .012, 0xd98282, { seg: 16, ro: .8 }); er.rotation.z = Math.PI / 2; er.position.x = -.098;
  p.add(pb, tip, lead, fer, er); p.position.set(.5, .0038, .27); p.rotation.y = .5; scene.add(shadowy(p));
  const lens = new THREE.Group();
  const barrel = cyl(.034, .085, 0x111113, { seg: 48, ro: .45, me: .5 }); barrel.position.y = .0425; gloss(barrel.material);
  const grip = cyl(.0356, .024, 0x1c1c1e, { seg: 48, ro: .85 }); grip.position.y = .05;
  const red = new THREE.Mesh(new THREE.TorusGeometry(.0342, .0011, 6, 64), std({ color: 0xc0262b, roughness: .4 })); red.rotation.x = Math.PI / 2; red.position.y = .079;
  const glass = new THREE.Mesh(new THREE.CircleGeometry(.028, 48), gloss(std({ color: 0x0a0d12, roughness: .03, metalness: 1 }), .6)); glass.rotation.x = -Math.PI / 2; glass.position.y = .0855;
  lens.add(barrel, grip, red, glass); lens.position.set(2.06, 0, -.34); scene.add(shadowy(lens));
}

// ——— la tira de película de 35 mm sobre la mesa (en curva) ———
const P0 = [[.24, .06], [.55, .12], [.85, -.02], [1.15, -.10], [1.45, -.02], [1.66, .02]];
const strip = new THREE.CatmullRomCurve3(P0.map(([x, z]) => new THREE.Vector3(x, 0, z)));
const filmTex = tex(4096, 256, (q, w, h) => {
  q.fillStyle = '#2a1608'; q.fillRect(0, 0, w, h);
  for (let x = 12; x < w; x += 36) { q.fillStyle = '#d9c7a8'; q.fillRect(x, 14, 18, 26); q.fillRect(x, h - 40, 18, 26); }
  const scenes = [['#f0b072', '#7a3b1e'], ['#9fc0e8', '#2b3a5a'], ['#f3d38a', '#8a4b22'], ['#c9e3c0', '#2d5a3a'], ['#f4a3b8', '#6a2140'], ['#e8d3b0', '#5a3a20']];
  for (let i = 0; i < 18; i++) {
    const x = 30 + i * 226, c = scenes[i % 6], g = q.createLinearGradient(0, 56, 0, 200); g.addColorStop(0, c[0]); g.addColorStop(1, c[1]);
    q.fillStyle = g; q.fillRect(x, 56, 200, 144);
    q.fillStyle = 'rgba(20,10,4,.55)'; q.beginPath(); q.arc(x + 60 + (i % 3) * 30, 150, 26, 0, Math.PI * 2); q.fill(); q.fillRect(x + 110, 120, 60, 80);
  }
  q.fillStyle = 'rgba(255,220,170,.5)'; q.font = '600 18px "PlexMono"'; for (let i = 0; i < 18; i++) q.fillText(`KLIMA 5219  ${i + 1}`, 34 + i * 226, 236);
});
{
  const N = 220, wdt = .05, pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N, p = strip.getPointAt(u), tg = strip.getTangentAt(u), nx = -tg.z, nz = tg.x;
    const lift = Math.max(0, (u - .9) / .1) ** 2 * .02;
    pos.push(p.x + nx * wdt / 2, .0012 + lift, p.z + nz * wdt / 2, p.x - nx * wdt / 2, .0012 + lift, p.z - nz * wdt / 2);
    uv.push(u, 1, u, 0); if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, gloss(std({ map: filmTex, roughness: .22, metalness: .1, side: THREE.DoubleSide }))); m.receiveShadow = true; scene.add(m);
}

// ——— las fichas de dominó ———
const pipTex = n => tex(128, 256, (q, w, h) => {
  q.fillStyle = '#f4efe4'; q.fillRect(0, 0, w, h); q.fillStyle = '#1a1a1a'; q.fillRect(10, h / 2 - 2, w - 20, 4);
  const pips = { 1: [[.5, .5]], 2: [[.3, .3], [.7, .7]], 3: [[.3, .3], [.5, .5], [.7, .7]], 4: [[.3, .3], [.7, .3], [.3, .7], [.7, .7]], 5: [[.3, .3], [.7, .3], [.5, .5], [.3, .7], [.7, .7]], 6: [[.3, .25], [.7, .25], [.3, .5], [.7, .5], [.3, .75], [.7, .75]] };
  for (const half of [0, 1]) for (const [px, py] of pips[((n + half * 3) % 6) + 1]) { q.beginPath(); q.arc(px * w, half * h / 2 + py * h / 2, 10, 0, Math.PI * 2); q.fill(); }
});
const DOM = [], DN = 12, DX0 = 1.72, DSP = .062, DT0 = 10.0, DH = .1, DTH = .022, DFALL = .56, DDT = DFALL * Math.sqrt(Math.asin((DSP - DTH) / DH) / (Math.PI / 2));
for (let i = 0; i < DN; i++) {
  const pivot = new THREE.Group(); pivot.position.set(DX0 + i * DSP + DTH / 2, 0, 0); scene.add(pivot);
  const side = gloss(std({ color: 0xf1ebdf, roughness: .35 })), face = gloss(std({ map: pipTex(i), roughness: .35 }));
  const m = new THREE.Mesh(new RoundedBoxGeometry(DTH, DH, .05, 3, .004), [face, face, side, side, side, side]);
  m.position.set(-DTH / 2, DH / 2, 0); m.castShadow = m.receiveShadow = true; pivot.add(m); DOM.push(pivot);
}
// cada ficha cae sobre su arista delantera; toca a la siguiente justo cuando esta empieza a caer (DDT) y nunca la
// atraviesa: su ángulo se limita por el de la siguiente. La última queda tumbada en la mesa, al lado del móvil.
function domAngles(t) {
  const th = new Array(DN);
  for (let i = DN - 1; i >= 0; i--) {
    const u = clamp((t - DT0 - i * DDT) / DFALL); let a = Math.PI / 2 * u * u;
    if (i < DN - 1) a = Math.min(a, th[i + 1] + Math.asin(clamp((DSP * Math.cos(th[i + 1]) - DTH) / DH, -1, 1)));
    th[i] = a;
  }
  return th;
}

// ——— el móvil: la pantalla (9:16) enseña el primer fotograma del vídeo y el comentario ———
const PX = DX0 + DN * DSP + .1, PHW = .092, PHL = .172, PHT = .009;
const phone = new THREE.Mesh(new RoundedBoxGeometry(PHW, PHT, PHL, 4, .0045), gloss(std({ color: 0x18181b, roughness: .25, metalness: .6 })));
phone.position.set(PX, PHT / 2, 0); phone.castShadow = phone.receiveShadow = true; scene.add(phone);
const SCW = .084, SCL = SCW * 16 / 9, SCY = PHT + .0003;
const F0RT = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
const screenMat = std({ color: 0x000000, roughness: .1, metalness: 0, emissive: 0xffffff, emissiveMap: F0RT.texture, emissiveIntensity: 0, envMap: ENV });
const screen = new THREE.Mesh(new THREE.PlaneGeometry(SCW, SCL), screenMat); screen.rotation.x = -Math.PI / 2; screen.position.set(PX, SCY, 0); scene.add(screen);
const uiCanvas = document.createElement('canvas'); uiCanvas.width = 540; uiCanvas.height = 960; const UI = uiCanvas.getContext('2d');
const uiTex = new THREE.CanvasTexture(uiCanvas); uiTex.colorSpace = THREE.SRGBColorSpace;
const ui = new THREE.Mesh(new THREE.PlaneGeometry(SCW, SCL), new THREE.MeshBasicMaterial({ map: uiTex, transparent: true, color: new THREE.Color(1.7, 1.7, 1.7) })); ui.rotation.x = -Math.PI / 2; ui.position.set(PX, SCY + .0003, 0); scene.add(ui);
const WAKE = DT0 + (DN - 1) * DDT + DFALL + .05;

// ——— polvo en el rayo de sol: cada mota con su propio desenfoque ———
const NM = 140, mot = new THREE.BufferGeometry(), mp = [], ms = [];
for (let i = 0; i < NM; i++) { mp.push(-.3 + hash(i * 1.3) * 3.2, .02 + hash(i * 2.1) * .42, -.6 + hash(i * 3.7) * 1.2); ms.push(hash(i * 5.9)); }
mot.setAttribute('position', new THREE.Float32BufferAttribute(mp, 3)); mot.setAttribute('seed', new THREE.Float32BufferAttribute(ms, 1));
const moteMat = new THREE.ShaderMaterial({
  uniforms: { t: { value: 0 }, zf: { value: 1 }, A: { value: 40 }, k: { value: H / (2 * Math.tan(THREE.MathUtils.degToRad(FOV) / 2)) } },
  vertexShader: `uniform float t, zf, A, k; attribute float seed; varying float vA;
    void main(){ vec3 p = position + vec3(sin(t*.23+seed*31.)*.03, sin(t*.17+seed*17.)*.02 + t*.002, cos(t*.19+seed*23.)*.03);
      vec4 mv = modelViewMatrix * vec4(p, 1.); float z = -mv.z; float s = max(1.2, .0007 * k / z), c = min(A * abs(z - zf) / z, 70.);
      float d = max(s, c); gl_PointSize = d + 1.; vA = (.55 + .45 * sin(t * 1.3 + seed * 40.)) * (s * s) / (d * d) * smoothstep(.04, .12, z);
      gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `varying float vA; void main(){ float r = length(gl_PointCoord - .5) * 2.; float a = smoothstep(1., .82, r) * vA; gl_FragColor = vec4(vec3(1., .78, .52) * a * 2.2, 0.); }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
});
const motes = new THREE.Points(mot, moteMat); motes.frustumCulled = false; scene.add(motes);

// ——— la cámara: claves de posición, mirada y «arriba»; el ritmo nunca se para (interpolación monótona) ———
const TOPY = .50, TOPZ = .013, FILLY = SCY + SCL / (2 * Math.tan(THREE.MathUtils.degToRad(FOV) / 2));
const K = [   // [t, posición, mirada, arriba]
  [0, [-.30, .285, .56], [-.03, .222, 0], [0, 1, 0]],
  [1.8, [-.21, .305, .47], [.0, .235, 0], [0, 1, 0]],
  [4.2, [-.10, .42, .62], [1.6, 0, -.02], [0, 1, 0]],
  [6.8, [.95, .10, .28], [1.45, .0, -.05], [0, 1, 0]],
  [9.9, [1.48, .17, .21], [1.80, .045, 0], [0, 1, 0]],
  [13.5, [2.18, .19, .23], [2.48, .04, 0], [0, 1, 0]],
  [16.9, [PX + .03, .34, .26], [PX, 0, .01], [0, 1, 0]],
  [19.8, [PX, TOPY + .02, TOPZ + .004], [PX, 0, TOPZ], [Math.sin(.1), 0, -Math.cos(.1)]],
  [24.0, [PX, TOPY, TOPZ], [PX, 0, TOPZ], [0, 0, -1]],
  [26.2, [PX, FILLY, 0], [PX, 0, 0], [0, 0, -1]],
];
const DUR = 26.2;   // el fotograma de 26,2 s sería el primero otra vez: lo pone el bucle, no se repite
const v3 = a => new THREE.Vector3(...a);
// curva por coordenada con tangentes monótonas (sin pasarse de la clave en ningún eje)
function mono(ys) {
  const n = ys.length, d = [], m = [];
  for (let i = 0; i < n - 1; i++) d.push(ys[i + 1] - ys[i]);
  for (let i = 0; i < n; i++) m.push(i === 0 ? d[0] * .5 : i === n - 1 ? d[n - 2] * .5 : d[i - 1] * d[i] <= 0 ? 0 : 2 / (1 / d[i - 1] + 1 / d[i]));
  return s => { const i = Math.min(n - 2, Math.max(0, Math.floor(s))), u = s - i, u2 = u * u, u3 = u2 * u; return ys[i] * (2 * u3 - 3 * u2 + 1) + ys[i + 1] * (-2 * u3 + 3 * u2) + m[i] * (u3 - 2 * u2 + u) + m[i + 1] * (u3 - u2); };
}
const curve = j => { const f = [0, 1, 2].map(c => mono(K.map(k => k[j][c]))); return s => new THREE.Vector3(f[0](s), f[1](s), f[2](s)); };
const posC = curve(1), tgtC = curve(2);
// el ritmo: se mide cuánto se mueve la imagen (el giro de la mirada más el desplazamiento dividido por la distancia a lo
// que se mira) y ese recorrido se reparte en el tiempo con una curva monótona (Fritsch–Carlson): la velocidad que se ve
// en pantalla es continua, sin tirones en las claves.
const KT = K.map(k => k[0]), NK = K.length, NS = 4000, DS = [0];
for (let k = 1; k <= NS; k++) {
  const a = (k - 1) / NS * (NK - 1), b = k / NS * (NK - 1), pa = posC(a), pb = posC(b), fa = tgtC(a).sub(pa), fb = tgtC(b).sub(pb);
  DS.push(DS[k - 1] + fa.angleTo(fb) + pb.distanceTo(pa) / Math.max(.3, fa.length()));
}
const DK = KT.map((_, i) => DS[Math.round(i / (NK - 1) * NS)]), dK = [], mK = [];
for (let i = 0; i < NK - 1; i++) dK.push((DK[i + 1] - DK[i]) / (KT[i + 1] - KT[i]));
for (let i = 0; i < NK; i++) mK.push(i === 0 ? dK[0] * .35 : i === NK - 1 ? dK[NK - 2] * .55 : dK[i - 1] * dK[i] <= 0 ? 0 : 2 / (1 / dK[i - 1] + 1 / dK[i]));
function keyAt(t) {
  let i = 0; while (i < NK - 2 && t >= KT[i + 1]) i++;
  const h = KT[i + 1] - KT[i], u = clamp((t - KT[i]) / h), u2 = u * u, u3 = u2 * u;
  const d = DK[i] * (2 * u3 - 3 * u2 + 1) + DK[i + 1] * (-2 * u3 + 3 * u2) + h * mK[i] * (u3 - 2 * u2 + u) + h * mK[i + 1] * (u3 - u2);
  let lo = 0, hi = NS; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (DS[m] <= d) lo = m; else hi = m; }   // recorrido → posición en la curva
  return (lo + clamp((d - DS[lo]) / (DS[hi] - DS[lo] || 1)) * (hi - lo)) / NS * (NK - 1);
}
function camAt(t) {
  const s = clamp(keyAt(t), 0, NK - 1), i = Math.min(NK - 2, Math.floor(s)), u = s - i;
  const p = posC(s), q = tgtC(s), up = v3(K[i][3]).lerp(v3(K[i + 1][3]), sm(u)).normalize();
  const hand = (1 - seg(t, 24.0, 25.2)) * .0014;   // pulso de cámara en mano, que se apaga al entrar en la pantalla
  p.x += Math.sin(t * 1.3) * hand + Math.sin(t * 2.9) * hand * .5; p.y += Math.sin(t * 1.7 + 1) * hand * .8; p.z += Math.sin(t * 1.1 + 2) * hand * .6;
  return { p, q, up };
}
const camera = new THREE.PerspectiveCamera(FOV, W / H, .01, 12);

// ——— el estado del mundo en t ———
function pose(t) {
  hinge.rotation.z = t < CLAP ? lerp(.55, 0, Math.pow(seg(t, CLAP - .28, CLAP), 2.2)) : Math.abs(Math.sin((t - CLAP) * 28)) * .05 * Math.exp(-(t - CLAP) * 9);
  const th = domAngles(t); DOM.forEach((d, i) => d.rotation.z = -th[i]);
  screenMat.emissiveIntensity = sm(seg(t, WAKE, WAKE + .35)); screenMat.envMapIntensity = .35 * (1 - seg(t, 18.0, 20.0));
  moteMat.uniforms.t.value = t;
}
// el comentario que se escribe en la pantalla del móvil
let uiOn = true;
function drawUI(t) {
  const a = seg(t, 20.4, 20.9) * (1 - seg(t, 24.4, 25.2));
  if (a <= 0) { if (uiOn) { UI.clearRect(0, 0, 540, 960); uiTex.needsUpdate = true; uiOn = false; } return; }
  uiOn = true; const q = UI; q.clearRect(0, 0, 540, 960);
  q.globalAlpha = a; q.fillStyle = 'rgba(10,10,12,.86)'; q.beginPath(); q.roundRect(24, 760, 492, 150, 30); q.fill();
  q.fillStyle = '#e8456b'; q.beginPath(); q.arc(84, 835, 34, 0, Math.PI * 2); q.fill();
  q.fillStyle = '#fff'; q.font = '700 30px "Plex"'; q.fillText('tú', 69, 845);
  const word = 'VÍDEO', n = Math.floor(clamp((t - 21.0) / .9) * word.length + 1e-6);
  q.fillStyle = 'rgba(255,255,255,.55)'; q.font = '500 24px "Plex"'; q.fillText('Añade un comentario…', 138, 800);
  q.fillStyle = '#fff'; q.font = '700 46px "Plex"'; q.fillText(word.slice(0, n) + (Math.floor(t * 2.5) % 2 && n < 5 ? '|' : ''), 138, 862);
  if (t > 22.2) { const s = 1 + .15 * Math.exp(-(t - 22.2) * 7); q.save(); q.translate(470, 835); q.scale(s, s); q.fillStyle = '#e8456b'; q.font = '700 44px "Plex"'; q.textAlign = 'center'; q.fillText('↑', 0, 15); q.restore(); }
  q.globalAlpha = 1; uiTex.needsUpdate = true;
}

// ——— la cadena de imagen: HDR → obturador → desenfoque por profundidad → ACES ———
const sceneRT = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(W, H) });
const accRT = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, depthBuffer: false });
const halfA = new THREE.WebGLRenderTarget(W / 2, H / 2, { type: THREE.HalfFloatType, depthBuffer: false });
const halfB = new THREE.WebGLRenderTarget(W / 2, H / 2, { type: THREE.HalfFloatType, depthBuffer: false });
const fsScene = new THREE.Scene(), fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), fsMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); fsMesh.frustumCulled = false; fsScene.add(fsMesh);
const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';
const LENS = `uniform float zf, A, maxR, near, far;
  #include <packing>
  float coc(float z){ return min(A * abs(z - zf) / z, maxR); }`;
const mat = (u, fs, o = {}) => new THREE.ShaderMaterial({ uniforms: u, vertexShader: VS, fragmentShader: fs, depthTest: false, depthWrite: false, ...o });
const lensU = () => ({ zf: { value: 1 }, A: { value: 40 }, maxR: { value: 46 }, near: { value: camera.near }, far: { value: camera.far } });
const accMat = mat({ tSrc: { value: null }, w: { value: 1 } }, 'uniform sampler2D tSrc; uniform float w; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tSrc, vUv) * w; }',
  { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, toneMapped: false });
const preMat = mat({ tCol: { value: null }, tDepth: { value: sceneRT.depthTexture }, ...lensU() }, `${LENS}
  uniform sampler2D tCol, tDepth; varying vec2 vUv;
  void main(){ float z = -perspectiveDepthToViewZ(texture2D(tDepth, vUv).x, near, far); gl_FragColor = vec4(texture2D(tCol, vUv).rgb, z); }`, { toneMapped: false });
const gatherMat = mat({ tHalf: { value: halfA.texture }, hpx: { value: new THREE.Vector2(2 / W, 2 / H) }, ...lensU() }, `${LENS}
  uniform sampler2D tHalf; uniform vec2 hpx; varying vec2 vUv;
  void main(){
    vec4 C = texture2D(tHalf, vUv); float zc = C.a, cc = coc(zc) * .5, cover = cc, tot = 1.; vec3 acc = C.rgb;
    float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715)))) * 6.2831853, R = maxR * .5;
    for (int i = 0; i < 80; i++) {
      float fi = float(i) + .5, r = sqrt(fi / 80.) * R, a = fi * 2.39996323 + jit;
      vec4 S = texture2D(tHalf, vUv + vec2(cos(a), sin(a)) * r * hpx); float cs = coc(S.a) * .5;
      if (S.a > zc) cs = min(cs, cc * 2.);
      float m = smoothstep(r - 1., r + 1., cs);
      acc += mix(acc / tot, S.rgb, m); tot += 1.;
      if (S.a < zc) cover = max(cover, cs * m);
    }
    gl_FragColor = vec4(acc / tot, cover);
  }`, { toneMapped: false });
const compMat = mat({ tCol: { value: null }, tDepth: { value: sceneRT.depthTexture }, tBlur: { value: halfB.texture }, ca: { value: .0016 }, ...lensU() }, `${LENS}
  uniform sampler2D tCol, tDepth, tBlur; uniform float ca; varying vec2 vUv;
  void main(){
    vec2 d = (vUv - .5) * ca;
    vec3 sharp = vec3(texture2D(tCol, vUv - d).r, texture2D(tCol, vUv).g, texture2D(tCol, vUv + d).b);
    vec4 B = texture2D(tBlur, vUv); vec3 blur = vec3(texture2D(tBlur, vUv - d).r, B.g, texture2D(tBlur, vUv + d).b);
    float z = -perspectiveDepthToViewZ(texture2D(tDepth, vUv).x, near, far);
    float f = smoothstep(1., 3., max(coc(z), B.a * 2.));
    gl_FragColor = vec4(mix(sharp, blur, f), 1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`);
function pass(m, target) { fsMesh.material = m; renderer.setRenderTarget(target); renderer.render(fsScene, fsCam); }
let shadowKey = '';
function drawScene(t, jx = 0, jy = 0) {   // jx, jy: desplazamiento de subpíxel de esta muestra (antialias por acumulación)
  pose(t); drawUI(t);
  const key = hinge.rotation.z.toFixed(5) + DOM.map(d => d.rotation.z.toFixed(5)).join();
  if (key !== shadowKey) { shadowKey = key; renderer.shadowMap.needsUpdate = true; }
  const c = camAt(t); camera.position.copy(c.p); camera.up.copy(c.up); camera.lookAt(c.q);
  if (jx || jy) camera.setViewOffset(W, H, jx, jy, W, H); else camera.clearViewOffset();
  renderer.setRenderTarget(sceneRT); renderer.render(scene, camera);
}
const halton = (i, b) => { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };
// obturador: más muestras cuando la imagen corre (la claqueta y las fichas también se emborronan)
// cuánto se mueve la imagen en píxeles mientras el obturador está abierto (1/60 s): puntos en el centro y hacia los
// bordes, a la distancia de enfoque y a 30 cm (lo más cerca que pasa la cámara de algo), vistos al abrir y al cerrar
const pcam = new THREE.PerspectiveCamera(FOV, W / H, .01, 12);
function blurPx(t) {
  const c = camAt(t), f = c.q.clone().sub(c.p), zf = f.length(); f.normalize();
  const r = new THREE.Vector3().crossVectors(f, c.up).normalize(), u = new THREE.Vector3().crossVectors(r, f), pts = [];
  for (const z of [zf, Math.min(zf, .3)]) {
    const hh = z * Math.tan(THREE.MathUtils.degToRad(FOV) / 2) * .8, hw = hh * W / H, o = c.p.clone().addScaledVector(f, z);
    for (const [a, b] of [[0, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]]) pts.push(o.clone().addScaledVector(r, a * hw).addScaledVector(u, b * hh));
  }
  const proj = tt => { const k = camAt(tt); pcam.position.copy(k.p); pcam.up.copy(k.up); pcam.lookAt(k.q); pcam.updateMatrixWorld(); return pts.map(p => p.clone().project(pcam)); };
  const A = proj(t - .25 / FPS), B = proj(t + .25 / FPS);
  return Math.max(...A.map((a, i) => Math.hypot((a.x - B[i].x) * W / 2, (a.y - B[i].y) * H / 2)));
}
// muestras de obturador: una cada ~6 px de recorrido; más mientras caen las fichas y en el golpe de la claqueta
function samples(t) {
  const n = 2 * Math.ceil(blurPx(t) / 12) + 1, dom = t > DT0 && t < WAKE ? 7 : 3, clap = t > CLAP - .3 && t < CLAP + .05 ? 9 : 3;
  return Math.min(11, Math.max(3, n, dom, clap));
}
function frame3D(t, target) {
  const n = samples(t); let src = sceneRT.texture;
  if (n > 1) {
    renderer.setRenderTarget(accRT); renderer.setClearColor(0x000000, 0); renderer.clear();
    const mid = (n - 1) / 2, order = [...Array(n).keys()].filter(i => i !== mid).concat(mid);   // la muestra central, la última (su profundidad manda)
    for (const i of order) { drawScene(t + (i / (n - 1) - .5) * (.5 / FPS), i === mid ? 0 : halton(i + 1, 2) - .5, i === mid ? 0 : halton(i + 1, 3) - .5); accMat.uniforms.tSrc.value = sceneRT.texture; accMat.uniforms.w.value = 1 / n; pass(accMat, accRT); }
    src = accRT.texture;
  } else drawScene(t);
  const c = camAt(t), zf = c.p.distanceTo(c.q), A = 21 / zf;
  for (const m of [preMat, gatherMat, compMat]) { m.uniforms.zf.value = zf; m.uniforms.A.value = A; }
  moteMat.uniforms.zf.value = zf; moteMat.uniforms.A.value = A;
  preMat.uniforms.tCol.value = src; pass(preMat, halfA);
  pass(gatherMat, halfB);
  compMat.uniforms.tCol.value = src; pass(compMat, target);
}

// ——— grano de película (seis placas, deterministas) y viñeta ———
const GRAIN = Array.from({ length: 6 }, (_, k) => { const c = document.createElement('canvas'); c.width = 540; c.height = 960; const q = c.getContext('2d'), d = q.createImageData(540, 960); for (let i = 0; i < d.data.length; i += 4) { const v = 128 + (hash(i * .37 + k * 91.7) - .5) * 70; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; } q.putImageData(d, 0, 0); return c; });
const F0 = document.createElement('canvas'); F0.width = W; F0.height = H; let f0done = false;
function captureF0() {   // el primer fotograma: a la pantalla del móvil (HDR) y guardado para cerrar el bucle
  screen.visible = ui.visible = false;
  frame3D(0, F0RT); frame3D(0, null); F0.getContext('2d').drawImage(gl, 0, 0);
  screen.visible = ui.visible = true; f0done = true;
}

// cierre del bucle: desde 25.2 s la pantalla del móvil se pinta con el primer fotograma en 2D, nítido y con el mismo
// obturador; al llenar el cuadro es exactamente el fotograma 0
const TMP = document.createElement('canvas'); TMP.width = W; TMP.height = H; const TQ = TMP.getContext('2d');
const corners = [-1, 1].map(k => new THREE.Vector3(PX + k * SCW / 2, SCY, k * SCL / 2));
function screenRect(t) {
  const c = camAt(t); camera.position.copy(c.p); camera.up.copy(c.up); camera.lookAt(c.q); camera.updateMatrixWorld();
  const [a, b] = corners.map(v => v.clone().project(camera));
  const x0 = (Math.min(a.x, b.x) + 1) / 2 * W, x1 = (Math.max(a.x, b.x) + 1) / 2 * W, y0 = (1 - Math.max(a.y, b.y)) / 2 * H, y1 = (1 - Math.min(a.y, b.y)) / 2 * H;
  return [x0, y0, x1 - x0, y1 - y0];
}
function loopClose(t) {
  const a = sm(seg(t, 25.2, 25.5)); if (a <= 0) return;
  const n = samples(t); TQ.clearRect(0, 0, W, H);
  for (let i = 0; i < n; i++) { TQ.globalAlpha = 1 / (i + 1); TQ.drawImage(F0, ...screenRect(n > 1 ? t + (i / (n - 1) - .5) * (.5 / FPS) : t)); }
  V.globalAlpha = a; V.drawImage(TMP, 0, 0); V.globalAlpha = 1;
}

// ——— rótulos: blanco, discretos, como un documental ———
const LINES = [
  [.1, 4.4, 'UNA SOLA TOMA', 'Este vídeo no tiene ni un corte.'],
  [4.8, 9.4, 'REGLA 1', 'La cámara no corta: viaja.'],
  [9.8, 14.9, 'REGLA 2', 'Cada movimiento empuja al siguiente.'],
  [15.3, 19.8, 'REGLA 3', 'El final te devuelve al principio.'],
];
let TX = [];
function wrap(s, size, maxW) { V.font = `600 ${size}px "Plex"`; const ws = s.split(' '), out = []; let cur = ''; for (const w of ws) { const tt = cur ? cur + ' ' + w : w; if (cur && V.measureText(tt).width > maxW) { out.push(cur); cur = w; } else cur = tt; } out.push(cur); return out; }
function scrim(a, top) { const g = top ? V.createLinearGradient(0, 0, 0, 640) : V.createLinearGradient(0, H, 0, H - 700); g.addColorStop(0, `rgba(8,5,3,${.62 * a})`); g.addColorStop(1, 'rgba(8,5,3,0)'); V.fillStyle = g; V.fillRect(0, top ? 0 : H - 700, W, 700); }
function captions(t, rep) {
  for (const [a, b, kick, s] of LINES) {
    const u = seg(t, a, a + .5), o = seg(t, b - .4, b); if (u <= 0 || o >= 1) continue;
    const al = sm(u) * (1 - sm(o)), dy = (1 - sm(u)) * 24;
    scrim(al, true);
    V.save(); V.globalAlpha = al; V.shadowColor = 'rgba(0,0,0,.5)'; V.shadowBlur = 16;
    V.font = '500 28px "PlexMono"'; V.letterSpacing = '6px'; V.fillStyle = 'rgba(255,214,170,.95)'; V.textAlign = 'left'; V.fillText(kick, 84, 300 + dy);
    V.letterSpacing = '-1px'; const lines = wrap(s, 64, 900); V.font = '600 64px "Plex"'; V.fillStyle = '#fff';
    lines.forEach((l, j) => V.fillText(l, 84, 380 + j * 76 + dy)); V.restore();
    if (rep && u >= 1 && o <= 0) { TX.push({ id: kick, text: kick, x0: 80, y0: 270, x1: 600, y1: 310 }); TX.push({ id: kick + '-l', text: s, x0: 80, y0: 330, x1: 1000, y1: 400 + (lines.length - 1) * 76 }); }
  }
  // la llamada final, alrededor del móvil
  const ca = seg(t, 20.1, 20.7) * (1 - seg(t, 24.4, 25.0));
  if (ca > 0) {
    scrim(ca * .8, true); scrim(ca * .8, false);
    V.save(); V.globalAlpha = ca; V.shadowColor = 'rgba(0,0,0,.6)'; V.shadowBlur = 20; V.textAlign = 'center';
    V.font = '600 58px "Plex"'; V.fillStyle = '#fff'; V.fillText('¿Quieres vídeos así', 540, 222); V.fillText('para tu negocio?', 540, 292);
    V.font = '700 72px "Plex"'; V.fillStyle = '#ffd6aa'; V.fillText('Comenta «VÍDEO»', 540, 1500);
    V.font = '500 34px "PlexMono"'; V.fillStyle = 'rgba(255,255,255,.88)'; V.fillText('y te enseñamos cómo · @klima.io', 540, 1564); V.restore();
    if (rep && ca >= 1) { TX.push({ id: 'q', text: '¿Quieres vídeos así para tu negocio?', x0: 140, y0: 165, x1: 940, y1: 310 }); TX.push({ id: 'cta', text: 'Comenta «VÍDEO»', x0: 240, y0: 1440, x1: 840, y1: 1515 }); TX.push({ id: 'cta2', text: 'y te enseñamos cómo · @klima.io', x0: 200, y0: 1530, x1: 880, y1: 1575 }); }
  }
}

window.render = (t) => {
  t = clamp(t, 0, DUR - 1e-4); TX = [];
  if (Q.has('text')) { V.clearRect(0, 0, W, H); captions(t, true); return; }   // solo rótulos (readcheck), sin 3D
  if (!f0done) captureF0();
  frame3D(t, null);
  V.globalAlpha = 1; V.drawImage(gl, 0, 0);
  loopClose(t);
  V.save(); V.globalCompositeOperation = 'overlay'; V.globalAlpha = .15; V.drawImage(GRAIN[Math.floor(t * FPS) % 6], 0, 0, W, H); V.restore();
  const vg = V.createRadialGradient(W / 2, H / 2, H * .32, W / 2, H / 2, H * .78); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.45)'); V.fillStyle = vg; V.fillRect(0, 0, W, H);
  captions(t, true);
};
// golpes para el sonido
const LAND = DT0 + (DN - 1) * DDT + DFALL, BARLEN = (LAND - CLAP) / 5;   // la música: la claqueta y la última ficha caen en compás
const EV = [{ t: 0, type: 'meta', bpm: +(240 / BARLEN).toFixed(4), bar0: CLAP, dur: DUR }, { t: CLAP, type: 'clap' }];
EV.push({ t: DT0, type: 'push' }); for (let i = 1; i < DN; i++) EV.push({ t: +(DT0 + i * DDT).toFixed(3), type: 'domino', i }); EV.push({ t: +LAND.toFixed(3), type: 'land' });
EV.push({ t: +WAKE.toFixed(3), type: 'wake' }); for (let k = 0; k < 5; k++) EV.push({ t: +(21.0 + k * .18).toFixed(3), type: 'key' }); EV.push({ t: 22.2, type: 'send' }, { t: 24.0, type: 'dive' });
window.SAMPLES = () => Array.from({ length: Math.round(DUR * FPS) }, (_, f) => samples(f / FPS));
window.EV = EV; window.DUR = DUR; window.TEXTS = () => TX; window.READY = true;
