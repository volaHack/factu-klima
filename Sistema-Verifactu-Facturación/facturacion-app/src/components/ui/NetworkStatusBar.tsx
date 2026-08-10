'use client';

import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { Wifi, WifiOff, RefreshCw, CheckCircle2, AlertCircle, ShieldAlert, X } from 'lucide-react';

export default function NetworkStatusBar() {
  const {
    isOnline, isSyncing, pendingChanges, lastError,
    rejections, dismissRejections, triggerSync,
  } = useOnlineStatus();

  // Los rechazos definitivos se avisan siempre, aunque todo lo demás
  // esté en orden: son cambios que el usuario cree guardados y no lo están.
  const hasRejections = rejections.length > 0;

  if (isOnline && !isSyncing && pendingChanges === 0 && !lastError && !hasRejections) {
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
    if (lastError) {
      return {
        icon: <AlertCircle size={14} />,
        label: 'Error de sincronización',
        detail: lastError,
        className: 'network-bar--error',
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
    <>
      {hasRejections && (
        <div className="network-bar network-bar--rejected">
          <div className="network-bar-content" style={{ alignItems: 'flex-start' }}>
            <span className="network-bar-icon"><ShieldAlert size={14} /></span>
            <div>
              <span className="network-bar-label">
                {rejections.length === 1
                  ? '1 cambio rechazado por las reglas de integridad'
                  : `${rejections.length} cambios rechazados por las reglas de integridad`}
              </span>
              <ul className="network-bar-reasons">
                {rejections.slice(-3).map((r, i) => (
                  <li key={`${r.at}-${i}`}>{r.reason}</li>
                ))}
              </ul>
            </div>
          </div>
          <button className="network-bar-action" onClick={dismissRejections} title="Descartar aviso">
            <X size={12} />
            <span>Entendido</span>
          </button>
        </div>
      )}

      {!(isOnline && !isSyncing && pendingChanges === 0 && !lastError) && (
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
          {isOnline && pendingChanges > 0 && !isSyncing && !lastError && (
            <button
              className="network-bar-action"
              onClick={triggerSync}
              title="Sincronizar ahora"
            >
              <RefreshCw size={12} />
              <span>Sincronizar</span>
            </button>
          )}
          {lastError && (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <button
                className="network-bar-action"
                onClick={triggerSync}
                title="Reintentar sincronización"
              >
                <RefreshCw size={12} />
                <span>Reintentar</span>
              </button>
              <button
                className="network-bar-action"
                onClick={dismissRejections}
                title="Descartar aviso de error"
              >
                <X size={12} />
                <span>Entendido</span>
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
