# Gestión de Categorías PRO MAX - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:ejecutar-plan-paso-a-paso to implement this plan task-by-task.

**Goal:** Agregar gestión completa de categorías (crear, editar, borrar) con interfaz de tarjetas profesional en la página de productos

**Architecture:** 
- Componentes nuevos: `CategoryCard`, `CategoryGrid` reutilizables
- Función `editCustomCategory()` en storage.ts para persistencia
- Lógica de borrado inteligente (mover productos antes de borrar)
- Modales mejorados para edición y confirmación

**Tech Stack:** Next.js 14, React 19, Supabase, Lucide Icons, TypeScript

---

## Task 1: Agregar función `editCustomCategory()` a storage.ts

**Files:**
- Modify: `src/lib/storage.ts:1303-1312` (después de deleteCustomCategory)

**Step 1: Entender estructura actual**

Lee la función `deleteCustomCategory()` (línea 1303-1312) y `addCustomCategory()` (línea 1277-1301). Notar que:
- Las categorías se guardan en `settings.customCategories`
- Cada categoría tiene: `{ id, name, icon, sector }`
- Se persisten llamando a `saveCompanySettings()`

**Step 2: Agregar función editCustomCategory()**

Inserta después de `deleteCustomCategory()`:

```typescript
export async function editCustomCategory(
  categoryId: string,
  name: string,
  icon: string
): Promise<void> {
  const settings = await getCompanySettings();
  if (!settings || !settings.customCategories) return;

  const updatedCategories = settings.customCategories.map(c =>
    c.id === categoryId ? { ...c, name, icon } : c
  );
  
  await saveCompanySettings({
    ...settings,
    customCategories: updatedCategories,
  });
}
```

**Step 3: Commit**

```bash
git add src/lib/storage.ts
git commit -m "feat: add editCustomCategory function to storage layer"
```

---

## Task 2: Crear componente CategoryCard.tsx

**Files:**
- Create: `src/components/ui/CategoryCard.tsx`

**Step 1: Crear archivo con estructura base**

```tsx
'use client';

import { useState } from 'react';
import { Edit, Trash2 } from 'lucide-react';
import CategoryIcon from './CategoryIcon';

interface CategoryCardProps {
  id: string;
  name: string;
  icon: string;
  productCount: number;
  isCustom: boolean;
  onEdit: (id: string, name: string, icon: string) => void;
  onDelete: (id: string, name: string, productCount: number) => void;
}

export default function CategoryCard({
  id,
  name,
  icon,
  productCount,
  isCustom,
  onEdit,
  onDelete,
}: CategoryCardProps) {
  return (
    <div
      className="category-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 'var(--space-4)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        cursor: 'pointer',
        transition: 'all 200ms ease-out',
        minHeight: 160,
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget;
        el.style.transform = 'translateY(-4px)';
        el.style.boxShadow = 'var(--shadow-lg)';
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget;
        el.style.transform = 'translateY(0)';
        el.style.boxShadow = 'none';
      }}
    >
      {/* Icono */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 48,
          height: 48,
          borderRadius: 'var(--radius-md)',
          background: 'var(--accent-glow)',
          marginBottom: 'var(--space-3)',
        }}
      >
        <CategoryIcon name={icon} size={28} />
      </div>

      {/* Nombre */}
      <div
        style={{
          fontSize: 'var(--text-base)',
          fontWeight: 600,
          textAlign: 'center',
          color: 'var(--text-primary)',
          marginBottom: 'var(--space-2)',
          lineHeight: 1.3,
        }}
      >
        {name}
      </div>

      {/* Contador */}
      <div
        style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--text-muted)',
          marginBottom: 'var(--space-3)',
        }}
      >
        {productCount} {productCount === 1 ? 'producto' : 'productos'}
      </div>

      {/* Acciones (solo si es categoría custom) */}
      {isCustom && (
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-2)',
            justifyContent: 'center',
          }}
        >
          <button
            className="btn btn-ghost btn-icon btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(id, name, icon);
            }}
            title="Editar categoría"
          >
            <Edit size={16} />
          </button>
          <button
            className="btn btn-ghost btn-icon btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(id, name, productCount);
            }}
            title="Borrar categoría"
            style={{ color: 'var(--color-danger)' }}
          >
            <Trash2 size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/ui/CategoryCard.tsx
git commit -m "feat: create CategoryCard component with edit/delete actions"
```

---

## Task 3: Crear componente CategoryGrid.tsx

**Files:**
- Create: `src/components/ui/CategoryGrid.tsx`

**Step 1: Crear componente grid responsivo**

```tsx
'use client';

import CategoryCard from './CategoryCard';

interface Category {
  value: string;
  label: string;
  icon: string;
  isCustom?: boolean;
}

interface CategoryGridProps {
  categories: Category[];
  productCounts: Record<string, number>;
  onEdit: (id: string, name: string, icon: string) => void;
  onDelete: (id: string, name: string, productCount: number) => void;
  onAddNew: () => void;
}

export default function CategoryGrid({
  categories,
  productCounts,
  onEdit,
  onDelete,
  onAddNew,
}: CategoryGridProps) {
  return (
    <div
      style={{
        marginBottom: 'var(--space-6)',
      }}
    >
      <div
        style={{
          marginBottom: 'var(--space-4)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <h2
          style={{
            fontSize: 'var(--text-lg)',
            fontWeight: 600,
            color: 'var(--text-primary)',
          }}
        >
          Categorías ({categories.length})
        </h2>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-4)',
        }}
      >
        {categories.map((cat) => (
          <CategoryCard
            key={cat.value}
            id={cat.value}
            name={cat.label}
            icon={cat.icon}
            productCount={productCounts[cat.value] || 0}
            isCustom={cat.isCustom ?? false}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>

      {/* Botón agregar categoría */}
      <button
        className="btn btn-secondary"
        onClick={onAddNew}
        style={{
          width: '100%',
          maxWidth: 200,
        }}
      >
        + Nueva Categoría
      </button>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/ui/CategoryGrid.tsx
git commit -m "feat: create CategoryGrid component with responsive layout"
```

---

## Task 4: Crear modal para editar categoría

**Files:**
- Modify: `src/app/productos/page.tsx` - Agregar estado y modal para edición

**Step 1: Agregar nuevos estados en ProductosPage**

En el componente, después del estado `showCatModal`, agregar:

```tsx
  // Edit category modal
  const [showEditCatModal, setShowEditCatModal] = useState(false);
  const [editingCat, setEditingCat] = useState<{ id: string; name: string; icon: string } | null>(null);
  const [editCatName, setEditCatName] = useState('');
  const [editCatIcon, setEditCatIcon] = useState('Package');
  const [savingCat, setSavingCat] = useState(false);
```

**Step 2: Crear función handleEditCategory**

Antes de la sección de return, agregar:

```tsx
  const handleEditCategory = async (id: string, name: string, icon: string) => {
    setEditingCat({ id, name, icon });
    setEditCatName(name);
    setEditCatIcon(icon);
    setShowEditCatModal(true);
  };

  const handleSaveEditCategory = async () => {
    if (!editCatName.trim() || !editingCat) return;
    
    setSavingCat(true);
    try {
      const { editCustomCategory } = await import('@/lib/storage');
      await editCustomCategory(editingCat.id, editCatName.trim(), editCatIcon);
      
      const updatedCategories = categories.map(c =>
        c.value === editingCat.id 
          ? { ...c, label: editCatName.trim(), icon: editCatIcon }
          : c
      );
      setCategories(updatedCategories);
      setShowEditCatModal(false);
      setEditingCat(null);
      success('Categoría actualizada', editCatName);
    } catch (err) {
      toastError('Error', 'No se pudo actualizar la categoría');
    } finally {
      setSavingCat(false);
    }
  };
```

**Step 3: Commit**

```bash
git add src/app/productos/page.tsx
git commit -m "feat: add edit category state and handler function"
```

---

## Task 5: Crear modal para borrar categoría con inteligencia

**Files:**
- Modify: `src/app/productos/page.tsx` - Agregar modal de borrado inteligente

**Step 1: Agregar estados para modal de borrado**

Después de los estados de edición, agregar:

```tsx
  // Delete category modal
  const [showDeleteCatModal, setShowDeleteCatModal] = useState(false);
  const [deletingCat, setDeletingCat] = useState<{ id: string; name: string; productCount: number } | null>(null);
  const [targetCategory, setTargetCategory] = useState<string>('otros');
  const [deletingCatProcess, setDeletingCatProcess] = useState(false);
```

**Step 2: Crear función handleDeleteCategory**

```tsx
  const handleDeleteCategory = (id: string, name: string, productCount: number) => {
    if (productCount === 0) {
      // Confirmación simple
      if (confirm(`¿Borrar la categoría "${name}"?`)) {
        performDeleteCategory(id, name);
      }
    } else {
      // Modal inteligente
      setDeletingCat({ id, name, productCount });
      setTargetCategory('otros');
      setShowDeleteCatModal(true);
    }
  };

  const performDeleteCategory = async (id: string, name: string) => {
    try {
      const { deleteCustomCategory } = await import('@/lib/storage');
      
      // Si hay productos, actualiza sus categorías primero
      if (deletingCat?.productCount && deletingCat.productCount > 0) {
        const productsInCat = products.filter(p => p.category === id);
        for (const product of productsInCat) {
          const { saveProduct } = await import('@/lib/storage');
          await saveProduct({
            ...product,
            category: targetCategory,
            updatedAt: new Date().toISOString(),
          });
        }
        await reload();
      }
      
      await deleteCustomCategory(id);
      const updatedCategories = categories.filter(c => c.value !== id);
      setCategories(updatedCategories);
      setShowDeleteCatModal(false);
      setDeletingCat(null);
      success('Categoría eliminada', name);
    } catch (err) {
      toastError('Error', 'No se pudo eliminar la categoría');
    } finally {
      setDeletingCatProcess(false);
    }
  };
```

**Step 3: Commit**

```bash
git add src/app/productos/page.tsx
git commit -m "feat: add smart category deletion with product reassignment"
```

---

## Task 6: Integrar CategoryGrid en ProductosPage

**Files:**
- Modify: `src/app/productos/page.tsx` - Importar y renderizar CategoryGrid

**Step 1: Agregar import**

En el top del archivo, agregar:

```tsx
import CategoryGrid from '@/components/ui/CategoryGrid';
```

**Step 2: Reemplazar sección de filters bar**

En el return del componente, buscar la sección que dice `{/* Filters Bar */}` y reemplazar la estructura así:

Antes (alrededor de línea 169):
```tsx
      {/* Filters Bar */}
      <div className="filters-bar">
        <div className="search-bar" style={{ maxWidth: 300 }}>
```

Después:
```tsx
      {/* Category Grid PRO */}
      <CategoryGrid
        categories={categories}
        productCounts={Object.fromEntries(
          categories.map(cat => [
            cat.value,
            products.filter(p => p.category === cat.value).length
          ])
        )}
        onEdit={handleEditCategory}
        onDelete={handleDeleteCategory}
        onAddNew={() => setShowCatModal(true)}
      />

      {/* Filters Bar */}
      <div className="filters-bar">
        <div className="search-bar" style={{ maxWidth: 300 }}>
```

**Step 3: Commit**

```bash
git add src/app/productos/page.tsx
git commit -m "feat: integrate CategoryGrid component into products page"
```

---

## Task 7: Agregar modal de edición de categoría

**Files:**
- Modify: `src/app/productos/page.tsx` - Agregar modal después del modal de crear categoría

**Step 1: Agregar modal HTML**

Después del modal `showCatModal` (alrededor de línea 435), agregar:

```tsx
      {/* Modal: Edit Category */}
      {showEditCatModal && editingCat && (
        <div className="modal-overlay" onClick={() => setShowEditCatModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <h2 className="modal-title">Editar Categoría</h2>
              <button className="modal-close" onClick={() => setShowEditCatModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label required">Nombre de la Categoría</label>
                <input
                  className="form-input"
                  type="text"
                  value={editCatName}
                  onChange={e => setEditCatName(e.target.value)}
                  placeholder="Ej. Marisco Vivo"
                />
              </div>

              <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
                <label className="form-label">Elige un Icono</label>

                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-tertiary)', border: '1px solid var(--accent-500)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                  }}>
                    <CategoryIcon name={editCatIcon} size={24} />
                  </div>
                </div>

                {/* Icon Selector Grid */}
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '6px',
                  background: 'var(--bg-tertiary)', padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)',
                  maxHeight: 200, overflowY: 'auto'
                }}>
                  {ICON_PRESETS.map(iconName => (
                    <button
                      key={iconName}
                      type="button"
                      onClick={() => setEditCatIcon(iconName)}
                      style={{
                        padding: '6px', background: editCatIcon === iconName ? 'var(--accent-glow)' : 'transparent',
                        border: editCatIcon === iconName ? '1px solid var(--accent-500)' : '1px solid transparent',
                        borderRadius: 'var(--radius-sm)', cursor: 'pointer', display: 'flex',
                        alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)'
                      }}
                      title={iconName}
                    >
                      <CategoryIcon name={iconName} size={18} />
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowEditCatModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSaveEditCategory} disabled={!editCatName.trim() || savingCat}>
                <Check size={16} /> {savingCat ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
```

**Step 2: Commit**

```bash
git add src/app/productos/page.tsx
git commit -m "feat: add edit category modal with icon picker"
```

---

## Task 8: Agregar modal de confirmación de borrado inteligente

**Files:**
- Modify: `src/app/productos/page.tsx` - Agregar modal de borrado después del modal de edición

**Step 1: Agregar modal HTML**

Después del modal `showEditCatModal`, agregar:

```tsx
      {/* Modal: Delete Category Smart */}
      {showDeleteCatModal && deletingCat && (
        <div className="modal-overlay" onClick={() => setShowDeleteCatModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ color: 'var(--color-danger)' }}>⚠️ Borrar Categoría</h2>
              <button className="modal-close" onClick={() => setShowDeleteCatModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: 'var(--space-4)' }}>
                <p style={{ marginBottom: 'var(--space-2)', fontWeight: 500 }}>
                  ¿Borrar la categoría "{deletingCat.name}"?
                </p>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
                  Esta categoría tiene <strong>{deletingCat.productCount}</strong> producto(s) asociado(s).
                </p>
              </div>

              <div style={{ 
                background: 'var(--bg-warning-light)', 
                padding: 'var(--space-3)', 
                borderRadius: 'var(--radius-md)',
                marginBottom: 'var(--space-4)',
                borderLeft: '4px solid var(--color-warning)'
              }}>
                <p style={{ fontSize: 'var(--text-sm)', margin: 0 }}>
                  Elige dónde mover los productos antes de borrar:
                </p>
              </div>

              <div style={{ marginBottom: 'var(--space-4)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="target-cat"
                    value="otros"
                    checked={targetCategory === 'otros'}
                    onChange={e => setTargetCategory(e.target.value)}
                  />
                  <span>Mover a "Otros" (recomendado)</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="target-cat"
                    value="custom"
                    checked={targetCategory !== 'otros'}
                    onChange={() => setTargetCategory(categories[0]?.value || 'otros')}
                  />
                  <span>Mover a otra categoría:</span>
                </label>

                {targetCategory !== 'otros' && (
                  <select
                    className="form-select"
                    value={targetCategory}
                    onChange={e => setTargetCategory(e.target.value)}
                    style={{ marginLeft: 'calc(var(--space-5) + 8px)', marginTop: 'var(--space-2)' }}
                  >
                    {categories
                      .filter(c => c.value !== deletingCat.id)
                      .map(c => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                  </select>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowDeleteCatModal(false)}>Cancelar</button>
              <button
                className="btn"
                onClick={() => {
                  setDeletingCatProcess(true);
                  performDeleteCategory(deletingCat.id, deletingCat.name);
                }}
                disabled={deletingCatProcess}
                style={{ background: 'var(--color-danger)', color: 'white' }}
              >
                {deletingCatProcess ? 'Borrando...' : '🗑️ Sí, borrar'}
              </button>
            </div>
          </div>
        </div>
      )}
```

**Step 2: Commit**

```bash
git add src/app/productos/page.tsx
git commit -m "feat: add smart delete confirmation modal with category reassignment"
```

---

## Task 9: Mejorar visual del modal de crear categoría

**Files:**
- Modify: `src/app/productos/page.tsx` - Mejorar modal existente de crear categoría (líneas 366-435)

**Step 1: Actualizar modal de crear con mejor visual**

Reemplazar el modal `showCatModal` con:

```tsx
      {/* Modal: Create Custom Category - IMPROVED */}
      {showCatModal && (
        <div className="modal-overlay" onClick={() => setShowCatModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={18} style={{ color: 'var(--accent-400)' }} />
                Nueva Categoría de Producto
              </h2>
              <button className="modal-close" onClick={() => setShowCatModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label required">Nombre de la Categoría</label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="Ej. Marisco Vivo, Dulces Artesanales..."
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  maxLength={50}
                />
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '4px' }}>
                  {newCatName.length}/50 caracteres
                </div>
              </div>

              <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
                <label className="form-label">Elige un Icono para Clasificar</label>

                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-tertiary)', border: '2px solid var(--accent-500)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                  }}>
                    <CategoryIcon name={newCatIcon} size={28} />
                  </div>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    Selecciona un icono de la cuadrícula abajo
                  </span>
                </div>

                {/* Icon Selector Grid */}
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '8px',
                  background: 'var(--bg-tertiary)', padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)',
                  maxHeight: 220, overflowY: 'auto'
                }}>
                  {ICON_PRESETS.map(iconName => (
                    <button
                      key={iconName}
                      type="button"
                      onClick={() => setNewCatIcon(iconName)}
                      style={{
                        padding: '8px', 
                        background: newCatIcon === iconName ? 'var(--accent-glow)' : 'transparent',
                        border: newCatIcon === iconName ? '2px solid var(--accent-500)' : '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-sm)', 
                        cursor: 'pointer', 
                        display: 'flex',
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        color: 'var(--text-secondary)',
                        transition: 'all 150ms ease'
                      }}
                      title={iconName}
                    >
                      <CategoryIcon name={iconName} size={20} />
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => {
                setShowCatModal(false);
                setNewCatName('');
                setNewCatIcon('Package');
              }}>Cancelar</button>
              <button 
                className="btn btn-primary" 
                onClick={handleCreateCategory} 
                disabled={!newCatName.trim() || savingCat}
              >
                <Check size={16} /> {savingCat ? 'Creando...' : 'Crear Categoría'}
              </button>
            </div>
          </div>
        </div>
      )}
```

**Step 2: Commit**

```bash
git add src/app/productos/page.tsx
git commit -m "style: improve create category modal visual design"
```

---

## Task 10: Testing manual - Crear categoría

**Command:**
```bash
cd facturacion-app
npm run dev
```

**Steps:**
1. Navega a `http://localhost:3000/productos`
2. Verifica que el grid de categorías aparece con tarjetas
3. Click en "+ Nueva Categoría"
4. Escribe "Test Frío"
5. Selecciona icono "Snowflake"
6. Click "Crear Categoría"
7. Verifica que aparece nueva tarjeta con fade-in
8. Verifica que muestra "0 productos"

**Expected:** Nueva categoría visible en grid, contador en 0

**Commit después de verificar:**
```bash
git add -A
git commit -m "test: verify create category functionality works"
```

---

## Task 11: Testing manual - Editar categoría

**Steps:**
1. En el grid de categorías, click en botón ✏️ de cualquier categoría
2. Modal se abre con nombre e icono actual
3. Cambia el nombre a "Test Frío Editado"
4. Selecciona otro icono
5. Click "Guardar"
6. Verifica que la tarjeta se actualiza inmediatamente
7. Recarga página (F5) y verifica que los cambios persisten

**Expected:** Cambios se guardan en Supabase y se mantienen tras reload

**Commit:**
```bash
git add -A
git commit -m "test: verify edit category functionality works"
```

---

## Task 12: Testing manual - Borrar categoría sin productos

**Steps:**
1. Crea una nueva categoría llamada "ToDelete"
2. Click en botón 🗑️
3. Confirmación simple aparece
4. Click "Sí, borrar"
5. Verifica que desaparece con fade-out
6. Recarga página y verifica que no aparece

**Expected:** Categoría eliminada correctamente

**Commit:**
```bash
git add -A
git commit -m "test: verify delete empty category works"
```

---

## Task 13: Testing manual - Borrar categoría con productos

**Steps:**
1. Crea un producto en categoría "Frutas"
2. Click en 🗑️ de "Frutas"
3. Modal inteligente aparece diciendo "Tiene X productos"
4. Selecciona opción "Mover a Otros"
5. Click "Sí, borrar"
6. Verifica que el producto ahora está en "Otros"
7. Verifica que "Frutas" desaparece

**Expected:** Productos reasignados y categoría borrada correctamente

**Commit:**
```bash
git add -A
git commit -m "test: verify smart delete with product reassignment works"
```

---

## Task 14: Testing responsive

**Steps:**
1. Abre DevTools (F12)
2. Prueba grid en diferentes breakpoints:
   - Desktop (1200px+): 6 columnas
   - Tablet (768px): 3-4 columnas
   - Mobile (320px): 2 columnas
3. Verifica que tarjetas se ven bien en todos los tamaños
4. Verifica que hover effects funcionan (mouse y touch)

**Expected:** Grid responsivo funciona en todos los tamaños

**Commit:**
```bash
git add -A
git commit -m "test: verify responsive category grid works on all breakpoints"
```

---

## Task 15: Testing de contador dinámico

**Steps:**
1. Crea categoría "Mi Prueba"
2. Verifica que muestra "0 productos"
3. Crea un producto en esa categoría
4. Verifica que el contador se actualiza a "1 producto"
5. Crea otro producto en esa categoría
6. Verifica que muestra "2 productos"
7. Borra uno de los productos
8. Verifica que vuelve a "1 producto"

**Expected:** Contador actualiza dinámicamente con productos

**Commit:**
```bash
git add -A
git commit -m "test: verify dynamic product counter updates correctly"
```

---

## Checklist Final

- [ ] CategoryCard.tsx creado y funcionando
- [ ] CategoryGrid.tsx creado e integrado
- [ ] editCustomCategory() agregada a storage.ts
- [ ] Modal de edición funciona
- [ ] Modal de borrado inteligente funciona
- [ ] Crear categoría funciona
- [ ] Editar categoría funciona
- [ ] Borrar categoría sin productos funciona
- [ ] Borrar categoría con productos reasigna correctamente
- [ ] Grid responsivo en mobile/tablet/desktop
- [ ] Contador de productos actualiza dinámicamente
- [ ] Todos los commits hechos
- [ ] Página se ve profesional y "PRO MAX"

---

## Rollback Plan (Si algo sale mal)

```bash
git log --oneline -15
git reset --hard <commit-antes-de-cambios>
```

O hacer revert de commits individuales:
```bash
git revert <commit-hash>
```
