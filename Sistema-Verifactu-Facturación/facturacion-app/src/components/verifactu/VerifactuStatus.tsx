'use client';

import { useVerifactuConnection } from '@/hooks/useVerifactuConnection';
import { AlertCircle, CheckCircle2, ChevronRight, Clock, Plug, WifiOff } from 'lucide-react';
import Link from 'next/link';

/**
 * Tarjeta de estado de la conexión con la AEAT (cabecera del dashboard).
 *
 * Estaba escrita íntegramente con utilidades de Tailwind
 * (`p-4 rounded-lg border border-amber-200 dark:bg-amber-950`, `flex
 * items-start gap-3`, `w-5 h-5`…), pero este proyecto no tiene Tailwind
 * instalado: ni la dependencia, ni configuración, ni directivas en
 * globals.css. Ninguna de esas clases existía, así que el componente se
 * renderizaba como divs sin estilo — sin caja, sin color, sin separación
 * — justo encima de los KPIs. Reescrito sobre `.status-panel`, que es la
 * pieza equivalente del sistema de diseño real.
 */
export function VerifactuStatus() {
  const status = useVerifactuConnection();

  const expiresAt = status.expiresAt ? new Date(status.expiresAt) : null;
  const daysUntilExpiry = expiresAt
    ? Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  // Sin certificado: no es un error, es una tarea pendiente. El tono lo
  // dice ("todavía", "cuando lo cargues") y el aviso va en ámbar, no en
  // rojo, para no alarmar por algo que aún no ha fallado.
  if (!status.hasCertificate) {
    return (
      <Link href="/verifactu" className="status-panel status-panel--warning">
        <span className="status-panel-icon"><WifiOff size={18} /></span>
        <span className="status-panel-body">
          <span className="status-panel-title">Todavía no has conectado con la AEAT</span>
          <span className="status-panel-text">
            Sigues facturando con normalidad y cada factura se sella igual. Para enviarlas
            telemáticamente necesitas cargar tu certificado FNMT.
          </span>
          <span className="status-panel-facts">
            <span className="status-panel-fact">Cargar certificado</span>
          </span>
        </span>
        <ChevronRight size={18} className="status-panel-chevron" />
      </Link>
    );
  }

  const expiringSoon = daysUntilExpiry !== null && daysUntilExpiry < 30;
  const tone = status.isChecking
    ? 'info'
    : status.isConnected
      ? (expiringSoon ? 'warning' : 'ok')
      : 'danger';

  return (
    <Link href="/verifactu" className={`status-panel status-panel--${tone}`}>
      <span className="status-panel-icon">
        {status.isChecking
          ? <Clock size={18} className="spin" />
          : status.isConnected
            ? <CheckCircle2 size={18} />
            : <AlertCircle size={18} />}
      </span>

      <span className="status-panel-body">
        <span className="status-panel-title">
          {status.isChecking
            ? 'Comprobando la conexión…'
            : status.isConnected
              ? 'Conectado con la AEAT'
              : 'Sin conexión con la AEAT'}
        </span>

        <span className="status-panel-text">
          {status.isChecking
            ? 'Validando el certificado instalado.'
            : status.isConnected
              ? 'Certificado activo. Recuerda que el envío automático sigue en modo demostración.'
              : status.error || 'No se ha podido contactar con el servicio. Vuelve a intentarlo en unos minutos.'}
        </span>

        <span className="status-panel-facts">
          {status.isConnected && !status.isChecking && (
            <span className="status-panel-fact is-success"><Plug />Certificado activo</span>
          )}
          {daysUntilExpiry !== null && (
            <span className={`status-panel-fact ${expiringSoon ? 'is-warning' : ''}`}>
              {daysUntilExpiry > 0
                ? `Caduca en ${daysUntilExpiry} ${daysUntilExpiry === 1 ? 'día' : 'días'}`
                : 'Certificado caducado'}
            </span>
          )}
          {status.lastCheck && (
            <span className="status-panel-fact">
              Comprobado a las{' '}
              {new Date(status.lastCheck).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </span>
      </span>

      <ChevronRight size={18} className="status-panel-chevron" />
    </Link>
  );
}
