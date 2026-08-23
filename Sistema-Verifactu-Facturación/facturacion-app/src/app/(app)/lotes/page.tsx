'use client';

import { useState, useEffect, useMemo } from 'react';
import { Boxes, Plus, Trash2, X, AlertTriangle, Search, ShieldAlert } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import TableEmpty from '@/components/ui/TableEmpty';
import { getLotes, saveLote, deleteLote, getProducts, getInvoices, getProveedores } from '@/lib/storage';
import { trazabilidadDeLote, resumenDeLote, lotesCaducando, diasHastaCaducidad } from '@/lib/lotes';
import { Lote, Product, Invoice, Client } from '@/lib/types';
import { generateId, formatCurrency, formatDate, getToday } from '@/lib/utils';
import { useToast } from '@/hooks/useToast';

type Tab = 'lotes' | 'trazabilidad';

const loteVacio = (): Omit<Lote, 'id' | 'createdAt' | 'updatedAt'> => ({
  productId: '', productRef: '', productName: '', codigo: '',
  fechaEntrada: getToday(), cantidadEntrada: 0, cantidadDisponible: 0,
});

export default function LotesPage() {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('lotes');
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [proveedores, setProveedores] = useState<Client[]>([]);

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(loteVacio());

  // Trazabilidad: la búsqueda que responde a una alerta sanitaria.
  const [busquedaCodigo, setBusquedaCodigo] = useState('');
  const [loteEncontrado, setLoteEncontrado] = useState<Lote | null>(null);
  const [buscado, setBuscado] = useState(false);

  const { success, error: toastError } = useToast();

  const leer = () => Promise.all([getLotes(), getProducts(), getInvoices(), getProveedores()]);

  const cargar = async () => {
    const [l, p, inv, prov] = await leer();
    setLotes(l);
    setProducts(p);
    setInvoices(inv);
    setProveedores(prov);
  };

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const [l, p, inv, prov] = await leer();
      if (!vivo) return;
      setLotes(l);
      setProducts(p);
      setInvoices(inv);
      setProveedores(prov);
      setMounted(true);
    })();
    return () => { vivo = false; };
  }, []);

  const caducando = useMemo(() => lotesCaducando(lotes, 7), [lotes]);

  const buscar = () => {
    const codigo = busquedaCodigo.trim().toLowerCase();
    setBuscado(true);
    setLoteEncontrado(codigo ? lotes.find(l => l.codigo.toLowerCase() === codigo) ?? null : null);
  };

  const entregasDelBuscado = useMemo(
    () => (loteEncontrado ? trazabilidadDeLote(loteEncontrado.id, invoices) : []),
    [loteEncontrado, invoices],
  );
  const resumenDelBuscado = useMemo(
    () => (loteEncontrado ? resumenDeLote(loteEncontrado.id, invoices) : null),
    [loteEncontrado, invoices],
  );

  const abrirNuevo = () => {
    setForm(loteVacio());
    setShowModal(true);
  };

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.productId || !form.codigo.trim()) {
      toastError('Falta el producto o el código de lote');
      return;
    }
    try {
      const now = new Date().toISOString();
      const producto = products.find(p => p.id === form.productId);
      await saveLote({
        id: generateId(),
        createdAt: now,
        updatedAt: now,
        ...form,
        productRef: producto?.ref ?? '',
        productName: producto?.name ?? '',
        cantidadDisponible: form.cantidadEntrada,
      });
      setShowModal(false);
      await cargar();
      success('Lote registrado', form.codigo);
    } catch (err) {
      toastError('No se pudo guardar', err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  const handleEliminar = async (l: Lote) => {
    if (!confirm(`¿Eliminar el lote ${l.codigo}? Las facturas que lo llevan asignado conservarán su código como referencia.`)) return;
    try {
      await deleteLote(l.id);
      await cargar();
      success('Lote eliminado');
    } catch (err) {
      toastError('No se pudo eliminar', err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  if (!mounted) return <PageSkeleton />;

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Lotes y trazabilidad</h1>
          <p className="page-subtitle">Qué lote se vendió a quién. Es lo que responde a una alerta sanitaria.</p>
        </div>
        {activeTab === 'lotes' && (
          <button type="button" className="btn btn-primary" onClick={abrirNuevo}>
            <Plus size={16} /> Nuevo lote
          </button>
        )}
      </div>

      <div className="tabs">
        <button type="button" className={`tab ${activeTab === 'lotes' ? 'active' : ''}`} onClick={() => setActiveTab('lotes')}>
          <Boxes size={15} /> Lotes
        </button>
        <button type="button" className={`tab ${activeTab === 'trazabilidad' ? 'active' : ''}`} onClick={() => setActiveTab('trazabilidad')}>
          <ShieldAlert size={15} /> Trazabilidad
        </button>
      </div>

      {activeTab === 'lotes' && (
        <>
          {caducando.length > 0 && (
            <p className="rentabilidad-aviso" style={{ marginBottom: 'var(--space-4)' }}>
              <AlertTriangle size={14} />
              {caducando.length === 1
                ? `El lote ${caducando[0].codigo} caduca en los próximos 7 días.`
                : `${caducando.length} lotes caducan en los próximos 7 días.`}
            </p>
          )}

          <div className="card">
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Producto</th>
                    <th>Entrada</th>
                    <th>Caducidad</th>
                    <th style={{ textAlign: 'right' }}>Entrada</th>
                    <th style={{ textAlign: 'right' }}>Disponible</th>
                    <th style={{ textAlign: 'right' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {lotes.length === 0 ? (
                    <TableEmpty
                      colSpan={7}
                      icon={Boxes}
                      title="No hay lotes registrados"
                      hint="Da de alta un lote al recibir mercancía de un producto que se controle por lotes."
                    />
                  ) : (
                    lotes.map(l => {
                      const dias = diasHastaCaducidad(l);
                      return (
                        <tr key={l.id}>
                          <td className="mono"><strong>{l.codigo}</strong></td>
                          <td>{l.productName}</td>
                          <td>{formatDate(l.fechaEntrada)}</td>
                          <td>
                            {l.fechaCaducidad ? formatDate(l.fechaCaducidad) : '—'}
                            {dias !== null && dias < 0 && l.cantidadDisponible > 0 && (
                              <span className="badge badge-inactivo" style={{ marginLeft: 6 }}>Caducado</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'right' }}>{l.cantidadEntrada}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>{l.cantidadDisponible}</td>
                          <td style={{ textAlign: 'right' }}>
                            <button type="button" className="btn btn-ghost btn-xs text-danger" onClick={() => handleEliminar(l)} title="Eliminar">
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

      {activeTab === 'trazabilidad' && (
        <div className="card">
          <p className="settings-section-subtitle" style={{ marginBottom: 'var(--space-3)' }}>
            Busca por el código de lote y verás a qué clientes se les ha servido algo de él, con la fecha y la cantidad de cada entrega.
          </p>
          <div className="form-row" style={{ alignItems: 'flex-end' }}>
            <div className="form-group" style={{ flex: 1, margin: 0 }}>
              <label className="form-label">Código de lote</label>
              <input
                type="text" className="form-input mono"
                value={busquedaCodigo}
                onChange={e => setBusquedaCodigo(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && buscar()}
                placeholder="L-4471"
              />
            </div>
            <button type="button" className="btn btn-primary" onClick={buscar}>
              <Search size={16} /> Buscar
            </button>
          </div>

          {buscado && !loteEncontrado && (
            <p className="rentabilidad-aviso" style={{ marginTop: 'var(--space-4)' }}>
              <AlertTriangle size={14} /> No hay ningún lote con ese código.
            </p>
          )}

          {loteEncontrado && (
            <div style={{ marginTop: 'var(--space-5)' }}>
              <div className="rentabilidad-totales" style={{ marginBottom: 'var(--space-4)' }}>
                <div><span>Producto</span><strong>{loteEncontrado.productName}</strong></div>
                <div><span>Clientes servidos</span><strong>{resumenDelBuscado?.clientes ?? 0}</strong></div>
                <div><span>Unidades entregadas</span><strong>{resumenDelBuscado?.unidades ?? 0}</strong></div>
                <div><span>Quedan en almacén</span><strong>{loteEncontrado.cantidadDisponible}</strong></div>
              </div>

              <div className="table-responsive">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Factura</th>
                      <th>Cliente</th>
                      <th style={{ textAlign: 'right' }}>Cantidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entregasDelBuscado.length === 0 ? (
                      <TableEmpty colSpan={4} icon={ShieldAlert} title="Este lote no se ha servido a ningún cliente todavía" />
                    ) : (
                      entregasDelBuscado.map(e => (
                        <tr key={`${e.invoiceId}-${e.clientId}`}>
                          <td>{formatDate(e.fecha)}</td>
                          <td className="mono">{e.number}</td>
                          <td><strong>{e.clientName}</strong></td>
                          <td style={{ textAlign: 'right' }}>{e.cantidad}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Nuevo lote</h3>
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
                    <label className="form-label required">Código de lote</label>
                    <input
                      type="text" className="form-input mono" required
                      value={form.codigo}
                      onChange={e => setForm({ ...form, codigo: e.target.value })}
                      placeholder="El que trae el proveedor"
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
                    <label className="form-label">Fecha de caducidad</label>
                    <input
                      type="date" className="form-input"
                      value={form.fechaCaducidad ?? ''}
                      onChange={e => setForm({ ...form, fechaCaducidad: e.target.value || undefined })}
                    />
                  </div>
                </div>

                <div className="form-row" style={{ marginTop: 'var(--space-4)' }}>
                  <div className="form-group">
                    <label className="form-label required">Cantidad recibida</label>
                    <input
                      type="number" min={0} step={1} className="form-input" required
                      value={form.cantidadEntrada || ''}
                      onChange={e => setForm({ ...form, cantidadEntrada: parseFloat(e.target.value) || 0 })}
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
                <button type="submit" className="btn btn-primary">Guardar lote</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
