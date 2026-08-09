'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
  Sparkles, Package, TrendingUp, TrendingDown, CalendarDays, Users,
  Boxes, AlertTriangle, ArrowRight
} from 'lucide-react';
import { buildAvisosData } from '@/lib/insights';
import { Invoice, Product } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';

function formatStock(stock: number): string {
  return stock.toLocaleString('es-ES');
}

function StockState({ stock }: { stock: number }) {
  if (stock <= 0) {
    return <span className="badge badge-vencida"><span className="badge-dot" /> Sin stock</span>;
  }
  return <span className="badge badge-pendiente"><span className="badge-dot" /> Quedan {formatStock(stock)}</span>;
}

interface AvisosTendenciasProps {
  products: Product[];
  invoices: Invoice[];
}

export default function AvisosTendencias({ products, invoices }: AvisosTendenciasProps) {
  const data = useMemo(() => buildAvisosData(products, invoices), [products, invoices]);

  const hasInventory = products.length > 0;
  const hasSales = invoices.some(inv => inv.status !== 'anulada');

  if (!hasInventory && !hasSales) {
    return null;
  }

  const stockCount = data.critical.length + data.low.length;
  const riskCount = data.riskClients.length;

  return (
    <section id="tendencias" className="tendencias-section animate-fade-in">
      <div className="tendencias-header">
        <div className="tendencias-heading">
          <h2 className="tendencias-title">
            <Sparkles size={16} /> Avisos y tendencias IA
          </h2>
          <p className="tendencias-subtitle">
            Análisis local de tus facturas y stock · sin enviar datos a internet
          </p>
        </div>
        <div className="tendencias-chips">
          {stockCount > 0 && <span className="tendencias-chip warning"><Package size={13} /> {stockCount} en stock</span>}
          {riskCount > 0 && <span className="tendencias-chip danger"><AlertTriangle size={13} /> {riskCount} clientes en riesgo</span>}
        </div>
      </div>

      <div className="tendencias-grid">
        {/* Stock */}
        <div className="chart-card">
          <div className="chart-header">
            <div className="chart-heading">
              <h3 className="chart-title">Alerta de stock</h3>
              <p className="chart-subtitle">Agotados y bajo el umbral mínimo configurado</p>
            </div>
            <Link href="/productos" className="btn btn-ghost btn-sm">
              Gestionar <ArrowRight size={14} />
            </Link>
          </div>
          {stockCount === 0 ? (
            <div className="chart-empty">
              <div className="chart-empty-label">Stock controlado</div>
              <div className="chart-empty-hint">Todos tus productos activos están por encima de su umbral.</div>
            </div>
          ) : (
            <div className="stats-list">
              {data.critical.map(item => (
                <Link href="/productos" key={item.id} className="stats-item">
                  <div className="stats-item-left">
                    <div>
                      <div className="stats-item-name">{item.name}</div>
                      <div className="stats-item-detail mono">{item.ref}</div>
                    </div>
                  </div>
                  <StockState stock={item.stock} />
                </Link>
              ))}
              {data.low.map(item => (
                <Link href="/productos" key={item.id} className="stats-item">
                  <div className="stats-item-left">
                    <div>
                      <div className="stats-item-name">{item.name}</div>
                      <div className="stats-item-detail mono">{item.ref}</div>
                    </div>
                  </div>
                  <StockState stock={item.stock} />
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Crecimiento / declive */}
        <div className="chart-card">
          <div className="chart-header">
            <div className="chart-heading">
              <h3 className="chart-title">Productos en movimiento</h3>
              <p className="chart-subtitle">Comparativa mes actual vs mes anterior</p>
            </div>
          </div>
          {data.growing.length === 0 && data.declining.length === 0 ? (
            <div className="chart-empty">
              <div className="chart-empty-label">Sin tendencias todavía</div>
              <div className="chart-empty-hint">Compara un mes con el anterior para detectar productos al alza o a la baja.</div>
            </div>
          ) : (
            <div className="trend-columns">
              {data.growing.length > 0 && (
                <div>
                  <div className="trend-column-title up">
                    <TrendingUp size={13} /> En crecimiento
                  </div>
                  <div className="stats-list">
                    {data.growing.map(item => (
                      <div className="stats-item" key={item.name}>
                        <div className="stats-item-left">
                          <div>
                            <div className="stats-item-name">{item.name}</div>
                            <div className="stats-item-detail">{formatCurrency(item.previous)} → {formatCurrency(item.current)}</div>
                          </div>
                        </div>
                        <span className="trend-change up">+{Math.round(item.changePct)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {data.declining.length > 0 && (
                <div>
                  <div className="trend-column-title down">
                    <TrendingDown size={13} /> En declive
                  </div>
                  <div className="stats-list">
                    {data.declining.map(item => (
                      <div className="stats-item" key={item.name}>
                        <div className="stats-item-left">
                          <div>
                            <div className="stats-item-name">{item.name}</div>
                            <div className="stats-item-detail">{formatCurrency(item.previous)} → {formatCurrency(item.current)}</div>
                          </div>
                        </div>
                        <span className="trend-change down">{Math.round(item.changePct)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Proyección de stock */}
        <div className="chart-card">
          <div className="chart-header">
            <div className="chart-heading">
              <h3 className="chart-title">Stock proyectado</h3>
              <p className="chart-subtitle">Días estimados hasta agotar · ritmo de los últimos 30 días</p>
            </div>
          </div>
          {data.projection.length === 0 ? (
            <div className="chart-empty">
              <div className="chart-empty-label">Sin riesgo de rotura</div>
              <div className="chart-empty-hint">Ningún producto se agotará en los próximos 7 días al ritmo de venta actual.</div>
            </div>
          ) : (
            <div className="stats-list">
              {data.projection.map(item => (
                <div className="stats-item" key={item.id}>
                  <div className="stats-item-left">
                    <div>
                      <div className="stats-item-name">{item.name}</div>
                      <div className="stats-item-detail mono">
                        {item.ref} · {formatStock(item.stock)} uds · {item.unitsPerDay.toFixed(2)} uds/día
                      </div>
                    </div>
                  </div>
                  <span className={`badge ${item.daysLeft <= 3 ? 'badge-vencida' : 'badge-pendiente'}`}>
                    <span className="badge-dot" /> ~{item.daysLeft} {item.daysLeft === 1 ? 'día' : 'días'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Ritmo de venta + clientes en riesgo */}
        <div className="chart-card">
          <div className="chart-header">
            <div className="chart-heading">
              <h3 className="chart-title">Ritmo de venta y cobros</h3>
              <p className="chart-subtitle">Días de más facturación y clientes con importes pendientes</p>
            </div>
          </div>

          {data.bestDay ? (
            <div className="day-stats">
              <div className="day-stat">
                <div className="day-stat-label up"><CalendarDays size={13} /> Mejor día</div>
                <div className="day-stat-value">{data.bestDay.label}</div>
                <div className="day-stat-detail">{formatCurrency(data.bestDay.total)} · {data.bestDay.count} {data.bestDay.count === 1 ? 'factura' : 'facturas'}</div>
              </div>
              {data.worstDay ? (
                <div className="day-stat">
                  <div className="day-stat-label down"><CalendarDays size={13} /> Día más flojo</div>
                  <div className="day-stat-value">{data.worstDay.label}</div>
                  <div className="day-stat-detail">{formatCurrency(data.worstDay.total)} · {data.worstDay.count} {data.worstDay.count === 1 ? 'factura' : 'facturas'}</div>
                </div>
              ) : (
                <div className="day-stat">
                  <div className="day-stat-label"><CalendarDays size={13} /> Día más flojo</div>
                  <div className="day-stat-value">—</div>
                  <div className="day-stat-detail">Sin datos suficientes</div>
                </div>
              )}
            </div>
          ) : (
            <div className="chart-empty">
              <div className="chart-empty-label">Sin facturas todavía</div>
              <div className="chart-empty-hint">Emita facturas para ver en qué días concentra más ventas.</div>
            </div>
          )}

          <div className="tendencias-divider" />
          <div className="risk-header">
            <Users size={13} /> Clientes en riesgo
          </div>
          {riskCount === 0 ? (
            <div className="chart-empty">
              <div className="chart-empty-label">
                <Boxes size={16} style={{ verticalAlign: '-3px' }} /> Sin clientes en riesgo
              </div>
              <div className="chart-empty-hint">Ningún cliente acumula facturas pendientes o vencidas.</div>
            </div>
          ) : (
            <div className="stats-list">
              {data.riskClients.map(client => (
                <Link href={`/clientes/${client.id}`} key={client.id} className="stats-item">
                  <div className="stats-item-left">
                    <div>
                      <div className="stats-item-name">{client.name}</div>
                      <div className="stats-item-detail">
                        {client.pendingCount} {client.pendingCount === 1 ? 'factura' : 'facturas'} pendientes
                        {client.overdueTotal > 0 && ' · con vencidas'}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="stats-item-value">{formatCurrency(client.pendingTotal)}</div>
                    {client.overdueTotal > 0 && (
                      <div className="stats-item-detail" style={{ color: 'var(--color-danger)' }}>
                        {formatCurrency(client.overdueTotal)} vencidos
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
