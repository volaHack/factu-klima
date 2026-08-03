'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { ToastMessage } from '@/lib/types';
import { generateId } from '@/lib/utils';

interface ToastContextValue {
  toasts: ToastMessage[];
  addToast: (toast: Omit<ToastMessage, 'id'>) => void;
  removeToast: (id: string) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * Mounts ONCE near the root of the app (see src/app/layout.tsx). Owns the
 * single source of truth for toasts.state so every page/component that
 * calls useToast() shares the same list and the single <ToastContainer/>
 * rendered by AuthWrapper actually sees what gets added.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((toast: Omit<ToastMessage, 'id'>) => {
    const newToast: ToastMessage = { ...toast, id: generateId() };
    setToasts(prev => [...prev, newToast]);

    const duration = toast.duration || 4000;
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== newToast.id));
    }, duration);
  }, []);

  const success = useCallback((title: string, message?: string) => {
    addToast({ type: 'success', title, message });
  }, [addToast]);

  const error = useCallback((title: string, message?: string) => {
    addToast({ type: 'error', title, message });
  }, [addToast]);

  const warning = useCallback((title: string, message?: string) => {
    addToast({ type: 'warning', title, message });
  }, [addToast]);

  const info = useCallback((title: string, message?: string) => {
    addToast({ type: 'info', title, message });
  }, [addToast]);

  const value: ToastContextValue = { toasts, addToast, removeToast, success, error, warning, info };

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

/**
 * Same public API as before ({ success, error, warning, info, toasts, removeToast }),
 * but now backed by ToastContext instead of a private useState. Any component
 * calling this must be a descendant of <ToastProvider> (mounted in layout.tsx).
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast() must be used within a <ToastProvider>. Check src/app/layout.tsx.');
  }
  return ctx;
}
