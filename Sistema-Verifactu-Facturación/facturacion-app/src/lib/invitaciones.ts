/**
 * INVITAR A ALGUIEN CON UN ENLACE
 *
 * Un enlace de un solo uso que abre la cuenta en otro dispositivo sin
 * contraseña (ver migración 079). Aquí sólo lo que no depende de nada:
 * cómo es un código válido y en qué estado está una invitación. La huella
 * y el código aleatorio se hacen en el servidor (`invitacionesServidor`).
 */

export const DIAS_INVITACION = 7;

/** 32 bytes en base64url: 43 caracteres de [A-Za-z0-9_-]. */
const FORMA_CODIGO = /^[A-Za-z0-9_-]{43}$/;

export function codigoValido(codigo: unknown): codigo is string {
  return typeof codigo === 'string' && FORMA_CODIGO.test(codigo);
}

export type EstadoInvitacion = 'activa' | 'usada' | 'caducada' | 'anulada';

export interface FilaInvitacion {
  caduca_en: string;
  usado_en: string | null;
  revocado_en: string | null;
}

/** Anulada pesa más que usada, y usada más que caducada. */
export function estadoInvitacion(fila: FilaInvitacion, ahora: Date = new Date()): EstadoInvitacion {
  if (fila.revocado_en) return 'anulada';
  if (fila.usado_en) return 'usada';
  if (new Date(fila.caduca_en).getTime() <= ahora.getTime()) return 'caducada';
  return 'activa';
}

/** «hasta el jueves 7 de noviembre», en hora de España. */
export function caducaEnTexto(caduca: string): string {
  return new Date(caduca).toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Atlantic/Canary',
  });
}
