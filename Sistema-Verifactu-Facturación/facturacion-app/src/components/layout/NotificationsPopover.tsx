'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import Link from 'next/link';
import {
  Bell, PackageX, AlertTriangle, Clock, CheckCircle2, X, ChevronRight, AlertCircle, ShieldAlert
} from 'lucide-react';
import { getInvoices, getProducts } from '@/lib/storage';
import { Invoice, InvoiceStatus, Product } from '@/lib/types';
import { formatCurrency, getDaysUntilDue } from '@/lib/utils';

export interface NotificationItem {
  id: string;
  type: 'stock' | 'overdue' | 'due_soon';
  severity: 'danger' | 'warning' | 'info';
  title: string;
  subtitle: string;
  timeLabel: string;
  href: string;
}

interface NotificationsPopoverProps {
  onClose: () => void;
}

export default function NotificationsPopover({ onClose }: NotificationsPopoverProps) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'stock' | 'invoices'>('all');
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const [invs, prods] = await Promise.all([getInvoices(), getProducts()]);
        setInvoices(invs);
        setProducts(prods);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const notifications = useMemo<NotificationItem[]>(() => {
    const list: NotificationItem[] = [];

    // 1. Stock notifications
    for (const p of products) {
      if (!p.active) continue;
      const stock = p.stockQuantity ?? 0;
      const threshold = p.lowStockThreshold ?? 5;
      if (stock === 0) {
        list.push({
          id: `stock-out-${p.id}`,
          type: 'stock',
          severity: 'danger',
          title: `Producto Agotado: ${p.name}`,
          subtitle: `Quedan 0 ${p.unit} · Umbral mínimo: ${threshold}`,
          timeLabel: 'Stock cero',
          href: '/productos',
        });
      } else if (stock <= threshold) {
        list.push({
          id: `stock-low-${p.id}`,
          type: 'stock',
          severity: 'warning',
          title: `Bajo Stock: ${p.name}`,
          subtitle: `Quedan ${stock} ${p.unit} (Umbral: ${threshold})`,
          timeLabel: 'Reponer pronto',
          href: '/productos',
        });
      }
    }

    // 2. Overdue & Due Soon Invoices
    for (const inv of invoices) {
      if (inv.status === InvoiceStatus.ANULADA || inv.status === InvoiceStatus.PAGADA) continue;

      const daysLeft = getDaysUntilDue(inv.dueDate);

      if (inv.status === InvoiceStatus.VENCIDA || daysLeft < 0) {
        const daysPast = Math.abs(daysLeft);
        list.push({
          id: `inv-overdue-${inv.id}`,
          type: 'overdue',
          severity: 'danger',
          title: `Factura Impaga / Vencida: ${inv.number}`,
          subtitle: `${inv.clientName} · ${formatCurrency(inv.total)} (${daysPast} día${daysPast === 1 ? '' : 's'} de retraso)`,
          timeLabel: 'Vencida',
          href: `/facturas/${inv.id}`,
        });
      } else if (daysLeft <= 7) {
        list.push({
          id: `inv-duesoon-${inv.id}`,
          type: 'due_soon',
          severity: 'warning',
          title: `Factura Próxima a Vencer: ${inv.number}`,
          subtitle: `${inv.clientName} · ${formatCurrency(inv.total)} (Vence en ${daysLeft} día${daysLeft === 1 ? '' : 's'})`,
          timeLabel: daysLeft === 0 ? 'Vence hoy' : `En ${daysLeft}d`,
          href: `/facturas/${inv.id}`,
        });
      }
    }

    return list;
  }, [invoices, products]);

  const filteredNotifications = useMemo(() => {
    if (activeTab === 'stock') return notifications.filter(n => n.type === 'stock');
    if (activeTab === 'invoices') return notifications.filter(n => n.type === 'overdue' || n.type === 'due_soon');
    return notifications;
  }, [notifications, activeTab]);

  const stockCount = useMemo(() => notifications.filter(n => n.type === 'stock').length, [notifications]);
  const invoiceCount = useMemo(() => notifications.filter(n => n.type === 'overdue' || n.type === 'due_soon').length, [notifications]);

  const getIcon = (n: NotificationItem) => {
    if (n.type === 'stock') {
      return <PackageX size={18} style={{ color: n.severity === 'danger' ? 'var(--color-danger)' : 'var(--color-warning)' }} />;
    }
    if (n.type === 'overdue') {
      return <AlertCircle size={18} style={{ color: 'var(--color-danger)' }} />;
    }
    return <Clock size={18} style={{ color: 'var(--color-warning)' }} />;
  };

  return (
    <div
      ref={popoverRef}
      className="animate-fade-in"
      style={{
        position: 'absolute',
        top: '100%',
        right: 0,
        marginTop: 8,
        width: 380,
        maxWidth: '92vw',
        background: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-xl)',
        boxShadow: 'var(--shadow-xl)',
        zIndex: 1100,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        padding: 'var(--space-4) var(--space-5)',
        background: 'linear-gradient(135deg, var(--wine-500) 0%, #2a0e17 100%)',
        color: '#ffffff',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <Bell size={18} />
          <h4 style={{ margin: 0, fontSize: 'var(--text-md)', fontWeight: 700, color: '#ffffff' }}>
            Centro de Notificaciones
          </h4>
        </div>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#ffffff', opacity: 0.8, cursor: 'pointer', padding: 2 }}
          aria-label="Cerrar notificaciones"
        >
          <X size={18} />
        </button>
      </div>

      {/* Filter Tabs */}
      <div style={{
        display: 'flex',
        gap: 'var(--space-2)',
        padding: 'var(--space-3) var(--space-4)',
        background: 'var(--bg-tertiary)',
        borderBottom: '1px solid var(--border-color)',
      }}>
        <button
          className={`btn btn-xs ${activeTab === 'all' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveTab('all')}
          style={{ borderRadius: 'var(--radius-full)', fontWeight: 600 }}
        >
          Todas ({notifications.length})
        </button>
        <button
          className={`btn btn-xs ${activeTab === 'stock' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveTab('stock')}
          style={{ borderRadius: 'var(--radius-full)', fontWeight: 600 }}
        >
          Stock ({stockCount})
        </button>
        <button
          className={`btn btn-xs ${activeTab === 'invoices' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setActiveTab('invoices')}
          style={{ borderRadius: 'var(--radius-full)', fontWeight: 600 }}
        >
          Impagos ({invoiceCount})
        </button>
      </div>

      {/* List */}
      <div style={{ maxHeight: 360, overflowY: 'auto', padding: 'var(--space-2)' }}>
        {loading ? (
          <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)' }}>
            Comprobando estado del sistema...
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div style={{ padding: 'var(--space-8) var(--space-4)', textAlign: 'center' }}>
            <CheckCircle2 size={32} style={{ color: 'var(--color-success)', margin: '0 auto var(--space-2)' }} />
            <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
              Todo al día
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: 4 }}>
              Sin alertas de impagos ni bajo stock pendientes.
            </div>
          </div>
        ) : (
          filteredNotifications.map(n => (
            <Link
              key={n.id}
              href={n.href}
              onClick={onClose}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 'var(--space-3)',
                padding: '10px 12px',
                borderRadius: 'var(--radius-md)',
                textDecoration: 'none',
                color: 'inherit',
                transition: 'background 0.15s ease',
                borderBottom: '1px solid var(--border-subtle)',
              }}
              className="choice-card"
            >
              <div style={{ marginTop: 2 }}>{getIcon(n)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 2,
                }}>
                  <span style={{ fontWeight: 700, fontSize: 'var(--text-xs)', color: 'var(--text-primary)' }}>
                    {n.title}
                  </span>
                  <span className={`badge ${n.severity === 'danger' ? 'badge-danger' : 'badge-warning'}`} style={{ fontSize: '9px', padding: '1px 5px' }}>
                    {n.timeLabel}
                  </span>
                </div>
                <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  {n.subtitle}
                </div>
              </div>
              <ChevronRight size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0, marginTop: 4 }} />
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
