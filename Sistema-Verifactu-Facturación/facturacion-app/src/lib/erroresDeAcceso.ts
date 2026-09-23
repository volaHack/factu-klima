/**
 * LOS ERRORES DE ACCESO, EN CASTELLANO
 *
 * Cuando algo falla al entrar con Google, Supabase no devuelve un aviso:
 * devuelve una dirección. El usuario acaba mirando esto en la barra del
 * navegador y nadie se lo traduce:
 *
 *   /?error=invalid_request&error_code=flow_state_already_used
 *    &error_description=State+has+already+been+used
 *
 * Nada del programa leía esos parámetros. Así que la pantalla de entrada
 * salía en blanco, como si no hubiera pasado nada, y la única pista era
 * una línea de texto en inglés dentro de una URL.
 *
 * Aquí se traducen los que se dan de verdad, y —lo que importa— se dice
 * QUÉ HACER. Un mensaje que explica el fallo pero no da salida deja a la
 * persona exactamente igual de atascada.
 */

export interface ErrorDeAcceso {
  /** Lo que se le enseña a quien no sabe qué es un flujo OAuth. */
  mensaje: string;
  /**
   * Si esto le pasa a quien está desarrollando en su ordenador, la causa
   * casi siempre es la misma y tiene arreglo en un sitio concreto.
   */
  pistaParaLocal?: string;
}

const MENSAJES: Record<string, ErrorDeAcceso> = {
  flow_state_already_used: {
    mensaje:
      'Ese enlace de acceso ya se había usado. Vuelve a pulsar «Continuar con '
      + 'Google» para empezar de nuevo.',
    pistaParaLocal:
      'Entrando desde localhost esto suele significar que la dirección de vuelta '
      + 'no está autorizada en Supabase: la sesión se completa en el dominio '
      + 'público, donde no está la clave que este navegador necesita para '
      + 'terminar. Ver docs/login-en-local.md.',
  },
  flow_state_not_found: {
    mensaje:
      'El acceso ha tardado demasiado y ha caducado. Vuelve a intentarlo.',
    pistaParaLocal:
      'También sale cuando el acceso se empieza en un navegador y se termina en '
      + 'otro, o en una ventana de incógnito distinta.',
  },
  bad_oauth_state: {
    mensaje: 'El acceso no se ha podido comprobar. Vuelve a intentarlo desde el principio.',
  },
  bad_code_verifier: {
    mensaje:
      'Este navegador no ha podido terminar el acceso. Vuelve a intentarlo sin '
      + 'cambiar de ventana a mitad.',
    pistaParaLocal:
      'La clave de un solo uso vive en el navegador que EMPIEZA el acceso. Si la '
      + 'vuelta cae en otro dominio, esa clave no está allí. Ver docs/login-en-local.md.',
  },
  provider_email_needs_verification: {
    mensaje: 'Tienes que confirmar tu correo con Google antes de poder entrar.',
  },
  access_denied: {
    mensaje: 'Has cancelado el acceso con Google. Puedes volver a intentarlo o entrar con tu correo.',
  },
  otp_expired: {
    mensaje: 'El enlace del correo ha caducado. Pide uno nuevo.',
  },
  auth_error: {
    mensaje: 'No se ha podido completar el acceso. Vuelve a intentarlo.',
  },
};

/** ¿Es esta una dirección con un error de acceso dentro? */
export function traeErrorDeAcceso(parametros: URLSearchParams): boolean {
  return parametros.has('error') || parametros.has('error_code');
}

/**
 * El aviso que toca, o `null` si no hay error.
 *
 * Un código desconocido no se traga en silencio: se enseña un aviso
 * genérico y se conserva la descripción original, porque es la única
 * pista que tendrá quien vaya a mirarlo.
 */
export function errorDeAcceso(parametros: URLSearchParams): ErrorDeAcceso | null {
  if (!traeErrorDeAcceso(parametros)) return null;

  const codigo = parametros.get('error_code') ?? parametros.get('error') ?? '';
  const conocido = MENSAJES[codigo];
  if (conocido) return conocido;

  const descripcion = (parametros.get('error_description') ?? '').replace(/\+/g, ' ').trim();
  return {
    mensaje: descripcion
      ? `No se ha podido entrar: ${descripcion}`
      : 'No se ha podido entrar. Vuelve a intentarlo.',
  };
}

/** Los parámetros de error, para llevarlos de una dirección a otra. */
export function parametrosDeError(origen: URLSearchParams): URLSearchParams {
  const destino = new URLSearchParams();
  for (const clave of ['error', 'error_code', 'error_description']) {
    const valor = origen.get(clave);
    if (valor) destino.set(clave, valor);
  }
  return destino;
}
