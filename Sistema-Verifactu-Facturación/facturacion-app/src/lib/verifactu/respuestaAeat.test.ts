/**
 * LEER LA RESPUESTA SIN MENTIRLE AL USUARIO
 *
 * El fallo caro de este módulo no es no entender la respuesta: es
 * entenderla a medias. Un envío «ParcialmenteCorrecto» con nueve
 * facturas dentro y una fuera puede acabar, según cómo se lea, en nueve
 * facturas reenviadas (duplicados) o en una factura sin presentar que
 * nadie sabe que falta. Por eso casi todas estas pruebas son sobre la
 * mezcla.
 *
 * Las respuestas de ejemplo siguen RespuestaSuministro.xsd. Se usan a
 * propósito prefijos distintos en cada una —sfR:, ns2:, ninguno— porque
 * la AEAT no promete cuál usa y suponerlo es la clase de detalle que
 * funciona en pruebas y falla el día del estreno.
 */

import { describe, expect, it } from 'vitest';
import { estadoLocalDe, parsearRespuestaAeat, resumirRespuesta } from './respuestaAeat';

const TODO_BIEN = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
 <soapenv:Body>
  <sfR:RespuestaRegFactuSistemaFacturacion xmlns:sfR="https://www2.agenciatributaria.gob.es/x/RespuestaSuministro.xsd">
   <sfR:CSV>ABCD1234EFGH5678</sfR:CSV>
   <sfR:DatosPresentacion>
    <sf:NIFPresentador>89890001K</sf:NIFPresentador>
    <sf:TimestampPresentacion>2026-03-10T12:00:05+01:00</sf:TimestampPresentacion>
   </sfR:DatosPresentacion>
   <sfR:TiempoEsperaEnvio>60</sfR:TiempoEsperaEnvio>
   <sfR:EstadoEnvio>Correcto</sfR:EstadoEnvio>
   <sfR:RespuestaLinea>
    <sf:IDFactura>
     <sf:IDEmisorFactura>89890001K</sf:IDEmisorFactura>
     <sf:NumSerieFactura>FAC-2026-0001</sf:NumSerieFactura>
     <sf:FechaExpedicionFactura>10-03-2026</sf:FechaExpedicionFactura>
    </sf:IDFactura>
    <sf:Operacion><sf:TipoOperacion>Alta</sf:TipoOperacion></sf:Operacion>
    <sfR:EstadoRegistro>Correcto</sfR:EstadoRegistro>
   </sfR:RespuestaLinea>
  </sfR:RespuestaRegFactuSistemaFacturacion>
 </soapenv:Body>
</soapenv:Envelope>`;

const A_MEDIAS = `<?xml version="1.0"?>
<Envelope xmlns="http://schemas.xmlsoap.org/soap/envelope/"><Body>
 <RespuestaRegFactuSistemaFacturacion>
  <CSV>ZZZZ9999</CSV>
  <EstadoEnvio>ParcialmenteCorrecto</EstadoEnvio>
  <RespuestaLinea>
   <IDFactura><IDEmisorFactura>89890001K</IDEmisorFactura>
    <NumSerieFactura>FAC-2026-0001</NumSerieFactura>
    <FechaExpedicionFactura>10-03-2026</FechaExpedicionFactura></IDFactura>
   <Operacion><TipoOperacion>Alta</TipoOperacion></Operacion>
   <EstadoRegistro>Correcto</EstadoRegistro>
  </RespuestaLinea>
  <RespuestaLinea>
   <IDFactura><IDEmisorFactura>89890001K</IDEmisorFactura>
    <NumSerieFactura>FAC-2026-0002</NumSerieFactura>
    <FechaExpedicionFactura>11-03-2026</FechaExpedicionFactura></IDFactura>
   <Operacion><TipoOperacion>Alta</TipoOperacion></Operacion>
   <EstadoRegistro>AceptadoConErrores</EstadoRegistro>
   <CodigoErrorRegistro>3001</CodigoErrorRegistro>
   <DescripcionErrorRegistro>La huella no coincide con la calculada</DescripcionErrorRegistro>
  </RespuestaLinea>
  <RespuestaLinea>
   <IDFactura><IDEmisorFactura>89890001K</IDEmisorFactura>
    <NumSerieFactura>FAC-2026-0003</NumSerieFactura>
    <FechaExpedicionFactura>12-03-2026</FechaExpedicionFactura></IDFactura>
   <Operacion><TipoOperacion>Anulacion</TipoOperacion></Operacion>
   <EstadoRegistro>Incorrecto</EstadoRegistro>
   <CodigoErrorRegistro>1102</CodigoErrorRegistro>
   <DescripcionErrorRegistro>NIF del destinatario no identificado</DescripcionErrorRegistro>
  </RespuestaLinea>
 </RespuestaRegFactuSistemaFacturacion>
</Body></Envelope>`;

const FALLO = `<?xml version="1.0"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body>
 <soapenv:Fault>
  <faultcode>env:Client</faultcode>
  <faultstring>El certificado no corresponde con el titular</faultstring>
 </soapenv:Fault>
</soapenv:Body></soapenv:Envelope>`;

describe('un envío que sale bien', () => {
  const r = parsearRespuestaAeat(TODO_BIEN);

  it('trae el CSV, que es el resguardo de la presentación', () => {
    expect(r.csv).toBe('ABCD1234EFGH5678');
  });

  it('lee el estado del envío y los datos de la presentación', () => {
    expect(r.estadoEnvio).toBe('Correcto');
    expect(r.nifPresentador).toBe('89890001K');
    expect(r.timestampPresentacion).toBe('2026-03-10T12:00:05+01:00');
    expect(r.tiempoEsperaEnvio).toBe(60);
  });

  it('lee la línea con su número de factura y su operación', () => {
    expect(r.lineas).toHaveLength(1);
    expect(r.lineas[0].numSerieFactura).toBe('FAC-2026-0001');
    expect(r.lineas[0].operacion).toBe('Alta');
    expect(r.lineas[0].estado).toBe('Correcto');
  });

  it('no hay fallo SOAP', () => {
    expect(r.fallo).toBeNull();
  });
});

describe('un envío parcialmente correcto', () => {
  const r = parsearRespuestaAeat(A_MEDIAS);

  it('lee las tres líneas por separado, cada una con su estado', () => {
    expect(r.estadoEnvio).toBe('ParcialmenteCorrecto');
    expect(r.lineas.map(l => l.estado)).toEqual(['Correcto', 'AceptadoConErrores', 'Incorrecto']);
  });

  it('lleva el código y la explicación del error de cada una', () => {
    expect(r.lineas[1].codigoError).toBe('3001');
    expect(r.lineas[1].descripcionError).toBe('La huella no coincide con la calculada');
    expect(r.lineas[2].codigoError).toBe('1102');
  });

  it('distingue la anulación del alta', () => {
    expect(r.lineas[2].operacion).toBe('Anulacion');
  });

  it('funciona igual sin prefijos de espacio de nombres', () => {
    expect(r.csv).toBe('ZZZZ9999');
  });

  it('se resume en castellano y sin redondear la verdad', () => {
    expect(resumirRespuesta(r)).toBe('1 aceptada, 1 aceptada con avisos, 1 rechazada');
  });
});

describe('los estados que guardamos', () => {
  it('«Correcto» y «AceptadoConErrores» son DEFINITIVOS: no se reenvían', () => {
    // Es la regla que evita los duplicados. Aceptado con errores
    // significa que la AEAT lo tiene registrado y avisa de algo, no que
    // haya que volver a mandarlo.
    expect(estadoLocalDe('Correcto')).toBe('aceptado');
    expect(estadoLocalDe('AceptadoConErrores')).toBe('aceptado_con_errores');
  });

  it('sólo «Incorrecto» vuelve a la cola', () => {
    expect(estadoLocalDe('Incorrecto')).toBe('rechazado');
  });
});

describe('cuando algo va mal de verdad', () => {
  it('un fallo SOAP se lee y se explica en vez de quedarse en blanco', () => {
    const r = parsearRespuestaAeat(FALLO);
    expect(r.fallo?.mensaje).toBe('El certificado no corresponde con el titular');
    expect(r.estadoEnvio).toBeNull();
    expect(r.lineas).toEqual([]);
    expect(resumirRespuesta(r)).toContain('El certificado no corresponde');
  });

  it('una respuesta que no se entiende no se toma por buena', () => {
    const r = parsearRespuestaAeat('<html><body>502 Bad Gateway</body></html>');
    expect(r.estadoEnvio).toBeNull();
    expect(r.csv).toBeNull();
    expect(r.lineas).toEqual([]);
  });

  it('un estado de registro desconocido se trata como incorrecto', () => {
    // Ante la duda, se reintenta: un duplicado avisa, y una factura sin
    // presentar que se cree presentada no avisa de nada.
    const raro = A_MEDIAS.replace('<EstadoRegistro>Correcto</EstadoRegistro>',
                                  '<EstadoRegistro>Regulinchi</EstadoRegistro>');
    expect(parsearRespuestaAeat(raro).lineas[0].estado).toBe('Incorrecto');
  });

  it('desescapa el texto de los errores', () => {
    const conEscape = A_MEDIAS.replace(
      'NIF del destinatario no identificado',
      'El NIF de &quot;Bar Paco &amp; Hijos&quot; no est&#225; identificado',
    );
    expect(parsearRespuestaAeat(conEscape).lineas[2].descripcionError)
      .toBe('El NIF de "Bar Paco & Hijos" no está identificado');
  });

  it('sin ninguna línea lo dice, en vez de resumir un éxito vacío', () => {
    const vacia = TODO_BIEN.replace(/<sfR:RespuestaLinea>[\s\S]*?<\/sfR:RespuestaLinea>/, '');
    expect(resumirRespuesta(parsearRespuestaAeat(vacia))).toContain('no ha devuelto ninguna línea');
  });
});
