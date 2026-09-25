import { exigirAdminCon2fa } from '@/lib/admin/dal';
import { MessageCircle } from 'lucide-react';
import BandejaSoporte from './BandejaSoporte';

export const dynamic = 'force-dynamic';

export default async function AdminSoporte() {
  await exigirAdminCon2fa();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>
          <MessageCircle size={14} />
          <span>Atención a clientes</span>
        </div>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.03em', margin: 0 }}>Soporte</h1>
        <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.9375rem' }}>
          Lo que escriben las cuentas desde el botón de soporte. Contestas aquí y les llega en el mismo chat
          {' '}(y por correo, si está configurado).
        </p>
      </div>
      <BandejaSoporte />
    </div>
  );
}
