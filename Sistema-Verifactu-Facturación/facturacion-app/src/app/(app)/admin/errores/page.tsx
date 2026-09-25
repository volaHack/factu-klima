import { exigirAdminCon2fa } from '@/lib/admin/dal';
import { erroresRecientes } from '@/lib/errores/leer';
import { Bug } from 'lucide-react';
import ListaErrores from './ListaErrores';

export const dynamic = 'force-dynamic';

const DIAS = 30;

export default async function AdminErrores() {
  await exigirAdminCon2fa();
  const { grupos, error } = await erroresRecientes(DIAS);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>
          <Bug size={14} />
          <span>Salud del programa</span>
        </div>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.03em', margin: 0 }}>Errores</h1>
        <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.9375rem' }}>
          Los fallos que han visto las cuentas (en su navegador) y los del servidor, de los últimos {DIAS} días,
          agrupados: el mismo fallo sale una vez con las veces que ha pasado.
        </p>
      </div>
      {error
        ? <div className="apple-card">No se han podido leer los errores: {error}. ¿Está aplicada la migración 053?</div>
        : <ListaErrores grupos={grupos} />}
    </div>
  );
}
