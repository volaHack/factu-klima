/**
 * /api/correos/baja?t=… — «Dejar de recibir estos correos», sin entrar.
 *
 *   GET   una página con el botón (los programas que revisan enlaces de
 *         los correos los abren solos: si con abrirlo bastase, darían de
 *         baja a la gente sin querer)
 *   POST  da de baja de verdad. Es también lo que hacen Gmail y Outlook
 *         con su botón «Cancelar suscripción» (List-Unsubscribe-Post).
 */

import { supabaseServicio } from '@/lib/supabase/servicio';
import { escaparHtml, COLOR } from '@/lib/correo/plantilla';

export const dynamic = 'force-dynamic';

const RE_TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function pagina(titulo: string, cuerpo: string, estado = 200) {
  return new Response(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escaparHtml(titulo)} · KlimaFacturas</title></head>
<body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#f6f1f3;color:#1f1f24;">
<main style="max-width:460px;margin:12vh auto;padding:32px 28px;background:#fff;border:1px solid #eadfe3;border-radius:16px;">
<p style="margin:0 0 14px;font-weight:800;color:${COLOR};">KlimaFacturas</p>
<h1 style="margin:0 0 12px;font-size:22px;">${escaparHtml(titulo)}</h1>${cuerpo}</main></body></html>`,
  { status: estado, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
}

export async function GET(request: Request) {
  const t = new URL(request.url).searchParams.get('t') ?? '';
  if (!RE_TOKEN.test(t)) return pagina('Enlace no válido', '<p>Este enlace no es correcto. Puedes apagar los correos en Ajustes → Notificaciones por correo.</p>', 400);
  return pagina('¿Dejar de recibir estos correos?', `
<p style="line-height:1.5;">Dejarás de recibir los avisos y el resumen del mes por correo. Los correos de tu cuenta (contraseña, seguridad) seguirán llegando.</p>
<form method="post" action="/api/correos/baja?t=${encodeURIComponent(t)}">
<button type="submit" style="margin-top:8px;padding:12px 20px;border:0;border-radius:10px;background:${COLOR};color:#fff;font-size:15px;font-weight:700;cursor:pointer;">Dejar de recibirlos</button>
</form>
<p style="margin-top:18px;font-size:13px;color:#6b6b76;">Puedes volver a activarlos cuando quieras en Ajustes → Notificaciones por correo.</p>`);
}

export async function POST(request: Request) {
  const t = new URL(request.url).searchParams.get('t') ?? '';
  if (!RE_TOKEN.test(t)) return pagina('Enlace no válido', '<p>Este enlace no es correcto.</p>', 400);
  await supabaseServicio().from('notificaciones_correo')
    .update({ avisos: false, resumen_mensual: false, actualizado_en: new Date().toISOString() })
    .eq('token_baja', t);
  // Siempre lo mismo, exista o no el enlace: no da pistas a quien pruebe.
  return pagina('Hecho', '<p style="line-height:1.5;">Ya no recibirás los avisos ni el resumen del mes. Puedes volver a activarlos en Ajustes → Notificaciones por correo.</p>');
}
