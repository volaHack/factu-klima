/**
 * LOS TRES EJEMPLOS OFICIALES, Y NADA MÁS
 *
 * El documento de la AEAT «Detalle de las especificaciones técnicas para
 * generación de la huella o hash de los registros de facturación» v0.1.2
 * (27/08/2024) trae tres casos resueltos en su apartado 6, con la cadena
 * de entrada y la huella de salida escritas letra a letra. Son la única
 * forma que tenemos de comprobar esto sin un certificado y sin la AEAT
 * delante, así que están copiados tal cual.
 *
 * Si alguno de estos tres falla, la implementación está mal: no hay
 * interpretación posible, son los datos que publica quien va a validar
 * nuestras facturas.
 */

import { describe, expect, it } from 'vitest';
import {
  cadenaHuellaAlta, cadenaHuellaAnulacion, calcularHuella, esHuellaValida,
  fechaAeat, huellaDeAlta, huellaDeAnulacion, importeAeat, marcaDeTiempoAeat,
} from './huella';

// Apartado 6.1: primer registro de un SIF, sin huella anterior.
const CASO_1 = {
  campos: {
    idEmisorFactura: '89890001K',
    numSerieFactura: '12345678/G33',
    fechaExpedicionFactura: '01-01-2024',
    tipoFactura: 'F1',
    cuotaTotal: 12.35,
    importeTotal: 123.45,
    huellaAnterior: null,
    fechaHoraHusoGenRegistro: '2024-01-01T19:20:30+01:00',
  },
  cadena:
    'IDEmisorFactura=89890001K&NumSerieFactura=12345678/G33&FechaExpedicionFactura=01-01-2024'
    + '&TipoFactura=F1&CuotaTotal=12.35&ImporteTotal=123.45&Huella='
    + '&FechaHoraHusoGenRegistro=2024-01-01T19:20:30+01:00',
  huella: '3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60',
};

// Apartado 6.2: segundo registro, encadenado al anterior.
const CASO_2 = {
  campos: {
    idEmisorFactura: '89890001K',
    numSerieFactura: '12345679/G34',
    fechaExpedicionFactura: '01-01-2024',
    tipoFactura: 'F1',
    cuotaTotal: 12.35,
    importeTotal: 123.45,
    huellaAnterior: CASO_1.huella,
    fechaHoraHusoGenRegistro: '2024-01-01T19:20:35+01:00',
  },
  cadena:
    'IDEmisorFactura=89890001K&NumSerieFactura=12345679/G34&FechaExpedicionFactura=01-01-2024'
    + `&TipoFactura=F1&CuotaTotal=12.35&ImporteTotal=123.45&Huella=${CASO_1.huella}`
    + '&FechaHoraHusoGenRegistro=2024-01-01T19:20:35+01:00',
  huella: 'F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97',
};

// Apartado 6.3: anulación de la factura del caso 2.
const CASO_3 = {
  campos: {
    idEmisorFacturaAnulada: '89890001K',
    numSerieFacturaAnulada: '12345679/G34',
    fechaExpedicionFacturaAnulada: '01-01-2024',
    huellaAnterior: CASO_2.huella,
    fechaHoraHusoGenRegistro: '2024-01-01T19:20:40+01:00',
  },
  cadena:
    'IDEmisorFacturaAnulada=89890001K&NumSerieFacturaAnulada=12345679/G34'
    + `&FechaExpedicionFacturaAnulada=01-01-2024&Huella=${CASO_2.huella}`
    + '&FechaHoraHusoGenRegistro=2024-01-01T19:20:40+01:00',
  huella: '177547C0D57AC74748561D054A9CEC14B4C4EA23D1BEFD6F2E69E3A388F90C68',
};

describe('los ejemplos oficiales de la AEAT', () => {
  it('caso 1 · la cadena del primer registro sale letra a letra', () => {
    expect(cadenaHuellaAlta(CASO_1.campos)).toBe(CASO_1.cadena);
  });

  it('caso 1 · y su huella', async () => {
    await expect(huellaDeAlta(CASO_1.campos)).resolves.toBe(CASO_1.huella);
  });

  it('caso 2 · la cadena del registro encadenado', () => {
    expect(cadenaHuellaAlta(CASO_2.campos)).toBe(CASO_2.cadena);
  });

  it('caso 2 · y su huella', async () => {
    await expect(huellaDeAlta(CASO_2.campos)).resolves.toBe(CASO_2.huella);
  });

  it('caso 3 · la cadena de una anulación, que lleva otros campos', () => {
    expect(cadenaHuellaAnulacion(CASO_3.campos)).toBe(CASO_3.cadena);
  });

  it('caso 3 · y su huella', async () => {
    await expect(huellaDeAnulacion(CASO_3.campos)).resolves.toBe(CASO_3.huella);
  });
});

describe('las reglas del apartado 3', () => {
  it('el primer registro deja la huella anterior vacía, pero el campo va', async () => {
    // «…&Huella=&FechaHoraHusoGenRegistro=…». Quitar el campo entero en vez
    // de dejarlo vacío es el fallo silencioso más probable, y daría una
    // huella distinta de la de la AEAT sin que nada avise.
    expect(cadenaHuellaAlta(CASO_1.campos)).toContain('&Huella=&FechaHoraHusoGenRegistro=');
    await expect(huellaDeAlta({ ...CASO_1.campos, huellaAnterior: undefined }))
      .resolves.toBe(CASO_1.huella);
    await expect(huellaDeAlta({ ...CASO_1.campos, huellaAnterior: '' }))
      .resolves.toBe(CASO_1.huella);
  });

  it('recorta los espacios de los extremos: «   12345678 / G33  » es «12345678 / G33»', () => {
    const cadena = cadenaHuellaAlta({ ...CASO_1.campos, numSerieFactura: '   12345678 / G33  ' });
    expect(cadena).toContain('NumSerieFactura=12345678 / G33&');
  });

  it('NO codifica la barra del número de factura', () => {
    // Si alguien mete un encodeURIComponent aquí, esto lo caza.
    expect(cadenaHuellaAlta(CASO_1.campos)).toContain('12345678/G33');
    expect(cadenaHuellaAlta(CASO_1.campos)).not.toContain('%2F');
  });

  it('los ceros a la derecha no cambian la huella', async () => {
    // El documento lo dice explícitamente: 123.1 y 123.10 son lo mismo.
    const a = await huellaDeAlta({ ...CASO_1.campos, importeTotal: 123.4 });
    const b = await huellaDeAlta({ ...CASO_1.campos, importeTotal: 123.40 });
    expect(a).toBe(b);
  });

  it('la salida son 64 hexadecimales EN MAYÚSCULAS', async () => {
    const huella = await calcularHuella('cualquier cosa');
    expect(huella).toMatch(/^[0-9A-F]{64}$/);
    expect(esHuellaValida(huella)).toBe(true);
    expect(esHuellaValida(huella.toLowerCase())).toBe(false);
  });

  it('la cadena se codifica en UTF-8, no en latin-1', async () => {
    // Un nombre con eñe da huellas distintas según la codificación, y el
    // documento fija UTF-8. Se compara contra el valor que da SHA-256 sobre
    // los bytes UTF-8 de esa misma cadena.
    const cadena = cadenaHuellaAlta({ ...CASO_1.campos, numSerieFactura: 'AÑO-1' });
    const esperado = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(cadena));
    const hex = Array.from(new Uint8Array(esperado))
      .map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    await expect(calcularHuella(cadena)).resolves.toBe(hex);
  });

  it('cambiar un solo céntimo cambia la huella entera', async () => {
    const otra = await huellaDeAlta({ ...CASO_1.campos, importeTotal: 123.46 });
    expect(otra).not.toBe(CASO_1.huella);
  });
});

describe('fechaAeat', () => {
  it('le da la vuelta al ISO: 2024-01-01 es 01-01-2024', () => {
    expect(fechaAeat('2024-01-01')).toBe('01-01-2024');
    expect(fechaAeat('2026-12-31')).toBe('31-12-2026');
  });

  it('admite un ISO con hora detrás y se queda con el día', () => {
    expect(fechaAeat('2026-03-10T14:22:00Z')).toBe('10-03-2026');
  });

  it('se niega a inventarse una fecha que no lo es', () => {
    expect(() => fechaAeat('10/03/2026')).toThrow();
    expect(() => fechaAeat('')).toThrow();
  });
});

describe('importeAeat', () => {
  it('dos decimales y punto, que es lo que pide el XSD', () => {
    expect(importeAeat(123.4)).toBe('123.40');
    expect(importeAeat(0)).toBe('0.00');
    expect(importeAeat(1234.567)).toBe('1234.57');
  });

  it('no escribe «-0.00»', () => {
    expect(importeAeat(-0.001)).toBe('0.00');
  });

  it('los negativos se conservan: una rectificativa puede serlo', () => {
    expect(importeAeat(-121)).toBe('-121.00');
  });

  it('se niega con lo que no es un número', () => {
    expect(() => importeAeat(NaN)).toThrow();
    expect(() => importeAeat(Infinity)).toThrow();
  });
});

describe('marcaDeTiempoAeat', () => {
  it('en enero, España va a +01:00', () => {
    expect(marcaDeTiempoAeat(new Date('2024-01-01T18:20:30Z')))
      .toBe('2024-01-01T19:20:30+01:00');
  });

  it('en julio, horario de verano: +02:00', () => {
    // El desplazamiento se mide, no se supone: si esto se hubiera fijado a
    // +01:00, todas las facturas de verano llevarían una hora de menos.
    expect(marcaDeTiempoAeat(new Date('2024-07-15T10:00:00Z')))
      .toBe('2024-07-15T12:00:00+02:00');
  });

  it('canarias va una hora por detrás de la península', () => {
    expect(marcaDeTiempoAeat(new Date('2024-01-01T18:20:30Z'), 'Atlantic/Canary'))
      .toBe('2024-01-01T18:20:30+00:00');
  });

  it('nunca sale en UTC con Z: el registro documenta su huso', () => {
    expect(marcaDeTiempoAeat(new Date())).toMatch(/[+-]\d{2}:\d{2}$/);
  });
});
