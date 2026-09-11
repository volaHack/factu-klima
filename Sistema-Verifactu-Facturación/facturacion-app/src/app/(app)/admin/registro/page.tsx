import { exigirAdminCon2fa } from '@/lib/admin/dal';
import { registroDeAdmin } from '@/lib/admin/datos';
import { formatDate } from '@/lib/utils';

export default async function AdminRegistro() {
  await exigirAdminCon2fa();
  const registro = await registroDeAdmin();

  return (
    <>
      <div className="page-header"><h1 className="page-title">Registro de administración</h1></div>
      <div className="table-container">
        <table className="table">
          <thead><tr><th>Fecha</th><th>Acción</th><th>Cuenta</th><th>Motivo</th></tr></thead>
          <tbody>
            {registro.map((r: { id: number; creado_en: string; accion: string; cuenta_id?: string | null; motivo?: string | null }) => (
              <tr key={r.id}>
                <td>{formatDate(r.creado_en)}</td>
                <td>{r.accion}</td>
                <td>{r.cuenta_id ? r.cuenta_id.slice(0, 8) + '…' : '—'}</td>
                <td>{r.motivo ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
