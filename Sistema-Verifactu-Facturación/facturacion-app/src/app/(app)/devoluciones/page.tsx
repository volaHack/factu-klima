'use client';

import { useState, useEffect, useMemo } from 'react';
import { Plus, Search, RotateCcw, ReceiptText, Ban, CreditCard, SearchX, FileWarning } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import TableEmpty from '@/components/ui/TableEmpty';
import {
  getDevoluciones, getAbonos, anularAbono, getInvoices, getClients, getProducts, getCompanySettings
} from '@/lib/storage';
import { Abono, Devolucion, CompanySettings, Client, Product, Invoice, DevolucionReason } from '@/lib/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import { DEVOLUCION_STATUSES, DEVOLUCION_REASONS, ABONO_STATUSES } from '@/lib/constants';
import { useToast } from '@/hooks/useToast';
import DevolucionFormModal from '@/components/devoluciones/DevolucionFormModal';
import AbonoFormModal from '@/components/devoluciones/AbonoFormModal';
import AplicarAbonoModal from '@/components/devoluciones/AplicarAbonoModal';

type Tab = 'devoluciones' | 'abonos';

export default function DevolucionesAbonosPage() {
  const { success, error: toastError } = useToast();
  const [tab, setTab] = useState<Tab>('devoluciones');
  const [mounted, setMounted] = useState(false);
  const [devoluciones, setDevoluciones] = useState<Devolucion[]>([]);
  const [abonos, setAbonos] = useState<Abono[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [search, setSearch] = useState('');

  const [showDevolucionForm, setShowDevolucionForm] = useState(false);
  const [showAbonoForm, setShowAbonoForm] = useState(false);
  const [applyAbono, setApplyAbono] = useState<Abono | null>(null);

  useEffect(() => {
    (async () => {
      const [dev, abn, inv, cl, pr, st] = await Promise.all([
        getDevoluciones(), getAbonos(), getInvoices(), getClients(), getProducts(), getCompanySettings(),
      ]);
      setDevoluciones(dev);
      setAbonos(abn);
      setInvoices(inv);
      setClients(cl.filter(c => c.active));
      setProducts(pr.filter(p => p.active));
      setSettings(st);
      setMounted(true);
    })();
  }, []);

  const reload = async () => {
    setDevoluciones(await getDevoluciones());
    setAbonos(await getAbonos());
    setInvoices(await getInvoices());
  };

  const reasonLabel = (r: DevolucionReason) => DEVOLUCION_REASONS.find(x => x.value === r)?.label ?? r;
  const abonoStatusLabel = (s: Abono['status']) => ABONO_STATUSES.find(x => x.value === s)?.label ?? s;
  const devStatusLabel = (s: Devolucion['status']) => DEVOLUCION_STATUSES.find(x => x.value === s)?.label ?? s;

  const devFiltradas = useMemo(() => {
    if (!search) return devoluciones;
    const q = search.toLowerCase();
    return devoluciones.filter(d =>
      d.number.toLowerCase().includes(q) || d.clientName.toLowerCase().includes(q) || d.clientNif.toLowerCase().includes(q)
    );
  }, [devoluciones, search]);

  const abonosFiltrados = useMemo(() => {
    if (!search) return abonos;
    const q = search.toLowerCase();
    return abonos.filter(a =>
      a.number.toLowerCase().includes(q) || a.clientName.toLowerCase().includes(q) || a.clientNif.toLowerCase().includes(q)
    );
  }, [abonos, search]);

  const handleAnularAbono = async (abono: Abono) => {
    const ok = confirm(
      `Anular el abono ${abono.number}?\n\n` +
      'El abono queda registrado como anulado y no podrá aplicarse a más facturas. ' +
      'Las cantidades ya aplicadas se mantienen.'
    );
    if (!ok) return;
    try {
      await anularAbono(abono.id);
      await reload();
      success('Abono anulado', abono.number);
    } catch (err) {
      toastError('No se pudo anular', err instanceof Error ? err.message : 'Error desconocido');
    }
  };

  if (!mounted || !settings) {
    return <PageSkeleton variant="list" label="Cargando abonos y devoluciones" />;
  }

  const totalCredito = abonos
    .filter(a => a.status !== 'anulado')
    .reduce((sum, a) => sum + (a.total - a.usedAmount), 0);

  return (
    <div className="animate-fade-in">
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-left">
          <p className="page-eyebrow"><ReceiptText /> Créditos</p>
          <h1 className="page-title">Abonos y Devoluciones</h1>
          {abonos.length > 0 && (
            <div className="page-meta">
              <span className="page-meta-item">
                <span className="page-meta-value">{devoluciones.length}</span>
                <span className="page-meta-label">devoluciones</span>
              </span>
              <span className="page-meta-item">
                <span className="page-meta-value">{abonos.length}</span>
                <span className="page-meta-label">abonos</span>
              </span>
              <span className="page-meta-item">
                <span className={`page-meta-value ${totalCredito > 0 ? 'is-warning' : ''}`}>
                  {formatCurrency(totalCredito)}
                </span>
                <span className="page-meta-label">por compensar</span>
              </span>
            </div>
          )}
        </div>
        <div className="page-header-actions">
          {tab === 'devoluciones' ? (
            <button className="btn btn-primary" onClick={() => setShowDevolucionForm(true)}>
              <RotateCcw size={16} /> Registrar devolución
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => setShowAbonoForm(true)}>
              <Plus size={16} /> Nuevo abono
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
        <button
          className={`btn ${tab === 'devoluciones' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => { setTab('devoluciones'); setSearch(''); }}
        >
          <RotateCcw size={16} /> Devoluciones ({devoluciones.length})
        </button>
        <button
          className={`btn ${tab === 'abonos' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => { setTab('abonos'); setSearch(''); }}
        >
          <ReceiptText size={16} /> Abonos ({abonos.length})
        </button>
      </div>

      <div className="filters-bar">
        <div className="search-bar" style={{ maxWidth: 300 }}>
          <div className="search-bar-icon"><Search size={16} /></div>
          <input
            type="text"
            placeholder={tab === 'devoluciones' ? 'Buscar devolución o cliente' : 'Buscar abono o cliente'}
            aria-label="Buscar"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {tab === 'devoluciones' ? (
        <div className="table-container">
          <table className="table table--sortable">
            <thead>
              <tr>
                <th>Nº Devolución</th>
                <th>Cliente</th>
                <th>Fecha</th>
                <th>Motivo</th>
                <th>Estado</th>
                <th style={{ textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {devFiltradas.map(d => (
                <tr key={d.id}>
                  <td className="mono primary">{d.number}</td>
                  <td className="primary">{d.clientName}</td>
                  <td>{formatDate(d.issueDate)}</td>
                  <td>
                    <span className="badge badge-neutral">
                      <span className="badge-dot" />
                      {reasonLabel(d.reason)}
                    </span>
                  </td>
                  <td>
                    <span className={`badge badge-${d.status}`}>
                      <span className="badge-dot" />
                      {devStatusLabel(d.status)}
                    </span>
                  </td>
                  <td className="amount">{formatCurrency(d.total)}</td>
                </tr>
              ))}
              {devFiltradas.length === 0 && (
                <TableEmpty
                  colSpan={6}
                  icon={search ? SearchX : RotateCcw}
                  title={search ? 'Ninguna devolución coincide con la búsqueda' : 'Todavía no hay devoluciones'}
                  hint={
                    search
                      ? 'Revisa el texto de búsqueda.'
                      : 'Registra la mercancía devuelta por roturas, defectos o errores. Puedes reponer el stock y generar un abono a favor del cliente.'
                  }
                  action={!search && (
                    <button className="btn btn-primary btn-sm" onClick={() => setShowDevolucionForm(true)}>
                      <RotateCcw size={14} /> Registrar la primera devolución
                    </button>
                  )}
                />
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="table-container">
          <table className="table table--sortable">
            <thead>
              <tr>
                <th>Nº Abono</th>
                <th>Cliente</th>
                <th>Fecha</th>
                <th style={{ textAlign: 'right' }}>Importe</th>
                <th style={{ textAlign: 'right' }}>Aplicado</th>
                <th style={{ textAlign: 'right' }}>Disponible</th>
                <th>Estado</th>
                <th style={{ width: 120 }}></th>
              </tr>
            </thead>
            <tbody>
              {abonosFiltrados.map(a => {
                const disponible = Number((a.total - a.usedAmount).toFixed(2));
                return (
                  <tr key={a.id}>
                    <td className="mono primary">{a.number}</td>
                    <td className="primary">{a.clientName}</td>
                    <td>{formatDate(a.issueDate)}</td>
                    <td className="amount">{formatCurrency(a.total)}</td>
                    <td className="amount">{formatCurrency(a.usedAmount)}</td>
                    <td className="amount">{formatCurrency(disponible)}</td>
                    <td>
                      <span className={`badge badge-${a.status}`}>
                        <span className="badge-dot" />
                        {abonoStatusLabel(a.status)}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 'var(--space-1)', justifyContent: 'flex-end' }}>
                        {(a.status === 'emitido' || a.status === 'parcial') && (
                          <button
                            className="btn btn-ghost btn-icon btn-sm"
                            title={`Aplicar ${a.number} a una factura`}
                            aria-label={`Aplicar ${a.number}`}
                            onClick={() => setApplyAbono(a)}
                          >
                            <CreditCard size={15} />
                          </button>
                        )}
                        {a.status !== 'anulado' && (
                          <button
                            className="btn btn-ghost btn-icon btn-sm"
                            title="Anular abono"
                            aria-label={`Anular ${a.number}`}
                            onClick={() => handleAnularAbono(a)}
                          >
                            <Ban size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {abonosFiltrados.length === 0 && (
                <TableEmpty
                  colSpan={8}
                  icon={search ? SearchX : ReceiptText}
                  title={search ? 'Ningún abono coincide con la búsqueda' : 'Todavía no hay abonos'}
                  hint={
                    search
                      ? 'Revisa el texto de búsqueda.'
                      : 'Un abono es una nota de crédito a favor del cliente: se genera automáticamente al devolver mercancía o de forma manual, y se aplica para compensar facturas pendientes.'
                  }
                  action={!search && (
                    <button className="btn btn-primary btn-sm" onClick={() => setShowAbonoForm(true)}>
                      <Plus size={14} /> Crear el primer abono
                    </button>
                  )}
                />
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="callout callout-info" style={{ marginTop: 'var(--space-4)' }}>
        <FileWarning size={16} />
        <div>
          <strong>Los abonos compensan deuda, no reescriben la factura</strong>
          <p>
            Por el sellado Verifactu, el importe de una factura emitida no puede modificarse. Un abono
            aplicado queda registrado como pago a favor del cliente y, si cubre el total, la factura
            se marca como cobrada.
          </p>
        </div>
      </div>

      {showDevolucionForm && settings && (
        <DevolucionFormModal
          clients={clients}
          products={products}
          onClose={() => setShowDevolucionForm(false)}
          onCreated={msg => { success('Operación realizada', msg); reload(); }}
        />
      )}

      {showAbonoForm && settings && (
        <AbonoFormModal
          clients={clients}
          onClose={() => setShowAbonoForm(false)}
          onCreated={msg => { success('Operación realizada', msg); reload(); }}
        />
      )}

      {applyAbono && (
        <AplicarAbonoModal
          abono={applyAbono}
          invoices={invoices}
          onClose={() => setApplyAbono(null)}
          onApplied={msg => { success('Abono aplicado', msg); reload(); }}
        />
      )}
    </div>
  );
}
