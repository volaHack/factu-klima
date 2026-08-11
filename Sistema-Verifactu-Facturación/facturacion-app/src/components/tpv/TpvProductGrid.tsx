'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, PackageX, PlusCircle, Tag, Star } from 'lucide-react';
import { Product, TpvMode } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';
import { sortByUnitsSold } from '@/lib/tpvOffline';

interface CategoryOption {
  value: string;
  label: string;
}

interface TpvProductGridProps {
  products: Product[];
  categories: CategoryOption[];
  mode: TpvMode;
  onSelectProduct: (product: Product) => void;
  onScan: (barcode: string) => boolean;
  onOpenCustomItem: () => void;
  onOpenQuickCreateProduct?: (barcode?: string) => void;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
}

export default function TpvProductGrid({
  products,
  categories,
  mode,
  onSelectProduct,
  onScan,
  onOpenCustomItem,
  onOpenQuickCreateProduct,
  searchInputRef,
}: TpvProductGridProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const localInputRef = useRef<HTMLInputElement>(null);
  const actualInputRef = searchInputRef || localInputRef;

  useEffect(() => {
    actualInputRef.current?.focus();
  }, [actualInputRef]);

  const filtered = useMemo(() => {
    let list = products.filter(p => p.active);
    if (category !== 'all') list = list.filter(p => p.category === category);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.ref.toLowerCase().includes(q) ||
        (p.barcode && p.barcode.includes(q))
      );
    }
    // Los más vendidos salen arriba (inventario IA), dentro de la categoría activa.
    return sortByUnitsSold(list);
  }, [products, category, query]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const value = query.trim();
    if (!value) return;
    const scanned = onScan(value);
    if (scanned) setQuery('');
  };

  const categoriesInUse = categories.filter(c => products.some(p => p.category === c.value));

  return (
    <section className="tpv-product-area">
      <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
        <div className="tpv-search-bar" style={{ flex: 1 }}>
          <Search size={18} />
          <input
            ref={actualInputRef}
            type="text"
            inputMode="search"
            placeholder="Escanea un código de barras o busca por nombre (F1)…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            autoComplete="off"
          />
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onOpenCustomItem}
          style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
          title="Añadir artículo improvisado sin código de barras (F4)"
        >
          <PlusCircle size={16} style={{ color: 'var(--accent-500)' }} />
          <span>Venta libre (F4)</span>
        </button>
        {onOpenQuickCreateProduct && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => onOpenQuickCreateProduct()}
            style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
            title="Dar de alta un producto en el catálogo (F5)"
          >
            <Tag size={16} style={{ color: '#3b82f6' }} />
            <span>+ Nuevo (F5)</span>
          </button>
        )}
      </div>

      <div className="tpv-categories">
        <button
          className={`tpv-category-chip ${category === 'all' ? 'active' : ''}`}
          onClick={() => setCategory('all')}
        >
          Todos ({products.filter(p => p.active).length})
        </button>
        {categoriesInUse.map(c => (
          <button
            key={c.value}
            className={`tpv-category-chip ${category === c.value ? 'active' : ''}`}
            onClick={() => setCategory(c.value)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className={`tpv-product-grid ${mode === 'supermercado' ? 'is-dense' : ''}`}>
        {filtered.length === 0 ? (
          <div className="tpv-product-empty">
            <PackageX size={32} />
            <p>Ningún producto coincide</p>
            <button
              className="btn btn-secondary btn-sm"
              onClick={onOpenCustomItem}
              style={{ marginTop: 'var(--space-3)' }}
            >
              <Tag size={14} /> Añadir como Venta Libre
            </button>
          </div>
        ) : (
          filtered.map((p, idx) => {
            const rank = idx + 1;
            const lowStock = p.lowStockThreshold != null && (p.stockQuantity ?? 0) <= p.lowStockThreshold;
            const outOfStock = (p.stockQuantity ?? 0) <= 0 && p.lowStockThreshold != null;
            return (
              <button
                key={p.id}
                className={`tpv-product-tile ${outOfStock ? 'is-out' : ''}`}
                onClick={() => onSelectProduct(p)}
              >
                {p.imageUrl && (
                  <span className="tpv-product-tile-image">
                    <img src={p.imageUrl} alt="" loading="lazy" />
                  </span>
                )}
                <span className="tpv-product-tile-badges">
                  {p.unitsSold != null && p.unitsSold > 0 && (
                    <span className={`tpv-sold-rank ${rank <= 3 ? 'is-top' : ''}`} title={`Más vendido · Nº ${rank}`}>
                      <Star size={9} fill="currentColor" /> {rank}
                    </span>
                  )}
                  {(lowStock || outOfStock) && (
                    <span className={`tpv-stock-badge ${outOfStock ? 'is-out' : 'is-low'}`}>
                      {outOfStock ? 'Sin stock' : `Quedan ${p.stockQuantity}`}
                    </span>
                  )}
                </span>
                <span className="tpv-product-tile-name">{p.name}</span>
                <span className="tpv-product-tile-price">{formatCurrency(p.unitPrice)}</span>
                <span className="tpv-product-tile-ref">{p.ref}</span>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}
