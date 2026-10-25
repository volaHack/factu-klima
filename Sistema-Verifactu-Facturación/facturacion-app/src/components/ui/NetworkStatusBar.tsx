'use client';

import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { seEstaSaliendo } from '@/lib/seguridad/sesionCliente';
import { useEffect } from 'react';
import Link from 'next/link';
import { Wifi, WifiOff, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';

export default function NetworkStatusBar() {
  const {
    isOnline, isSyncing, pendingChanges, triggerSync, errores,
  } = useOnlineStatus();

  // Cerrar la pestaña con cambios sin subir no los borra (siguen en este
  // equipo y suben al volver), pero si es un equipo prestado o el último
  // uso antes de apagarlo, conviene saberlo.
  useEffect(() => {
    if (pendingChanges === 0) return;
    const avisar = (e: BeforeUnloadEvent) => {
      if (seEstaSaliendo()) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [pendingChanges]);

  // Sin avisos cuando todo está al día. Los fallos pasajeros de sync se
  // reintentan solos en segundo plano: aquí nunca se enseña un error.
  if (isOnline && !isSyncing && pendingChanges === 0 && errores === 0) {
    return null;
  }

  // Lo rechazado no desaparece: se queda en la bandeja hasta que alguien lo
  // mire. Mientras haya algo, se avisa.
  if (isOnline && !isSyncing && pendingChanges === 0) {
    return (
      <div className="network-bar network-bar--offline">
        <div className="network-bar-content">
          <span className="network-bar-icon"><AlertTriangle size={14} /></span>
          <span className="network-bar-label">
            {errores === 1 ? '1 cambio rechazado' : `${errores} cambios rechazados`}
          </span>
          <span className="network-bar-separator">·</span>
          <span className="network-bar-detail">guardado en este equipo, sin subir</span>
        </div>
        <Link className="network-bar-action" href="/sincronizacion">Revisar</Link>
      </div>
    );
  }

  const getStatusConfig = () => {
    if (!isOnline) {
      return {
        icon: <WifiOff size={14} />,
        label: 'Sin conexión',
        // Lo que se hace sin conexión sólo está en este equipo hasta que
        // vuelve la red: si se pierde o se rompe antes, se pierde con él.
        detail: pendingChanges > 0
          ? `${pendingChanges} cambio${pendingChanges > 1 ? 's' : ''} sólo en este equipo · conéctate para guardarlo${pendingChanges > 1 ? 's' : ''} en la nube`
          : 'Lo que hagas se guardará en la nube al volver la conexión',
        className: 'network-bar--offline',
      };
    }
    if (isSyncing) {
      return {
        icon: <RefreshCw size={14} className="network-bar-spin" />,
        label: 'Sincronizando',
        detail: `${pendingChanges} pendiente${pendingChanges > 1 ? 's' : ''}`,
        className: 'network-bar--syncing',
      };
    }
    if (pendingChanges > 0) {
      return {
        icon: <Wifi size={14} />,
        label: 'Pendiente de sincronizar',
        detail: `${pendingChanges} cambio${pendingChanges > 1 ? 's' : ''} sólo en este equipo`,
        className: 'network-bar--pending',
      };
    }
    return {
      icon: <CheckCircle2 size={14} />,
      label: 'Sincronizado',
      detail: '',
      className: 'network-bar--synced',
    };
  };

  const config = getStatusConfig();

  return (
    <div className={`network-bar ${config.className}`}>
      <div className="network-bar-content">
        <span className="network-bar-icon">{config.icon}</span>
        <span className="network-bar-label">{config.label}</span>
        {config.detail && (
          <>
            <span className="network-bar-separator">·</span>
            <span className="network-bar-detail">{config.detail}</span>
          </>
        )}
      </div>
      {isOnline && pendingChanges > 0 && !isSyncing && (
        <button
          className="network-bar-action"
          onClick={triggerSync}
          title="Sincronizar ahora"
        >
          <RefreshCw size={12} />
          <span>Sincronizar</span>
        </button>
      )}
    </div>
  );
}
