import Link from 'next/link';
import { exigirAdminCon2fa } from '@/lib/admin/dal';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { proximoPlazo } from '@/lib/plataforma/plazos';
import { eventosPendientes } from '@/lib/admin/datos';
import { formatCurrency, formatDate } from '@/lib/utils';
import { AlertCircle, ArrowUpRight, CheckCircle2, AlertTriangle, ShieldCheck, Landmark, FileText, Calendar } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function AdminHacienda() {
  await exigirAdminCon2fa();
  const db = supabaseServicio();
  const hoy = new Date();
  const plazo = proximoPlazo(hoy);

  const rangos: Record<number, { inicio: string; fin: string; etiqueta: string }> = {
    1: { inicio: `${plazo.anio}-01-01`, fin: `${plazo.anio}-03-31`, etiqueta: `1T ${plazo.anio} (Enero – Marzo)` },
    2: { inicio: `${plazo.anio}-04-01`, fin: `${plazo.anio}-06-30`, etiqueta: `2T ${plazo.anio} (Abril – Junio)` },
    3: { inicio: `${plazo.anio}-07-01`, fin: `${plazo.anio}-09-30`, etiqueta: `3T ${plazo.anio} (Julio – Septiembre)` },
    4: { inicio: `${plazo.anio}-10-01`, fin: `${plazo.anio}-12-31`, etiqueta: `4T ${plazo.anio} (Octubre – Diciembre)` },
  };
  const { inicio, fin, etiqueta } = rangos[plazo.trimestre];

  const { data: cfg } = await db.from('plataforma_config').select('*').single();
  const emisorUserId = cfg?.emisor_user_id;

  const [invoicesRes, vfRes, pendientes] = await Promise.all([
    emisorUserId
      ? db
          .from('invoices')
          .select('id, number, series, issue_date, client_name, client_nif, subtotal, total_tax, total, status, datos_extras')
          .eq('user_id', emisorUserId)
          .eq('status', 'pagada')
          .gte('issue_date', inicio)
          .lte('issue_date', fin)
          .order('issue_date', { ascending: false })
      : { data: [] },
    emisorUserId
      ? db
          .from('verifactu_registros')
          .select('id, num_serie, estado, intentos, descripcion_error, fecha_expedicion')
          .eq('user_id', emisorUserId)
          .in('estado', ['pendiente', 'error_envio', 'rechazado'])
      : { data: [] },
    eventosPendientes(),
  ]);

  const facturas = invoicesRes.data ?? [];
  const vfPendientes = vfRes.data ?? [];

  let baseTotal = 0;
  let igicTotal = 0;
  let totalFacturado = 0;
  let baseSinIgic = 0;
  let baseConIgic = 0;

  for (const f of facturas) {
    const subtotal = Number(f.subtotal) || 0;
    const tax = Number(f.total_tax) || 0;
    const tot = Number(f.total) || 0;

    baseTotal += subtotal;
    igicTotal += tax;
    totalFacturado += tot;

    const esSinIgic = tax === 0 || (f.datos_extras as { calificacion?: string } | null)?.calificacion === 'N2';
    if (esSinIgic) {
      baseSinIgic += subtotal;
    } else {
      baseConIgic += subtotal;
    }
  }

  const avisoUrgente = plazo.dias <= 10;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>
            <Landmark size={14} />
            <span>Gestión Tributaria & Liquidaciones</span>
          </div>
          <h1 style={{ fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.03em', margin: 0 }}>
            Hacienda y Modelos Fiscales
          </h1>
          <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.9375rem' }}>
            Liquidación fiscal de la plataforma FactuKlima · Periodo actual: <strong>{etiqueta}</strong>
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Link
            href="/listados-fiscales/420"
            className="apple-btn-secondary"
          >
            <span>Generar Modelo 420 (ATC)</span>
            <ArrowUpRight size={14} />
          </Link>
          <Link
            href="/listados-fiscales/130"
            className="apple-btn-primary"
          >
            <span>Generar Modelo 130 (AEAT)</span>
            <ArrowUpRight size={14} />
          </Link>
        </div>
      </div>

      {/* Banner de plazo estilo Apple */}
      <div
        className="apple-card"
        style={{
          borderLeft: avisoUrgente ? '4px solid #f59e0b' : '4px solid #3b82f6',
          background: avisoUrgente
            ? 'linear-gradient(135deg, rgba(254, 243, 199, 0.5) 0%, rgba(255, 255, 255, 0.9) 100%)'
            : 'linear-gradient(135deg, rgba(239, 246, 255, 0.5) 0%, rgba(255, 255, 255, 0.9) 100%)',
          padding: '1.25rem 1.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
          {avisoUrgente ? (
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(245, 158, 11, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d97706', flexShrink: 0 }}>
              <AlertTriangle size={22} />
            </div>
          ) : (
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(59, 130, 246, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb', flexShrink: 0 }}>
              <ShieldCheck size={22} />
            </div>
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: '1.05rem', color: 'var(--text-primary)', marginBottom: '0.2rem' }}>
              Próximo vencimiento: Liquidación {plazo.trimestre}T {plazo.anio}
            </div>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              Fecha límite oficial: <strong>{formatDate(plazo.limite)}</strong> · Quedan{' '}
              <strong style={{ color: avisoUrgente ? '#d97706' : 'var(--text-primary)' }}>
                {plazo.dias} {plazo.dias === 1 ? 'día' : 'días'}
              </strong>.
            </p>
            <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>
              El modelo 420 se presenta telemáticamente en la sede de la <strong>Agencia Tributaria Canaria (ATC)</strong>; el modelo 130,
              importando el fichero en la sede de la <strong>AEAT</strong>. FactuKlima genera el desglose oficial exacto pero no realiza la firma final en las sedes.
            </p>
          </div>
        </div>
      </div>

      {/* Hero Analytics Cards */}
      <div className="analytics-hero-grid">
        <div className="analytics-hero-card">
          <div className="analytics-hero-label">
            <span>Total Facturado ({plazo.trimestre}T)</span>
            <FileText size={16} className="text-gray-400" />
          </div>
          <div className="analytics-hero-value">{formatCurrency(totalFacturado)}</div>
          <div className="analytics-hero-sub">
            <span>{facturas.length} {facturas.length === 1 ? 'factura emitida' : 'facturas emitidas'}</span>
          </div>
        </div>

        <div className="analytics-hero-card">
          <div className="analytics-hero-label">
            <span>Base IGIC (Canarias 7 %)</span>
            <span className="apple-pill apple-pill-emerald" style={{ padding: '1px 6px', fontSize: '0.7rem' }}>7%</span>
          </div>
          <div className="analytics-hero-value">{formatCurrency(baseConIgic)}</div>
          <div className="analytics-hero-sub">
            <span style={{ color: '#059669', fontWeight: 600 }}>Cuota IGIC: {formatCurrency(igicTotal)}</span>
          </div>
        </div>

        <div className="analytics-hero-card">
          <div className="analytics-hero-label">
            <span>Base Península (N2)</span>
            <span className="apple-pill apple-pill-blue" style={{ padding: '1px 6px', fontSize: '0.7rem' }}>Art. 84</span>
          </div>
          <div className="analytics-hero-value">{formatCurrency(baseSinIgic)}</div>
          <div className="analytics-hero-sub">
            <span>Inversión del sujeto pasivo LIVA</span>
          </div>
        </div>

        <div className="analytics-hero-card">
          <div className="analytics-hero-label">
            <span>Veri*Factu en Cola</span>
            <ShieldCheck size={16} className={vfPendientes.length > 0 ? 'text-rose-500' : 'text-emerald-500'} />
          </div>
          <div className="analytics-hero-value" style={{ color: vfPendientes.length > 0 ? '#e11d48' : 'inherit' }}>
            {vfPendientes.length}
          </div>
          <div className="analytics-hero-sub">
            <span>{vfPendientes.length > 0 ? 'Pendientes de envío a AEAT' : 'Todos los registros al día'}</span>
          </div>
        </div>
      </div>

      {/* Facturas Emitidas Table Card */}
      <div className="apple-card" style={{ padding: 0 }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(0,0,0,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0 }}>
              Facturas Emitidas por la Plataforma ({facturas.length})
            </h2>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>
              Series {cfg?.serie_suscripciones ?? 'SUS'} (planes recurrentes) y {cfg?.serie_propinas ?? 'PROP'} (aportaciones voluntarias)
            </p>
          </div>
          <span className="apple-pill apple-pill-slate">Periodo {etiqueta}</span>
        </div>

        {facturas.length === 0 ? (
          <div style={{ padding: '3.5rem 1rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>
            <p style={{ fontSize: '1rem', fontWeight: 500, margin: 0 }}>No hay facturas emitidas en este trimestre todavía.</p>
            <p style={{ fontSize: '0.8125rem', marginTop: '0.25rem' }}>Los cobros de Stripe generarán automáticamente las facturas aquí.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="apple-table">
              <thead>
                <tr>
                  <th>Factura</th>
                  <th>Fecha</th>
                  <th>Cliente</th>
                  <th>NIF</th>
                  <th style={{ textAlign: 'right' }}>Base Imponible</th>
                  <th style={{ textAlign: 'right' }}>Cuota IGIC</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th style={{ textAlign: 'center' }}>Tratamiento</th>
                </tr>
              </thead>
              <tbody>
                {facturas.map(f => {
                  const esSinIgic = (Number(f.total_tax) || 0) === 0;
                  return (
                    <tr key={f.id}>
                      <td style={{ fontWeight: 600 }}>{f.number}</td>
                      <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>{formatDate(f.issue_date)}</td>
                      <td>{f.client_name || 'Cliente sin identificar'}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.8125rem' }}>{f.client_nif || '—'}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {formatCurrency(Number(f.subtotal) || 0)}
                      </td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: esSinIgic ? 'var(--text-tertiary)' : '#059669' }}>
                        {formatCurrency(Number(f.total_tax) || 0)}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                        {formatCurrency(Number(f.total) || 0)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {esSinIgic ? (
                          <span className="apple-pill apple-pill-blue">N2 · Península</span>
                        ) : (
                          <span className="apple-pill apple-pill-emerald">IGIC 7%</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
