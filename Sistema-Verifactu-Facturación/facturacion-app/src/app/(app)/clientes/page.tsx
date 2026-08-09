'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Plus, Search, SearchX, Edit, Trash2, Users, Eye, X, Check, BarChart3 } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import TableEmpty from '@/components/ui/TableEmpty';
import ChartCard from '@/components/charts/ChartCard';
import { RankedBars, StatusDonut, ChartLegend } from '@/components/charts/Charts';
import { resolveAccent, SERIES } from '@/components/charts/theme';
import { getClients, saveClient as persistClient, deleteClient as removeClient, getInvoices } from '@/lib/storage';
import { Client, Invoice, PaymentMethod } from '@/lib/types';
import { formatCurrency, generateId } from '@/lib/utils';
import { PAYMENT_METHODS, PROVINCES } from '@/lib/constants';
import { useToast } from '@/hooks/useToast';

export default function ClientesPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const { success, error: toastError } = useToast();

  // Form state
  const [form, setForm] = useState({
    businessName: '', tradeName: '', nif: '', email: '', phone: '',
    contactPerson: '', address: '', city: '', postalCode: '', province: '', country: 'España',
    paymentDays: 30, defaultPaymentMethod: PaymentMethod.TRANSFERENCIA as PaymentMethod,
    notes: '', active: true,
  });

  useEffect(() => {
    (async () => {
      const [clientsData, allInvoices] = await Promise.all([getClients(), getInvoices()]);
      setClients(clientsData);
      setInvoices(allInvoices);
      setMounted(true);
    })();
  }, []);

  const reload = async () => {
    const [clientsData, allInvoices] = await Promise.all([getClients(), getInvoices()]);
    setClients(clientsData);
    setInvoices(allInvoices);
  };

  const filtered = useMemo(() => {
    if (!search) return clients;
    const q = search.toLowerCase();
    return clients.filter(c =>
      c.businessName.toLowerCase().includes(q) ||
      c.tradeName.toLowerCase().includes(q) ||
      c.nif.toLowerCase().includes(q) ||
      c.city.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q)
    );
  }, [clients, search]);

  const getClientStats = (clientId: string) => {
    const clientInvs = invoices.filter(i => i.clientId === clientId && i.status !== 'anulada');
    const total = clientInvs.reduce((sum, i) => sum + i.total, 0);
    return { count: clientInvs.length, total };
  };

  // Recharts Analytics Data
  const accent = useMemo(() => resolveAccent(), []);

  const topClientsData = useMemo(() => {
    return clients
      .map(c => {
        const stats = getClientStats(c.id);
        return {
          id: c.id,
          name: c.tradeName || c.businessName,
          total: Number(stats.total.toFixed(2)),
          count: stats.count
        };
      })
      .filter(c => c.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
  }, [clients, invoices]);

  const paymentMethodDistribution = useMemo(() => {
    const methodCounts = new Map<string, number>();
    clients.forEach(c => {
      const pm = c.defaultPaymentMethod || 'transferencia';
      methodCounts.set(pm, (methodCounts.get(pm) || 0) + 1);
    });

    const colors = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];
    const pmLabels: Record<string, string> = {
      transferencia: 'Transferencia bancaria',
      tarjeta: 'Tarjeta de crédito',
      efectivo: 'Efectivo / Contado',
      domiciliacion: 'Domiciliación SEPA',
      bizum: 'Bizum / Móvil'
    };

    return Array.from(methodCounts.entries()).map(([method, count], idx) => ({
      name: pmLabels[method] || method,
      value: count,
      color: colors[idx % colors.length]
    }));
  }, [clients]);

  const openCreateModal = () => {
    setEditingClient(null);
    setForm({
      businessName: '', tradeName: '', nif: '', email: '', phone: '',
      contactPerson: '', address: '', city: '', postalCode: '', province: '', country: 'España',
      paymentDays: 30, defaultPaymentMethod: PaymentMethod.TRANSFERENCIA,
      notes: '', active: true,
    });
    setShowModal(true);
  };

  const openEditModal = (client: Client) => {
    setEditingClient(client);
    setForm({
      businessName: client.businessName, tradeName: client.tradeName, nif: client.nif,
      email: client.email, phone: client.phone, contactPerson: client.contactPerson,
      address: client.address, city: client.city, postalCode: client.postalCode,
      province: client.province, country: client.country,
      paymentDays: client.paymentDays, defaultPaymentMethod: client.defaultPaymentMethod,
      notes: client.notes, active: client.active,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.businessName || !form.nif) return;
    const client: Client = {
      id: editingClient?.id || generateId(), ...form,
      createdAt: editingClient?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    try {
      await persistClient(client);
      await reload();
      setShowModal(false);
      success(editingClient ? 'Cliente actualizado' : 'Cliente creado', form.tradeName || form.businessName);
    } catch (err) {
      toastError('No se pudo guardar el cliente', err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  const handleDelete = async (client: Client) => {
    if (confirm(`¿Eliminar el cliente "${client.tradeName || client.businessName}"?`)) {
      await removeClient(client.id);
      await reload();
      success('Cliente eliminado', client.tradeName || client.businessName);
    }
  };

  const updateForm = (field: string, value: string | number | boolean) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  if (!mounted) {
    return <PageSkeleton variant="list" label="Cargando los clientes" />;
  }

  const activeCount = clients.filter(c => c.active).length;
  const totalClientRevenue = invoices.filter(i => i.status !== 'anulada').reduce((sum, i) => sum + i.total, 0);

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <p className="page-eyebrow"><Users /> Cartera</p>
          <h1 className="page-title">Clientes</h1>
          {clients.length > 0 && (
            <div className="page-meta">
              <span className="page-meta-item">
                <span className="page-meta-value">{clients.length}</span>
                <span className="page-meta-label">en ficha</span>
              </span>
              <span className="page-meta-item">
                <span className="page-meta-value is-success">{activeCount}</span>
                <span className="page-meta-label">activos</span>
              </span>
              <span className="page-meta-item">
                <span className="page-meta-value">{formatCurrency(totalClientRevenue)}</span>
                <span className="page-meta-label">facturación acumulada</span>
              </span>
            </div>
          )}
        </div>
        <div className="page-header-actions">
          <button className="btn btn-primary" onClick={openCreateModal}>
            <Plus size={16} /> Nuevo cliente
          </button>
        </div>
      </div>

      {/* Integrated Recharts Analytics Block */}
      {clients.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 'var(--space-5)', marginBottom: 'var(--space-6)' }}>
          <ChartCard
            title="Top Clientes por Facturación (€)"
            subtitle="Los clientes con mayor volumen de compras acumulado"
            height={220}
            isEmpty={topClientsData.length === 0}
            emptyLabel="Sin facturación por cliente todavía"
            tableColumns={[
              { key: 'name', label: 'Cliente' },
              { key: 'count', label: 'Facturas', align: 'right' },
              { key: 'total', label: 'Total Facturado', align: 'right', format: (v: unknown) => formatCurrency(Number(v)) },
            ]}
            tableRows={topClientsData}
          >
            <RankedBars data={topClientsData} color={accent} />
          </ChartCard>

          <ChartCard
            title="Métodos de Pago Preferidos"
            subtitle="Distribución de clientes según su forma de cobro habitual"
            height={220}
            isEmpty={paymentMethodDistribution.length === 0}
            emptyLabel="Sin datos de pago"
            tableColumns={[
              { key: 'name', label: 'Método de Pago' },
              { key: 'value', label: 'Clientes', align: 'right' },
            ]}
            tableRows={paymentMethodDistribution}
            legend={
              <ChartLegend
                items={paymentMethodDistribution.map(pm => ({
                  name: pm.name,
                  value: `${pm.value} cliente(s)`,
                  color: pm.color
                }))}
              />
            }
          >
            <StatusDonut
              data={paymentMethodDistribution}
              centerLabel="Clientes"
              centerValue={String(clients.length)}
            />
          </ChartCard>
        </div>
      )}

      {/* Search */}
      <div className="filters-bar">
        <div className="search-bar" style={{ maxWidth: 400 }}>
          <div className="search-bar-icon"><Search size={16} /></div>
          <input
            type="text" placeholder="Nombre, NIF, ciudad o email"
            aria-label="Buscar clientes"
            value={search} onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>NIF/CIF</th>
              <th>Nombre comercial</th>
              <th>Ciudad</th>
              <th>Contacto</th>
              <th>Facturas</th>
              <th style={{ textAlign: 'right' }}>Total facturado</th>
              <th>Estado</th>
              <th style={{ width: 120 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(client => {
              const stats = getClientStats(client.id);
              return (
                <tr key={client.id}>
                  <td className="mono">{client.nif}</td>
                  <td className="primary">
                    <Link href={`/clientes/${client.id}`} className="cell-link">
                      {client.tradeName || client.businessName}
                    </Link>
                    {client.tradeName && <span className="cell-sub">{client.businessName}</span>}
                  </td>
                  <td>{client.city}</td>
                  <td>
                    {client.contactPerson}
                    {client.phone && <span className="cell-sub">{client.phone}</span>}
                  </td>
                  <td>{stats.count}</td>
                  <td className="amount">{formatCurrency(stats.total)}</td>
                  <td>
                    <span className={`badge ${client.active ? 'badge-activo' : 'badge-inactivo'}`}>
                      {client.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      <Link href={`/clientes/${client.id}`} className="btn btn-ghost btn-xs" title="Ver ficha">
                        <Eye size={14} />
                      </Link>
                      <button className="btn btn-ghost btn-xs" onClick={() => openEditModal(client)} title="Editar">
                        <Edit size={14} />
                      </button>
                      <button className="btn btn-ghost btn-xs" onClick={() => handleDelete(client)} title="Eliminar">
                        <Trash2 size={14} style={{ color: 'var(--color-danger)' }} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <TableEmpty
            colSpan={8}
            icon={SearchX}
            title="No hay clientes"
            hint="Prueba a buscar con otro término o crea un nuevo cliente."
          />
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editingClient ? 'Editar Cliente' : 'Nuevo Cliente'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label required">Razón social / Nombre fiscal</label>
                  <input className="form-input" value={form.businessName} onChange={e => updateForm('businessName', e.target.value)} placeholder="Ej: Acme Solutions S.L." />
                </div>
                <div className="form-group">
                  <label className="form-label">Nombre comercial (opcional)</label>
                  <input className="form-input" value={form.tradeName} onChange={e => updateForm('tradeName', e.target.value)} placeholder="Ej: Acme" />
                </div>
              </div>
              <div className="form-row" style={{ marginTop: 'var(--space-4)' }}>
                <div className="form-group">
                  <label className="form-label required">NIF / CIF / NIE</label>
                  <input className="form-input mono" value={form.nif} onChange={e => updateForm('nif', e.target.value)} placeholder="B12345678" />
                </div>
                <div className="form-group">
                  <label className="form-label">Email de facturación</label>
                  <input className="form-input" type="email" value={form.email} onChange={e => updateForm('email', e.target.value)} placeholder="facturacion@acme.es" />
                </div>
              </div>
              <div className="form-row" style={{ marginTop: 'var(--space-4)' }}>
                <div className="form-group">
                  <label className="form-label">Teléfono de contacto</label>
                  <input className="form-input" value={form.phone} onChange={e => updateForm('phone', e.target.value)} placeholder="+34 600 000 000" />
                </div>
                <div className="form-group">
                  <label className="form-label">Persona de contacto</label>
                  <input className="form-input" value={form.contactPerson} onChange={e => updateForm('contactPerson', e.target.value)} placeholder="María García" />
                </div>
              </div>
              <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
                <label className="form-label">Dirección fiscal</label>
                <input className="form-input" value={form.address} onChange={e => updateForm('address', e.target.value)} placeholder="Calle Mayor 12, 3º B" />
              </div>
              <div className="form-row" style={{ marginTop: 'var(--space-4)' }}>
                <div className="form-group">
                  <label className="form-label">Ciudad</label>
                  <input className="form-input" value={form.city} onChange={e => updateForm('city', e.target.value)} placeholder="Madrid" />
                </div>
                <div className="form-group">
                  <label className="form-label">Código Postal</label>
                  <input className="form-input mono" value={form.postalCode} onChange={e => updateForm('postalCode', e.target.value)} placeholder="28001" />
                </div>
                <div className="form-group">
                  <label className="form-label">Provincia</label>
                  <select className="form-select" value={form.province} onChange={e => updateForm('province', e.target.value)}>
                    <option value="">Selecciona provincia</option>
                    {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSave}>Guardar cliente</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
