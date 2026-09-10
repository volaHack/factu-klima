/**
 * DE UNA FACTURA DE VERDAD A UN REGISTRO QUE LA AEAT ACEPTE
 *
 * Aquí se comprueban las traducciones que no son evidentes: qué código
 * de exención lleva una entrega intracomunitaria, por qué una línea al
 * 0 % no puede llevar cuota, y —la más importante— que los campos que
 * entran en la huella se copian del registro sellado y NO se recalculan
 * a partir de la factura. Recalcularlos es el fallo silencioso de este
 * módulo: todo parecería correcto y la AEAT devolvería «aceptado con
 * errores» sin decir por qué.
 */

import { describe, expect, it } from 'vitest';
import {
  descripcionDeOperacion, desgloseDeFactura, destinatarioDeFactura,
  problemasDelRegistro, registroAltaDesdeFila, sistemaInformaticoDe,
  type FilaFactura, type FilaRegistro,
} from './mapeo';

const REGISTRO: FilaRegistro = {
  id: 'r1', invoice_id: 'i1', tipo_registro: 'alta', indice: 4,
  huella: 'A'.repeat(64), huella_anterior: 'B'.repeat(64),
  id_emisor: '89890001K', num_serie: 'FAC-2026-0004', fecha_expedicion: '2026-03-10',
  tipo_factura: 'F1', cuota_total: 21, importe_total: 121,
  fecha_hora_huso: '2026-03-10T12:00:00+01:00', estado: 'pendiente', intentos: 0,
};

const FACTURA: FilaFactura = {
  id: 'i1', client_name: 'Bar Paco', client_nif: 'B12345678', client_vat_number: null,
  es_intracomunitaria: false, clave_regimen_iva: null, tipo: 'factura',
  documento_origen_number: null, documento_origen_id: null,
  issue_date: '2026-03-10', notes: null, datos_extras: null,
};

const alta = (extra: Partial<Parameters<typeof registroAltaDesdeFila>[0]> = {}) =>
  registroAltaDesdeFila({
    registro: REGISTRO, factura: FACTURA,
    tramos: [{ rate: 21, base_amount: 100, tax_amount: 21 }],
    lineas: [{ product_name: 'Caja de cerveza' }],
    nombreRazonEmisor: 'Distribuciones del Sur S.L.',
    ...extra,
  });

describe('los campos que entran en la huella', () => {
  it('se copian del registro sellado, no se recalculan de la factura', () => {
    // La factura dice otra cosa en cada uno de estos campos. Si el
    // mapeo mirase la factura, la huella dejaría de cuadrar.
    const r = alta({
      factura: { ...FACTURA, issue_date: '2020-01-01' },
      tramos: [{ rate: 21, base_amount: 999, tax_amount: 999 }],
    });

    expect(r.fechaExpedicionFactura).toBe('2026-03-10');
    expect(r.cuotaTotal).toBe(21);
    expect(r.importeTotal).toBe(121);
    expect(r.tipoFactura).toBe('F1');
    expect(r.fechaHoraHusoGenRegistro).toBe('2026-03-10T12:00:00+01:00');
    expect(r.huella).toBe('A'.repeat(64));
    expect(r.huellaAnterior).toBe('B'.repeat(64));
  });

  it('los importes valen igual si llegan como texto desde la base', () => {
    const r = alta({ registro: { ...REGISTRO, cuota_total: '21.00', importe_total: '121.00' } });
    expect(r.cuotaTotal).toBe(21);
    expect(r.importeTotal).toBe(121);
  });
});

describe('el desglose', () => {
  it('una línea con IVA va como sujeta y no exenta, con su tipo y su cuota', () => {
    const [d] = desgloseDeFactura([{ rate: 21, base_amount: 100, tax_amount: 21 }]);
    expect(d).toMatchObject({
      impuesto: '01', claveRegimen: '01', calificacionOperacion: 'S1',
      tipoImpositivo: 21, baseImponible: 100, cuotaRepercutida: 21,
    });
  });

  it('una entrega intracomunitaria va EXENTA por el artículo 25, o sea E5', () => {
    // Y NO con clave de régimen 11, que en la lista oficial es
    // «arrendamiento de local de negocio» y no tiene nada que ver.
    const [d] = desgloseDeFactura([{ rate: 0, base_amount: 500, tax_amount: 0 }], { intracomunitaria: true });
    expect(d.operacionExenta).toBe('E5');
    expect(d.claveRegimen).toBe('01');
    expect(d.calificacionOperacion).toBeUndefined();
  });

  it('una línea exenta no lleva tipo ni cuota, ni siquiera a cero', () => {
    // El esquema los tiene por opcionales justo para esto: mandar un
    // 0,00 no es lo mismo que no mandarlos.
    const [d] = desgloseDeFactura([{ rate: 0, base_amount: 300, tax_amount: 0 }]);
    expect(d.tipoImpositivo).toBeUndefined();
    expect(d.cuotaRepercutida).toBeUndefined();
    expect(d.baseImponible).toBe(300);
  });

  it('en Canarias el impuesto es el IGIC (03), no el IVA', () => {
    const [d] = desgloseDeFactura([{ rate: 7, base_amount: 100, tax_amount: 7 }], { igic: true });
    expect(d.impuesto).toBe('03');
  });

  it('respeta la clave de régimen que haya puesto el usuario', () => {
    const [d] = desgloseDeFactura([{ rate: 21, base_amount: 100, tax_amount: 21 }], { claveRegimen: '07' });
    expect(d.claveRegimen).toBe('07');
  });

  it('un tramo por tipo impositivo, no uno por línea', () => {
    const d = desgloseDeFactura([
      { rate: 21, base_amount: 100, tax_amount: 21 },
      { rate: 10, base_amount: 50, tax_amount: 5 },
    ]);
    expect(d).toHaveLength(2);
  });
});

describe('el destinatario', () => {
  it('con NIF español va por NIF', () => {
    expect(destinatarioDeFactura(FACTURA)).toEqual({ nombreRazon: 'Bar Paco', nif: 'B12345678' });
  });

  it('un cliente europeo va por IDOtro, partiendo el país del número', () => {
    expect(destinatarioDeFactura({
      ...FACTURA, client_nif: null, client_vat_number: 'PT123456789',
      client_name: 'Cervejas Lisboa Lda',
    })).toEqual({
      nombreRazon: 'Cervejas Lisboa Lda',
      idOtro: { codigoPais: 'PT', idType: '02', id: '123456789' },
    });
  });

  it('sin nombre no hay destinatario, y eso es un dato, no un vacío', () => {
    expect(destinatarioDeFactura({ ...FACTURA, client_name: '' })).toBeNull();
  });
});

describe('la descripción de la operación', () => {
  it('dice lo que se ha vendido, que es lo que quiere ver una comprobación', () => {
    expect(descripcionDeOperacion([{ product_name: 'Caja de cerveza' }, { product_name: 'Hielo' }]))
      .toBe('Caja de cerveza, Hielo');
  });

  it('con muchas líneas no las enumera todas', () => {
    const muchas = Array.from({ length: 12 }, (_, i) => ({ product_name: `Artículo ${i + 1}` }));
    expect(descripcionDeOperacion(muchas)).toContain('y 4 más');
  });

  it('nunca queda vacía: el campo es obligatorio', () => {
    expect(descripcionDeOperacion([])).toBe('Venta de bienes y servicios');
    expect(descripcionDeOperacion([{ product_name: '  ' }], '  ')).toBe('Venta de bienes y servicios');
  });

  it('se recorta a 500 caracteres aquí y no en la AEAT', () => {
    const larga = [{ product_name: 'x'.repeat(900) }];
    expect(descripcionDeOperacion(larga).length).toBe(500);
  });
});

describe('las rectificativas', () => {
  it('van «por diferencias» y dicen a qué factura corrigen', () => {
    const r = alta({
      registro: { ...REGISTRO, tipo_factura: 'R1' },
      factura: { ...FACTURA, documento_origen_number: 'FAC-2026-0001' },
    });
    expect(r.tipoRectificativa).toBe('I');
    expect(r.facturasRectificadas).toEqual([
      { idEmisor: '89890001K', numSerie: 'FAC-2026-0001', fecha: '2026-03-10' },
    ]);
  });

  it('una factura normal no lleva nada de eso', () => {
    const r = alta();
    expect(r.tipoRectificativa).toBeNull();
    expect(r.facturasRectificadas).toBeUndefined();
  });
});

describe('las simplificadas', () => {
  it('sin cliente identificado lo declaran', () => {
    const r = alta({
      registro: { ...REGISTRO, tipo_factura: 'F2' },
      factura: { ...FACTURA, client_name: '', client_nif: null },
    });
    expect(r.facturaSinIdentifDestinatarioArt61d).toBe(true);
    expect(r.destinatarios).toBeUndefined();
  });

  it('con cliente conocido lo mandan igual', () => {
    const r = alta({ registro: { ...REGISTRO, tipo_factura: 'F2' } });
    expect(r.facturaSinIdentifDestinatarioArt61d).toBeUndefined();
    expect(r.destinatarios).toHaveLength(1);
  });
});

describe('lo que se comprueba antes de abrir la conexión', () => {
  it('una factura completa sin NIF del cliente no sale', () => {
    // Y no sale ANTES de conectar, porque la AEAT rechaza el envío
    // entero por una línea mala: esta factura tumbaría a las demás.
    const problemas = problemasDelRegistro(REGISTRO, { ...FACTURA, client_nif: null, client_vat_number: null });
    expect(problemas.join(' ')).toContain('no tiene identificado al cliente');
  });

  it('una simplificada sin cliente sí sale: es lo normal en un TPV', () => {
    expect(problemasDelRegistro(
      { ...REGISTRO, tipo_factura: 'F2' },
      { ...FACTURA, client_name: '', client_nif: null },
    )).toEqual([]);
  });

  it('sin NIF del emisor no sale nada', () => {
    expect(problemasDelRegistro({ ...REGISTRO, id_emisor: '' }, FACTURA).join(' '))
      .toContain('NIF del emisor');
  });

  it('una huella con formato raro se detecta aquí', () => {
    expect(problemasDelRegistro({ ...REGISTRO, huella: 'a'.repeat(64) }, FACTURA).join(' '))
      .toContain('formato oficial');
  });

  it('una factura correcta no da problemas', () => {
    expect(problemasDelRegistro(REGISTRO, FACTURA)).toEqual([]);
  });
});

describe('el sistema informático', () => {
  const config = {
    productor_nombre: 'Klima Software S.L.', productor_nif: 'B00000000',
    nombre_sistema: 'Klima', id_sistema: '01', version_sistema: '1.0',
    numero_instalacion: null,
  };

  it('se niega a inventarse el NIF del productor', () => {
    // Ese NIF identifica a quien responde del programa ante la Agencia.
    // Rellenarlo con el del usuario «para que funcione» sería declarar
    // que el usuario fabrica el software.
    expect(() => sistemaInformaticoDe({ ...config, productor_nif: null }, 'u1'))
      .toThrow(/productor/i);
    expect(() => sistemaInformaticoDe({ ...config, productor_nombre: '  ' }, 'u1'))
      .toThrow(/productor/i);
  });

  it('sin número de instalación usa el del usuario, que es único', () => {
    expect(sistemaInformaticoDe(config, 'usuario-123').numeroInstalacion).toBe('usuario-123');
  });

  it('recorta los campos a lo que admite el esquema', () => {
    const s = sistemaInformaticoDe({
      ...config, nombre_sistema: 'N'.repeat(50), id_sistema: 'XYZ',
    }, 'u1');
    expect(s.nombreSistemaInformatico).toHaveLength(30);
    expect(s.idSistemaInformatico).toHaveLength(2);
  });
});
