/**
 * LAS COLUMNAS DE CAJAS DE UN IMPRESO DE MAYORISTA, BIEN CONECTADAS
 *
 * Al leer una factura de distribución, «CAJ.» y «U/C» no se reconocían y
 * se guardaban como columnas propias (`custom_col_N`) que nadie rellenaba:
 * salían en blanco aunque la línea tuviera sus cajas y su U/C. Y la «P» de
 * «PRECIO» a veces no llega en el texto del PDF y la cabecera quedaba
 * «RECIO».
 *
 * Esto lo arregla en las plantillas que ya están guardadas, al generar el
 * PDF y al pedir las casillas de cada línea, sin tener que volver a subir
 * el impreso. La detección de plantillas nuevas usa las mismas reglas.
 */

import { esColumnaPersonalizada } from './contrato';

const sinAcentos = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '');
const limpia = (t: string) => sinAcentos(t).toLowerCase().replace(/[^a-z0-9/ ]/g, ' ').replace(/\s+/g, ' ').trim();

/** «CAJ.», «CAJAS», «BULTOS», «CJ», «BTOS». */
export function esCabeceraDeCajas(cabecera: string): boolean {
  return /^(caj|cajas?|cj|cjs|bultos?|btos?|bto)$/.test(limpia(cabecera));
}

/** «U/C», «UDS/CAJA», «UNID. CAJA», «U.C.», «UXC». */
export function esCabeceraDeUdsCaja(cabecera: string): boolean {
  const t = limpia(cabecera);
  return /^(u ?\/ ?c|u c|uc|uxc|u x c|uds? ?\/ ?caja|uds? caja|unid ?\/ ?caja|unid caja|ud ?\/ ?caja|ud caja|unidades ?\/ ?caja|unidades por caja)$/.test(t);
}

/** «UDES.», «UDS.», «UNIDADES». */
export function esCabeceraDeUnidades(cabecera: string): boolean {
  return /^(udes|uds|unidades|unid)$/.test(limpia(cabecera));
}

/** Cabeceras con la primera letra perdida en el texto del PDF. */
const COMPLETAS = ['PRECIO', 'IMPORTE', 'CANTIDAD', 'TOTAL', 'CÓDIGO', 'DESCRIPCIÓN', 'UNIDADES', 'CONCEPTO'];

export function repararCabecera(cabecera: string): string {
  const t = cabecera.trim();
  if (!t) return cabecera;
  const llano = sinAcentos(t).toUpperCase().replace(/\.$/, '');
  for (const palabra of COMPLETAS) {
    const p = sinAcentos(palabra);
    if (llano.length >= 4 && llano.length === p.length - 1 && p.endsWith(llano)) {
      const conMayusculas = t === t.toUpperCase();
      const reparada = conMayusculas ? palabra : palabra[0] + palabra.slice(1).toLowerCase();
      return t.endsWith('.') ? `${reparada}.` : reparada;
    }
  }
  return cabecera;
}

/**
 * Qué dato tiene que ir en una columna, a la vista de su cabecera.
 * Sólo se cambian las columnas que no tenían dato (o uno propio vacío) y
 * la «Cantidad» rotulada «Cajas» de los impresos de distribución, que en
 * las líneas por unidades ya no son cajas.
 */
export function claveReparada(clave: string | null, cabecera: string): string | null {
  const sinDato = clave === null || esColumnaPersonalizada(clave);
  if (sinDato || clave === 'cantidad') {
    if (esCabeceraDeCajas(cabecera)) return 'cajas';
  }
  if (sinDato && esCabeceraDeUdsCaja(cabecera)) return 'uds_caja';
  // «UDES.» con la cantidad: son las unidades de la línea, que en las
  // líneas de antes eran cajas × U/C.
  if (clave === 'cantidad' && esCabeceraDeUnidades(cabecera)) return 'uds_linea';
  return clave;
}

/** Repara las claves y las cabeceras de una tabla de líneas, sin repetir datos. */
export function repararColumnas(claves: (string | null)[], cabeceras: string[]): { claves: (string | null)[]; cabeceras: string[] } {
  const nuevas = claves.map((c, i) => claveReparada(c, cabeceras[i] ?? ''));
  // Si una reparación choca con un dato que ya estaba en otra columna, esa no se toca.
  const finales = nuevas.map((c, i) => (c !== claves[i] && c && claves.includes(c) ? claves[i] : c));
  return { claves: finales, cabeceras: cabeceras.map(repararCabecera) };
}

/**
 * Los recuentos del pie que sumaban una columna reparada.
 *
 * La casilla «Total de CAJ.» de esos impresos era `total_col_N`, la suma
 * de la columna propia `custom_col_N`. Al conectar esa columna con las
 * cajas de verdad ya no hay nada que sumar y salía en blanco: tiene que
 * pasar a ser el total de cajas. Devuelve `total_col_N` → clave nueva.
 */
export function recuentosReparados(claves: (string | null)[], reparadas: (string | null)[]): Map<string, string> {
  const salida = new Map<string, string>();
  claves.forEach((antes, i) => {
    const m = antes?.match(/^custom_col_(\d+)$/);
    if (m && reparadas[i] === 'cajas') salida.set(`total_col_${m[1]}`, 'total_bultos');
  });
  return salida;
}
