/**
 * ¿CUADRA EL RÉGIMEN CON LA DIRECCIÓN?
 *
 * En Canarias no se factura con IVA sino con IGIC, y al revés: fuera de
 * Canarias, con IVA. El régimen es un interruptor en Ajustes y es fácil
 * dejarlo mal al dar de alta la empresa; el error no se ve hasta que el
 * cliente o la gestoría devuelven la factura. El código postal lo delata:
 * los de Canarias empiezan por 35 (Las Palmas) o 38 (Santa Cruz de Tenerife).
 *
 * Ceuta y Melilla (51, 52) tienen su propio impuesto (IPSI), que el programa
 * no lleva: ahí no se avisa de nada en vez de aconsejar algo que no aplica.
 */

export type ZonaFiscal = 'canarias' | 'resto';

const PROVINCIAS_CANARIAS = ['las palmas', 'santa cruz de tenerife', 'tenerife', 'gran canaria'];

const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Dónde tributa la dirección, por el código postal (o la provincia si no hay). Null si no se sabe. */
export function zonaFiscal(direccion: { postalCode?: string | null; province?: string | null }): ZonaFiscal | null {
  const cp = (direccion.postalCode ?? '').replace(/\s/g, '');
  if (/^\d{5}$/.test(cp)) {
    const prefijo = cp.slice(0, 2);
    if (prefijo === '35' || prefijo === '38') return 'canarias';
    if (prefijo === '51' || prefijo === '52') return null;
    const n = Number(prefijo);
    return n >= 1 && n <= 50 ? 'resto' : null;
  }
  const provincia = sinTildes(direccion.province ?? '');
  if (!provincia) return null;
  return PROVINCIAS_CANARIAS.includes(provincia) ? 'canarias' : null;
}

export interface AvisoRegimen {
  titulo: string;
  texto: string;
}

/** Qué decir si el régimen elegido no cuadra con la dirección de la empresa. */
export function avisoRegimen(ajustes: {
  igicEnabled?: boolean;
  postalCode?: string | null;
  province?: string | null;
} | null | undefined): AvisoRegimen | null {
  if (!ajustes) return null;
  const zona = zonaFiscal(ajustes);
  const cp = ajustes.postalCode ? ` (CP ${ajustes.postalCode})` : '';
  if (zona === 'canarias' && !ajustes.igicEnabled) {
    return {
      titulo: 'Tu empresa está en Canarias y facturas con IVA',
      texto: `La dirección de la empresa${cp} es de Canarias, donde se aplica el IGIC y no el IVA. Si es así, activa el régimen canario.`,
    };
  }
  if (zona === 'resto' && ajustes.igicEnabled) {
    return {
      titulo: 'Facturas con IGIC y tu empresa no está en Canarias',
      texto: `La dirección de la empresa${cp} no es de Canarias, y fuera de Canarias se aplica el IVA. Revisa el régimen o la dirección.`,
    };
  }
  return null;
}
