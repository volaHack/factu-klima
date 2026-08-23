'use client';

import { useState, useEffect, useMemo } from 'react';
import { Send, AlertTriangle, CheckCircle2, XCircle, Clock, RefreshCw, Info } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { getInvoices, getCompanySettings } from '@/lib/storage';
import type { Invoice, CompanySettings } from '@/lib/types';
import { calcularResumenSii, facturasSinEstadoSii } from '@/lib/sii';
import { formatCurrency } from '@/lib/utils';

export default function SiiPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<'emitidas' | 'recibidas'>('emitidas');

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

  const listaActual = tab === 'emitidas' ? emitidas : recibidas;

  if (!mounted) return <PageSkeleton variant="list" label="Cargando SII" />;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title"><Send size={22} style={{ marginRight: 8 }} />SII — Suministro Inmediato de Información</h1>
          <p className="page-subtitle">Envío de los libros de IVA a la Agencia Tributaria en un plazo de 4 días naturales.</p>
        </div>
      </div>

      {/* Banner explicativo */}
      <div className="card" style={{ background: 'var(--bg-info)', border: '1px solid var(--border-info)', padding: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
          <Info size={20} style={{ color: 'var(--text-accent)', flexShrink: 0, marginTop: 2 }} />
          <div>
            <strong>¿Quién está obligado?</strong>
            <p style={{ margin: '4px 0 0', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
              Empresas con facturación anual superior a 6 millones de euros, las inscritas en el REDEME
              (Registro de Devolución Mensual) y los grupos de IVA. El plazo para enviar cada factura es de
              <strong> 4 días naturales</strong> desde la emisión.
            </p>
          </div>
        </div>
      </div>

      {/* Resumen */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
        <div className="card kpi-card">
          <span className="kpi-label">Pendientes de envío</span>
          <span className="kpi-value" style={{ color: resumen.pendientes > 0 ? 'var(--color-warning)' : 'var(--text-primary)' }}>
            {resumen.pendientes}
          </span>
          {resumen.diasHastaVencimiento !== null && (
            <span className="kpi-subtitle" style={{ color: resumen.diasHastaVencimiento <= 1 ? 'var(--color-danger)' : 'var(--text-secondary)' }}>
              {resumen.diasHastaVencimiento <= 0
                ? '⚠️ Plazo vencido'
                : `${resumen.diasHastaVencimiento} días hasta vencimiento`}
            </span>
          )}
        </div>
        <div className="card kpi-card">
          <span className="kpi-label">Enviadas</span>
          <span className="kpi-value">{resumen.enviadas}</span>
        </div>
        <div className="card kpi-card">
          <span className="kpi-label">Aceptadas por AEAT</span>
          <span className="kpi-value" style={{ color: 'var(--color-success)' }}>{resumen.aceptadas}</span>
        </div>
        <div className="card kpi-card">
          <span className="kpi-label">Rechazadas</span>
          <span className="kpi-value" style={{ color: resumen.rechazadas > 0 ? 'var(--color-danger)' : 'var(--text-primary)' }}>
            {resumen.rechazadas}
          </span>
        </div>
      </div>

      {/* Alerta si hay facturas sin estado SII */}
      {sinEstado.length > 0 && (
        <div className="card" style={{ background: 'var(--bg-warning)', border: '1px solid var(--border-warning)', padding: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
            <AlertTriangle size={18} style={{ color: 'var(--color-warning)' }} />
            <span style={{ fontSize: 'var(--text-sm)' }}>
              <strong>{sinEstado.length} factura{sinEstado.length !== 1 ? 's' : ''}</strong> emitida{sinEstado.length !== 1 ? 's' : ''} sin estado SII.
              Deben marcarse como pendientes y enviarse.
            </span>
          </div>
        </div>
      )}

      {/* Tabs emitidas / recibidas */}
      <div className="tabs" style={{ marginBottom: 'var(--space-4)' }}>
        <button className={`tab ${tab === 'emitidas' ? 'active' : ''}`} onClick={() => setTab('emitidas')}>
          Libro de facturas emitidas ({emitidas.length})
        </button>
        <button className={`tab ${tab === 'recibidas' ? 'active' : ''}`} onClick={() => setTab('recibidas')}>
          Libro de facturas recibidas ({recibidas.length})
        </button>
      </div>

      {/* Tabla de facturas */}
      <div className="card">
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Número</th>
                <th>{tab === 'emitidas' ? 'Cliente' : 'Proveedor'}</th>
                <th>Fecha</th>
                <th style={{ textAlign: 'right' }}>Base</th>
                <th style={{ textAlign: 'right' }}>IVA</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th>Estado SII</th>
              </tr>
            </thead>
            <tbody>
              {listaActual.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--text-secondary)' }}>
                    No hay facturas {tab} en este periodo.
                  </td>
                </tr>
              ) : (
                listaActual.slice(0, 50).map(inv => (
                  <tr key={inv.id}>
                    <td><strong>{inv.number}</strong></td>
                    <td>{inv.clientName}</td>
                    <td>{inv.issueDate}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(inv.subtotal)}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(inv.totalTax)}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(inv.total)}</td>
                    <td>
                      <SiiStatusBadge status={inv.siiStatus} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SiiStatusBadge({ status }: { status?: string }) {
  switch (status) {
    case 'aceptado_sii':
      return <span className="badge badge-success"><CheckCircle2 size={12} /> Aceptado</span>;
    case 'rechazado_sii':
      return <span className="badge badge-danger"><XCircle size={12} /> Rechazado</span>;
    case 'enviado_sii':
      return <span className="badge badge-info"><RefreshCw size={12} /> Enviado</span>;
    case 'pendiente_sii':
      return <span className="badge badge-warning"><Clock size={12} /> Pendiente</span>;
    default:
      return <span className="badge" style={{ opacity: 0.5 }}>—</span>;
  }
}
