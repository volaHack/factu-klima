/**
 * EL XML TIENE QUE PASAR EL ESQUEMA A LA PRIMERA
 *
 * No hay forma de validar contra el XSD sin traerse un validador entero,
 * así que estas pruebas comprueban lo que de verdad se rompe en la
 * práctica: los espacios de nombres, el ORDEN de los elementos (los
 * tipos del esquema son <sequence>: un campo bueno en el sitio malo
 * invalida el documento igual que si faltara), el encadenamiento, y el
 * escapado del texto.
 *
 * Los nombres de elemento y su orden están tomados de
 * SuministroInformacion.xsd y SuministroLR.xsd, descargados del WSDL
 * oficial de la AEAT.
 */

import { describe, expect, it } from 'vitest';
import {
  NS_SUMINISTRO_INFORMACION, NS_SUMINISTRO_LR, registroAltaXml,
  registroAnulacionXml, sobreRegFactu, type RegistroAlta,
  type RegistroAnulacion, type SistemaInformatico,
} from './registroXml';

const SISTEMA: SistemaInformatico = {
  nombreRazon: 'Klima Software S.L.',
  nif: 'B00000000',
  nombreSistemaInformatico: 'Klima',
  idSistemaInformatico: '01',
  version: '1.0',
  numeroInstalacion: 'INST-1',
  tipoUsoPosibleSoloVerifactu: 'S',
  tipoUsoPosibleMultiOT: 'S',
  indicadorMultiplesOT: 'S',
};

const ALTA: RegistroAlta = {
  idEmisorFactura: '89890001K',
  numSerieFactura: 'FAC-2026-0001',
  fechaExpedicionFactura: '2026-03-10',
  nombreRazonEmisor: 'Distribuciones del Sur S.L.',
  tipoFactura: 'F1',
  descripcionOperacion: 'Cajas de cerveza',
  destinatarios: [{ nombreRazon: 'Bar Paco', nif: 'B12345678' }],
  desglose: [{
    impuesto: '01', claveRegimen: '01', calificacionOperacion: 'S1',
    tipoImpositivo: 21, baseImponible: 100, cuotaRepercutida: 21,
  }],
  cuotaTotal: 21,
  importeTotal: 121,
  fechaHoraHusoGenRegistro: '2026-03-10T12:00:00+01:00',
  huella: 'A'.repeat(64),
};

/**
 * Comprueba que una lista de elementos sale en ese orden y todos están.
 *
 * Busca cada uno A PARTIR de donde apareció el anterior, y no en todo el
 * documento. Es la diferencia entre «está en orden» y «está», y en este
 * XML importa: dentro de Encadenamiento hay otro <sf:Huella> —el del
 * registro anterior— que aparece mucho antes que la huella propia del
 * registro. Buscando desde el principio, la prueba señalaría un
 * desorden que no existe.
 */
function enOrden(xml: string, nombres: string[]) {
  let desde = 0;
  let previo = '(principio del documento)';

  for (const nombre of nombres) {
    const encontrado = xml.indexOf(`<sf:${nombre}>`, desde);
    expect(encontrado, `falta ${nombre}, o va antes de ${previo}`).toBeGreaterThan(-1);
    desde = encontrado + 1;
    previo = nombre;
  }
}

describe('el registro de alta', () => {
  it('lleva los campos en el orden de RegistroFacturacionAltaType', () => {
    enOrden(registroAltaXml(ALTA, SISTEMA), [
      'IDVersion', 'IDFactura', 'IDEmisorFactura', 'NumSerieFactura',
      'FechaExpedicionFactura', 'NombreRazonEmisor', 'TipoFactura',
      'DescripcionOperacion', 'Destinatarios', 'Desglose', 'CuotaTotal',
      'ImporteTotal', 'Encadenamiento', 'SistemaInformatico',
      'FechaHoraHusoGenRegistro', 'TipoHuella', 'Huella',
    ]);
  });

  it('la versión es 1.0 y el tipo de huella el 01, que es SHA-256', () => {
    const xml = registroAltaXml(ALTA, SISTEMA);
    expect(xml).toContain('<sf:IDVersion>1.0</sf:IDVersion>');
    expect(xml).toContain('<sf:TipoHuella>01</sf:TipoHuella>');
  });

  it('la fecha va del derecho para la AEAT: 10-03-2026', () => {
    const xml = registroAltaXml(ALTA, SISTEMA);
    expect(xml).toContain('<sf:FechaExpedicionFactura>10-03-2026</sf:FechaExpedicionFactura>');
    expect(xml).not.toContain('2026-03-10<');
  });

  it('los importes salen con dos decimales y punto', () => {
    const xml = registroAltaXml({ ...ALTA, cuotaTotal: 21, importeTotal: 121 }, SISTEMA);
    expect(xml).toContain('<sf:CuotaTotal>21.00</sf:CuotaTotal>');
    expect(xml).toContain('<sf:ImporteTotal>121.00</sf:ImporteTotal>');
  });

  it('sin huella anterior declara PrimerRegistro, no un RegistroAnterior vacío', () => {
    const xml = registroAltaXml(ALTA, SISTEMA);
    expect(xml).toContain('<sf:Encadenamiento><sf:PrimerRegistro>S</sf:PrimerRegistro></sf:Encadenamiento>');
    expect(xml).not.toContain('RegistroAnterior');
  });

  it('con huella anterior apunta al anterior con sus cuatro datos', () => {
    const xml = registroAltaXml({
      ...ALTA,
      huellaAnterior: 'B'.repeat(64),
      idEmisorAnterior: '89890001K',
      numSerieAnterior: 'FAC-2026-0000',
      fechaExpedicionAnterior: '2026-03-09',
    }, SISTEMA);

    expect(xml).toContain('<sf:RegistroAnterior>');
    expect(xml).not.toContain('PrimerRegistro');
    expect(xml).toContain('<sf:NumSerieFactura>FAC-2026-0000</sf:NumSerieFactura>');
    expect(xml).toContain('<sf:FechaExpedicionFactura>09-03-2026</sf:FechaExpedicionFactura>');
    expect(xml).toContain(`<sf:Huella>${'B'.repeat(64)}</sf:Huella>`);
  });

  it('una línea exenta no lleva tipo ni cuota, sólo la causa de exención', () => {
    const xml = registroAltaXml({
      ...ALTA,
      desglose: [{ impuesto: '01', claveRegimen: '01', operacionExenta: 'E5', baseImponible: 500 }],
    }, SISTEMA);

    expect(xml).toContain('<sf:OperacionExenta>E5</sf:OperacionExenta>');
    expect(xml).not.toContain('CalificacionOperacion');
    expect(xml).not.toContain('TipoImpositivo');
    expect(xml).not.toContain('CuotaRepercutida');
  });

  it('una rectificativa dice de qué factura lo es', () => {
    const xml = registroAltaXml({
      ...ALTA,
      tipoFactura: 'R1',
      tipoRectificativa: 'I',
      facturasRectificadas: [{ idEmisor: '89890001K', numSerie: 'FAC-2026-0001', fecha: '2026-03-10' }],
    }, SISTEMA);

    enOrden(xml, ['TipoFactura', 'TipoRectificativa', 'FacturasRectificadas', 'DescripcionOperacion']);
    expect(xml).toContain('<sf:IDFacturaRectificada>');
  });

  it('una simplificada sin cliente lo declara', () => {
    const xml = registroAltaXml({
      ...ALTA, tipoFactura: 'F2', destinatarios: undefined,
      facturaSinIdentifDestinatarioArt61d: true,
    }, SISTEMA);
    expect(xml).toContain('<sf:FacturaSinIdentifDestinatarioArt61d>S</sf:FacturaSinIdentifDestinatarioArt61d>');
    expect(xml).not.toContain('<sf:Destinatarios>');
  });

  it('un cliente extranjero va por IDOtro con su código de país', () => {
    const xml = registroAltaXml({
      ...ALTA,
      destinatarios: [{
        nombreRazon: 'Cervejas Lisboa Lda',
        idOtro: { codigoPais: 'PT', idType: '02', id: '123456789' },
      }],
    }, SISTEMA);

    expect(xml).toContain('<sf:CodigoPais>PT</sf:CodigoPais>');
    expect(xml).toContain('<sf:IDType>02</sf:IDType>');
    expect(xml).toContain('<sf:ID>123456789</sf:ID>');
  });

  it('escapa el ampersand: «Pérez & Hijos» no puede romper el envío entero', () => {
    const xml = registroAltaXml({ ...ALTA, nombreRazonEmisor: 'Pérez & Hijos <S.L.>' }, SISTEMA);
    expect(xml).toContain('P&#233;rez &amp; Hijos &lt;S.L.&gt;'.replace('&#233;', 'é'));
    expect(xml).not.toContain('& Hijos');
  });

  it('los campos opcionales que no usamos no se mandan vacíos', () => {
    const xml = registroAltaXml(ALTA, SISTEMA);
    for (const campo of ['RefExterna', 'Subsanacion', 'RechazoPrevio', 'Macrodato', 'Tercero', 'Cupon']) {
      expect(xml, `${campo} no debería aparecer`).not.toContain(`<sf:${campo}>`);
    }
  });
});

describe('el registro de anulación', () => {
  const ANULACION: RegistroAnulacion = {
    idEmisorFacturaAnulada: '89890001K',
    numSerieFacturaAnulada: 'FAC-2026-0001',
    fechaExpedicionFacturaAnulada: '2026-03-10',
    huellaAnterior: 'C'.repeat(64),
    idEmisorAnterior: '89890001K',
    numSerieAnterior: 'FAC-2026-0002',
    fechaExpedicionAnterior: '2026-03-11',
    fechaHoraHusoGenRegistro: '2026-03-12T09:00:00+01:00',
    huella: 'D'.repeat(64),
  };

  it('usa los nombres de campo de la anulación, que son otros', () => {
    const xml = registroAnulacionXml(ANULACION, SISTEMA);
    expect(xml).toContain('<sf:IDEmisorFacturaAnulada>');
    expect(xml).toContain('<sf:NumSerieFacturaAnulada>');
    expect(xml).toContain('<sf:FechaExpedicionFacturaAnulada>10-03-2026</sf:FechaExpedicionFacturaAnulada>');
  });

  it('no lleva desglose ni importes: no es un alta con menos cosas', () => {
    const xml = registroAnulacionXml(ANULACION, SISTEMA);
    expect(xml).not.toContain('Desglose');
    expect(xml).not.toContain('ImporteTotal');
    expect(xml).not.toContain('TipoFactura');
  });

  it('también se encadena', () => {
    enOrden(registroAnulacionXml(ANULACION, SISTEMA), [
      'IDVersion', 'IDFactura', 'Encadenamiento', 'SistemaInformatico',
      'FechaHoraHusoGenRegistro', 'TipoHuella', 'Huella',
    ]);
  });
});

describe('el sobre completo', () => {
  const cabecera = { obligadoEmision: { nombreRazon: 'Distribuciones del Sur S.L.', nif: '89890001K' } };

  it('declara los espacios de nombres oficiales, no uno inventado', () => {
    const xml = sobreRegFactu(cabecera, [{ tipo: 'alta', datos: ALTA }], SISTEMA);
    expect(xml).toContain(`xmlns:sfLR="${NS_SUMINISTRO_LR}"`);
    expect(xml).toContain(`xmlns:sf="${NS_SUMINISTRO_INFORMACION}"`);
    // El generador viejo usaba este espacio de nombres, que no existe.
    expect(xml).not.toContain('agenciatributaria.es/static_files/Sii/VERIFACTU');
  });

  it('la cabecera y el registro van en el espacio de nombres del envío', () => {
    const xml = sobreRegFactu(cabecera, [{ tipo: 'alta', datos: ALTA }], SISTEMA);
    expect(xml).toContain('<sfLR:RegFactuSistemaFacturacion>');
    expect(xml).toContain('<sfLR:Cabecera>');
    expect(xml).toContain('<sfLR:RegistroFactura>');
    // …y sus hijos en el de la información.
    expect(xml).toContain('<sf:ObligadoEmision>');
  });

  it('mezcla altas y anulaciones en el mismo envío', () => {
    const xml = sobreRegFactu(cabecera, [
      { tipo: 'alta', datos: ALTA },
      { tipo: 'anulacion', datos: {
        idEmisorFacturaAnulada: '89890001K', numSerieFacturaAnulada: 'FAC-2026-0000',
        fechaExpedicionFacturaAnulada: '2026-03-01',
        fechaHoraHusoGenRegistro: '2026-03-12T09:00:00+01:00', huella: 'E'.repeat(64),
      } },
    ], SISTEMA);

    expect(xml.match(/<sfLR:RegistroFactura>/g)).toHaveLength(2);
    expect(xml).toContain('<sf:RegistroAlta>');
    expect(xml).toContain('<sf:RegistroAnulacion>');
  });

  it('no va firmado: en Veri*Factu la autenticación es el canal', () => {
    const xml = sobreRegFactu(cabecera, [{ tipo: 'alta', datos: ALTA }], SISTEMA);
    expect(xml).not.toContain('Signature');
  });

  it('se niega a mandar un envío vacío', () => {
    expect(() => sobreRegFactu(cabecera, [], SISTEMA)).toThrow();
  });

  it('se niega a pasarse del tope de 1000 registros del esquema', () => {
    const muchos = Array.from({ length: 1001 }, () => ({ tipo: 'alta' as const, datos: ALTA }));
    expect(() => sobreRegFactu(cabecera, muchos, SISTEMA)).toThrow(/1000/);
  });

  it('el bloque del sistema informático va completo', () => {
    const xml = sobreRegFactu(cabecera, [{ tipo: 'alta', datos: ALTA }], SISTEMA);
    enOrden(xml.slice(xml.indexOf('<sf:SistemaInformatico>')), [
      'NombreRazon', 'NIF', 'NombreSistemaInformatico', 'IdSistemaInformatico',
      'Version', 'NumeroInstalacion', 'TipoUsoPosibleSoloVerifactu',
      'TipoUsoPosibleMultiOT', 'IndicadorMultiplesOT',
    ]);
  });
});
