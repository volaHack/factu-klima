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
 * A la derecha, una miniatura del correo con las barras de verdad de la
 * empresa, para que se vea qué va a llegar antes de pedirlo.
 */

import { useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { CalendarClock, Check, Loader2, Mail, Send } from 'lucide-react';
import type { Invoice } from '@/lib/types';
import { facturadoYCobrado } from '@/lib/analitica';
import { formatCurrency } from '@/lib/utils';
import { useToast } from '@/hooks/useToast';
import { pedirCorreo, usePreferenciasCorreo } from '@/hooks/usePreferenciasCorreo';

type Periodo = 'actual' | 'anterior';

export default function ResumenPorCorreo({ invoices }: { readonly invoices: Invoice[] }) {
  const { success, error: avisarError } = useToast();
  const { usuario, prefs, cargado, guardando, cambiar } = usePreferenciasCorreo();
  const [enviando, setEnviando] = useState<Periodo | null>(null);
  const [enviado, setEnviado] = useState<Periodo | null>(null);

  const hoy = useMemo(() => new Date(), []);
  const meses = useMemo(() => facturadoYCobrado(invoices, hoy, 6), [invoices, hoy]);
  const max = Math.max(1, ...meses.flatMap(m => [m.series1, m.series2]));
  const este = meses[meses.length - 1];
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
        <p className="resumen-correo-ceja"><Mail size={14} aria-hidden="true" /> Analíticas en tu correo</p>
        <h2 id="resumen-correo-titulo" className="resumen-correo-titulo">Tu resumen, en la bandeja de entrada</h2>
        <p className="resumen-correo-texto">
          Facturado y su comparación, cobrado, gastos, resultado, mejores clientes, vencidas y la gráfica de los últimos seis meses.
          {usuario?.correo ? <> Llega a <strong>{usuario.correo}</strong>.</> : null}
        </p>
        <div className="resumen-correo-botones">
          {boton('actual', `Mándame ${nombreMes(hoy)} hasta hoy`, 'btn-primary')}
          {boton('anterior', `El de ${mesPasado}`, 'btn-secondary')}
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
      </div>

      {/* La miniatura del correo, con las barras de verdad. */}
      <div className="resumen-correo-vista" aria-hidden="true">
        <div className="resumen-correo-sobre">
          <div className="resumen-correo-sobre-cabeza">
            <Image src="/klima-mark.svg" alt="" width={22} height={22} unoptimized />
            <span>Klima<b>Facturas</b></span>
          </div>
          <div className="resumen-correo-sobre-titulo">
            <small>Tu mes hasta hoy</small>
            <strong>{formatCurrency(este?.series1 ?? 0)}</strong>
          </div>
          <div className="resumen-correo-barras">
            {meses.map((m, i) => (
              <div key={m.name} className={`resumen-correo-mes${i === meses.length - 1 ? ' es-actual' : ''}`}>
                <div className="resumen-correo-par">
                  <span style={{ height: `${Math.max(4, (m.series1 / max) * 100)}%` }} />
                  <span style={{ height: `${Math.max(4, (m.series2 / max) * 100)}%` }} />
                </div>
                <em>{m.name}</em>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
