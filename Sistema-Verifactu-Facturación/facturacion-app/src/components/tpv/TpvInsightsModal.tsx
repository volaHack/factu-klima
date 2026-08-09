'use client';

import { useEffect, useMemo, useState } from 'react';
import { X, TrendingUp, Star, PackageX, AlertTriangle } from 'lucide-react';
import { Invoice, InvoiceStatus, Product } from '@/lib/types';
import { getProducts, getInvoices } from '@/lib/storage';
import { formatCurrency } from '@/lib/utils';
import { daysUntilOutOfStock } from '@/lib/tpvOffline';

interface TpvInsightsModalProps {
  onClose: () => void;
}

const DAYS = 30;

/**
 * Panel "Patrones": lo más vendido (30 días), picos por hora y alertas de
 * reposición. Todo se calcula en cliente sobre los tickets locales
 * (getInvoices), así que funciona sin conexión.
 */
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

    // Unidades vendidas por producto en los últimos 30 días.
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
      .slice(0, 10);

    // Picos por hora del día.
    const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0, total: 0 }));
    for (const inv of recent) {
      const h = new Date(inv.createdAt).getHours();
      hours[h].count += 1;
      hours[h].total += inv.total;
    }
    const maxHourCount = Math.max(1, ...hours.map(h => h.count));
    const busyHours = hours.filter(h => h.count > 0);

    // Alertas de reposición: días estimados hasta agotar el stock al ritmo
    // actual de ventas (unitsSold30d / 30).
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
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" style={{ maxWidth: 620 }}>
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>Calculando patrones…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal tpv-insights-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 620, width: '92vw', maxHeight: '86vh', overflowY: 'auto' }}>
        <div className="tpv-checkout-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <TrendingUp size={18} style={{ color: 'var(--accent-500)' }} />
            <h3 style={{ margin: 0 }}>Patrones de consumo</h3>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginBottom: 'var(--space-3)' }}>
          Basado en los tickets de los últimos {DAYS} días · cálculo local, sin conexión
        </div>

        {/* Top 10 */}
        <section className="tpv-insights-section">
          <h4 className="tpv-insights-title"><Star size={14} /> Más vendidos ({DAYS} días)</h4>
          {data.top.length === 0 ? (
            <p className="tpv-insights-empty">Todavía no hay ventas suficientes para calcular patrones.</p>
          ) : (
            <ol className="tpv-insights-list">
              {data.top.map(([key, item], i) => {
                const pct = data.totalQty > 0 ? Math.round((item.qty / data.totalQty) * 100) : 0;
                return (
                  <li key={key} className="tpv-insights-row">
                    <span className="tpv-insights-rank">{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
                        <span className="tpv-insights-name">{item.name}</span>
                        <span className="tpv-insights-value">{item.qty} uds</span>
                      </div>
                      <div className="tpv-insights-bar" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        {/* Picos por hora */}
        <section className="tpv-insights-section">
          <h4 className="tpv-insights-title">Picos por hora</h4>
          {data.busyHours.length === 0 ? (
            <p className="tpv-insights-empty">Sin datos de ventas por hora.</p>
          ) : (
            <div className="tpv-insights-hours">
              {data.busyHours.map(h => (
                <div key={h.hour} className="tpv-insights-hour-row">
                  <span className="tpv-insights-hour-label">{String(h.hour).padStart(2, '0')}:00</span>
                  <div className="tpv-insights-hour-bar">
                    <div
                      className="tpv-insights-hour-fill"
                      style={{ width: `${(h.count / data.maxHourCount) * 100}%` }}
                    />
                  </div>
                  <span className="tpv-insights-hour-count">{h.count} · {formatCurrency(h.total)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Reposición */}
        <section className="tpv-insights-section">
          <h4 className="tpv-insights-title"><AlertTriangle size={14} /> Reponer pronto</h4>
          {data.restock.length === 0 ? (
            <p className="tpv-insights-empty">Sin alertas de reposición: el stock alcanza o no hay ritmo de venta.</p>
          ) : (
            <ul className="tpv-insights-restock">
              {data.restock.map(({ product: p, daysLeft }) => (
                <li key={p.id} className="tpv-insights-row">
                  <PackageX size={14} style={{ color: daysLeft <= 3 ? 'var(--color-danger)' : 'var(--color-warning)', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span className="tpv-insights-name">{p.name}</span>
                    <div className="tpv-insights-sub">Quedan {p.stockQuantity} {p.unit} · umbral {p.lowStockThreshold}</div>
                  </div>
                  <span className={`badge ${daysLeft <= 3 ? 'badge-danger' : 'badge-warning'}`} style={{ whiteSpace: 'nowrap' }}>
                    {daysLeft === 0 ? 'Agotado' : `~${daysLeft} días`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
