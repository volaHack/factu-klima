'use client';

import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { Wifi, WifiOff, RefreshCw, CheckCircle2 } from 'lucide-react';

export default function NetworkStatusBar() {
  const {
    isOnline, isSyncing, pendingChanges, triggerSync,
  } = useOnlineStatus();

  // Sin avisos cuando todo está al día. Los fallos pasajeros de sync se
  // reintentan solos en segundo plano: aquí nunca se enseña un error.
  if (isOnline && !isSyncing && pendingChanges === 0) {
    return null;
  }

  const getStatusConfig = () => {
    if (!isOnline) {
      return {
        icon: <WifiOff size={14} />,
        label: 'Sin conexión',
        detail: pendingChanges > 0
          ? `${pendingChanges} cambio${pendingChanges > 1 ? 's' : ''} pendiente${pendingChanges > 1 ? 's' : ''}`
          : 'Los datos se guardan localmente',
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
        detail: `${pendingChanges} cambio${pendingChanges > 1 ? 's' : ''}`,
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
