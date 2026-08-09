'use client';

import { useState, useCallback, useEffect } from 'react';
import { Product, ProductCategory } from '@/lib/types';
import * as storage from '@/lib/storage';

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<ProductCategory | ''>('');

  const reload = useCallback(async () => {
    setLoading(true);
    const data = await storage.getProducts();
    setProducts(data);
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const save = useCallback(async (product: Product) => {
    await storage.saveProduct(product);
    await reload();
  }, [reload]);

  const remove = useCallback(async (id: string) => {
    await storage.deleteProduct(id);
    await reload();
  }, [reload]);

  const getById = useCallback((id: string) => {
    return products.find(p => p.id === id);
  }, [products]);

  const filteredProducts = useCallback(() => {
    let result = [...products];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.ref.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
      );
    }

    if (categoryFilter) {
      result = result.filter(p => p.category === categoryFilter);
    }

    return result;
  }, [products, search, categoryFilter]);

  const activeProducts = useCallback(() => {
    return products.filter(p => p.active);
  }, [products]);

  return {
    products,
    loading,
    search,
    setSearch,
    categoryFilter,
    setCategoryFilter,
    save,
    remove,
    getById,
    reload,
    filteredProducts,
    activeProducts,
  };
}
