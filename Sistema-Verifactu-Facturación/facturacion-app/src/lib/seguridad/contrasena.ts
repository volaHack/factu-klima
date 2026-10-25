/**
 * CAMBIAR LA CONTRASEÑA DESDE AJUSTES
 *
 * Lo que no depende de la pantalla: qué se le pide a la nueva y cómo se
 * cuenta en castellano lo que contesta Supabase Auth.
 */

export const LARGO_MINIMO = 8;

/** Lo que falla en el formulario antes de preguntar a nadie; vacío si está bien. */
export function problemaDeLaNueva(actual: string, nueva: string, repetida: string): string {
  if (!actual) return 'Escribe tu contraseña actual.';
  if (nueva.length < LARGO_MINIMO) return `La nueva necesita al menos ${LARGO_MINIMO} caracteres.`;
  if (nueva !== repetida) return 'Las dos contraseñas nuevas no coinciden.';
  if (nueva === actual) return 'La nueva tiene que ser distinta de la actual.';
  return '';
}

/** Lo justo de un error de Supabase Auth para decidir qué decir. */
export interface FalloAuth { code?: string; message?: string; status?: number }

const texto = (f: FalloAuth) => `${f.code ?? ''} ${f.message ?? ''}`;

/** Supabase pide confirmar con un código del correo (cambio de contraseña «seguro»). */
export function pideCodigoDelCorreo(f: FalloAuth): boolean {
  return /reauthentication_needed|reauthenticat/i.test(texto(f));
}

export function mensajeDeFallo(f: FalloAuth): string {
  const t = texto(f);
  if (/invalid_credentials|current_password|invalid login/i.test(t)) return 'La contraseña actual no es correcta.';
  if (/same_password|should be different/i.test(t)) return 'La nueva tiene que ser distinta de la actual.';
  if (/weak_password|pwned|leaked|too weak/i.test(t)) {
    return 'Esa contraseña es demasiado fácil de adivinar o ha aparecido en filtraciones. Prueba con otra más larga, mezclando palabras y números.';
  }
  if (/reauthentication_not_valid|nonce|otp/i.test(t)) return 'Ese código no vale o ha caducado. Pide otro.';
  if (/over_request_rate_limit|rate limit|too many/i.test(t) || f.status === 429) {
    return 'Demasiados intentos seguidos. Espera unos minutos y vuelve a probar.';
  }
  if (/fetch|network|failed to/i.test(t)) return 'No hay conexión. Para cambiar la contraseña hace falta internet.';
  return 'No se ha podido cambiar. Vuelve a intentarlo en un momento.';
}
