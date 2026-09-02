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

  /**
   * El trimestre que se está mirando, no forzosamente el de hoy.
   *
   * El 349 de un trimestre se presenta en el mes siguiente a que
   * termine: el del 3T, en octubre. Con el periodo clavado al día de
   * hoy, quien entraba a presentarlo veía el 4T recién empezado y vacío,
   * sin ninguna forma de llegar al trimestre que de verdad tenía que
   * declarar. Arranca en el trimestre en curso y se puede retroceder.
   */
  const hoy = new Date();
  const [ejercicio, setEjercicio] = useState(hoy.getFullYear());
  const [trimestre, setTrimestre] = useState(Math.ceil((hoy.getMonth() + 1) / 3));
  const periodoLabel = `${trimestre}T ${ejercicio}`;

  const datos349 = useMemo(
    () => generarDatos349(invoices, ejercicio, `${trimestre}T`),
    [invoices, ejercicio, trimestre],
  );

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
        <div className="periodo-349">
          <select
            className="form-select"
            value={ejercicio}
            onChange={e => setEjercicio(Number(e.target.value))}
            aria-label="Ejercicio a declarar"
          >
            {[hoy.getFullYear(), hoy.getFullYear() - 1, hoy.getFullYear() - 2].map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <div className="periodo-349-trimestres" role="group" aria-label="Trimestre a declarar">
            {[1, 2, 3, 4].map(t => (
              <button
                key={t}
                type="button"
                className={`periodo-349-t ${trimestre === t ? 'activo' : ''}`}
                aria-pressed={trimestre === t}
                onClick={() => setTrimestre(t)}
              >
                {t}T
              </button>
            ))}
          </div>
          {datos349.totalOperaciones > 0 && (
            <button className="btn btn-primary" onClick={descargar349}>
              <Download size={16} /> Descargar 349
            </button>
          )}
        </div>
      </div>

      {/* Este aviso salía SIN FONDO NI BORDE: usaba `var(--bg-info)`,
          `var(--border-info)` y `var(--text-accent)`, tres variables que
          no existen en la hoja de estilos. Un `var()` sin definir y sin
          respaldo anula la propiedad entera, así que quedaba un párrafo
          suelto donde tenía que haber un recuadro. Ahora usa
          `.status-panel`, que es la pieza que el resto de la app ya
          emplea para esto. */}
      <div className="status-panel status-panel--info" style={{ marginBottom: 'var(--space-5)' }}>
        <span className="status-panel-icon"><Info size={18} /></span>
        <div className="status-panel-body">
          <div className="status-panel-title">Cuándo hay que presentar el 349</div>
          <p className="status-panel-text">
            Si vendes o compras a empresas de otros países de la Unión Europea. Se presenta
            cada trimestre —o cada mes si pasas de 50.000 € — y las entregas de bienes van
            <strong> sin IVA</strong>: lo liquida el cliente en su país (inversión del sujeto pasivo).
          </p>
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
        <div className="status-panel status-panel--warning" style={{ marginBottom: 'var(--space-5)' }}>
          <span className="status-panel-icon"><AlertTriangle size={18} /></span>
          <div className="status-panel-body">
            <div className="status-panel-title">
              {resumen.facturasIncompletas} factura{resumen.facturasIncompletas !== 1 ? 's' : ''} se
              {resumen.facturasIncompletas !== 1 ? ' quedan' : ' queda'} fuera del 349
            </div>
            <p className="status-panel-text">
              {resumen.facturasIncompletas !== 1 ? 'Les' : 'Le'} falta el NIF-IVA del cliente, que es
              lo que identifica al operador en el modelo. Añádelo en su ficha y
              {resumen.facturasIncompletas !== 1 ? ' entrarán' : ' entrará'} solo.
            </p>
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
