import { describe, it, expect } from 'vitest';
import { mensajeDeFallo, pideCodigoDelCorreo, problemaDeLaNueva } from './contrasena';

describe('cambiar la contraseña', () => {
  it('revisa el formulario antes de enviar nada', () => {
    expect(problemaDeLaNueva('', 'nuevaclave1', 'nuevaclave1')).toMatch(/actual/);
    expect(problemaDeLaNueva('vieja', 'corta', 'corta')).toMatch(/8 caracteres/);
    expect(problemaDeLaNueva('vieja', 'nuevaclave1', 'nuevaclave2')).toMatch(/no coinciden/);
    expect(problemaDeLaNueva('nuevaclave1', 'nuevaclave1', 'nuevaclave1')).toMatch(/distinta/);
    expect(problemaDeLaNueva('vieja', 'nuevaclave1', 'nuevaclave1')).toBe('');
  });

  it('traduce lo que contesta Supabase', () => {
    expect(mensajeDeFallo({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toMatch(/actual no es correcta/);
    expect(mensajeDeFallo({ code: 'same_password' })).toMatch(/distinta/);
    expect(mensajeDeFallo({ code: 'weak_password', message: 'Password is known to be weak' })).toMatch(/fácil de adivinar/);
    expect(mensajeDeFallo({ status: 429 })).toMatch(/Demasiados intentos/);
    expect(mensajeDeFallo({ message: 'Failed to fetch' })).toMatch(/conexión/);
    expect(mensajeDeFallo({ message: '???' })).toMatch(/No se ha podido/);
  });

  it('reconoce cuando hace falta el código del correo', () => {
    expect(pideCodigoDelCorreo({ code: 'reauthentication_needed' })).toBe(true);
    expect(pideCodigoDelCorreo({ code: 'weak_password' })).toBe(false);
  });
});
