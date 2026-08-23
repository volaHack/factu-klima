'use client';

import { useState, useEffect, useMemo } from 'react';
import { Percent, Plus, Trash2, X, Edit2 } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import TableEmpty from '@/components/ui/TableEmpty';
import { getRappels, saveRappel, deleteRappel, getInvoices, getClients } from '@/lib/storage';
import { resumenRappels } from '@/lib/rappels';
import { RappelConfig, TramoRappel, Invoice, Client } from '@/lib/types';
import { generateId, formatCurrency } from '@/lib/utils';
import { useToast } from '@/hooks/useToast';

const configVacia = (): Omit<RappelConfig, 'id' | 'createdAt' | 'updatedAt'> => ({
  nombre: '', tramos: [{ desde: 0, porcentaje: 0 }], activo: true,
});

export default function RappelsPage() {
  const [mounted, setMounted] = useState(false);
  const [configs, setConfigs] = useState<RappelConfig[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clientes, setClientes] = useState<Client[]>([]);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState<RappelConfig | null>(null);
  const [form, setForm] = useState(configVacia());

  const { success, error: toastError } = useToast();

  const leer = () => Promise.all([getRappels(), getInvoices(), getClients()]);

  const cargar = async () => {
    const [c, inv, cl] = await leer();
    setConfigs(c);
    setInvoices(inv);
    setClientes(cl);
  };

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const [c, inv, cl] = await leer();
      if (!vivo) return;
      setConfigs(c);
      setInvoices(inv);
      setClientes(cl);
      setMounted(true);
    })();
    return () => { vivo = false; };
  }, []);

  const resumen = useMemo(
    () => resumenRappels(configs, invoices, { desde: desde || undefined, hasta: hasta || undefined }),
    [configs, invoices, desde, hasta],
  );
  const totalRappels = useMemo(() => resumen.reduce((s, r) => s + r.importeRappel, 0), [resumen]);

  const abrirNuevo = () => {
    setEditando(null);
    setForm(configVacia());
    setShowModal(true);
  };

  const abrirEditar = (c: RappelConfig) => {
    setEditando(c);
    setForm(c);
    setShowModal(true);
  };

  const actualizarTramo = (i: number, campo: keyof TramoRappel, valor: number) => {
    const tramos = form.tramos.map((t, idx) => (idx === i ? { ...t, [campo]: valor } : t));
    setForm({ ...form, tramos });
  };

  const anadirTramo = () => setForm({ ...form, tramos: [...form.tramos, { desde: 0, porcentaje: 0 }] });
  const quitarTramo = (i: number) => setForm({ ...form, tramos: form.tramos.filter((_, idx) => idx !== i) });

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim()) {
      toastError('Falta el nombre de la regla');
      return;
    }
    if (form.tramos.length === 0) {
      toastError('Añade al menos un tramo');
      return;
    }
    try {
      const now = new Date().toISOString();
      await saveRappel({
        id: editando?.id ?? generateId(),
        createdAt: editando?.createdAt ?? now,
        updatedAt: now,
        ...form,
      });
      setShowModal(false);
      await cargar();
      success(editando ? 'Regla actualizada' : 'Regla creada', form.nombre);
    } catch (err) {
      toastError('No se pudo guardar', err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  const handleEliminar = async (c: RappelConfig) => {
    if (!confirm(`¿Eliminar la regla «${c.nombre}»?`)) return;
    try {
      await deleteRappel(c.id);
      await cargar();
      success('Regla eliminada');
    } catch (err) {
      toastError('No se pudo eliminar', err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  if (!mounted) return <PageSkeleton />;

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Rappels por volumen</h1>
          <p className="page-subtitle">El premio por comprar mucho a lo largo de un periodo, para liquidar al cerrarlo.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={abrirNuevo}>
          <Plus size={16} /> Nueva regla
        </button>
      </div>

      <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
        <div className="form-row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: 1, minWidth: 140, margin: 0 }}>
            <label className="form-label">Periodo desde</label>
            <input type="date" className="form-input" value={desde} onChange={e => setDesde(e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: 1, minWidth: 140, margin: 0 }}>
            <label className="form-label">Periodo hasta</label>
            <input type="date" className="form-input" value={hasta} onChange={e => setHasta(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="rentabilidad-totales" style={{ marginBottom: 'var(--space-4)' }}>
          <div><span>Reglas activas</span><strong>{resumen.length}</strong></div>
          <div><span>Total a liquidar</span><strong>{formatCurrency(totalRappels)}</strong></div>
        </div>

        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Regla</th>
                <th>Cliente</th>
                <th style={{ textAlign: 'right' }}>Facturado</th>
                <th style={{ textAlign: 'right' }}>Tramo</th>
                <th style={{ textAlign: 'right' }}>Rappel</th>
                <th style={{ textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {configs.length === 0 ? (
                <TableEmpty
                  colSpan={6}
                  icon={Percent}
                  title="No hay reglas de rappel"
                  hint="Crea una regla con sus tramos: a partir de tanto facturado, tanto por ciento de vuelta."
                />
              ) : (
                configs.map(c => {
                  const r = resumen.find(x => x.configId === c.id);
                  return (
                    <tr key={c.id}>
                      <td>
                        <strong>{c.nombre}</strong>
                        {!c.activo && <span className="badge badge-neutral" style={{ marginLeft: 6 }}>Inactiva</span>}
                      </td>
                      <td>{c.clienteNombre || 'Cualquier cliente'}</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(r?.baseCalculo ?? 0)}</td>
                      <td style={{ textAlign: 'right' }}>{r?.tramo ? `${r.tramo.porcentaje}%` : '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatCurrency(r?.importeRappel ?? 0)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button type="button" className="btn btn-ghost btn-xs" onClick={() => abrirEditar(c)} title="Editar">
                          <Edit2 size={14} />
                        </button>
                        <button type="button" className="btn btn-ghost btn-xs text-danger" onClick={() => handleEliminar(c)} title="Eliminar">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editando ? 'Editar regla' : 'Nueva regla de rappel'}</h3>
              <button type="button" className="modal-close" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleGuardar}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label required">Nombre</label>
                  <input
                    type="text" className="form-input" required
                    value={form.nombre}
                    onChange={e => setForm({ ...form, nombre: e.target.value })}
                    placeholder="Rappel anual grandes cuentas"
                  />
                </div>

                <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
                  <label className="form-label">Cliente</label>
                  <select
                    className="form-select"
                    value={form.clienteId ?? ''}
                    onChange={e => {
                      const cli = clientes.find(c => c.id === e.target.value);
                      setForm({ ...form, clienteId: cli?.id, clienteNombre: cli?.businessName });
                    }}
                  >
                    <option value="">— Cualquier cliente —</option>
                    {clientes.map(c => <option key={c.id} value={c.id}>{c.businessName}</option>)}
                  </select>
                </div>

                <div style={{ marginTop: 'var(--space-4)' }}>
                  <label className="form-label">Tramos, de menor a mayor umbral</label>
                  {form.tramos.map((t, i) => (
                    <div key={i} className="form-row" style={{ marginTop: 'var(--space-2)', alignItems: 'flex-end' }}>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label className="form-label">A partir de (€)</label>
                        <input
                          type="number" min={0} step={1} className="form-input"
                          value={t.desde}
                          onChange={e => actualizarTramo(i, 'desde', parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label className="form-label">% de vuelta</label>
                        <input
                          type="number" min={0} max={100} step={0.5} className="form-input"
                          value={t.porcentaje}
                          onChange={e => actualizarTramo(i, 'porcentaje', parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      <button
                        type="button" className="btn btn-ghost btn-sm"
                        onClick={() => quitarTramo(i)}
                        disabled={form.tramos.length <= 1}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 'var(--space-2)' }} onClick={anadirTramo}>
                    <Plus size={14} /> Añadir tramo
                  </button>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer', marginTop: 'var(--space-4)' }}>
                  <input
                    type="checkbox"
                    checked={form.activo}
                    onChange={e => setForm({ ...form, activo: e.target.checked })}
                  />
                  <span style={{ fontWeight: 600 }}>Activa</span>
                </label>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Guardar regla</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
