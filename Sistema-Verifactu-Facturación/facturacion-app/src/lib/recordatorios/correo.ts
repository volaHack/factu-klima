import 'server-only';

/**
 * El envío de correo de los recordatorios, por Resend (https://resend.com).
 *
 * Basta con RESEND_API_KEY en el .env del servidor (el mismo de los correos
 * de la cuenta). El remitente sale de, por orden:
 *   RECORDATORIOS_REMITENTE   «Nombre <cobros@tu-dominio.es>» (opcional)
 *   CORREO_REMITENTE          el de los correos de la cuenta (opcional)
 *   KlimaFacturas <administrador@klimafacturas.com>
 * siempre de un dominio verificado en Resend.
 *
 * El correo sale del dominio de la plataforma, con el nombre de la empresa
 * delante y la respuesta dirigida al correo de la empresa: si el cliente
 * contesta, le llega a ella.
 */

const REMITENTE_POR_DEFECTO = 'KlimaFacturas <administrador@klimafacturas.com>';

export function correoDisponible(): boolean {
  return !!process.env.RESEND_API_KEY;
}

function remitenteBase(): string {
  return (process.env.RECORDATORIOS_REMITENTE || process.env.CORREO_REMITENTE || REMITENTE_POR_DEFECTO).trim();
}

/** «Klima <cobros@x.es>» + «Panadería Pepe» → «Panadería Pepe vía Klima <cobros@x.es>». */
function remitente(empresa: string): string {
  const base = remitenteBase();
  const m = /^(.*)<([^>]+)>\s*$/.exec(base);
  const dir = m ? m[2].trim() : base.trim();
  const plataforma = m ? m[1].trim().replace(/"/g, '') : '';
  const nombre = (plataforma ? `${empresa} vía ${plataforma}` : empresa).replace(/["<>\r\n]/g, '').slice(0, 80);
  return `"${nombre}" <${dir}>`;
}

export async function enviarCorreo(o: { para: string; asunto: string; texto: string; empresa: string; responderA?: string }): Promise<void> {
  if (!correoDisponible()) throw new Error('El envío de correo no está configurado.');
  const api = (process.env.RESEND_API_URL || 'https://api.resend.com').replace(/\/+$/, '');
  const r = await fetch(`${api}/emails`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: remitente(o.empresa),
      to: [o.para],
      subject: o.asunto.slice(0, 200),
      text: o.texto,
      ...(o.responderA ? { reply_to: o.responderA } : {}),
    }),
  });
  if (!r.ok) {
    let motivo = `HTTP ${r.status}`;
    try { const j = await r.json(); motivo = j?.message || j?.error || motivo; } catch { /* sin cuerpo */ }
    throw new Error(`El servidor de correo no lo ha aceptado: ${motivo}`);
  }
}
