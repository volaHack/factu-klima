'use client';

import Link from 'next/link';
import { Crown } from 'lucide-react';

export interface AvisoPlanProps {
  readonly plan: string;
  readonly inactiva: boolean;
  readonly usadas: number;
  readonly limite: number | null;
}

/** Desde qué uso del plan merece la pena avisar. */
export const AVISAR_DESDE = 80;

export function porcentajeUso(usadas: number, limite: number | null): number {
  return limite ? Math.min(100, Math.round((usadas / limite) * 100)) : 0;
}

/**
 * El plan sólo ocupa sitio en el panel cuando hay algo que hacer con él:
 * la suscripción está parada o el mes se acerca al tope. Con el plan
 * activo y holgado basta con el nombre en la cabecera.
 */
export default function AvisoPlan({ plan, inactiva, usadas, limite }: AvisoPlanProps) {
  const pct = inactiva ? 100 : porcentajeUso(usadas, limite);
  if (!inactiva && pct < AVISAR_DESDE) return null;
  const critico = inactiva || pct >= 90;

  return (
    <div className={`plan-banner ${inactiva ? 'is-inactive' : ''}`} role="status">
      <div className="plan-banner-info">
        <div className={`plan-banner-icon ${inactiva ? 'is-inactive' : ''}`}><Crown size={22} /></div>
        <div className="plan-banner-body">
          <div className="plan-banner-name">
            <span>{plan}</span>
            <span className={`badge ${inactiva ? 'badge-danger' : 'badge-warning'}`}>{inactiva ? 'Sin suscripción' : 'Cerca del tope'}</span>
          </div>
          <div className="plan-banner-usage">
            {inactiva ? 'Activa la suscripción para volver a emitir facturas.' : `${usadas} de ${limite} facturas este mes`}
          </div>
        </div>
      </div>
      <div className="plan-banner-meter-wrap">
        <div className="plan-banner-meter">
          <div className="plan-banner-meter-label">
            <span>Usado este mes</span>
            <span>{inactiva ? 'Parado' : `${pct} %`}</span>
          </div>
          <div className="plan-banner-meter-track">
            <div className={`plan-banner-meter-fill ${critico ? 'is-critical' : ''}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
        <Link href="/precios" className={`btn btn-sm ${inactiva ? 'btn-primary' : 'btn-secondary'}`}>
          {inactiva ? 'Activar suscripción' : 'Ampliar plan'}
        </Link>
      </div>
    </div>
  );
}
