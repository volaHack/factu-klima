import 'server-only';
import crypto from 'node:crypto';
import { avisar, origenDe } from './eventos';

/** Compara dos secretos sin dar pistas por el tiempo que tarda. */
export function secretosIguales(recibido: string | null | undefined, esperado: string | null | undefined): boolean {
  if (!recibido || !esperado) return false;
  const a = crypto.createHash('sha256').update(recibido).digest();
  const b = crypto.createHash('sha256').update(esperado).digest();
  return crypto.timingSafeEqual(a, b);
}

/**
 * ¿La llamada viene de Vercel Cron (`Authorization: Bearer $CRON_SECRET`)?
 * Si no, se apunta: nadie más tiene por qué llamar a una tarea programada.
 */
export function cronAutorizado(request: Request): boolean {
  const secreto = process.env.CRON_SECRET;
  const ok = !!secreto && secretosIguales(request.headers.get('authorization'), `Bearer ${secreto}`);
  if (!ok && secreto) avisar({ tipo: 'cron_no_autorizado', gravedad: 'alta', ...origenDe(request) });
  return ok;
}
