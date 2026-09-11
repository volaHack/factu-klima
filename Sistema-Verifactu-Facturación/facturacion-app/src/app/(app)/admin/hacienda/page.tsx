import Link from 'next/link';
import { exigirAdminCon2fa } from '@/lib/admin/dal';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { proximoPlazo } from '@/lib/plataforma/plazos';
import { eventosPendientes } from '@/lib/admin/datos';
import { formatCurrency, formatDate } from '@/lib/utils';
import { AlertCircle, ArrowUpRight, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">Hacienda y Modelos Fiscales</h1>
          <p className="page-subtitle">
            Liquidación de impuestos de la plataforma FactuKlima · Trimestre actual: <strong>{etiqueta}</strong>
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Link href="/listados-fiscales/420" className="btn btn-secondary">
            <span>Modelo 420 (ATC)</span>
            <ArrowUpRight className="w-4 h-4 ml-1" />
          </Link>
          <Link href="/listados-fiscales/130" className="btn btn-secondary">
            <span>Modelo 130 (AEAT)</span>
            <ArrowUpRight className="w-4 h-4 ml-1" />
          </Link>
        </div>
      </div>

      {/* Banner de plazo */}
      <div
        className="card"
        style={{
          borderLeft: avisoUrgente ? '4px solid #f59e0b' : '4px solid #3b82f6',
          backgroundColor: avisoUrgente ? 'rgba(245, 158, 11, 0.05)' : 'rgba(59, 130, 246, 0.05)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
          {avisoUrgente ? (
            <AlertTriangle className="w-6 h-6 text-amber-500" style={{ flexShrink: 0, marginTop: '2px' }} />
          ) : (
            <ShieldCheck className="w-6 h-6 text-blue-500" style={{ flexShrink: 0, marginTop: '2px' }} />
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: '1.1rem', marginBottom: '0.25rem' }}>
              Próximo plazo: Presentación {plazo.trimestre}T {plazo.anio}
            </div>
            <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>
              Límite de presentación: <strong>{formatDate(plazo.limite)}</strong> · Quedan{' '}
              <strong>{plazo.dias} {plazo.dias === 1 ? 'día' : 'días'}</strong>.
            </p>
            <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
              El modelo 420 se presenta en la sede de la <strong>Agencia Tributaria Canaria (ATC)</strong>; el modelo 130,
              importando el fichero en la sede de la <strong>AEAT</strong>. La aplicación calcula los modelos y genera los ficheros
              oficiales, pero la firma y presentación se realiza en las respectivas sedes tributarias.
            </p>
          </div>
        </div>
      </div>

      {/* KPIs del Trimestre */}
      <div className="kpi-grid">
        <div className="card">
          <div className="card-subtitle">Total Facturado ({plazo.trimestre}T)</div>
          <div className="page-meta-value">{formatCurrency(totalFacturado)}</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
            {facturas.length} {facturas.length === 1 ? 'factura emitida' : 'facturas emitidas'}
          </div>
        </div>
        <div className="card">
          <div className="card-subtitle">Base con IGIC (Canarias 7 %)</div>
          <div className="page-meta-value">{formatCurrency(baseConIgic)}</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
            Cuota repercutida: <strong>{formatCurrency(igicTotal)}</strong>
          </div>
        </div>
        <div className="card">
          <div className="card-subtitle">Base sin IGIC (Península / N2)</div>
          <div className="page-meta-value">{formatCurrency(baseSinIgic)}</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
            Inversión del sujeto pasivo (art. 84 LIVA)
          </div>
        </div>
        <div className="card">
          <div className="card-subtitle">Veri*Factu Pendientes</div>
          <div className="page-meta-value" style={{ color: vfPendientes.length > 0 ? '#ef4444' : 'inherit' }}>
            {vfPendientes.length}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
            {vfPendientes.length > 0 ? 'Pendientes de envío a AEAT' : 'Todos los registros al día'}
          </div>
        </div>
        <div className="card">
          <div className="card-subtitle">Stripe por Revisar</div>
          <div className="page-meta-value" style={{ color: pendientes.length > 0 ? '#ef4444' : 'inherit' }}>
            {pendientes.length}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
            {pendientes.length > 0 ? 'Cobros sin factura o fallidos' : 'Sin incidencias'}
          </div>
        </div>
      </div>

      {/* Alertas si hay registros de VeriFactu o eventos de Stripe pendientes */}
      {vfPendientes.length > 0 && (
        <div className="card" style={{ borderLeft: '4px solid #ef4444' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <AlertCircle className="w-5 h-5 text-red-500" />
            <strong style={{ color: '#ef4444' }}>Registros Veri*Factu pendientes de resolver:</strong>
          </div>
          <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.875rem' }}>
            {vfPendientes.slice(0, 5).map(r => (
              <li key={r.id}>
                Factura <strong>{r.num_serie}</strong> · Estado: {r.estado} · {r.descripcion_error || 'Pendiente de envío'}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Listado de Facturas del Trimestre */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0 }}>
            Facturas emitidas por la plataforma ({facturas.length})
          </h2>
          <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
            Series {cfg?.serie_suscripciones ?? 'SUS'} (suscripciones) y {cfg?.serie_propinas ?? 'PROP'} (propinas)
          </div>
        </div>

        {facturas.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '2rem 0' }}>
            No hay facturas emitidas en este trimestre todavía.
          </p>
        ) : (
          <div className="table-responsive">
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Número</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Fecha</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>Cliente</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem' }}>NIF</th>
                  <th style={{ textAlign: 'right', padding: '0.5rem' }}>Base</th>
                  <th style={{ textAlign: 'right', padding: '0.5rem' }}>IGIC</th>
                  <th style={{ textAlign: 'right', padding: '0.5rem' }}>Total</th>
                  <th style={{ textAlign: 'center', padding: '0.5rem' }}>Régimen / Tipo</th>
                </tr>
              </thead>
              <tbody>
                {facturas.map(f => {
                  const esSinIgic = (Number(f.total_tax) || 0) === 0;
                  return (
                    <tr key={f.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '0.5rem', fontWeight: 500 }}>{f.number}</td>
                      <td style={{ padding: '0.5rem' }}>{formatDate(f.issue_date)}</td>
                      <td style={{ padding: '0.5rem' }}>{f.client_name || 'Sin identificar'}</td>
                      <td style={{ padding: '0.5rem', fontFamily: 'monospace' }}>{f.client_nif || '—'}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'right' }}>{formatCurrency(Number(f.subtotal) || 0)}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'right' }}>{formatCurrency(Number(f.total_tax) || 0)}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 600 }}>
                        {formatCurrency(Number(f.total) || 0)}
                      </td>
                      <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                        {esSinIgic ? (
                          <span className="badge" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
                            N2 · Península
                          </span>
                        ) : (
                          <span className="badge" style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                            IGIC 7% · Canarias
                          </span>
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
