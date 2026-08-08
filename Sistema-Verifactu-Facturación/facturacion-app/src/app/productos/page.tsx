'use client';

import { useState, useEffect, useMemo } from 'react';
import { Plus, Search, SearchX, Edit, Trash2, X, Check, Tag, Sparkles, Package } from 'lucide-react';
import CategoryIcon from '@/components/ui/CategoryIcon';
import PageSkeleton from '@/components/ui/PageSkeleton';
import TableEmpty from '@/components/ui/TableEmpty';
import {
  getProducts, saveProduct as persistProduct, deleteProduct as removeProduct,
  getCompanyCategories, addCustomCategory
} from '@/lib/storage';
import { Product, TaxRate, UnitOfMeasure } from '@/lib/types';
import { formatCurrency, generateId } from '@/lib/utils';
import { TAX_RATES, UNITS_OF_MEASURE, ICON_PRESETS } from '@/lib/constants';
import { useToast } from '@/hooks/useToast';

interface CategoryOption {
  value: string;
  label: string;
  icon: string;
}

export default function ProductosPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');

  // Product modal
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  // New Category modal
  const [showCatModal, setShowCatModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('Package');
  const [savingCat, setSavingCat] = useState(false);

  const { success, error: toastError } = useToast();

  const [form, setForm] = useState({
    ref: '', name: '', description: '', category: 'otros',
    unitPrice: 0, defaultTaxRate: TaxRate.REDUCIDO as TaxRate, unit: UnitOfMeasure.KG as UnitOfMeasure,
    active: true,
  });

  const loadData = async () => {
    const [prods, cats] = await Promise.all([getProducts(), getCompanyCategories()]);
    setProducts(prods);
    setCategories(cats);
  };

  useEffect(() => {
    (async () => {
      await loadData();
      setMounted(true);
    })();
  }, []);

  const reload = async () => setProducts(await getProducts());

  const filtered = useMemo(() => {
    let result = [...products];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.ref.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
      );
    }
    if (categoryFilter) result = result.filter(p => p.category === categoryFilter);
    return result;
  }, [products, search, categoryFilter]);

  const openCreate = () => {
    setEditing(null);
    const defaultCat = categories.length > 0 ? categories[0].value : 'otros';
    setForm({
      ref: '', name: '', description: '', category: defaultCat,
      unitPrice: 0, defaultTaxRate: TaxRate.REDUCIDO, unit: UnitOfMeasure.KG, active: true
    });
    setShowModal(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      ref: p.ref, name: p.name, description: p.description, category: p.category,
      unitPrice: p.unitPrice, defaultTaxRate: p.defaultTaxRate, unit: p.unit, active: p.active
    });
    setShowModal(true);
  };

  const handleSaveProduct = async () => {
    if (!form.name || !form.ref) return;
    const product: Product = {
      id: editing?.id || generateId(),
      ...form,
      createdAt: editing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    try {
      await persistProduct(product);
      await reload();
      setShowModal(false);
      success(editing ? 'Producto actualizado' : 'Producto creado', form.name);
    } catch (err) {
      toastError('No se pudo guardar el producto', err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  const handleDeleteProduct = async (p: Product) => {
    if (confirm(`¿Eliminar "${p.name}"?`)) {
      await removeProduct(p.id);
      await reload();
      success('Producto eliminado', p.name);
    }
  };

  const handleCreateCategory = async () => {
    if (!newCatName.trim()) return;
    setSavingCat(true);
    try {
      const added = await addCustomCategory(newCatName.trim(), newCatIcon);
      setCategories(prev => [...prev, added]);
      setForm(prev => ({ ...prev, category: added.value }));
      setNewCatName('');
      setShowCatModal(false);
      success('Categoría creada', added.label);
    } catch (err) {
      toastError('Error', 'No se pudo guardar la categoría');
    } finally {
      setSavingCat(false);
    }
  };

  const updateForm = (field: string, value: string | number | boolean) => {
    setForm(prev => ({
      ...prev,
      [field]: typeof prev[field as keyof typeof prev] === 'number' ? Number(value) : value
    }));
  };

  const getCategoryInfo = (catValue: string) => {
    return categories.find(c => c.value === catValue) || { label: catValue, icon: 'Package' };
  };

  if (!mounted) {
    return <PageSkeleton variant="list" label="Cargando el catálogo" />;
  }

  const activeCount = products.filter(p => p.active).length;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <p className="page-eyebrow"><Package /> Catálogo</p>
          <h1 className="page-title">Productos</h1>
          {products.length > 0 && (
            <div className="page-meta">
              <span className="page-meta-item">
                <span className="page-meta-value">{products.length}</span>
                <span className="page-meta-label">
                  {products.length === 1 ? 'referencia' : 'referencias'}
                </span>
              </span>
              <span className="page-meta-item">
                <span className="page-meta-value is-success">{activeCount}</span>
                <span className="page-meta-label">a la venta</span>
              </span>
              <span className="page-meta-item">
                <span className="page-meta-value">{categories.length}</span>
                <span className="page-meta-label">
                  {categories.length === 1 ? 'categoría' : 'categorías'}
                </span>
              </span>
            </div>
          )}
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={() => setShowCatModal(true)}>
            <Tag size={16} /> Nueva categoría
          </button>
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={16} /> Nuevo producto
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="filters-bar">
        <div className="search-bar" style={{ maxWidth: 300 }}>
          <div className="search-bar-icon"><Search size={16} /></div>
          <input
            type="text"
            placeholder="Referencia, nombre o descripción"
            aria-label="Buscar productos"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="cluster-sm">
          <button
            className={`filter-chip ${!categoryFilter ? 'active' : ''}`}
            onClick={() => setCategoryFilter('')}
          >
            Todas ({products.length})
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
              <th>Producto</th>
              <th>Categoría</th>
              <th style={{ textAlign: 'right' }}>Precio</th>
              <th>IVA</th>
              <th>Unidad</th>
              <th>Estado</th>
              <th style={{ width: 100 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => {
              const cat = getCategoryInfo(p.category);
              return (
                <tr key={p.id}>
                  <td className="mono">{p.ref}</td>
                  <td className="primary">
                    {p.name}
                    {p.description && <span className="cell-sub">{p.description}</span>}
                  </td>
                  <td>
                    <span className="badge badge-borrador">
                      <CategoryIcon name={cat.icon} size={13} />
                      {cat.label}
                    </span>
                  </td>
                  <td className="amount">{formatCurrency(p.unitPrice)}</td>
                  <td>{p.defaultTaxRate}%</td>
                  <td>{p.unit}</td>
                  <td>
                    <span className={`badge ${p.active ? 'badge-activo' : 'badge-inactivo'}`}>
                      {p.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openEdit(p)} aria-label={`Editar ${p.name}`}>
                        <Edit size={14} />
                      </button>
                      <button className="btn btn-ghost btn-icon btn-sm btn-danger-ghost" onClick={() => handleDeleteProduct(p)} aria-label={`Eliminar ${p.name}`}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (search || categoryFilter) && (
              <TableEmpty
                colSpan={8}
                icon={SearchX}
                title="Aquí no hay nada con esos criterios"
                hint={
                  categoryFilter
                    ? 'Esa categoría todavía no tiene productos. Prueba con «Todas» o crea uno nuevo dentro de ella.'
                    : 'Se busca por referencia, nombre y descripción.'
                }
                action={
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => { setSearch(''); setCategoryFilter(''); }}
                  >
                    <X size={14} /> Ver todo el catálogo
                  </button>
                }
              />
            )}
            {filtered.length === 0 && !search && !categoryFilter && (
              <TableEmpty
                colSpan={8}
                icon={Package}
                title="Tu catálogo está vacío"
                hint="Guarda aquí lo que vendes con su precio e IVA y podrás añadirlo a una factura escribiendo sólo la referencia."
                action={
                  <button className="btn btn-primary btn-sm" onClick={openCreate}>
                    <Plus size={14} /> Crear el primer producto
                  </button>
                }
              />
            )}
          </tbody>
        </table>
      </div>

      {/* Modal: Create/Edit Product */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{editing ? 'Editar producto' : 'Nuevo producto'}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label required">Referencia / Código</label>
                  <input className="form-input" value={form.ref} onChange={e => updateForm('ref', e.target.value)} placeholder="REF-001" />
                </div>
                <div className="form-group">
                  <label className="form-label required">Nombre del producto</label>
                  <input className="form-input" value={form.name} onChange={e => updateForm('name', e.target.value)} placeholder="Ej. Manzana Golden 1ª" />
                </div>
              </div>
              <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
                <label className="form-label">Descripción</label>
                <textarea className="form-textarea" value={form.description} onChange={e => updateForm('description', e.target.value)} rows={2} />
              </div>

              <div className="form-row" style={{ marginTop: 'var(--space-4)' }}>
                <div className="form-group">
                  <div className="split">
                    <label className="form-label">Categoría</label>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowCatModal(true)}>
                      <Plus size={13} /> Crear categoría
                    </button>
                  </div>
                  <select className="form-select" value={form.category} onChange={e => updateForm('category', e.target.value)}>
                    {categories.map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Unidad de medida</label>
                  <select className="form-select" value={form.unit} onChange={e => updateForm('unit', e.target.value)}>
                    {UNITS_OF_MEASURE.map(u => (
                      <option key={u.value} value={u.value}>{u.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-row" style={{ marginTop: 'var(--space-4)' }}>
                <div className="form-group">
                  <label className="form-label required">Precio unitario (€)</label>
                  <input className="form-input" type="number" min={0} step={0.01} value={form.unitPrice} onChange={e => updateForm('unitPrice', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Tipo IVA</label>
                  <select className="form-select" value={form.defaultTaxRate} onChange={e => updateForm('defaultTaxRate', e.target.value)}>
                    {TAX_RATES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ marginTop: 'var(--space-5)' }}>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={e => updateForm('active', e.target.checked)}
                  />
                  <span className="toggle-slider" />
                  <span className="stack-sm">
                    <span className="choice-card-title">Disponible para facturar</span>
                    <span className="choice-card-text">
                      Si lo desactivas deja de proponerse al crear facturas, pero las que ya lo
                      llevan no cambian.
                    </span>
                  </span>
                </label>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSaveProduct} disabled={!form.name || !form.ref}>
                <Check size={16} /> {editing ? 'Guardar' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Create Custom Category with Emoji Picker */}
      {showCatModal && (
        <div className="modal-overlay" onClick={() => setShowCatModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <h2 className="modal-title section-title">
                <Sparkles size={18} />
                Nueva categoría
              </h2>
              <button className="modal-close" onClick={() => setShowCatModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label required">Nombre de la categoría</label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="Ej. Marisco Vivo, Dulces Artesanales, Recambios Motor..."
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginTop: 'var(--space-5)' }}>
                <label className="form-label">Icono</label>

                <div className="cluster" style={{ marginBottom: 'var(--space-3)' }}>
                  <span className="icon-preview"><CategoryIcon name={newCatIcon} size={24} /></span>
                  <span className="choice-card-text">
                    Es lo que verás en la columna de categoría y en los filtros del catálogo.
                  </span>
                </div>

                <div className="icon-picker" role="radiogroup" aria-label="Icono de la categoría">
                  {ICON_PRESETS.map(iconName => (
                    <button
                      key={iconName}
                      type="button"
                      role="radio"
                      aria-checked={newCatIcon === iconName}
                      className={`icon-picker-btn ${newCatIcon === iconName ? 'active' : ''}`}
                      onClick={() => setNewCatIcon(iconName)}
                      title={iconName}
                    >
                      <CategoryIcon name={iconName} size={18} />
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowCatModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleCreateCategory} disabled={!newCatName.trim() || savingCat}>
                <Check size={16} /> {savingCat ? 'Guardando...' : 'Crear categoría'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
