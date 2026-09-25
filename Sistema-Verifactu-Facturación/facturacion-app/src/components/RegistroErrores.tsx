'use client';

import { useEffect } from 'react';
import { avisarError } from '@/lib/errores/cliente';

/** Escucha los fallos que no recoge nadie y los apunta (ver lib/errores). */
export default function RegistroErrores() {
  useEffect(() => {
    const alFallar = (ev: ErrorEvent) => avisarError(ev.error ?? ev.message);
    const alRechazar = (ev: PromiseRejectionEvent) => avisarError(ev.reason, 'Promesa sin capturar');
    window.addEventListener('error', alFallar);
    window.addEventListener('unhandledrejection', alRechazar);
    return () => {
      window.removeEventListener('error', alFallar);
      window.removeEventListener('unhandledrejection', alRechazar);
    };
  }, []);
  return null;
}
