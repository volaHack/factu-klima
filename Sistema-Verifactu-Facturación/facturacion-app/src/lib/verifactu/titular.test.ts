import { describe, expect, it } from 'vitest';
import { avisoNifDistinto, certificadoValeParaNif, nifsEnTexto } from './titular';
import { explicarFallo, parsearRespuestaAeat, resumirRespuesta } from './respuestaAeat';

const PERSONA_FISICA = 'C=ES, serialNumber=IDCES-78816596N, GN=ELENA, SN=RODRIGUEZ GARCIA, CN=RODRIGUEZ GARCIA ELENA - 78816596N';
const REPRESENTANTE = 'C=ES, 2.5.4.97=VATES-B12345674, O=EJEMPLO SL, serialNumber=IDCES-12345678Z, CN=12345678Z NOMBRE APELLIDO (R: B12345674)';

describe('nifsEnTexto', () => {
  it('saca el NIF de un certificado de persona física, sin repetir', () => {
    expect(nifsEnTexto(PERSONA_FISICA)).toEqual(['78816596N']);
  });
  it('en uno de representante salen el DNI y el CIF', () => {
    expect(nifsEnTexto(REPRESENTANTE).sort()).toEqual(['12345678Z', 'B12345674']);
  });
  it('sin texto, nada', () => {
    expect(nifsEnTexto(null)).toEqual([]);
  });
});

describe('certificadoValeParaNif', () => {
  it('vale si es el del titular', () => {
    expect(certificadoValeParaNif(PERSONA_FISICA, '78816596N')).toBe(true);
    expect(certificadoValeParaNif(PERSONA_FISICA, ' 78816596-n ')).toBe(true);
  });
  it('no vale con otro NIF: es lo que la AEAT rechaza con el 4104', () => {
    expect(certificadoValeParaNif(PERSONA_FISICA, '78837942Z')).toBe(false);
  });
  it('el certificado de representante vale para la empresa representada', () => {
    expect(certificadoValeParaNif(REPRESENTANTE, 'B12345674')).toBe(true);
  });
  it('en la duda no bloquea', () => {
    expect(certificadoValeParaNif('CN=Sin NIF', '78837942Z')).toBeNull();
    expect(certificadoValeParaNif(PERSONA_FISICA, '')).toBeNull();
  });
  it('el aviso dice los dos NIF', () => {
    const t = avisoNifDistinto(PERSONA_FISICA, '78837942z');
    expect(t).toContain('78816596N');
    expect(t).toContain('78837942Z');
  });
});

describe('rechazo 4104', () => {
  const xml = '<?xml version="1.0" encoding="UTF-8"?><env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/"><env:Body><env:Fault>'
    + '<faultcode>env:Client</faultcode><faultstring>Codigo[4104].Error en la cabecera: el valor del campo NIF del bloque ObligadoEmision no está identificado.. NIF:78837942Z. NOMBRE_RAZON:Distribución Alimentaria Rogar.</faultstring>'
    + '</env:Fault></env:Body></env:Envelope>';

  it('se explica qué hay que tocar', () => {
    const r = parsearRespuestaAeat(xml);
    expect(r.fallo?.mensaje).toContain('4104');
    expect(resumirRespuesta(r)).toContain('Qué hacer');
  });
  it('otros fallos no llevan explicación inventada', () => {
    expect(explicarFallo('Codigo[9999]. Otra cosa')).toBeNull();
  });
});
