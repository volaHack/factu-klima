// La única fuente de verdad del tiempo: voces, cámara, pruebas y golpes. La imagen, el sonido y la partitura
// salen de aquí. 120 BPM (negra = 0,5 s); dos tiempos de anacrusa y el compás 0 cae en 1,0 s. Los movimientos de
// cámara y los golpes caen en negras o en corcheas.
export const BPM = 120, BEAT = .5;
export const DUR = 53;

// [t, quién, dónde se lee]  · plate = placa de subtítulo abajo · none = ya lo dice un rótulo
// (título, cartel de prueba, veredicto, cartel final)
export const VO = {
  h1: [0.04, 'host', 'plate'], h2: [2.02, 'host', 'none'], c1: [3.25, 'host', 'none'],
  j1: [5.10, 'javier', 'plate'], e1: [7.25, 'host', 'plate'], s1: [8.85, 'host', 'none'],
  c2: [10.53, 'host', 'none'], j2: [12.00, 'javier', 'plate'], e2: [13.80, 'host', 'plate'], s2: [15.85, 'host', 'none'],
  c3: [17.06, 'host', 'none'], e3: [17.95, 'host', 'plate'], s3: [20.35, 'host', 'none'],
  c4: [21.55, 'host', 'none'], j4: [22.52, 'javier', 'plate'], e4: [24.40, 'host', 'plate'], s4: [26.35, 'host', 'none'],
  c5: [27.55, 'host', 'none'], e5: [28.70, 'host', 'plate'], s5: [30.97, 'host', 'none'],
  b1: [32.05, 'host', 'none'],
  f1: [38.03, 'host', 'plate'], l2: [40.62, 'lucia', 'plate'], f2: [42.47, 'host', 'plate'],
  s6: [44.47, 'host', 'none'], j7: [45.35, 'javier', 'plate'], f3: [47.55, 'host', 'none'], f4: [50.30, 'host', 'none'],
};

// start = empieza la prueba · judge = veredicto (la palabra y el punto) · flight = el trofeo vuela a su hueco
// phone = la cámara llega al móvil de Lucía (de ahí cuentan los tiempos de su pantalla)
export const ROUNDS = {
  1: { set: 'r1', pat: 'stripes', name: 'LA FACTURA', word: '¡PERFECTO!', icon: 'invoice', start: 5.0, judge: 9.0, phone: 6.5 },
  2: { set: 'r2', pat: 'dots', name: 'EL COBRO', word: '¡COBRADA!', icon: 'coin', start: 10.5, judge: 16.0, phone: 13.5 },
  3: { set: 'r3', pat: 'stripes', name: 'LOS GASTOS', word: '¡APUNTADO!', icon: 'ticket', start: 17.0, judge: 20.5, phone: 18.25 },
  4: { set: 'r4', pat: 'rays', name: 'EL TRIMESTRE', word: '¡A TIEMPO!', icon: 'calendar', start: 21.5, judge: 26.5, phone: 24.0 },
  5: { set: 'r5', pat: 'dots', name: 'LA CONTABILIDAD', word: '¡CUADRADO!', icon: 'book', start: 27.5, judge: 31.0, phone: 28.75 },
};
export const FLY = .4, FLYD = .5;   // el trofeo despega 0,4 s después del veredicto y tarda 0,5 s

// ——— la cámara: un solo plano, sin cortes ———
// [t, encuadre, zoom extra, curva hasta la clave siguiente]. Los encuadres (dónde está cada cosa en el plató) los
// define main.js. lin = deriva lenta · io = empujón · whip = barrido rápido con desenfoque · hold = quieta del todo
// (sin la mano del operador): en el móvil de Lucía, dentro del collage y en el cartel final. Las pausas quietas son las
// que hacen que los golpes peguen.
export const CAM = [
  [0, 'hostcu', 1, 'lin'], [1.0, 'hostcu', 1.035, 'whip'],
  [1.5, 'wide', 1, 'lin'], [5.0, 'wide', 1.03, 'io'],
  // prueba 1
  [5.35, 'jav', 1, 'lin'], [6.5, 'jav', 1.035, 'whip'], [6.85, 'phone', 1, 'hold'], [8.7, 'phone', 1, 'io'],
  [9.0, 'wide', 1, 'lin'], [10.5, 'wide', 1.025, 'whip'],
  // prueba 2
  [10.85, 'card', 1, 'lin'], [12.0, 'card', 1.03, 'whip'], [12.3, 'jav', 1, 'lin'], [13.5, 'jav', 1.035, 'whip'],
  [13.85, 'phone', 1, 'hold'], [15.7, 'phone', 1, 'io'], [16.0, 'wide', 1, 'lin'], [17.0, 'wide', 1.02, 'io'],
  // prueba 3
  [17.3, 'jav', 1, 'lin'], [18.25, 'jav', 1.03, 'whip'], [18.6, 'phone', 1, 'hold'], [20.2, 'phone', 1, 'io'],
  [20.5, 'wide', 1, 'lin'], [21.5, 'wide', 1.02, 'whip'],
  // prueba 4
  [21.85, 'card', 1, 'lin'], [22.75, 'card', 1.025, 'whip'], [23.05, 'jav', 1, 'lin'], [24.0, 'jav', 1.03, 'whip'],
  [24.35, 'phone', 1, 'hold'], [26.2, 'phone', 1, 'io'], [26.5, 'wide', 1, 'lin'], [27.5, 'wide', 1.02, 'io'],
  // prueba 5
  [27.8, 'jav', 1, 'lin'], [28.75, 'jav', 1.03, 'whip'], [29.1, 'phone', 1, 'hold'], [30.7, 'phone', 1, 'io'],
  [31.0, 'wide', 1, 'lin'], [32.0, 'wide', 1.02, 'whip'],
  // ronda extra: dentro de la pantalla gigante (collage)
  [32.55, 'vw', 1, 'hold'], [37.55, 'vw', 1, 'whip'],
  // final, noche, Javier gana, logo y telón
  [38.0, 'wide', 1, 'lin'], [41.5, 'wide', 1.02, 'io2'], [44.0, 'night', 1, 'io'], [44.4, 'win', 1, 'lin'],
  [46.3, 'win', 1.05, 'io'], [46.75, 'wide', 1, 'hold'], [DUR, 'wide', 1, 'lin'],
];
export const score = t => [1, 2, 3, 4, 5].filter(r => t >= ROUNDS[r].judge).length;
export const landed = (r, t) => t >= ROUNDS[r].judge + FLY + FLYD;
export const roundAt = t => { let r = 0; for (const i of [1, 2, 3, 4, 5]) if (t >= ROUNDS[i].start) r = i; return t >= 32 ? 0 : r; };

// momentos clave
export const BELL = 5.0, BONUS = 32.0, FINAL = 38.0, NIGHT = [41.5, 44.0], WIN = 44.5, LOGO = 47.1, ASK = 49.75;
export const CURTAIN = [47.15, 47.5];   // el telón cae detrás del logo
// la ronda extra: [etiqueta, cuándo aterriza el recorte, recorte]; los tres primeros, con la palabra que dice la voz
export const STICKERS = [
  ['TPV para tu tienda', 32.85, 'tpv'], ['Presupuestos', 33.45, 'presupuesto'], ['Factura electrónica', 34.25, 'fe'],
  ['Recordatorios de cobro', 34.55, 'recordatorios'], ['Varias empresas', 34.8, 'empresas'], ['Asistente con IA', 35.05, 'asistente'],
];
export const MORE = 35.4;    // el disco «y mucho más», con «y mucho más» de la voz
