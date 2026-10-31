/**
 * EL CÓDIGO POSTAL RELLENA LA PROVINCIA (Y EN CANARIAS, EL MUNICIPIO)
 *
 * Los dos primeros dígitos de un código postal español son la provincia:
 * 35 es Las Palmas y 38 Santa Cruz de Tenerife, en toda España igual. Con
 * eso basta para no tener que buscar la provincia en una lista de 52.
 *
 * Para Canarias, donde trabaja el primer cliente, se va un paso más allá:
 * una tabla con los códigos postales de los 88 municipios de las islas
 * (la relación pública de códigos por municipio de Correos, con el código
 * INE de cada municipio). Hay códigos que comparten dos o tres municipios
 * —el 35220 es Jinámar, mitad Telde y mitad Las Palmas de Gran Canaria—:
 * entonces no se elige por nadie y se ofrecen los que son.
 *
 * Lo que alguien escribió a mano no se pisa nunca. Solo se rellena una
 * casilla vacía o una que rellenó esto mismo antes (y por tanto sigue la
 * pista del código postal si se corrige).
 */

/** Provincia de cada prefijo, escrita igual que en `PROVINCES` (constants.ts). */
const PROVINCIA_POR_PREFIJO: Record<string, string> = {
  '01': 'Álava', '02': 'Albacete', '03': 'Alicante', '04': 'Almería', '05': 'Ávila',
  '06': 'Badajoz', '07': 'Illes Balears', '08': 'Barcelona', '09': 'Burgos', '10': 'Cáceres',
  '11': 'Cádiz', '12': 'Castellón', '13': 'Ciudad Real', '14': 'Córdoba', '15': 'A Coruña',
  '16': 'Cuenca', '17': 'Girona', '18': 'Granada', '19': 'Guadalajara', '20': 'Guipúzcoa',
  '21': 'Huelva', '22': 'Huesca', '23': 'Jaén', '24': 'León', '25': 'Lleida',
  '26': 'La Rioja', '27': 'Lugo', '28': 'Madrid', '29': 'Málaga', '30': 'Murcia',
  '31': 'Navarra', '32': 'Ourense', '33': 'Asturias', '34': 'Palencia', '35': 'Las Palmas',
  '36': 'Pontevedra', '37': 'Salamanca', '38': 'Santa Cruz de Tenerife', '39': 'Cantabria', '40': 'Segovia',
  '41': 'Sevilla', '42': 'Soria', '43': 'Tarragona', '44': 'Teruel', '45': 'Toledo',
  '46': 'Valencia', '47': 'Valladolid', '48': 'Vizcaya', '49': 'Zamora', '50': 'Zaragoza',
  '51': 'Ceuta', '52': 'Melilla',
};

/*
 * Cada municipio con las tres últimas cifras de sus códigos: los de Las
 * Palmas empiezan por 35 y los de Santa Cruz de Tenerife por 38. Escrito
 * así se lee y se corrige a ojo; el índice por código se monta al cargar.
 */
const MUNICIPIOS_35: readonly [string, string][] = [
  ['Agaete', '468 480 489'],
  ['Agüimes', '118 260 269 270'],
  ['Antigua', '610 630 638 639'],
  ['Arrecife', '500 509'],
  ['Artenara', '350'],
  ['Arucas', '400 411 412 413 414 415'],
  ['Betancuria', '637'],
  ['Firgas', '430 431 432'],
  ['Gáldar', '460 468 469 488'],
  ['Haría', '520 541 542 543'],
  ['Ingenio', '240 250 259'],
  ['Mogán', '120 128 129 130 138 139 140 149'],
  ['Moya', '413 414 420 421 422 423'],
  ['La Oliva', '640 649 650 660'],
  ['Pájara', '625 626 627 628'],
  ['Las Palmas de Gran Canaria', '001 002 003 004 005 006 007 008 009 010 011 012 013 014 015 016 017 018 019 220 229'],
  ['Puerto del Rosario', '600 611 612 613 637'],
  ['San Bartolomé', '509 550 559'],
  ['San Bartolomé de Tirajana', '100 106 107 108 109 119 128 280 290 299 369'],
  ['La Aldea de San Nicolás', '470 478 479'],
  ['Santa Brígida', '017 300 307 308 309 310 319'],
  ['Santa Lucía de Tirajana', '110 119 280'],
  ['Santa María de Guía de Gran Canaria', '414 450 457 458 459 468'],
  ['Teguise', '507 508 530 539 540 544 558 560 561'],
  ['Tejeda', '360 368 369'],
  ['Telde', '200 210 211 212 213 214 215 218 219 220 230'],
  ['Teror', '018 330 333 338 339'],
  ['Tías', '510 571 572'],
  ['Tinajo', '560'],
  ['Tuineje', '620 629 638'],
  ['Valsequillo de Gran Canaria', '216 217'],
  ['Valleseco', '340 349'],
  ['Vega de San Mateo', '320 328 329'],
  ['Yaiza', '570 571 580'],
];

const MUNICIPIOS_38: readonly [string, string][] = [
  ['Adeje', '615 660 670 677 678 679'],
  ['Agulo', '830 890'],
  ['Alajeró', '810 811 812 813'],
  ['Arafo', '509 550'],
  ['Arico', '580 588 589 592 593'],
  ['Arona', '626 627 630 631 632 640 649 650 652'],
  ['Barlovento', '726 727'],
  ['Breña Alta', '700 710 713'],
  ['Breña Baja', '711 712'],
  ['Buenavista del Norte', '480 489'],
  ['Candelaria', '509 510 520 530 540'],
  ['Fasnia', '570 579'],
  ['Frontera', '911 912 913'],
  ['Fuencaliente de la Palma', '740 749'],
  ['Garachico', '450 458 459 460'],
  ['Garafía', '728 787 788'],
  ['Granadilla de Abona', '594 595 600 610 611 612 616 617 618 619'],
  ['La Guancha', '440 441 449'],
  ['Guía de Isora', '680 685 686 687 688 689'],
  ['Güímar', '500 508 560 590 591'],
  ['Hermigua', '820 829 869 890'],
  ['Icod de los Vinos', '430 434 438 439'],
  ['San Cristóbal de La Laguna', '108 201 202 203 204 205 206 207 208 240 250 260 270 291 293 294 296 297 320 329 330'],
  ['Los Llanos de Aridane', '759 760 767 768 769'],
  ['La Matanza de Acentejo', '370 379'],
  ['La Orotava', '300 310 311 312 313 314 315'],
  ['El Paso', '750 758 759 768 769'],
  ['Puerto de la Cruz', '400'],
  ['Puntagorda', '789'],
  ['Puntallana', '714 715'],
  ['Los Realejos', '410 412 413 414 415 416 417 418 419'],
  ['El Rosario', '109 190 290'],
  ['San Andrés y Sauces', '720 727 729'],
  ['San Juan de la Rambla', '420 428 429'],
  ['San Miguel de Abona', '620 628 629 632 639'],
  ['San Sebastián de la Gomera', '800 801 811'],
  ['Santa Cruz de la Palma', '700 714 715'],
  ['Santa Cruz de Tenerife', '001 002 003 004 005 006 007 008 009 010 107 110 111 120 129 130 139 140 150 160 170 180 294 320'],
  ['Santa Úrsula', '390 398 399'],
  ['Santiago del Teide', '683 684 690'],
  ['El Sauzal', '359 360'],
  ['Los Silos', '435 460 470 479'],
  ['Tacoronte', '340 350 355 356 357 358'],
  ['El Tanque', '435'],
  ['Tazacorte', '770 779'],
  ['Tegueste', '280 292 293'],
  ['Tijarafe', '780'],
  ['Valverde', '900 910 915 916'],
  ['Valle Gran Rey', '852 870 879 892'],
  ['Vallehermoso', '840 849 850 852 860 869 870 891'],
  ['La Victoria de Acentejo', '380 389'],
  ['Vilaflor de Chasna', '613 614 615 629'],
  ['Villa de Mazo', '730 738 739'],
  ['El Pinar de El Hierro', '914 917'],
];

/** Código postal → municipios, montado una vez. */
const MUNICIPIOS_POR_CP: ReadonlyMap<string, readonly string[]> = (() => {
  const mapa = new Map<string, string[]>();
  for (const [prefijo, tabla] of [['35', MUNICIPIOS_35], ['38', MUNICIPIOS_38]] as const) {
    for (const [municipio, finales] of tabla) {
      for (const f of finales.split(' ')) {
        const cp = prefijo + f;
        mapa.set(cp, [...(mapa.get(cp) ?? []), municipio]);
      }
    }
  }
  return mapa;
})();

/** Solo las cifras: «35 500», «35.500» o «CP 35500» son el 35500. */
export function limpiarCp(cp: string | null | undefined): string {
  return (cp ?? '').replace(/\D/g, '').slice(0, 5);
}

/** La provincia de un código postal (bastan los dos primeros dígitos), o null. */
export function provinciaDeCp(cp: string | null | undefined): string | null {
  const c = limpiarCp(cp);
  return c.length >= 2 ? PROVINCIA_POR_PREFIJO[c.slice(0, 2)] ?? null : null;
}

export function esCpCanario(cp: string | null | undefined): boolean {
  const p = limpiarCp(cp).slice(0, 2);
  return p === '35' || p === '38';
}

/** Los municipios de un código postal canario completo; vacío si no se conoce. */
export function municipiosDeCp(cp: string | null | undefined): readonly string[] {
  const c = limpiarCp(cp);
  return c.length === 5 ? MUNICIPIOS_POR_CP.get(c) ?? [] : [];
}

/** ¿Es un código postal español con forma de serlo? (cinco cifras, provincia 01–52). */
export function esCpValido(cp: string | null | undefined): boolean {
  const c = (cp ?? '').trim();
  return /^\d{5}$/.test(c) && provinciaDeCp(c) !== null;
}

const igual = (a: string, b: string) =>
  a.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase() === b.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

export interface CasillasLugar {
  provincia: string;
  municipio: string;
}

export interface RellenoPorCp {
  /** Lo que hay que poner en cada casilla; ausente = no se toca. */
  provincia?: string;
  municipio?: string;
  /** Varios municipios posibles y ninguno elegido: se ofrecen para elegir. */
  elegir: readonly string[];
}

/**
 * Qué rellenar al escribir un código postal.
 *
 * `actual` es lo que hay ahora en las casillas y `puesto` lo que puso esto
 * la última vez. Una casilla se puede tocar si está vacía o si sigue con
 * lo que puso esto (no la ha cambiado nadie); si no, es de quien la
 * escribió y se deja.
 */
export function rellenoPorCp(cp: string, actual: CasillasLugar, puesto: Partial<CasillasLugar> = {}): RellenoPorCp {
  const libre = (campo: keyof CasillasLugar) => !actual[campo].trim() || (puesto[campo] !== undefined && actual[campo] === puesto[campo]);
  const res: { provincia?: string; municipio?: string; elegir: readonly string[] } = { elegir: [] };

  const provincia = provinciaDeCp(cp);
  if (provincia && libre('provincia') && actual.provincia !== provincia) res.provincia = provincia;
  // Un código a medio escribir (o de otra provincia) deja de valer lo que
  // se puso para el anterior.
  if (!provincia && libre('provincia') && actual.provincia && actual.provincia === puesto.provincia) res.provincia = '';

  // Escrito a mano, el municipio se respeta aunque no sea de ese código:
  // hay pedanías y barrios que la gente escribe en lugar del municipio.
  if (!libre('municipio')) return res;
  const municipios = municipiosDeCp(cp);
  if (municipios.length === 1) {
    if (actual.municipio !== municipios[0]) res.municipio = municipios[0];
    return res;
  }
  // Con varios, o con ninguno conocido, lo que puso esto para el código
  // anterior ya no vale, salvo que sea uno de los de este.
  const vale = municipios.some(m => igual(m, actual.municipio));
  if (actual.municipio && !vale) res.municipio = '';
  if (municipios.length > 1 && !vale) res.elegir = municipios;
  return res;
}
