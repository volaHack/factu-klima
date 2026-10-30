'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

/**
 * La ventana pequeña del editor (el repaso antes de emitir, la chuleta de
 * atajos): con el teclado se entra, se sale con Escape y el tabulador no se
 * escapa por detrás. Al cerrarla, el foco vuelve a donde estaba, para que
 * quien estaba escribiendo en una línea siga en ella.
 */
export default function DialogoRapido({ titulo, icono, onCerrar, children, pie, className }: {
  titulo: string;
  icono?: ReactNode;
  onCerrar: () => void;
  children: ReactNode;
  pie?: ReactNode;
  className?: string;
}) {
  const idTitulo = useId();
  const caja = useRef<HTMLDivElement>(null);
  const cerrar = useRef(onCerrar);
  useEffect(() => { cerrar.current = onCerrar; });

  useEffect(() => {
    const antes = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // El primero con `data-foco-inicial`, o el primer botón.
    const inicial = caja.current?.querySelector<HTMLElement>('[data-foco-inicial]')
      ?? caja.current?.querySelector<HTMLElement>('button');
    inicial?.focus();
    return () => { if (antes?.isConnected) antes.focus(); };
  }, []);

  const alTeclear = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cerrar.current();
      return;
    }
    if (e.key !== 'Tab' || !caja.current) return;
    const enfocables = [...caja.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')];
    if (!enfocables.length) return;
    const primero = enfocables[0];
    const ultimo = enfocables[enfocables.length - 1];
    if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
  };

  return (
    <div className="modal-overlay dialogo-rapido-fondo" onMouseDown={e => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div
        ref={caja}
        className={`modal dialogo-rapido${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        onKeyDown={alTeclear}
      >
        <div className="modal-header">
          <h2 className="modal-title dialogo-rapido-titulo" id={idTitulo}>{icono}{titulo}</h2>
          <button type="button" className="modal-close" onClick={onCerrar} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body dialogo-rapido-cuerpo">{children}</div>
        {pie && <div className="modal-footer dialogo-rapido-pie">{pie}</div>}
      </div>
    </div>
  );
}
