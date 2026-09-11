import { exigirAdminCon2fa } from '@/lib/admin/dal';
import { supabaseServicio } from '@/lib/supabase/servicio';
import ConfiguracionForm from './ConfiguracionForm';
import { Sliders, ShieldCheck } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function AdminConfiguracionPage() {
  await exigirAdminCon2fa();

  const db = supabaseServicio();
  const { data: config } = await db.from('plataforma_config').select('*').single();

  const initialConfig = config || {
    id: true,
    serie_suscripciones: 'SUB-2026',
    serie_propinas: 'PROP-2026',
    regimen_igic: 'pequeno_empresario',
    cobrar_impuesto: false,
    stripe_tax_rate_igic: null,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem', maxWidth: '960px', margin: '0 auto', width: '100%' }}>
      {/* Header */}
      <div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>
          <Sliders size={14} className="text-blue-500" />
          <span>Administración de Plataforma</span>
        </div>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.035em', margin: 0, color: 'var(--text-primary)' }}>
          Configuración Fiscal & Facturación
        </h1>
        <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.9375rem' }}>
          Gestión de series de facturación legal, régimen canario de IGIC (REPE vs General) y pasarela de cobro de impuestos.
        </p>
      </div>

      <ConfiguracionForm initialConfig={initialConfig} />
    </div>
  );
}
