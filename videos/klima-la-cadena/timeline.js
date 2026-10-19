// La única fuente de verdad del tiempo: golpes, cámara y rótulos. La imagen y el sonido salen de aquí.
// 120 BPM (negra = 0,5 s); el compás 1 cae en 0,5 s, así que los compases empiezan en 0,5 · 2,5 · 4,5 · 6,5 …
export const BPM = 120, BAR0 = .5, DUR = 32, FPS = 30;

export const T = {
  hit: .5,                 // la chispa golpea el rollo de la foto: sale la cinta
  paper: [.5, 1.5],        // la cinta termina de salir del cabezal
  print: [2.0, 3.4],       // la huella se imprime carácter a carácter
  seal: 4.5,               // cae el lacre
  dive: [4.95, 5.3],       // la cámara se mete en la huella
  fly: [5.2, 5.8],         // los 64 caracteres saltan a la rejilla
  cent: 6.3,               // la chispa sube un céntimo
  aval: 6.5,               // avalancha: la huella entera cambia
  back: [8.4, 8.9],        // la rejilla vuelve a su línea
  links: [9.0, 9.5],       // se dibujan los enlaces entre huellas
  pluck: 9.85,             // la chispa quita un cero a una factura vieja
  glitch: [10.0, 10.3],
  crack: [10.1, 10.45],
  wave: [10.5, 11.25],     // la rotura sube por la cadena
  freeze: [11.3, 11.6],
  rewind: [11.6, 12.2],
  green: [12.2, 12.5],     // cascada de comprobaciones
  verifactu: 12.5,         // el sello grande
  rest: [12.9, 14.45],     // pausa quieta de verdad
  implode: [14.45, 14.62],
  payTap: 15.6,            // la chispa toca «Pagar con Bizum»
  sheet: [15.8, 16.5],     // la hoja de Bizum sube y baja
  confirm: 16.2,
  notif: 16.45,            // llega el aviso de pago
  paid: 16.7,              // «Pagada»
  ledger: [18.85, 19.2],   // el asiento se escribe solo
  balance: 19.5,           // Debe = Haber
  iva: [22.15, 22.55],     // el IVA vuela del asiento a Hacienda
  odo: [22.55, 23.3],      // el contador sube
  breath: [24.5, 25.0],    // casi silencio
  reveal: [25.0, 26.4],    // la cámara sale: todo era la K
  kfill: [26.05, 26.4],
  logo: 26.5,              // la chispa aterriza en su esquina
  word: 27.0,
  tag: 27.4,
  chips: 27.9,
  cta: 28.35,
  ctaTap: 29.35,
  still: 29.85,             // desde aquí, quieto hasta el final
};

// [t, encuadre, curva hasta la clave siguiente]. lin = deriva con la mano del operador · hold = quieta del todo
export const CAM = [
  [0, 'hook0', 'lin'], [4.95, 'hook', 'expoInOut'],
  [5.3, 'hash', 'lin'], [8.4, 'hash2', 'expoInOut'],
  [8.95, 'chain', 'lin'], [9.55, 'chain1', 'expoInOut'],
  [9.85, 'tamper', 'lin'], [10.3, 'tamper2', 'expoInOut'],
  [10.5, 'chain', 'hold'], [12.5, 'chain', 'expoOut'],
  [12.75, 'chainV', 'hold'], [14.55, 'chainV', 'expoInOut'],
  [14.95, 'cobro', 'lin'], [18.55, 'cobro2', 'expoInOut'],
  [18.85, 'conta', 'lin'], [21.85, 'conta2', 'expoInOut'],
  [22.15, 'hacienda', 'lin'], [24.5, 'hacienda2', 'hold'],
  [25.0, 'hacienda2', 'expoInOut'], [25.9, 'reveal', 'lin'], [26.45, 'reveal2', 'expoInOut'],
  [27.25, 'logo', 'hold'], [DUR, 'logo', 'hold'],
];

// rótulos: [id, entra, sale, líneas (palabras; *así* = la palabra en Fraunces cursiva), cuerpo, línea base de la primera]
export const CAPTIONS = [
  ['hook', -.35, 4.6, [['Una', 'factura'], ['que', 'ya', 'no', 'se'], ['puede', '*tocar*.']], 100, 330],
  ['cent', 5.55, 8.55, [['Cambia', 'un', '*céntimo*…']], 78, 330],
  ['todo', 6.45, 9.35, [['…y', 'cambia', '*todo*.']], 112, 1580],
  ['rompe', 8.67, 12.4, [['Toca', 'una', 'y', 'se'], ['*rompe*', 'la', 'cadena.']], 88, 320],
  ['verifactu', 12.52, 15.4, [['Cumple', '*Verifactu*.']], 96, 330],
  ['bizum', 15.52, 18.6, [['Te', 'pagan', 'con', '*Bizum*.']], 88, 330],
  ['conta', 18.72, 21.9, [['La', 'contabilidad,'], ['*sola*.']], 88, 320],
  ['hacienda', 22.02, 24.9, [['*Hacienda*,', 'al', 'día.']], 92, 330],
];
