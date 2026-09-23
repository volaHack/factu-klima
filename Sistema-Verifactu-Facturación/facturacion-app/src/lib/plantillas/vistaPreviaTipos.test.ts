import { describe, it, expect } from 'vitest';

import { construirDatos, facturaDeMuestra } from './datos';
import {
  algunoLlevaQr, personalidadDe, TIPOS_PLANTILLA, tipoDominante,
  type TipoDocumentoPlantilla,
} from './tiposDocumento';
import type { CompanySettings } from '../types';

/**
 * LA VISTA PREVIA TIENE QUE DECIR LA VERDAD SOBRE EL DOCUMENTO
 *
 * La pantalla de diseño montaba SIEMPRE los datos de prueba como factura
 * y le pasaba SIEMPRE el QR tributario. Como el generador estampa el
 * código en una esquina cuando la plantilla no le reserva sitio,
 * diseñar un albarán acababa con un QR que nadie había colocado — y que,
 * peor que ser feo, le dice al cliente que ese papel está declarado a
 * Hacienda cuando no lo está.
 *
 * Aquí se fija la decisión: con qué tipo se montan los datos y si lleva
 * QR. Es la misma que toma `datosDePrueba` en la pantalla.
 */

const AJUSTES = {
  businessName: 'Mi Empresa S.L.',
  nif: 'B12345678',
  address: 'Calle Mayor 1',
  city: 'Madrid',
  postalCode: '28001',
  igicEnabled: false,
} as unknown as CompanySettings;

/** La misma decisión que toma la pantalla al previsualizar. */
function previsualizacionDe(tipos: TipoDocumentoPlantilla[]) {
  return { tipo: tipoDominante(tipos), conQr: algunoLlevaQr(tipos) };
}

describe('qué se previsualiza según el tipo marcado', () => {
  it('un albarán se ve como albarán y sin QR', () => {
    expect(previsualizacionDe(['albaran'])).toEqual({ tipo: 'albaran', conQr: false });
  });

  it('un presupuesto y un pedido, tampoco llevan QR', () => {
    expect(previsualizacionDe(['presupuesto']).conQr).toBe(false);
    expect(previsualizacionDe(['pedido']).conQr).toBe(false);
  });

  it('una factura sí lo lleva: lo exige la AEAT', () => {
    expect(previsualizacionDe(['factura'])).toEqual({ tipo: 'factura', conQr: true });
    expect(previsualizacionDe(['rectificativa']).conQr).toBe(true);
  });

  it('si la plantilla vale para albarán Y factura, se ve con QR', () => {
    // Al revés escondería el problema de que al diseño le falte sitio
    // para el código justo en el caso en que es obligatorio.
    expect(previsualizacionDe(['albaran', 'factura'])).toEqual({ tipo: 'factura', conQr: true });
  });

  it('sin ningún tipo marcado no se inventa un QR', () => {
    expect(previsualizacionDe([]).conQr).toBe(false);
  });
});

describe('cada tipo se imprime con su propia cara', () => {
  const documento = facturaDeMuestra();

  it('el título del impreso es el suyo, no «FACTURA» siempre', () => {
    for (const tipo of TIPOS_PLANTILLA) {
      const { campos } = construirDatos(
        { tipo, documento } as Parameters<typeof construirDatos>[0],
        AJUSTES,
      );
      expect(campos.doc_tipo, `el título de ${tipo}`).toBe(personalidadDe(tipo).tituloImpreso);
      expect(campos.doc_titulo).toContain(personalidadDe(tipo).tituloImpreso);
    }
  });

  it('el albarán avisa por escrito de que no es una factura', () => {
    // Sin esa línea, un albarán con el diseño de la factura es
    // indistinguible de una factura para quien lo recibe.
    const { campos } = construirDatos({ tipo: 'albaran', documento } as never, AJUSTES);
    expect(campos.doc_aviso_legal).toMatch(/no tiene valor fiscal/i);
  });

  it('el presupuesto dice su validez y el pedido que no es factura', () => {
    const presupuesto = construirDatos({ tipo: 'presupuesto', documento }, AJUSTES);
    expect(presupuesto.campos.doc_aviso_legal).toMatch(/30 días/i);

    const pedido = construirDatos({ tipo: 'pedido', documento }, AJUSTES);
    expect(pedido.campos.doc_aviso_legal).toMatch(/no es una factura/i);
  });

  it('la factura no lleva advertencia: no la necesita', () => {
    expect(construirDatos({ tipo: 'factura', documento }, AJUSTES).campos.doc_aviso_legal).toBe('');
  });

  it('ningún tipo revienta al montar los datos', () => {
    // La vista previa usa la última factura real para todos los tipos:
    // un albarán se previsualiza con datos de factura a propósito, para
    // no obligar a tener un albarán guardado antes de diseñar uno.
    for (const tipo of TIPOS_PLANTILLA) {
      expect(() => construirDatos(
        { tipo, documento } as Parameters<typeof construirDatos>[0],
        AJUSTES,
      ), `montar datos de ${tipo}`).not.toThrow();
    }
  });
});
