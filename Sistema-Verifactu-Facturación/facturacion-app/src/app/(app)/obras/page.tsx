'use client';

import { useState, useEffect, useMemo } from 'react';
import { Briefcase, Plus, Edit2, Trash2, X, CheckCircle2 } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import TableEmpty from '@/components/ui/TableEmpty';
import {
  getObras, saveObra, deleteObra, getInvoices, getGastos, getClients,
} from '@/lib/storage';
import { rentabilidadDeObras, numeroDeObra } from '@/lib/obras';
import { Obra, EstadoObra, Invoice, Gasto, Client } from '@/lib/types';
import { generateId, formatCurrency, formatDate, getToday } from '@/lib/utils';
import { useToast } from '@/hooks/useToast';

const obraVacia = (numero: string): Omit<Obra, 'id' | 'createdAt' | 'updatedAt'> => ({
  numero, nombre: '', estado: 'abierta', fechaApertura: getToday(),
});

export default function ObrasPage() {
  const [mounted, setMounted] = useState(false);
  const [obras, setObras] = useState<Obra[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [clientes, setClientes] = useState<Client[]>([]);
  const [filtroEstado, setFiltroEstado] = useState<EstadoObra | ''>('abierta');

  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState<Obra | null>(null);
  const [form, setForm] = useState(obraVacia(''));

  const { success, error: toastError } = useToast();

  const leer = () => Promise.all([getObras(), getInvoices(), getGastos(), getClients()]);

  const cargar = async () => {
    const [o, inv, g, c] = await leer();
    setObras(o);
    setInvoices(inv);
    setGastos(g);
    setClientes(c);
  };

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const [o, inv, g, c] = await leer();
      if (!vivo) return;
      setObras(o);
      setInvoices(inv);
      setGastos(g);
      setClientes(c);
      setMounted(true);
    })();
    return () => { vivo = false; };
  }, []);

  const rentabilidad = useMemo(() => rentabilidadDeObras(obras, invoices, gastos), [obras, invoices, gastos]);
  const porId = useMemo(() => new Map(rentabilidad.map(r => [r.obraId, r])), [rentabilidad]);

  const visibles = useMemo(
    () => (filtroEstado ? obras.filter(o => o.estado === filtroEstado) : obras),
    [obras, filtroEstado],
  );

  const abrirNueva = () => {
    setEditando(null);
    setForm(obraVacia(numeroDeObra(obras)));
    setShowModal(true);
  };

  const abrirEditar = (o: Obra) => {
    setEditando(o);
    setForm(o);
    setShowModal(true);
  };

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim()) {
      toastError('Falta el nombre de la obra');
      return;
    }
    try {
      const now = new Date().toISOString();
      await saveObra({
        id: editando?.id ?? generateId(),
        createdAt: editando?.createdAt ?? now,
        updatedAt: now,
        ...form,
      });
      setShowModal(false);
      await cargar();
      success(editando ? 'Obra actualizada' : 'Obra creada', form.nombre);
    } catch (err) {
      toastError('No se pudo guardar', err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  const handleCerrar = async (o: Obra) => {
    try {
      await saveObra({ ...o, estado: 'cerrada', fechaCierre: getToday() });
      await cargar();
      success('Obra cerrada', o.nombre);
    } catch (err) {
      toastError('No se pudo cerrar', err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  const handleEliminar = async (o: Obra) => {
    if (!confirm(`¿Eliminar la obra «${o.nombre}»? Las facturas y gastos que llevaba asignada no se borran, se quedan sin obra.`)) return;
    try {
      await deleteObra(o.id);
      await cargar();
      success('Obra eliminada');
    } catch (err) {
      toastError('No se pudo eliminar', err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  if (!mounted) return <PageSkeleton />;

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Obras y expedientes</h1>
          <p className="page-subtitle">Agrupa lo que se factura y lo que se gasta en cada proyecto, y sabrás si ha dejado dinero.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={abrirNueva}>
          <Plus size={16} /> Nueva obra
        </button>
      </div>

      <div className="tabs">
        <button type="button" className={`tab ${filtroEstado === 'abierta' ? 'active' : ''}`} onClick={() => setFiltroEstado('abierta')}>
          Abiertas
        </button>
        <button type="button" className={`tab ${filtroEstado === 'cerrada' ? 'active' : ''}`} onClick={() => setFiltroEstado('cerrada')}>
          Cerradas
        </button>
        <button type="button" className={`tab ${filtroEstado === '' ? 'active' : ''}`} onClick={() => setFiltroEstado('')}>
          Todas
        </button>
      </div>

      <div className="card">
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Nº</th>
                <th>Nombre</th>
                <th>Cliente</th>
                <th>Apertura</th>
                <th style={{ textAlign: 'right' }}>Ingresos</th>
                <th style={{ textAlign: 'right' }}>Gastos</th>
                <th style={{ textAlign: 'right' }}>Margen</th>
                <th style={{ textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visibles.length === 0 ? (
                <TableEmpty
                  colSpan={8}
                  icon={Briefcase}
                  title="No hay obras que mostrar"
                  hint="Crea una obra y asígnale facturas y gastos para ver su rentabilidad."
                />
              ) : (
                visibles.map(o => {
                  const r = porId.get(o.id);
                  return (
                    <tr key={o.id}>
                      <td className="mono">{o.numero}</td>
                      <td>
                        <strong>{o.nombre}</strong>
                        {o.estado === 'cerrada' && <span className="badge badge-neutral" style={{ marginLeft: 6 }}>Cerrada</span>}
                      </td>
                      <td>{o.clienteNombre || '—'}</td>
                      <td>{formatDate(o.fechaApertura)}</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(r?.ingresos ?? 0)}</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(r?.costeGastos ?? 0)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: (r?.margen ?? 0) >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                        {formatCurrency(r?.margen ?? 0)}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {o.estado === 'abierta' && (
                          <button type="button" className="btn btn-ghost btn-xs" onClick={() => handleCerrar(o)} title="Cerrar obra">
                            <CheckCircle2 size={14} />
                          </button>
                        )}
                        <button type="button" className="btn btn-ghost btn-xs" onClick={() => abrirEditar(o)} title="Editar">
                          <Edit2 size={14} />
                        </button>
                        <button type="button" className="btn btn-ghost btn-xs text-danger" onClick={() => handleEliminar(o)} title="Eliminar">
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
              <h3 className="modal-title">{editando ? 'Editar obra' : 'Nueva obra'}</h3>
              <button type="button" className="modal-close" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleGuardar}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Número</label>
                    <input type="text" className="form-input mono" readOnly value={form.numero} />
                  </div>
                  <div className="form-group">
                    <label className="form-label required">Fecha de apertura</label>
                    <input
                      type="date" className="form-input" required
                      value={form.fechaApertura}
                      onChange={e => setForm({ ...form, fechaApertura: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
                  <label className="form-label required">Nombre</label>
                  <input
                    type="text" className="form-input" required
                    value={form.nombre}
                    onChange={e => setForm({ ...form, nombre: e.target.value })}
                    placeholder="Reforma local Gran Vía, Expediente 42/2026…"
                  />
                </div>

                <div className="form-row" style={{ marginTop: 'var(--space-4)' }}>
                  <div className="form-group">
                    <label className="form-label">Cliente</label>
                    <select
                      className="form-select"
                      value={form.clienteId ?? ''}
                      onChange={e => {
                        const cli = clientes.find(c => c.id === e.target.value);
                        setForm({ ...form, clienteId: cli?.id, clienteNombre: cli?.businessName });
                      }}
                    >
                      <option value="">— Sin cliente —</option>
                      {clientes.map(c => <option key={c.id} value={c.id}>{c.businessName}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Presupuesto</label>
                    <input
                      type="number" min={0} step={0.01} className="form-input"
                      value={form.presupuesto ?? ''}
                      onChange={e => setForm({ ...form, presupuesto: e.target.value === '' ? undefined : parseFloat(e.target.value) })}
                      placeholder="Opcional, sólo referencia"
                    />
                  </div>
                </div>

                <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
                  <label className="form-label">Notas</label>
                  <textarea
                    className="form-input" rows={3}
                    value={form.notas ?? ''}
                    onChange={e => setForm({ ...form, notas: e.target.value })}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Guardar obra</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
