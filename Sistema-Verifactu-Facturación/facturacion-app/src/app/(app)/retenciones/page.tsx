'use client';

import { useState, useEffect, useMemo } from 'react';
import { FileCheck, Info } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import TableEmpty from '@/components/ui/TableEmpty';
import { getInvoices } from '@/lib/storage';
import { resumenModelo111, importeRetencion } from '@/lib/retenciones';
import { Invoice } from '@/lib/types';
import { formatCurrency, formatDate } from '@/lib/utils';

/**
 * LO QUE HAY QUE DECLARAR EN EL MODELO 111
 *
 * Sólo lo que la empresa ha RETENIDO a otros —facturas de compra con
 * retención—, que es lo que se ingresa en Hacienda a cuenta del IRPF de
 * quien factura. Es un resumen para llevarle a la gestoría, no un envío:
 * el modelo 111 se presenta en la sede electrónica o con el programa de
 * la asesoría, esto sólo saca la cuenta.
 */
export default function RetencionesPage() {
  const [mounted, setMounted] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

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
    .filter(inv => !hasta || inv.issueDate <= hasta)
    .sort((a, b) => a.issueDate.localeCompare(b.issueDate)),
  [invoices, desde, hasta]);

  if (!mounted) return <PageSkeleton />;

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Retención de IRPF</h1>
          <p className="page-subtitle">Lo retenido a profesionales, para el modelo 111.</p>
        </div>
      </div>

      <p className="rentabilidad-aviso" style={{ marginBottom: 'var(--space-4)' }}>
        <Info size={14} />
        Este resumen no presenta nada: es la cuenta que hace falta para rellenar el modelo 111 en la sede electrónica o pasarla a la gestoría.
      </p>

      <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
        <div className="form-row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: 1, minWidth: 140, margin: 0 }}>
            <label className="form-label">Periodo desde</label>
            <input type="date" className="form-input" value={desde} onChange={e => setDesde(e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: 1, minWidth: 140, margin: 0 }}>
            <label className="form-label">Periodo hasta</label>
            <input type="date" className="form-input" value={hasta} onChange={e => setHasta(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="rentabilidad-totales" style={{ marginBottom: 'var(--space-4)' }}>
          <div><span>Facturas con retención</span><strong>{resumen.numFacturas}</strong></div>
          <div><span>Base sujeta a retención</span><strong>{formatCurrency(resumen.baseTotal)}</strong></div>
          <div><span>Total retenido</span><strong>{formatCurrency(resumen.retenido)}</strong></div>
        </div>

        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Factura</th>
                <th>Proveedor</th>
                <th style={{ textAlign: 'right' }}>Base</th>
                <th style={{ textAlign: 'right' }}>%</th>
                <th style={{ textAlign: 'right' }}>Retenido</th>
              </tr>
            </thead>
            <tbody>
              {facturasConRetencion.length === 0 ? (
                <TableEmpty
                  colSpan={6}
                  icon={FileCheck}
                  title="No hay facturas de compra con retención en este periodo"
                  hint="Se marca el porcentaje al dar de alta la factura de un profesional o de obra."
                />
              ) : (
                facturasConRetencion.map(f => (
                  <tr key={f.id}>
                    <td>{formatDate(f.issueDate)}</td>
                    <td className="mono">{f.number}</td>
                    <td><strong>{f.clientName}</strong></td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(f.subtotal)}</td>
                    <td style={{ textAlign: 'right' }}>{f.retencionPct}%</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatCurrency(importeRetencion(f.subtotal, f.retencionPct))}</td>
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
