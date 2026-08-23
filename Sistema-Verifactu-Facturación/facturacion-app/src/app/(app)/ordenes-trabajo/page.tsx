'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Wrench, Plus, Edit2, Trash2, X, ArrowRight, AlertTriangle } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import TableEmpty from '@/components/ui/TableEmpty';
import {
  getOrdenesTrabajo, saveOrdenTrabajo, deleteOrdenTrabajo, getClients, getVendedores, getCompanySettings,
} from '@/lib/storage';
import { diasAbierta, numeroDeOrden, siguienteEstado } from '@/lib/ordenesTrabajo';
import { tieneModulo } from '@/lib/modulos';
import { OrdenTrabajo, EstadoOrdenTrabajo, Client, Vendedor } from '@/lib/types';
import { generateId, formatDate, getToday } from '@/lib/utils';
import { useToast } from '@/hooks/useToast';

const ETIQUETA_ESTADO: Record<EstadoOrdenTrabajo, string> = {
  abierta: 'Abierta', en_curso: 'En curso', cerrada: 'Cerrada',
};

const ordenVacia = (numero: string): Omit<OrdenTrabajo, 'id' | 'createdAt' | 'updatedAt'> => ({
  numero, descripcion: '', estado: 'abierta', fecha: getToday(),
});

export default function OrdenesTrabajoPage() {
  const [mounted, setMounted] = useState(false);
  const [ordenes, setOrdenes] = useState<OrdenTrabajo[]>([]);
  const [clientes, setClientes] = useState<Client[]>([]);
  const [tecnicos, setTecnicos] = useState<Vendedor[]>([]);
  const [modoObras, setModoObras] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState<EstadoOrdenTrabajo | ''>('');

  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState<OrdenTrabajo | null>(null);
  const [form, setForm] = useState(ordenVacia(''));

  const { success, error: toastError } = useToast();

  const leer = () => Promise.all([getOrdenesTrabajo(), getClients(), getVendedores(), getCompanySettings()]);

  const cargar = async () => {
    const [o, c, t, settings] = await leer();
    setOrdenes(o);
    setClientes(c);
    setTecnicos(t);
    setModoObras(tieneModulo(settings?.modulos, 'obras'));
  };

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const [o, c, t, settings] = await leer();
      if (!vivo) return;
      setOrdenes(o);
      setClientes(c);
      setTecnicos(t);
      setModoObras(tieneModulo(settings?.modulos, 'obras'));
      setMounted(true);
    })();
    return () => { vivo = false; };
  }, []);

  const visibles = useMemo(
    () => (filtroEstado ? ordenes.filter(o => o.estado === filtroEstado) : ordenes),
    [ordenes, filtroEstado],
  );

  const abrirNueva = () => {
    setEditando(null);
    setForm(ordenVacia(numeroDeOrden(ordenes)));
    setShowModal(true);
  };

  const abrirEditar = (o: OrdenTrabajo) => {
    setEditando(o);
    setForm(o);
    setShowModal(true);
  };

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.descripcion.trim()) {
      toastError('Falta la descripción del trabajo');
      return;
    }
    try {
      const now = new Date().toISOString();
      await saveOrdenTrabajo({
        id: editando?.id ?? generateId(),
        createdAt: editando?.createdAt ?? now,
        updatedAt: now,
        ...form,
      });
      setShowModal(false);
      await cargar();
      success(editando ? 'Orden actualizada' : 'Orden creada', form.descripcion);
    } catch (err) {
      toastError('No se pudo guardar', err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  const handleAvanzar = async (o: OrdenTrabajo) => {
    const siguiente = siguienteEstado(o.estado);
    if (!siguiente) return;
    try {
      await saveOrdenTrabajo({ ...o, estado: siguiente });
      await cargar();
      success(`Orden pasada a «${ETIQUETA_ESTADO[siguiente]}»`);
    } catch (err) {
      toastError('No se pudo cambiar el estado', err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  const handleEliminar = async (o: OrdenTrabajo) => {
    if (!confirm(`¿Eliminar la orden «${o.numero}»?`)) return;
    try {
      await deleteOrdenTrabajo(o.id);
      await cargar();
      success('Orden eliminada');
    } catch (err) {
      toastError('No se pudo eliminar', err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  if (!mounted) return <PageSkeleton />;

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Órdenes de trabajo</h1>
          <p className="page-subtitle">El parte de cada servicio: qué se hizo, quién, horas y materiales.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={abrirNueva}>
          <Plus size={16} /> Nueva orden
        </button>
      </div>

      <div className="tabs">
        <button type="button" className={`tab ${filtroEstado === '' ? 'active' : ''}`} onClick={() => setFiltroEstado('')}>Todas</button>
        <button type="button" className={`tab ${filtroEstado === 'abierta' ? 'active' : ''}`} onClick={() => setFiltroEstado('abierta')}>Abiertas</button>
        <button type="button" className={`tab ${filtroEstado === 'en_curso' ? 'active' : ''}`} onClick={() => setFiltroEstado('en_curso')}>En curso</button>
        <button type="button" className={`tab ${filtroEstado === 'cerrada' ? 'active' : ''}`} onClick={() => setFiltroEstado('cerrada')}>Cerradas</button>
      </div>

      <div className="card">
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Nº</th>
                <th>Fecha</th>
                <th>Cliente</th>
                <th>Descripción</th>
                <th>Técnico</th>
                <th>Estado</th>
                <th style={{ textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visibles.length === 0 ? (
                <TableEmpty
                  colSpan={7}
                  icon={Wrench}
                  title="No hay órdenes de trabajo"
                  hint="Registra el aviso en cuanto llegue: fecha, cliente y qué hay que hacer."
                />
              ) : (
                visibles.map(o => {
                  const dias = diasAbierta(o);
                  const atrasada = o.estado !== 'cerrada' && dias > 7;
                  const siguiente = siguienteEstado(o.estado);
                  return (
                    <tr key={o.id}>
                      <td className="mono">{o.numero}</td>
                      <td>{formatDate(o.fecha)}</td>
                      <td>{o.clienteNombre || '—'}</td>
                      <td>
                        {o.descripcion}
                        {atrasada && (
                          <span className="modulos-nota" style={{ marginLeft: 6 }}>
                            <AlertTriangle size={11} /> {dias} días abierta
                          </span>
                        )}
                      </td>
                      <td>{tecnicos.find(t => t.id === o.tecnicoId)?.nombre ?? '—'}</td>
                      <td>
                        <span className={`badge ${o.estado === 'cerrada' ? 'badge-neutral' : 'badge-activo'}`}>
                          {ETIQUETA_ESTADO[o.estado]}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {siguiente && (
                          <button
                            type="button" className="btn btn-ghost btn-xs"
                            onClick={() => handleAvanzar(o)}
                            title={`Pasar a ${ETIQUETA_ESTADO[siguiente]}`}
                          >
                            <ArrowRight size={14} />
                          </button>
                        )}
                        {o.estado === 'cerrada' && o.clienteId && !o.invoiceId && (
                          <Link
                            href={`/documentos/nuevo?tipo=factura&clientId=${o.clienteId}${o.obraId ? `&obraId=${o.obraId}` : ''}`}
                            className="btn btn-ghost btn-xs"
                            title="Facturar"
                          >
                            Facturar
                          </Link>
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
              <h3 className="modal-title">{editando ? 'Editar orden' : 'Nueva orden de trabajo'}</h3>
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
                    <label className="form-label required">Fecha</label>
                    <input
                      type="date" className="form-input" required
                      value={form.fecha}
                      onChange={e => setForm({ ...form, fecha: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
                  <label className="form-label required">Descripción del trabajo</label>
                  <textarea
                    className="form-input" rows={2} required
                    value={form.descripcion}
                    onChange={e => setForm({ ...form, descripcion: e.target.value })}
                    placeholder="Fuga en la cocina, revisión de la caldera…"
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
                    <label className="form-label">Técnico</label>
                    <select
                      className="form-select"
                      value={form.tecnicoId ?? ''}
                      onChange={e => setForm({ ...form, tecnicoId: e.target.value || undefined })}
                    >
                      <option value="">— Sin asignar —</option>
                      {tecnicos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                    </select>
                  </div>
                </div>

                <div className="form-row" style={{ marginTop: 'var(--space-4)' }}>
                  <div className="form-group">
                    <label className="form-label">Horas</label>
                    <input
                      type="number" min={0} step={0.25} className="form-input"
                      value={form.horas ?? ''}
                      onChange={e => setForm({ ...form, horas: e.target.value === '' ? undefined : parseFloat(e.target.value) })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Estado</label>
                    <select
                      className="form-select"
                      value={form.estado}
                      onChange={e => setForm({ ...form, estado: e.target.value as EstadoOrdenTrabajo })}
                    >
                      <option value="abierta">Abierta</option>
                      <option value="en_curso">En curso</option>
                      <option value="cerrada">Cerrada</option>
                    </select>
                  </div>
                </div>

                <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
                  <label className="form-label">Materiales</label>
                  <textarea
                    className="form-input" rows={2}
                    value={form.materiales ?? ''}
                    onChange={e => setForm({ ...form, materiales: e.target.value })}
                    placeholder="2 m de tubo de cobre, una válvula…"
                  />
                </div>

                {!modoObras && (
                  <p className="modulos-nota" style={{ marginTop: 'var(--space-2)' }}>
                    Enciende el módulo de Obras en Ajustes para agrupar esta orden dentro de un proyecto más grande.
                  </p>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Guardar orden</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
