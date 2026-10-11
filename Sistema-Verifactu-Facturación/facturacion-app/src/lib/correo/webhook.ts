/**
 * ¿LA PETICIÓN LA HA FIRMADO QUIEN DICE?
 *
 * Supabase firma sus ganchos (el de mandar correos, entre otros) con el
 * estándar «Standard Webhooks»: HMAC-SHA256 de `id.timestamp.cuerpo` con el
 * secreto del gancho, en base64, en la cabecera `webhook-signature`
 * («v1,<firma>», varias separadas por espacios si se está rotando el
 * secreto). El secreto se guarda como «v1,whsec_<base64>».
 *
 * Sin esto cualquiera podría pedirle a la app que mandase, en nombre de
 * KlimaFacturas, un «restablece tu contraseña» con el enlace que quisiera.
 */

import crypto from 'node:crypto';

/** Cuánto puede tardar (o adelantarse) una petición: lo del estándar. */
const TOLERANCIA_S = 5 * 60;

export interface FirmaWebhook {
  secreto: string | undefined | null;
  id: string | null;
  timestamp: string | null;
  firma: string | null;
  /** El cuerpo tal cual llegó, sin volver a serializar. */
  cuerpo: string;
  /** Segundos desde 1970; para las pruebas. */
  ahora?: number;
}

export function verificarFirmaWebhook(f: FirmaWebhook): boolean {
  if (!f.secreto || !f.id || !f.timestamp || !f.firma) return false;
  const ts = Number(f.timestamp);
  const ahora = f.ahora ?? Math.floor(Date.now() / 1000);
  if (!Number.isFinite(ts) || Math.abs(ahora - ts) > TOLERANCIA_S) return false;

  const clave = Buffer.from(f.secreto.trim().replace(/^v1,/, '').replace(/^whsec_/, ''), 'base64');
  if (!clave.length) return false;
  const esperada = crypto.createHmac('sha256', clave).update(`${f.id}.${f.timestamp}.${f.cuerpo}`).digest();

  return f.firma.split(' ').some(parte => {
    const [version, valor] = parte.split(',');
    if (version !== 'v1' || !valor) return false;
    const recibida = Buffer.from(valor, 'base64');
    return recibida.length === esperada.length && crypto.timingSafeEqual(recibida, esperada);
  });
}
