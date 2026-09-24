import Link from 'next/link';
import { exigirAdminCon2fa } from '@/lib/admin/dal';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { proximoPlazo } from '@/lib/plataforma/plazos';
import { eventosPendientes } from '@/lib/admin/datos';
import { formatCurrency, formatDate } from '@/lib/utils';
import { AlertCircle, ArrowUpRight, CheckCircle2, AlertTriangle, ShieldCheck, Landmark, FileText, Calendar, BookOpen } from 'lucide-react';
import { resumenIngresos, type Ingreso } from '@/lib/plataforma/ingresos';
import AccionesIngresos from './AccionesIngresos';

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

  const [invoicesRes, vfRes, pendientes, ingresosRes, emisorRes] = await Promise.all([
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
    // El libro de ingresos del trimestre: TODO lo cobrado, facturado o no.
    db
      .from('ingresos_plataforma')
      .select('*, factura:invoices(number)')
      .gte('fecha', inicio)
      .lte('fecha', fin)
      .order('fecha', { ascending: false }),
    emisorUserId
      ? db.from('company_settings').select('business_name, nif, address, postal_code, city').eq('user_id', emisorUserId).maybeSingle()
      : { data: null },
  ]);

  const ingresos = (ingresosRes.data ?? []) as (Ingreso & { id: string; factura?: { number?: string } | null })[];
  const libro = resumenIngresos(ingresos);
  const actividadDesde: string | null = cfg?.actividad_desde ?? null;
  // Lo que el botón puede facturar: pendientes cobrados ya con el alta puesta.
  const facturables = actividadDesde
    ? ingresos.filter(i => i.estado === 'pendiente_alta' && i.fecha >= actividadDesde).length
    : 0;

  // Las facturas salen con los datos del emisor: si faltan o no son de
  // Canarias (con IGIC), cada factura saldría mal. Se avisa antes.
  const emisor = emisorRes.data as { business_name?: string; nif?: string; address?: string; postal_code?: string; city?: string } | null;
  const faltanDatosEmisor = !emisorUserId || !emisor?.business_name || !emisor?.nif || !emisor?.address || !emisor?.postal_code;
  const emisorFueraDeCanarias = Boolean(emisor?.postal_code) && !/^(35|38)/.test(String(emisor?.postal_code));

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
        className={`apple-card ${avisoUrgente ? 'hacienda-banner-aviso' : 'hacienda-banner-normal'}`}
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

      {/* Libro de ingresos de la plataforma: suscripciones, propinas y devoluciones */}
      <div className="apple-card" style={{ padding: 0 }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-subtle, rgba(0,0,0,0.06))', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <BookOpen size={18} /> Libro de ingresos de la plataforma
            </h2>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>
              Cada cobro de Stripe (suscripciones, propinas y devoluciones) queda apuntado aquí, se haya facturado o no · {etiqueta}
            </p>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.6rem' }}>
              <span className={`apple-pill ${actividadDesde ? 'apple-pill-blue' : 'apple-pill-slate'}`}>
                {actividadDesde ? `De alta desde ${formatDate(actividadDesde)}` : 'Sin fecha de alta'}
              </span>
              <Link href="/admin/configuracion" className="apple-pill apple-pill-slate" style={{ textDecoration: 'none' }}>Cambiar en Configuración →</Link>
            </div>
          </div>
          <AccionesIngresos desde={inicio} hasta={fin} facturables={facturables} conAlta={Boolean(actividadDesde)} />
        </div>

        {(faltanDatosEmisor || emisorFueraDeCanarias) && (
          <div style={{ margin: '1rem 1.5rem 0', display: 'flex', gap: '0.6rem', padding: '0.75rem 1rem', borderRadius: 12, background: 'rgba(245, 158, 11, 0.1)', color: '#92400e', fontSize: '0.8125rem' }}>
            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              {faltanDatosEmisor
                ? <>Tus datos de emisor están incompletos (nombre, NIF, dirección o código postal). Las facturas de la plataforma salen con ellos: complétalos en <Link href="/ajustes">Ajustes</Link> antes de dar el alta.</>
                : <>El código postal de tus datos de emisor ({emisor?.postal_code}{emisor?.city ? `, ${emisor.city}` : ''}) no es de Canarias, y facturas con IGIC. Revísalo en <Link href="/ajustes">Ajustes</Link>.</>}
            </span>
          </div>
        )}

        <div className="libro-resumen">
          <div><span>Cobrado neto</span><strong>{formatCurrency(libro.total)}</strong><small>{libro.cobros} {libro.cobros === 1 ? 'movimiento' : 'movimientos'}</small></div>
          <div><span>Suscripciones</span><strong>{formatCurrency(libro.porTipo.suscripcion)}</strong></div>
          <div><span>Propinas</span><strong>{formatCurrency(libro.porTipo.propina)}</strong></div>
          <div><span>Devoluciones</span><strong>{formatCurrency(libro.porTipo.devolucion)}</strong></div>
          <div><span>Base / IGIC</span><strong>{formatCurrency(libro.base)}</strong><small>IGIC {formatCurrency(libro.cuota)}</small></div>
          <div>
            <span>Sin factura</span>
            <strong style={{ color: libro.porEstado.pendiente_alta + libro.porEstado.revisar > 0 ? '#d97706' : undefined }}>
              {libro.porEstado.pendiente_alta + libro.porEstado.revisar}
            </strong>
            <small>{libro.porEstado.revisar > 0 ? `${libro.porEstado.revisar} por revisar` : 'pendientes de alta'}</small>
          </div>
        </div>

        {ingresos.length === 0 ? (
          <div style={{ padding: '2rem 1rem 2.5rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>
            <p style={{ fontSize: '0.95rem', fontWeight: 500, margin: 0 }}>Ningún cobro este trimestre.</p>
            <p style={{ fontSize: '0.8125rem', marginTop: '0.25rem' }}>
              Los cobros de Stripe se apuntarán aquí solos.
            </p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="apple-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Concepto</th>
                  <th>Cliente</th>
                  <th style={{ textAlign: 'right' }}>Base</th>
                  <th style={{ textAlign: 'right' }}>IGIC</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th style={{ textAlign: 'center' }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {ingresos.map(i => (
                  <tr key={i.id} title={i.nota ?? undefined}>
                    <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{formatDate(i.fecha)}</td>
                    <td>{i.tipo === 'suscripcion' ? 'Suscripción' : i.tipo === 'propina' ? 'Propina' : 'Devolución'}</td>
                    <td>{i.concepto}</td>
                    <td>
                      {i.cliente_nombre || '—'}
                      {i.cliente_nif && <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{i.cliente_nif}</div>}
                    </td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(Number(i.base))}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-tertiary)' }}>{formatCurrency(Number(i.cuota))}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(Number(i.importe))}</td>
                    <td style={{ textAlign: 'center' }}>
                      {i.estado === 'facturado' ? (
                        <span className="apple-pill apple-pill-emerald">{i.factura?.number ?? 'Facturado'}</span>
                      ) : i.estado === 'revisar' ? (
                        <span className="apple-pill apple-pill-rose">Revisar</span>
                      ) : (
                        <span className="apple-pill apple-pill-amber">Pendiente de alta</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p style={{ margin: 0, padding: '0.9rem 1.5rem 1.1rem', fontSize: '0.78rem', color: 'var(--text-tertiary)', borderTop: '1px solid var(--border-subtle, rgba(0,0,0,0.06))' }}>
          Sin fecha de alta nada se factura: el cobro queda «pendiente de alta» con su base e impuesto calculados. Con la fecha puesta, lo cobrado desde ese día se factura solo;
          lo anterior se regulariza con la gestoría con el CSV. Las propinas son un ingreso más de la actividad: se declaran igual que las suscripciones.
        </p>
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
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-subtle, rgba(0,0,0,0.06))', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
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
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: esSinIgic ? 'var(--text-tertiary)' : 'var(--color-success, #059669)' }}>
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
