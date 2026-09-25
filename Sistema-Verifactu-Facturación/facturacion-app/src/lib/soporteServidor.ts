import 'server-only';

import { supabaseServicio } from '@/lib/supabase/servicio';
import { correoDisponible, enviarCorreo } from '@/lib/recordatorios/correo';

/**
 * Aviso por correo de un mensaje de soporte, si hay correo configurado
 * (Resend, ver lib/recordatorios/correo.ts). Sin correo no pasa nada: el
 * mensaje ya está en la bandeja. Nunca lanza.
 */
export async function avisarPorCorreo(o: { a: 'admin' | string; asunto: string; texto: string }): Promise<void> {
  try {
    if (!correoDisponible()) return;
    const { data: cfg } = await supabaseServicio().from('plataforma_config')
      .select('soporte_email, productor_email, sistema_nombre').single();
    const para = o.a === 'admin' ? (cfg?.soporte_email || cfg?.productor_email) : o.a;
    if (!para) return;
    await enviarCorreo({
      para,
      asunto: o.asunto,
      texto: o.texto,
      empresa: `Soporte ${cfg?.sistema_nombre || 'FactuKlima'}`,
      responderA: o.a === 'admin' ? undefined : (cfg?.soporte_email || cfg?.productor_email || undefined),
    });
  } catch (e) {
    console.error('[soporte] no se ha podido avisar por correo:', e instanceof Error ? e.message : e);
  }
}
