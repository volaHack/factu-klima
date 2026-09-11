import Link from 'next/link';
import { notFound } from 'next/navigation';
import { exigirAdminCon2fa } from '@/lib/admin/dal';
import { listarCuentas, registroDeAdmin } from '@/lib/admin/datos';
import { getPlan } from '@/lib/plans';
import { formatDate } from '@/lib/utils';
import AccionesCuenta from '@/components/admin/AccionesCuenta';
import { ArrowLeft, Shield, Mail, FileText, Calendar, Clock, CheckCircle, AlertCircle } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function AdminFichaCuenta({ params }: { params: Promise<{ id: string }> }) {
  await exigirAdminCon2fa();
  const { id } = await params;
  const cuentas = await listarCuentas();
  const c = cuentas.find(u => u.id === id);
  if (!c) notFound();

  const registro = await registroDeAdmin(id);
  const iniciales = (c.nombre || c.email || 'U').slice(0, 2).toUpperCase();
  const plan = c.estado.planId ? getPlan(c.estado.planId) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '960px', margin: '0 auto', width: '100%' }}>
      {/* Back Link */}
      <div>
        <Link
          href="/admin/cuentas"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            fontSize: '0.875rem',
            color: 'var(--text-secondary)',
            textDecoration: 'none',
            fontWeight: 500,
          }}
        >
          <ArrowLeft size={16} />
          <span>Volver al listado de cuentas</span>
        </Link>
      </div>

      {/* Account Hero Card */}
      <div className="apple-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            <div className="apple-avatar" style={{ width: '56px', height: '56px', fontSize: '1.25rem' }}>
              {iniciales}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.025em', margin: 0 }}>
                  {c.nombre || c.email}
                </h1>
                {c.esAdmin && (
                  <span className="apple-pill apple-pill-purple">
                    <Shield size={12} />
                    Administrador
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-tertiary)', marginTop: '0.2rem' }}>
                {c.email} {c.nif ? `· NIF: ${c.nif}` : '· Sin NIF registrado'}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {c.esAdmin ? (
              <span className="apple-pill apple-pill-purple">Acceso total</span>
            ) : plan ? (
              <span className={plan.id === 'pro' ? 'apple-pill apple-pill-blue' : plan.id === 'sin_limite' ? 'apple-pill apple-pill-purple' : 'apple-pill apple-pill-emerald'}>
                Plan {plan.name}
              </span>
            ) : (
              <span className="apple-pill apple-pill-slate">Sin plan activo</span>
            )}

            {!c.esAdmin && (
              <span className={c.estado.activa ? 'apple-pill apple-pill-emerald' : 'apple-pill apple-pill-slate'}>
                {c.estado.activa ? (c.estado.origen === 'cortesia' ? 'Cortesía' : 'Activa') : 'Inactiva'}
              </span>
            )}
          </div>
        </div>

        {/* Grouped Information Rows (macOS System Settings Style) */}
        <div style={{ marginTop: '1.75rem', borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: '1.25rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem' }}>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-tertiary)', letterSpacing: '0.04em' }}>
              Fecha de Alta
            </div>
            <div style={{ fontSize: '0.9375rem', fontWeight: 500, marginTop: '0.25rem' }}>{formatDate(c.alta)}</div>
          </div>

          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-tertiary)', letterSpacing: '0.04em' }}>
              Última Actividad
            </div>
            <div style={{ fontSize: '0.9375rem', fontWeight: 500, marginTop: '0.25rem' }}>
              {c.ultimaActividad ? formatDate(c.ultimaActividad) : 'Nunca ha iniciado sesión'}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-tertiary)', letterSpacing: '0.04em' }}>
              Facturas este Mes
            </div>
            <div style={{ fontSize: '0.9375rem', fontWeight: 600, marginTop: '0.25rem' }}>
              {c.facturasMes} {c.facturasMes === 1 ? 'emitida' : 'emitidas'}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-tertiary)', letterSpacing: '0.04em' }}>
              Origen de Suscripción
            </div>
            <div style={{ fontSize: '0.9375rem', fontWeight: 500, marginTop: '0.25rem' }}>
              {c.fila?.origen === 'stripe' ? 'Pasarela Stripe' : c.fila?.origen === 'cortesia' ? 'Cortesía de Administrador' : 'Ninguno'}
            </div>
          </div>
        </div>

        {(c.fila?.cortesia_hasta || c.fila?.periodo_fin) && (
          <div style={{ marginTop: '1.25rem', padding: '0.75rem 1rem', borderRadius: '0.75rem', background: 'rgba(0,0,0,0.02)', display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.875rem' }}>
            <Calendar size={16} className="text-gray-500" />
            <span>
              {c.fila.cortesia_hasta
                ? `Cortesía vigente hasta el ${formatDate(c.fila.cortesia_hasta)}`
                : `Periodo actual hasta el ${formatDate(c.fila.periodo_fin!)} ${c.fila.cancela_al_final ? '(se cancelará al finalizar)' : '(renovación automática)'}`}
            </span>
          </div>
        )}
      </div>

      {/* Acciones de administración */}
      {!c.esAdmin && (
        <div className="apple-card">
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 1rem 0' }}>
            Acciones de Gestión
          </h2>
          <AccionesCuenta cuentaId={id} origen={c.fila?.origen ?? null} activa={c.estado.activa} />
        </div>
      )}

      {/* Historial de Auditoría inmutable */}
      {registro.length > 0 && (
        <div className="apple-card">
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 0.5rem 0' }}>
            Historial de Acciones Registradas ({registro.length})
          </h2>
          <p style={{ margin: '0 0 1rem 0', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
            Registro de operaciones realizadas por administradores sobre esta cuenta.
          </p>

          <div className="table-responsive">
            <table className="apple-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Operación</th>
                  <th>Motivo justificado</th>
                </tr>
              </thead>
              <tbody>
                {registro.map((r: { id: number; creado_en: string; accion: string; motivo?: string | null }) => (
                  <tr key={r.id}>
                    <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                      {formatDate(r.creado_en)}
                    </td>
                    <td>
                      <span className="apple-pill apple-pill-slate" style={{ fontFamily: 'monospace' }}>
                        {r.accion}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.875rem' }}>{r.motivo || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
