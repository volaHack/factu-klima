'use client';

/**
 * AJUSTES → NOTIFICACIONES POR CORREO
 *
 * Dos interruptores, apagados al principio:
 *   · Avisos importantes: lo urgente de «Para hoy» (vencidas, plazos de
 *     Hacienda, permiso del banco…), sólo cuando hay algo nuevo.
 *   · Resumen del mes: el día 1, cómo fue el mes anterior.
 * Y un botón para mandarse un ejemplo con los datos de ahora.
 *
 * Se guarda en `notificaciones_correo`, una fila por empresa; la base de
 * datos sólo deja a cada empresa tocar sus dos interruptores.
 */

import { useEffect, useState } from 'react';
import { BellRing, CalendarRange, Loader2, Send } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/hooks/useToast';

type Clave = 'avisos' | 'resumen_mensual';

export default function NotificacionesCorreo() {
  const { success, error: avisarError } = useToast();
  const [usuario, setUsuario] = useState<{ id: string; correo: string } | null>(null);
  const [prefs, setPrefs] = useState<Record<Clave, boolean>>({ avisos: false, resumen_mensual: false });
  const [cargado, setCargado] = useState(false);
  const [guardando, setGuardando] = useState<Clave | null>(null);
  const [probando, setProbando] = useState<'avisos' | 'resumen' | null>(null);

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

  const cambiar = async (clave: Clave, valor: boolean) => {
    if (!usuario) return;
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
      avisarError('No se ha podido guardar', 'Vuelve a intentarlo en un momento.');
      return;
    }
    success(valor ? 'Activado' : 'Desactivado', valor ? `Llegarán a ${usuario.correo}.` : undefined);
  };

  const probar = async (tipo: 'avisos' | 'resumen') => {
    setProbando(tipo);
    try {
      const r = await fetch('/api/correos/prueba', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'No se ha podido mandar.');
      if (d.nada) success('Hoy no hay nada urgente', d.mensaje);
      else success('Correo de prueba enviado', `Míralo en ${d.para}.`);
    } catch (e) {
      avisarError('No se ha podido mandar', e instanceof Error ? e.message : '');
    } finally {
      setProbando(null);
    }
  };

  const fila = (clave: Clave, icono: React.ReactNode, titulo: string, texto: string, prueba: 'avisos' | 'resumen') => (
    <div className="status-panel notif-fila" style={{ marginTop: 'var(--space-3)', alignItems: 'center' }}>
      <span className="status-panel-icon">{icono}</span>
      <div className="status-panel-body">
        <div className="status-panel-title">{titulo}</div>
        <p className="status-panel-text">{texto}</p>
        <button type="button" className="btn btn-ghost btn-sm notif-probar" onClick={() => void probar(prueba)} disabled={probando !== null || !cargado}>
          {probando === prueba ? <Loader2 size={14} className="spin" /> : <Send size={14} />} Mandarme uno de prueba
        </button>
      </div>
      <label className="toggle-switch" aria-label={titulo}>
        <input
          type="checkbox"
          checked={prefs[clave]}
          disabled={!cargado || guardando !== null}
          onChange={e => void cambiar(clave, e.target.checked)}
        />
        <span className="toggle-slider" />
      </label>
    </div>
  );

  return (
    <>
      {fila('avisos', <BellRing size={19} />, 'Avisos importantes',
        'Las facturas que vencen o ya han vencido, los plazos de Hacienda, el permiso del banco… Lo urgente de «Para hoy», sólo cuando hay algo nuevo (y, si sigue pendiente, como mucho una vez por semana).',
        'avisos')}
      {fila('resumen_mensual', <CalendarRange size={19} />, 'Resumen del mes',
        'El día 1, cómo fue el mes anterior: lo facturado comparado con el mes previo, lo cobrado, los gastos, lo que queda por cobrar y tus mejores clientes.',
        'resumen')}
      <p className="settings-section-subtitle" style={{ marginTop: 'var(--space-3)' }}>
        {usuario?.correo ? <>Llegan a <strong>{usuario.correo}</strong> desde administrador@klimafacturas.com. </> : null}
        Cada correo trae un enlace para dejar de recibirlos.
      </p>
    </>
  );
}
