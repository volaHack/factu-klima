'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Receipt, Car, Plus, Trash2, Edit2, X, AlertTriangle,
} from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import TableEmpty from '@/components/ui/TableEmpty';
import {
  getGastos, saveGasto, deleteGasto, getVehiculos, saveVehiculo, deleteVehiculo,
  getProveedores, getCompanySettings, getObras,
} from '@/lib/storage';
import { calcularGasto, totalGastos, costeDeVehiculos, gastoVacio, CATEGORIAS_GASTO } from '@/lib/gastos';
import { tieneModulo } from '@/lib/modulos';
import { Gasto, GastoCategoria, Vehiculo, Client, Obra, PaymentMethod } from '@/lib/types';
import { generateId, formatCurrency, formatDate, getToday } from '@/lib/utils';
import { PAYMENT_METHODS } from '@/lib/constants';
import { useToast } from '@/hooks/useToast';

type Tab = 'gastos' | 'vehiculos';

export default function GastosPage() {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('gastos');

  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [proveedores, setProveedores] = useState<Client[]>([]);
  const [obras, setObras] = useState<Obra[]>([]);
  const [modoVehiculos, setModoVehiculos] = useState(false);
  const [modoObras, setModoObras] = useState(false);

  const [busqueda, setBusqueda] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState<GastoCategoria | ''>('');
  const [filtroDesde, setFiltroDesde] = useState('');
  const [filtroHasta, setFiltroHasta] = useState('');

  const [showGastoModal, setShowGastoModal] = useState(false);
  const [editandoGasto, setEditandoGasto] = useState<Gasto | null>(null);
  const [gastoForm, setGastoForm] = useState(gastoVacio(getToday()));

  const [showVehiculoModal, setShowVehiculoModal] = useState(false);
  const [editandoVehiculo, setEditandoVehiculo] = useState<Vehiculo | null>(null);
  const [vehiculoForm, setVehiculoForm] = useState({ matricula: '', nombre: '', activo: true });

  const { success, error: toastError } = useToast();

  // La lectura vive aparte del `setState`: `cargar` la reutilizan los
  // manejadores de guardar/borrar (fuera de cualquier efecto, sin problema),
  // y el montaje inicial la envuelve con un centinela para no escribir en un
  // componente que ya no está en pantalla si la petición tarda y la persona
  // se ha ido a otra página mientras tanto.
  const leer = () => Promise.all([
    getGastos(), getVehiculos(), getProveedores(), getObras(), getCompanySettings(),
  ]);

  const cargar = async () => {
    const [g, v, p, o, settings] = await leer();
    setGastos(g);
    setVehiculos(v);
    setProveedores(p);
    setObras(o);
    setModoVehiculos(tieneModulo(settings?.modulos, 'vehiculos'));
    setModoObras(tieneModulo(settings?.modulos, 'obras'));
  };

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const [g, v, p, o, settings] = await leer();
      if (!vivo) return;
      setGastos(g);
      setVehiculos(v);
      setProveedores(p);
      setObras(o);
      setModoVehiculos(tieneModulo(settings?.modulos, 'vehiculos'));
      setModoObras(tieneModulo(settings?.modulos, 'obras'));
      setMounted(true);
    })();
    return () => { vivo = false; };
  }, []);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return gastos
      .filter(g => !q || g.concepto.toLowerCase().includes(q) || (g.proveedorNombre ?? '').toLowerCase().includes(q))
      .filter(g => !filtroCategoria || g.categoria === filtroCategoria)
      .filter(g => !filtroDesde || g.fecha >= filtroDesde)
      .filter(g => !filtroHasta || g.fecha <= filtroHasta);
  }, [gastos, busqueda, filtroCategoria, filtroDesde, filtroHasta]);

  const total = useMemo(() => totalGastos(visibles), [visibles]);
  const costesPorVehiculo = useMemo(() => costeDeVehiculos(gastos), [gastos]);

  // --- Gasto: alta / edición ---

  const abrirNuevoGasto = () => {
    setEditandoGasto(null);
    setGastoForm(gastoVacio(getToday()));
    setShowGastoModal(true);
  };

  const abrirEditarGasto = (g: Gasto) => {
    setEditandoGasto(g);
    setGastoForm(g);
    setShowGastoModal(true);
  };

  const actualizarBase = (baseImponible: number, taxRate: number) => {
    const { taxAmount, total: t } = calcularGasto(baseImponible, taxRate);
    setGastoForm(prev => ({ ...prev, baseImponible, taxRate, taxAmount, total: t }));
  };

  const handleGuardarGasto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gastoForm.concepto.trim()) {
      toastError('Falta el concepto del gasto');
      return;
    }
    try {
      const registro: Gasto = {
        id: editandoGasto?.id ?? generateId(),
        createdAt: editandoGasto?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...gastoForm,
      };
      await saveGasto(registro);
      setShowGastoModal(false);
      await cargar();
      success(editandoGasto ? 'Gasto actualizado' : 'Gasto registrado', registro.concepto);
    } catch (err) {
      toastError('No se pudo guardar el gasto', err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  const handleEliminarGasto = async (g: Gasto) => {
    if (!confirm(`¿Eliminar el gasto «${g.concepto}»?`)) return;
    try {
      await deleteGasto(g.id);
      await cargar();
      success('Gasto eliminado');
    } catch (err) {
      toastError('No se pudo eliminar', err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  // --- Vehículo: alta / edición ---

  const abrirNuevoVehiculo = () => {
    setEditandoVehiculo(null);
    setVehiculoForm({ matricula: '', nombre: '', activo: true });
    setShowVehiculoModal(true);
  };

  const abrirEditarVehiculo = (v: Vehiculo) => {
    setEditandoVehiculo(v);
    setVehiculoForm({ matricula: v.matricula, nombre: v.nombre ?? '', activo: v.activo });
    setShowVehiculoModal(true);
  };

  const handleGuardarVehiculo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehiculoForm.matricula.trim()) {
      toastError('Falta la matrícula');
      return;
    }
    try {
      const now = new Date().toISOString();
      await saveVehiculo({
        id: editandoVehiculo?.id ?? generateId(),
        createdAt: editandoVehiculo?.createdAt ?? now,
        updatedAt: now,
        matricula: vehiculoForm.matricula.trim().toUpperCase(),
        nombre: vehiculoForm.nombre.trim() || undefined,
        activo: vehiculoForm.activo,
      });
      setShowVehiculoModal(false);
      await cargar();
      success(editandoVehiculo ? 'Vehículo actualizado' : 'Vehículo dado de alta');
    } catch (err) {
      toastError('No se pudo guardar el vehículo', err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  const handleEliminarVehiculo = async (v: Vehiculo) => {
    const gastosDelVehiculo = gastos.filter(g => g.vehiculoId === v.id).length;
    const aviso = gastosDelVehiculo > 0
      ? `¿Eliminar ${v.matricula}? Tiene ${gastosDelVehiculo} gastos imputados que se quedarán sin vehículo asignado.`
      : `¿Eliminar el vehículo ${v.matricula}?`;
    if (!confirm(aviso)) return;
    try {
      await deleteVehiculo(v.id);
      await cargar();
      success('Vehículo eliminado');
    } catch (err) {
      toastError('No se pudo eliminar', err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  if (!mounted) return <PageSkeleton />;

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <h1 className="page-title">Gastos</h1>
          <p className="page-subtitle">Lo que se paga y no es mercancía: alquiler, suministros, dietas.</p>
        </div>
        {activeTab === 'gastos' ? (
          <button type="button" className="btn btn-primary" onClick={abrirNuevoGasto}>
            <Plus size={16} /> Nuevo gasto
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={abrirNuevoVehiculo}>
            <Plus size={16} /> Nuevo vehículo
          </button>
        )}
      </div>

      {modoVehiculos && (
        <div className="tabs">
          <button type="button" className={`tab ${activeTab === 'gastos' ? 'active' : ''}`} onClick={() => setActiveTab('gastos')}>
            <Receipt size={15} /> Gastos
          </button>
          <button type="button" className={`tab ${activeTab === 'vehiculos' ? 'active' : ''}`} onClick={() => setActiveTab('vehiculos')}>
            <Car size={15} /> Vehículos
          </button>
        </div>
      )}

      {activeTab === 'gastos' && (
        <>
          <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
            <div className="form-row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: 2, minWidth: 220, margin: 0 }}>
                <label className="form-label">Buscar</label>
                <input
                  className="form-input"
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  placeholder="Concepto o proveedor…"
                />
              </div>
              <div className="form-group" style={{ flex: 1, minWidth: 160, margin: 0 }}>
                <label className="form-label">Categoría</label>
                <select
                  className="form-select"
                  value={filtroCategoria}
                  onChange={e => setFiltroCategoria(e.target.value as GastoCategoria | '')}
                >
                  <option value="">Todas</option>
                  {CATEGORIAS_GASTO.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ flex: 1, minWidth: 140, margin: 0 }}>
                <label className="form-label">Desde</label>
                <input type="date" className="form-input" value={filtroDesde} onChange={e => setFiltroDesde(e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: 1, minWidth: 140, margin: 0 }}>
                <label className="form-label">Hasta</label>
                <input type="date" className="form-input" value={filtroHasta} onChange={e => setFiltroHasta(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Concepto</th>
                    <th>Categoría</th>
                    <th>Proveedor</th>
                    {modoVehiculos && <th>Vehículo</th>}
                    <th style={{ textAlign: 'right' }}>Base</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th style={{ textAlign: 'right' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.length === 0 ? (
                    <TableEmpty
                      colSpan={modoVehiculos ? 8 : 7}
                      icon={Receipt}
                      title="No hay gastos registrados"
                      hint="Registra el alquiler, los suministros o cualquier otro pago que no sea mercancía."
                    />
                  ) : (
                    visibles.map(g => (
                      <tr key={g.id}>
                        <td>{formatDate(g.fecha)}</td>
                        <td><strong>{g.concepto}</strong></td>
                        <td><span className="badge badge-neutral">{CATEGORIAS_GASTO.find(c => c.value === g.categoria)?.label ?? g.categoria}</span></td>
                        <td>{g.proveedorNombre || '—'}</td>
                        {modoVehiculos && <td>{vehiculos.find(v => v.id === g.vehiculoId)?.matricula ?? '—'}</td>}
                        <td style={{ textAlign: 'right' }}>{formatCurrency(g.baseImponible)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatCurrency(g.total)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button type="button" className="btn btn-ghost btn-xs" onClick={() => abrirEditarGasto(g)} title="Editar">
                            <Edit2 size={14} />
                          </button>
                          <button type="button" className="btn btn-ghost btn-xs text-danger" onClick={() => handleEliminarGasto(g)} title="Eliminar">
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {visibles.length > 0 && (
                  <tfoot>
                    <tr>
                      <td colSpan={modoVehiculos ? 6 : 5} style={{ textAlign: 'right', fontWeight: 700 }}>Total</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatCurrency(total)}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </>
      )}

      {activeTab === 'vehiculos' && modoVehiculos && (
        <div className="card">
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Matrícula</th>
                  <th>Nombre</th>
                  <th>Estado</th>
                  <th style={{ textAlign: 'right' }}>Gasto imputado</th>
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {vehiculos.length === 0 ? (
                  <TableEmpty
                    colSpan={5}
                    icon={Car}
                    title="No hay vehículos dados de alta"
                    hint="Da de alta la furgoneta o el coche de empresa para imputarle su gasto."
                  />
                ) : (
                  vehiculos.map(v => (
                    <tr key={v.id}>
                      <td><strong>{v.matricula}</strong></td>
                      <td>{v.nombre || '—'}</td>
                      <td>
                        <span className={`badge ${v.activo ? 'badge-activo' : 'badge-inactivo'}`}>
                          {v.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatCurrency(costesPorVehiculo.get(v.id) ?? 0)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button type="button" className="btn btn-ghost btn-xs" onClick={() => abrirEditarVehiculo(v)} title="Editar">
                          <Edit2 size={14} />
                        </button>
                        <button type="button" className="btn btn-ghost btn-xs text-danger" onClick={() => handleEliminarVehiculo(v)} title="Eliminar">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL GASTO */}
      {showGastoModal && (
        <div className="modal-overlay" onClick={() => setShowGastoModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editandoGasto ? 'Editar gasto' : 'Nuevo gasto'}</h3>
              <button type="button" className="modal-close" onClick={() => setShowGastoModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleGuardarGasto}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label required">Fecha</label>
                    <input
                      type="date" className="form-input" required
                      value={gastoForm.fecha}
                      onChange={e => setGastoForm({ ...gastoForm, fecha: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Categoría</label>
                    <select
                      className="form-select"
                      value={gastoForm.categoria}
                      onChange={e => setGastoForm({ ...gastoForm, categoria: e.target.value as GastoCategoria })}
                    >
                      {CATEGORIAS_GASTO.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                </div>

                <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
                  <label className="form-label required">Concepto</label>
                  <input
                    type="text" className="form-input" required
                    value={gastoForm.concepto}
                    onChange={e => setGastoForm({ ...gastoForm, concepto: e.target.value })}
                    placeholder="Alquiler local agosto, factura de luz…"
                  />
                </div>

                <div className="form-row" style={{ marginTop: 'var(--space-4)' }}>
                  <div className="form-group">
                    <label className="form-label">Proveedor</label>
                    <select
                      className="form-select"
                      value={gastoForm.proveedorId ?? ''}
                      onChange={e => {
                        const prov = proveedores.find(p => p.id === e.target.value);
                        setGastoForm({ ...gastoForm, proveedorId: prov?.id, proveedorNombre: prov?.businessName });
                      }}
                    >
                      <option value="">— Sin proveedor —</option>
                      {proveedores.map(p => <option key={p.id} value={p.id}>{p.businessName}</option>)}
                    </select>
                  </div>
                  {modoVehiculos && (
                    <div className="form-group">
                      <label className="form-label">Vehículo</label>
                      <select
                        className="form-select"
                        value={gastoForm.vehiculoId ?? ''}
                        onChange={e => setGastoForm({ ...gastoForm, vehiculoId: e.target.value || undefined })}
                      >
                        <option value="">— Sin vehículo —</option>
                        {vehiculos.map(v => <option key={v.id} value={v.id}>{v.matricula}{v.nombre ? ` · ${v.nombre}` : ''}</option>)}
                      </select>
                    </div>
                  )}
                </div>

                {modoObras && (
                  <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
                    <label className="form-label">Obra o expediente</label>
                    <select
                      className="form-select"
                      value={gastoForm.obraId ?? ''}
                      onChange={e => setGastoForm({ ...gastoForm, obraId: e.target.value || undefined })}
                    >
                      <option value="">— Sin obra —</option>
                      {obras.filter(o => o.estado === 'abierta').map(o => <option key={o.id} value={o.id}>{o.numero} · {o.nombre}</option>)}
                    </select>
                  </div>
                )}

                <div className="form-row" style={{ marginTop: 'var(--space-4)' }}>
                  <div className="form-group">
                    <label className="form-label required">Base imponible</label>
                    <input
                      type="number" min={0} step={0.01} className="form-input" required
                      value={gastoForm.baseImponible}
                      onChange={e => actualizarBase(parseFloat(e.target.value) || 0, gastoForm.taxRate)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">IVA %</label>
                    <input
                      type="number" min={0} max={100} step={0.5} className="form-input"
                      value={gastoForm.taxRate}
                      onChange={e => actualizarBase(gastoForm.baseImponible, parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Total</label>
                    <input type="text" className="form-input" readOnly value={formatCurrency(gastoForm.total)} />
                  </div>
                </div>

                <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
                  <label className="form-label">Forma de pago</label>
                  <select
                    className="form-select"
                    value={gastoForm.paymentMethod}
                    onChange={e => setGastoForm({ ...gastoForm, paymentMethod: e.target.value as PaymentMethod })}
                  >
                    {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowGastoModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Guardar gasto</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL VEHÍCULO */}
      {showVehiculoModal && (
        <div className="modal-overlay" onClick={() => setShowVehiculoModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editandoVehiculo ? 'Editar vehículo' : 'Nuevo vehículo'}</h3>
              <button type="button" className="modal-close" onClick={() => setShowVehiculoModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleGuardarVehiculo}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label required">Matrícula</label>
                  <input
                    type="text" className="form-input" required
                    value={vehiculoForm.matricula}
                    onChange={e => setVehiculoForm({ ...vehiculoForm, matricula: e.target.value })}
                    placeholder="1234 ABC"
                  />
                </div>
                <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
                  <label className="form-label">Nombre</label>
                  <input
                    type="text" className="form-input"
                    value={vehiculoForm.nombre}
                    onChange={e => setVehiculoForm({ ...vehiculoForm, nombre: e.target.value })}
                    placeholder="Furgoneta reparto"
                  />
                </div>
                <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={vehiculoForm.activo}
                      onChange={e => setVehiculoForm({ ...vehiculoForm, activo: e.target.checked })}
                    />
                    <span style={{ fontWeight: 600 }}>Activo</span>
                  </label>
                </div>

                {editandoVehiculo && !editandoVehiculo.activo && (
                  <p className="modulos-nota" style={{ marginTop: 'var(--space-2)' }}>
                    <AlertTriangle size={11} /> Un vehículo inactivo sigue mostrando su gasto acumulado.
                  </p>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowVehiculoModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Guardar vehículo</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
