import Link from 'next/link';
import { exigirAdminCon2fa } from '@/lib/admin/dal';
import { listarCuentas } from '@/lib/admin/datos';
import { getPlan } from '@/lib/plans';
import { formatDate } from '@/lib/utils';

export default async function AdminCuentas({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await exigirAdminCon2fa();
  const q = ((await searchParams).q ?? '').trim().toLowerCase();
  const cuentas = (await listarCuentas())
    .filter(c => !q || [c.email, c.nombre, c.nif].some(v => v?.toLowerCase().includes(q)))
    .sort((a, b) => a.email.localeCompare(b.email));

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Cuentas</h1>
        <form><input className="form-input" name="q" defaultValue={q} placeholder="Email, nombre o NIF" aria-label="Buscar cuenta" /></form>
      </div>
      <div className="table-container">
        <table className="table">
          <thead><tr><th>Cuenta</th><th>Plan</th><th>Estado</th><th>Renueva / fin</th><th>Facturas mes</th><th>Última entrada</th></tr></thead>
          <tbody>
            {cuentas.map(c => (
              <tr key={c.id}>
                <td><Link href={`/admin/cuentas/${c.id}`}>{c.nombre || c.email}</Link><div className="card-subtitle">{c.email} · {c.nif ?? 'sin NIF'}</div></td>
                <td>{c.esAdmin ? 'Admin' : c.estado.planId ? getPlan(c.estado.planId)?.name : '—'}</td>
                <td>{c.esAdmin ? '—' : c.estado.activa ? (c.estado.origen === 'cortesia' ? 'Cortesía' : c.fila?.estado === 'past_due' ? 'Cobro fallido' : 'Activa') : 'Inactiva'}</td>
                <td>{c.fila?.cortesia_hasta ? formatDate(c.fila.cortesia_hasta) : c.fila?.periodo_fin ? formatDate(c.fila.periodo_fin) : '—'}</td>
                <td>{c.facturasMes}</td>
                <td>{c.ultimaActividad ? formatDate(c.ultimaActividad) : 'Nunca'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
