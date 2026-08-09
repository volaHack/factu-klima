'use client';

import { useEffect } from 'react';

/**
 * Registra el service worker desde un efecto e incluye auto-recuperación
 * frente a errores de desincronización de cachés de Next.js tras un despliegue.
 */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') return;

    navigator.serviceWorker.register('/sw.js').then((reg) => {
      // Si hay un SW esperando en segundo plano, forzar actualización
      if (reg.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
    }).catch(err => {
      console.warn('No se pudo registrar el service worker:', err);
    });

    // Auto-recuperación ante "ChunkLoadError" (error de carga de fragmentos de Next.js tras un deploy)
    const handleChunkError = (event: ErrorEvent) => {
      const msg = event.message || '';
      if (msg.includes('Loading chunk') || msg.includes('ChunkLoadError') || msg.includes('Failed to fetch dynamically imported module')) {
        console.warn('Error de carga de chunk detectado. Limpiando cachés del Service Worker...');
        if ('caches' in window) {
          caches.keys().then((names) => {
            Promise.all(names.map((name) => caches.delete(name))).then(() => {
              window.location.reload();
            });
          });
        }
      }
    };

    window.addEventListener('error', handleChunkError);
    return () => window.removeEventListener('error', handleChunkError);
  }, []);

  return null;
}
