'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, FileText, Plus, Mail, Phone, MapPin, Building2, Eye, User, Calendar, Search, UserCheck } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import TableEmpty from '@/components/ui/TableEmpty';
import { getClientById, getInvoices, getVendedores, getCompanySettings } from '@/lib/storage';
import { Client, Invoice, InvoiceStatus, Vendedor, CompanySettings } from '@/lib/types';
import { formatCurrency, formatDate, getStatusInfo } from '@/lib/utils';
import { PAYMENT_METHODS } from '@/lib/constants';

export default function ClientDetailPage() {
  const params = useParams();
  const [client, setClient] = useState<Client | null>(null);
  const [vendedor, setVendedor] = useState<Vendedor | null>(null);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [mounted, setMounted] = useState(false);
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  useEffect(() => {
    (async () => {
      const id = params.id as string;
      const [c, allInvoices, allVendedores, sett] = await Promise.all([
        getClientById(id),
        getInvoices(),
        getVendedores(),
        getCompanySettings(),
      ]);
      setClient(c || null);
      setSettings(sett);
      if (c) {
        setInvoices(allInvoices.filter(inv => inv.clientId === c.id));
        if (c.vendedorId) {
          const v = allVendedores.find(vend => vend.id === c.vendedorId);
          setVendedor(v || null);
        }
      }
      setMounted(true);
    })();
  }, [params.id]);

  const invoicesFiltradas = useMemo(() => {
    return invoices.filter(inv => {
      if (fechaDesde && inv.issueDate < fechaDesde) return false;
      if (fechaHasta && inv.issueDate > fechaHasta) return false;
      return true;
    });
  }, [invoices, fechaDesde, fechaHasta]);

  const stats = useMemo(() => {
    const valid = invoicesFiltradas.filter(i => i.status !== InvoiceStatus.ANULADA);
    const total = valid.reduce((sum, i) => sum + i.total, 0);
    const paid = valid.filter(i => i.status === InvoiceStatus.PAGADA);
    const paidTotal = paid.reduce((sum, i) => sum + i.total, 0);
    const pending = valid.filter(i => i.status === InvoiceStatus.PENDIENTE || i.status === InvoiceStatus.EMITIDA);
    const pendingTotal = pending.reduce((sum, i) => sum + i.total, 0);
    return { total, count: valid.length, paidTotal, pendingCount: pending.length, pendingTotal };
  }, [invoicesFiltradas]);

  if (!mounted) return <PageSkeleton variant="detail" label="Cargando la ficha del cliente" />;

  if (!client) {
    return (
      <div className="empty-state">
        <span className="empty-state-icon"><Building2 strokeWidth={1.6} /></span>
        <h2 className="empty-state-title">Esta ficha ya no existe</h2>
        <p className="empty-state-description">
          El registro se ha eliminado o el enlace apunta a un identificador que no está en tu cartera.
        </p>
        <div className="empty-state-actions">
          <Link href="/clientes" className="btn btn-primary"><ArrowLeft size={16} /> Volver a contactos</Link>
        </div>
      </div>
    );
  }

  const esProveedor = client.esProveedor;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <Link href="/clientes" className="page-back"><ArrowLeft /> Contactos</Link>
          <div className="page-title-row" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <h1 className="page-title">{client.tradeName || client.businessName}</h1>
            <span className={`badge ${esProveedor ? 'badge-warning' : 'badge-neutral'}`}>
              {esProveedor ? 'Proveedor' : 'Cliente'}
            </span>
            <span className={`badge ${client.active ? 'badge-activo' : 'badge-inactivo'}`}>
              {client.active ? 'Activo' : 'Inactivo'}
            </span>
          </div>
          <p className="page-subtitle">{client.businessName} · {client.nif}</p>
        </div>
        <div className="page-header-actions" style={{ display: 'flex', gap: 'var(--space-2)' }}>
          {esProveedor ? (
            <Link href={`/documentos/nuevo?tipo=albaran&sentido=compra`} className="btn btn-primary">
              <Plus size={16} /> Albarán de compra
            </Link>
          ) : (
            <Link href={`/facturas/nueva`} className="btn btn-primary">
              <Plus size={16} /> Facturar a este cliente
            </Link>
          )}
        </div>
      </div>

      <div className="detail-layout">
        <div className="detail-main">
          {/* Stats */}
          <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 'var(--space-6)' }}>
            <div className="kpi-card" style={{ '--kpi-color': 'var(--accent-500)', '--kpi-bg': 'var(--color-success-bg)' } as React.CSSProperties}>
              <div className="kpi-card-value">{formatCurrency(stats.total)}</div>
              <div className="kpi-card-label">Total documentos ({stats.count})</div>
            </div>
            <div className="kpi-card" style={{ '--kpi-color': 'var(--color-success)', '--kpi-bg': 'var(--color-success-bg)' } as React.CSSProperties}>
              <div className="kpi-card-value">{formatCurrency(stats.paidTotal)}</div>
              <div className="kpi-card-label">Cobrado / Pagado</div>
            </div>
            <div className="kpi-card" style={{ '--kpi-color': 'var(--color-warning)', '--kpi-bg': 'var(--color-warning-bg)' } as React.CSSProperties}>
              <div className="kpi-card-value">{formatCurrency(stats.pendingTotal)}</div>
              <div className="kpi-card-label">
                Pendiente ({stats.pendingCount} {stats.pendingCount === 1 ? 'documento' : 'documentos'})
              </div>
            </div>
          </div>

          {/* Invoice History & Date Filter */}
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
              <div>
                <h3 className="card-title">Relación de documentos</h3>
                <p className="card-subtitle">Filtra facturas y documentos entre fechas</p>
              </div>

              {/* Filtro entre fechas */}
              <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                  <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Desde:</label>
                  <input
                    type="date"
                    className="form-input"
                    style={{ padding: '4px 8px', fontSize: 'var(--text-xs)', width: 'auto' }}
                    value={fechaDesde}
                    onChange={e => setFechaDesde(e.target.value)}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                  <label style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Hasta:</label>
                  <input
                    type="date"
                    className="form-input"
                    style={{ padding: '4px 8px', fontSize: 'var(--text-xs)', width: 'auto' }}
                    value={fechaHasta}
                    onChange={e => setFechaHasta(e.target.value)}
                  />
                </div>
                {(fechaDesde || fechaHasta) && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={() => { setFechaDesde(''); setFechaHasta(''); }}
                  >
                    Limpiar
                  </button>
                )}
              </div>
            </div>

            <div className="table-container" style={{ border: 'none' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Nº</th>
                    <th>Fecha</th>
                    <th>Estado</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {invoicesFiltradas.sort((a, b) => b.issueDate.localeCompare(a.issueDate)).map(inv => (
                    <tr key={inv.id}>
                      <td className="mono primary">
                        <Link href={`/facturas/${inv.id}`} className="cell-link">{inv.number}</Link>
                      </td>
                      <td>{formatDate(inv.issueDate)}</td>
                      <td>
                        <span className={`badge badge-${inv.status}`}>
                          <span className="badge-dot" />{getStatusInfo(inv.status).label}
                        </span>
                      </td>
                      <td className="amount">{formatCurrency(inv.total)}</td>
                      <td>
                        <Link href={`/facturas/${inv.id}`} className="btn btn-ghost btn-icon btn-sm" aria-label={`Ver la factura ${inv.number}`}>
                          <Eye size={14} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {invoicesFiltradas.length === 0 && (
                    <TableEmpty
                      colSpan={5}
                      icon={FileText}
                      title="No hay documentos en este rango de fechas"
                      hint="Modifica los filtros de fecha o crea un nuevo documento."
                      action={
                        <Link href="/facturas/nueva" className="btn btn-primary btn-sm">
                          <Plus size={14} /> Crear documento
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
          {/* Vendedor Asignado */}
          {vendedor && (
            <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
              <h4 className="card-title" style={{ marginBottom: 'var(--space-2)' }}>Vendedor Asignado</h4>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <UserCheck size={16} color="var(--color-primary)" />
                <span style={{ fontWeight: 600 }}>{vendedor.nombre}</span>
              </div>
            </div>
          )}

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
            <h4 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>Condiciones comerciales</h4>
            <div className="def-list">
              <div className="def-row">
                <span className="def-label">Tarifa asignada</span>
                <span className="def-value">
                  <strong>
                    {settings?.tarifas?.find(t => t.id === client.tarifaId)?.nombre || 'Tarifa Estándar / Base'}
                  </strong>
                </span>
              </div>
              {client.defaultDiscounts && (client.defaultDiscounts[0] > 0 || client.defaultDiscounts[1] > 0 || client.defaultDiscounts[2] > 0) && (
                <div className="def-row">
                  <span className="def-label">Descuentos por defecto</span>
                  <span className="def-value">
                    <span className="badge badge-info">
                      {[client.defaultDiscounts[0], client.defaultDiscounts[1], client.defaultDiscounts[2]].filter(d => d > 0).map(d => `${d}%`).join(' + ')}
                    </span>
                  </span>
                </div>
              )}
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
