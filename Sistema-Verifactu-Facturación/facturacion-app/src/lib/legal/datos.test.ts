import { describe, it, expect } from 'vitest';

import { TITULAR, datosCompletos, dato } from './datos';
import { validateNIF } from '../utils';

/**
 * LOS DATOS DEL TITULAR SE PUBLICAN. NO SE ADIVINAN.
 *
 * El aviso legal, la política de privacidad y las condiciones salen a
 * una web pública diciendo quién es el responsable y con qué NIF. Un
 * dato inventado, copiado de otro sitio o mal tecleado ahí no es una
 * errata: es una identificación falsa en un documento legal, y además
 * tiene que cuadrar con lo que dicen las facturas que emite el programa.
 *
 * Por eso aquí no se comprueba que los campos estén rellenos —estar
 * vacíos es un estado legítimo, y las páginas ya lo avisan solas—, sino
 * que EN CUANTO alguien los rellene, lo que puso tenga sentido.
 *
 * Y hay una trampa concreta que este fichero vigila: la cuenta de prueba
 * lleva una empresa de mentira («Distribuciones Alimentarias del Sur»,
 * en Sevilla). Copiarla de la base de datos a estas páginas sería
 * publicar una razón social y un CIF que no son de quien firma.
 */

const DATOS_DE_PRUEBA = [
  'Distribuciones Alimentarias del Sur',
  'B41567890',
  'Polígono Industrial Calonge',
  'facturacion@distalsur.es',
];

describe('datos del titular que se publican en las páginas legales', () => {
  it('o están los cuatro, o no está ninguno', () => {
    // Medio rellenos es el peor estado: la página se da por completa y
    // sale con un hueco disimulado en mitad de un texto legal.
    const puestos = [TITULAR.titular, TITULAR.nif, TITULAR.domicilio, TITULAR.email]
      .filter(v => v.trim().length > 0).length;
    expect(puestos === 0 || puestos === 4, 'rellena los cuatro campos o ninguno').toBe(true);
    expect(datosCompletos).toBe(puestos === 4);
  });

  it('nunca lleva los datos de la empresa de prueba', () => {
    const todo = Object.values(TITULAR).join(' | ');
    for (const rastro of DATOS_DE_PRUEBA) {
      expect(
        todo.includes(rastro),
        `«${rastro}» es de la cuenta de demostración, no del titular real`,
      ).toBe(false);
    }
  });

  it('si hay NIF, es un NIF español válido', () => {
    if (!TITULAR.nif) return;
    expect(validateNIF(TITULAR.nif), `«${TITULAR.nif}» no pasa la letra de control`).toBe(true);
  });

  it('si hay correo, se puede escribir a él', () => {
    if (!TITULAR.email) return;
    expect(TITULAR.email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/);
  });

  it('si hay domicilio, lleva código postal', () => {
    // Un domicilio fiscal sin CP no identifica nada, y el CP es además lo
    // que delata en qué territorio se tributa: 35xxx y 38xxx son Canarias
    // (IGIC), el resto península y Baleares (IVA).
    if (!TITULAR.domicilio) return;
    expect(TITULAR.domicilio, 'falta el código postal en el domicilio').toMatch(/\b\d{5}\b/);
  });

  it('marca los huecos en vez de dejarlos mudos', () => {
    expect(dato('', 'NIF')).toBe('[pendiente: NIF]');
    expect(dato('B12345678', 'NIF')).toBe('B12345678');
  });
});
