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

import { useState } from 'react';
import { BellRing, CalendarRange, Loader2, Send } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { pedirCorreo, usePreferenciasCorreo, type ClavePreferencia as Clave } from '@/hooks/usePreferenciasCorreo';

export default function NotificacionesCorreo() {
  const { success, error: avisarError } = useToast();
  const { usuario, prefs, cargado, guardando, cambiar: guardar } = usePreferenciasCorreo();
  const [probando, setProbando] = useState<'avisos' | 'resumen' | null>(null);

  const cambiar = async (clave: Clave, valor: boolean) => {
    if (!(await guardar(clave, valor))) {
      avisarError('No se ha podido guardar', 'Vuelve a intentarlo en un momento.');
      return;
    }
    success(valor ? 'Activado' : 'Desactivado', valor ? `Llegarán a ${usuario?.correo}.` : undefined);
  };

  const probar = async (tipo: 'avisos' | 'resumen') => {
    setProbando(tipo);
    try {
      const d = await pedirCorreo({ tipo });
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
