'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Plus, Search, SearchX, Edit, Trash2, X, Check, Tag, Sparkles, Package,
  BarChart3, Layers, AlertCircle, ArrowUpDown, Filter, Store, ChevronRight, ImagePlus, ImageOff
} from 'lucide-react';
import CategoryIcon from '@/components/ui/CategoryIcon';
import PageSkeleton from '@/components/ui/PageSkeleton';
import TableEmpty from '@/components/ui/TableEmpty';
import ChartCard from '@/components/charts/ChartCard';
import { RankedBars, StatusDonut, ChartLegend } from '@/components/charts/Charts';
import { resolveAccent } from '@/components/charts/theme';
import {
  getProducts, saveProduct as persistProduct, deleteProduct as removeProduct,
  getCompanyCategories, addCustomCategory, deleteCustomCategory, updateCustomCategory, getCompanySettings,
  getInvoices,
} from '@/lib/storage';
import { Product, TaxRate, UnitOfMeasure, CompanySettings, Invoice } from '@/lib/types';
import { formatCurrency, generateId, processImageFile } from '@/lib/utils';
import { UNITS_OF_MEASURE, ICON_PRESETS, getTaxLabel, getDefaultTaxRate } from '@/lib/constants';
import { calcularPendientesProducto } from '@/lib/documentos';
import TaxRateSlider from '@/components/ui/TaxRateSlider';
import { useToast } from '@/hooks/useToast';

interface CategoryOption {
  value: string;
  label: string;
  icon: string;
  isCustom?: boolean;
}

export default function ProductosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [mounted, setMounted] = useState(false);
  
  // Tabs: 'products' | 'categories'
  const [activeTab, setActiveTab] = useState<'products' | 'categories'>('products');
  
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');

  // Product modal
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  // Category CRUD modal
  const [showCatModal, setShowCatModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryOption | null>(null);
  const [catName, setCatName] = useState('');
  const [catIcon, setCatIcon] = useState('Package');
  const [savingCat, setSavingCat] = useState(false);

  const { success, warning, error: toastError } = useToast();

  const [form, setForm] = useState({
    ref: '', supplierRef: '', name: '', description: '', category: 'otros',
    unitPrice: 0, defaultTaxRate: TaxRate.REDUCIDO as TaxRate, unit: UnitOfMeasure.KG as UnitOfMeasure,
    active: true, stockQuantity: 100, lowStockThreshold: 10, imageUrl: '',
    tarifaPrices: {} as Record<string, number>,
    costePmp: 0,
    costeUltimaCompra: 0,
  });

  const imageInputRef = useRef<HTMLInputElement>(null);

  const updateForm = (field: string, value: unknown) => {
    setForm(prev => ({
      ...prev,
      [field]: typeof prev[field as keyof typeof prev] === 'number' ? Number(value) : value
    }));
  };

  const updateTarifaPrice = (tarifaId: string, price: number) => {
    setForm(prev => ({
      ...prev,
      tarifaPrices: {
        ...prev.tarifaPrices,
        [tarifaId]: price,
      }
    }));
  };

  const handlePickImage = async (file?: File | null) => {
    if (!file) return;
    try {
      const dataUrl = await processImageFile(file);
      updateForm('imageUrl', dataUrl);
    } catch (err) {
      toastError('No se pudo cargar la imagen', err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  const loadData = async () => {
    const [prods, cats, sett, invs] = await Promise.all([
      getProducts(),
      getCompanyCategories(),
      getCompanySettings(),
      getInvoices(),
    ]);
    setProducts(prods);
    setCategories(cats);
    setSettings(sett);
    setInvoices(invs);
  };

  useEffect(() => {
    (async () => {
      await loadData();
      setMounted(true);
    })();
  }, []);

  const reloadProducts = async () => setProducts(await getProducts());
  const reloadCategories = async () => setCategories(await getCompanyCategories());

  // Filtered Products
  const filteredProducts = useMemo(() => {
    let result = [...products];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.ref.toLowerCase().includes(q) ||
        (p.supplierRef && p.supplierRef.toLowerCase().includes(q)) ||
        p.description.toLowerCase().includes(q)
      );
    }
    if (categoryFilter) result = result.filter(p => p.category === categoryFilter);
    return result;
  }, [products, search, categoryFilter]);

  // Product CRUD
  const openCreateProduct = () => {
    setEditing(null);
    const defaultCat = categories.length > 0 ? categories[0].value : 'otros';
    setForm({
      ref: `PRD-${String(products.length + 1).padStart(3, '0')}`,
      supplierRef: '',
      name: '', description: '', category: defaultCat,
      unitPrice: 0, defaultTaxRate: getDefaultTaxRate(settings), unit: UnitOfMeasure.UNIDAD, active: true,
      stockQuantity: 50, lowStockThreshold: 5, imageUrl: '',
      tarifaPrices: {},
      costePmp: 0,
      costeUltimaCompra: 0,
    });
    setShowModal(true);
  };

  const openEditProduct = (p: Product) => {
    setEditing(p);
    setForm({
      ref: p.ref,
      supplierRef: p.supplierRef || '',
      name: p.name,
      description: p.description,
      category: p.category,
      unitPrice: p.unitPrice,
      defaultTaxRate: p.defaultTaxRate,
      unit: p.unit,
      active: p.active,
      stockQuantity: p.stockQuantity ?? 50,
      lowStockThreshold: p.lowStockThreshold ?? 5,
      imageUrl: p.imageUrl || '',
      tarifaPrices: p.tarifaPrices || {},
      costePmp: p.costePmp ?? 0,
      costeUltimaCompra: p.costeUltimaCompra ?? 0,
    });
    setShowModal(true);
  };

  const handleSaveProduct = async () => {
    if (!form.name || !form.ref) return;
    const product: Product = {
      id: editing?.id || generateId(),
      ...form,
      costePmp: Number(form.costePmp || 0),
      costeUltimaCompra: Number(form.costeUltimaCompra || 0),
      supplierRef: form.supplierRef.trim() || undefined,
      imageUrl: form.imageUrl || undefined,
      createdAt: editing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    try {
      await persistProduct(product);
      await reloadProducts();
      setShowModal(false);
      success(editing ? 'Producto actualizado' : 'Producto creado', form.name);
    } catch (err) {
      toastError('No se pudo guardar el producto', err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  const handleDeleteProduct = async (p: Product) => {
    if (confirm(`¿Eliminar "${p.name}"?`)) {
      await removeProduct(p.id);
      await reloadProducts();
      success('Producto eliminado', p.name);
    }
  };

  // Category CRUD
  const openCreateCategory = () => {
    setEditingCategory(null);
    setCatName('');
    setCatIcon('Package');
    setShowCatModal(true);
  };

  const openEditCategory = (cat: CategoryOption) => {
    setEditingCategory(cat);
    setCatName(cat.label);
    setCatIcon(cat.icon);
    setShowCatModal(true);
  };

  const handleSaveCategory = async () => {
    if (!catName.trim()) return;
    setSavingCat(true);
    try {
      if (editingCategory) {
        await updateCustomCategory(editingCategory.value, catName.trim(), catIcon);
        success('Categoría actualizada', catName.trim());
      } else {
        const added = await addCustomCategory(catName.trim(), catIcon);
        success('Categoría creada', added.label);
      }
      await reloadCategories();
      setShowCatModal(false);
    } catch (err) {
      toastError('Error', 'No se pudo guardar la categoría');
    } finally {
      setSavingCat(false);
    }
  };

  const handleDeleteCategory = async (cat: CategoryOption) => {
    if (cat.value === 'otros') {
      warning('No se puede eliminar', '"Otros" es la categoría de respaldo del sistema.');
      return;
    }

    const linkedProducts = products.filter(p => p.category === cat.value);
    const confirmMsg = linkedProducts.length > 0
      ? `¿Eliminar la categoría "${cat.label}"? Hay ${linkedProducts.length} producto(s) asignado(s) a esta categoría. Se moverán a "otros".`
      : `¿Eliminar la categoría "${cat.label}"?`;

    if (!confirm(confirmMsg)) return;

    try {
      await deleteCustomCategory(cat.value);
      for (const p of linkedProducts) {
        await persistProduct({ ...p, category: 'otros' });
      }
      await reloadCategories();
      await reloadProducts();
      warning('Categoría eliminada', cat.label);
    } catch (err) {
      toastError('Error', 'No se pudo eliminar la categoría');
    }
  };

  const getCategoryInfo = (catValue: string) => {
    return categories.find(c => c.value === catValue) || { label: catValue, icon: 'Package' };
  };

  // Analytics Recharts Data with complete table support
  const accent = useMemo(() => resolveAccent(), []);

  const categoryDistributionData = useMemo(() => {
    const colors = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#3b82f6', '#14b8a6'];
    return categories.map((cat, idx) => {
      const count = products.filter(p => p.category === cat.value).length;
      return {
        name: cat.label,
        value: count,
        color: colors[idx % colors.length]
      };
    }).filter(c => c.value > 0);
  }, [products, categories]);

  const categoryStockValueData = useMemo(() => {
    return categories.map(cat => {
      const catProducts = products.filter(p => p.category === cat.value);
      const totalVal = catProducts.reduce((sum, p) => sum + (p.unitPrice * (p.stockQuantity ?? 1)), 0);
      return {
        name: cat.label,
        total: Number(totalVal.toFixed(2)),
        count: catProducts.length
      };
    }).filter(c => c.total > 0).sort((a, b) => b.total - a.total);
  }, [products, categories]);

  if (!mounted) {
    return <PageSkeleton variant="list" label="Cargando Productos y Categorías" />;
  }

  const totalInventoryValue = products.reduce((sum, p) => sum + (p.unitPrice * (p.stockQuantity ?? 1)), 0);

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <p className="page-eyebrow"><Package /> Catálogo e Inventario</p>
          <h1 className="page-title">Productos y Categorías</h1>
          {products.length > 0 && (
            <div className="page-meta">
              <span className="page-meta-item">
                <span className="page-meta-value">{products.length}</span>
                <span className="page-meta-label">referencias</span>
              </span>
              <span className="page-meta-item">
                <span className="page-meta-value is-success">{categories.length}</span>
                <span className="page-meta-label">categorías</span>
              </span>
              <span className="page-meta-item">
                <span className="page-meta-value">{formatCurrency(totalInventoryValue)}</span>
                <span className="page-meta-label">valor stock</span>
              </span>
            </div>
          )}
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={openCreateCategory}>
            <Tag size={16} /> Nueva categoría
          </button>
          <button className="btn btn-primary" onClick={openCreateProduct}>
            <Plus size={16} /> Nuevo producto
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="tab-bar">
        <button
          className={`btn ${activeTab === 'products' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveTab('products')}
        >
          <Package size={16} /> Catálogo de Productos ({products.length})
        </button>
        <button
          className={`btn ${activeTab === 'categories' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveTab('categories')}
        >
          <Layers size={16} /> Gestión de Categorías ({categories.length})
        </button>
      </div>

      {/* TAB 1: PRODUCTOS */}
      {activeTab === 'products' && (
        <>
          {/* Integrated Recharts Analytics Block */}
          {products.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 'var(--space-5)', marginBottom: 'var(--space-6)' }}>
              <ChartCard
                title="Valor Monetario del Stock por Categoría"
                subtitle="Inversión acumulada en inventario por familia de producto"
                height={220}
                isEmpty={categoryStockValueData.length === 0}
                emptyLabel="Sin datos de productos"
                tableColumns={[
                  { key: 'name', label: 'Categoría' },
                  { key: 'count', label: 'Productos', align: 'right' },
                  { key: 'total', label: 'Valor Stock', align: 'right', format: (v: unknown) => formatCurrency(Number(v)) },
                ]}
                tableRows={categoryStockValueData}
              >
                <RankedBars data={categoryStockValueData} color={accent} />
              </ChartCard>

              <ChartCard
                title="Distribución de Productos"
                subtitle="Número de referencias registradas en cada categoría"
                height={220}
                isEmpty={categoryDistributionData.length === 0}
                emptyLabel="Sin datos"
                tableColumns={[
                  { key: 'name', label: 'Categoría' },
                  { key: 'value', label: 'Número de Productos', align: 'right' },
                ]}
                tableRows={categoryDistributionData}
                legend={
                  <ChartLegend
                    items={categoryDistributionData.map(c => ({
                      name: c.name,
                      value: `${c.value} productos`,
                      color: c.color
                    }))}
                  />
                }
              >
                <StatusDonut
                  data={categoryDistributionData}
                  centerLabel="Categorías"
                  centerValue={String(categoryDistributionData.length)}
                />
              </ChartCard>
            </div>
          )}

          {/* Filters Bar */}
          <div className="filters-bar">
            <div className="search-bar" style={{ maxWidth: 320 }}>
              <div className="search-bar-icon"><Search size={16} /></div>
              <input
                type="text"
                placeholder="Buscar por nombre, ref o descripción..."
                aria-label="Buscar productos"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            <div className="cluster-sm" style={{ flexWrap: 'wrap' }}>
              <button
                className={`filter-chip ${!categoryFilter ? 'active' : ''}`}
                onClick={() => setCategoryFilter('')}
              >
                Todas las categorías
              </button>
              {categories.map(cat => {
                const count = products.filter(p => p.category === cat.value).length;
                return (
                  <button
                    key={cat.value}
                    className={`filter-chip ${categoryFilter === cat.value ? 'active' : ''}`}
                    onClick={() => setCategoryFilter(categoryFilter === cat.value ? '' : cat.value)}
                  >
                    <CategoryIcon name={cat.icon} size={14} /> {cat.label} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          {/* Table */}
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Ref.</th>
                  <th>Ref. Proveedor</th>
                  <th>Producto</th>
                  <th>Categoría</th>
                  <th style={{ textAlign: 'right' }}>Precio Ud.</th>
                  <th style={{ textAlign: 'right' }}>PMP (Coste)</th>
                  <th>Stock Actual</th>
                  <th>Pdt. Recibir</th>
                  <th>Pdt. Entregar</th>
                  <th>IVA/IGIC</th>
                  <th>Estado</th>
                  <th style={{ width: 100 }}></th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map(p => {
                  const cat = getCategoryInfo(p.category);
                  const isLowStock = p.lowStockThreshold != null && (p.stockQuantity ?? 0) <= p.lowStockThreshold;
                  const isOutOfStock = (p.stockQuantity ?? 0) <= 0;
                  const { pendienteRecibir, pendienteEntregar } = calcularPendientesProducto(p.id, invoices);

                  return (
                    <tr key={p.id}>
                      <td className="mono">{p.ref}</td>
                      <td>
                        {p.supplierRef ? (
                          <span className="mono" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                            {p.supplierRef}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>-</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                          {p.imageUrl ? (
                            <img
                              src={p.imageUrl}
                              alt=""
                              style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 'var(--radius-sm)', background: 'var(--bg-tertiary)', flexShrink: 0 }}
                            />
                          ) : (
                            <span style={{ width: 32, height: 32, borderRadius: 'var(--radius-sm)', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <ImageOff size={15} style={{ color: 'var(--text-tertiary)' }} />
                            </span>
                          )}
                          <div>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{p.name}</div>
                            {p.description && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{p.description}</div>}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-neutral" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <CategoryIcon name={cat.icon} size={13} />
                          {cat.label}
                        </span>
                      </td>
                      <td className="mono font-bold" style={{ textAlign: 'right' }}>
                        {formatCurrency(p.unitPrice)}
                      </td>
                      <td className="mono" style={{ textAlign: 'right', color: p.costePmp ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
                        {p.costePmp ? formatCurrency(p.costePmp) : '—'}
                      </td>
                      <td>
                        <span className={`badge ${isOutOfStock ? 'badge-danger' : isLowStock ? 'badge-warning' : 'badge-success'}`}>
                          {p.stockQuantity ?? 0} {p.unit}
                        </span>
                      </td>
                      <td>
                        {pendienteRecibir > 0 ? (
                          <span className="badge badge-warning" title="Unidades solicitadas en pedidos de compra pendientes">
                            +{pendienteRecibir} {p.unit}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>0</span>
                        )}
                      </td>
                      <td>
                        {pendienteEntregar > 0 ? (
                          <span className="badge badge-info" title="Unidades comprometidas en pedidos de venta pendientes">
                            -{pendienteEntregar} {p.unit}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>0</span>
                        )}
                      </td>
                      <td>{p.defaultTaxRate}%</td>
                      <td>
                        <span className={`badge ${p.active ? 'badge-success' : 'badge-neutral'}`}>
                          {p.active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                          <button className="btn btn-ghost btn-xs" onClick={() => openEditProduct(p)} title="Editar">
                            <Edit size={14} />
                          </button>
                          <button className="btn btn-ghost btn-xs" onClick={() => handleDeleteProduct(p)} title="Eliminar">
                            <Trash2 size={14} style={{ color: 'var(--color-danger)' }} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredProducts.length === 0 && (
                  <TableEmpty
                    colSpan={12}
                    icon={SearchX}
                    title="No hay productos que coincidan"
                    hint="Prueba a cambiar el texto de búsqueda o el filtro de categoría."
                  />
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* TAB 2: CATEGORÍAS */}
      {activeTab === 'categories' && (
        <div>
          <div className="kpi-grid" style={{ marginBottom: 'var(--space-6)' }}>
            {categories.map(cat => {
              const catProds = products.filter(p => p.category === cat.value);
              const val = catProds.reduce((sum, p) => sum + (p.unitPrice * (p.stockQuantity ?? 1)), 0);

              return (
                <div key={cat.value} className="kpi-card" style={{ padding: 'var(--space-5)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                      <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-lg)', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <CategoryIcon name={cat.icon} size={20} />
                      </div>
                      <div>
                        <h4 style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--text-primary)' }}>{cat.label}</h4>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{cat.value}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-ghost btn-xs" onClick={() => openEditCategory(cat)} title="Editar">
                        <Edit size={14} />
                      </button>
                      {cat.value !== 'otros' && (
                        <button className="btn btn-ghost btn-xs" onClick={() => handleDeleteCategory(cat)} title="Eliminar">
                          <Trash2 size={14} style={{ color: 'var(--color-danger)' }} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-4)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--border-color)' }}>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>{catProds.length} productos</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', fontWeight: 800, color: 'var(--text-primary)' }}>
                      {formatCurrency(val)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal Crear / Editar Producto */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editing ? 'Editar Producto' : 'Nuevo Producto'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label required">Referencia / Código</label>
                  <input className="form-input mono" value={form.ref} onChange={e => updateForm('ref', e.target.value)} placeholder="PRD-001" />
                </div>
                <div className="form-group">
                  <label className="form-label">Referencia del Proveedor</label>
                  <input className="form-input mono" value={form.supplierRef} onChange={e => updateForm('supplierRef', e.target.value)} placeholder="Ej: PROV-REF-99" />
                </div>
              </div>

              <div className="form-row" style={{ marginTop: 'var(--space-4)' }}>
                <div className="form-group" style={{ flex: '2 1 240px' }}>
                  <label className="form-label required">Nombre del producto</label>
                  <input className="form-input" value={form.name} onChange={e => updateForm('name', e.target.value)} placeholder="Ej: Aceite de Oliva 1L" />
                </div>
                <div className="form-group" style={{ flex: '1 1 140px' }}>
                  <label className="form-label">Categoría</label>
                  <select className="form-select" value={form.category} onChange={e => updateForm('category', e.target.value)}>
                    {categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-row" style={{ marginTop: 'var(--space-4)' }}>
                <div className="form-group">
                  <label className="form-label">Precio Unitario Base (€)</label>
                  <input className="form-input" type="number" step="0.01" value={form.unitPrice} onChange={e => updateForm('unitPrice', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Unidad de Medida</label>
                  <select className="form-select" value={form.unit} onChange={e => updateForm('unit', e.target.value)}>
                    {UNITS_OF_MEASURE.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Matriz de Precios por Tarifa si existen tarifas configuradas */}
              {settings?.tarifas && settings.tarifas.length > 0 && (
                <div style={{ marginTop: 'var(--space-4)', background: 'var(--bg-tertiary)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)' }}>
                  <label className="form-label" style={{ marginBottom: 'var(--space-2)', fontWeight: 700 }}>
                    Precios específicos por Tarifa (€)
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 'var(--space-3)' }}>
                    {settings.tarifas.map(t => (
                      <div key={t.id} className="form-group" style={{ margin: 0 }}>
                        <label style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                          {t.nombre} {t.porcentajeDefecto !== undefined ? `(${t.porcentajeDefecto > 0 ? `+${t.porcentajeDefecto}%` : `${t.porcentajeDefecto}%`})` : ''}
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          className="form-input"
                          placeholder={t.porcentajeDefecto ? `Auto: ${(form.unitPrice * (1 + t.porcentajeDefecto/100)).toFixed(2)}` : 'Precio base'}
                          value={form.tarifaPrices[t.id] ?? ''}
                          onChange={e => {
                            const val = e.target.value ? parseFloat(e.target.value) : undefined;
                            if (val === undefined) {
                              const copy = { ...form.tarifaPrices };
                              delete copy[t.id];
                              setForm(prev => ({ ...prev, tarifaPrices: copy }));
                            } else {
                              updateTarifaPrice(t.id, val);
                            }
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="form-row" style={{ marginTop: 'var(--space-4)' }}>
                <div className="form-group">
                  <label className="form-label">Stock Actual</label>
                  <input className="form-input" type="number" value={form.stockQuantity} onChange={e => updateForm('stockQuantity', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Umbral de Alerta de Stock Bajo</label>
                  <input className="form-input" type="number" value={form.lowStockThreshold} onChange={e => updateForm('lowStockThreshold', e.target.value)} />
                </div>
              </div>

              <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
                <label className="form-label">Descripción corta (opcional)</label>
                <textarea className="form-textarea" rows={2} value={form.description} onChange={e => updateForm('description', e.target.value)} />
              </div>

              <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
                <label className="form-label">Imagen del producto (opcional)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                  {form.imageUrl ? (
                    <>
                      <img
                        src={form.imageUrl}
                        alt="Vista previa"
                        style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)' }}
                      />
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => updateForm('imageUrl', '')}>
                        <ImageOff size={14} /> Quitar imagen
                      </button>
                    </>
                  ) : (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => imageInputRef.current?.click()}>
                      <ImagePlus size={14} /> Añadir foto
                    </button>
                  )}
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={e => {
                      handlePickImage(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </div>
                <span className="form-hint">La imagen se reduce y comprime en el navegador para que apenas ocupe espacio.</span>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSaveProduct}>Guardar producto</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Crear / Editar Categoría */}
      {showCatModal && (
        <div className="modal-overlay" onClick={() => setShowCatModal(false)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editingCategory ? 'Editar Categoría' : 'Nueva Categoría'}</h3>
              <button className="modal-close" onClick={() => setShowCatModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label required">Nombre de la categoría</label>
                <input
                  className="form-input"
                  value={catName}
                  onChange={e => setCatName(e.target.value)}
                  placeholder="Ej. Bebidas, Embutidos, Herramientas"
                />
              </div>

              <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
                <label className="form-label">Icono ilustrativo</label>
                <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  {ICON_PRESETS.map(iconName => (
                    <button
                      key={iconName}
                      type="button"
                      className={`btn btn-sm ${catIcon === iconName ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setCatIcon(iconName)}
                    >
                      <CategoryIcon name={iconName} size={16} />
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowCatModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSaveCategory} disabled={savingCat}>
                {savingCat ? 'Guardando...' : 'Guardar categoría'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
