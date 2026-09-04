'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Send, AlertTriangle, CheckCircle2, XCircle, Clock, RefreshCw, Info,
  Search, Filter, X, ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  FileText, ShieldCheck, ChevronDown as Expand,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import TableEmpty from '@/components/ui/TableEmpty';
import { getInvoices, getCompanySettings } from '@/lib/storage';
import type { Invoice, CompanySettings } from '@/lib/types';
import { calcularResumenSii, facturasSinEstadoSii } from '@/lib/sii';
import { resolverTipoFacturaFiscal, resolverClaveRegimenIva } from '@/lib/constants';
import { formatCurrency, formatDate } from '@/lib/utils';

// ============================================================
// TIPOS LOCALES
// ============================================================

type SortField = 'number' | 'clientName' | 'issueDate' | 'subtotal' | 'totalTax' | 'total' | 'siiStatus';
type SiiFilterStatus = 'all' | 'pendiente_sii' | 'enviado_sii' | 'aceptado_sii' | 'rechazado_sii' | 'sin_estado';

const SII_FILTER_OPTIONS: { value: SiiFilterStatus; label: string; color: string }[] = [
  { value: 'pendiente_sii', label: 'Pendiente', color: 'var(--color-warning)' },
  { value: 'enviado_sii', label: 'Enviado', color: 'var(--color-info)' },
  { value: 'aceptado_sii', label: 'Aceptado', color: 'var(--color-success)' },
  { value: 'rechazado_sii', label: 'Rechazado', color: 'var(--color-danger)' },
  { value: 'sin_estado', label: 'Sin estado', color: 'var(--text-muted)' },
];

const TIPO_FACTURA_LABELS: Record<string, string> = {
  F1: 'Factura completa',
  F2: 'Simplificada (ticket)',
  F3: 'Sustitutiva de simplificadas',
  R1: 'Rectificativa (art. 80.1-2-6)',
  R2: 'Rectificativa (art. 80.3)',
  R3: 'Rectificativa (art. 80.4)',
  R4: 'Rectificativa (resto)',
  R5: 'Rectificativa simplificada',
};

const CLAVE_REGIMEN_LABELS: Record<string, string> = {
  '01': 'Régimen general',
  '02': 'Exportación',
  '03': 'Bienes usados',
  '04': 'Oro de inversión',
  '05': 'Agencias de viaje',
  '06': 'Grupo entidades IVA',
  '07': 'Grupo entidades IVA+IGIC',
  '08': 'Criterio de caja',
  '09': 'IPSI/IGIC',
  '10': 'Adq. intracomunitarias',
  '11': 'Entregas intracomunitar. exentas',
  '12': 'No sujetas / inversión suj. pasivo',
  '13': 'Ag. viaje (prest. servicios)',
  '14': 'Cobros por cuenta terceros',
  '15': 'Importaciones sin DUA',
};

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================

export default function SiiPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<'emitidas' | 'recibidas'>('emitidas');

  // Filtros y búsqueda
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<SiiFilterStatus[]>([]);

  // Sorting
  const [sortField, setSortField] = useState<SortField>('issueDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Paginación
  const [page, setPage] = useState(1);
  const pageSize = 15;

  // Fila expandida
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [allInvoices, cs] = await Promise.all([getInvoices(), getCompanySettings()]);
      setInvoices(allInvoices);
      setSettings(cs);
      setMounted(true);
    })();
  }, []);

  const resumen = useMemo(() => calcularResumenSii(invoices), [invoices]);
  const sinEstado = useMemo(() => facturasSinEstadoSii(invoices), [invoices]);

  const emitidas = useMemo(() =>
    invoices.filter(i => i.sentido !== 'compra' && i.tipo !== 'presupuesto' && i.tipo !== 'pedido' && i.tipo !== 'albaran'),
    [invoices]
  );
  const recibidas = useMemo(() =>
    invoices.filter(i => i.sentido === 'compra' && i.tipo !== 'presupuesto' && i.tipo !== 'pedido' && i.tipo !== 'albaran'),
    [invoices]
  );

  // Filtrado
  const filtered = useMemo(() => {
    const base = tab === 'emitidas' ? emitidas : recibidas;
    let list = base;

    // Búsqueda
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(inv =>
        inv.number.toLowerCase().includes(q) ||
        inv.clientName.toLowerCase().includes(q) ||
        (inv.clientNif && inv.clientNif.toLowerCase().includes(q))
      );
    }

    // Filtro por estado SII
    if (statusFilter.length > 0) {
      list = list.filter(inv => {
        if (statusFilter.includes('sin_estado') && !inv.siiStatus) return true;
        return inv.siiStatus && statusFilter.includes(inv.siiStatus as SiiFilterStatus);
      });
    }

    return list;
  }, [tab, emitidas, recibidas, search, statusFilter]);

  // Sorting
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'number': cmp = a.number.localeCompare(b.number, 'es'); break;
        case 'clientName': cmp = a.clientName.localeCompare(b.clientName, 'es'); break;
        case 'issueDate': cmp = a.issueDate.localeCompare(b.issueDate); break;
        case 'subtotal': cmp = a.subtotal - b.subtotal; break;
        case 'totalTax': cmp = a.totalTax - b.totalTax; break;
        case 'total': cmp = a.total - b.total; break;
        case 'siiStatus': cmp = (a.siiStatus || '').localeCompare(b.siiStatus || ''); break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortField, sortDir]);

  // Paginación
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);
  const showingFrom = sorted.length > 0 ? (safePage - 1) * pageSize + 1 : 0;
  const showingTo = Math.min(safePage * pageSize, sorted.length);

  // Compliance bar data
  const totalFacts = emitidas.length + recibidas.length;
  const complianceSegments = useMemo(() => {
    if (totalFacts === 0) return [];
    return [
      { label: 'Aceptadas', count: resumen.aceptadas, color: 'var(--color-success)', bg: 'var(--color-success-bg)' },
      { label: 'Enviadas', count: resumen.enviadas, color: 'var(--color-info)', bg: 'var(--color-info-bg)' },
      { label: 'Pendientes', count: resumen.pendientes, color: 'var(--color-warning)', bg: 'var(--color-warning-bg)' },
      { label: 'Rechazadas', count: resumen.rechazadas, color: 'var(--color-danger)', bg: 'var(--color-danger-bg)' },
    ];
  }, [resumen, totalFacts]);

  // Handlers
  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
    setPage(1);
  }, [sortField]);

  const toggleStatusFilter = useCallback((status: SiiFilterStatus) => {
    setStatusFilter(prev =>
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    );
    setPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setSearch('');
    setStatusFilter([]);
    setPage(1);
  }, []);

  const hasFilters = search.trim() !== '' || statusFilter.length > 0;

  const sortIcon = (field: SortField) => {
    if (sortField !== field) return null;
    return sortDir === 'asc'
      ? <ChevronUp size={12} className="sort-icon" />
      : <ChevronDown size={12} className="sort-icon" />;
  };

  if (!mounted) return <PageSkeleton variant="list" label="Cargando SII" />;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title"><Send size={22} style={{ marginRight: 8 }} />SII — Suministro Inmediato de Información</h1>
          <p className="page-subtitle">Envío de los libros de IVA a la Agencia Tributaria en un plazo de 4 días naturales.</p>
        </div>
      </div>

      {/* Info Panel */}
      <div className="status-panel status-panel--info" style={{ marginBottom: 'var(--space-5)' }}>
        <span className="status-panel-icon"><Info size={18} /></span>
        <div className="status-panel-body">
          <div className="status-panel-title">A quién le toca el SII</div>
          <p className="status-panel-text">
            A quien factura más de 6 millones al año, a los inscritos en el REDEME y a los
            grupos de IVA. Si estás en alguno de esos casos, cada factura hay que remitirla
            en <strong>4 días naturales</strong> desde que se emite.
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid" style={{ marginBottom: 'var(--space-5)' }}>
        {[
          {
            label: 'Pendientes de envío',
            value: resumen.pendientes,
            color: resumen.pendientes > 0 ? 'var(--color-warning)' : 'var(--accent-500)',
            icon: <Clock size={18} />,
            subtitle: resumen.diasHastaVencimiento !== null
              ? resumen.diasHastaVencimiento <= 0
                ? '⚠️ Plazo vencido'
                : `${resumen.diasHastaVencimiento} días hasta vencimiento`
              : undefined,
            subtitleDanger: resumen.diasHastaVencimiento !== null && resumen.diasHastaVencimiento <= 1,
          },
          {
            label: 'Enviadas',
            value: resumen.enviadas,
            color: 'var(--color-info)',
            icon: <RefreshCw size={18} />,
          },
          {
            label: 'Aceptadas por AEAT',
            value: resumen.aceptadas,
            color: 'var(--color-success)',
            icon: <CheckCircle2 size={18} />,
          },
          {
            label: 'Rechazadas',
            value: resumen.rechazadas,
            color: resumen.rechazadas > 0 ? 'var(--color-danger)' : 'var(--accent-500)',
            icon: <XCircle size={18} />,
          },
        ].map((kpi, idx) => (
          <motion.div
            key={kpi.label}
            className="card kpi-card"
            style={{ '--kpi-color': kpi.color } as React.CSSProperties}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: idx * 0.06, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="kpi-card-header">
              <span className="kpi-card-icon" style={{ background: `color-mix(in srgb, ${kpi.color} 14%, transparent)`, color: kpi.color }}>
                {kpi.icon}
              </span>
            </div>
            <div className="kpi-card-value" style={{ color: kpi.color }}>{kpi.value}</div>
            <div className="kpi-card-label">{kpi.label}</div>
            {kpi.subtitle && (
              <div style={{
                marginTop: 'var(--space-1)',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                color: kpi.subtitleDanger ? 'var(--color-danger)' : 'var(--text-muted)',
              }}>
                {kpi.subtitle}
              </div>
            )}
          </motion.div>
        ))}
      </div>

      {/* Mejora 5: Compliance Bar */}
      {totalFacts > 0 && (
        <motion.div
          className="card"
          style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-5)' }}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.28, ease: [0.16, 1, 0.3, 1] }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <ShieldCheck size={16} style={{ color: 'var(--accent-400)' }} />
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 650, color: 'var(--text-primary)' }}>
                Cumplimiento SII
              </span>
            </div>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              {totalFacts} facturas fiscales en total
            </span>
          </div>
          {/* Progress bar */}
          <div style={{
            display: 'flex', height: 10, borderRadius: 'var(--radius-full)',
            overflow: 'hidden', background: 'var(--bg-tertiary)', gap: 1,
          }}>
            {complianceSegments.map((seg, i) => {
              const pct = totalFacts > 0 ? (seg.count / totalFacts) * 100 : 0;
              if (pct === 0) return null;
              return (
                <motion.div
                  key={seg.label}
                  title={`${seg.label}: ${seg.count} (${pct.toFixed(1)}%)`}
                  style={{
                    width: `${pct}%`, background: seg.color,
                    borderRadius: i === 0 ? 'var(--radius-full) 0 0 var(--radius-full)' : i === complianceSegments.length - 1 ? '0 var(--radius-full) var(--radius-full) 0' : 0,
                  }}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.5, delay: 0.35 + i * 0.08, ease: [0.16, 1, 0.3, 1] }}
                />
              );
            })}
          </div>
          {/* Legend */}
          <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', marginTop: 'var(--space-3)' }}>
            {complianceSegments.map(seg => (
              <div key={seg.label} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: seg.color, flexShrink: 0 }} />
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                  {seg.label} <strong style={{ color: 'var(--text-primary)' }}>{seg.count}</strong>
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Warning: Facturas sin estado */}
      {sinEstado.length > 0 && (
        <div className="status-panel status-panel--warning" style={{ marginBottom: 'var(--space-5)' }}>
          <span className="status-panel-icon"><AlertTriangle size={18} /></span>
          <div className="status-panel-body">
            <div className="status-panel-title">
              {sinEstado.length} factura{sinEstado.length !== 1 ? 's' : ''} sin estado en el libro
            </div>
            <p className="status-panel-text">
              Están emitidas pero todavía no constan como pendientes de remitir. Cuentan para
              el plazo de cuatro días igual que las demás.
            </p>
          </div>
        </div>
      )}

      {/* Tabs emitidas / recibidas */}
      <div className="tabs" style={{ marginBottom: 'var(--space-4)' }}>
        <button className={`tab ${tab === 'emitidas' ? 'active' : ''}`} onClick={() => { setTab('emitidas'); setPage(1); setExpandedId(null); }}>
          Libro de facturas emitidas ({emitidas.length})
        </button>
        <button className={`tab ${tab === 'recibidas' ? 'active' : ''}`} onClick={() => { setTab('recibidas'); setPage(1); setExpandedId(null); }}>
          Libro de facturas recibidas ({recibidas.length})
        </button>
      </div>

      {/* Mejora 1: Filters + Search */}
      <div className="filters-bar">
        <div className="search-bar" style={{ maxWidth: 300 }}>
          <div className="search-bar-icon"><Search size={16} /></div>
          <input
            type="text"
            placeholder="Nº factura, cliente o NIF…"
            aria-label="Buscar en el libro SII"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <div className="cluster-sm">
          <Filter size={14} style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
          {SII_FILTER_OPTIONS.map(f => (
            <button
              key={f.value}
              className={`filter-chip ${statusFilter.includes(f.value) ? 'active' : ''}`}
              aria-pressed={statusFilter.includes(f.value)}
              onClick={() => toggleStatusFilter(f.value)}
            >
              <span className="badge-dot" style={{ background: f.color }} />
              {f.label}
            </button>
          ))}
          {hasFilters && (
            <button className="btn btn-ghost btn-sm" onClick={clearFilters}>
              <X size={13} /> Quitar filtros
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="table-container">
        <table className="table table--sortable">
          <thead>
            <tr>
              <th className={sortField === 'number' ? 'sorted' : ''} onClick={() => handleSort('number')}>
                Número {sortIcon('number')}
              </th>
              <th className={sortField === 'clientName' ? 'sorted' : ''} onClick={() => handleSort('clientName')}>
                {tab === 'emitidas' ? 'Cliente' : 'Proveedor'} {sortIcon('clientName')}
              </th>
              <th className={sortField === 'issueDate' ? 'sorted' : ''} onClick={() => handleSort('issueDate')}>
                Fecha {sortIcon('issueDate')}
              </th>
              <th className={sortField === 'subtotal' ? 'sorted' : ''} onClick={() => handleSort('subtotal')} style={{ textAlign: 'right' }}>
                Base {sortIcon('subtotal')}
              </th>
              <th className={sortField === 'totalTax' ? 'sorted' : ''} onClick={() => handleSort('totalTax')} style={{ textAlign: 'right' }}>
                IVA {sortIcon('totalTax')}
              </th>
              <th className={sortField === 'total' ? 'sorted' : ''} onClick={() => handleSort('total')} style={{ textAlign: 'right' }}>
                Total {sortIcon('total')}
              </th>
              <th className={sortField === 'siiStatus' ? 'sorted' : ''} onClick={() => handleSort('siiStatus')}>
                Estado SII {sortIcon('siiStatus')}
              </th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <TableEmpty
                colSpan={8}
                icon={FileText}
                title={hasFilters
                  ? `No se encontraron facturas ${tab} con esos filtros`
                  : `No hay facturas ${tab} en este periodo`}
                hint={hasFilters
                  ? 'Prueba a ampliar el rango o quitar algún filtro.'
                  : undefined}
                action={hasFilters ? (
                  <button className="btn btn-secondary btn-sm" onClick={clearFilters}>
                    <X size={13} /> Quitar filtros
                  </button>
                ) : undefined}
              />
            ) : (
              paginated.map((inv, idx) => (
                <SiiTableRow
                  key={inv.id}
                  inv={inv}
                  tab={tab}
                  settings={settings}
                  expanded={expandedId === inv.id}
                  onToggleExpand={() => setExpandedId(prev => prev === inv.id ? null : inv.id)}
                  idx={idx}
                />
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {sorted.length > pageSize && (
          <div className="pagination">
            <span>
              Mostrando {showingFrom}–{showingTo} de {sorted.length}
            </span>
            <div className="pagination-controls">
              <button
                className="pagination-btn"
                disabled={safePage <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                aria-label="Página anterior"
              >
                <ChevronLeft size={14} />
              </button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 7) {
                  pageNum = i + 1;
                } else if (safePage <= 4) {
                  pageNum = i + 1;
                } else if (safePage >= totalPages - 3) {
                  pageNum = totalPages - 6 + i;
                } else {
                  pageNum = safePage - 3 + i;
                }
                return (
                  <button
                    key={pageNum}
                    className={`pagination-btn ${safePage === pageNum ? 'active' : ''}`}
                    onClick={() => setPage(pageNum)}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                className="pagination-btn"
                disabled={safePage >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                aria-label="Página siguiente"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// FILA DE TABLA CON DETALLE EXPANDIBLE (Mejora 4)
// ============================================================

function SiiTableRow({
  inv,
  tab,
  settings,
  expanded,
  onToggleExpand,
  idx,
}: {
  inv: Invoice;
  tab: 'emitidas' | 'recibidas';
  settings: CompanySettings | null;
  expanded: boolean;
  onToggleExpand: () => void;
  idx: number;
}) {
  const tipoFactura = resolverTipoFacturaFiscal(inv);
  const claveRegimen = settings ? resolverClaveRegimenIva(inv, settings) : '01';

  return (
    <>
      <motion.tr
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25, delay: idx * 0.03, ease: [0.16, 1, 0.3, 1] }}
        style={{ cursor: 'pointer' }}
        onClick={onToggleExpand}
      >
        <td className="primary">
          <span className="mono">{inv.number}</span>
        </td>
        <td>
          {inv.clientName}
          {inv.clientNif && <span className="cell-sub">{inv.clientNif}</span>}
        </td>
        <td>{formatDate(inv.issueDate)}</td>
        <td className="amount">{formatCurrency(inv.subtotal)}</td>
        <td className="amount">{formatCurrency(inv.totalTax)}</td>
        <td className="amount">{formatCurrency(inv.total)}</td>
        <td><SiiStatusBadge status={inv.siiStatus} /></td>
        <td style={{ textAlign: 'center' }}>
          <motion.span
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            style={{ display: 'inline-flex', color: expanded ? 'var(--accent-400)' : 'var(--text-muted)' }}
          >
            <Expand size={14} />
          </motion.span>
        </td>
      </motion.tr>
      <AnimatePresence>
        {expanded && (
          <tr>
            <td colSpan={8} style={{ padding: 0, border: 'none' }}>
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                style={{ overflow: 'hidden' }}
              >
                <div style={{
                  padding: 'var(--space-4) var(--space-5)',
                  background: 'var(--bg-tertiary)',
                  borderBottom: '1px solid var(--border-subtle)',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: 'var(--space-4)',
                }}>
                  <DetailField
                    label="Tipo factura fiscal"
                    value={`${tipoFactura} — ${TIPO_FACTURA_LABELS[tipoFactura] || tipoFactura}`}
                  />
                  <DetailField
                    label="Clave régimen IVA"
                    value={`${claveRegimen} — ${CLAVE_REGIMEN_LABELS[claveRegimen] || claveRegimen}`}
                  />
                  <DetailField
                    label={tab === 'emitidas' ? 'NIF Cliente' : 'NIF Proveedor'}
                    value={inv.clientNif || inv.clientVatNumber || '—'}
                    mono
                  />
                  <DetailField
                    label="Sentido"
                    value={tab === 'emitidas' ? 'Factura emitida' : 'Factura recibida'}
                  />
                  {inv.esIntracomunitaria && (
                    <DetailField
                      label="Intracomunitaria"
                      value={`Sí · VAT ${inv.clientVatNumber || '—'}`}
                    />
                  )}
                  {inv.taxBreakdown && inv.taxBreakdown.length > 0 && (
                    <div style={{ gridColumn: '1 / -1' }}>
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 'var(--tracking-caps)', display: 'block', marginBottom: 'var(--space-2)' }}>
                        Desglose IVA
                      </span>
                      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                        {inv.taxBreakdown.map((tb, i) => (
                          <div key={i} style={{
                            padding: 'var(--space-2) var(--space-3)',
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 'var(--radius-md)',
                            fontSize: 'var(--text-xs)',
                          }}>
                            <span style={{ fontWeight: 650, color: 'var(--text-primary)' }}>{tb.rate}%</span>
                            <span style={{ color: 'var(--text-muted)', margin: '0 var(--space-2)' }}>·</span>
                            <span style={{ color: 'var(--text-secondary)' }}>Base: {formatCurrency(tb.base)}</span>
                            <span style={{ color: 'var(--text-muted)', margin: '0 var(--space-2)' }}>·</span>
                            <span style={{ fontWeight: 600, color: 'var(--accent-400)' }}>Cuota: {formatCurrency(tb.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {inv.notes && (
                    <DetailField
                      label="Descripción de la operación"
                      value={inv.notes}
                    />
                  )}
                </div>
              </motion.div>
            </td>
          </tr>
        )}
      </AnimatePresence>
    </>
  );
}

// ============================================================
// COMPONENTES AUXILIARES
// ============================================================

function DetailField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <span style={{
        fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: 'var(--tracking-caps)',
        display: 'block', marginBottom: 2,
      }}>
        {label}
      </span>
      <span style={{
        fontSize: 'var(--text-sm)', color: 'var(--text-primary)', fontWeight: 500,
        fontFamily: mono ? 'var(--font-mono)' : undefined,
        letterSpacing: mono ? 0 : undefined,
      }}>
        {value}
      </span>
    </div>
  );
}

function SiiStatusBadge({ status }: { status?: string }) {
  switch (status) {
    case 'aceptado_sii':
      return (
        <span className="badge" style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)' }}>
          <CheckCircle2 size={12} /> Aceptado
        </span>
      );
    case 'rechazado_sii':
      return (
        <span className="badge" style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}>
          <XCircle size={12} /> Rechazado
        </span>
      );
    case 'enviado_sii':
      return (
        <span className="badge" style={{ background: 'var(--color-info-bg)', color: 'var(--color-info)' }}>
          <RefreshCw size={12} /> Enviado
        </span>
      );
    case 'pendiente_sii':
      return (
        <span className="badge" style={{ background: 'var(--color-warning-bg)', color: 'var(--color-warning)' }}>
          <Clock size={12} /> Pendiente
        </span>
      );
    default:
      return (
        <span className="badge" style={{ background: 'var(--color-neutral-bg)', color: 'var(--color-neutral)' }}>
          — Sin estado
        </span>
      );
  }
}
