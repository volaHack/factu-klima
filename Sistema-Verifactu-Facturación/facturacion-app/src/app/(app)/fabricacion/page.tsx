'use client';

import { useState, useEffect, useMemo } from 'react';
import { Factory, Plus, Trash2, X, Edit2, Hammer, AlertTriangle } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import TableEmpty from '@/components/ui/TableEmpty';
import { getEscandallos, saveEscandallo, deleteEscandallo, getProducts, fabricar, getAlmacenes } from '@/lib/storage';
import { costeDeEscandallo, componentesFaltantes } from '@/lib/fabricacion';
import { Escandallo, ComponenteEscandallo, Product, Almacen } from '@/lib/types';
import { generateId, formatCurrency } from '@/lib/utils';
import { useToast } from '@/hooks/useToast';

const escandalloVacio = (): Omit<Escandallo, 'id' | 'createdAt' | 'updatedAt'> => ({
  productId: '', productRef: '', productName: '', componentes: [],
});

export default function FabricacionPage() {
  const [mounted, setMounted] = useState(false);
  const [escandallos, setEscandallos] = useState<Escandallo[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);

  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState<Escandallo | null>(null);
  const [form, setForm] = useState(escandalloVacio());

  const [showFabricarModal, setShowFabricarModal] = useState<Escandallo | null>(null);
  const [cantidadFabricar, setCantidadFabricar] = useState(1);
  const [almacenFabricar, setAlmacenFabricar] = useState('');

  const { success, error: toastError } = useToast();

  const leer = () => Promise.all([getEscandallos(), getProducts(), getAlmacenes()]);

  const cargar = async () => {
    const [e, p, a] = await leer();
    setEscandallos(e);
    setProducts(p);
    setAlmacenes(a);
  };

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const [e, p, a] = await leer();
      if (!vivo) return;
      setEscandallos(e);
      setProducts(p);
      setAlmacenes(a);
      setMounted(true);
    })();
    return () => { vivo = false; };
  }, []);

  const faltantesFabricar = useMemo(
    () => (showFabricarModal ? componentesFaltantes(showFabricarModal, products, cantidadFabricar) : []),
    [showFabricarModal, products, cantidadFabricar],
  );

  const abrirNuevo = () => {
    setEditando(null);
    setForm(escandalloVacio());
    setShowModal(true);
  };

  const abrirEditar = (e: Escandallo) => {
    setEditando(e);
    setForm(e);
    setShowModal(true);
  };

  const anadirComponente = () => setForm({
    ...form,
    componentes: [...form.componentes, { productId: '', productRef: '', productName: '', cantidad: 1 }],
  });

  const actualizarComponente = (i: number, cambio: Partial<ComponenteEscandallo>) => {
    const componentes = form.componentes.map((c, idx) => {
      if (idx !== i) return c;
      if (cambio.productId !== undefined) {
        const prod = products.find(p => p.id === cambio.productId);
        return { ...c, ...cambio, productRef: prod?.ref ?? '', productName: prod?.name ?? '' };
      }
      return { ...c, ...cambio };
    });
    setForm({ ...form, componentes });
  };

  const quitarComponente = (i: number) => setForm({ ...form, componentes: form.componentes.filter((_, idx) => idx !== i) });

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.productId) {
      toastError('Falta el producto que se fabrica');
      return;
    }
    if (form.componentes.length === 0 || form.componentes.some(c => !c.productId)) {
      toastError('Añade al menos un componente, todos con producto elegido');
      return;
    }
    try {
      const now = new Date().toISOString();
      const producto = products.find(p => p.id === form.productId);
      await saveEscandallo({
        id: editando?.id ?? generateId(),
        createdAt: editando?.createdAt ?? now,
        updatedAt: now,
        ...form,
        productRef: producto?.ref ?? '',
        productName: producto?.name ?? '',
      });
      setShowModal(false);
      await cargar();
      success(editando ? 'Escandallo actualizado' : 'Escandallo creado', producto?.name);
    } catch (err) {
      if (err instanceof Error && /duplicate|unique/i.test(err.message)) {
        toastError('Ese producto ya tiene un escandallo. Edítalo en vez de crear otro.');
      } else {
        toastError('No se pudo guardar', err instanceof Error ? err.message : 'Error desconocido');
      }
    }
  };

  const handleEliminar = async (e: Escandallo) => {
    if (!confirm(`¿Eliminar el escandallo de «${e.productName}»?`)) return;
    try {
      await deleteEscandallo(e.id);
      await cargar();
      success('Escandallo eliminado');
    } catch (err) {
      toastError('No se pudo eliminar', err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  const abrirFabricar = (e: Escandallo) => {
    setCantidadFabricar(1);
    setAlmacenFabricar(almacenes.find(a => a.principal)?.id ?? almacenes[0]?.id ?? '');
    setShowFabricarModal(e);
  };

  const handleFabricar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showFabricarModal || cantidadFabricar <= 0) return;
    try {
      await fabricar(showFabricarModal.id, cantidadFabricar, almacenFabricar || undefined);
      setShowFabricarModal(null);
      await cargar();
      success(`${cantidadFabricar} unidades fabricadas`, showFabricarModal.productName);
    } catch (err) {
      toastError('No se pudo fabricar', err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  if (!mounted) return <PageSkeleton />;

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Fabricación</h1>
          <p className="page-subtitle">Qué componentes consume cada artículo fabricado, y cuánto cuesta producirlo.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={abrirNuevo}>
          <Plus size={16} /> Nuevo escandallo
        </button>
      </div>

      <div className="card">
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Producto fabricado</th>
                <th style={{ textAlign: 'right' }}>Componentes</th>
                <th style={{ textAlign: 'right' }}>Coste por unidad</th>
                <th style={{ textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {escandallos.length === 0 ? (
                <TableEmpty
                  colSpan={4}
                  icon={Factory}
                  title="No hay escandallos"
                  hint="Crea la receta de un producto fabricado: de qué componentes sale y cuántos hacen falta."
                />
              ) : (
                escandallos.map(e => (
                  <tr key={e.id}>
                    <td><strong>{e.productName}</strong></td>
                    <td style={{ textAlign: 'right' }}>{e.componentes.length}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatCurrency(costeDeEscandallo(e, products))}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button type="button" className="btn btn-ghost btn-xs" onClick={() => abrirFabricar(e)} title="Fabricar">
                        <Hammer size={14} />
                      </button>
                      <button type="button" className="btn btn-ghost btn-xs" onClick={() => abrirEditar(e)} title="Editar">
                        <Edit2 size={14} />
                      </button>
                      <button type="button" className="btn btn-ghost btn-xs text-danger" onClick={() => handleEliminar(e)} title="Eliminar">
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

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editando ? 'Editar escandallo' : 'Nuevo escandallo'}</h3>
              <button type="button" className="modal-close" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleGuardar}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label required">Producto que se fabrica</label>
                  <select
                    className="form-select" required disabled={!!editando}
                    value={form.productId}
                    onChange={e => setForm({ ...form, productId: e.target.value })}
                  >
                    <option value="">Selecciona producto</option>
                    {products.map(p => <option key={p.id} value={p.id}>[{p.ref}] {p.name}</option>)}
                  </select>
                </div>

                <div style={{ marginTop: 'var(--space-4)' }}>
                  <label className="form-label">Componentes</label>
                  {form.componentes.map((c, i) => (
                    <div key={i} className="form-row" style={{ marginTop: 'var(--space-2)', alignItems: 'flex-end' }}>
                      <div className="form-group" style={{ flex: 2 }}>
                        <label className="form-label">Producto</label>
                        <select
                          className="form-select"
                          value={c.productId}
                          onChange={e => actualizarComponente(i, { productId: e.target.value })}
                        >
                          <option value="">Selecciona producto</option>
                          {products.filter(p => p.id !== form.productId).map(p => (
                            <option key={p.id} value={p.id}>[{p.ref}] {p.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group" style={{ flex: 1 }}>
                        <label className="form-label">Cantidad</label>
                        <input
                          type="number" min={0} step={0.01} className="form-input"
                          value={c.cantidad}
                          onChange={e => actualizarComponente(i, { cantidad: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => quitarComponente(i)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 'var(--space-2)' }} onClick={anadirComponente}>
                    <Plus size={14} /> Añadir componente
                  </button>
                </div>

                <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
                  <label className="form-label">Coste adicional por unidad (mano de obra, energía…)</label>
                  <input
                    type="number" min={0} step={0.01} className="form-input"
                    value={form.costeAdicional ?? ''}
                    onChange={e => setForm({ ...form, costeAdicional: e.target.value === '' ? undefined : parseFloat(e.target.value) })}
                  />
                </div>

                <p className="rentabilidad-totales" style={{ marginTop: 'var(--space-4)' }}>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Coste calculado por unidad</span>
                    <strong style={{ fontSize: 'var(--text-lg)' }}>{formatCurrency(costeDeEscandallo({ ...form, id: '', createdAt: '', updatedAt: '' }, products))}</strong>
                  </span>
                </p>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Guardar escandallo</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showFabricarModal && (
        <div className="modal-overlay" onClick={() => setShowFabricarModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Fabricar {showFabricarModal.productName}</h3>
              <button type="button" className="modal-close" onClick={() => setShowFabricarModal(null)}><X size={18} /></button>
            </div>
            <form onSubmit={handleFabricar}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label required">Unidades a fabricar</label>
                    <input
                      type="number" min={1} step={1} className="form-input" required
                      value={cantidadFabricar}
                      onChange={e => setCantidadFabricar(parseInt(e.target.value, 10) || 0)}
                    />
                  </div>
                  {almacenes.length > 0 && (
                    <div className="form-group">
                      <label className="form-label">Almacén</label>
                      <select className="form-select" value={almacenFabricar} onChange={e => setAlmacenFabricar(e.target.value)}>
                        {almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                      </select>
                    </div>
                  )}
                </div>

                <p style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                  Coste total: <strong>{formatCurrency(costeDeEscandallo(showFabricarModal, products) * cantidadFabricar)}</strong>
                </p>

                {faltantesFabricar.length > 0 && (
                  <div className="rentabilidad-aviso" style={{ marginTop: 'var(--space-3)' }}>
                    <AlertTriangle size={14} />
                    <div>
                      <p style={{ margin: 0 }}>No hay existencias suficientes de:</p>
                      <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                        {faltantesFabricar.map(f => (
                          <li key={f.productId}>{f.productName}: faltan {f.faltan} (hay {f.disponible}, hacen falta {f.necesario})</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowFabricarModal(null)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">
                  <Hammer size={14} /> Fabricar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
