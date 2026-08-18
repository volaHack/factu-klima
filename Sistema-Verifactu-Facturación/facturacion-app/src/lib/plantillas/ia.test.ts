/**
 * Lo que la IA propone es una sugerencia, no una orden.
 *
 * Estas pruebas fijan las barreras: una plantilla mal asignada imprime el NIF
 * de un cliente donde va el total, así que lo que venga de fuera no puede
 * pisar lo que las reglas ya saben, ni repetir una clave, ni inventarse una.
 */

import { describe, expect, it } from 'vitest';
import { describirParaIa, fusionarSugerencias } from './ia';
import type { AnalisisPdf, CampoDetectado, PaginaExtraida } from './tipos';
import { agruparEnLineas } from './extraccion';

function campo(parcial: Partial<CampoDetectado> & { id: string }): CampoDetectado {
  return {
    clave: null,
    tipo: 'texto',
    fijo: false,
    valorOriginal: 'valor',
    etiquetaCercana: '',
    x: 10, y: 10, ancho: 20, alto: 4,
    tamano: 9,
    alineacion: 'left',
    color: '#000000',
    negrita: false, cursiva: false, serif: false,
    interlineado: 1.15,
    confianza: 0.3,
    motivo: '',
    ...parcial,
  };
}

const CLAVES = ['doc_numero', 'cliente_nif', 'total_general', 'total_col_1'];

describe('lo que la IA puede cambiar', () => {
  it('asigna un recuadro que estaba sin identificar', () => {
    const { campos, aplicadas } = fusionarSugerencias(
      [campo({ id: 'a', valorOriginal: '4300000092' })],
      [{ id: 'a', clave: 'doc_numero', motivo: 'está bajo el rótulo FACTURA' }],
      CLAVES,
    );
    expect(aplicadas).toBe(1);
    expect(campos[0].clave).toBe('doc_numero');
    expect(campos[0].motivo).toContain('Propuesto por la IA');
  });

  it('lo deja «por confirmar», no como un dato seguro', () => {
    // Sale con el punto naranja en el revisor: el usuario tiene que mirarlo
    // antes de guardar. Un modelo puede cambiar de opinión entre dos
    // llamadas; una factura mal montada se manda una vez y ya está mandada.
    const { campos } = fusionarSugerencias(
      [campo({ id: 'a' })],
      [{ id: 'a', clave: 'doc_numero', motivo: '' }],
      CLAVES,
    );
    expect(campos[0].confianza).toBeLessThan(0.5);
  });
});

describe('lo que la IA NO puede cambiar', () => {
  it('no pisa un campo que las reglas ya identificaron', () => {
    // Una regla que reconoció «Fecha:» sabe más que cualquier modelo: es
    // determinista, da lo mismo hoy y dentro de un año, y si se equivoca se
    // arregla la regla.
    const { campos, aplicadas } = fusionarSugerencias(
      [campo({ id: 'a', clave: 'doc_fecha', confianza: 0.95 })],
      [{ id: 'a', clave: 'doc_numero', motivo: 'parece un número' }],
      [...CLAVES, 'doc_fecha'],
    );
    expect(aplicadas).toBe(0);
    expect(campos[0].clave).toBe('doc_fecha');
    expect(campos[0].confianza).toBe(0.95);
  });

  it('no toca un campo que el usuario marcó como fijo', () => {
    const { campos, aplicadas } = fusionarSugerencias(
      [campo({ id: 'a', fijo: true })],
      [{ id: 'a', clave: 'doc_numero', motivo: '' }],
      CLAVES,
    );
    expect(aplicadas).toBe(0);
    expect(campos[0].clave).toBeNull();
  });

  it('no repite una clave que ya está en uso', () => {
    // Un dato se imprime una vez. Dos campos con la misma clave dejarían uno
    // de los dos recuadros con un valor que no le toca.
    const { campos, aplicadas } = fusionarSugerencias(
      [campo({ id: 'a', clave: 'total_general' }), campo({ id: 'b' })],
      [{ id: 'b', clave: 'total_general', motivo: 'otro importe' }],
      CLAVES,
    );
    expect(aplicadas).toBe(0);
    expect(campos[1].clave).toBeNull();
  });

  it('tampoco repite entre dos sugerencias de la misma respuesta', () => {
    const { campos, aplicadas } = fusionarSugerencias(
      [campo({ id: 'a' }), campo({ id: 'b' })],
      [
        { id: 'a', clave: 'doc_numero', motivo: '' },
        { id: 'b', clave: 'doc_numero', motivo: '' },
      ],
      CLAVES,
    );
    expect(aplicadas).toBe(1);
    expect(campos[0].clave).toBe('doc_numero');
    expect(campos[1].clave).toBeNull();
  });

  it('descarta una clave que no existe en el contrato', () => {
    // Los modelos se inventan nombres de campo. Guardar uno haría que la
    // plantilla no pasara la validación al guardarla, o peor: que se guardara
    // un campo que nadie rellena nunca.
    const { campos, aplicadas } = fusionarSugerencias(
      [campo({ id: 'a' })],
      [{ id: 'a', clave: 'numero_de_pedido_del_cliente', motivo: '' }],
      CLAVES,
    );
    expect(aplicadas).toBe(0);
    expect(campos[0].clave).toBeNull();
  });

  it('acepta que la IA diga que no lo sabe', () => {
    const { aplicadas } = fusionarSugerencias(
      [campo({ id: 'a' })],
      [{ id: 'a', clave: null, motivo: 'no está claro' }],
      CLAVES,
    );
    expect(aplicadas).toBe(0);
  });
});

describe('qué se le manda al modelo', () => {
  const MM = 0.3528;
  const texto = (t: string, x: number, y: number) => ({
    texto: t, x, y, ancho: t.length * 9 * 0.5 * MM, alto: 9 * MM, tamano: 9,
    fuente: 'Helvetica', negrita: false, cursiva: false, serif: false,
    monoespaciada: false, color: '#000000',
  });

  function analisisDeEjemplo(): AnalisisPdf {
    const items = [texto('CLIENTE', 72, 60), texto('4300000092', 71, 66), texto('12/08/2026', 47, 66)];
    const pagina: PaginaExtraida = {
      ancho: 210, alto: 297, items, lineas: agruparEnLineas(items), totalPaginas: 1,
      bitmap: { dataUrl: '', anchoPx: 1, altoPx: 1, pxPorMm: 1 },
    };
    return {
      pagina,
      campos: [
        campo({ id: 'a', valorOriginal: '4300000092', x: 71, y: 66, ancho: 18, alto: 3.2 }),
        campo({ id: 'b', clave: 'doc_fecha', valorOriginal: '12/08/2026', x: 47, y: 66, ancho: 16, alto: 3.2 }),
      ],
      tabla: null, rejillas: [], avisos: [], zonasExtra: [], familia: 'sans',
    };
  }

  it('sólo manda los recuadros que quedaron sin identificar', () => {
    // No se manda la factura entera: ni el PDF ni una imagen, y tampoco lo
    // que las reglas ya resolvieron. Sólo lo que hace falta preguntar.
    const peticion = describirParaIa(analisisDeEjemplo());
    expect(peticion.cajas.map(c => c.id)).toEqual(['a']);
  });

  it('adjunta el rótulo impreso al lado, que es lo que da el sentido', () => {
    // «4300000092» a secas es un número cualquiera; con «CLIENTE» impreso
    // justo encima, es el código del cliente.
    const peticion = describirParaIa(analisisDeEjemplo());
    expect(peticion.cajas[0].cerca).toBe('CLIENTE');
  });

  it('no ofrece claves que ya están ocupadas', () => {
    const peticion = describirParaIa(analisisDeEjemplo());
    expect(peticion.clavesDisponibles).not.toContain('doc_fecha');
    expect(peticion.clavesDisponibles).toContain('doc_numero');
  });
});
