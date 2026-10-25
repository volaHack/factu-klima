'use client';

/**
 * PANEL → TU RESUMEN POR CORREO
 *
 * Lo mismo que el panel cuenta, en la bandeja de entrada: lo facturado, lo
 * cobrado, los gastos, los mejores clientes y la gráfica de seis meses.
 * Se puede pedir ahora (el mes en curso hasta hoy o el mes pasado) o
 * dejarlo encendido para que llegue solo el día 1. El interruptor es el
 * mismo que el de Ajustes → Notificaciones por correo.
 *
 * Es una hoja de acción, no un anuncio: qué llega, los dos botones y el
 * interruptor. La miniatura del correo que había a la derecha repetía las
 * cifras que el panel ya enseña justo encima.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, Check, Loader2, Mail, Send } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { pedirCorreo, usePreferenciasCorreo } from '@/hooks/usePreferenciasCorreo';

type Periodo = 'actual' | 'anterior';

export default function ResumenPorCorreo() {
  const { success, error: avisarError } = useToast();
  const { usuario, prefs, cargado, guardando, cambiar } = usePreferenciasCorreo();
  const [enviando, setEnviando] = useState<Periodo | null>(null);
  const [enviado, setEnviado] = useState<Periodo | null>(null);

  const hoy = useMemo(() => new Date(), []);
  const nombreMes = (d: Date) => d.toLocaleDateString('es-ES', { month: 'long' });
  const mesPasado = nombreMes(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1));

  const pedir = async (periodo: Periodo) => {
    setEnviando(periodo);
    try {
      const d = await pedirCorreo({ tipo: 'resumen', periodo });
      setEnviado(periodo);
      success('Resumen enviado', `Llegará a ${d.para} en un minuto.`);
    } catch (e) {
      avisarError('No se ha podido mandar', e instanceof Error ? e.message : '');
    } finally {
      setEnviando(null);
    }
  };

  const alternar = async (valor: boolean) => {
    if (await cambiar('resumen_mensual', valor)) {
      success(valor ? 'Resumen mensual activado' : 'Resumen mensual desactivado', valor ? `Cada día 1 en ${usuario?.correo}.` : undefined);
    } else {
      avisarError('No se ha podido guardar', 'Vuelve a intentarlo en un momento.');
    }
  };

  const boton = (periodo: Periodo, texto: string, clase: string) => (
    <button type="button" className={`btn ${clase}`} onClick={() => void pedir(periodo)} disabled={enviando !== null || !cargado}>
      {enviando === periodo ? <Loader2 size={15} className="spin" /> : enviado === periodo ? <Check size={15} /> : <Send size={15} />}
      {texto}
    </button>
  );

  return (
    <section className="resumen-correo animate-fade-in" aria-labelledby="resumen-correo-titulo">
      <div className="resumen-correo-cuerpo">
        <h2 id="resumen-correo-titulo" className="resumen-correo-titulo">
          <Mail size={16} aria-hidden="true" /> Tu resumen por correo
        </h2>
        <p className="resumen-correo-texto">
          Facturado y su comparación, cobrado, gastos, resultado, mejores clientes, vencidas y los últimos seis meses.
          {usuario?.correo ? <> Llega a <strong>{usuario.correo}</strong>.</> : null}
        </p>
      </div>
      <div className="resumen-correo-botones">
        {boton('actual', `Mándame ${nombreMes(hoy)} hasta hoy`, 'btn-secondary')}
        {boton('anterior', `El de ${mesPasado}`, 'btn-ghost')}
      </div>
      <label className="resumen-correo-mensual">
        <span className="toggle-switch">
          <input
            type="checkbox"
            checked={prefs.resumen_mensual}
            disabled={!cargado || guardando !== null}
            onChange={e => void alternar(e.target.checked)}
          />
          <span className="toggle-slider" />
        </span>
        <span>
          <CalendarClock size={14} aria-hidden="true" /> <strong>Recibirlo cada mes</strong>, el día 1 por la mañana
          <Link href="/ajustes#notificaciones" className="resumen-correo-ajustes">Más avisos</Link>
        </span>
      </label>
    </section>
  );
}
