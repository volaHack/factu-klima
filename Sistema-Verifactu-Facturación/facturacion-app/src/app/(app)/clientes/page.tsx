'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Plus, Search, SearchX, Edit, Trash2, Users, Eye, X, Check, BarChart3, Tag, Percent } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import TableEmpty from '@/components/ui/TableEmpty';
import ChartCard from '@/components/charts/ChartCard';
import { RankedBars, StatusDonut, ChartLegend } from '@/components/charts/Charts';
import { resolveAccent, SERIES } from '@/components/charts/theme';
import { getClients, saveClient as persistClient, deleteClient as removeClient, getInvoices, getVendedores, getCompanySettings } from '@/lib/storage';
import { Client, Invoice, PaymentMethod, Vendedor, CompanySettings } from '@/lib/types';
import { formatCurrency, generateId } from '@/lib/utils';
import { PAYMENT_METHODS, PROVINCES, PAISES_SELECTOR, esPaisUeNoEspana } from '@/lib/constants';
import { useToast } from '@/hooks/useToast';

export default function ClientesPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState('');
  const [tipoContactoFilter, setTipoContactoFilter] = useState<'todos' | 'clientes' | 'proveedores'>('todos');
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const { success, error: toastError } = useToast();

  // Form state
  const [form, setForm] = useState({
    businessName: '', tradeName: '', nif: '', vatNumber: '', email: '', phone: '',
    contactPerson: '', address: '', city: '', postalCode: '', province: '', country: 'ES',
    paymentDays: 30, defaultPaymentMethod: PaymentMethod.TRANSFERENCIA as PaymentMethod,
    notes: '', active: true, esProveedor: false, vendedorId: '',
    tarifaId: '',
    defaultDiscounts: [0, 0, 0] as [number, number, number],
  });

  useEffect(() => {
    (async () => {
      const [clientsData, allInvoices, vendData, settData] = await Promise.all([
        getClients(),
        getInvoices(),
        getVendedores(),
        getCompanySettings(),
      ]);
      setClients(clientsData);
      setInvoices(allInvoices);
      setVendedores(vendData);
      setSettings(settData);
      setMounted(true);
    })();
  }, []);

  const reload = async () => {
    const [clientsData, allInvoices, vendData] = await Promise.all([
      getClients(),
      getInvoices(),
      getVendedores(),
    ]);
    setClients(clientsData);
    setInvoices(allInvoices);
    setVendedores(vendData);
  };

  const filtered = useMemo(() => {
    let list = clients;
    if (tipoContactoFilter === 'clientes') list = list.filter(c => !c.esProveedor);
    if (tipoContactoFilter === 'proveedores') list = list.filter(c => c.esProveedor);

    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter(c =>
      c.businessName.toLowerCase().includes(q) ||
      c.tradeName.toLowerCase().includes(q) ||
      c.nif.toLowerCase().includes(q) ||
      c.city.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q)
    );
  }, [clients, search, tipoContactoFilter]);

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
      businessName: '', tradeName: '', nif: '', vatNumber: '', email: '', phone: '',
      contactPerson: '', address: '', city: '', postalCode: '', province: '', country: 'ES',
      paymentDays: 30, defaultPaymentMethod: PaymentMethod.TRANSFERENCIA,
      notes: '', active: true,
      esProveedor: tipoContactoFilter === 'proveedores',
      vendedorId: '',
      tarifaId: '',
      defaultDiscounts: [0, 0, 0],
    });
    setShowModal(true);
  };

  const openEditModal = (client: Client) => {
    setEditingClient(client);
    setForm({
      businessName: client.businessName, tradeName: client.tradeName, nif: client.nif,
      vatNumber: client.vatNumber || '',
      email: client.email, phone: client.phone, contactPerson: client.contactPerson,
      address: client.address, city: client.city, postalCode: client.postalCode,
      province: client.province, country: client.country || 'ES',
      paymentDays: client.paymentDays, defaultPaymentMethod: client.defaultPaymentMethod,
      notes: client.notes, active: client.active,
      esProveedor: client.esProveedor ?? false,
      vendedorId: client.vendedorId || '',
      tarifaId: client.tarifaId || '',
      defaultDiscounts: client.defaultDiscounts || [0, 0, 0],
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.businessName || !form.nif) return;
    const client: Client = {
      id: editingClient?.id || generateId(),
      ...form,
      vatNumber: form.vatNumber ? form.vatNumber.trim().toUpperCase() : undefined,
      vendedorId: form.vendedorId || undefined,
      tarifaId: form.tarifaId || undefined,
      defaultDiscounts: form.defaultDiscounts,
      createdAt: editingClient?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    try {
      await persistClient(client);
      await reload();
      setShowModal(false);
      const tipoTxt = client.esProveedor ? 'Proveedor' : 'Cliente';
      success(editingClient ? `${tipoTxt} actualizado` : `${tipoTxt} creado`, form.tradeName || form.businessName);
    } catch (err) {
      toastError('No se pudo guardar', err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  const handleDelete = async (client: Client) => {
    if (confirm(`¿Eliminar el cliente "${client.tradeName || client.businessName}"?`)) {
      await removeClient(client.id);
      await reload();
      success('Cliente eliminado', client.tradeName || client.businessName);
    }
  };

  const updateForm = (field: string, value: unknown) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const updateDefaultDiscount = (index: number, val: number) => {
    setForm(prev => {
      const next: [number, number, number] = [...prev.defaultDiscounts];
      next[index] = val;
      return { ...prev, defaultDiscounts: next };
    });
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

      <div className="tab-group" style={{ marginBottom: 'var(--space-4)', display: 'flex', gap: 'var(--space-2)' }}>
        <button
          className={`btn btn-sm ${tipoContactoFilter === 'todos' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setTipoContactoFilter('todos')}
        >
          Todos ({clients.length})
        </button>
        <button
          className={`btn btn-sm ${tipoContactoFilter === 'clientes' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setTipoContactoFilter('clientes')}
        >
          Clientes ({clients.filter(c => !c.esProveedor).length})
        </button>
        <button
          className={`btn btn-sm ${tipoContactoFilter === 'proveedores' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setTipoContactoFilter('proveedores')}
        >
          Proveedores ({clients.filter(c => c.esProveedor).length})
        </button>
      </div>

      <div className="dashboard-grid" style={{ marginBottom: 'var(--space-6)' }}>
        <ChartCard
          title="Top clientes por facturación"
          subtitle="Basado en facturas emitidas"
        >
          {topClientsData.length > 0 ? (
            <RankedBars data={topClientsData} color={accent} />
          ) : (
            <div className="empty-state-card">Sin datos de facturación</div>
          )}
        </ChartCard>

        <ChartCard
          title="Formas de pago preferidas"
          subtitle="Distribución en cartera de clientes"
        >
          {paymentMethodDistribution.length > 0 ? (
            <>
              <StatusDonut
                data={paymentMethodDistribution}
                centerLabel="Clientes"
                centerValue={String(clients.length)}
              />
              <ChartLegend
                items={paymentMethodDistribution.map(d => ({
                  name: d.name,
                  value: `${d.value} (${Math.round((d.value / clients.length) * 100)}%)`,
                  color: d.color
                }))}
              />
            </>
          ) : (
            <div className="empty-state-card">Sin clientes registrados</div>
          )}
        </ChartCard>
      </div>

      <div className="filter-bar" style={{ marginBottom: 'var(--space-4)' }}>
        <div className="search-box">
          <Search size={16} />
          <input
            className="form-input"
            placeholder="Buscar por nombre, NIF, email o ciudad..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="search-clear" onClick={() => setSearch('')}>
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>NIF/CIF</th>
              <th>Nombre comercial</th>
              <th>Tipo</th>
              <th>Tarifa / Dtos.</th>
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
              const matchedTarifa = settings?.tarifas?.find(t => t.id === client.tarifaId);
              const hasDiscounts = client.defaultDiscounts && (client.defaultDiscounts[0] > 0 || client.defaultDiscounts[1] > 0 || client.defaultDiscounts[2] > 0);

              return (
                <tr key={client.id}>
                  <td className="mono">{client.nif}</td>
                  <td className="primary">
                    <Link href={`/clientes/${client.id}`} className="cell-link">
                      {client.tradeName || client.businessName}
                    </Link>
                    {client.tradeName && <span className="cell-sub">{client.businessName}</span>}
                  </td>
                  <td>
                    <span className={`badge ${client.esProveedor ? 'badge-warning' : 'badge-neutral'}`}>
                      {client.esProveedor ? 'Proveedor' : 'Cliente'}
                    </span>
                  </td>
                  <td>
                    {matchedTarifa ? (
                      <span className="badge badge-outline" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                        <Tag size={11} /> {matchedTarifa.nombre}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Tarifa Base</span>
                    )}
                    {hasDiscounts && (
                      <span className="badge badge-info" style={{ marginLeft: '4px', fontSize: '10px' }}>
                        {[client.defaultDiscounts![0], client.defaultDiscounts![1], client.defaultDiscounts![2]].filter(d => d > 0).map(d => `${d}%`).join('+')}
                      </span>
                    )}
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
            {filtered.length === 0 && (
              <TableEmpty
                colSpan={10}
                icon={SearchX}
                title="No hay clientes que coincidan"
                hint="Prueba a cambiar el término de búsqueda o limpia el filtro."
              />
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editingClient ? 'Editar Contacto' : 'Nuevo Contacto'}</h3>
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
                  <label className="form-label">País</label>
                  <select
                    className="form-select"
                    value={form.country}
                    onChange={e => updateForm('country', e.target.value)}
                  >
                    {PAISES_SELECTOR.map(p => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
                {form.country === 'ES' ? (
                  <div className="form-group">
                    <label className="form-label">Provincia</label>
                    <select className="form-select" value={form.province} onChange={e => updateForm('province', e.target.value)}>
                      <option value="">Selecciona provincia</option>
                      {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                ) : (
                  <div className="form-group">
                    <label className="form-label">
                      NIF-IVA (VAT) {esPaisUeNoEspana(form.country) && <span style={{ color: 'var(--color-primary)', fontSize: 'var(--text-xs)' }}>· UE</span>}
                    </label>
                    <input
                      className="form-input mono"
                      value={form.vatNumber}
                      onChange={e => updateForm('vatNumber', e.target.value.toUpperCase())}
                      placeholder={form.country === 'FR' ? 'FR12345678901' : form.country === 'DE' ? 'DE123456789' : 'Prefijo + Número'}
                    />
                  </div>
                )}
              </div>

              <div className="form-row" style={{ marginTop: 'var(--space-4)', background: 'var(--bg-tertiary)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Tarifa de Precios</label>
                  <select
                    className="form-select"
                    value={form.tarifaId}
                    onChange={e => updateForm('tarifaId', e.target.value)}
                  >
                    <option value="">-- Tarifa Estándar / Base --</option>
                    {settings?.tarifas?.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.nombre} {t.porcentajeDefecto !== undefined ? `(${t.porcentajeDefecto > 0 ? `+${t.porcentajeDefecto}%` : `${t.porcentajeDefecto}%`})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ flex: 2 }}>
                  <label className="form-label">Descuentos en línea por defecto (hasta 3 en cascada)</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-2)' }}>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      className="form-input"
                      placeholder="Dto 1 (%)"
                      value={form.defaultDiscounts[0] || ''}
                      onChange={e => updateDefaultDiscount(0, parseFloat(e.target.value) || 0)}
                    />
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      className="form-input"
                      placeholder="Dto 2 (%)"
                      value={form.defaultDiscounts[1] || ''}
                      onChange={e => updateDefaultDiscount(1, parseFloat(e.target.value) || 0)}
                    />
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      className="form-input"
                      placeholder="Dto 3 (%)"
                      value={form.defaultDiscounts[2] || ''}
                      onChange={e => updateDefaultDiscount(2, parseFloat(e.target.value) || 0)}
                    />
                  </div>
                </div>
              </div>

              <div className="form-row" style={{ marginTop: 'var(--space-4)' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Vendedor asignado</label>
                  <select
                    className="form-select"
                    value={form.vendedorId}
                    onChange={e => updateForm('vendedorId', e.target.value)}
                  >
                    <option value="">-- Sin vendedor asignado --</option>
                    {vendedores.map(v => (
                      <option key={v.id} value={v.id}>{v.nombre}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ flex: 1, display: 'flex', alignItems: 'center', marginTop: 'var(--space-4)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={form.esProveedor}
                      onChange={e => updateForm('esProveedor', e.target.checked)}
                    />
                    <span style={{ fontWeight: 600 }}>Es un Proveedor (para Compras)</span>
                  </label>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSave}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
