import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';

import { CINTA, HUELLA_CERO, corta, preimagen, total } from './cintaHero';

/* La cinta del héroe lleva las huellas escritas en el módulo para que la
   sección no necesite JavaScript. Este test es el precio de esa decisión:
   recalcula la cadena entera y comprueba que lo escrito es SHA-256 de
   verdad. Si se cambia un importe, un número o una fecha sin regenerar,
   aquí se ve. */

const sha256 = (texto: string) => createHash('sha256').update(texto, 'utf8').digest('hex');

describe('cinta del héroe', () => {
  /* En la página cuelgan del rollo del más nuevo al más antiguo. Para
     verificar hay que recorrerlas en el orden en que se emitieron. */
  const enOrden = [...CINTA].reverse();

  it('encadena de verdad: cada huella es SHA-256 de su preimagen', () => {
    let anterior = HUELLA_CERO;

    for (const r of enOrden) {
      expect(r.anterior, `el «anterior» de ${r.num}`).toBe(anterior);
      expect(sha256(preimagen(r, anterior)), `la huella de ${r.num}`).toBe(r.huella);
      anterior = r.huella;
    }
  });

  it('altera un céntimo y la huella deja de cuadrar', () => {
    const primero = enOrden[0];
    const falseado = { ...primero, base: primero.base - 0.01 };

    expect(sha256(preimagen(falseado, HUELLA_CERO))).not.toBe(primero.huella);
  });

  it('imprime 64 cifras hexadecimales, no ocho', () => {
    for (const r of CINTA) {
      expect(r.huella).toMatch(/^[0-9a-f]{64}$/);
      expect(r.anterior).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('recorta a 21 caracteres, que es lo que cabe en el papel', () => {
    // 10 + el puntos suspensivos + 10. La animación de impresión avanza
    // por pasos contando exactamente estos caracteres.
    expect(corta(CINTA[0].huella)).toHaveLength(21);
  });

  it('aplica el 21 % y redondea al céntimo', () => {
    expect(total(186.4)).toBe(225.54);
    expect(total(312.75)).toBe(378.43);
  });
});
