'use client';

import { useEffect } from 'react';
import { avisarError } from '@/lib/errores/cliente';

/**
 * El último recurso: si falla hasta el armazón de la aplicación. Tiene que
 * traer su propio <html> y no puede depender de la hoja de estilos.
 */
export default function ErrorGlobal({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => { avisarError(error, 'Aplicación'); }, [error]);
  return (
    <html lang="es">
      <body style={{ fontFamily: 'system-ui, sans-serif', display: 'grid', placeItems: 'center', minHeight: '100vh', margin: 0, background: '#faf7f5', color: '#1f1a1c' }}>
        <div style={{ maxWidth: 420, padding: 24, textAlign: 'center' }}>
          <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>Algo ha fallado</h1>
          <p style={{ margin: '0 0 20px', color: '#5b5256', lineHeight: 1.5 }}>
            No se ha perdido nada de lo guardado y el fallo nos ha llegado. Prueba a recargar.
          </p>
          <button type="button" onClick={() => retry()} style={{ padding: '10px 18px', borderRadius: 999, border: 0, background: '#b02a5c', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
            Volver a intentarlo
          </button>
        </div>
      </body>
    </html>
  );
}
