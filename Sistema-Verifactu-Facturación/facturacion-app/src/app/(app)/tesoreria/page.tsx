'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  WalletCards, ArrowDownLeft, ArrowUpRight, Calendar, Users,
  CheckCircle2, Clock, AlertCircle, Plus, Search, Filter,
  FileText, CreditCard, DollarSign, Download, Printer, RefreshCw,
  Trash2, ChevronRight, AlertTriangle
} from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import TableEmpty from '@/components/ui/TableEmpty';
import {
  getCobrosPagos, saveCobroPago, deleteCobroPago, getInvoices,
  getClients, getCompanySettings, getExtractoCuenta, saveCompanySettings,
} from '@/lib/storage';
import {
  CobroPago, Invoice, Client, CompanySettings, TipoCobroPago,
  PaymentMethod, InvoiceStatus, MovimientoExtracto
} from '@/lib/types';
import { generateId, formatDate, formatCurrency, getToday } from '@/lib/utils';
import { PAYMENT_METHODS } from '@/lib/constants';
import { useToast } from '@/hooks/useToast';

type Tab = 'vencimientos' | 'cobros' | 'pagos' | 'extractos';

export default function TesoreriaPage() {
  const [activeTab, setActiveTab] = useState<Tab>('vencimientos');
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [cobrosPagos, setCobrosPagos] = useState<CobroPago[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [settings, setSettings] = useState<CompanySettings | null>(null);

  // Filtros
  const [filtroSentido, setFiltroSentido] = useState<'todos' | 'venta' | 'compra'>('todos');
  const [searchTerm, setSearchTerm] = useState('');

  // Extracto de cuenta
  const [selectedContraparteId, setSelectedContraparteId] = useState('');
  const [extractoFechaDesde, setExtractoFechaDesde] = useState('');
  const [extractoFechaHasta, setExtractoFechaHasta] = useState('');
  const [extractoData, setExtractoData] = useState<{
    movimientos: MovimientoExtracto[];
    totalDebe: number;
    totalHaber: number;
    saldoFinal: number;
  }>({ movimientos: [], totalDebe: 0, totalHaber: 0, saldoFinal: 0 });

  // Modal Nuevo Cobro / Pago
  const [showModal, setShowModal] = useState(false);
  const [modalTipo, setModalTipo] = useState<TipoCobroPago>('cobro');
  const [selectedClientForPayment, setSelectedClientForPayment] = useState('');
  const [paymentDate, setPaymentDate] = useState(getToday());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.TRANSFERENCIA);
  const [paymentNotes, setPaymentNotes] = useState('');
  const [facturasParaCobrar, setFacturasParaCobrar] = useState<{
    invoiceId: string;
    invoiceNumber: string;
    total: number;
    paidAmount: number;
    pendiente: number;
    importeAplicado: number;
  }[]>([]);

  const { success, error: toastError } = useToast();

  const loadData = async () => {
    setLoading(true);
    try {
      const [allInvs, allCobros, allClients, st] = await Promise.all([
        getInvoices(),
        getCobrosPagos(),
        getClients(),
        getCompanySettings(),
      ]);
      setInvoices(allInvs);
      setCobrosPagos(allCobros);
      setClients(allClients);
      setSettings(st);

      if (allClients.length > 0 && !selectedContraparteId) {
        setSelectedContraparteId(allClients[0].id);
      }
    } catch {
      toastError('Error al cargar datos de tesorería');
    } finally {
      setLoading(false);
      setMounted(true);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Cargar extracto cuando cambia la contraparte o fechas
  useEffect(() => {
    if (!selectedContraparteId) return;
    const fetchExtracto = async () => {
      try {
        const data = await getExtractoCuenta(
          selectedContraparteId,
          extractoFechaDesde || undefined,
          extractoFechaHasta || undefined
        );
        setExtractoData(data);
      } catch {
        // silent
      }
    };
    fetchExtracto();
  }, [selectedContraparteId, extractoFechaDesde, extractoFechaHasta, invoices, cobrosPagos]);

  // Vencimientos pendientes (Facturas emitidas con saldo pendiente > 0)
  const vencimientos = useMemo(() => {
    return invoices
      .filter(i =>
        (i.tipo === 'factura' || i.tipo === 'rectificativa') &&
        (i.status === InvoiceStatus.EMITIDA || i.status === InvoiceStatus.PARCIAL) &&
        (i.total - (i.paidAmount || 0)) > 0.01
      )
      .map(i => {
        const pendiente = Number((i.total - (i.paidAmount || 0)).toFixed(2));
        const hoy = new Date();
        const due = new Date(i.dueDate || i.issueDate);
        const diffDays = Math.ceil((due.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
        const vencida = diffDays < 0;

        return {
          invoice: i,
          pendiente,
          diffDays,
          vencida,
        };
      })
      .filter(v => {
        if (filtroSentido === 'venta' && v.invoice.sentido === 'compra') return false;
        if (filtroSentido === 'compra' && v.invoice.sentido !== 'compra') return false;
        if (searchTerm) {
          const match = `${v.invoice.number} ${v.invoice.clientName} ${v.invoice.clientNif}`.toLowerCase();
          if (!match.includes(searchTerm.toLowerCase())) return false;
        }
        return true;
      })
      .sort((a, b) => (a.invoice.dueDate || a.invoice.issueDate).localeCompare(b.invoice.dueDate || b.invoice.issueDate));
  }, [invoices, filtroSentido, searchTerm]);

  // KPIs de Tesorería
  const totalPendienteCobro = useMemo(() => {
    return invoices
      .filter(i => i.sentido !== 'compra' && (i.tipo === 'factura' || i.tipo === 'rectificativa') && i.status !== InvoiceStatus.BORRADOR && i.status !== InvoiceStatus.ANULADA)
      .reduce((sum, i) => sum + Math.max(0, i.total - (i.paidAmount || 0)), 0);
  }, [invoices]);

  const totalPendientePago = useMemo(() => {
    return invoices
      .filter(i => i.sentido === 'compra' && (i.tipo === 'factura' || i.tipo === 'rectificativa') && i.status !== InvoiceStatus.BORRADOR && i.status !== InvoiceStatus.ANULADA)
      .reduce((sum, i) => sum + Math.max(0, i.total - (i.paidAmount || 0)), 0);
  }, [invoices]);

  // Abrir Modal para crear Cobro / Pago
  const handleOpenCreatePaymentModal = (tipo: TipoCobroPago, preselectedInvoice?: Invoice) => {
    setModalTipo(tipo);
    setPaymentDate(getToday());
    setPaymentNotes('');

    const targetClientId = preselectedInvoice ? preselectedInvoice.clientId : (
      clients.find(c => tipo === 'cobro' ? !c.esProveedor : c.esProveedor)?.id || clients[0]?.id || ''
    );
    setSelectedClientForPayment(targetClientId);

    // Cargar facturas pendientes de este cliente
    actualizarFacturasParaCobrar(targetClientId, tipo, preselectedInvoice?.id);
    setShowModal(true);
  };

  const actualizarFacturasParaCobrar = (clientId: string, tipo: TipoCobroPago, autoSelectInvoiceId?: string) => {
    const esCompra = tipo === 'pago';
    const pendingInvs = invoices.filter(i =>
      i.clientId === clientId &&
      (esCompra ? i.sentido === 'compra' : i.sentido !== 'compra') &&
      (i.tipo === 'factura' || i.tipo === 'rectificativa') &&
      (i.status === InvoiceStatus.EMITIDA || i.status === InvoiceStatus.PARCIAL) &&
      (i.total - (i.paidAmount || 0)) > 0.01
    );

    const mapped = pendingInvs.map(inv => {
      const pendiente = Number((inv.total - (inv.paidAmount || 0)).toFixed(2));
      return {
        invoiceId: inv.id,
        invoiceNumber: inv.number,
        total: inv.total,
        paidAmount: inv.paidAmount || 0,
        pendiente,
        importeAplicado: (autoSelectInvoiceId === inv.id || !autoSelectInvoiceId) ? pendiente : 0,
      };
    });

    setFacturasParaCobrar(mapped);
  };

  const handleClientChangeInModal = (newClientId: string) => {
    setSelectedClientForPayment(newClientId);
    actualizarFacturasParaCobrar(newClientId, modalTipo);
  };

  const totalImporteModal = useMemo(() => {
    return facturasParaCobrar.reduce((sum, f) => sum + Number(f.importeAplicado || 0), 0);
  }, [facturasParaCobrar]);

  const handleSaveCobroPago = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClientForPayment) {
      toastError('Selecciona un cliente o proveedor');
      return;
    }
    const validDesglose = facturasParaCobrar
      .filter(f => f.importeAplicado > 0)
      .map(f => ({
        invoiceId: f.invoiceId,
        invoiceNumber: f.invoiceNumber,
        importeAplicado: Number(f.importeAplicado),
      }));

    if (validDesglose.length === 0) {
      toastError('Debes aplicar importe a al menos una factura');
      return;
    }

    try {
      const client = clients.find(c => c.id === selectedClientForPayment);
      const isCobro = modalTipo === 'cobro';
      const series = isCobro ? (settings?.cobroSeries || 'COB') : (settings?.pagoSeries || 'PAG');
      const nextNum = isCobro ? (settings?.nextCobroNumber || 1) : (settings?.nextPagoNumber || 1);
      const year = new Date(paymentDate).getFullYear();
      const number = `${series}-${year}-${String(nextNum).padStart(4, '0')}`;

      const now = new Date().toISOString();
      const record: CobroPago = {
        id: generateId(),
        tipo: modalTipo,
        series,
        number,
        fecha: paymentDate,
        contraparteId: selectedClientForPayment,
        contraparteNombre: client?.businessName || 'Contraparte',
        contraparteNif: client?.nif || undefined,
        paymentMethod,
        importeTotal: Number(totalImporteModal.toFixed(2)),
        desglose: validDesglose,
        notas: paymentNotes || undefined,
        createdAt: now,
        updatedAt: now,
      };

      await saveCobroPago(record);

      // Incrementar contador de serie
      if (settings) {
        if (isCobro) {
          await saveCompanySettings({ ...settings, nextCobroNumber: nextNum + 1 });
        } else {
          await saveCompanySettings({ ...settings, nextPagoNumber: nextNum + 1 });
        }
      }

      success(`${isCobro ? 'Cobro' : 'Pago'} ${record.number} por ${formatCurrency(record.importeTotal)} registrado con éxito`);
      setShowModal(false);
      await loadData();
    } catch {
      toastError('Error al guardar el registro de tesorería');
    }
  };

  const handleDeleteRecord = async (id: string, number: string) => {
    if (!confirm(`¿Eliminar el registro ${number}? Se revertirá el saldo liquidado en las facturas.`)) return;
    try {
      await deleteCobroPago(id);
      success(`Registro ${number} eliminado y saldos revertidos`);
      await loadData();
    } catch {
      toastError('Error al eliminar registro');
    }
  };

  if (!mounted || loading) return <PageSkeleton />;

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <WalletCards size={28} color="var(--color-primary)" /> Gestión de Tesorería, Cobros y Pagos
          </h1>
          <p className="page-subtitle">Liquidación de vencimientos, control de pagos a proveedores y extractos de cuenta</p>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button className="btn btn-primary" onClick={() => handleOpenCreatePaymentModal('cobro')}>
            <ArrowDownLeft size={16} /> Registrar Cobro (Cliente)
          </button>
          <button className="btn btn-outline" onClick={() => handleOpenCreatePaymentModal('pago')}>
            <ArrowUpRight size={16} /> Registrar Pago (Proveedor)
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div style={{ width: 48, height: 48, borderRadius: 'var(--radius-md)', background: 'rgba(16, 185, 129, 0.12)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ArrowDownLeft size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>PENDIENTE DE COBRO (CLIENTES)</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-success)' }}>{formatCurrency(totalPendienteCobro)}</div>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div style={{ width: 48, height: 48, borderRadius: 'var(--radius-md)', background: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ArrowUpRight size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>PENDIENTE DE PAGO (PROVEEDORES)</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-danger)' }}>{formatCurrency(totalPendientePago)}</div>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div style={{ width: 48, height: 48, borderRadius: 'var(--radius-md)', background: 'rgba(99, 102, 241, 0.12)', color: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Clock size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>FACTURAS VENCIDAS O PENDIENTES</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{vencimientos.length} facturas</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ display: 'flex', gap: 'var(--space-2)', borderBottom: '1px solid var(--color-border)', marginBottom: 'var(--space-4)' }}>
        <button
          className={`tab-btn ${activeTab === 'vencimientos' ? 'active' : ''}`}
          onClick={() => setActiveTab('vencimientos')}
          style={{
            padding: 'var(--space-3) var(--space-4)',
            borderBottom: activeTab === 'vencimientos' ? '2px solid var(--color-primary)' : 'none',
            fontWeight: activeTab === 'vencimientos' ? 600 : 400,
            color: activeTab === 'vencimientos' ? 'var(--color-primary)' : 'var(--color-text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            cursor: 'pointer',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
          }}
        >
          <Clock size={16} /> Vencimientos Pendientes ({vencimientos.length})
        </button>

        <button
          className={`tab-btn ${activeTab === 'cobros' ? 'active' : ''}`}
          onClick={() => setActiveTab('cobros')}
          style={{
            padding: 'var(--space-3) var(--space-4)',
            borderBottom: activeTab === 'cobros' ? '2px solid var(--color-primary)' : 'none',
            fontWeight: activeTab === 'cobros' ? 600 : 400,
            color: activeTab === 'cobros' ? 'var(--color-primary)' : 'var(--color-text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            cursor: 'pointer',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
          }}
        >
          <ArrowDownLeft size={16} /> Cobros a Clientes ({cobrosPagos.filter(c => c.tipo === 'cobro').length})
        </button>

        <button
          className={`tab-btn ${activeTab === 'pagos' ? 'active' : ''}`}
          onClick={() => setActiveTab('pagos')}
          style={{
            padding: 'var(--space-3) var(--space-4)',
            borderBottom: activeTab === 'pagos' ? '2px solid var(--color-primary)' : 'none',
            fontWeight: activeTab === 'pagos' ? 600 : 400,
            color: activeTab === 'pagos' ? 'var(--color-primary)' : 'var(--color-text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            cursor: 'pointer',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
          }}
        >
          <ArrowUpRight size={16} /> Pagos a Proveedores ({cobrosPagos.filter(c => c.tipo === 'pago').length})
        </button>

        <button
          className={`tab-btn ${activeTab === 'extractos' ? 'active' : ''}`}
          onClick={() => setActiveTab('extractos')}
          style={{
            padding: 'var(--space-3) var(--space-4)',
            borderBottom: activeTab === 'extractos' ? '2px solid var(--color-primary)' : 'none',
            fontWeight: activeTab === 'extractos' ? 600 : 400,
            color: activeTab === 'extractos' ? 'var(--color-primary)' : 'var(--color-text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            cursor: 'pointer',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
          }}
        >
          <FileText size={16} /> Extractos de Cuenta y Relación entre fechas
        </button>
      </div>

      {/* TAB 1: VENCIMIENTOS PENDIENTES */}
      {activeTab === 'vencimientos' && (
        <div className="card">
          <div className="filter-bar" style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
            <div className="search-box" style={{ position: 'relative', flex: 1, minWidth: 260, maxWidth: 360 }}>
              <Search size={16} style={{ position: 'absolute', left: 12, top: 10, color: 'var(--color-text-muted)' }} />
              <input
                type="text"
                className="form-input"
                style={{ paddingLeft: 36 }}
                placeholder="Buscar por factura, cliente, NIF..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <select
                className="form-select"
                value={filtroSentido}
                onChange={e => setFiltroSentido(e.target.value as any)}
                style={{ width: 180 }}
              >
                <option value="todos">Todos los sentidos</option>
                <option value="venta">Solo Cobros (Clientes)</option>
                <option value="compra">Solo Pagos (Proveedores)</option>
              </select>
            </div>
          </div>

          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Factura</th>
                  <th>Cliente / Proveedor</th>
                  <th>Emisión</th>
                  <th>Vencimiento</th>
                  <th>Estado Vencimiento</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th style={{ textAlign: 'right' }}>Cobrado/Pagado</th>
                  <th style={{ textAlign: 'right' }}>Saldo Pendiente</th>
                  <th style={{ textAlign: 'right' }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {vencimientos.length === 0 ? (
                  <TableEmpty colSpan={9} icon={CheckCircle2} title="No hay facturas pendientes de cobro o pago" hint="Todas las facturas están al día o totalmente liquidadas." />
                ) : (
                  vencimientos.map(v => (
                    <tr key={v.invoice.id}>
                      <td>
                        <strong>{v.invoice.number}</strong>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                          {v.invoice.sentido === 'compra' ? 'Compra (Proveedor)' : 'Venta (Cliente)'}
                        </div>
                      </td>
                      <td>
                        <strong>{v.invoice.clientName}</strong>
                        {v.invoice.clientNif && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{v.invoice.clientNif}</div>
                        )}
                      </td>
                      <td>{formatDate(v.invoice.issueDate)}</td>
                      <td>{formatDate(v.invoice.dueDate || v.invoice.issueDate)}</td>
                      <td>
                        {v.vencida ? (
                          <span className="badge badge-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <AlertTriangle size={12} /> Vencida hace {Math.abs(v.diffDays)}d
                          </span>
                        ) : v.diffDays === 0 ? (
                          <span className="badge badge-warning">Vence Hoy</span>
                        ) : (
                          <span className="badge badge-info">Vence en {v.diffDays}d</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(v.invoice.total)}</td>
                      <td style={{ textAlign: 'right', color: 'var(--color-text-muted)' }}>
                        {formatCurrency(v.invoice.paidAmount || 0)}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: v.invoice.sentido === 'compra' ? 'var(--color-danger)' : 'var(--color-success)' }}>
                        {formatCurrency(v.pendiente)}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => handleOpenCreatePaymentModal(v.invoice.sentido === 'compra' ? 'pago' : 'cobro', v.invoice)}
                        >
                          {v.invoice.sentido === 'compra' ? 'Pagar' : 'Cobrar'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: HISTÓRICO DE COBROS */}
      {activeTab === 'cobros' && (
        <div className="card">
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Nº Cobro</th>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>Método de Pago</th>
                  <th>Facturas Liquidadas</th>
                  <th style={{ textAlign: 'right' }}>Importe Cobrado</th>
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {cobrosPagos.filter(c => c.tipo === 'cobro').length === 0 ? (
                  <TableEmpty colSpan={7} icon={ArrowDownLeft} title="No hay cobros registrados" hint="Registra los cobros recibidos de tus clientes para liquidar sus facturas." />
                ) : (
                  cobrosPagos.filter(c => c.tipo === 'cobro').map(c => (
                    <tr key={c.id}>
                      <td><strong>{c.number}</strong></td>
                      <td>{formatDate(c.fecha)}</td>
                      <td>
                        <strong>{c.contraparteNombre}</strong>
                        {c.contraparteNif && <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{c.contraparteNif}</div>}
                      </td>
                      <td><span className="badge badge-neutral">{c.paymentMethod}</span></td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {c.desglose.map((d, i) => (
                            <span key={i} style={{ fontSize: '0.825rem' }}>
                              • Factura {d.invoiceNumber}: <strong>{formatCurrency(d.importeAplicado)}</strong>
                            </span>
                          ))}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-success)', fontSize: '1.05rem' }}>
                        +{formatCurrency(c.importeTotal)}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn btn-ghost btn-sm text-danger"
                          title="Eliminar cobro y revertir saldo"
                          onClick={() => handleDeleteRecord(c.id, c.number)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: HISTÓRICO DE PAGOS */}
      {activeTab === 'pagos' && (
        <div className="card">
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Nº Pago</th>
                  <th>Fecha</th>
                  <th>Proveedor</th>
                  <th>Método de Pago</th>
                  <th>Facturas Liquidadas</th>
                  <th style={{ textAlign: 'right' }}>Importe Pagado</th>
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {cobrosPagos.filter(c => c.tipo === 'pago').length === 0 ? (
                  <TableEmpty colSpan={7} icon={ArrowUpRight} title="No hay pagos a proveedores registrados" hint="Registra los pagos emitidos a tus proveedores para liquidar compras." />
                ) : (
                  cobrosPagos.filter(c => c.tipo === 'pago').map(c => (
                    <tr key={c.id}>
                      <td><strong>{c.number}</strong></td>
                      <td>{formatDate(c.fecha)}</td>
                      <td>
                        <strong>{c.contraparteNombre}</strong>
                        {c.contraparteNif && <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{c.contraparteNif}</div>}
                      </td>
                      <td><span className="badge badge-neutral">{c.paymentMethod}</span></td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {c.desglose.map((d, i) => (
                            <span key={i} style={{ fontSize: '0.825rem' }}>
                              • Factura {d.invoiceNumber}: <strong>{formatCurrency(d.importeAplicado)}</strong>
                            </span>
                          ))}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-danger)', fontSize: '1.05rem' }}>
                        -{formatCurrency(c.importeTotal)}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn btn-ghost btn-sm text-danger"
                          title="Eliminar pago y revertir saldo"
                          onClick={() => handleDeleteRecord(c.id, c.number)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: EXTRACTOS DE CUENTA */}
      {activeTab === 'extractos' && (
        <div>
          <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
            <h3 className="card-title" style={{ marginBottom: 'var(--space-3)' }}>Consulta de Extracto y Relación de Documentos</h3>
            <div className="form-row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: 2, minWidth: 260, margin: 0 }}>
                <label className="form-label">Cliente / Proveedor</label>
                <select
                  className="form-select"
                  value={selectedContraparteId}
                  onChange={e => setSelectedContraparteId(e.target.value)}
                >
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.businessName} {c.nif ? `(${c.nif})` : ''} {c.esProveedor ? '[Proveedor]' : '[Cliente]'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ flex: 1, minWidth: 140, margin: 0 }}>
                <label className="form-label">Fecha Desde</label>
                <input
                  type="date"
                  className="form-input"
                  value={extractoFechaDesde}
                  onChange={e => setExtractoFechaDesde(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ flex: 1, minWidth: 140, margin: 0 }}>
                <label className="form-label">Fecha Hasta</label>
                <input
                  type="date"
                  className="form-input"
                  value={extractoFechaHasta}
                  onChange={e => setExtractoFechaHasta(e.target.value)}
                />
              </div>

              <button
                className="btn btn-outline"
                onClick={() => { setExtractoFechaDesde(''); setExtractoFechaHasta(''); }}
                style={{ height: 42 }}
              >
                Limpiar Fechas
              </button>
            </div>
          </div>

          {/* Resumen del extracto */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
            <div className="card" style={{ padding: 'var(--space-3)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>TOTAL FACTURADO / DEBE</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{formatCurrency(extractoData.totalDebe)}</div>
            </div>
            <div className="card" style={{ padding: 'var(--space-3)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>TOTAL COBRADO / HABER</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{formatCurrency(extractoData.totalHaber)}</div>
            </div>
            <div className="card" style={{ padding: 'var(--space-3)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>SALDO VIVO PENDIENTE</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: extractoData.saldoFinal > 0 ? 'var(--color-danger)' : extractoData.saldoFinal < 0 ? 'var(--color-success)' : 'inherit' }}>
                {formatCurrency(extractoData.saldoFinal)}
              </div>
            </div>
          </div>

          {/* Tabla de extracto */}
          <div className="card">
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Tipo</th>
                    <th>Documento</th>
                    <th>Concepto</th>
                    <th style={{ textAlign: 'right' }}>Debe (+)</th>
                    <th style={{ textAlign: 'right' }}>Haber (-)</th>
                    <th style={{ textAlign: 'right' }}>Saldo Acumulado</th>
                  </tr>
                </thead>
                <tbody>
                  {extractoData.movimientos.length === 0 ? (
                    <TableEmpty colSpan={7} icon={FileText} title="No hay movimientos en este rango de fechas" hint="Selecciona otra contraparte o amplía el rango temporal." />
                  ) : (
                    extractoData.movimientos.map(m => (
                      <tr key={m.id}>
                        <td>{formatDate(m.fecha)}</td>
                        <td>
                          {m.tipo === 'factura' ? (
                            <span className="badge badge-neutral">Factura</span>
                          ) : (
                            <span className="badge badge-info">Cobro/Pago</span>
                          )}
                        </td>
                        <td><strong>{m.numero}</strong></td>
                        <td>{m.concepto}</td>
                        <td style={{ textAlign: 'right', fontWeight: m.debe > 0 ? 600 : 400 }}>
                          {m.debe > 0 ? formatCurrency(m.debe) : '—'}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: m.haber > 0 ? 600 : 400, color: m.haber > 0 ? 'var(--color-success)' : 'inherit' }}>
                          {m.haber > 0 ? formatCurrency(m.haber) : '—'}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>
                          {formatCurrency(m.saldo)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL REGISTRAR COBRO / PAGO */}
      {showModal && (
        <div className="modal-backdrop">
          <div className="modal card" style={{ maxWidth: 640 }}>
            <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>
              {modalTipo === 'cobro' ? 'Registrar Cobro (Cliente)' : 'Registrar Pago (Proveedor)'}
            </h3>

            <form onSubmit={handleSaveCobroPago}>
              <div className="form-group">
                <label className="form-label">{modalTipo === 'cobro' ? 'Cliente' : 'Proveedor'} *</label>
                <select
                  className="form-select"
                  value={selectedClientForPayment}
                  onChange={e => handleClientChangeInModal(e.target.value)}
                  required
                >
                  {clients
                    .filter(c => modalTipo === 'cobro' ? !c.esProveedor : c.esProveedor)
                    .map(c => (
                      <option key={c.id} value={c.id}>
                        {c.businessName} {c.nif ? `(${c.nif})` : ''}
                      </option>
                    ))}
                </select>
              </div>

              <div className="form-row">
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Fecha de Cobro/Pago *</label>
                  <input
                    type="date"
                    className="form-input"
                    value={paymentDate}
                    onChange={e => setPaymentDate(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Método de Pago *</label>
                  <select
                    className="form-select"
                    value={paymentMethod}
                    onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}
                    required
                  >
                    {PAYMENT_METHODS.map(pm => (
                      <option key={pm.value} value={pm.value}>{pm.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Facturas pendientes del cliente */}
              <div style={{ marginTop: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                <label className="form-label">Facturas Pendientes a Liquidar</label>

                {facturasParaCobrar.length === 0 ? (
                  <div style={{ padding: 'var(--space-3)', background: 'var(--color-bg-subtle)', borderRadius: 'var(--radius-md)', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                    No hay facturas pendientes para este {modalTipo === 'cobro' ? 'cliente' : 'proveedor'}.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    {facturasParaCobrar.map((f, idx) => (
                      <div
                        key={f.invoiceId}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: 'var(--color-bg-subtle)',
                          padding: 'var(--space-2) var(--space-3)',
                          borderRadius: 'var(--radius-md)',
                          gap: 'var(--space-3)'
                        }}
                      >
                        <div style={{ flex: 2 }}>
                          <strong>{f.invoiceNumber}</strong>
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                            Total: {formatCurrency(f.total)} | Pendiente: {formatCurrency(f.pendiente)}
                          </div>
                        </div>

                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                          <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Aplicar:</label>
                          <input
                            type="number"
                            step="0.01"
                            max={f.pendiente}
                            min="0"
                            className="form-input"
                            style={{ width: 110, padding: '4px 8px' }}
                            value={f.importeAplicado}
                            onChange={e => {
                              const val = Number(e.target.value);
                              const copy = [...facturasParaCobrar];
                              copy[idx].importeAplicado = Math.min(val, f.pendiente);
                              setFacturasParaCobrar(copy);
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-3)', background: 'var(--color-bg-subtle)', borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-3)' }}>
                <span style={{ fontWeight: 600 }}>Total a {modalTipo === 'cobro' ? 'cobrar' : 'pagar'}:</span>
                <span style={{ fontSize: '1.35rem', fontWeight: 800, color: modalTipo === 'cobro' ? 'var(--color-success)' : 'var(--color-danger)' }}>
                  {formatCurrency(totalImporteModal)}
                </span>
              </div>

              <div className="form-group">
                <label className="form-label">Notas u Observaciones</label>
                <textarea
                  className="form-textarea"
                  rows={2}
                  value={paymentNotes}
                  onChange={e => setPaymentNotes(e.target.value)}
                  placeholder="Número de transferencia, talón o referencia..."
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={totalImporteModal <= 0}>
                  Confirmar {modalTipo === 'cobro' ? 'Cobro' : 'Pago'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
