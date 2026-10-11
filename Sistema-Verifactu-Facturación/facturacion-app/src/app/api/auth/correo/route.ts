/**
 * POST /api/auth/correo — el gancho «Send Email» de Supabase Auth.
 *
 * En vez de mandar Supabase sus correos genéricos, nos avisa a nosotros
 * (registro, contraseña olvidada, enlace para entrar, cambio de correo…)
 * y aquí se manda el correo con nuestra plantilla, en español y desde
 * administrador@klimafacturas.com.
 *
 * Configuración (una vez), en el panel de Supabase:
 *   Authentication → Hooks → «Send Email» → HTTPS
 *   URL: https://klimafacturas.com/api/auth/correo
 *   El secreto que genera («v1,whsec_…») va al .env como SEND_EMAIL_HOOK_SECRET.
 *
 * Si algo falla se contesta con error y Supabase se lo dice a quien estaba
 * registrándose («no se ha podido mandar el correo»), en vez de dejarle
 * esperando un correo que no va a llegar.
 */

import { NextResponse } from 'next/server';
import { verificarFirmaWebhook } from '@/lib/correo/webhook';
import { correoDeAuth, enlaceDeConfirmacion, type TipoCorreoAuth } from '@/lib/correo/auth';
import { correoConfigurado, enviarCorreo } from '@/lib/correo/enviar';
import { urlDelSitio } from '@/lib/sitio';

export const dynamic = 'force-dynamic';

interface Gancho {
  user?: {
    email?: string;
    new_email?: string;
    user_metadata?: { full_name?: string; name?: string; nombre?: string };
  };
  email_data?: {
    token?: string;
    token_hash?: string;
    token_new?: string;
    token_hash_new?: string;
    email_action_type?: string;
    redirect_to?: string;
  };
}

const error = (http_code: number, message: string) =>
  NextResponse.json({ error: { http_code, message } }, { status: http_code });

/** Adónde se va después de confirmar cada cosa. */
const DESPUES: Record<string, string> = {
  signup: '/dashboard',
  recovery: '/auth/nueva-contrasena',
  magiclink: '/dashboard',
  invite: '/auth/nueva-contrasena',
  email: '/dashboard',
  email_change: '/ajustes',
};

export async function POST(request: Request) {
  const cuerpo = await request.text();
  const valida = verificarFirmaWebhook({
    secreto: process.env.SEND_EMAIL_HOOK_SECRET,
    id: request.headers.get('webhook-id'),
    timestamp: request.headers.get('webhook-timestamp'),
    firma: request.headers.get('webhook-signature'),
    cuerpo,
  });
  if (!valida) return error(401, 'Firma no válida');
  if (!correoConfigurado()) return error(500, 'El envío de correos no está configurado (RESEND_API_KEY).');

  let g: Gancho;
  try { g = JSON.parse(cuerpo) as Gancho; } catch { return error(400, 'JSON inválido'); }
  const correo = g.user?.email;
  const d = g.email_data ?? {};
  const accion = d.email_action_type ?? '';
  if (!correo || !accion) return error(400, 'Faltan datos');

  const meta = g.user?.user_metadata ?? {};
  const nombre = meta.full_name || meta.name || meta.nombre || null;
  const base = urlDelSitio();
  const enlace = (hash?: string) => (hash ? enlaceDeConfirmacion(base, hash, accion, DESPUES[accion]) : undefined);

  // Cada correo que hay que mandar: a quién, de qué tipo, con qué enlace.
  const envios: { para: string; tipo: TipoCorreoAuth; enlace?: string; codigo?: string }[] = [];
  if (accion === 'email_change') {
    // Con el cambio seguro llegan dos: `token_hash_new` va a la dirección
    // ACTUAL y `token_hash` a la NUEVA (los nombres de Supabase confunden).
    const nuevo = g.user?.new_email;
    if (d.token_hash_new) envios.push({ para: correo, tipo: 'email_change_actual', enlace: enlace(d.token_hash_new), codigo: d.token_new });
    if (nuevo && d.token_hash) envios.push({ para: nuevo, tipo: 'email_change_nuevo', enlace: enlace(d.token_hash), codigo: d.token });
  } else if (accion === 'reauthentication') {
    envios.push({ para: correo, tipo: 'reauthentication', codigo: d.token });
  } else if (['signup', 'recovery', 'magiclink', 'invite', 'email'].includes(accion)) {
    envios.push({ para: correo, tipo: accion as TipoCorreoAuth, enlace: enlace(d.token_hash), codigo: d.token });
  } else {
    return error(400, `Tipo de correo desconocido: ${accion}`);
  }

  try {
    for (const e of envios) {
      const c = correoDeAuth({ tipo: e.tipo, enlace: e.enlace, codigo: e.codigo, nombre, correo, correoNuevo: g.user?.new_email });
      await enviarCorreo({ para: e.para, asunto: c.asunto, html: c.html, texto: c.texto, etiqueta: `auth-${accion}` });
    }
  } catch (err) {
    console.error('[auth/correo] no se ha podido mandar:', err instanceof Error ? err.message : err);
    return error(500, 'No se ha podido mandar el correo. Inténtalo en unos minutos.');
  }
  return NextResponse.json({});
}
