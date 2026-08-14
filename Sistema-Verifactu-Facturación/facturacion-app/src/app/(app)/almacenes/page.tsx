'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Warehouse, ArrowLeftRight, ClipboardCheck, Plus, Edit2, Trash2,
  CheckCircle2, AlertTriangle, Search, MapPin, Package, ArrowRight,
  TrendingDown, TrendingUp, RefreshCw, Layers
} from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import TableEmpty from '@/components/ui/TableEmpty';
import {
  getAlmacenes, saveAlmacen, deleteAlmacen, ensureDefaultAlmacen,
  getProducts, getTraspasos, saveTraspaso, getRegularizaciones,
  saveRegularizacion,
} from '@/lib/storage';
import {
  Almacen, Product, TraspasoAlmacen, TraspasoLineItem, RegularizacionStock,
  UnitOfMeasure,
} from '@/lib/types';
import { generateId, formatDate, getToday } from '@/lib/utils';
import { useToast } from '@/hooks/useToast';

type Tab = 'almacenes' | 'existencias' | 'traspasos' | 'regularizaciones';

export default function AlmacenesPage() {
  const [activeTab, setActiveTab] = useState<Tab>('almacenes');
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);

  const [almacenes, setAlmacenes] = useState<Almacen[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [traspasos, setTraspasos] = useState<TraspasoAlmacen[]>([]);
  const [regularizaciones, setRegularizaciones] = useState<RegularizacionStock[]>([]);

  // Búsqueda y filtros
  const [searchTerm, setSearchTerm] = useState('');

  // Modales
  const [showAlmacenModal, setShowAlmacenModal] = useState(false);
  const [editingAlmacen, setEditingAlmacen] = useState<Almacen | null>(null);
  const [almacenForm, setAlmacenForm] = useState({
    codigo: '',
    nombre: '',
    direccion: '',
    principal: false,
    activo: true,
  });

  const [showTraspasoModal, setShowTraspasoModal] = useState(false);
  const [traspasoForm, setTraspasoForm] = useState<{
    origenAlmacenId: string;
    destinoAlmacenId: string;
    fecha: string;
    notas: string;
    lineItems: { productId: string; quantity: number }[];
  }>({
    origenAlmacenId: '',
    destinoAlmacenId: '',
    fecha: getToday(),
    notas: '',
    lineItems: [{ productId: '', quantity: 1 }],
  });

  const [showRegModal, setShowRegModal] = useState(false);
  const [regForm, setRegForm] = useState({
    almacenId: '',
    productId: '',
    stockReal: 0,
    motivo: 'Recuento periódico de inventario',
    notas: '',
  });

  const { success, error: toastError } = useToast();

  const loadData = async () => {
    setLoading(true);
    try {
      await ensureDefaultAlmacen();
      const [allAlms, allProds, allTraspasos, allRegs] = await Promise.all([
        getAlmacenes(),
        getProducts(),
        getTraspasos(),
        getRegularizaciones(),
      ]);
      setAlmacenes(allAlms);
      setProducts(allProds);
      setTraspasos(allTraspasos);
      setRegularizaciones(allRegs);
    } catch {
      toastError('Error al cargar datos de almacenes');
    } finally {
      setLoading(false);
      setMounted(true);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // --- HANDLERS ALMACÉN ---
  const handleOpenAlmacenModal = (alm?: Almacen) => {
    if (alm) {
      setEditingAlmacen(alm);
      setAlmacenForm({
        codigo: alm.codigo,
        nombre: alm.nombre,
        direccion: alm.direccion || '',
        principal: alm.principal,
        activo: alm.activo,
      });
    } else {
      setEditingAlmacen(null);
      setAlmacenForm({
        codigo: `ALM-0${almacenes.length + 1}`,
        nombre: '',
        direccion: '',
        principal: almacenes.length === 0,
        activo: true,
      });
    }
    setShowAlmacenModal(true);
  };

  const handleSaveAlmacen = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!almacenForm.codigo.trim() || !almacenForm.nombre.trim()) {
      toastError('Código y nombre son obligatorios');
      return;
    }

    try {
      const now = new Date().toISOString();
      const id = editingAlmacen ? editingAlmacen.id : generateId();

      // Si se marca como principal, desmarcar los demás
      if (almacenForm.principal) {
        for (const a of almacenes) {
          if (a.id !== id && a.principal) {
            await saveAlmacen({ ...a, principal: false });
          }
        }
      }

      const item: Almacen = {
        id,
        codigo: almacenForm.codigo.trim().toUpperCase(),
        nombre: almacenForm.nombre.trim(),
        direccion: almacenForm.direccion.trim() || undefined,
        principal: almacenForm.principal,
        activo: almacenForm.activo,
        createdAt: editingAlmacen ? editingAlmacen.createdAt : now,
        updatedAt: now,
      };

      await saveAlmacen(item);
      success(`Almacén "${item.nombre}" guardado`);
      setShowAlmacenModal(false);
      await loadData();
    } catch {
      toastError('Error al guardar el almacén');
    }
  };

  const handleDeleteAlmacen = async (id: string, nombre: string) => {
    if (almacenes.length <= 1) {
      toastError('Debe existir al menos un almacén en el sistema');
      return;
    }
    if (!confirm(`¿Eliminar el almacén "${nombre}"?`)) return;

    try {
      await deleteAlmacen(id);
      success(`Almacén "${nombre}" eliminado`);
      await loadData();
    } catch {
      toastError('Error al eliminar almacén');
    }
  };

  // --- HANDLERS TRASPASO ---
  const handleOpenTraspasoModal = () => {
    const orig = almacenes[0]?.id || '';
    const dest = almacenes[1]?.id || almacenes[0]?.id || '';
    setTraspasoForm({
      origenAlmacenId: orig,
      destinoAlmacenId: dest,
      fecha: getToday(),
      notas: '',
      lineItems: [{ productId: products[0]?.id || '', quantity: 1 }],
    });
    setShowTraspasoModal(true);
  };

  const handleAddTraspasoLine = () => {
    setTraspasoForm(prev => ({
      ...prev,
      lineItems: [...prev.lineItems, { productId: products[0]?.id || '', quantity: 1 }],
    }));
  };

  const handleRemoveTraspasoLine = (idx: number) => {
    setTraspasoForm(prev => ({
      ...prev,
      lineItems: prev.lineItems.filter((_, i) => i !== idx),
    }));
  };

  const handleSaveTraspaso = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!traspasoForm.origenAlmacenId || !traspasoForm.destinoAlmacenId) {
      toastError('Selecciona almacén de origen y destino');
      return;
    }
    if (traspasoForm.origenAlmacenId === traspasoForm.destinoAlmacenId) {
      toastError('El almacén de origen y destino deben ser diferentes');
      return;
    }
    const validLines = traspasoForm.lineItems.filter(l => l.productId && l.quantity > 0);
    if (validLines.length === 0) {
      toastError('Añade al menos un producto con cantidad mayor a 0');
      return;
    }

    try {
      const orig = almacenes.find(a => a.id === traspasoForm.origenAlmacenId);
      const dest = almacenes.find(a => a.id === traspasoForm.destinoAlmacenId);
      const now = new Date().toISOString();

      const lineItems: TraspasoLineItem[] = validLines.map(vl => {
        const prod = products.find(p => p.id === vl.productId);
        return {
          id: generateId(),
          productId: vl.productId,
          productName: prod?.name || 'Producto',
          productRef: prod?.ref || '',
          quantity: Number(vl.quantity),
          unit: prod?.unit || UnitOfMeasure.UNIDAD,
        };
      });

      const traspaso: TraspasoAlmacen = {
        id: generateId(),
        number: `TRP-${new Date().getFullYear()}-${String(traspasos.length + 1).padStart(4, '0')}`,
        origenAlmacenId: traspasoForm.origenAlmacenId,
        origenAlmacenNombre: orig?.nombre || 'Origen',
        destinoAlmacenId: traspasoForm.destinoAlmacenId,
        destinoAlmacenNombre: dest?.nombre || 'Destino',
        fecha: traspasoForm.fecha,
        lineItems,
        notas: traspasoForm.notas || undefined,
        createdAt: now,
        updatedAt: now,
      };

      await saveTraspaso(traspaso);
      success(`Traspaso ${traspaso.number} realizado con éxito`);
      setShowTraspasoModal(false);
      await loadData();
    } catch {
      toastError('Error al guardar el traspaso');
    }
  };

  // --- HANDLERS REGULARIZACIÓN ---
  const handleOpenRegModal = (prodId?: string, almId?: string) => {
    const selectedAlm = almId || almacenes[0]?.id || '';
    const selectedProd = prodId || products[0]?.id || '';
    const prod = products.find(p => p.id === selectedProd);
    const stockActual = prod?.stocksByAlmacen?.[selectedAlm] ?? (prod?.stockQuantity ?? 0);

    setRegForm({
      almacenId: selectedAlm,
      productId: selectedProd,
      stockReal: stockActual,
      motivo: 'Recuento periódico de inventario',
      notas: '',
    });
    setShowRegModal(true);
  };

  const selectedProdForReg = useMemo(
    () => products.find(p => p.id === regForm.productId),
    [products, regForm.productId]
  );

  const stockTeoricoReg = useMemo(() => {
    if (!selectedProdForReg) return 0;
    return selectedProdForReg.stocksByAlmacen?.[regForm.almacenId] ?? (selectedProdForReg.stockQuantity ?? 0);
  }, [selectedProdForReg, regForm.almacenId]);

  const diferenciaReg = useMemo(() => {
    return Number(regForm.stockReal) - Number(stockTeoricoReg);
  }, [regForm.stockReal, stockTeoricoReg]);

  const handleSaveRegularizacion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regForm.almacenId || !regForm.productId) {
      toastError('Selecciona almacén y producto');
      return;
    }

    try {
      const alm = almacenes.find(a => a.id === regForm.almacenId);
      const prod = products.find(p => p.id === regForm.productId);
      if (!alm || !prod) return;

      const reg: RegularizacionStock = {
        id: generateId(),
        fecha: getToday(),
        almacenId: alm.id,
        almacenNombre: alm.nombre,
        productId: prod.id,
        productName: prod.name,
        productRef: prod.ref,
        stockTeorico: stockTeoricoReg,
        stockReal: Number(regForm.stockReal),
        diferencia: diferenciaReg,
        motivo: regForm.motivo,
        notas: regForm.notas || undefined,
        createdAt: new Date().toISOString(),
      };

      await saveRegularizacion(reg);
      success(`Stock regularizado a ${reg.stockReal} unidades en ${alm.nombre}`);
      setShowRegModal(false);
      await loadData();
    } catch {
      toastError('Error al regularizar stock');
    }
  };

  // Filtrado de productos para la tabla de existencias
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const match = `${p.name} ${p.ref} ${p.category} ${p.supplierRef || ''}`.toLowerCase();
      return match.includes(searchTerm.toLowerCase());
    });
  }, [products, searchTerm]);

  if (!mounted || loading) return <PageSkeleton />;

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Warehouse size={28} color="var(--color-primary)" /> Control de Almacenes y Stock
          </h1>
          <p className="page-subtitle">Multi-localización, movimientos entre almacenes y regularizaciones de inventario</p>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {activeTab === 'almacenes' && (
            <button className="btn btn-primary" onClick={() => handleOpenAlmacenModal()}>
              <Plus size={16} /> Nuevo Almacén
            </button>
          )}
          {activeTab === 'traspasos' && (
            <button className="btn btn-primary" onClick={handleOpenTraspasoModal}>
              <ArrowLeftRight size={16} /> Nuevo Traspaso
            </button>
          )}
          {activeTab === 'regularizaciones' && (
            <button className="btn btn-primary" onClick={() => handleOpenRegModal()}>
              <ClipboardCheck size={16} /> Ajustar Inventario
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ display: 'flex', gap: 'var(--space-2)', borderBottom: '1px solid var(--color-border)', marginBottom: 'var(--space-4)' }}>
        <button
          className={`tab-btn ${activeTab === 'almacenes' ? 'active' : ''}`}
          onClick={() => setActiveTab('almacenes')}
          style={{
            padding: 'var(--space-3) var(--space-4)',
            borderBottom: activeTab === 'almacenes' ? '2px solid var(--color-primary)' : 'none',
            fontWeight: activeTab === 'almacenes' ? 600 : 400,
            color: activeTab === 'almacenes' ? 'var(--color-primary)' : 'var(--color-text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            cursor: 'pointer',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
          }}
        >
          <Warehouse size={16} /> Almacenes ({almacenes.length})
        </button>

        <button
          className={`tab-btn ${activeTab === 'existencias' ? 'active' : ''}`}
          onClick={() => setActiveTab('existencias')}
          style={{
            padding: 'var(--space-3) var(--space-4)',
            borderBottom: activeTab === 'existencias' ? '2px solid var(--color-primary)' : 'none',
            fontWeight: activeTab === 'existencias' ? 600 : 400,
            color: activeTab === 'existencias' ? 'var(--color-primary)' : 'var(--color-text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            cursor: 'pointer',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
          }}
        >
          <Layers size={16} /> Existencias por Almacén
        </button>

        <button
          className={`tab-btn ${activeTab === 'traspasos' ? 'active' : ''}`}
          onClick={() => setActiveTab('traspasos')}
          style={{
            padding: 'var(--space-3) var(--space-4)',
            borderBottom: activeTab === 'traspasos' ? '2px solid var(--color-primary)' : 'none',
            fontWeight: activeTab === 'traspasos' ? 600 : 400,
            color: activeTab === 'traspasos' ? 'var(--color-primary)' : 'var(--color-text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            cursor: 'pointer',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
          }}
        >
          <ArrowLeftRight size={16} /> Traspasos ({traspasos.length})
        </button>

        <button
          className={`tab-btn ${activeTab === 'regularizaciones' ? 'active' : ''}`}
          onClick={() => setActiveTab('regularizaciones')}
          style={{
            padding: 'var(--space-3) var(--space-4)',
            borderBottom: activeTab === 'regularizaciones' ? '2px solid var(--color-primary)' : 'none',
            fontWeight: activeTab === 'regularizaciones' ? 600 : 400,
            color: activeTab === 'regularizaciones' ? 'var(--color-primary)' : 'var(--color-text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            cursor: 'pointer',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
          }}
        >
          <ClipboardCheck size={16} /> Regularizaciones ({regularizaciones.length})
        </button>
      </div>

      {/* CONTENIDO TAB 1: ALMACENES */}
      {activeTab === 'almacenes' && (
        <div className="card">
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Nombre</th>
                  <th>Ubicación / Dirección</th>
                  <th>Principal</th>
                  <th>Estado</th>
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {almacenes.map(alm => (
                  <tr key={alm.id}>
                    <td>
                      <span className="badge badge-neutral" style={{ fontWeight: 600 }}>{alm.codigo}</span>
                    </td>
                    <td>
                      <strong>{alm.nombre}</strong>
                    </td>
                    <td>
                      {alm.direccion ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-text-muted)' }}>
                          <MapPin size={14} /> {alm.direccion}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                      )}
                    </td>
                    <td>
                      {alm.principal ? (
                        <span className="badge badge-success">Principal</span>
                      ) : (
                        <span style={{ color: 'var(--color-text-muted)' }}>Secundario</span>
                      )}
                    </td>
                    <td>
                      {alm.activo ? (
                        <span className="badge badge-info">Activo</span>
                      ) : (
                        <span className="badge badge-danger">Inactivo</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-1)' }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          title="Editar"
                          onClick={() => handleOpenAlmacenModal(alm)}
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          className="btn btn-ghost btn-sm text-danger"
                          title="Eliminar"
                          onClick={() => handleDeleteAlmacen(alm.id, alm.nombre)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CONTENIDO TAB 2: EXISTENCIAS POR ALMACÉN */}
      {activeTab === 'existencias' && (
        <div className="card">
          <div className="filter-bar" style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
            <div className="search-box" style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
              <Search size={16} style={{ position: 'absolute', left: 12, top: 10, color: 'var(--color-text-muted)' }} />
              <input
                type="text"
                className="form-input"
                style={{ paddingLeft: 36 }}
                placeholder="Buscar por nombre, ref..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            <button className="btn btn-outline btn-sm" onClick={() => handleOpenRegModal()}>
              <ClipboardCheck size={14} /> Ajuste Rápido de Stock
            </button>
          </div>

          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Ref.</th>
                  <th>Producto</th>
                  <th>PMP (Coste)</th>
                  <th style={{ textAlign: 'right' }}>Stock Total</th>
                  {almacenes.map(alm => (
                    <th key={alm.id} style={{ textAlign: 'right' }}>
                      {alm.nombre} {alm.principal && '★'}
                    </th>
                  ))}
                  <th style={{ textAlign: 'right' }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.length === 0 ? (
                  <TableEmpty
                    colSpan={5 + almacenes.length}
                    icon={Package}
                    title="No hay productos para mostrar"
                    hint="Prueba a cambiar el texto de búsqueda o añade nuevos productos."
                  />
                ) : (
                  filteredProducts.map(p => (
                    <tr key={p.id}>
                      <td><code>{p.ref}</code></td>
                      <td>
                        <strong>{p.name}</strong>
                        {p.supplierRef && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                            Ref. Prov: {p.supplierRef}
                          </div>
                        )}
                      </td>
                      <td>
                        {p.costePmp ? `${p.costePmp.toFixed(2)} €` : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>
                        <span className={`badge ${(p.stockQuantity ?? 0) <= (p.lowStockThreshold ?? 0) ? 'badge-danger' : 'badge-neutral'}`}>
                          {p.stockQuantity ?? 0} {p.unit}
                        </span>
                      </td>
                      {almacenes.map(alm => {
                        const stockEnAlm = p.stocksByAlmacen?.[alm.id] ?? 0;
                        return (
                          <td key={alm.id} style={{ textAlign: 'right' }}>
                            <span style={{ fontWeight: stockEnAlm > 0 ? 600 : 400, color: stockEnAlm > 0 ? 'inherit' : 'var(--color-text-muted)' }}>
                              {stockEnAlm} {p.unit}
                            </span>
                          </td>
                        );
                      })}
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          title="Ajustar inventario"
                          onClick={() => handleOpenRegModal(p.id)}
                        >
                          <ClipboardCheck size={14} /> Ajustar
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

      {/* CONTENIDO TAB 3: TRASPASOS */}
      {activeTab === 'traspasos' && (
        <div className="card">
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Nº Traspaso</th>
                  <th>Fecha</th>
                  <th>Origen</th>
                  <th>Destino</th>
                  <th>Líneas / Productos</th>
                  <th>Notas</th>
                </tr>
              </thead>
              <tbody>
                {traspasos.length === 0 ? (
                  <TableEmpty
                    colSpan={6}
                    icon={ArrowLeftRight}
                    title="No se han registrado traspasos"
                    hint="Realiza un movimiento de mercancía entre almacenes usando el botón superior."
                  />
                ) : (
                  traspasos.map(trp => (
                    <tr key={trp.id}>
                      <td><strong>{trp.number}</strong></td>
                      <td>{formatDate(trp.fecha)}</td>
                      <td>
                        <span className="badge badge-neutral">{trp.origenAlmacenNombre}</span>
                      </td>
                      <td>
                        <span className="badge badge-info">{trp.destinoAlmacenNombre}</span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {trp.lineItems.map((li, i) => (
                            <span key={i} style={{ fontSize: '0.825rem' }}>
                              • {li.productName}: <strong>{li.quantity} {li.unit || 'ud'}</strong>
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <span style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                          {trp.notas || '—'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CONTENIDO TAB 4: REGULARIZACIONES */}
      {activeTab === 'regularizaciones' && (
        <div className="card">
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Almacén</th>
                  <th>Producto</th>
                  <th style={{ textAlign: 'right' }}>Stock Previo</th>
                  <th style={{ textAlign: 'right' }}>Stock Real</th>
                  <th style={{ textAlign: 'right' }}>Diferencia</th>
                  <th>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {regularizaciones.length === 0 ? (
                  <TableEmpty
                    colSpan={7}
                    icon={ClipboardCheck}
                    title="No hay regularizaciones de inventario"
                    hint="Registra recuentos o ajustes de stock cuando existan mermas o diferencias físicas."
                  />
                ) : (
                  regularizaciones.map(reg => (
                    <tr key={reg.id}>
                      <td>{formatDate(reg.fecha)}</td>
                      <td>
                        <span className="badge badge-neutral">{reg.almacenNombre}</span>
                      </td>
                      <td>
                        <strong>{reg.productName}</strong>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{reg.productRef}</div>
                      </td>
                      <td style={{ textAlign: 'right' }}>{reg.stockTeorico}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{reg.stockReal}</td>
                      <td style={{ textAlign: 'right' }}>
                        {reg.diferencia > 0 ? (
                          <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                            <TrendingUp size={12} /> +{reg.diferencia}
                          </span>
                        ) : reg.diferencia < 0 ? (
                          <span className="badge badge-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                            <TrendingDown size={12} /> {reg.diferencia}
                          </span>
                        ) : (
                          <span className="badge badge-neutral">0</span>
                        )}
                      </td>
                      <td>
                        <div>{reg.motivo}</div>
                        {reg.notas && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{reg.notas}</div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL ALMACÉN */}
      {showAlmacenModal && (
        <div className="modal-backdrop">
          <div className="modal card" style={{ maxWidth: 480 }}>
            <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>
              {editingAlmacen ? 'Editar Almacén' : 'Nuevo Almacén'}
            </h3>
            <form onSubmit={handleSaveAlmacen}>
              <div className="form-row">
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Código *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={almacenForm.codigo}
                    onChange={e => setAlmacenForm({ ...almacenForm, codigo: e.target.value })}
                    placeholder="ALM-01"
                    required
                  />
                </div>
                <div className="form-group" style={{ flex: 2 }}>
                  <label className="form-label">Nombre *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={almacenForm.nombre}
                    onChange={e => setAlmacenForm({ ...almacenForm, nombre: e.target.value })}
                    placeholder="Almacén Central / Tienda"
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Dirección / Ubicación</label>
                <input
                  type="text"
                  className="form-input"
                  value={almacenForm.direccion}
                  onChange={e => setAlmacenForm({ ...almacenForm, direccion: e.target.value })}
                  placeholder="Calle o nave física"
                />
              </div>

              <div className="form-row" style={{ marginTop: 'var(--space-3)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={almacenForm.principal}
                    onChange={e => setAlmacenForm({ ...almacenForm, principal: e.target.checked })}
                  />
                  <span>Almacén Principal por defecto</span>
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowAlmacenModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Guardar Almacén
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL TRASPASO */}
      {showTraspasoModal && (
        <div className="modal-backdrop">
          <div className="modal card" style={{ maxWidth: 640 }}>
            <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>
              Nuevo Traspaso entre Almacenes
            </h3>
            <form onSubmit={handleSaveTraspaso}>
              <div className="form-row">
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Almacén Origen (Salida) *</label>
                  <select
                    className="form-select"
                    value={traspasoForm.origenAlmacenId}
                    onChange={e => setTraspasoForm({ ...traspasoForm, origenAlmacenId: e.target.value })}
                    required
                  >
                    {almacenes.map(a => (
                      <option key={a.id} value={a.id}>{a.nombre} ({a.codigo})</option>
                    ))}
                  </select>
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Almacén Destino (Entrada) *</label>
                  <select
                    className="form-select"
                    value={traspasoForm.destinoAlmacenId}
                    onChange={e => setTraspasoForm({ ...traspasoForm, destinoAlmacenId: e.target.value })}
                    required
                  >
                    {almacenes.map(a => (
                      <option key={a.id} value={a.id}>{a.nombre} ({a.codigo})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Fecha del traspaso</label>
                <input
                  type="date"
                  className="form-input"
                  value={traspasoForm.fecha}
                  onChange={e => setTraspasoForm({ ...traspasoForm, fecha: e.target.value })}
                  required
                />
              </div>

              <div style={{ marginTop: 'var(--space-3)', marginBottom: 'var(--space-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label className="form-label" style={{ margin: 0 }}>Productos a Traspasar</label>
                <button type="button" className="btn btn-ghost btn-sm" onClick={handleAddTraspasoLine}>
                  <Plus size={14} /> Añadir producto
                </button>
              </div>

              {traspasoForm.lineItems.map((line, idx) => {
                const prod = products.find(p => p.id === line.productId);
                const stockEnOrigen = prod?.stocksByAlmacen?.[traspasoForm.origenAlmacenId] ?? (prod?.stockQuantity ?? 0);

                return (
                  <div key={idx} className="form-row" style={{ alignItems: 'flex-end', marginBottom: 'var(--space-2)' }}>
                    <div className="form-group" style={{ flex: 3, margin: 0 }}>
                      <select
                        className="form-select"
                        value={line.productId}
                        onChange={e => {
                          const val = e.target.value;
                          const next = [...traspasoForm.lineItems];
                          next[idx].productId = val;
                          setTraspasoForm({ ...traspasoForm, lineItems: next });
                        }}
                        required
                      >
                        {products.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.ref})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group" style={{ flex: 1, margin: 0 }}>
                      <input
                        type="number"
                        min="1"
                        step="any"
                        className="form-input"
                        value={line.quantity}
                        onChange={e => {
                          const val = Number(e.target.value);
                          const next = [...traspasoForm.lineItems];
                          next[idx].quantity = val;
                          setTraspasoForm({ ...traspasoForm, lineItems: next });
                        }}
                        placeholder="Cant."
                        required
                      />
                    </div>

                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', minWidth: 90, paddingBottom: 8 }}>
                      Stock disp: {stockEnOrigen}
                    </div>

                    {traspasoForm.lineItems.length > 1 && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm text-danger"
                        onClick={() => handleRemoveTraspasoLine(idx)}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                );
              })}

              <div className="form-group" style={{ marginTop: 'var(--space-3)' }}>
                <label className="form-label">Notas / Motivo del traspaso</label>
                <textarea
                  className="form-textarea"
                  rows={2}
                  value={traspasoForm.notas}
                  onChange={e => setTraspasoForm({ ...traspasoForm, notas: e.target.value })}
                  placeholder="Información adicional..."
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowTraspasoModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Confirmar Traspaso
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL REGULARIZACIÓN */}
      {showRegModal && (
        <div className="modal-backdrop">
          <div className="modal card" style={{ maxWidth: 500 }}>
            <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>
              Ajuste de Inventario / Regularización
            </h3>
            <form onSubmit={handleSaveRegularizacion}>
              <div className="form-group">
                <label className="form-label">Almacén a ajustar *</label>
                <select
                  className="form-select"
                  value={regForm.almacenId}
                  onChange={e => setRegForm({ ...regForm, almacenId: e.target.value })}
                  required
                >
                  {almacenes.map(a => (
                    <option key={a.id} value={a.id}>{a.nombre} ({a.codigo})</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Producto *</label>
                <select
                  className="form-select"
                  value={regForm.productId}
                  onChange={e => setRegForm({ ...regForm, productId: e.target.value })}
                  required
                >
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.ref})</option>
                  ))}
                </select>
              </div>

              <div className="form-row" style={{ background: 'var(--color-bg-subtle)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-3)' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Stock Teórico</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{stockTeoricoReg} {selectedProdForReg?.unit}</div>
                </div>

                <div style={{ flex: 1 }}>
                  <label className="form-label" style={{ margin: 0 }}>Stock Real Contado *</label>
                  <input
                    type="number"
                    step="any"
                    className="form-input"
                    value={regForm.stockReal}
                    onChange={e => setRegForm({ ...regForm, stockReal: Number(e.target.value) })}
                    required
                  />
                </div>

                <div style={{ flex: 1, textAlign: 'right' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Diferencia</div>
                  <div style={{
                    fontSize: '1.25rem',
                    fontWeight: 700,
                    color: diferenciaReg > 0 ? 'var(--color-success)' : diferenciaReg < 0 ? 'var(--color-danger)' : 'inherit'
                  }}>
                    {diferenciaReg > 0 ? `+${diferenciaReg}` : diferenciaReg}
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Motivo del ajuste</label>
                <select
                  className="form-select"
                  value={regForm.motivo}
                  onChange={e => setRegForm({ ...regForm, motivo: e.target.value })}
                >
                  <option value="Recuento periódico de inventario">Recuento periódico de inventario</option>
                  <option value="Rotura o desperfecto">Rotura o desperfecto</option>
                  <option value="Merma o pérdida">Merma o pérdida</option>
                  <option value="Caducidad">Caducidad</option>
                  <option value="Entrada no registrada">Entrada no registrada</option>
                  <option value="Corrección de error">Corrección de error</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Observaciones</label>
                <textarea
                  className="form-textarea"
                  rows={2}
                  value={regForm.notas}
                  onChange={e => setRegForm({ ...regForm, notas: e.target.value })}
                  placeholder="Detalles sobre el recuento o causa..."
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowRegModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Aplicar Ajuste de Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
