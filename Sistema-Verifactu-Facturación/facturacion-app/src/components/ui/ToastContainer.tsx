'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ToastMessage } from '@/lib/types';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

interface ToastContainerProps {
  toasts: ToastMessage[];
  onRemove: (id: string) => void;
}

const icons = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

// Debe coincidir con la duración de la animación `toastOut` en globals.css.
// useToast.tsx ya quita el toast del estado real al instante (por timeout
// o al pulsar cerrar); este componente es el único que sabe que hace
// falta esperar antes de dejar de pintarlo, para que la salida se vea.
const EXIT_MS = 200;

type DisplayedToast = ToastMessage & { leaving?: boolean };

/**
 * El visto bueno de los avisos de éxito, dibujado en el momento: primero
 * el círculo y luego la marca, como quien firma. Va en SVG propio y no con
 * el icono de lucide porque hace falta animar cada trazo por separado
 * (`toast-visto-*` en estilos/formularios.css).
 */
function VistoBueno() {
  return (
    <svg className="toast-icon toast-visto" width={20} height={20} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="toast-visto-aro" cx="12" cy="12" r="10" pathLength={1} />
      <path className="toast-visto-marca" d="M7.5 12.5l3 3 6-6.5" pathLength={1} />
    </svg>
  );
}

/**
 * Emitir una factura es EL momento de la app: queda sellada para
 * Hacienda. Ese aviso, y sólo ese, suelta además unas chispas alrededor
 * del visto bueno. Se reconoce por el título («… sellada») porque es lo
 * que tienen en común todas las pantallas que emiten, sin tener que
 * cambiar cómo se llama al aviso en cada una.
 */
const esSellado = (t: ToastMessage) => t.type === 'success' && /sellad/i.test(t.title);

export default function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  const [displayed, setDisplayed] = useState<DisplayedToast[]>([]);
  const scheduledRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const liveIds = new Set(toasts.map(t => t.id));

    setDisplayed(prev => {
      const next: DisplayedToast[] = [];

      for (const t of prev) {
        if (liveIds.has(t.id)) {
          next.push({ ...t, leaving: false });
          continue;
        }
        // Ya no está en el estado real: se mantiene en pantalla el tiempo
        // justo para reproducir la salida antes de desmontarlo de verdad.
        next.push({ ...t, leaving: true });
        if (!scheduledRef.current.has(t.id)) {
          scheduledRef.current.add(t.id);
          setTimeout(() => {
            setDisplayed(curr => curr.filter(x => x.id !== t.id));
            scheduledRef.current.delete(t.id);
          }, EXIT_MS);
        }
      }

      const knownIds = new Set(next.map(t => t.id));
      for (const t of toasts) {
        if (!knownIds.has(t.id)) next.push({ ...t, leaving: false });
      }

      return next;
    });
  }, [toasts]);

  if (displayed.length === 0) return null;

  // Con acción («Deshacer»), el botón se pulsa y el aviso se va con él: lo
  // que se deshace ya está hecho y dejarlo ahí invitaría a pulsar dos veces.
  const pulsarAccion = (toast: ToastMessage) => {
    toast.accion?.alPulsar();
    onRemove(toast.id);
  };

  return (
    <div className="toast-container" role="region" aria-label="Avisos" aria-live="polite">
      {displayed.map(toast => {
        const Icon = icons[toast.type];
        const sellado = esSellado(toast);
        return (
          <div
            key={toast.id}
            className={`toast toast-${toast.type}${sellado ? ' toast-sellado' : ''}${toast.accion ? ' toast-con-accion' : ''}${toast.leaving ? ' toast-leaving' : ''}`}
          >
            {/* El tiempo que queda para deshacer, como una raya que se acaba. */}
            {toast.accion && (
              <span className="toast-cuenta" style={{ '--duracion': `${toast.duration ?? 4000}ms` } as CSSProperties} aria-hidden="true" />
            )}
            {toast.type === 'success' ? (
              <span className="toast-icono-exito">
                <VistoBueno />
                {sellado && (
                  <span className="toast-chispas" aria-hidden="true">
                    {Array.from({ length: 8 }, (_, i) => <i key={i} style={{ '--i': i } as CSSProperties} />)}
                  </span>
                )}
              </span>
            ) : (
              <Icon className="toast-icon" size={20} />
            )}
            <div className="toast-content">
              <div className="toast-title">{toast.title}</div>
              {toast.message && (
                <div className="toast-message">{toast.message}</div>
              )}
            </div>
            {toast.accion && (
              <button type="button" className="toast-accion" onClick={() => pulsarAccion(toast)}>
                {toast.accion.etiqueta}
              </button>
            )}
            <button type="button" className="toast-close" onClick={() => onRemove(toast.id)} aria-label="Cerrar el aviso">
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
