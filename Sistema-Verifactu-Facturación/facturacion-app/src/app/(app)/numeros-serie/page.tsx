'use client';

import { useState, useEffect, useMemo } from 'react';
import { Fingerprint, Plus, Trash2, X, AlertTriangle, Search, ShieldCheck } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import TableEmpty from '@/components/ui/TableEmpty';
import { getNumerosSerie, saveNumeroSerie, deleteNumeroSerie, getProducts, getClients, getProveedores } from '@/lib/storage';
import { buscarPorNumero, finGarantia, enGarantia, garantiasPorTerminar, venderNumero } from '@/lib/numerosSerie';
import { NumeroSerie, Product, Client } from '@/lib/types';
import { generateId, formatDate, getToday } from '@/lib/utils';
import { useToast } from '@/hooks/useToast';

type Tab = 'unidades' | 'buscar';

const unidadVacia = (): Omit<NumeroSerie, 'id' | 'createdAt' | 'updatedAt'> => ({
  productId: '', productRef: '', productName: '', numeroSerie: '',
  estado: 'en_stock', fechaEntrada: getToday(),
});

export default function NumerosSeriePage() {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('unidades');
  const [numeros, setNumeros] = useState<NumeroSerie[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [clientes, setClientes] = useState<Client[]>([]);
  const [proveedores, setProveedores] = useState<Client[]>([]);

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(unidadVacia());

  const [showVenderModal, setShowVenderModal] = useState<NumeroSerie | null>(null);
  const [ventaForm, setVentaForm] = useState({ clienteId: '', fechaVenta: getToday(), garantiaMeses: 24 });

  const [busqueda, setBusqueda] = useState('');
  const [encontrada, setEncontrada] = useState<NumeroSerie | null>(null);
  const [buscado, setBuscado] = useState(false);

  const { success, error: toastError } = useToast();

  const leer = () => Promise.all([getNumerosSerie(), getProducts(), getClients(), getProveedores()]);

  const cargar = async () => {
    const [n, p, c, prov] = await leer();
    setNumeros(n);
    setProducts(p);
    setClientes(c);
    setProveedores(prov);
  };

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const [n, p, c, prov] = await leer();
      if (!vivo) return;
      setNumeros(n);
      setProducts(p);
      setClientes(c);
      setProveedores(prov);
      setMounted(true);
    })();
    return () => { vivo = false; };
  }, []);

  const porVencer = useMemo(() => garantiasPorTerminar(numeros, 30), [numeros]);

  const buscar = () => {
    setBuscado(true);
    setEncontrada(buscarPorNumero(busqueda, numeros));
  };

  const abrirNueva = () => {
    setForm(unidadVacia());
    setShowModal(true);
  };

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.productId || !form.numeroSerie.trim()) {
      toastError('Falta el producto o el número de serie');
      return;
    }
    try {
      const now = new Date().toISOString();
      const producto = products.find(p => p.id === form.productId);
      await saveNumeroSerie({
        id: generateId(),
        createdAt: now,
        updatedAt: now,
        ...form,
        productRef: producto?.ref ?? '',
        productName: producto?.name ?? '',
      });
      setShowModal(false);
      await cargar();
      success('Unidad registrada', form.numeroSerie);
    } catch (err) {
      if (err instanceof Error && /duplicate|unique/i.test(err.message)) {
        toastError('Ese número de serie ya existe');
      } else {
        toastError('No se pudo guardar', err instanceof Error ? err.message : 'Error desconocido');
      }
    }
  };

  const abrirVender = (n: NumeroSerie) => {
    setVentaForm({ clienteId: '', fechaVenta: getToday(), garantiaMeses: 24 });
    setShowVenderModal(n);
  };

  const handleVender = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showVenderModal || !ventaForm.clienteId) {
      toastError('Falta el cliente');
      return;
    }
    const cliente = clientes.find(c => c.id === ventaForm.clienteId);
    if (!cliente) return;
    try {
      const vendida = venderNumero(
        { ...showVenderModal, garantiaMeses: ventaForm.garantiaMeses },
        { fechaVenta: ventaForm.fechaVenta, clienteId: cliente.id, clienteNombre: cliente.businessName, invoiceId: '' },
      );
      await saveNumeroSerie(vendida);
      setShowVenderModal(null);
      await cargar();
      success('Unidad vendida', showVenderModal.numeroSerie);
    } catch (err) {
      toastError('No se pudo registrar la venta', err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  const handleEliminar = async (n: NumeroSerie) => {
    if (!confirm(`¿Eliminar la unidad ${n.numeroSerie}?`)) return;
    try {
      await deleteNumeroSerie(n.id);
      await cargar();
      success('Unidad eliminada');
    } catch (err) {
      toastError('No se pudo eliminar', err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  if (!mounted) return <PageSkeleton />;

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Números de serie</h1>
          <p className="page-subtitle">Una unidad concreta, de principio a fin: de qué proveedor entró, a quién se vendió, hasta cuándo cubre la garantía.</p>
        </div>
        {activeTab === 'unidades' && (
          <button type="button" className="btn btn-primary" onClick={abrirNueva}>
            <Plus size={16} /> Nueva unidad
          </button>
        )}
      </div>

      <div className="tabs">
        <button type="button" className={`tab ${activeTab === 'unidades' ? 'active' : ''}`} onClick={() => setActiveTab('unidades')}>
          <Fingerprint size={15} /> Unidades
        </button>
        <button type="button" className={`tab ${activeTab === 'buscar' ? 'active' : ''}`} onClick={() => setActiveTab('buscar')}>
          <Search size={15} /> Buscar y garantía
        </button>
      </div>

      {activeTab === 'unidades' && (
        <>
          {porVencer.length > 0 && (
            <p className="rentabilidad-aviso" style={{ marginBottom: 'var(--space-4)' }}>
              <AlertTriangle size={14} />
              {porVencer.length === 1
                ? `La garantía de ${porVencer[0].numeroSerie} termina en menos de 30 días.`
                : `${porVencer.length} unidades terminan su garantía en menos de 30 días.`}
            </p>
          )}

          <div className="card">
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Número de serie</th>
                    <th>Producto</th>
                    <th>Estado</th>
                    <th>Cliente</th>
                    <th>Fin de garantía</th>
                    <th style={{ textAlign: 'right' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {numeros.length === 0 ? (
                    <TableEmpty
                      colSpan={6}
                      icon={Fingerprint}
                      title="No hay unidades registradas"
                      hint="Da de alta cada unidad al recibirla, con su número de serie."
                    />
                  ) : (
                    numeros.map(n => {
                      const fin = finGarantia(n);
                      return (
                        <tr key={n.id}>
                          <td className="mono"><strong>{n.numeroSerie}</strong></td>
                          <td>{n.productName}</td>
                          <td>
                            <span className={`badge ${n.estado === 'en_stock' ? 'badge-activo' : n.estado === 'vendido' ? 'badge-neutral' : 'badge-inactivo'}`}>
                              {n.estado === 'en_stock' ? 'En stock' : n.estado === 'vendido' ? 'Vendida' : 'Baja'}
                            </span>
                          </td>
                          <td>{n.clienteNombre || '—'}</td>
                          <td>
                            {fin ? formatDate(fin) : '—'}
                            {fin && !enGarantia(n) && n.estado === 'vendido' && (
                              <span className="badge badge-inactivo" style={{ marginLeft: 6 }}>Vencida</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {n.estado === 'en_stock' && (
                              <button type="button" className="btn btn-ghost btn-xs" onClick={() => abrirVender(n)} title="Vender">
                                <ShieldCheck size={14} />
                              </button>
                            )}
                            <button type="button" className="btn btn-ghost btn-xs text-danger" onClick={() => handleEliminar(n)} title="Eliminar">
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
        </>
      )}

      {activeTab === 'buscar' && (
        <div className="card">
          <p className="settings-section-subtitle" style={{ marginBottom: 'var(--space-3)' }}>
            Busca por el número de serie exacto: a quién se le vendió y si sigue en garantía.
          </p>
          <div className="form-row" style={{ alignItems: 'flex-end' }}>
            <div className="form-group" style={{ flex: 1, margin: 0 }}>
              <label className="form-label">Número de serie</label>
              <input
                type="text" className="form-input mono"
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && buscar()}
                placeholder="SN-4471"
              />
            </div>
            <button type="button" className="btn btn-primary" onClick={buscar}>
              <Search size={16} /> Buscar
            </button>
          </div>

          {buscado && !encontrada && (
            <p className="rentabilidad-aviso" style={{ marginTop: 'var(--space-4)' }}>
              <AlertTriangle size={14} /> No hay ninguna unidad con ese número.
            </p>
          )}

          {encontrada && (
            <div className="rentabilidad-totales" style={{ marginTop: 'var(--space-5)' }}>
              <div><span>Producto</span><strong>{encontrada.productName}</strong></div>
              <div><span>Estado</span><strong>{encontrada.estado === 'en_stock' ? 'En stock' : encontrada.estado === 'vendido' ? 'Vendida' : 'Baja'}</strong></div>
              <div><span>Cliente</span><strong>{encontrada.clienteNombre || '—'}</strong></div>
              <div>
                <span>Garantía</span>
                <strong className={enGarantia(encontrada) ? 'rentabilidad-bien' : 'rentabilidad-mal'}>
                  {finGarantia(encontrada) ? `Hasta ${formatDate(finGarantia(encontrada)!)}` : 'Sin garantía'}
                </strong>
              </div>
            </div>
          )}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Nueva unidad</h3>
              <button type="button" className="modal-close" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleGuardar}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label required">Producto</label>
                    <select
                      className="form-select" required
                      value={form.productId}
                      onChange={e => setForm({ ...form, productId: e.target.value })}
                    >
                      <option value="">Selecciona producto</option>
                      {products.map(p => <option key={p.id} value={p.id}>[{p.ref}] {p.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label required">Número de serie</label>
                    <input
                      type="text" className="form-input mono" required
                      value={form.numeroSerie}
                      onChange={e => setForm({ ...form, numeroSerie: e.target.value })}
                    />
                  </div>
                </div>
                <div className="form-row" style={{ marginTop: 'var(--space-4)' }}>
                  <div className="form-group">
                    <label className="form-label required">Fecha de entrada</label>
                    <input
                      type="date" className="form-input" required
                      value={form.fechaEntrada}
                      onChange={e => setForm({ ...form, fechaEntrada: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Proveedor</label>
                    <select
                      className="form-select"
                      value={form.proveedorId ?? ''}
                      onChange={e => {
                        const prov = proveedores.find(p => p.id === e.target.value);
                        setForm({ ...form, proveedorId: prov?.id, proveedorNombre: prov?.businessName });
                      }}
                    >
                      <option value="">— Sin especificar —</option>
                      {proveedores.map(p => <option key={p.id} value={p.id}>{p.businessName}</option>)}
                    </select>
                  </div>
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
                <button type="submit" className="btn btn-primary">Guardar unidad</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showVenderModal && (
        <div className="modal-overlay" onClick={() => setShowVenderModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Vender {showVenderModal.numeroSerie}</h3>
              <button type="button" className="modal-close" onClick={() => setShowVenderModal(null)}><X size={18} /></button>
            </div>
            <form onSubmit={handleVender}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label required">Cliente</label>
                  <select
                    className="form-select" required
                    value={ventaForm.clienteId}
                    onChange={e => setVentaForm({ ...ventaForm, clienteId: e.target.value })}
                  >
                    <option value="">Selecciona cliente</option>
                    {clientes.map(c => <option key={c.id} value={c.id}>{c.businessName}</option>)}
                  </select>
                </div>
                <div className="form-row" style={{ marginTop: 'var(--space-4)' }}>
                  <div className="form-group">
                    <label className="form-label required">Fecha de venta</label>
                    <input
                      type="date" className="form-input" required
                      value={ventaForm.fechaVenta}
                      onChange={e => setVentaForm({ ...ventaForm, fechaVenta: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Meses de garantía</label>
                    <input
                      type="number" min={0} step={1} className="form-input"
                      value={ventaForm.garantiaMeses}
                      onChange={e => setVentaForm({ ...ventaForm, garantiaMeses: parseInt(e.target.value, 10) || 0 })}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setShowVenderModal(null)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Registrar venta</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
