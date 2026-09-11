'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { PLANS } from '@/lib/plans';

export default function AccionesCuenta({ cuentaId, origen, activa }: { cuentaId: string; origen: string | null; activa: boolean }) {
  const router = useRouter();
  const [tipo, setTipo] = useState('cortesia');
  const [planId, setPlanId] = useState('pro');
  const [intervalo, setIntervalo] = useState<'month' | 'year'>('month');
  const [hasta, setHasta] = useState('');
  const [inmediato, setInmediato] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  const ejecutar = async () => {
    if (tipo === 'cancelar' && inmediato && !confirm('La cancelación inmediata no se puede deshacer. ¿Continuar?')) return;
    if (tipo === 'reembolsar' && !confirm('El reembolso se ejecuta ahora. ¿Continuar?')) return;
    setEnviando(true);
    setError('');
    try {
      const body: Record<string, unknown> = { tipo, motivo };
      if (tipo === 'cortesia') { body.planId = planId; body.hasta = hasta; }
      if (tipo === 'cambiar_plan') { body.planId = planId; body.intervalo = intervalo; }
      if (tipo === 'cancelar') body.inmediato = inmediato;
      const res = await fetch(`/api/admin/cuentas/${cuentaId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error desconocido');
      setMotivo('');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar.');
    } finally {
      setEnviando(false);
    }
  };

  const esStripe = origen === 'stripe' && activa;

  return (
    <div className="card">
      <h3 className="card-title">Acciones</h3>
      <p className="card-subtitle" style={{ marginBottom: 'var(--space-3)' }}>Los cambios por Stripe tardan unos segundos en reflejarse (llegan por webhook).</p>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Acción</label>
          <select className="form-select" value={tipo} onChange={e => setTipo(e.target.value)}>
            <option value="cortesia">Dar cortesía</option>
            {origen === 'cortesia' && <option value="quitar_cortesia">Quitar cortesía</option>}
            {esStripe && <option value="cambiar_plan">Cambiar plan (Stripe)</option>}
            {esStripe && <option value="cancelar">Cancelar (Stripe)</option>}
            {esStripe && <option value="reembolsar">Devolver último cobro (Stripe)</option>}
          </select>
        </div>
      </div>

      {(tipo === 'cortesia' || tipo === 'cambiar_plan') && (
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Plan</label>
            <select className="form-select" value={planId} onChange={e => setPlanId(e.target.value)}>
              {PLANS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          {tipo === 'cortesia' && (
            <div className="form-group">
              <label className="form-label">Hasta (fecha)</label>
              <input className="form-input" type="date" value={hasta} onChange={e => setHasta(e.target.value)} />
            </div>
          )}
          {tipo === 'cambiar_plan' && (
            <div className="form-group">
              <label className="form-label">Periodicidad</label>
              <select className="form-select" value={intervalo} onChange={e => setIntervalo(e.target.value as 'month' | 'year')}>
                <option value="month">Mensual</option>
                <option value="year">Anual</option>
              </select>
            </div>
          )}
        </div>
      )}

      {tipo === 'cancelar' && (
        <div className="form-group">
          <label className="toggle-switch">
            <input type="checkbox" checked={inmediato} onChange={e => setInmediato(e.target.checked)} />
            <span className="toggle-slider" />
          </label>
          <span className="form-label" style={{ marginLeft: 'var(--space-2)' }}>Cancelar ya (sin esperar al fin del periodo)</span>
        </div>
      )}

      <div className="form-group">
        <label className="form-label">Motivo (obligatorio, queda en el registro)</label>
        <textarea className="form-input" rows={2} value={motivo} onChange={e => setMotivo(e.target.value)} />
      </div>

      {error && <p className="field-message is-error" role="alert">{error}</p>}
      <button className="btn btn-primary" onClick={ejecutar} disabled={enviando}>
        {enviando ? <Loader2 size={16} className="spin" /> : null} Ejecutar
      </button>
    </div>
  );
}
