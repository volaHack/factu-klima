'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  FileCheck, Info, Search, X, ChevronUp, ChevronDown,
  Copy, Check, FileSpreadsheet, Percent, Receipt, Wallet, Building2,
} from 'lucide-react';
import { motion } from 'motion/react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import TableEmpty from '@/components/ui/TableEmpty';
import { getInvoices } from '@/lib/storage';
import { resumenModelo111, importeRetencion } from '@/lib/retenciones';
import { Invoice } from '@/lib/types';
import { formatCurrency, formatDate } from '@/lib/utils';

type SortField = 'issueDate' | 'number' | 'clientName' | 'subtotal' | 'retencionPct' | 'retenido';

export default function RetencionesPage() {
  const [mounted, setMounted] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const hoy = new Date();
  const currentYear = hoy.getFullYear();

  // Periodo rápido
  const [ejercicio, setEjercicio] = useState(currentYear);
  const [selectedQuarter, setSelectedQuarter] = useState<number | 'all' | 'custom'>(
    Math.ceil((hoy.getMonth() + 1) / 3)
  );

  const [desde, setDesde] = useState(`${currentYear}-01-01`);
  const [hasta, setHasta] = useState(`${currentYear}-03-31`);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('issueDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [copied, setCopied] = useState(false);

  // Sincronizar fechas cuando cambia el trimestre
  const applyQuarter = (q: number | 'all', year: number) => {
    if (q === 'all') {
      setDesde(`${year}-01-01`);
      setHasta(`${year}-12-31`);
    } else {
      const startMonth = String((q - 1) * 3 + 1).padStart(2, '0');
      const endMonth = String(q * 3).padStart(2, '0');
      const endDay = q === 1 ? '31' : q === 2 ? '30' : q === 3 ? '30' : '31';
      setDesde(`${year}-${startMonth}-01`);
      setHasta(`${year}-${endMonth}-${endDay}`);
    }
  };

  useEffect(() => {
    applyQuarter(selectedQuarter === 'custom' ? 1 : selectedQuarter, ejercicio);
  }, [selectedQuarter, ejercicio]);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const inv = await getInvoices();
      if (!vivo) return;
      setInvoices(inv);
      setMounted(true);
    })();
    return () => { vivo = false; };
  }, []);

  const resumen = useMemo(
    () => resumenModelo111(invoices, { desde: desde || undefined, hasta: hasta || undefined }),
    [invoices, desde, hasta],
  );

  const facturasConRetencion = useMemo(() => invoices
    .filter(inv => inv.sentido === 'compra')
    .filter(inv => (inv.tipo ?? 'factura') === 'factura' || inv.tipo === 'rectificativa')
    .filter(inv => inv.status !== 'borrador' && inv.status !== 'anulada')
    .filter(inv => (inv.retencionPct ?? 0) > 0)
    .filter(inv => !desde || inv.issueDate >= desde)
    .filter(inv => !hasta || inv.issueDate <= hasta),
  [invoices, desde, hasta]);

  // Filtrado por búsqueda y ordenación
  const filteredFacturas = useMemo(() => {
    let list = facturasConRetencion;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(f =>
        f.number.toLowerCase().includes(q) ||
        f.clientName.toLowerCase().includes(q) ||
        (f.clientNif && f.clientNif.toLowerCase().includes(q))
      );
    }

    return [...list].sort((a, b) => {
      let cmp = 0;
      const retA = importeRetencion(a.subtotal, a.retencionPct);
      const retB = importeRetencion(b.subtotal, b.retencionPct);

      switch (sortField) {
        case 'issueDate':
          cmp = a.issueDate.localeCompare(b.issueDate);
          break;
        case 'number':
          cmp = a.number.localeCompare(b.number);
          break;
        case 'clientName':
          cmp = a.clientName.localeCompare(b.clientName);
          break;
        case 'subtotal':
          cmp = a.subtotal - b.subtotal;
          break;
        case 'retencionPct':
          cmp = (a.retencionPct ?? 0) - (b.retencionPct ?? 0);
          break;
        case 'retenido':
          cmp = retA - retB;
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [facturasConRetencion, search, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir(field === 'issueDate' ? 'desc' : 'asc');
    }
  };

  // Exportar a CSV
  const exportarCsv = () => {
    const headers = ['Fecha', 'Factura', 'Proveedor', 'NIF Proveedor', 'Base Imponible (€)', '% Retención', 'Total Retenido IRPF (€)'];
    const rows = filteredFacturas.map(f => [
      f.issueDate,
      f.number,
      `"${(f.clientName || '').replace(/"/g, '""')}"`,
      f.clientNif || '',
      f.subtotal.toFixed(2),
      f.retencionPct ?? 0,
      importeRetencion(f.subtotal, f.retencionPct).toFixed(2),
    ]);
    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `retenciones_irpf_modelo111_${desde}_${hasta}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Copiar resumen al portapapeles
  const copiarResumen = async () => {
    const periodoStr = selectedQuarter === 'all'
      ? `Año ${ejercicio}`
      : selectedQuarter !== 'custom'
      ? `${selectedQuarter}T ${ejercicio}`
      : `${desde} a ${hasta}`;

    const texto = `LIQUIDACIÓN RETENCIONES IRPF (MODELO 111) — ${periodoStr}\n` +
      `===================================================\n` +
      `Facturas de profesionales: ${resumen.numFacturas}\n` +
      `Base total sujeta a IRPF: ${formatCurrency(resumen.baseTotal)}\n` +
      `Total retenido a ingresar a Hacienda: ${formatCurrency(resumen.retenido)}\n\n` +
      `DESGLOSE FACTURAS:\n` +
      filteredFacturas.map(f =>
        `• ${formatDate(f.issueDate)} | ${f.number} | ${f.clientName} | Base: ${formatCurrency(f.subtotal)} | ${f.retencionPct}% IRPF | Retenido: ${formatCurrency(importeRetencion(f.subtotal, f.retencionPct))}`
      ).join('\n');

    try {
      await navigator.clipboard.writeText(texto);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // fallback
    }
  };

  if (!mounted) return <PageSkeleton variant="list" label="Cargando retenciones de IRPF" />;

  const retencionMedia = resumen.baseTotal > 0 ? (resumen.retenido / resumen.baseTotal) * 100 : 0;

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 'var(--space-4)' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
              <FileCheck size={24} style={{ color: 'var(--color-primary)' }} />
              Retención de IRPF
            </h1>
            <span
              className="badge"
              style={{
                background: 'rgba(99, 102, 241, 0.12)',
                color: 'var(--color-primary)',
                fontWeight: 700,
                fontSize: 'var(--text-xs)',
              }}
            >
              Modelo 111
            </span>
          </div>
          <p className="page-subtitle" style={{ margin: 'var(--space-1) 0 0 0' }}>
            Cálculo de importes retenidos a profesionales independientes para la liquidación periódica ante la AEAT.
          </p>
        </div>

        {/* Acciones */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={copiarResumen}
            title="Copiar resumen para enviar a la gestoría"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            {copied ? <Check size={15} style={{ color: 'var(--color-success)' }} /> : <Copy size={15} />}
            {copied ? 'Copiado' : 'Copiar para gestoría'}
          </button>

          {facturasConRetencion.length > 0 && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={exportarCsv}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <FileSpreadsheet size={15} /> Exportar CSV
            </button>
          )}
        </div>
      </div>

      {/* Selector de Periodo */}
      <div className="card" style={{ padding: 'var(--space-3) var(--space-4)', marginBottom: 'var(--space-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <select
              className="form-select"
              value={ejercicio}
              onChange={e => setEjercicio(Number(e.target.value))}
              style={{ width: 'auto', minWidth: 90 }}
              aria-label="Ejercicio"
            >
              {[currentYear, currentYear - 1, currentYear - 2].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>

            <div className="periodo-349-trimestres" role="group" aria-label="Trimestre">
              {[1, 2, 3, 4].map(t => (
                <button
                  key={t}
                  type="button"
                  className={`periodo-349-t ${selectedQuarter === t ? 'activo' : ''}`}
                  onClick={() => setSelectedQuarter(t)}
                >
                  {t}T
                </button>
              ))}
              <button
                type="button"
                className={`periodo-349-t ${selectedQuarter === 'all' ? 'activo' : ''}`}
                onClick={() => setSelectedQuarter('all')}
                style={{ padding: '6px var(--space-3)' }}
              >
                Año
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Desde:</span>
              <input
                type="date"
                className="form-input"
                value={desde}
                onChange={e => {
                  setDesde(e.target.value);
                  setSelectedQuarter('custom');
                }}
                style={{ padding: '4px 8px', fontSize: 'var(--text-xs)', width: 'auto' }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Hasta:</span>
              <input
                type="date"
                className="form-input"
                value={hasta}
                onChange={e => {
                  setHasta(e.target.value);
                  setSelectedQuarter('custom');
                }}
                style={{ padding: '4px 8px', fontSize: 'var(--text-xs)', width: 'auto' }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Status Panel */}
      <div className="status-panel status-panel--info" style={{ marginBottom: 'var(--space-4)' }}>
        <span className="status-panel-icon"><Info size={18} /></span>
        <div className="status-panel-body">
          <div className="status-panel-title">Cuándo y cómo se liquida el Modelo 111</div>
          <p className="status-panel-text">
            Corresponde a las retenciones practicadas en facturas de gasto/compra a profesionales independientes y arrendamientos.
            Este resumen te proporciona las casillas exactas (número de perceptores, base de retenciones e importe a ingresar) para cumplimentar la declaración trimestral en la Sede Electrónica de la Agencia Tributaria.
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div
        className="kpi-grid"
        style={{
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: 'var(--space-4)',
          marginBottom: 'var(--space-4)',
        }}
      >
        <motion.div
          className="card kpi-card"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          style={{ '--kpi-color': 'var(--color-primary)' } as React.CSSProperties}
        >
          <div className="kpi-card-header">
            <span className="kpi-card-label">Facturas de profesionales</span>
            <span className="kpi-card-icon"><Receipt size={18} /></span>
          </div>
          <span className="kpi-card-value">{resumen.numFacturas}</span>
          <span className="kpi-card-sub">Perceptores en el periodo</span>
        </motion.div>

        <motion.div
          className="card kpi-card"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
          style={{ '--kpi-color': 'var(--color-info, #06b6d4)' } as React.CSSProperties}
        >
          <div className="kpi-card-header">
            <span className="kpi-card-label">Base sujeta a IRPF</span>
            <span className="kpi-card-icon"><Building2 size={18} /></span>
          </div>
          <span className="kpi-card-value">{formatCurrency(resumen.baseTotal)}</span>
          <span className="kpi-card-sub">Rendimientos dinerarios satisfechos</span>
        </motion.div>

        <motion.div
          className="card kpi-card"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          style={{ '--kpi-color': 'var(--color-success, #10b981)' } as React.CSSProperties}
        >
          <div className="kpi-card-header">
            <span className="kpi-card-label">Total a ingresar en Hacienda</span>
            <span className="kpi-card-icon"><Wallet size={18} /></span>
          </div>
          <span className="kpi-card-value">{formatCurrency(resumen.retenido)}</span>
          <span className="kpi-card-sub">Importe neto de las retenciones</span>
        </motion.div>

        <motion.div
          className="card kpi-card"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          style={{ '--kpi-color': '#8b5cf6' } as React.CSSProperties}
        >
          <div className="kpi-card-header">
            <span className="kpi-card-label">Tipo medio de retención</span>
            <span className="kpi-card-icon"><Percent size={18} /></span>
          </div>
          <span className="kpi-card-value">{retencionMedia.toFixed(1)}%</span>
          <span className="kpi-card-sub">Habitual 15% (o 7% nuevos prof.)</span>
        </motion.div>
      </div>

      {/* Tabla con Búsqueda y Sorting */}
      <div className="card">
        <div style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 360 }}>
            <Search
              size={15}
              style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
                pointerEvents: 'none',
              }}
            />
            <input
              type="text"
              className="form-input"
              placeholder="Buscar por proveedor, NIF o factura..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: 34, width: '100%' }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: 2,
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            Mostrando <strong>{filteredFacturas.length}</strong> factura{filteredFacturas.length !== 1 ? 's' : ''}
          </div>
        </div>

        <div className="table-container">
          <table className="table table--sortable">
            <thead>
              <tr>
                <th
                  onClick={() => handleSort('issueDate')}
                  style={{ cursor: 'pointer', width: 110 }}
                  className={sortField === 'issueDate' ? 'sorted' : ''}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>Fecha</span>
                    {sortField === 'issueDate' && (
                      sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('number')}
                  style={{ cursor: 'pointer', width: 130 }}
                  className={sortField === 'number' ? 'sorted' : ''}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>Factura</span>
                    {sortField === 'number' && (
                      sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('clientName')}
                  style={{ cursor: 'pointer' }}
                  className={sortField === 'clientName' ? 'sorted' : ''}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>Proveedor / Profesional</span>
                    {sortField === 'clientName' && (
                      sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('subtotal')}
                  style={{ cursor: 'pointer', textAlign: 'right', width: 130 }}
                  className={sortField === 'subtotal' ? 'sorted' : ''}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                    <span>Base</span>
                    {sortField === 'subtotal' && (
                      sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('retencionPct')}
                  style={{ cursor: 'pointer', textAlign: 'right', width: 100 }}
                  className={sortField === 'retencionPct' ? 'sorted' : ''}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                    <span>% IRPF</span>
                    {sortField === 'retencionPct' && (
                      sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </div>
                </th>
                <th
                  onClick={() => handleSort('retenido')}
                  style={{ cursor: 'pointer', textAlign: 'right', width: 140 }}
                  className={sortField === 'retenido' ? 'sorted' : ''}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                    <span>Retenido</span>
                    {sortField === 'retenido' && (
                      sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredFacturas.length === 0 ? (
                <TableEmpty
                  colSpan={6}
                  icon={FileCheck}
                  title="No hay facturas de compra con retención en este periodo"
                  hint="Se marca el porcentaje de retención de IRPF al dar de alta la factura de un profesional o servicio."
                />
              ) : (
                filteredFacturas.map(f => {
                  const importeRet = importeRetencion(f.subtotal, f.retencionPct);
                  return (
                    <tr key={f.id}>
                      <td style={{ color: 'var(--text-secondary)' }}>{formatDate(f.issueDate)}</td>
                      <td>
                        <Link
                          href={`/facturas?search=${encodeURIComponent(f.number)}`}
                          style={{
                            fontFamily: 'var(--font-mono, monospace)',
                            fontWeight: 700,
                            color: 'var(--color-primary)',
                            textDecoration: 'none',
                          }}
                        >
                          {f.number}
                        </Link>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {f.clientName}
                        </div>
                        {f.clientNif && (
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                            {f.clientNif}
                          </div>
                        )}
                      </td>
                      <td className="amount" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {formatCurrency(f.subtotal)}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span
                          className="badge"
                          style={{
                            background: 'rgba(139, 92, 246, 0.12)',
                            color: '#8b5cf6',
                            fontWeight: 700,
                          }}
                        >
                          {f.retencionPct}%
                        </span>
                      </td>
                      <td className="amount" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        <strong style={{ color: 'var(--color-primary)' }}>{formatCurrency(importeRet)}</strong>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {filteredFacturas.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={3} style={{ textAlign: 'right', fontWeight: 600 }}>
                    Totales ({filteredFacturas.length} facturas):
                  </td>
                  <td className="amount" style={{ textAlign: 'right', fontWeight: 700 }}>
                    {formatCurrency(filteredFacturas.reduce((s, f) => s + f.subtotal, 0))}
                  </td>
                  <td></td>
                  <td className="amount" style={{ textAlign: 'right', fontWeight: 800, color: 'var(--color-primary)' }}>
                    {formatCurrency(filteredFacturas.reduce((s, f) => s + importeRetencion(f.subtotal, f.retencionPct), 0))}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
