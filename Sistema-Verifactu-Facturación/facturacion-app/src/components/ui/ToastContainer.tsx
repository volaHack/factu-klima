'use client';

import { useEffect, useRef, useState } from 'react';
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

  return (
    <div className="toast-container">
      {displayed.map(toast => {
        const Icon = icons[toast.type];
        return (
          <div
            key={toast.id}
            className={`toast toast-${toast.type}${toast.leaving ? ' toast-leaving' : ''}`}
          >
            <Icon className="toast-icon" size={20} />
            <div className="toast-content">
              <div className="toast-title">{toast.title}</div>
              {toast.message && (
                <div className="toast-message">{toast.message}</div>
              )}
            </div>
            <button className="toast-close" onClick={() => onRemove(toast.id)}>
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
