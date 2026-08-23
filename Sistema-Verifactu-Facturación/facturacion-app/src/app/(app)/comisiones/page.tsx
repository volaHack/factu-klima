'use client';

import { useState, useEffect, useMemo, Fragment } from 'react';
import { TrendingUp, ChevronDown, ChevronUp, Percent } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import TableEmpty from '@/components/ui/TableEmpty';
import { getInvoices, getVendedores, getCompanySettings, saveCompanySettings } from '@/lib/storage';
import { resumenComisiones, type BaseComision } from '@/lib/comisiones';
import { Invoice, Vendedor } from '@/lib/types';
import { formatCurrency, formatDate } from '@/lib/utils';

/**
 * LO QUE SE LLEVA CADA COMERCIAL
 *
 * Un informe, no un libro contable: se calcula en vivo sobre las facturas de
 * cada vendedor, así que si una factura se corrige o se anula la comisión ya
 * sale bien la próxima vez que se mira, sin tener que corregir nada aparte.
 */
export default function ComisionesPage() {
  const [mounted, setMounted] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [settings, setSettings] = useState<Awaited<ReturnType<typeof getCompanySettings>> | null>(null);
  const [base, setBase] = useState<BaseComision>('facturado');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [expandido, setExpandido] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const [inv, vend, settings] = await Promise.all([getInvoices(), getVendedores(), getCompanySettings()]);
      if (!vivo) return;
      setInvoices(inv);
      setVendedores(vend);
      setSettings(settings);
      setBase(settings?.comisionBase ?? 'facturado');
      setMounted(true);
    })();
    return () => { vivo = false; };
  }, []);

  const resumen = useMemo(
    () => resumenComisiones(invoices, vendedores, base, { desde: desde || undefined, hasta: hasta || undefined }),
    [invoices, vendedores, base, desde, hasta],
  );

  const totalComisiones = useMemo(() => resumen.reduce((s, r) => s + r.importeComision, 0), [resumen]);
  const sinComision = vendedores.filter(v => v.activo && !(v.comisionPct && v.comisionPct > 0));

  if (!mounted) return <PageSkeleton />;

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Comisiones</h1>
          <p className="page-subtitle">Lo que se lleva cada comercial, calculado sobre sus facturas.</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
        <div className="form-row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: 1, minWidth: 200, margin: 0 }}>
            <label className="form-label">Se calcula sobre</label>
            <select
              className="form-select"
              value={base}
              onChange={e => {
                const siguiente = e.target.value as BaseComision;
                setBase(siguiente);
                // Se recuerda para la próxima visita: es la costumbre de la
                // empresa, no un capricho de esta sesión.
                if (settings) void saveCompanySettings({ ...settings, comisionBase: siguiente });
              }}
            >
              <option value="facturado">Lo facturado (cuenta al emitir)</option>
              <option value="cobrado">Lo cobrado (cuenta al pagar)</option>
            </select>
          </div>
          <div className="form-group" style={{ flex: 1, minWidth: 140, margin: 0 }}>
            <label className="form-label">Desde</label>
            <input type="date" className="form-input" value={desde} onChange={e => setDesde(e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: 1, minWidth: 140, margin: 0 }}>
            <label className="form-label">Hasta</label>
            <input type="date" className="form-input" value={hasta} onChange={e => setHasta(e.target.value)} />
          </div>
        </div>
      </div>

      {sinComision.length > 0 && (
        <p className="rentabilidad-aviso" style={{ marginBottom: 'var(--space-4)' }}>
          <Percent size={14} />
          {sinComision.length === 1
            ? `${sinComision[0].nombre} no tiene un porcentaje de comisión configurado.`
            : `${sinComision.length} vendedores activos no tienen un porcentaje de comisión configurado.`}
          {' '}Se pone en Ajustes → Vendedores.
        </p>
      )}

      <div className="card">
        <div className="rentabilidad-totales" style={{ marginBottom: 'var(--space-4)' }}>
          <div><span>Vendedores con comisión</span><strong>{resumen.length}</strong></div>
          <div><span>Total a liquidar</span><strong>{formatCurrency(totalComisiones)}</strong></div>
        </div>

        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th></th>
                <th>Vendedor</th>
                <th style={{ textAlign: 'right' }}>%</th>
                <th style={{ textAlign: 'right' }}>Base</th>
                <th style={{ textAlign: 'right' }}>Facturas</th>
                <th style={{ textAlign: 'right' }}>Comisión</th>
              </tr>
            </thead>
            <tbody>
              {resumen.length === 0 ? (
                <TableEmpty
                  colSpan={6}
                  icon={TrendingUp}
                  title="No hay comisiones que mostrar"
                  hint="Asigna un porcentaje a un vendedor en Ajustes y asócialo a los clientes o a las facturas."
                />
              ) : (
                resumen.map(r => (
                  <Fragment key={r.vendedorId}>
                    <tr
                      key={r.vendedorId}
                      onClick={() => setExpandido(expandido === r.vendedorId ? null : r.vendedorId)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>{expandido === r.vendedorId ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</td>
                      <td><strong>{r.vendedorNombre}</strong></td>
                      <td style={{ textAlign: 'right' }}>{r.comisionPct}%</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(r.baseCalculo)}</td>
                      <td style={{ textAlign: 'right' }}>{r.facturas.length}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatCurrency(r.importeComision)}</td>
                    </tr>
                    {expandido === r.vendedorId && (
                      <tr key={`${r.vendedorId}-detalle`}>
                        <td colSpan={6} style={{ padding: 0, background: 'var(--bg-tertiary)' }}>
                          <table className="table" style={{ margin: 0 }}>
                            <thead>
                              <tr>
                                <th>Factura</th>
                                <th>Fecha</th>
                                <th>Cliente</th>
                                <th style={{ textAlign: 'right' }}>Base</th>
                                <th style={{ textAlign: 'right' }}>Comisión</th>
                              </tr>
                            </thead>
                            <tbody>
                              {r.facturas.map(f => (
                                <tr key={f.invoiceId}>
                                  <td>{f.number}</td>
                                  <td>{formatDate(f.fecha)}</td>
                                  <td>{f.clientName}</td>
                                  <td style={{ textAlign: 'right' }}>{formatCurrency(f.importe)}</td>
                                  <td style={{ textAlign: 'right' }}>{formatCurrency(f.comision)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
