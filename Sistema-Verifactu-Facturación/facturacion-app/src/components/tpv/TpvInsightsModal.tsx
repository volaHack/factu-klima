'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, TrendingUp, Star, PackageX, AlertTriangle, Clock, Activity, Zap } from 'lucide-react';
import { Invoice, InvoiceStatus, Product } from '@/lib/types';
import { getProducts, getInvoices } from '@/lib/storage';
import { formatCurrency } from '@/lib/utils';
import { daysUntilOutOfStock } from '@/lib/tpvOffline';

interface TpvInsightsModalProps {
  onClose: () => void;
}

const DAYS = 30;

export default function TpvInsightsModal({ onClose }: TpvInsightsModalProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [prods, invs] = await Promise.all([getProducts(), getInvoices()]);
        setProducts(prods);
        setInvoices(invs);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const data = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - DAYS);

    const recent = invoices.filter(inv =>
      inv.status !== InvoiceStatus.ANULADA &&
      inv.status !== InvoiceStatus.BORRADOR &&
      new Date(inv.issueDate).getTime() >= cutoff.getTime()
    );

    const byKey = new Map<string, { name: string; qty: number }>();
    for (const inv of recent) {
      for (const li of inv.lineItems) {
        const key = li.productId || li.productName;
        const cur = byKey.get(key) || { name: li.productName, qty: 0 };
        cur.qty += li.quantity;
        byKey.set(key, cur);
      }
    }
    const top = Array.from(byKey.entries())
      .sort((a, b) => b[1].qty - a[1].qty)
      .slice(0, 8);

    const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0, total: 0 }));
    for (const inv of recent) {
      const h = new Date(inv.createdAt).getHours();
      hours[h].count += 1;
      hours[h].total += inv.total;
    }
    const maxHourCount = Math.max(1, ...hours.map(h => h.count));
    const busyHours = hours.filter(h => h.count > 0);

    const restock = products
      .filter(p => p.active && p.lowStockThreshold != null)
      .map(p => {
        const qty30 = byKey.get(p.id)?.qty ?? 0;
        const unitsPerDay = qty30 / DAYS;
        const daysLeft = daysUntilOutOfStock(
          p.stockQuantity ?? 0,
          p.lowStockThreshold ?? 0,
          unitsPerDay,
        );
        return { product: p, daysLeft, unitsPerDay };
      })
      .filter(r => r.daysLeft !== Infinity)
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .slice(0, 8);

    const totalQty = top.reduce((s, t) => s + t[1].qty, 0);

    return { top, totalQty, hours, maxHourCount, busyHours, restock };
  }, [products, invoices]);

  if (loading) {
    return (
      <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100, backdropFilter: 'blur(6px)' }}>
        <div className="modal" style={{ maxWidth: 580, borderRadius: 'var(--radius-xl)', padding: 'var(--space-8)', textAlign: 'center' }}>
          <div className="spin" style={{ display: 'inline-block', marginBottom: 'var(--space-3)' }}>
            <Activity size={24} style={{ color: 'var(--accent-500)' }} />
          </div>
          <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Calculando patrones de consumo...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 1100, backdropFilter: 'blur(6px)' }}>
      <div
        className="modal tpv-insights-modal"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: 640,
          width: '94vw',
          maxHeight: '88vh',
          overflowY: 'auto',
          padding: 0,
          borderRadius: 'var(--radius-xl)',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-xl)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: 'var(--space-5) var(--space-6)',
          background: 'linear-gradient(135deg, var(--wine-500) 0%, #2a0e17 100%)',
          color: '#ffffff',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <div style={{
              width: 40,
              height: 40,
              borderRadius: 'var(--radius-lg)',
              background: 'rgba(255, 255, 255, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
            }}>
              <TrendingUp size={22} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#ffffff' }}>
                Patrones de Consumo TPV
              </h3>
              <p style={{ margin: 0, fontSize: 'var(--text-xs)', opacity: 0.8 }}>
                Últimos {DAYS} días · Cálculo local offline
              </p>
            </div>
          </div>
          <button
            className="btn btn-ghost btn-icon"
            onClick={onClose}
            style={{ color: '#ffffff', opacity: 0.8 }}
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: 'var(--space-6)', background: 'var(--bg-card)', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          {/* Top 8 */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
              <Star size={16} style={{ color: 'var(--accent-500)' }} />
              <h4 style={{ margin: 0, fontSize: 'var(--text-md)', fontWeight: 700, color: 'var(--text-primary)' }}>
                Más vendidos ({DAYS} días)
              </h4>
            </div>
            {data.top.length === 0 ? (
              <p className="tpv-insights-empty">Todavía no hay ventas suficientes registradas.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {data.top.map(([key, item], i) => {
                  const pct = data.totalQty > 0 ? Math.round((item.qty / data.totalQty) * 100) : 0;
                  return (
                    <div
                      key={key}
                      style={{
                        padding: '10px 14px',
                        background: 'var(--bg-secondary)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-color)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{
                            width: 20,
                            height: 20,
                            borderRadius: '50%',
                            background: i < 3 ? 'var(--accent-500)' : 'var(--bg-tertiary)',
                            color: i < 3 ? '#ffffff' : 'var(--text-secondary)',
                            fontSize: 'var(--text-2xs)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                          }}>
                            {i + 1}
                          </span>
                          {item.name}
                        </span>
                        <span style={{ color: 'var(--accent-500)', fontWeight: 700 }}>{item.qty} uds</span>
                      </div>
                      <div style={{ height: 6, background: 'var(--border-subtle)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.max(5, pct)}%`, background: 'var(--accent-gradient)', borderRadius: 'var(--radius-full)' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Picos por hora */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
              <Clock size={16} style={{ color: 'var(--accent-500)' }} />
              <h4 style={{ margin: 0, fontSize: 'var(--text-md)', fontWeight: 700, color: 'var(--text-primary)' }}>
                Picos de venta por hora
              </h4>
            </div>
            {data.busyHours.length === 0 ? (
              <p className="tpv-insights-empty">Sin datos de ventas por hora.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {data.busyHours.map(h => (
                  <div key={h.hour} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', fontSize: 'var(--text-xs)' }}>
                    <span style={{ width: 44, fontWeight: 700, color: 'var(--text-secondary)' }}>
                      {String(h.hour).padStart(2, '0')}:00
                    </span>
                    <div style={{ flex: 1, height: 16, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-xs)', overflow: 'hidden', padding: 2 }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${(h.count / data.maxHourCount) * 100}%`,
                          background: 'var(--accent-500)',
                          borderRadius: 'var(--radius-xs)',
                        }}
                      />
                    </div>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', minWidth: 100, textAlign: 'right' }}>
                      {h.count} tkts · {formatCurrency(h.total)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Reposición */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
              <AlertTriangle size={16} style={{ color: 'var(--color-warning)' }} />
              <h4 style={{ margin: 0, fontSize: 'var(--text-md)', fontWeight: 700, color: 'var(--text-primary)' }}>
                Previsión de Reposición
              </h4>
            </div>
            {data.restock.length === 0 ? (
              <p className="tpv-insights-empty">Sin alertas de reposición pendientes.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {data.restock.map(({ product: p, daysLeft }) => (
                  <div
                    key={p.id}
                    style={{
                      padding: '10px 14px',
                      background: 'var(--bg-secondary)',
                      borderRadius: 'var(--radius-md)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      border: '1px solid var(--border-color)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                      <PackageX size={18} style={{ color: daysLeft <= 3 ? 'var(--color-danger)' : 'var(--color-warning)' }} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{p.name}</div>
                        <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)' }}>
                          Stock: {p.stockQuantity} {p.unit} · Umbral mínimo: {p.lowStockThreshold}
                        </div>
                      </div>
                    </div>
                    <span
                      className={`badge ${daysLeft <= 3 ? 'badge-danger' : 'badge-warning'}`}
                      style={{ fontWeight: 700, padding: '4px 10px' }}
                    >
                      {daysLeft === 0 ? 'Agotado' : `~${daysLeft} días`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
