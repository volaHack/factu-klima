import { notFound } from 'next/navigation';
import { exigirAdminCon2fa } from '@/lib/admin/dal';
import { listarCuentas, registroDeAdmin } from '@/lib/admin/datos';
import { getPlan } from '@/lib/plans';
import { formatDate } from '@/lib/utils';
import AccionesCuenta from '@/components/admin/AccionesCuenta';

export default async function AdminFichaCuenta({ params }: { params: Promise<{ id: string }> }) {
  await exigirAdminCon2fa();
  const { id } = await params;
  const cuentas = await listarCuentas();
  const c = cuentas.find(u => u.id === id);
  if (!c) notFound();

  const registro = await registroDeAdmin(id);

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">{c.nombre || c.email}</h1>
      </div>
      <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
        <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 'var(--space-2) var(--space-4)' }}>
          <dt className="card-subtitle">Email</dt><dd>{c.email}</dd>
          <dt className="card-subtitle">NIF</dt><dd>{c.nif ?? '—'}</dd>
          <dt className="card-subtitle">Alta</dt><dd>{formatDate(c.alta)}</dd>
          <dt className="card-subtitle">Última entrada</dt><dd>{c.ultimaActividad ? formatDate(c.ultimaActividad) : 'Nunca'}</dd>
          <dt className="card-subtitle">Plan</dt><dd>{c.esAdmin ? 'Admin' : c.estado.planId ? getPlan(c.estado.planId)?.name : '—'}</dd>
          <dt className="card-subtitle">Estado</dt><dd>{c.esAdmin ? 'Admin' : c.estado.activa ? 'Activa' : (c.estado.motivoInactiva ?? 'Inactiva')}</dd>
          <dt className="card-subtitle">Origen</dt><dd>{c.fila?.origen ?? '—'}</dd>
          <dt className="card-subtitle">Facturas este mes</dt><dd>{c.facturasMes}</dd>
          {c.fila?.cortesia_hasta && <><dt className="card-subtitle">Cortesía hasta</dt><dd>{formatDate(c.fila.cortesia_hasta)}</dd></>}
          {c.fila?.periodo_fin && <><dt className="card-subtitle">Periodo fin</dt><dd>{formatDate(c.fila.periodo_fin)}</dd></>}
          {c.fila?.cancela_al_final && <><dt className="card-subtitle">Cancela al final</dt><dd>Sí</dd></>}
        </dl>
      </div>

      {!c.esAdmin && <AccionesCuenta cuentaId={id} origen={c.fila?.origen ?? null} activa={c.estado.activa} />}

      {registro.length > 0 && (
        <div style={{ marginTop: 'var(--space-6)' }}>
          <h2 className="settings-section-title">Registro de acciones</h2>
          <div className="table-container">
            <table className="table">
              <thead><tr><th>Fecha</th><th>Acción</th><th>Motivo</th></tr></thead>
              <tbody>
                {registro.map((r: { id: number; creado_en: string; accion: string; motivo?: string | null }) => (
                  <tr key={r.id}>
                    <td>{formatDate(r.creado_en)}</td>
                    <td>{r.accion}</td>
                    <td>{r.motivo ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
