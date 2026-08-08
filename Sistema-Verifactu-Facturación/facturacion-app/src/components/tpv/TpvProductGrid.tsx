'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, PackageX } from 'lucide-react';
import { Product } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';

interface CategoryOption {
  value: string;
  label: string;
}

interface TpvProductGridProps {
  products: Product[];
  categories: CategoryOption[];
  onSelectProduct: (product: Product) => void;
  /** Escaneo por código de barras exacto — el escáner USB/Bluetooth
      "teclea" el código y termina con Enter, indistinguible de teclear
      rápido; no hace falta ninguna API especial de cámara. */
  onScan: (barcode: string) => boolean;
}

export default function TpvProductGrid({ products, categories, onSelectProduct, onScan }: TpvProductGridProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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
    return list;
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
      <div className="tpv-search-bar">
        <Search size={18} />
        <input
          ref={inputRef}
          type="text"
          inputMode="search"
          placeholder="Escanea un código de barras o busca por nombre…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />
      </div>

      <div className="tpv-categories">
        <button
          className={`tpv-category-chip ${category === 'all' ? 'active' : ''}`}
          onClick={() => setCategory('all')}
        >
          Todos
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

      <div className="tpv-product-grid">
        {filtered.length === 0 ? (
          <div className="tpv-product-empty">
            <PackageX size={28} />
            <p>Sin resultados</p>
          </div>
        ) : (
          filtered.map(p => {
            const lowStock = p.lowStockThreshold != null && (p.stockQuantity ?? 0) <= p.lowStockThreshold;
            const outOfStock = (p.stockQuantity ?? 0) <= 0 && p.lowStockThreshold != null;
            return (
              <button
                key={p.id}
                className={`tpv-product-tile ${outOfStock ? 'is-out' : ''}`}
                onClick={() => onSelectProduct(p)}
              >
                <span className="tpv-product-tile-name">{p.name}</span>
                <span className="tpv-product-tile-price">{formatCurrency(p.unitPrice)}</span>
                <span className="tpv-product-tile-ref">{p.ref}</span>
                {(lowStock || outOfStock) && (
                  <span className={`tpv-stock-badge ${outOfStock ? 'is-out' : 'is-low'}`}>
                    {outOfStock ? 'Sin stock' : `Quedan ${p.stockQuantity}`}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}
