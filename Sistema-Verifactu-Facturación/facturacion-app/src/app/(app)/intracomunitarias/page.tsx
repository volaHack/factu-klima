'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Globe, Download, AlertTriangle, Info, FileText,
} from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { getInvoices, getCompanySettings } from '@/lib/storage';
import type { Invoice, CompanySettings } from '@/lib/types';
import {
  generarDatos349, generarFichero349,
  calcularResumenIntracomunitarias, validarVatNumber,
} from '@/lib/intracomunitarias';
import { formatCurrency } from '@/lib/utils';

export default function IntracomunitariasPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    (async () => {
      const [allInvoices, cs] = await Promise.all([getInvoices(), getCompanySettings()]);
      setInvoices(allInvoices);
      setSettings(cs);
      setMounted(true);
    })();
  }, []);

  const resumen = useMemo(() => calcularResumenIntracomunitarias(invoices), [invoices]);

  const ahora = new Date();
  const trimestre = Math.ceil((ahora.getMonth() + 1) / 3);
  const periodoLabel = `${trimestre}T ${ahora.getFullYear()}`;

  const datos349 = useMemo(() => {
    const intracom = invoices.filter(i => i.esIntracomunitaria);
    return generarDatos349(intracom, ahora.getFullYear(), `${trimestre}T`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices]);

  const descargar349 = () => {
    if (!settings) return;
    const fichero = generarFichero349(datos349, settings);
    const blob = new Blob([fichero], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `modelo_349_${datos349.ejercicio}_${datos349.periodo}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!mounted) return <PageSkeleton variant="list" label="Cargando operaciones intracomunitarias" />;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title"><Globe size={22} style={{ marginRight: 8 }} />Operaciones intracomunitarias</h1>
          <p className="page-subtitle">Ventas y compras con otros países de la UE — Modelo 349</p>
        </div>
        {datos349.totalOperaciones > 0 && (
          <button className="btn btn-primary" onClick={descargar349}>
            <Download size={16} /> Descargar fichero 349
          </button>
        )}
      </div>

      {/* Banner explicativo */}
      <div className="card" style={{ background: 'var(--bg-info)', border: '1px solid var(--border-info)', padding: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
          <Info size={20} style={{ color: 'var(--text-accent)', flexShrink: 0, marginTop: 2 }} />
          <div>
            <strong>¿Quién está obligado?</strong>
            <p style={{ margin: '4px 0 0', fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
              Cualquier empresa o autónomo que realice operaciones con empresas de otros países de la Unión Europea.
              Se presenta el <strong>Modelo 349</strong> trimestralmente (o mensualmente si el volumen supera 50.000 €).
              Las entregas intracomunitarias de bienes están <strong>exentas de IVA</strong> (inversión del sujeto pasivo).
            </p>
          </div>
        </div>
      </div>

      {/* Resumen del trimestre */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
        <div className="card kpi-card">
          <span className="kpi-label">Entregas (E)</span>
          <span className="kpi-value">{formatCurrency(resumen.totalEntregas)}</span>
          <span className="kpi-subtitle">Ventas de bienes a la UE</span>
        </div>
        <div className="card kpi-card">
          <span className="kpi-label">Adquisiciones (A)</span>
          <span className="kpi-value">{formatCurrency(resumen.totalAdquisiciones)}</span>
          <span className="kpi-subtitle">Compras de bienes de la UE</span>
        </div>
        <div className="card kpi-card">
          <span className="kpi-label">Servicios (S/I)</span>
          <span className="kpi-value">{formatCurrency(resumen.totalServicios)}</span>
          <span className="kpi-subtitle">Prestaciones y adquisiciones</span>
        </div>
        <div className="card kpi-card">
          <span className="kpi-label">Operadores</span>
          <span className="kpi-value">{datos349.totalOperaciones}</span>
          <span className="kpi-subtitle">Periodo {periodoLabel}</span>
        </div>
      </div>

      {/* Alerta si hay facturas incompletas */}
      {resumen.facturasIncompletas > 0 && (
        <div className="card" style={{ background: 'var(--bg-warning)', border: '1px solid var(--border-warning)', padding: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
            <AlertTriangle size={18} style={{ color: 'var(--color-warning)' }} />
            <span style={{ fontSize: 'var(--text-sm)' }}>
              <strong>{resumen.facturasIncompletas} factura{resumen.facturasIncompletas !== 1 ? 's' : ''}</strong> intracomunitaria{resumen.facturasIncompletas !== 1 ? 's' : ''} sin
              NIF-IVA (VAT Number). No se pueden incluir en el Modelo 349 hasta que se complete el dato en la ficha del cliente.
            </span>
          </div>
        </div>
      )}

      {/* Tabla de operadores */}
      <div className="card">
        <div className="card-header">
          <h3><FileText size={16} style={{ marginRight: 6 }} />Detalle por operador — {periodoLabel}</h3>
        </div>
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>País</th>
                <th>NIF-IVA</th>
                <th>Nombre / Razón social</th>
                <th>Clave</th>
                <th style={{ textAlign: 'right' }}>Base imponible</th>
              </tr>
            </thead>
            <tbody>
              {datos349.operaciones.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--text-secondary)' }}>
                    No hay operaciones intracomunitarias en este trimestre.
                  </td>
                </tr>
              ) : (
                datos349.operaciones.map((op, i) => (
                  <tr key={i}>
                    <td><span className="badge">{op.codigoPais}</span></td>
                    <td><code>{op.codigoPais}{op.vatNumber}</code></td>
                    <td>{op.nombreRazon}</td>
                    <td>
                      <span className="badge badge-info">{op.claveOperacion}</span>
                      <span style={{ marginLeft: 6, fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                        {claveLabel(op.claveOperacion)}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}><strong>{formatCurrency(op.baseImponible)}</strong></td>
                  </tr>
                ))
              )}
            </tbody>
            {datos349.operaciones.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={4} style={{ textAlign: 'right' }}><strong>Total base imponible:</strong></td>
                  <td style={{ textAlign: 'right' }}><strong>{formatCurrency(datos349.totalBaseImponible)}</strong></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

function claveLabel(clave: string): string {
  const map: Record<string, string> = {
    E: 'Entregas',
    A: 'Adquisiciones',
    T: 'Triangulares',
    S: 'Servicios prestados',
    I: 'Servicios adquiridos',
  };
  return map[clave] || clave;
}
