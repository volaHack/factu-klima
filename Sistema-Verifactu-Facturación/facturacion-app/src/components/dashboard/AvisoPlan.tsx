'use client';

import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

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
 *
 * Una sola línea: qué pasa y el botón para arreglarlo. Antes era una
 * tarjeta con corona, el nombre del plan, una etiqueta que repetía lo
 * mismo y un medidor lleno al 100 % que, con la suscripción parada, no
 * medía nada.
 */
export default function AvisoPlan({ plan, inactiva, usadas, limite }: AvisoPlanProps) {
  const pct = inactiva ? 100 : porcentajeUso(usadas, limite);
  if (!inactiva && pct < AVISAR_DESDE) return null;
  const critico = inactiva || pct >= 90;

  return (
    <div className={`plan-aviso ${critico ? 'is-critico' : ''}`} role="status">
      <AlertTriangle size={16} aria-hidden="true" className="plan-aviso-icono" />
      <p className="plan-aviso-texto">
        {inactiva ? (
          <><strong>Sin suscripción.</strong> Actívala para volver a emitir facturas; lo que ya tienes sigue a tu alcance.</>
        ) : (
          <><strong>{plan}: {usadas} de {limite} facturas este mes.</strong> Al llegar al tope no podrás emitir más hasta el mes que viene.</>
        )}
      </p>
      {!inactiva && (
        <span className="plan-aviso-medidor" aria-hidden="true">
          <span style={{ width: `${pct}%` }} />
        </span>
      )}
      <Link href="/precios" className={`btn btn-sm ${inactiva ? 'btn-primary' : 'btn-secondary'}`}>
        {inactiva ? 'Activar suscripción' : 'Ampliar plan'}
      </Link>
    </div>
  );
}
