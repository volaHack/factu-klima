/* ------------------------------------------------------------------ *
 * La cinta del héroe: cinco registros de un día de mostrador.
 *
 * ChainDemo calcula sus huellas en el navegador con `crypto.subtle`
 * porque allí el usuario altera un importe y hay que recalcular. Aquí no
 * se altera nada: la cinta sólo se imprime al hacer scroll, así que las
 * huellas van escritas y el héroe no arrastra ni un byte de JavaScript.
 *
 * Escritas, pero no inventadas. Son SHA-256 de verdad, encadenadas con
 * el mismo esquema y la misma preimagen que ChainDemo, y `cintaHero.test`
 * las vuelve a calcular en cada `npm test`. Si alguien toca un importe de
 * esta tabla y no regenera la cadena, el test se cae — que es justo lo
 * que vende la página.
 * ------------------------------------------------------------------ */

export interface RegistroCinta {
  /** Nº de registro tal y como sale impreso. */
  num: string;
  fecha: string;
  hora: string;
  cliente: string;
  /** Base imponible en euros. El total impreso es base + 21 % de IVA. */
  base: number;
  /** Huella del registro anterior. La del primero es la semilla a cero. */
  anterior: string;
  /** SHA-256( num · fecha · total · anterior ). */
  huella: string;
}

export const IVA = 0.21;

export const HUELLA_CERO = '0'.repeat(64);

export const total = (base: number) => Math.round(base * (1 + IVA) * 100) / 100;

/** Lo que se firma. Idéntico al de ChainDemo, a propósito. */
export const preimagen = (r: Pick<RegistroCinta, 'num' | 'fecha' | 'base'>, anterior: string) =>
  `${r.num}|${r.fecha}|${total(r.base).toFixed(2)}|${anterior}`;

/**
 * Del más nuevo al más antiguo: es el orden en que cuelgan del rollo.
 * El papel sale por arriba y empuja hacia abajo, así que lo primero que
 * se imprimió acaba siendo lo que queda más lejos del cabezal.
 */
export const CINTA: RegistroCinta[] = [
  {
    num: 'FAC-2026/0148',
    fecha: '2026-03-13',
    hora: '13:56',
    cliente: 'Viveros del Sur',
    base: 405.6,
    anterior: '6c3bc716df01eac7863501855d3b148ed88fa7fb1669d67e9a11f2fa1038faac',
    huella: '11b08cd7f12fd8c67be016e70f2ea56774ac3d2b981cd21c05d2f0379ff77216',
  },
  {
    num: 'FAC-2026/0147',
    fecha: '2026-03-13',
    hora: '10:31',
    cliente: 'Óptica Navarro',
    base: 128,
    anterior: '9fc90d16c47021a817fd7d1424f4ae98fb12f274cd0a9afbb511360d2b136f2b',
    huella: '6c3bc716df01eac7863501855d3b148ed88fa7fb1669d67e9a11f2fa1038faac',
  },
  {
    num: 'FAC-2026/0146',
    fecha: '2026-03-12',
    hora: '17:05',
    cliente: 'Bar La Estación',
    base: 312.75,
    anterior: '7312f131710002acf9c5bd8a3fb3fa39d282173262600241f39fdabf8ae32133',
    huella: '9fc90d16c47021a817fd7d1424f4ae98fb12f274cd0a9afbb511360d2b136f2b',
  },
  {
    num: 'FAC-2026/0145',
    fecha: '2026-03-12',
    hora: '11:48',
    cliente: 'Ferretería Central',
    base: 74.2,
    anterior: '9c859c11159913135c60bbc69488ffc5a5fe8e84eb023e94995a93717d10efbf',
    huella: '7312f131710002acf9c5bd8a3fb3fa39d282173262600241f39fdabf8ae32133',
  },
  {
    num: 'FAC-2026/0144',
    fecha: '2026-03-12',
    hora: '09:12',
    cliente: 'Panadería El Trigo',
    base: 186.4,
    anterior: HUELLA_CERO,
    huella: '9c859c11159913135c60bbc69488ffc5a5fe8e84eb023e94995a93717d10efbf',
  },
];

/** Diez y diez: bastante huella para que se lea como huella. */
export const corta = (h: string) => `${h.slice(0, 10)}…${h.slice(-10)}`;

export const euros = (n: number) =>
  n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
