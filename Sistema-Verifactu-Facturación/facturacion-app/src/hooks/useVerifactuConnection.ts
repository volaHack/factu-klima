'use client';

import { useState, useEffect } from 'react';
import { getVerifactuConnectionStatus } from '@/lib/storage';

export interface VerifactuStatus {
  hasCertificate: boolean;
  isConnected: boolean;
  statusCode: string | null;
  lastCheck: string | null;
  error: string | null;
  expiresAt: string | null;
  /** Días que quedan hasta que caduque el certificado, o null si no hay. */
  diasParaCaducar: number | null;
  isChecking: boolean;
}

/**
 * El estado de la conexión con la AEAT, para la tarjeta del panel.
 *
 * ESTO LEE, NO LLAMA A LA AEAT. Y es un cambio importante respecto a lo
 * que hacía antes.
 *
 * Antes este hook llamaba a `/api/verifactu/health` cada 30 segundos.
 * Mientras ese endpoint era un ping de mentira daba igual: no salía
 * ninguna petición de la máquina. Desde que el envío a la AEAT es real,
 * ese endpoint abre un saludo TLS de verdad contra la Agencia
 * Tributaria, y mantenerlo cada 30 segundos significaría un saludo cada
 * 30 segundos por cada pestaña abierta de cada usuario, para siempre.
 * Eso no es monitorización, es aporrear un servicio público.
 *
 * Así que aquí se lee lo que quedó guardado de la última comprobación, y
 * la comprobación de verdad la dispara el usuario desde la pantalla de
 * Veri*Factu, que es donde tiene sentido: cuando acaba de poner el
 * certificado y quiere saber si vale.
 */
export function useVerifactuConnection(): VerifactuStatus {
  const [status, setStatus] = useState<VerifactuStatus>({
    hasCertificate: false,
    isConnected: false,
    statusCode: null,
    lastCheck: null,
    error: null,
    expiresAt: null,
    diasParaCaducar: null,
    isChecking: true,
  });

  useEffect(() => {
    let montado = true;

    const leer = async () => {
      if (!montado) return;

      try {
        const guardado = await getVerifactuConnectionStatus();
        if (!montado) return;

        // Los días que faltan se calculan AQUÍ, dentro del efecto, y no
        // al pintar: `Date.now()` durante el render da un resultado
        // distinto en cada repintado sin que nada lo haya provocado.
        const caduca = guardado.expiresAt ? new Date(guardado.expiresAt) : null;

        setStatus({
          hasCertificate: guardado.hasActiveCertificate,
          isConnected: guardado.isConnected,
          statusCode: guardado.statusCode,
          lastCheck: guardado.lastCheck,
          error: guardado.error,
          expiresAt: guardado.expiresAt,
          diasParaCaducar: caduca
            ? Math.ceil((caduca.getTime() - Date.now()) / 86_400_000)
            : null,
          isChecking: false,
        });
      } catch (err) {
        if (!montado) return;
        setStatus(prev => ({
          ...prev,
          isConnected: false,
          error: err instanceof Error ? err.message : 'Error desconocido',
          isChecking: false,
        }));
      }
    };

    leer();
    // Cinco minutos. Es una consulta a nuestra propia base de datos para
    // refrescar una tarjeta informativa: no hace falta más a menudo.
    const intervalo = setInterval(leer, 300_000);

    return () => {
      montado = false;
      clearInterval(intervalo);
    };
  }, []);

  return status;
}
