'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ShieldCheck, ShieldAlert, RefreshCw, Fingerprint, History,
  Lock, TriangleAlert,
} from 'lucide-react';
import {
  getChainStatus, verifyChain, getInvoiceEvents,
  type ChainStatus, type ChainBreak, type InvoiceEvent,
} from '@/lib/storage';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useToast } from '@/hooks/useToast';

/** Traduce los códigos técnicos del registro de eventos a lenguaje llano. */
const EVENT_LABEL: Record<string, string> = {
  INVOICE_SEALED: 'Factura sellada',
  INVOICE_CANCELLED: 'Factura anulada',
  STATUS_CHANGED: 'Cambio de estado',
  DRAFT_DELETED: 'Borrador eliminado',
  TAMPER_BLOCKED: 'Manipulación bloqueada',
  DELETE_BLOCKED: 'Borrado bloqueado',
  BACKDATE_BLOCKED: 'Fecha retroactiva bloqueada',
  STATUS_REVERT_BLOCKED: 'Reversión de estado bloqueada',
  LINE_TAMPER_BLOCKED: 'Alteración de líneas bloqueada',
  TAX_TAMPER_BLOCKED: 'Alteración de IVA bloqueada',
  NIF_CHANGE_BLOCKED: 'Cambio de NIF bloqueado',
  COUNTER_ROLLBACK_BLOCKED: 'Retroceso de numeración bloqueado',
};

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

export default function IntegridadPage() {
  const [status, setStatus] = useState<ChainStatus | null>(null);
  const [breaks, setBreaks] = useState<ChainBreak[]>([]);
  const [events, setEvents] = useState<InvoiceEvent[]>([]);
  const [mounted, setMounted] = useState(false);
  const [checking, setChecking] = useState(false);
  const { success, error: toastError } = useToast();

  useEffect(() => {
    (async () => {
      const [s, b, e] = await Promise.all([
        getChainStatus(),
        verifyChain(),
        getInvoiceEvents(120),
      ]);
      setStatus(s);
      setBreaks(b);
      setEvents(e);
      setMounted(true);
    })();
  }, []);

  const handleRecheck = async () => {
    setChecking(true);
    try {
      const [s, b, e] = await Promise.all([
        getChainStatus(),
        verifyChain(),
        getInvoiceEvents(120),
      ]);
      setStatus(s);
      setBreaks(b);
      setEvents(e);
      success('Verificación completada', 'Se ha recalculado toda la cadena de huellas');
    } catch (err) {
      toastError('No se pudo verificar', err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setChecking(false);
    }
  };

  if (!mounted) {
    return <PageSkeleton variant="report" label="Verificando la cadena de huellas" />;
  }

  const chainValid = status?.chainValid ?? true;
  const criticalEvents = events.filter(e => e.severity === 'critical');

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <p className="page-eyebrow"><Fingerprint /> Antifraude</p>
          <h1 className="page-title">Integridad de la cadena</h1>
          <p className="page-subtitle">
            Aquí se comprueba, factura a factura, que nadie ha tocado nada por debajo. También
            queda constancia de los intentos que el sistema ha bloqueado.
          </p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={handleRecheck} disabled={checking}>
            <RefreshCw size={16} className={checking ? 'spin' : undefined} />
            {checking ? 'Comprobando…' : 'Comprobar ahora'}
          </button>
        </div>
      </div>

      {/* Estado de la cadena */}
      <div className={`integrity-banner ${chainValid ? 'integrity-banner--ok' : 'integrity-banner--broken'}`}>
        {/* key por checkedAt: fuerza a remontar el icono en cada "Verificar
            ahora" para que el anillo de sello (seal-ring) se repita, en vez
            de quedarse jugado sólo la primera vez que carga la página. */}
        <div className="integrity-icon" key={status?.checkedAt ?? 'initial'}>
          {chainValid ? <ShieldCheck size={22} /> : <ShieldAlert size={22} />}
        </div>
        <div className="integrity-body">
          <div className="integrity-title">
            {chainValid
              ? 'Cadena íntegra: ninguna factura ha sido alterada'
              : `Cadena comprometida: ${breaks.length} ${breaks.length === 1 ? 'factura no cuadra' : 'facturas no cuadran'} con su huella`}
          </div>
          <div className="integrity-detail">
            {chainValid
              ? 'Cada factura emitida se ha recalculado y su huella SHA-256 coincide con la almacenada.'
              : 'Alguien ha modificado registros directamente en la base de datos. Revisa el detalle más abajo.'}
            {status?.checkedAt && ` · Comprobado ${formatDateTime(status.checkedAt)}`}
          </div>
        </div>
        <div className="integrity-meta">
          <div className="integrity-meta-item">
            <div className="integrity-meta-value">{status?.sealedInvoices ?? 0}</div>
            <div className="integrity-meta-label">Selladas</div>
          </div>
          <div className="integrity-meta-item">
            <div className="integrity-meta-value" style={{ color: breaks.length ? 'var(--color-danger)' : undefined }}>
              {breaks.length}
            </div>
            <div className="integrity-meta-label">Rotas</div>
          </div>
          <div className="integrity-meta-item">
            <div className="integrity-meta-value" style={{ color: criticalEvents.length ? 'var(--color-warning)' : undefined }}>
              {status?.criticalAlerts ?? 0}
            </div>
            <div className="integrity-meta-label">Alertas 90d</div>
          </div>
        </div>
      </div>

      {/* Eslabones rotos */}
      {breaks.length > 0 && (
        <section className="chart-card" style={{ marginBottom: 'var(--space-4)', borderColor: 'rgba(239, 68, 68, 0.35)' }}>
          <header className="chart-header">
            <div className="chart-heading">
              <h3 className="chart-title" style={{ color: 'var(--color-danger)' }}>
                Facturas que no cuadran con su huella
              </h3>
              <p className="chart-subtitle">
                Estos registros se han modificado por fuera de la aplicación. Conserva esta información:
                es la prueba de qué se alteró y cuándo.
              </p>
            </div>
          </header>
          <div className="table-container" style={{ border: 'none' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Pos.</th>
                  <th>Factura</th>
                  <th>Fecha</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th>Problema detectado</th>
                </tr>
              </thead>
              <tbody>
                {breaks.map(b => (
                  <tr key={b.invoiceId}>
                    <td className="mono">#{b.chainIndex}</td>
                    <td>
                      <Link href={`/facturas/${b.invoiceId}`} className="mono primary">
                        {b.invoiceNumber}
                      </Link>
                    </td>
                    <td>{formatDate(b.issueDate)}</td>
                    <td className="amount">{formatCurrency(b.total)}</td>
                    <td style={{ color: 'var(--color-danger)', fontSize: 'var(--text-xs)', maxWidth: 380 }}>
                      {b.problem}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="charts-grid charts-grid--even">
        {/* Qué protege el sistema */}
        <section className="chart-card">
          <header className="chart-header">
            <div className="chart-heading">
              <h3 className="chart-title">Qué impide el sistema</h3>
              <p className="chart-subtitle">
                Reglas aplicadas en la base de datos, no en el navegador: no se pueden saltar
                desde las herramientas de desarrollo.
              </p>
            </div>
          </header>
          <ul className="protection-list">
            {[
              { icon: Fingerprint, title: 'Huella encadenada', text: 'Cada factura emitida guarda un SHA-256 que incluye la huella de la anterior. Cambiar un importe rompe la cadena de forma visible.' },
              { icon: Lock, title: 'Facturas inmutables', text: 'Una vez emitida, no se pueden alterar número, fecha, importes ni NIF. Sólo se anula o se rectifica.' },
              { icon: TriangleAlert, title: 'Sin borrados', text: 'Las facturas emitidas no se pueden eliminar, ni desde la app ni por la API.' },
              { icon: History, title: 'Numeración blindada', text: 'Números únicos por serie, sin huecos, sin fechas retroactivas y sin retroceder el contador.' },
              { icon: ShieldCheck, title: 'Totales del servidor', text: 'Los importes se recalculan desde las líneas: un total manipulado no llega a guardarse.' },
            ].map(item => (
              <li key={item.title}>
                <item.icon size={16} />
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Registro de eventos */}
        <section className="chart-card">
          <header className="chart-header">
            <div className="chart-heading">
              <h3 className="chart-title">Registro de eventos</h3>
              <p className="chart-subtitle">
                Append-only: ni tú puedes borrarlo. Incluye los intentos bloqueados.
              </p>
            </div>
          </header>

          {events.length === 0 ? (
            <div className="chart-empty" style={{ minHeight: 200 }}>
              <History size={26} strokeWidth={1.5} />
              <p className="chart-empty-label">Sin eventos registrados</p>
              <div className="chart-empty-hint">
                El registro empieza a llenarse cuando emitas tu primera factura.
              </div>
            </div>
          ) : (
            <div className="scroll-region">
              {events.map(e => (
                <div className="event-row" key={e.id}>
                  <span className={`event-badge event-badge--${e.severity}`} />
                  <div className="event-body">
                    <div className="event-type">
                      {EVENT_LABEL[e.eventType] ?? e.eventType}
                      {e.invoiceNumber && (
                        <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> · {e.invoiceNumber}</span>
                      )}
                    </div>
                    {e.detail && <div className="event-detail">{e.detail}</div>}
                  </div>
                  <span className="event-time">{formatDateTime(e.occurredAt)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
