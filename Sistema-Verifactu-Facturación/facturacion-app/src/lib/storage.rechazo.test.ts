/**
 * UN RECHAZO DEL SERVIDOR NO ES UNA CAÍDA DE RED
 *
 * De esta distinción depende que Ajustes diga la verdad. Cuando la base de
 * datos rechaza un cambio —el guardián antifraude no deja cambiar el NIF del
 * emisor si ya hay facturas selladas, porque su NIF entra en la huella
 * encadenada de todas ellas— reintentarlo no arregla nada: hay que deshacer
 * el cambio local y contárselo al usuario.
 *
 * Confundir las dos cosas era el bug: el rechazo se metía en la cola de
 * sincronización, la pantalla decía «Configuración guardada» y un rato
 * después el valor viejo volvía solo, sin ninguna explicación.
 */

import { describe, expect, it } from 'vitest';
import { esRechazoDefinitivo, mensajeDeRechazo } from './storage';

describe('esRechazoDefinitivo', () => {
  it('el guardián antifraude del NIF es definitivo', () => {
    // Lo que devuelve de verdad `fn_settings_guard` al intentar cambiar el
    // NIF con facturas selladas: RAISE ... USING ERRCODE = 'check_violation'.
    expect(esRechazoDefinitivo({
      code: '23514',
      message: 'ANTIFRAUDE: no se puede cambiar el NIF emisor: ya hay 6 facturas emitidas cuya huella depende de él.',
    })).toBe(true);
  });

  it('también si sólo llega el mensaje, sin código', () => {
    expect(esRechazoDefinitivo({
      message: 'ANTIFRAUDE: el contador de facturación no puede retroceder (50 → 12).',
    })).toBe(true);
  });

  it('una violación de CHECK cualquiera es definitiva', () => {
    expect(esRechazoDefinitivo({ code: '23514', message: 'new row violates check constraint "chk_comision_base"' })).toBe(true);
  });

  it('un permiso denegado por RLS es definitivo: reintentar no da permisos', () => {
    expect(esRechazoDefinitivo({ code: '42501', message: 'permission denied for table company_settings' })).toBe(true);
  });

  it('una columna que no existe es definitiva', () => {
    expect(esRechazoDefinitivo({ code: '42703', message: 'column "almacenes" does not exist' })).toBe(true);
  });

  it('una caída de red NO es definitiva: eso sí se reintenta', () => {
    expect(esRechazoDefinitivo({ message: 'Failed to fetch' })).toBe(false);
  });

  it('un servidor que no contesta tampoco', () => {
    expect(esRechazoDefinitivo({ code: '503', message: 'Service Unavailable' })).toBe(false);
  });

  it('un error sin nada dentro se trata como reintentable, que es lo prudente', () => {
    expect(esRechazoDefinitivo({})).toBe(false);
  });
});

describe('mensajeDeRechazo', () => {
  it('se queda con la explicación y tira el prefijo técnico', () => {
    expect(mensajeDeRechazo({
      code: '23514',
      message: 'ANTIFRAUDE: no se puede cambiar el NIF emisor: ya hay 6 facturas emitidas cuya huella depende de él.',
    })).toBe('no se puede cambiar el NIF emisor: ya hay 6 facturas emitidas cuya huella depende de él.');
  });

  it('sin mensaje, dice algo antes que nada', () => {
    expect(mensajeDeRechazo({})).toBe('El servidor ha rechazado el cambio.');
  });
});
