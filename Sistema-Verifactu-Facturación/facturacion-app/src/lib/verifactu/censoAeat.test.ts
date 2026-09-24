import { describe, it, expect } from 'vitest';
import { estadoDe, parsearRespuestaVNifV2, sobreVNifV2 } from './censoAeat';

describe('sobreVNifV2', () => {
  it('sigue el esquema VNifV2Ent: elementos calificados y escapados', () => {
    const s = sobreVNifV2([{ nif: 'B12345674', nombre: 'Pérez & Hijos S.L.' }]);
    expect(s).toContain('xmlns:vnif="https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/burt/jdit/ws/VNifV2Ent.xsd"');
    expect(s).toContain('<vnif:VNifV2Ent><vnif:Contribuyente><vnif:Nif>B12345674</vnif:Nif><vnif:Nombre>Pérez &amp; Hijos S.L.</vnif:Nombre></vnif:Contribuyente></vnif:VNifV2Ent>');
    expect(s).toMatch(/^<\?xml[^>]+\?><soapenv:Envelope xmlns:soapenv="http:\/\/schemas.xmlsoap.org\/soap\/envelope\/"/);
  });
});

describe('parsearRespuestaVNifV2', () => {
  const NS = 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/burt/jdit/ws/VNifV2Sal.xsd';

  it('lee cada contribuyente con cualquier prefijo', () => {
    const xml = `<env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/"><env:Body>
      <VNifV2Sal:VNifV2Sal xmlns:VNifV2Sal="${NS}">
        <VNifV2Sal:Contribuyente><VNifV2Sal:Nif>B12345674</VNifV2Sal:Nif><VNifV2Sal:Nombre>DISTRIBUCIONES PEPE SL</VNifV2Sal:Nombre><VNifV2Sal:Resultado>IDENTIFICADO</VNifV2Sal:Resultado></VNifV2Sal:Contribuyente>
        <VNifV2Sal:Contribuyente><VNifV2Sal:Nif>12345678Z</VNifV2Sal:Nif><VNifV2Sal:Nombre>GARCIA PEREZ MARIA</VNifV2Sal:Nombre><VNifV2Sal:Resultado>NO IDENTIFICADO-SIMILAR</VNifV2Sal:Resultado></VNifV2Sal:Contribuyente>
      </VNifV2Sal:VNifV2Sal></env:Body></env:Envelope>`;
    const r = parsearRespuestaVNifV2(xml);
    expect(r).toEqual([
      { nif: 'B12345674', nombreCenso: 'DISTRIBUCIONES PEPE SL', resultado: 'IDENTIFICADO', estado: 'identificado' },
      { nif: '12345678Z', nombreCenso: 'GARCIA PEREZ MARIA', resultado: 'NO IDENTIFICADO-SIMILAR', estado: 'similar' },
    ]);
  });

  it('un SOAP Fault se convierte en error con el motivo de la AEAT', () => {
    const xml = '<S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/"><S:Body><S:Fault><faultcode>S:Client</faultcode><faultstring>Certificado no autorizado</faultstring></S:Fault></S:Body></S:Envelope>';
    expect(() => parsearRespuestaVNifV2(xml)).toThrow(/Certificado no autorizado/);
  });

  it('traduce todos los resultados documentados', () => {
    expect(estadoDe('IDENTIFICADO')).toBe('identificado');
    expect(estadoDe('NO IDENTIFICADO')).toBe('no_identificado');
    expect(estadoDe('IDENTIFICADO-BAJA')).toBe('baja');
    expect(estadoDe('IDENTIFICADO-REVOCADO')).toBe('revocado');
    expect(estadoDe('NO PROCESADO')).toBe('no_procesado');
    expect(estadoDe('OTRA COSA')).toBe('desconocido');
  });
});
