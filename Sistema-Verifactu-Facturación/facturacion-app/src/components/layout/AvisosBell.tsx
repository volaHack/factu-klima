'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, CheckCheck, Package, Receipt, TrendingUp, Users } from 'lucide-react';
import { getInvoices, getProducts } from '@/lib/storage';
import { buildAvisosData, getLastSeenAvisoCount, setAvisosSeen, AvisosData } from '@/lib/insights';
import { formatCurrency } from '@/lib/utils';

function plural(count: number, singular: string, pluralWord: string): string {
  return `${count} ${count === 1 ? singular : pluralWord}`;
}

function formatStock(stock: number): string {
  return stock.toLocaleString('es-ES');
}

function StockBadge({ stock }: { stock: number }) {
  if (stock <= 0) {
    return <span className="badge badge-vencida"><span className="badge-dot" /> Sin stock</span>;
  }
  return <span className="badge badge-pendiente"><span className="badge-dot" /> Quedan {formatStock(stock)}</span>;
}

export default function AvisosBell() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<AvisosData | null>(null);
  const [lastSeen, setLastSeen] = useState(0);
  const bellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [products, invoices] = await Promise.all([getProducts(), getInvoices()]);
      if (cancelled) return;
      setData(buildAvisosData(products, invoices));
      const seen = await getLastSeenAvisoCount();
      if (!cancelled) setLastSeen(seen);
    })();
    return () => { cancelled = true; };
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setOpen(false);
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const total = data?.totalCount ?? 0;
  const unread = Math.max(0, total - lastSeen);

  const markAllAsSeen = async () => {
    await setAvisosSeen(total);
    setLastSeen(total);
  };

  const handleToggle = async () => {
    if (!open && data) {
      await setAvisosSeen(data.totalCount);
      setLastSeen(data.totalCount);
    }
    setOpen(v => !v);
  };

  const hasAnything = data
    ? data.critical.length > 0 || data.low.length > 0 ||
      data.overdueCount > 0 || data.dueSoonCount > 0 || data.riskClients.length > 0
    : false;

  return (
    <div className="avisos-bell" ref={bellRef}>
      <button
        className="btn btn-ghost btn-icon"
        style={{ position: 'relative' }}
        title={total > 0 ? `${total} aviso(s) pendientes` : 'Sin avisos pendientes'}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={handleToggle}
      >
        <Bell size={20} />
        {unread > 0 && (
          <span className="avisos-bell-badge">{unread > 9 ? '9+' : unread}</span>
        )}
      </button>

      {open && (
        <div className="avisos-dropdown" role="menu">
          <div className="avisos-dropdown-header">
            <div className="avisos-dropdown-title">
              Avisos
              {total > 0 && (
                <span className="avisos-dropdown-count">{total}</span>
              )}
            </div>
            {total > 0 && (
              <button className="avisos-mark-read" onClick={markAllAsSeen}>
                <CheckCheck size={14} /> Marcar vistas
              </button>
            )}
          </div>

          <div className="avisos-dropdown-body">
            {!data ? (
              <div className="avisos-empty">Comprobando avisos…</div>
            ) : !hasAnything ? (
              <div className="avisos-empty">
                <div className="avisos-empty-title">Sin avisos pendientes</div>
                <div className="avisos-empty-hint">Stock, cobros y clientes en riesgo aparecerán aquí.</div>
              </div>
            ) : (
              <>
                {(data.critical.length > 0 || data.low.length > 0) && (
                  <div className="avisos-group">
                    <div className="avisos-group-title">
                      <Package size={13} /> Stock
                    </div>
                    {data.critical.slice(0, 3).map(item => (
                      <Link
                        key={item.id}
                        href="/productos"
                        className="avisos-item"
                        onClick={() => setOpen(false)}
                      >
                        <span className="avisos-item-dot critical" />
                        <span className="avisos-item-main">
                          <span className="avisos-item-name">{item.name}</span>
                          <span className="avisos-item-detail mono">{item.ref}</span>
                        </span>
                        <StockBadge stock={item.stock} />
                      </Link>
                    ))}
                    {data.low.slice(0, 3).map(item => (
                      <Link
                        key={item.id}
                        href="/productos"
                        className="avisos-item"
                        onClick={() => setOpen(false)}
                      >
                        <span className="avisos-item-dot low" />
                        <span className="avisos-item-main">
                          <span className="avisos-item-name">{item.name}</span>
                          <span className="avisos-item-detail mono">{item.ref}</span>
                        </span>
                        <StockBadge stock={item.stock} />
                      </Link>
                    ))}
                    {(data.critical.length + data.low.length) > 6 && (
                      <div className="avisos-more">
                        {data.critical.length + data.low.length - 6} más en stock
                      </div>
                    )}
                  </div>
                )}

                {(data.overdueCount > 0 || data.dueSoonCount > 0) && (
                  <div className="avisos-group">
                    <div className="avisos-group-title">
                      <Receipt size={13} /> Cobros
                    </div>
                    <Link href="/facturas" className="avisos-item" onClick={() => setOpen(false)}>
                      <span className="avisos-item-dot critical" />
                      <span className="avisos-item-main">
                        <span className="avisos-item-name">
                          {plural(data.overdueCount, 'factura vencida', 'facturas vencidas')}
                        </span>
                        <span className="avisos-item-detail">{formatCurrency(data.overdueTotal)} por cobrar</span>
                      </span>
                      <span className="badge badge-vencida"><span className="badge-dot" /> Vencidas</span>
                    </Link>
                    {data.dueSoonCount > 0 && (
                      <Link href="/facturas" className="avisos-item" onClick={() => setOpen(false)}>
                        <span className="avisos-item-dot low" />
                        <span className="avisos-item-main">
                          <span className="avisos-item-name">
                            {plural(data.dueSoonCount, 'factura vence', 'facturas vencen')} en 7 días
                          </span>
                          <span className="avisos-item-detail">{formatCurrency(data.dueSoonTotal)} por cobrar</span>
                        </span>
                        <span className="badge badge-pendiente"><span className="badge-dot" /> Próximas</span>
                      </Link>
                    )}
                  </div>
                )}

                {data.riskClients.length > 0 && (
                  <div className="avisos-group">
                    <div className="avisos-group-title">
                      <Users size={13} /> Clientes en riesgo
                    </div>
                    {data.riskClients.slice(0, 3).map(client => (
                      <Link
                        key={client.id}
                        href={`/clientes/${client.id}`}
                        className="avisos-item"
                        onClick={() => setOpen(false)}
                      >
                        <span className="avisos-item-dot low" />
                        <span className="avisos-item-main">
                          <span className="avisos-item-name">{client.name}</span>
                          <span className="avisos-item-detail">
                            {plural(client.pendingCount, 'factura pendiente', 'facturas pendientes')}
                            {client.overdueTotal > 0 && ' · vencidas'}
                          </span>
                        </span>
                        <span className="avisos-item-amount">{formatCurrency(client.pendingTotal)}</span>
                      </Link>
                    ))}
                  </div>
                )}

                {(data.growing.length > 0 || data.projection.length > 0 || data.bestDay) && (
                  <Link href="/dashboard#tendencias" className="avisos-tendencias" onClick={() => setOpen(false)}>
                    <TrendingUp size={15} /> Ver tendencias IA
                  </Link>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
