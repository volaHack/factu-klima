'use client';

import { useState, useEffect, useMemo, Fragment } from 'react';
import { Building2, Plus, Trash2, X, Edit2, ChevronDown, ChevronUp } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import TableEmpty from '@/components/ui/TableEmpty';
import { getGruposClientes, saveGrupoCliente, deleteGrupoCliente, getClients, saveClient, getInvoices } from '@/lib/storage';
import { resumenGrupos, clientesDelGrupo } from '@/lib/gruposClientes';
import { GrupoCliente, Client, Invoice } from '@/lib/types';
import { generateId, formatCurrency } from '@/lib/utils';
import { useToast } from '@/hooks/useToast';

const grupoVacio = (): Omit<GrupoCliente, 'id' | 'createdAt' | 'updatedAt'> => ({ nombre: '' });

export default function GruposClientesPage() {
  const [mounted, setMounted] = useState(false);
  const [grupos, setGrupos] = useState<GrupoCliente[]>([]);
  const [clientes, setClientes] = useState<Client[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [expandido, setExpandido] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState<GrupoCliente | null>(null);
  const [form, setForm] = useState(grupoVacio());

  const { success, error: toastError } = useToast();

  const leer = () => Promise.all([getGruposClientes(), getClients(), getInvoices()]);

  const cargar = async () => {
    const [g, c, inv] = await leer();
    setGrupos(g);
    setClientes(c);
    setInvoices(inv);
  };

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const [g, c, inv] = await leer();
      if (!vivo) return;
      setGrupos(g);
      setClientes(c);
      setInvoices(inv);
      setMounted(true);
    })();
    return () => { vivo = false; };
  }, []);

  const resumen = useMemo(() => resumenGrupos(grupos, clientes, invoices), [grupos, clientes, invoices]);
  const sinGrupo = clientes.filter(c => !c.esProveedor && !c.grupoId);

  const abrirNuevo = () => {
    setEditando(null);
    setForm(grupoVacio());
    setShowModal(true);
  };

  const abrirEditar = (g: GrupoCliente) => {
    setEditando(g);
    setForm(g);
    setShowModal(true);
  };

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim()) {
      toastError('Falta el nombre del grupo');
      return;
    }
    try {
      const now = new Date().toISOString();
      await saveGrupoCliente({
        id: editando?.id ?? generateId(),
        createdAt: editando?.createdAt ?? now,
        updatedAt: now,
        ...form,
      });
      setShowModal(false);
      await cargar();
      success(editando ? 'Grupo actualizado' : 'Grupo creado', form.nombre);
    } catch (err) {
      toastError('No se pudo guardar', err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  const handleEliminar = async (g: GrupoCliente) => {
    const n = clientesDelGrupo(g.id, clientes).length;
    const aviso = n > 0
      ? `¿Eliminar «${g.nombre}»? Sus ${n} clientes se quedarán sin grupo, no se borran.`
      : `¿Eliminar el grupo «${g.nombre}»?`;
    if (!confirm(aviso)) return;
    try {
      await deleteGrupoCliente(g.id);
      await cargar();
      success('Grupo eliminado');
    } catch (err) {
      toastError('No se pudo eliminar', err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  const asignarCliente = async (clienteId: string, grupoId: string) => {
    const cliente = clientes.find(c => c.id === clienteId);
    if (!cliente) return;
    try {
      await saveClient({ ...cliente, grupoId: grupoId || undefined });
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
          <h1 className="page-title">Grupos y cadenas</h1>
          <p className="page-subtitle">Sucursales que facturan por separado, analizadas como una sola cuenta.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={abrirNuevo}>
          <Plus size={16} /> Nuevo grupo
        </button>
      </div>

      <div className="card">
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th></th>
                <th>Grupo</th>
                <th style={{ textAlign: 'right' }}>Clientes</th>
                <th style={{ textAlign: 'right' }}>Facturas</th>
                <th style={{ textAlign: 'right' }}>Facturado</th>
                <th style={{ textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {resumen.length === 0 ? (
                <TableEmpty
                  colSpan={6}
                  icon={Building2}
                  title="No hay grupos de clientes"
                  hint="Crea un grupo y asígnale las sucursales de una misma cadena para verlas juntas."
                />
              ) : (
                resumen.map(r => {
                  const grupo = grupos.find(g => g.id === r.grupoId)!;
                  const abierto = expandido === r.grupoId;
                  return (
                    <Fragment key={r.grupoId}>
                      <tr key={r.grupoId} onClick={() => setExpandido(abierto ? null : r.grupoId)} style={{ cursor: 'pointer' }}>
                        <td>{abierto ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</td>
                        <td><strong>{r.nombre}</strong></td>
                        <td style={{ textAlign: 'right' }}>{r.numClientes}</td>
                        <td style={{ textAlign: 'right' }}>{r.numFacturas}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatCurrency(r.facturado)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button type="button" className="btn btn-ghost btn-xs" onClick={e => { e.stopPropagation(); abrirEditar(grupo); }} title="Editar">
                            <Edit2 size={14} />
                          </button>
                          <button type="button" className="btn btn-ghost btn-xs text-danger" onClick={e => { e.stopPropagation(); handleEliminar(grupo); }} title="Eliminar">
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                      {abierto && (
                        <tr>
                          <td colSpan={6} style={{ padding: 'var(--space-3) var(--space-4)', background: 'var(--bg-tertiary)' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', alignItems: 'center' }}>
                              {clientesDelGrupo(r.grupoId, clientes).map(c => (
                                <span key={c.id} className="badge badge-outline">
                                  {c.businessName}
                                  <button
                                    type="button"
                                    onClick={() => asignarCliente(c.id, '')}
                                    style={{ marginLeft: 6, border: 'none', background: 'none', cursor: 'pointer', color: 'inherit' }}
                                    title="Quitar del grupo"
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                              {sinGrupo.length > 0 && (
                                <select
                                  className="form-select form-select-sm"
                                  value=""
                                  onChange={e => e.target.value && asignarCliente(e.target.value, r.grupoId)}
                                >
                                  <option value="">+ Añadir cliente…</option>
                                  {sinGrupo.map(c => <option key={c.id} value={c.id}>{c.businessName}</option>)}
                                </select>
                              )}
                            </div>
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
              <h3 className="modal-title">{editando ? 'Editar grupo' : 'Nuevo grupo'}</h3>
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
                    placeholder="Central de compras, cadena de tiendas…"
                  />
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
                <button type="submit" className="btn btn-primary">Guardar grupo</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
