'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Repeat, X } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import type { Invoice } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';
import {
  PERIODOS, crearRecurrente, primeraFecha, puedeSerRecurrente, type Periodo,
} from '@/lib/recurrentes';

/** «Repetir cada…»: convierte una factura en la plantilla de las siguientes. */
export default function BotonRepetir({ factura }: { factura: Invoice }) {
  const { success, error: toastError } = useToast();
  const [abierto, setAbierto] = useState(false);
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [proxima, setProxima] = useState('');
  const [hasta, setHasta] = useState('');
  const [guardando, setGuardando] = useState(false);

  if (!puedeSerRecurrente(factura)) return null;

  const hoy = new Date().toISOString().slice(0, 10);
  const abrir = () => {
    setPeriodo('mes');
    setProxima(primeraFecha(factura.issueDate, 'mes', hoy));
    setHasta('');
    setAbierto(true);
  };
  const cambiarPeriodo = (p: Periodo) => {
    setPeriodo(p);
    setProxima(primeraFecha(factura.issueDate, p, hoy));
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    try {
      await crearRecurrente(factura, periodo, proxima, hasta || undefined);
      success('Factura recurrente creada', `La próxima se prepara el ${proxima.split('-').reverse().join('/')}.`);
      setAbierto(false);
    } catch (err) {
      toastError('No se ha podido crear', err instanceof Error ? err.message : '');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <>
      <button type="button" className="btn btn-secondary" onClick={abrir}>
        <Repeat size={16} /> Repetir
      </button>
      {abierto && (
        <div className="modal-overlay" onClick={() => setAbierto(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Repetir {factura.number}</h3>
              <button type="button" className="modal-close" onClick={() => setAbierto(false)}><X size={18} /></button>
            </div>
            <form onSubmit={guardar}>
              <div className="modal-body">
                <p className="form-hint" style={{ marginTop: 0, marginBottom: 'var(--space-4)', fontSize: 'var(--text-sm)' }}>
                  Cuando llegue cada fecha se prepara una factura igual a esta para {factura.clientName} ({formatCurrency(factura.total)}),
                  con su número y sus fechas, <strong>en borrador</strong>. La revisas y la emites tú.
                </p>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label" htmlFor="r-periodo">Cada cuánto</label>
                    <select id="r-periodo" className="form-select" value={periodo} onChange={e => cambiarPeriodo(e.target.value as Periodo)}>
                      {PERIODOS.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label required" htmlFor="r-proxima">Próxima factura</label>
                    <input id="r-proxima" type="date" className="form-input" required value={proxima} onChange={e => setProxima(e.target.value)} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="r-hasta">Hasta (opcional)</label>
                  <input id="r-hasta" type="date" className="form-input" min={proxima} value={hasta} onChange={e => setHasta(e.target.value)} />
                  <p className="form-hint">Sin fecha, se repite hasta que la pares en <Link href="/facturas/recurrentes">Facturas recurrentes</Link>.</p>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setAbierto(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={guardando || !proxima}>
                  <Repeat size={16} /> Repetir {PERIODOS.find(p => p.id === periodo)!.cada}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
