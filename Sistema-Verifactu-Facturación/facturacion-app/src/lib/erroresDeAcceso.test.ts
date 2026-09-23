import { describe, it, expect } from 'vitest';

import { errorDeAcceso, parametrosDeError, traeErrorDeAcceso } from './erroresDeAcceso';

/**
 * LO QUE VE ALGUIEN CUANDO EL ACCESO CON GOOGLE FALLA
 *
 * Supabase no devuelve un aviso: devuelve una dirección con el motivo
 * dentro, y la manda a la portada, donde nadie la leía. El usuario se
 * quedaba mirando la web pública con esto en la barra del navegador:
 *
 *   /?error=invalid_request&error_code=flow_state_already_used
 *    &error_description=State+has+already+been+used
 *
 * y ninguna explicación.
 */

/** La dirección literal que se reportó. */
const LA_QUE_SALIO = new URLSearchParams(
  'error=invalid_request&error_code=flow_state_already_used'
  + '&error_description=State+has+already+been+used',
);

describe('reconocer que la dirección trae un error', () => {
  it('lo ve venga como venga', () => {
    expect(traeErrorDeAcceso(LA_QUE_SALIO)).toBe(true);
    expect(traeErrorDeAcceso(new URLSearchParams('error=access_denied'))).toBe(true);
    expect(traeErrorDeAcceso(new URLSearchParams('error_code=otp_expired'))).toBe(true);
  });

  it('y no confunde una dirección normal', () => {
    expect(traeErrorDeAcceso(new URLSearchParams('next=/facturas'))).toBe(false);
    expect(traeErrorDeAcceso(new URLSearchParams())).toBe(false);
  });
});

describe('el mensaje que se le enseña a la persona', () => {
  it('el caso que se reportó se explica y dice qué hacer', () => {
    const aviso = errorDeAcceso(LA_QUE_SALIO)!;
    expect(aviso.mensaje).toMatch(/ya se había usado/i);
    // Un mensaje que explica el fallo pero no da salida deja a la persona
    // igual de atascada.
    expect(aviso.mensaje).toMatch(/vuelve a pulsar/i);
  });

  it('y lleva la pista de por qué pasa en local', () => {
    expect(errorDeAcceso(LA_QUE_SALIO)!.pistaParaLocal).toMatch(/localhost/i);
  });

  it('nunca enseña la jerga del proveedor', () => {
    // «flow_state_already_used» no le dice nada a quien sólo quiere
    // facturar.
    const aviso = errorDeAcceso(LA_QUE_SALIO)!;
    expect(aviso.mensaje).not.toMatch(/flow_state|invalid_request|State has/i);
  });

  it('cubre los demás que se dan de verdad', () => {
    for (const codigo of [
      'flow_state_not_found', 'bad_oauth_state', 'bad_code_verifier',
      'provider_email_needs_verification', 'access_denied', 'otp_expired', 'auth_error',
    ]) {
      const aviso = errorDeAcceso(new URLSearchParams(`error_code=${codigo}`));
      expect(aviso, `falta el mensaje de ${codigo}`).not.toBeNull();
      expect(aviso!.mensaje.length, `${codigo} tiene el mensaje vacío`).toBeGreaterThan(20);
    }
  });

  it('un código que no conocemos no se traga en silencio', () => {
    // La descripción original es la única pista que tendrá quien vaya a
    // mirarlo, así que se conserva en vez de sustituirla por «error».
    const aviso = errorDeAcceso(new URLSearchParams(
      'error_code=algo_nuevo&error_description=Something+odd+happened',
    ))!;
    expect(aviso.mensaje).toContain('Something odd happened');
  });

  it('sin descripción, al menos dice qué hacer', () => {
    expect(errorDeAcceso(new URLSearchParams('error_code=algo_nuevo'))!.mensaje)
      .toMatch(/vuelve a intentarlo/i);
  });

  it('sin error, no hay aviso', () => {
    expect(errorDeAcceso(new URLSearchParams('next=/facturas'))).toBeNull();
  });
});

describe('llevar el error de la portada a la pantalla de entrada', () => {
  it('se lleva los tres parámetros y nada más', () => {
    const llevados = parametrosDeError(new URLSearchParams(
      'error=invalid_request&error_code=flow_state_already_used'
      + '&error_description=State+has+already+been+used&utm_source=espia',
    ));
    expect(llevados.get('error_code')).toBe('flow_state_already_used');
    expect(llevados.get('error_description')).toBe('State has already been used');
    // Lo que no es del error no viaja: la dirección de entrada no es un
    // sitio donde volcar lo que traiga la anterior.
    expect(llevados.get('utm_source')).toBeNull();
  });

  it('sin error no se lleva nada', () => {
    expect([...parametrosDeError(new URLSearchParams('next=/facturas'))]).toEqual([]);
  });
});
