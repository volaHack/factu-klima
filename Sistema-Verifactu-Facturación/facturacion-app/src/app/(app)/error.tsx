'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RotateCcw, MessageCircle } from 'lucide-react';
import { avisarError } from '@/lib/errores/cliente';
import { ABRIR_SOPORTE } from '@/lib/soporte';

/**
 * Cuando una pantalla falla, en vez de una página en blanco: qué ha pasado,
 * volver a intentarlo y escribir a soporte. El fallo ya queda apuntado.
 */
export default function ErrorDePantalla({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => { avisarError(error, 'Pantalla'); }, [error]);
  return (
    <div className="empty-state" role="alert">
      <span className="empty-state-icon"><AlertTriangle strokeWidth={1.6} /></span>
      <h2 className="empty-state-title">Esta pantalla ha fallado</h2>
      <p className="empty-state-description">
        No se ha perdido nada de lo guardado. El fallo nos ha llegado solo; si se repite, escríbenos y lo miramos.
      </p>
      <div className="empty-state-actions">
        <button type="button" className="btn btn-primary" onClick={() => retry()}><RotateCcw size={16} /> Volver a intentarlo</button>
        <button type="button" className="btn btn-secondary" onClick={() => window.dispatchEvent(new CustomEvent(ABRIR_SOPORTE))}>
          <MessageCircle size={16} /> Escribir a soporte
        </button>
        <Link href="/dashboard" className="btn btn-ghost">Ir al panel</Link>
      </div>
    </div>
  );
}
