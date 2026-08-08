'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Plus, Search, SearchX, Edit, Trash2, Users, Eye, X, Check } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import TableEmpty from '@/components/ui/TableEmpty';
import { getClients, saveClient as persistClient, deleteClient as removeClient, getInvoices } from '@/lib/storage';
import {
  Client, Invoice, PaymentMethod
} from '@/lib/types';
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
      const [clients, allInvoices] = await Promise.all([getClients(), getInvoices()]);
      setClients(clients);
      setInvoices(allInvoices);
      setMounted(true);
    })();
  }, []);

  const reload = async () => {
    const [clients, allInvoices] = await Promise.all([getClients(), getInvoices()]);
    setClients(clients);
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
            </div>
          )}
        </div>
        <div className="page-header-actions">
          <button className="btn btn-primary" onClick={openCreateModal}>
            <Plus size={16} /> Nuevo cliente
          </button>
        </div>
      </div>

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
                    <div className="row-actions">
                      <Link href={`/clientes/${client.id}`} className="btn btn-ghost btn-icon btn-sm" aria-label={`Ver la ficha de ${client.tradeName || client.businessName}`}><Eye size={14} /></Link>
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openEditModal(client)} aria-label={`Editar ${client.tradeName || client.businessName}`}><Edit size={14} /></button>
                      <button className="btn btn-ghost btn-icon btn-sm btn-danger-ghost" onClick={() => handleDelete(client)} aria-label={`Eliminar ${client.tradeName || client.businessName}`}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && search && (
              <TableEmpty
                colSpan={8}
                icon={SearchX}
                title={`Ningún cliente coincide con «${search}»`}
                hint="Se busca por razón social, nombre comercial, NIF, ciudad y email."
                action={
                  <button className="btn btn-secondary btn-sm" onClick={() => setSearch('')}>
                    <X size={14} /> Limpiar búsqueda
                  </button>
                }
              />
            )}
            {filtered.length === 0 && !search && (
              <TableEmpty
                colSpan={8}
                icon={Users}
                title="Tu cartera está vacía"
                hint="Guarda aquí a quien factures y sus datos (NIF, dirección, vencimiento, forma de pago) se rellenarán solos en cada factura nueva."
                action={
                  <button className="btn btn-primary btn-sm" onClick={openCreateModal}>
                    <Plus size={14} /> Dar de alta el primer cliente
                  </button>
                }
              />
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{editingClient ? 'Editar cliente' : 'Nuevo cliente'}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label required">Razón social</label>
                  <input className="form-input" value={form.businessName} onChange={e => updateForm('businessName', e.target.value)} placeholder="Empresa S.L." />
                </div>
                <div className="form-group">
                  <label className="form-label">Nombre comercial</label>
                  <input className="form-input" value={form.tradeName} onChange={e => updateForm('tradeName', e.target.value)} placeholder="Nombre comercial" />
                </div>
              </div>
              <div className="form-row" style={{ marginTop: 'var(--space-4)' }}>
                <div className="form-group">
                  <label className="form-label required">NIF/CIF</label>
                  <input className="form-input" value={form.nif} onChange={e => updateForm('nif', e.target.value)} placeholder="B12345678" />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input className="form-input" type="email" value={form.email} onChange={e => updateForm('email', e.target.value)} placeholder="email@empresa.es" />
                </div>
              </div>
              <div className="form-row" style={{ marginTop: 'var(--space-4)' }}>
                <div className="form-group">
                  <label className="form-label">Teléfono</label>
                  <input className="form-input" value={form.phone} onChange={e => updateForm('phone', e.target.value)} placeholder="+34 900 000 000" />
                </div>
                <div className="form-group">
                  <label className="form-label">Persona de contacto</label>
                  <input className="form-input" value={form.contactPerson} onChange={e => updateForm('contactPerson', e.target.value)} />
                </div>
              </div>
              <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
                <label className="form-label">Dirección</label>
                <input className="form-input" value={form.address} onChange={e => updateForm('address', e.target.value)} placeholder="Calle, número, piso" />
              </div>
              <div className="form-row" style={{ marginTop: 'var(--space-4)' }}>
                <div className="form-group">
                  <label className="form-label">Código postal</label>
                  <input className="form-input" value={form.postalCode} onChange={e => updateForm('postalCode', e.target.value)} placeholder="28001" />
                </div>
                <div className="form-group">
                  <label className="form-label">Ciudad</label>
                  <input className="form-input" value={form.city} onChange={e => updateForm('city', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Provincia</label>
                  <select className="form-select" value={form.province} onChange={e => updateForm('province', e.target.value)}>
                    <option value="">Seleccionar...</option>
                    {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row" style={{ marginTop: 'var(--space-4)' }}>
                <div className="form-group">
                  <label className="form-label">Días de vencimiento</label>
                  <input className="form-input" type="number" min={0} value={form.paymentDays} onChange={e => updateForm('paymentDays', parseInt(e.target.value) || 0)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Forma de pago por defecto</label>
                  <select className="form-select" value={form.defaultPaymentMethod} onChange={e => updateForm('defaultPaymentMethod', e.target.value)}>
                    {PAYMENT_METHODS.map(pm => <option key={pm.value} value={pm.value}>{pm.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group" style={{ marginTop: 'var(--space-4)' }}>
                <label className="form-label">Notas internas</label>
                <textarea className="form-textarea" value={form.notes} onChange={e => updateForm('notes', e.target.value)} rows={2} />
              </div>
              <div style={{ marginTop: 'var(--space-4)' }}>
                <label className="field-check">
                  <input type="checkbox" checked={form.active} onChange={e => updateForm('active', e.target.checked)} />
                  Cliente activo: aparece al elegir destinatario en una factura nueva
                </label>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={!form.businessName || !form.nif}>
                <Check size={16} /> {editingClient ? 'Guardar cambios' : 'Crear cliente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
