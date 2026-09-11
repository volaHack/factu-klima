import Link from 'next/link';
import { exigirAdminCon2fa } from '@/lib/admin/dal';
import { registroDeAdmin } from '@/lib/admin/datos';
import { formatDate } from '@/lib/utils';
import { ShieldCheck, History, ArrowUpRight } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function AdminRegistro() {
  await exigirAdminCon2fa();
  const registro = await registroDeAdmin();

  const getPillClass = (accion: string) => {
    if (accion.includes('cortesia')) return 'apple-pill apple-pill-amber';
    if (accion.includes('cambiar') || accion.includes('plan')) return 'apple-pill apple-pill-blue';
    if (accion.includes('cancel') || accion.includes('reembolso')) return 'apple-pill apple-pill-rose';
    return 'apple-pill apple-pill-slate';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>
            <History size={14} />
            <span>Auditoría de Seguridad</span>
          </div>
          <h1 style={{ fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.03em', margin: 0 }}>
            Registro de Acciones
          </h1>
          <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.9375rem' }}>
            Trazabilidad inmutable de todas las operaciones ejecutadas sobre las cuentas de usuario.
          </p>
        </div>

        <div className="admin-badge-pulse">
          <ShieldCheck size={14} />
          <span>Inmutable</span>
        </div>
      </div>

      {/* Table Card */}
      <div className="apple-card" style={{ padding: 0 }}>
        {registro.length === 0 ? (
          <div style={{ padding: '3.5rem 1rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>
            <p style={{ fontSize: '1rem', fontWeight: 500, margin: 0 }}>No hay operaciones registradas aún.</p>
            <p style={{ fontSize: '0.8125rem', marginTop: '0.25rem' }}>Las acciones sobre cuentas quedarán firmadas aquí.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="apple-table">
              <thead>
                <tr>
                  <th>Fecha y Hora</th>
                  <th>Operación</th>
                  <th>Cuenta Afectada</th>
                  <th>Motivo Justificado</th>
                </tr>
              </thead>
              <tbody>
                {registro.map((r: { id: number; creado_en: string; accion: string; cuenta_id?: string | null; motivo?: string | null }) => (
                  <tr key={r.id}>
                    <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {formatDate(r.creado_en)}
                    </td>
                    <td>
                      <span className={getPillClass(r.accion)}>
                        {r.accion}
                      </span>
                    </td>
                    <td>
                      {r.cuenta_id ? (
                        <Link
                          href={`/admin/cuentas/${r.cuenta_id}`}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 500 }}
                        >
                          <code>{r.cuenta_id.slice(0, 8)}…</code>
                          <ArrowUpRight size={12} className="text-gray-400" />
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td style={{ fontSize: '0.875rem' }}>{r.motivo || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
