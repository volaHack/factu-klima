'use client';

import { useEffect } from 'react';

import { createClient } from '@/lib/supabase/client';
import { precalentar } from '@/lib/pwa/sinConexion';

/** Identifica el despliegue: cada uno trae ficheros de código nuevos. */
const VERSION_APP = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || 'local';

/**
 * Registra el service worker, deja la app guardada en el dispositivo para
 * usarla sin conexión y se recupera de los errores de carga que deja un
 * despliegue nuevo.
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

    // Con sesión y con red, se guardan todas las pantallas de la app. Sin
    // sesión no: el servidor contestaría con la redirección al login.
    const guardarPantallas = async () => {
      if (!navigator.onLine) return;
      const { data } = await createClient().auth.getSession();
      if (data.session) await precalentar(VERSION_APP);
    };
    void guardarPantallas();
    window.addEventListener('online', guardarPantallas);

    // Auto-recuperación ante «ChunkLoadError» tras un despliegue: se borran
    // las cachés y se recarga para traer el código nuevo.
    //
    // SÓLO CON CONEXIÓN. Sin red, ese error significa que falta un fichero
    // en el teléfono, y borrar las cachés y recargar dejaba la app entera
    // sin nada que enseñar: justo lo contrario de lo que hace falta.
    const handleChunkError = (event: ErrorEvent) => {
      const msg = event.message || '';
      if (!navigator.onLine) return;
      if (msg.includes('Loading chunk') || msg.includes('ChunkLoadError') || msg.includes('Failed to fetch dynamically imported module')) {
        console.warn('Error de carga de chunk detectado. Limpiando cachés del Service Worker...');
        if ('caches' in window) {
          caches.keys().then((names) => {
            Promise.all(names.filter(n => n.includes('codigo')).map((name) => caches.delete(name))).then(() => {
              window.location.reload();
            });
          });
        }
      }
    };

    window.addEventListener('error', handleChunkError);
    return () => {
      window.removeEventListener('error', handleChunkError);
      window.removeEventListener('online', guardarPantallas);
    };
  }, []);

  return null;
}
