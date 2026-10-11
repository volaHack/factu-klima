'use client';

/**
 * Los dos interruptores de los correos (avisos y resumen del mes) de la
 * empresa, leídos y guardados en `notificaciones_correo`. Lo usan Ajustes
 * y la tarjeta del panel, para que encender en un sitio se vea en el otro.
 */

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export type ClavePreferencia = 'avisos' | 'resumen_mensual';
export type Preferencias = Record<ClavePreferencia, boolean>;

export function usePreferenciasCorreo() {
  const [usuario, setUsuario] = useState<{ id: string; correo: string } | null>(null);
  const [prefs, setPrefs] = useState<Preferencias>({ avisos: false, resumen_mensual: false });
  const [cargado, setCargado] = useState(false);
  const [guardando, setGuardando] = useState<ClavePreferencia | null>(null);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const db = createClient();
      const { data: { user } } = await db.auth.getUser();
      if (!user || !vivo) return;
      setUsuario({ id: user.id, correo: user.email ?? '' });
      const { data } = await db.from('notificaciones_correo').select('avisos, resumen_mensual').eq('user_id', user.id).maybeSingle();
      if (!vivo) return;
      if (data) setPrefs({ avisos: !!data.avisos, resumen_mensual: !!data.resumen_mensual });
      setCargado(true);
    })();
    return () => { vivo = false; };
  }, []);

  /** Devuelve true si se ha guardado; si no, deja el interruptor como estaba. */
  const cambiar = useCallback(async (clave: ClavePreferencia, valor: boolean): Promise<boolean> => {
    if (!usuario) return false;
    const antes = prefs;
    const nuevas = { ...prefs, [clave]: valor };
    setPrefs(nuevas);
    setGuardando(clave);
    const db = createClient();
    const cambios = { avisos: nuevas.avisos, resumen_mensual: nuevas.resumen_mensual, actualizado_en: new Date().toISOString() };
    // Primero se intenta cambiar la fila; si aún no existe, se crea.
    const cambiada = await db.from('notificaciones_correo').update(cambios).eq('user_id', usuario.id).select('user_id');
    let error = cambiada.error;
    if (!error && !cambiada.data?.length) {
      ({ error } = await db.from('notificaciones_correo').insert({ user_id: usuario.id, ...cambios }).select('user_id'));
    }
    setGuardando(null);
    if (error) {
      setPrefs(antes);
      return false;
    }
    return true;
  }, [usuario, prefs]);

  return { usuario, prefs, cargado, guardando, cambiar };
}

/** Pide al servidor que mande un correo ahora (resumen o avisos). */
export async function pedirCorreo(cuerpo: { tipo: 'avisos' | 'resumen'; periodo?: 'actual' | 'anterior' }) {
  const r = await fetch('/api/correos/prueba', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'No se ha podido mandar.');
  return d as { ok: true; para?: string; nada?: boolean; mensaje?: string };
}
