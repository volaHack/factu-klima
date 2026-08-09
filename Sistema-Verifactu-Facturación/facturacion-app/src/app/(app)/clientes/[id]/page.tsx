'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, FileText, Plus, Mail, Phone, MapPin, Building2, Eye, User } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import TableEmpty from '@/components/ui/TableEmpty';
import { getClientById, getInvoices } from '@/lib/storage';
import { Client, Invoice, InvoiceStatus } from '@/lib/types';
import { formatCurrency, formatDate, getStatusInfo } from '@/lib/utils';
import { PAYMENT_METHODS } from '@/lib/constants';

export default function ClientDetailPage() {
  const params = useParams();
  const [client, setClient] = useState<Client | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    (async () => {
      const id = params.id as string;
      const c = await getClientById(id);
      setClient(c || null);
      if (c) {
        const allInvoices = await getInvoices();
        setInvoices(allInvoices.filter(inv => inv.clientId === c.id));
      }
      setMounted(true);
    })();
  }, [params.id]);

  const stats = useMemo(() => {
    const valid = invoices.filter(i => i.status !== InvoiceStatus.ANULADA);
    const total = valid.reduce((sum, i) => sum + i.total, 0);
    const paid = valid.filter(i => i.status === InvoiceStatus.PAGADA);
    const paidTotal = paid.reduce((sum, i) => sum + i.total, 0);
    const pending = valid.filter(i => i.status === InvoiceStatus.PENDIENTE || i.status === InvoiceStatus.EMITIDA);
    const pendingTotal = pending.reduce((sum, i) => sum + i.total, 0);
    return { total, count: valid.length, paidTotal, pendingCount: pending.length, pendingTotal };
  }, [invoices]);

  if (!mounted) return <PageSkeleton variant="detail" label="Cargando la ficha del cliente" />;

  if (!client) {
    return (
      <div className="empty-state">
        <span className="empty-state-icon"><Building2 strokeWidth={1.6} /></span>
        <h2 className="empty-state-title">Esta ficha ya no existe</h2>
        <p className="empty-state-description">
          El cliente se ha eliminado o el enlace apunta a un identificador que no está en tu cartera.
        </p>
        <div className="empty-state-actions">
          <Link href="/clientes" className="btn btn-primary"><ArrowLeft size={16} /> Volver a clientes</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <Link href="/clientes" className="page-back"><ArrowLeft /> Clientes</Link>
          <div className="page-title-row">
            <h1 className="page-title">{client.tradeName || client.businessName}</h1>
            <span className={`badge ${client.active ? 'badge-activo' : 'badge-inactivo'}`}>
              {client.active ? 'Activo' : 'Inactivo'}
            </span>
          </div>
          <p className="page-subtitle">{client.businessName} · {client.nif}</p>
        </div>
        <div className="page-header-actions">
          <Link href={`/facturas/nueva`} className="btn btn-primary"><Plus size={16} /> Facturar a este cliente</Link>
        </div>
      </div>

      <div className="detail-layout">
        <div className="detail-main">
          {/* Stats */}
          <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 'var(--space-6)' }}>
            <div className="kpi-card" style={{ '--kpi-color': 'var(--accent-500)', '--kpi-bg': 'var(--color-success-bg)' } as React.CSSProperties}>
              <div className="kpi-card-value">{formatCurrency(stats.total)}</div>
              <div className="kpi-card-label">Total facturado ({stats.count} facturas)</div>
            </div>
            <div className="kpi-card" style={{ '--kpi-color': 'var(--color-success)', '--kpi-bg': 'var(--color-success-bg)' } as React.CSSProperties}>
              <div className="kpi-card-value">{formatCurrency(stats.paidTotal)}</div>
              <div className="kpi-card-label">Cobrado</div>
            </div>
            <div className="kpi-card" style={{ '--kpi-color': 'var(--color-warning)', '--kpi-bg': 'var(--color-warning-bg)' } as React.CSSProperties}>
              <div className="kpi-card-value">{formatCurrency(stats.pendingTotal)}</div>
              <div className="kpi-card-label">
                Pendiente de cobro ({stats.pendingCount} {stats.pendingCount === 1 ? 'factura' : 'facturas'})
              </div>
            </div>
          </div>

          {/* Invoice History */}
          <div className="card">
            <div className="card-header">
              <div>
                <h3 className="card-title">Historial de facturas</h3>
                <p className="card-subtitle">De la más reciente a la más antigua</p>
              </div>
            </div>
            <div className="table-container" style={{ border: 'none' }}>
              <table className="table">
                <thead>
                  <tr><th>Nº</th><th>Fecha</th><th>Estado</th><th style={{ textAlign: 'right' }}>Total</th><th></th></tr>
                </thead>
                <tbody>
                  {invoices.sort((a, b) => b.issueDate.localeCompare(a.issueDate)).map(inv => (
                    <tr key={inv.id}>
                      <td className="mono primary"><Link href={`/facturas/${inv.id}`} className="cell-link">{inv.number}</Link></td>
                      <td>{formatDate(inv.issueDate)}</td>
                      <td><span className={`badge badge-${inv.status}`}><span className="badge-dot" />{getStatusInfo(inv.status).label}</span></td>
                      <td className="amount">{formatCurrency(inv.total)}</td>
                      <td><Link href={`/facturas/${inv.id}`} className="btn btn-ghost btn-icon btn-sm" aria-label={`Ver la factura ${inv.number}`}><Eye size={14} /></Link></td>
                    </tr>
                  ))}
                  {invoices.length === 0 && (
                    <TableEmpty
                      colSpan={5}
                      icon={FileText}
                      title="Aún no le has facturado nada"
                      hint="Sus datos fiscales y su forma de pago ya están guardados: al crear la factura se rellenan solos."
                      action={
                        <Link href="/facturas/nueva" className="btn btn-primary btn-sm">
                          <Plus size={14} /> Crear su primera factura
                        </Link>
                      }
                    />
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="detail-sidebar">
          <div className="card">
            <h4 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Contacto</h4>
            <div className="def-list">
              {client.contactPerson && <p className="def-inline"><User /> {client.contactPerson}</p>}
              {client.email && (
                <p className="def-inline"><Mail /> <a href={`mailto:${client.email}`}>{client.email}</a></p>
              )}
              {client.phone && (
                <p className="def-inline"><Phone /> <a href={`tel:${client.phone.replace(/\s/g, '')}`}>{client.phone}</a></p>
              )}
              <p className="def-inline">
                <MapPin />
                <span>{client.address}<br />{client.postalCode} {client.city}<br />{client.province}</span>
              </p>
            </div>
          </div>

          {client.notes && (
            <div className="card">
              <h4 className="card-title" style={{ marginBottom: 'var(--space-3)' }}>Notas internas</h4>
              <p className="def-value">{client.notes}</p>
            </div>
          )}

          <div className="card">
            <h4 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Condiciones de cobro</h4>
            <div className="def-list">
              <div className="def-row">
                <span className="def-label">Vencimiento</span>
                <span className="def-value"><strong>{client.paymentDays} días</strong> desde la emisión</span>
              </div>
              <div className="def-row">
                <span className="def-label">Forma de pago</span>
                <span className="def-value">
                  <strong>{PAYMENT_METHODS.find(pm => pm.value === client.defaultPaymentMethod)?.label || client.defaultPaymentMethod}</strong>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
