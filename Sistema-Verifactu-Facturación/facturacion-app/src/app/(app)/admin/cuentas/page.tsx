import Link from 'next/link';
import { exigirAdminCon2fa } from '@/lib/admin/dal';
import { listarCuentas } from '@/lib/admin/datos';
import { getPlan } from '@/lib/plans';
import { formatDate } from '@/lib/utils';
import { Search, ChevronRight, UserCheck, Shield, Sparkles } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function AdminCuentas({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; f?: string }>;
}) {
  await exigirAdminCon2fa();
  const params = await searchParams;
  const q = (params.q ?? '').trim().toLowerCase();
  const f = params.f ?? 'todos';

  const todas = await listarCuentas();
  const cuentas = todas
    .filter(c => {
      if (q && ![c.email, c.nombre, c.nif].some(v => v?.toLowerCase().includes(q))) {
        return false;
      }
      if (f === 'pago') return c.estado.activa && c.estado.origen === 'stripe';
      if (f === 'cortesia') return c.estado.activa && c.estado.origen === 'cortesia';
      if (f === 'sin_plan') return !c.estado.activa && !c.esAdmin;
      if (f === 'admin') return c.esAdmin;
      return true;
    })
    .sort((a, b) => a.email.localeCompare(b.email));

  const filtros = [
    { id: 'todos', label: 'Todas las cuentas', count: todas.length },
    { id: 'pago', label: 'De pago', count: todas.filter(c => c.estado.activa && c.estado.origen === 'stripe').length },
    { id: 'cortesia', label: 'Cortesías', count: todas.filter(c => c.estado.activa && c.estado.origen === 'cortesia').length },
    { id: 'sin_plan', label: 'Sin suscripción', count: todas.filter(c => !c.estado.activa && !c.esAdmin).length },
    { id: 'admin', label: 'Administradores', count: todas.filter(c => c.esAdmin).length },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.03em', margin: 0 }}>
            Gestión de Cuentas
          </h1>
          <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.9375rem' }}>
            Explora las {todas.length} cuentas registradas, supervisa sus planes y administra accesos.
          </p>
        </div>

        {/* Search Bar */}
        <form style={{ minWidth: '280px', position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <input
            className="form-input"
            name="q"
            defaultValue={q}
            placeholder="Buscar por email, nombre o NIF..."
            aria-label="Buscar cuenta"
            style={{
              paddingLeft: '2.5rem',
              borderRadius: '9999px',
              background: 'rgba(255, 255, 255, 0.85)',
              border: '1px solid rgba(0, 0, 0, 0.08)',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.02)',
            }}
          />
          {f !== 'todos' && <input type="hidden" name="f" value={f} />}
        </form>
      </div>

      {/* Filter Chips Bar */}
      <div className="apple-filter-bar">
        {filtros.map(item => (
          <Link
            key={item.id}
            href={`/admin/cuentas?f=${item.id}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
            className={`apple-filter-chip ${f === item.id ? 'active' : ''}`}
            style={{ textDecoration: 'none' }}
          >
            {item.label} ({item.count})
          </Link>
        ))}
      </div>

      {/* Cuentas Table Card */}
      <div className="apple-card" style={{ padding: 0 }}>
        {cuentas.length === 0 ? (
          <div style={{ padding: '3.5rem 1rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>
            <p style={{ fontSize: '1rem', fontWeight: 500, margin: 0 }}>No se encontraron cuentas con este criterio.</p>
            <p style={{ fontSize: '0.8125rem', marginTop: '0.25rem' }}>Prueba con otro término de búsqueda o cambia el filtro.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="apple-table">
              <thead>
                <tr>
                  <th>Usuario / Empresa</th>
                  <th>Plan Actual</th>
                  <th>Estado</th>
                  <th>Vencimiento / Renovación</th>
                  <th style={{ textAlign: 'right' }}>Facturas / Mes</th>
                  <th style={{ textAlign: 'right' }}>Último Acceso</th>
                  <th style={{ width: '40px' }} />
                </tr>
              </thead>
              <tbody>
                {cuentas.map(c => {
                  const iniciales = (c.nombre || c.email || 'U').slice(0, 2).toUpperCase();
                  const plan = c.estado.planId ? getPlan(c.estado.planId) : null;

                  return (
                    <tr key={c.id}>
                      <td>
                        <Link
                          href={`/admin/cuentas/${c.id}`}
                          style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', textDecoration: 'none', color: 'inherit' }}
                        >
                          <div className="apple-avatar">{iniciales}</div>
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                              {c.nombre || c.email}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                              {c.email} {c.nif && `· ${c.nif}`}
                            </div>
                          </div>
                        </Link>
                      </td>

                      <td>
                        {c.esAdmin ? (
                          <span className="apple-pill apple-pill-purple">
                            <Shield size={12} />
                            Admin
                          </span>
                        ) : plan ? (
                          <span
                            className={
                              plan.id === 'pro'
                                ? 'apple-pill apple-pill-blue'
                                : plan.id === 'sin_limite'
                                ? 'apple-pill apple-pill-purple'
                                : 'apple-pill apple-pill-emerald'
                            }
                          >
                            {plan.name}
                          </span>
                        ) : (
                          <span className="apple-pill apple-pill-slate">Sin plan</span>
                        )}
                      </td>

                      <td>
                        {c.esAdmin ? (
                          <span style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>Superusuario</span>
                        ) : c.estado.activa ? (
                          c.estado.origen === 'cortesia' ? (
                            <span className="apple-pill apple-pill-amber">Cortesía</span>
                          ) : c.fila?.estado === 'past_due' ? (
                            <span className="apple-pill apple-pill-rose">Cobro fallido</span>
                          ) : (
                            <span className="apple-pill apple-pill-emerald">Activa</span>
                          )
                        ) : (
                          <span className="apple-pill apple-pill-slate">Inactiva</span>
                        )}
                      </td>

                      <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                        {c.fila?.cortesia_hasta
                          ? `Hasta ${formatDate(c.fila.cortesia_hasta)}`
                          : c.fila?.periodo_fin
                          ? formatDate(c.fila.periodo_fin)
                          : '—'}
                      </td>

                      <td style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                        {c.facturasMes}
                      </td>

                      <td style={{ textAlign: 'right', fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>
                        {c.ultimaActividad ? formatDate(c.ultimaActividad) : 'Nunca'}
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        <Link href={`/admin/cuentas/${c.id}`} style={{ color: 'var(--text-tertiary)' }}>
                          <ChevronRight size={18} />
                        </Link>
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
