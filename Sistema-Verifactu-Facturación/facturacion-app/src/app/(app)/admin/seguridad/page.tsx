import { exigirAdminCon2fa } from '@/lib/admin/dal';
import { panelSeguridad } from '@/lib/seguridad/leer';
import { UMBRAL_BLOQUEO } from '@/lib/seguridad/eventos';
import { ShieldAlert } from 'lucide-react';
import PanelSeguridad from './PanelSeguridad';

export const dynamic = 'force-dynamic';

export default async function AdminSeguridad() {
  await exigirAdminCon2fa();
  const datos = await panelSeguridad();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>
          <ShieldAlert size={14} />
          <span>Intentos de ataque y cosas raras</span>
        </div>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.03em', margin: 0 }}>Seguridad</h1>
        <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.9375rem' }}>
          Lo que ha detectado el programa en los últimos 7 días: robots buscando fallos, inyecciones, enlaces
          manipulados, firmas falsas, intentos de entrar aquí sin ser administrador… Una IP que acumula {UMBRAL_BLOQUEO} ataques
          en 10 minutos se bloquea sola durante 24 horas.
        </p>
      </div>
      {datos.error
        ? <div className="apple-card">No se han podido leer los eventos: {datos.error}. ¿Está aplicada la migración 061?</div>
        : <PanelSeguridad datos={datos} />}
    </div>
  );
}
