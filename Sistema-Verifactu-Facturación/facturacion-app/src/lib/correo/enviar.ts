import 'server-only';

/**
 * MANDAR UN CORREO (RESEND) — SOLO SERVIDOR
 *
 * Todos los correos de la plataforma (los de la cuenta, los avisos y el
 * resumen del mes) salen de aquí, desde administrador@klimafacturas.com.
 *
 *   RESEND_API_KEY      la clave de la API de Resend
 *   CORREO_REMITENTE    opcional: «Nombre <correo@dominio>»; por defecto
 *                       «KlimaFacturas <administrador@klimafacturas.com>»
 *   RESEND_API_URL      sólo para las pruebas (un Resend simulado)
 *
 * El dominio klimafacturas.com tiene que estar verificado en Resend (sus
 * registros DNS en IONOS); si no, Resend rechaza el envío.
 */

export const REMITENTE_POR_DEFECTO = 'KlimaFacturas <administrador@klimafacturas.com>';

export function correoConfigurado(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export function remitente(): string {
  return (process.env.CORREO_REMITENTE || REMITENTE_POR_DEFECTO).trim();
}

export interface Correo {
  para: string;
  asunto: string;
  html: string;
  texto: string;
  /** Cabecera List-Unsubscribe: un clic para darse de baja (Gmail y Outlook la enseñan). */
  bajaUrl?: string;
  /** Etiquetas de Resend, para ver en su panel qué tipo de correo es. */
  etiqueta?: string;
}

export class FalloCorreo extends Error {
  constructor(public estado: number, public detalle: string) {
    super(`Resend ${estado}: ${detalle.slice(0, 300)}`);
  }
}

export async function enviarCorreo(c: Correo): Promise<{ id: string }> {
  const clave = process.env.RESEND_API_KEY;
  if (!clave) throw new FalloCorreo(0, 'Falta RESEND_API_KEY');
  const base = (process.env.RESEND_API_URL || 'https://api.resend.com').replace(/\/+$/, '');
  const r = await fetch(`${base}/emails`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: remitente(),
      to: [c.para],
      subject: c.asunto,
      html: c.html,
      text: c.texto,
      reply_to: 'administrador@klimafacturas.com',
      ...(c.bajaUrl ? {
        headers: {
          'List-Unsubscribe': `<${c.bajaUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      } : {}),
      ...(c.etiqueta ? { tags: [{ name: 'tipo', value: c.etiqueta }] } : {}),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const texto = await r.text();
  if (!r.ok) throw new FalloCorreo(r.status, texto);
  try {
    return { id: String((JSON.parse(texto) as { id?: string }).id ?? '') };
  } catch {
    return { id: '' };
  }
}
