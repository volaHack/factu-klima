'use client';

import { useState, useCallback, useEffect } from 'react';
import { Invoice, InvoiceStatus, FilterState, SortState } from '@/lib/types';
import * as storage from '@/lib/storage';

export function useInvoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>({ search: '' });
  const [sort, setSort] = useState<SortState>({ field: 'issueDate', direction: 'desc' });

  const reload = useCallback(async () => {
    setLoading(true);
    const data = await storage.getInvoices();
    setInvoices(data);
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const save = useCallback(async (invoice: Invoice) => {
    await storage.saveInvoice(invoice);
    await reload();
  }, [reload]);

  const remove = useCallback(async (id: string) => {
    await storage.deleteInvoice(id);
    await reload();
  }, [reload]);

  const getById = useCallback((id: string) => {
    return invoices.find(inv => inv.id === id);
  }, [invoices]);

  // Filtered + Sorted
  const filteredInvoices = useCallback(() => {
    let result = [...invoices];

    // Search
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(inv =>
        inv.number.toLowerCase().includes(q) ||
        inv.clientName.toLowerCase().includes(q) ||
        inv.clientNif.toLowerCase().includes(q)
      );
    }

    // Status filter
    if (filters.status && filters.status.length > 0) {
      result = result.filter(inv => filters.status!.includes(inv.status));
    }

    // Date range
    if (filters.dateFrom) {
      result = result.filter(inv => inv.issueDate >= filters.dateFrom!);
    }
    if (filters.dateTo) {
      result = result.filter(inv => inv.issueDate <= filters.dateTo!);
    }

    // Client filter
    if (filters.clientId) {
      result = result.filter(inv => inv.clientId === filters.clientId);
    }

    // Amount range
    if (filters.minAmount !== undefined) {
      result = result.filter(inv => inv.total >= filters.minAmount!);
    }
    if (filters.maxAmount !== undefined) {
      result = result.filter(inv => inv.total <= filters.maxAmount!);
    }

    // Sort
    result.sort((a, b) => {
      const aVal = a[sort.field as keyof Invoice];
      const bVal = b[sort.field as keyof Invoice];
      if (aVal === undefined || bVal === undefined) return 0;

      let comparison = 0;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        comparison = aVal.localeCompare(bVal);
      } else if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal;
      }

      return sort.direction === 'desc' ? -comparison : comparison;
    });

    return result;
  }, [invoices, filters, sort]);

  // Statistics
  const stats = useCallback(() => {
    const total = invoices.reduce((sum, inv) => inv.status !== InvoiceStatus.ANULADA ? sum + inv.total : sum, 0);
    const pending = invoices.filter(inv => inv.status === InvoiceStatus.PENDIENTE || inv.status === InvoiceStatus.EMITIDA);
    const pendingAmount = pending.reduce((sum, inv) => sum + inv.total, 0);
    const overdue = invoices.filter(inv => inv.status === InvoiceStatus.VENCIDA);
    const overdueAmount = overdue.reduce((sum, inv) => sum + inv.total, 0);
    const paid = invoices.filter(inv => inv.status === InvoiceStatus.PAGADA);
    const paidAmount = paid.reduce((sum, inv) => sum + inv.total, 0);

    return {
      totalInvoices: invoices.length,
      totalAmount: total,
      pendingCount: pending.length,
      pendingAmount,
      overdueCount: overdue.length,
      overdueAmount,
      paidCount: paid.length,
      paidAmount,
    };
  }, [invoices]);

  return {
    invoices,
    loading,
    filters,
    setFilters,
    sort,
    setSort,
    save,
    remove,
    getById,
    reload,
    filteredInvoices,
    stats,
  };
}
