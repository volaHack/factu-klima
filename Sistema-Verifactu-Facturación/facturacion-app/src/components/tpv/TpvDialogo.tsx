'use client';

/**
 * LA VENTANA DEL TPV
 *
 * Cada ventana del TPV montaba su propia cabecera, sus márgenes y sus
 * botones, y ninguna se parecía a la de al lado: el cobro con el título
 * pegado al borde, el ticket con otra cabecera, el cierre de caja con
 * otra. En un mostrador eso cuesta: el cajero no sabe dónde mirar.
 *
 * Aquí está la forma común —icono y título arriba, el contenido con aire,
 * los botones abajo y siempre en el mismo sitio— y el comportamiento que
 * todas necesitan y casi ninguna tenía: cerrar con Esc, no cerrar al
 * soltar un arrastre fuera, el foco dentro al abrir, el scroll del cuerpo
 * y no de la página, y hoja desde abajo en el teléfono.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

export type TonoDialogo = 'marca' | 'exito' | 'aviso' | 'neutro';

interface Props {
  titulo: ReactNode;
  subtitulo?: ReactNode;
  icono?: ReactNode;
  tono?: TonoDialogo;
  /** Ancho máximo: sm 420, md 520, lg 720, xl 920. */
  ancho?: 'sm' | 'md' | 'lg' | 'xl';
  pie?: ReactNode;
  /** Algo a la derecha de la cabecera, antes del botón de cerrar. */
  accion?: ReactNode;
  onClose?: () => void;
  /** Sin cerrar con Esc ni al pulsar fuera (p. ej. mientras se cobra). */
  bloqueado?: boolean;
  className?: string;
  children: ReactNode;
}

export default function TpvDialogo({
  titulo, subtitulo, icono, tono = 'marca', ancho = 'md', pie, accion,
  onClose, bloqueado = false, className = '', children,
}: Props) {
  const caja = useRef<HTMLDivElement>(null);
  const pulsadoFuera = useRef(false);
  // En refs y no como dependencias: quien usa la ventana pasa funciones
  // nuevas en cada render, y el efecto volvía a mover el foco al primer
  // campo mientras se escribía en el segundo.
  const cerrarRef = useRef(onClose);
  const bloqueadoRef = useRef(bloqueado);
  useEffect(() => { cerrarRef.current = onClose; bloqueadoRef.current = bloqueado; });

  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null;
    // El foco entra en la ventana: el teclado del cajero va a ella, no a
    // la parrilla de productos que hay detrás.
    const primero = caja.current?.querySelector<HTMLElement>('[data-autofocus], input, button:not(.tpvd-cerrar), [tabindex="0"]');
    (primero ?? caja.current)?.focus({ preventScroll: true });

    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !bloqueadoRef.current && cerrarRef.current) {
        e.stopPropagation();
        cerrarRef.current();
      }
    };
    window.addEventListener('keydown', alTeclear, true);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', alTeclear, true);
      document.body.style.overflow = overflow;
      previo?.focus?.({ preventScroll: true });
    };
  }, []);

  return (
    <div
      className="tpvd-velo"
      // Se cierra sólo si el clic EMPIEZA y ACABA fuera: seleccionar el
      // importe del campo arrastrando hasta fuera ya no cierra el cobro.
      onPointerDown={e => { pulsadoFuera.current = e.target === e.currentTarget; }}
      onClick={e => {
        if (pulsadoFuera.current && e.target === e.currentTarget && !bloqueado) onClose?.();
      }}
    >
      <div
        ref={caja}
        className={`tpvd tpvd--${ancho} tpvd--${tono} ${className}`}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
      >
        <header className="tpvd-cabeza">
          {icono && <span className="tpvd-icono" aria-hidden="true">{icono}</span>}
          <div className="tpvd-titulos">
            <h2 className="tpvd-titulo">{titulo}</h2>
            {subtitulo && <p className="tpvd-subtitulo">{subtitulo}</p>}
          </div>
          {accion}
          {onClose && (
            <button type="button" className="tpvd-cerrar" onClick={onClose} disabled={bloqueado} aria-label="Cerrar (Esc)" title="Cerrar (Esc)">
              <X size={18} />
            </button>
          )}
        </header>
        <div className="tpvd-cuerpo">{children}</div>
        {pie && <footer className="tpvd-pie">{pie}</footer>}
      </div>
    </div>
  );
}
