'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Crown, ExternalLink, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { getPlan } from '@/lib/plans';
import { estadoEfectivo, type FilaSuscripcion } from '@/lib/suscripcion';
import { formatDate } from '@/lib/utils';

/**
 * Sólo lectura. Aquí había tarjetas de plan y un interruptor que escribían
 * el plan en company_settings: cualquiera se ponía «Sin límite» gratis.
 */
export default function EstadoSuscripcion() {
  const [fila, setFila] = useState<FilaSuscripcion | null | undefined>(undefined);
  const [abriendo, setAbriendo] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    createClient()
      .from('suscripciones')
      .select('origen, plan_id, estado, cortesia_hasta, periodo_fin, cancela_al_final')
      .maybeSingle()
      .then((res: { data: any }) => setFila((res.data as FilaSuscripcion | null) ?? null));
  }, []);

  const abrirPortal = async () => {
    setAbriendo(true);
    setError('');
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || 'No se pudo abrir el portal.');
      window.location.assign(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir el portal.');
      setAbriendo(false);
    }
  };

  if (fila === undefined) return <p className="settings-section-subtitle">Cargando la suscripción…</p>;

  const estado = estadoEfectivo(fila);
  const plan = estado.planId ? getPlan(estado.planId) : null;

  return (
    <div className="status-panel" style={{ marginTop: 'var(--space-4)', alignItems: 'center' }}>
      <span className="status-panel-icon"><Crown size={19} /></span>
      <div className="status-panel-body">
        <div className="status-panel-title">
          {estado.activa && plan ? `Plan ${plan.name}` : 'Sin suscripción activa'}
        </div>
        <p className="status-panel-text">
          {!estado.activa && (estado.motivoInactiva ?? 'Elige un plan para emitir facturas.')}
          {estado.activa && fila?.origen === 'cortesia' && `Plan de cortesía hasta el ${formatDate(fila.cortesia_hasta!)}.`}
          {estado.activa && fila?.origen === 'stripe' && fila.periodo_fin &&
            (fila.cancela_al_final
              ? `Se cancela el ${formatDate(fila.periodo_fin)}.`
              : `Próxima renovación el ${formatDate(fila.periodo_fin)}.`)}
        </p>
        {error && <p className="field-message is-error" role="alert">{error}</p>}
      </div>
      {fila?.origen === 'stripe' ? (
        <button type="button" className="btn btn-secondary" onClick={abrirPortal} disabled={abriendo}>
          {abriendo ? <Loader2 size={16} className="spin" /> : <ExternalLink size={16} />} Gestionar suscripción
        </button>
      ) : (
        <Link href="/precios" className="btn btn-primary">Ver planes</Link>
      )}
    </div>
  );
}
