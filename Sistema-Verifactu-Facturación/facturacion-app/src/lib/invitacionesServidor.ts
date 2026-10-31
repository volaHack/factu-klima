import 'server-only';
import { createHash, randomBytes } from 'node:crypto';

/** El código del enlace: 32 bytes al azar, en base64url. */
export function codigoNuevo(): string {
  return randomBytes(32).toString('base64url');
}

/** Lo único que se guarda: la huella SHA-256 del código. */
export function huellaDe(codigo: string): string {
  return createHash('sha256').update(codigo).digest('hex');
}
