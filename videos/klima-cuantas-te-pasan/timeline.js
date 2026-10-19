// La única fuente de verdad del tiempo: golpes, cámara y rótulos. La imagen y el sonido salen de aquí.
// 120 BPM (negra = 0,5 s); el compás 1 cae en 0,5 s. Cada capítulo dura cuatro compases (una vuelta de acordes).
export const BPM = 120, BAR0 = .5, DUR = 62, FPS = 30;

export const CH = [4.5, 12.5, 20.5, 28.5, 36.5, 44.5];      // empieza cada capítulo (llega la cámara)
export const snapAt = (k, i) => CH[k] + i * .5;              // la tarjeta se pone derecha, una por pulso
export const flipAt = (k, i) => CH[k] + 1.5 + i * .5;        // la chispa la toca y gira: tres pulsos después
export const FLIP_D = .34;
export const setAt = k => CH[k] + 4.0;                        // el golpe propio de cada capítulo
export const leaveAt = k => CH[k] + 7.25;                     // látigo al siguiente
export const landAt = (k, i) => .5 + (k * 5 + i) * .042 + ((k * 5 + i) * 37 % 11) / 11 * .05;   // al empezar, caen todas

export const T = {
  hit: .5,                  // las tarjetas tocan el tablero
  ask: 1.1,                 // «¿Cuántas te pasan?»
  dive: [3.75, 4.5],        // la cámara se mete en el primer bloque
  tear: CH[5] + 1.5 + 4 * .5,   // la última no gira: se rompe el contrato
  pull: [51.75, 52.5],      // la cámara sale al tablero entero, ya resuelto
  q: 52.9,                  // «¿Cuántas te pasaban?»
  swarm: [54.5, 56.3],      // las 30 vuelan y forman el logo
  close: [56.15, 56.45],    // se cierran los huecos
  a: 55.0,                  // «Ya ninguna.»
  logo: 56.5,
  word: 57.05,
  chips: 57.5,
  cta: 57.95,
  ctaTap: 59.0,
  still: 59.6,              // desde aquí, quieto hasta el final
};

// [t, encuadre, curva hasta la clave siguiente]. lin = deriva con la mano del operador · hold = quieta del todo
export const CAM = [
  [0, 'hook0', 'lin'], [T.dive[0], 'hook', 'expoInOut'],
  ...CH.flatMap((c, k) => [[c, `c${k}`, 'lin'], [leaveAt(k), `c${k}b`, 'expoInOut']]),
  [T.pull[1], 'board', 'hold'], [T.swarm[0] - .1, 'board', 'cubic'],
  [T.logo, 'logo', 'expoInOut'], [T.logo + .9, 'end', 'hold'], [DUR, 'end', 'hold'],
];

// rótulos de pantalla: [id, entra, sale, líneas (palabras; *así* = en rosa), cuerpo, línea base de la primera]
export const CAPTIONS = [
  ['ask', T.ask, T.dive[0] + .3, [['¿Cuántas', 'te', '*pasan?*']], 84, 1012],
  ['q', T.q, DUR + 1, [['¿Cuántas', 'te', 'pasaban?']], 80, 318],
  ['a', T.a, DUR + 1, [['*Ya*', '*ninguna.*']], 96, 432],
];
