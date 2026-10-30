'use client';

/**
 * «Marcar como cobradas» sobre varias facturas de la lista: el día, cómo
 * se cobró y, antes de confirmar, el resumen de lo que se va a apuntar.
 *
 * Se guarda por la misma vía que «Registrar cobro» de tesorería: un cobro
 * por cliente con `saveCobroPago`, que marca cada factura por la vía del
 * cobro y, sin conexión, deja todo en la cola de sincronización. Los cobros
 * se numeran con la serie de cobros y el contador avanza al terminar.
 */

import { useEffect, useId, useMemo, useState } from 'react';
import { CheckCircle, X } from 'lucide-react';
import Portal from '@/components/ui/Portal';
import { getCompanySettings, saveCobroPago, saveCompanySettings } from '@/lib/storage';
import { PaymentMethod, type Invoice } from '@/lib/types';
import { PAYMENT_METHODS } from '@/lib/constants';
import { planCobroLote, registrosDeLote } from '@/lib/cobroLote';
import { hoyLocal } from '@/lib/perfilPago';
import { formatCurrency, generateId } from '@/lib/utils';

export interface ResultadoLote { cobradas: number; fallidas: string[] }

export default function CobroEnLote({ facturas, ids, onCerrar, onHecho }: {
  facturas: readonly Invoice[];
  ids: ReadonlySet<string>;
  onCerrar: () => void;
  onHecho: (r: ResultadoLote) => void;
}) {
  const titulo = useId();
  const plan = useMemo(() => planCobroLote(facturas, ids), [facturas, ids]);
  const [fecha, setFecha] = useState(hoyLocal());
  // La forma de pago de partida: la de las facturas, si todas coinciden.
  const [forma, setForma] = useState<PaymentMethod>(() => {
    const formas = new Set(facturas.filter(f => ids.has(f.id)).map(f => f.paymentMethod).filter(Boolean));
    return formas.size === 1 ? [...formas][0] : PaymentMethod.TRANSFERENCIA;
  });
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => { if (e.key === 'Escape' && !guardando) onCerrar(); };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [onCerrar, guardando]);

  const confirmar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plan.grupos.length || !fecha) return;
    setGuardando(true);
    const fallidas: string[] = [];
    let cobradas = 0;
    let guardados = 0;
    try {
      const ajustes = await getCompanySettings();
      const serie = ajustes.cobroSeries || 'COB';
      const siguiente = ajustes.nextCobroNumber || 1;
      // Cliente a cliente, y el número se da al guardar: si uno falla, no deja un hueco en la serie.
      for (const g of plan.grupos) {
        const [registro] = registrosDeLote({ ...plan, grupos: [g] }, {
          fecha, forma, serie, siguiente: siguiente + guardados, ahora: new Date().toISOString(), nuevoId: generateId,
          notas: plan.grupos.length > 1 ? 'Cobro en lote desde la lista de facturas' : undefined,
        });
        try {
          await saveCobroPago(registro);
          guardados += 1;
          cobradas += g.desglose.length;
        } catch {
          fallidas.push(...g.desglose.map(d => d.invoiceNumber));
        }
      }
      if (guardados) await saveCompanySettings({ ...ajustes, nextCobroNumber: siguiente + guardados });
    } catch {
      // Sin ajustes no hay número de cobro: no se ha guardado nada de lo que falte.
      for (const g of plan.grupos.slice(guardados)) fallidas.push(...g.desglose.map(d => d.invoiceNumber));
    } finally {
      setGuardando(false);
    }
    onHecho({ cobradas, fallidas });
  };

  return (
    <Portal>
      <div className="modal-overlay" onClick={() => { if (!guardando) onCerrar(); }}>
        <div className="modal cobro-lote" role="dialog" aria-modal="true" aria-labelledby={titulo} onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h3 className="modal-title" id={titulo}>Marcar como cobradas</h3>
            <button type="button" className="modal-close" onClick={onCerrar} disabled={guardando} aria-label="Cerrar"><X size={18} /></button>
          </div>
          <form onSubmit={confirmar}>
            <div className="modal-body">
              <p className="cobro-lote-resumen" aria-live="polite">
                <strong>{plan.facturas} {plan.facturas === 1 ? 'factura' : 'facturas'}</strong> · <strong>{formatCurrency(plan.total)}</strong>
                {plan.grupos.length > 1 && <span> · {plan.grupos.length} clientes</span>}
              </p>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label required" htmlFor={`${titulo}-fecha`}>Fecha del cobro</label>
                  <input id={`${titulo}-fecha`} type="date" className="form-input" required max={hoyLocal()} value={fecha} onChange={e => setFecha(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor={`${titulo}-forma`}>Forma de pago</label>
                  <select id={`${titulo}-forma`} className="form-select" value={forma} onChange={e => setForma(e.target.value as PaymentMethod)}>
                    {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
              </div>

              {plan.grupos.length > 0 && (
                <ul className="cobro-lote-grupos">
                  {plan.grupos.map(g => (
                    <li key={g.clienteId || g.cliente}>
                      <span className="cobro-lote-cliente">{g.cliente}</span>
                      <span className="cobro-lote-facturas">{g.desglose.map(d => d.invoiceNumber).join(', ')}</span>
                      <span className="cobro-lote-importe">{formatCurrency(g.importe)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {plan.descartadas.length > 0 && (
                <p className="form-hint cobro-lote-fuera">
                  Se quedan fuera {plan.descartadas.length === 1 ? 'una' : plan.descartadas.length}:{' '}
                  {plan.descartadas.map(d => `${d.numero} (${d.motivo})`).join(', ')}.
                </p>
              )}
              <p className="form-hint">
                Se apunta un cobro por cliente en Tesorería con lo que falta de cada factura. Si te equivocas, se deshace borrando el cobro.
              </p>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-ghost" onClick={onCerrar} disabled={guardando}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={guardando || !plan.grupos.length || !fecha}>
                <CheckCircle size={16} aria-hidden /> {guardando ? 'Apuntando…' : `Cobrar ${formatCurrency(plan.total)}`}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Portal>
  );
}
