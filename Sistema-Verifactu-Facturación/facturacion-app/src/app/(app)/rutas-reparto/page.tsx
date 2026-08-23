'use client';

import { useState, useEffect, useMemo, Fragment } from 'react';
import { Truck, Plus, Trash2, X, Edit2, ChevronDown, ChevronUp } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import TableEmpty from '@/components/ui/TableEmpty';
import { getRutasReparto, saveRutaReparto, deleteRutaReparto, getClients, saveClient, getInvoices } from '@/lib/storage';
import { clientesDeRuta, albaranesPendientesDeRuta, resumenDeRuta, DIAS_SEMANA } from '@/lib/rutas';
import { RutaReparto, Client, Invoice } from '@/lib/types';
import { generateId, formatCurrency, formatDate } from '@/lib/utils';
import { useToast } from '@/hooks/useToast';

const rutaVacia = (): Omit<RutaReparto, 'id' | 'createdAt' | 'updatedAt'> => ({ nombre: '' });

export default function RutasRepartoPage() {
  const [mounted, setMounted] = useState(false);
  const [rutas, setRutas] = useState<RutaReparto[]>([]);
  const [clientes, setClientes] = useState<Client[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [expandida, setExpandida] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState<RutaReparto | null>(null);
  const [form, setForm] = useState(rutaVacia());

  const { success, error: toastError } = useToast();

  const leer = () => Promise.all([getRutasReparto(), getClients(), getInvoices()]);

  const cargar = async () => {
    const [r, c, inv] = await leer();
    setRutas(r);
    setClientes(c);
    setInvoices(inv);
  };

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const [r, c, inv] = await leer();
      if (!vivo) return;
      setRutas(r);
      setClientes(c);
      setInvoices(inv);
      setMounted(true);
    })();
    return () => { vivo = false; };
  }, []);

  const sinRuta = clientes.filter(c => !c.esProveedor && !c.rutaId);

  const abrirNueva = () => {
    setEditando(null);
    setForm(rutaVacia());
    setShowModal(true);
  };

  const abrirEditar = (r: RutaReparto) => {
    setEditando(r);
    setForm(r);
    setShowModal(true);
  };

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim()) {
      toastError('Falta el nombre de la ruta');
      return;
    }
    try {
      const now = new Date().toISOString();
      await saveRutaReparto({
        id: editando?.id ?? generateId(),
        createdAt: editando?.createdAt ?? now,
        updatedAt: now,
        ...form,
      });
      setShowModal(false);
      await cargar();
      success(editando ? 'Ruta actualizada' : 'Ruta creada', form.nombre);
    } catch (err) {
      toastError('No se pudo guardar', err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  const handleEliminar = async (r: RutaReparto) => {
    const n = clientesDeRuta(r.id, clientes).length;
    const aviso = n > 0
      ? `¿Eliminar «${r.nombre}»? Sus ${n} clientes se quedarán sin ruta, no se borran.`
      : `¿Eliminar la ruta «${r.nombre}»?`;
    if (!confirm(aviso)) return;
    try {
      await deleteRutaReparto(r.id);
      await cargar();
      success('Ruta eliminada');
    } catch (err) {
      toastError('No se pudo eliminar', err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  const asignarCliente = async (clienteId: string, rutaId: string) => {
    const cliente = clientes.find(c => c.id === clienteId);
    if (!cliente) return;
    try {
      await saveClient({ ...cliente, rutaId: rutaId || undefined });
      await cargar();
    } catch (err) {
      toastError('No se pudo asignar el cliente', err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  if (!mounted) return <PageSkeleton />;

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Rutas de reparto</h1>
          <p className="page-subtitle">Qué hay que llevar y a quién, agrupado por ruta.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={abrirNueva}>
          <Plus size={16} /> Nueva ruta
        </button>
      </div>

      <div className="card">
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th></th>
                <th>Ruta</th>
                <th>Día habitual</th>
                <th style={{ textAlign: 'right' }}>Paradas pendientes</th>
                <th style={{ textAlign: 'right' }}>Importe</th>
                <th style={{ textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rutas.length === 0 ? (
                <TableEmpty
                  colSpan={6}
                  icon={Truck}
                  title="No hay rutas de reparto"
                  hint="Crea una ruta y asígnale los clientes de esa zona o de ese día."
                />
              ) : (
                rutas.map(r => {
                  const resumen = resumenDeRuta(r.id, clientes, invoices);
                  const pendientes = albaranesPendientesDeRuta(r.id, clientes, invoices);
                  const abierta = expandida === r.id;
                  return (
                    <Fragment key={r.id}>
                      <tr onClick={() => setExpandida(abierta ? null : r.id)} style={{ cursor: 'pointer' }}>
                        <td>{abierta ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</td>
                        <td><strong>{r.nombre}</strong></td>
                        <td>{r.diaSemana != null ? DIAS_SEMANA[r.diaSemana] : '—'}</td>
                        <td style={{ textAlign: 'right' }}>{resumen.paradas}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatCurrency(resumen.importe)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button type="button" className="btn btn-ghost btn-xs" onClick={e => { e.stopPropagation(); abrirEditar(r); }} title="Editar">
                            <Edit2 size={14} />
                          </button>
                          <button type="button" className="btn btn-ghost btn-xs text-danger" onClick={e => { e.stopPropagation(); handleEliminar(r); }} title="Eliminar">
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                      {abierta && (
                        <tr>
                          <td colSpan={6} style={{ padding: 'var(--space-4)', background: 'var(--bg-tertiary)' }}>
                            <div style={{ marginBottom: 'var(--space-3)' }}>
                              <span className="modulos-titulo">Clientes de la ruta</span>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                                {clientesDeRuta(r.id, clientes).map(c => (
                                  <span key={c.id} className="badge badge-outline">
                                    {c.businessName}
                                    <button
                                      type="button"
                                      onClick={() => asignarCliente(c.id, '')}
                                      style={{ marginLeft: 6, border: 'none', background: 'none', cursor: 'pointer', color: 'inherit' }}
                                      title="Quitar de la ruta"
                                    >
                                      ×
                                    </button>
                                  </span>
                                ))}
                                {sinRuta.length > 0 && (
                                  <select
                                    className="form-select form-select-sm"
                                    value=""
                                    onChange={e => e.target.value && asignarCliente(e.target.value, r.id)}
                                  >
                                    <option value="">+ Añadir cliente…</option>
                                    {sinRuta.map(c => <option key={c.id} value={c.id}>{c.businessName}</option>)}
                                  </select>
                                )}
                              </div>
                            </div>

                            <span className="modulos-titulo">Hoja de la jornada — pendiente de repartir</span>
                            {pendientes.length === 0 ? (
                              <p className="text-muted" style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>
                                No hay ningún albarán pendiente en esta ruta.
                              </p>
                            ) : (
                              <table className="table" style={{ marginTop: 'var(--space-2)' }}>
                                <thead>
                                  <tr>
                                    <th>Albarán</th>
                                    <th>Fecha</th>
                                    <th>Cliente</th>
                                    <th>Dirección</th>
                                    <th style={{ textAlign: 'right' }}>Importe</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {pendientes.map(a => (
                                    <tr key={a.id}>
                                      <td className="mono">{a.number}</td>
                                      <td>{formatDate(a.issueDate)}</td>
                                      <td><strong>{a.clientName}</strong></td>
                                      <td>{a.clientAddress}</td>
                                      <td style={{ textAlign: 'right' }}>{formatCurrency(a.total)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
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
              <h3 className="modal-title">{editando ? 'Editar ruta' : 'Nueva ruta'}</h3>
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
                    placeholder="Zona norte, Reparto lunes…"
                  />
                </div>
                <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
                  <label className="form-label">Día habitual</label>
                  <select
                    className="form-select"
                    value={form.diaSemana ?? ''}
                    onChange={e => setForm({ ...form, diaSemana: e.target.value === '' ? undefined : parseInt(e.target.value, 10) })}
                  >
                    <option value="">— Sin día fijo —</option>
                    {DIAS_SEMANA.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
                  <label className="form-label">Notas</label>
                  <textarea
                    className="form-input" rows={2}
                    value={form.notas ?? ''}
                    onChange={e => setForm({ ...form, notas: e.target.value })}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Guardar ruta</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
