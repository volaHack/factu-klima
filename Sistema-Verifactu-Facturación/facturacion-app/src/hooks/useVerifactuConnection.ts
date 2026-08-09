'use client';

import { useState, useEffect } from 'react';
import { getVerifactuConnectionStatus, checkVerifactuConnection } from '@/lib/storage';

export interface VerifactuStatus {
  hasCertificate: boolean;
  isConnected: boolean;
  statusCode: string | null;
  lastCheck: string | null;
  error: string | null;
  expiresAt: string | null;
  isChecking: boolean;
}

/**
 * Hook para monitorear el estado de conexión a AEAT en tiempo real
 * Se conecta cada 30 segundos si hay certificado
 * Se conecta cada 5 minutos si no hay certificado
 */
export function useVerifactuConnection(): VerifactuStatus {
  const [status, setStatus] = useState<VerifactuStatus>({
    hasCertificate: false,
    isConnected: false,
    statusCode: null,
    lastCheck: null,
    error: null,
    expiresAt: null,
    isChecking: true,
  });

  useEffect(() => {
    let mounted = true;
    let intervalId: NodeJS.Timeout;

    const checkConnection = async () => {
      if (!mounted) return;

      try {
        const connectionStatus = await getVerifactuConnectionStatus();

        if (!mounted) return;

        // Si hay certificado, también hacer un health check activo
        if (connectionStatus.hasActiveCertificate) {
          const healthCheck = await checkVerifactuConnection();

          setStatus({
            hasCertificate: connectionStatus.hasActiveCertificate,
            isConnected: healthCheck.isConnected,
            statusCode: healthCheck.statusCode,
            lastCheck: new Date().toISOString(),
            error: healthCheck.error,
            expiresAt: connectionStatus.expiresAt,
            isChecking: false,
          });
        } else {
          setStatus({
            hasCertificate: false,
            isConnected: false,
            statusCode: null,
            lastCheck: new Date().toISOString(),
            error: connectionStatus.error,
            expiresAt: null,
            isChecking: false,
          });
        }
      } catch (err) {
        if (!mounted) return;

        setStatus(prev => ({
          ...prev,
          isConnected: false,
          error: err instanceof Error ? err.message : 'Error desconocido',
          isChecking: false,
        }));
      }
    };

    // Primer chequeo inmediato
    checkConnection();

    // Luego, configurar intervalos según estado
    const setupInterval = async () => {
      const currentStatus = await getVerifactuConnectionStatus();

      // Si hay certificado, chequear cada 30 segundos
      // Si no, chequear cada 5 minutos (menos carga de servidor)
      const interval = currentStatus.hasActiveCertificate ? 30000 : 300000;

      if (mounted) {
        intervalId = setInterval(checkConnection, interval);
      }
    };

    setupInterval();

    return () => {
      mounted = false;
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  return status;
}
