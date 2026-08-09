// ============================================================
// useOnlineStatus — React hook for network + sync state
// ============================================================

'use client';

import { useState, useEffect, useCallback } from 'react';
import { getSyncQueueCount } from '@/lib/offlineDb';
import {
  onSyncStateChange,
  getSyncState,
  processSyncQueue,
  clearSyncRejections,
  type SyncState,
  type SyncRejection,
} from '@/lib/syncEngine';

export interface OnlineStatus {
  isOnline: boolean;
  isSyncing: boolean;
  pendingChanges: number;
  lastSyncTime: number | null;
  lastError: string | null;
  /** Cambios que el servidor rechazó definitivamente (reglas antifraude). */
  rejections: SyncRejection[];
  dismissRejections: () => void;
  triggerSync: () => void;
}

export function useOnlineStatus(): OnlineStatus {
  // Arranca en 'true' tanto en servidor como en el primer render del
  // cliente: leer navigator.onLine aquí produciría un valor distinto al
  // que asumió el servidor (que no tiene navigator) y rompería la
  // hidratación. El valor real se aplica en el efecto, tras montar.
  const [isOnline, setIsOnline] = useState(true);
  const [syncState, setSyncState] = useState<SyncState>(getSyncState());

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Subscribe to sync state changes
    const unsubscribe = onSyncStateChange((state) => {
      setSyncState(state);
    });

    // Get initial pending count
    getSyncQueueCount().then(count => {
      setSyncState(prev => ({ ...prev, pendingCount: count }));
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribe();
    };
  }, []);

  const triggerSync = useCallback(() => {
    if (navigator.onLine) {
      processSyncQueue();
    }
  }, []);

  const dismissRejections = useCallback(() => clearSyncRejections(), []);

  return {
    isOnline,
    isSyncing: syncState.isSyncing,
    pendingChanges: syncState.pendingCount,
    lastSyncTime: syncState.lastSyncTime,
    lastError: syncState.lastError,
    rejections: syncState.rejections ?? [],
    dismissRejections,
    triggerSync,
  };
}
