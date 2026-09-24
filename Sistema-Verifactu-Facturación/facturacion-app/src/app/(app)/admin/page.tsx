import Link from 'next/link';
import { exigirAdminCon2fa } from '@/lib/admin/dal';
import { listarCuentas, eventosPendientes } from '@/lib/admin/datos';
import { resumen } from '@/lib/admin/cuentas';
import { proximoPlazo } from '@/lib/plataforma/plazos';
import { getPlan, type PlanId } from '@/lib/plans';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  TrendingUp,
  Users,
  ShieldCheck,
  AlertCircle,
  ArrowUpRight,
  CreditCard,
  Layers,
  ArrowRight,
  Activity,
  Zap,
  Calendar,
  Sparkles,
  Download,
  Sliders,
  FileSpreadsheet,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function AdminResumen() {
  await exigirAdminCon2fa();
  const [cuentas, pendientes] = await Promise.all([listarCuentas(), eventosPendientes()]);
  const hoy = new Date();
  const r = resumen(cuentas, hoy);
  const plazo = proximoPlazo(hoy);
  const avisoPlazo = plazo.dias <= 10;

  // Cálculos analíticos avanzados
  const arrProyectado = r.ingresosMensuales * 12;
  const totalActivas = r.activasPorPlan.basico + r.activasPorPlan.pro + r.activasPorPlan.sin_limite;
  const dePago = Math.max(0, totalActivas - r.cortesias);
  const arpu = dePago > 0 ? r.ingresosMensuales / dePago : 0;
  const totalFacturasMes = cuentas.reduce((acc, c) => acc + (c.facturasMes || 0), 0);
  const tasaConversion = cuentas.length > 0 ? (totalActivas / cuentas.length) * 100 : 0;
  const tasaBajas = totalActivas > 0 ? (r.bajasMes / (totalActivas + r.bajasMes)) * 100 : 0;

  // Porcentajes para barra segmentada Apple
  const pctBasico = totalActivas > 0 ? (r.activasPorPlan.basico / totalActivas) * 100 : 0;
  const pctPro = totalActivas > 0 ? (r.activasPorPlan.pro / totalActivas) * 100 : 0;
  const pctSinLimite = totalActivas > 0 ? (r.activasPorPlan.sin_limite / totalActivas) * 100 : 0;

  // Cuentas con mayor actividad este mes
  const masActivas = [...cuentas]
    .sort((a, b) => b.facturasMes - a.facturasMes)
    .slice(0, 5);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      {/* Header con bienvenida ejecutiva */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>
            <Sparkles size={14} className="text-amber-500" />
            <span>Centro de Control de Operaciones</span>
          </div>
          <h1 style={{ fontSize: '2.25rem', fontWeight: 700, letterSpacing: '-0.035em', margin: 0, color: 'var(--text-primary)' }}>
            Panel de Administración
          </h1>
          <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.9375rem' }}>
            Monitorización en tiempo real de cuentas, ingresos recurrentes y fiscalidad del software.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <Link href="/admin/cuentas" className="apple-btn-secondary">
            <Users size={16} />
            <span>Gestionar Cuentas</span>
          </Link>
          <Link href="/admin/hacienda" className="apple-btn-primary">
            <Calendar size={16} />
            <span>Inspección Fiscal</span>
          </Link>
        </div>
      </div>

      {/* Banner de aviso fiscal inteligente si está cerca el plazo */}
      {avisoPlazo && (
        <div
          className="apple-card admin-deadline-banner"
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(245, 158, 11, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d97706', flexShrink: 0 }}>
                <AlertCircle size={20} />
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#92400e' }}>
                  Atención: Vencimiento de Trimestre Fiscal ({plazo.trimestre}T {plazo.anio})
                </div>
                <div style={{ fontSize: '0.8125rem', color: '#b45309' }}>
                  Quedan <strong>{plazo.dias} {plazo.dias === 1 ? 'día' : 'días'}</strong> para presentar el Modelo 420 (ATC) y 130 (AEAT) · Límite: {formatDate(plazo.limite)}
                </div>
              </div>
            </div>
            <Link href="/admin/hacienda" className="apple-pill apple-pill-amber" style={{ textDecoration: 'none', fontWeight: 600 }}>
              <span>Ir a Liquidaciones</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      )}

      {/* Hero Analytics Cards - Grid 4x1 */}
      <div className="analytics-hero-grid">
        {/* MRR Card */}
        <div className="analytics-hero-card">
          <div className="analytics-hero-label">
            <span>Ingresos Recurrentes (MRR)</span>
            <div style={{ padding: '4px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.1)', color: '#059669' }}>
              <TrendingUp size={16} />
            </div>
          </div>
          <div className="analytics-hero-value">{formatCurrency(r.ingresosMensuales)}</div>
          <div className="analytics-hero-sub">
            <span style={{ color: '#059669', fontWeight: 600 }}>ARR {formatCurrency(arrProyectado)}</span>
            <span>· Run-rate anual</span>
          </div>
        </div>

        {/* Cuentas Activas Card */}
        <div className="analytics-hero-card">
          <div className="analytics-hero-label">
            <span>Suscripciones Activas</span>
            <div style={{ padding: '4px', borderRadius: '50%', background: 'rgba(59, 130, 246, 0.1)', color: '#2563eb' }}>
              <Users size={16} />
            </div>
          </div>
          <div className="analytics-hero-value">{totalActivas}</div>
          <div className="analytics-hero-sub">
            <span>{dePago} de pago</span>
            <span>·</span>
            <span style={{ color: '#d97706', fontWeight: 500 }}>{r.cortesias} cortesías</span>
          </div>
        </div>

        {/* ARPU Card */}
        <div className="analytics-hero-card">
          <div className="analytics-hero-label">
            <span>ARPU (Ingreso Medio)</span>
            <div style={{ padding: '4px', borderRadius: '50%', background: 'rgba(139, 92, 246, 0.1)', color: '#7c3aed' }}>
              <CreditCard size={16} />
            </div>
          </div>
          <div className="analytics-hero-value">{formatCurrency(arpu)}</div>
          <div className="analytics-hero-sub">
            <span>Por cliente de pago activo / mes</span>
          </div>
        </div>

        {/* Dinámica Mensual Card */}
        <div className="analytics-hero-card">
          <div className="analytics-hero-label">
            <span>Movimiento Este Mes</span>
            <div style={{ padding: '4px', borderRadius: '50%', background: 'rgba(244, 63, 94, 0.1)', color: '#e11d48' }}>
              <Activity size={16} />
            </div>
          </div>
          <div className="analytics-hero-value" style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
            <span style={{ color: '#059669' }}>+{r.altasMes}</span>
            <span style={{ fontSize: '1.25rem', color: 'var(--text-tertiary)' }}>/</span>
            <span style={{ color: r.bajasMes > 0 ? '#e11d48' : 'var(--text-secondary)' }}>-{r.bajasMes}</span>
          </div>
          <div className="analytics-hero-sub">
            <span>Tasa de churn: {tasaBajas.toFixed(1)}%</span>
            {r.cobrosFallidos > 0 && (
              <span className="apple-pill apple-pill-rose" style={{ padding: '2px 6px', fontSize: '0.7rem' }}>
                {r.cobrosFallidos} fallidos
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Visual Distribution Section: Apple Storage/Battery style */}
      <div className="apple-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0, letterSpacing: '-0.02em' }}>
              Distribución de Suscriptores por Plan
            </h2>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              Composición de la cartera de usuarios sobre {cuentas.length} cuentas registradas en total.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="apple-pill apple-pill-slate">
              {tasaConversion.toFixed(0)}% conversión activa
            </span>
          </div>
        </div>

        {/* Barra segmentada visual estilo Apple */}
        <div className="apple-segmented-bar">
          {pctBasico > 0 && (
            <div
              className="apple-bar-segment"
              style={{ width: `${pctBasico}%`, background: 'linear-gradient(90deg, #10b981 0%, #059669 100%)' }}
              title={`Básico: ${r.activasPorPlan.basico} (${pctBasico.toFixed(0)}%)`}
            />
          )}
          {pctPro > 0 && (
            <div
              className="apple-bar-segment"
              style={{ width: `${pctPro}%`, background: 'linear-gradient(90deg, #3b82f6 0%, #2563eb 100%)' }}
              title={`Pro: ${r.activasPorPlan.pro} (${pctPro.toFixed(0)}%)`}
            />
          )}
          {pctSinLimite > 0 && (
            <div
              className="apple-bar-segment"
              style={{ width: `${pctSinLimite}%`, background: 'linear-gradient(90deg, #8b5cf6 0%, #7c3aed 100%)' }}
              title={`Sin límite: ${r.activasPorPlan.sin_limite} (${pctSinLimite.toFixed(0)}%)`}
            />
          )}
        </div>

        {/* Leyenda y métricas detalladas por plan */}
        <div className="apple-legend-grid">
          <div className="apple-legend-item">
            <div className="apple-legend-dot" style={{ backgroundColor: '#10b981' }} />
            <div>
              <div style={{ fontWeight: 600 }}>Básico ({r.activasPorPlan.basico})</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{pctBasico.toFixed(0)}% de activas</div>
            </div>
          </div>

          <div className="apple-legend-item">
            <div className="apple-legend-dot" style={{ backgroundColor: '#3b82f6' }} />
            <div>
              <div style={{ fontWeight: 600 }}>Pro ({r.activasPorPlan.pro})</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{pctPro.toFixed(0)}% de activas</div>
            </div>
          </div>

          <div className="apple-legend-item">
            <div className="apple-legend-dot" style={{ backgroundColor: '#8b5cf6' }} />
            <div>
              <div style={{ fontWeight: 600 }}>Sin límite ({r.activasPorPlan.sin_limite})</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{pctSinLimite.toFixed(0)}% de activas</div>
            </div>
          </div>

          <div className="apple-legend-item">
            <div className="apple-legend-dot" style={{ backgroundColor: '#f59e0b' }} />
            <div>
              <div style={{ fontWeight: 600 }}>Cortesías ({r.cortesias})</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Acceso temporal</div>
            </div>
          </div>
        </div>
      </div>

      {/* Grid 2 Columnas: Cuentas más activas y Salud del Sistema */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(340px, 100%), 1fr))', gap: '1.25rem' }}>
        {/* Top Cuentas Activas */}
        <div className="apple-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Mayor Actividad este Mes</h3>
              <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                {totalFacturasMes} facturas emitidas en total en la plataforma este mes.
              </p>
            </div>
            <Link href="/admin/cuentas" className="apple-pill apple-pill-blue" style={{ textDecoration: 'none' }}>
              <span>Ver todas</span>
              <ArrowRight size={12} />
            </Link>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {masActivas.map(c => {
              const iniciales = (c.nombre || c.email || 'U').slice(0, 2).toUpperCase();
              return (
                <Link
                  key={c.id}
                  href={`/admin/cuentas/${c.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.625rem 0.75rem',
                    borderRadius: '0.75rem',
                    background: 'rgba(0, 0, 0, 0.02)',
                    textDecoration: 'none',
                    color: 'inherit',
                    transition: 'background 150ms ease',
                  }}
                >
                  {/* min-width 0 + puntos suspensivos: un email largo empujaba la
                      fila fuera de la tarjeta en cualquier ancho por debajo de 1280. */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0, flex: 1 }}>
                    <div className="apple-avatar">{iniciales}</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nombre || c.email}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email}</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                    <span className="apple-pill apple-pill-slate">
                      {c.facturasMes} {c.facturasMes === 1 ? 'factura' : 'facturas'}
                    </span>
                    <ArrowUpRight size={14} className="text-gray-400" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Estado Operativo & Integridad */}
        <div className="apple-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Estado del Sistema</h3>
              <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                Verificación de servicios críticos y pasarelas conectadas.
              </p>
            </div>
            <div className="admin-badge-pulse">
              <div className="admin-pulse-dot" />
              <span>Operativo</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Servicio Stripe Webhooks */}
            <div style={{ padding: '0.75rem', borderRadius: '0.75rem', background: 'rgba(0,0,0,0.02)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Zap size={18} className="text-blue-500" />
                <div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>Stripe Webhook e Idempotencia</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                    {pendientes.length === 0 ? 'Sin incidencias pendientes' : `${pendientes.length} eventos requieren revisión`}
                  </div>
                </div>
              </div>
              {pendientes.length === 0 ? (
                <span className="apple-pill apple-pill-emerald">Al día</span>
              ) : (
                <span className="apple-pill apple-pill-rose">{pendientes.length} por revisar</span>
              )}
            </div>

            {/* Veri*Factu Service */}
            <div style={{ padding: '0.75rem', borderRadius: '0.75rem', background: 'rgba(0,0,0,0.02)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <ShieldCheck size={18} className="text-emerald-500" />
                <div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>Motor Veri*Factu & Sellado</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Encadenamiento SHA-256 inmutable</div>
                </div>
              </div>
              <span className="apple-pill apple-pill-emerald">Activo</span>
            </div>

            {/* Liquidación Fiscal */}
            <div style={{ padding: '0.75rem', borderRadius: '0.75rem', background: 'rgba(0,0,0,0.02)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Calendar size={18} className="text-purple-500" />
                <div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>Calendario Fiscal (420 / 130)</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                    {plazo.trimestre}T {plazo.anio} · {plazo.dias} días restantes
                  </div>
                </div>
              </div>
              <Link href="/admin/hacienda" className="apple-pill apple-pill-purple" style={{ textDecoration: 'none' }}>
                <span>Revisar</span>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Sección Ejecutiva: Exportación y Configuración del SaaS */}
      <div className="apple-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <FileSpreadsheet size={14} className="text-emerald-500" />
              <span>Gestión de Datos & Informes</span>
            </div>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0.25rem 0 0 0', letterSpacing: '-0.02em' }}>
              Exportación Oficial & Configuración del Software
            </h3>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              Descarga balances completos en formato CSV compatible con Microsoft Excel o ajusta la fiscalidad de la plataforma.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap' }}>
            <a
              href="/api/admin/exportar?tipo=cuentas"
              download
              className="apple-btn-secondary"
              title="Descargar lista completa de usuarios registrados y actividad"
            >
              <Download size={16} />
              <span>Exportar Cuentas (CSV)</span>
            </a>

            <a
              href="/api/admin/exportar?tipo=suscripciones"
              download
              className="apple-btn-secondary"
              title="Descargar detalle de suscripciones, MRR y planes activos"
            >
              <Download size={16} />
              <span>Exportar Suscripciones (CSV)</span>
            </a>

            <Link
              href="/admin/configuracion"
              className="apple-btn-primary"
              title="Ajustar series legales, IGIC y cobro en Stripe"
            >
              <Sliders size={16} />
              <span>Configuración Fiscal</span>
            </Link>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: '0.875rem', paddingTop: '1rem', borderTop: '1px solid var(--border-subtle, rgba(0,0,0,0.06))' }}>
          <div style={{ padding: '0.75rem', borderRadius: '0.75rem', background: 'rgba(0,0,0,0.02)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Codificación de Exportación</div>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.2rem' }}>UTF-8 con BOM (Excel nativo)</div>
          </div>
          <div style={{ padding: '0.75rem', borderRadius: '0.75rem', background: 'rgba(0,0,0,0.02)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Separador de Columnas</div>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.2rem' }}>Punto y coma (;) estándar ES</div>
          </div>
          <div style={{ padding: '0.75rem', borderRadius: '0.75rem', background: 'rgba(0,0,0,0.02)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Seguridad & Auditoría</div>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#059669', marginTop: '0.2rem' }}>AAL2 / TOTP Requerido</div>
          </div>
        </div>
      </div>
    </div>
  );
}
