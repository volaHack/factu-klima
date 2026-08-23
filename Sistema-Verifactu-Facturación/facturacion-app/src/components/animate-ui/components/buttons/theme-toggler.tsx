'use client';

import React, { useSyncExternalStore, useRef } from 'react';
import { Sun, Moon, Laptop } from 'lucide-react';
import {
  guardarTema,
  leerTemaEfectivo,
  leerTemaEnServidor,
  suscribirseAlTema,
  temaGuardado,
  type Tema,
} from '@/lib/tema';

export interface ThemeTogglerButtonProps {
  variant?: 'default' | 'ghost' | 'outline' | 'minimal' | 'icon';
  size?: 'sm' | 'md' | 'lg';
  direction?: 'bottom-left-to-top-right' | 'top-right-to-bottom-left' | 'radial' | 'auto';
  modes?: ('light' | 'dark' | 'system')[];
  className?: string;
  style?: React.CSSProperties;
  showLabel?: boolean;
}

export const ThemeTogglerButton: React.FC<ThemeTogglerButtonProps> = ({
  variant = 'default',
  size = 'md',
  direction = 'bottom-left-to-top-right',
  modes = ['light', 'dark'],
  className = '',
  style = {},
  showLabel = false,
}) => {
  const isTransitioningRef = useRef(false);

  const temaEfectivoActual = useSyncExternalStore(
    suscribirseAlTema,
    leerTemaEfectivo,
    leerTemaEnServidor
  );

  const temaGuardadoActual = typeof window !== 'undefined' ? temaGuardado() : 'auto';
  const esOscuro = temaEfectivoActual === 'oscuro';

  const executeThemeTransition = async (nuevoTema: Tema) => {
    if (isTransitioningRef.current) return;
    isTransitioningRef.current = true;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Coordenadas del origen de la animación (por defecto: esquina inferior izquierda)
    let originX = 0;
    let originY = typeof window !== 'undefined' ? window.innerHeight : 800;

    if (direction === 'top-right-to-bottom-left' && typeof window !== 'undefined') {
      originX = window.innerWidth;
      originY = 0;
    } else if (direction === 'radial' && typeof window !== 'undefined') {
      originX = window.innerWidth / 2;
      originY = window.innerHeight / 2;
    }

    const endRadius = typeof window !== 'undefined'
      ? Math.hypot(
          Math.max(originX, window.innerWidth - originX),
          Math.max(originY, window.innerHeight - originY)
        )
      : 1500;

    const hasViewTransition =
      typeof document !== 'undefined' &&
      'startViewTransition' in document &&
      !prefersReducedMotion;

    if (hasViewTransition) {
      try {
        const transition = (
          document as unknown as {
            startViewTransition: (cb: () => void) => {
              ready: Promise<void>;
              finished: Promise<void>;
            };
          }
        ).startViewTransition(() => {
          guardarTema(nuevoTema);
        });

        await transition.ready;

        const anim = document.documentElement.animate(
          {
            clipPath: [
              `circle(0px at ${originX}px ${originY}px)`,
              `circle(${endRadius}px at ${originX}px ${originY}px)`,
            ],
          },
          {
            duration: 480,
            easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
            pseudoElement: '::view-transition-new(root)',
          }
        );

        await anim.finished;
      } catch {
        guardarTema(nuevoTema);
      } finally {
        isTransitioningRef.current = false;
      }
    } else if (!prefersReducedMotion && typeof document !== 'undefined') {
      // Fallback fluido con elemento overlay expansivo para navegadores sin View Transitions
      try {
        const targetColor = nuevoTema === 'oscuro' || (nuevoTema === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
          ? '#191013'
          : '#f2e7e0';

        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.inset = '0';
        overlay.style.zIndex = '999999';
        overlay.style.pointerEvents = 'none';
        overlay.style.backgroundColor = targetColor;
        overlay.style.clipPath = `circle(0px at ${originX}px ${originY}px)`;
        overlay.style.transition = 'clip-path 450ms cubic-bezier(0.22, 1, 0.36, 1)';
        document.body.appendChild(overlay);

        // Forzar reflow
        void overlay.offsetHeight;

        overlay.style.clipPath = `circle(${endRadius}px at ${originX}px ${originY}px)`;

        await new Promise(resolve => setTimeout(resolve, 450));
        guardarTema(nuevoTema);
        overlay.remove();
      } catch {
        guardarTema(nuevoTema);
      } finally {
        isTransitioningRef.current = false;
      }
    } else {
      guardarTema(nuevoTema);
      isTransitioningRef.current = false;
    }
  };

  const handleToggle = () => {
    const modoActual =
      temaGuardadoActual === 'auto'
        ? 'system'
        : temaGuardadoActual === 'oscuro'
        ? 'dark'
        : 'light';

    const indexActual = modes.indexOf(modoActual);
    const siguienteIndex = (indexActual + 1) % modes.length;
    const siguienteModo = modes[siguienteIndex];

    const siguienteTema: Tema =
      siguienteModo === 'system'
        ? 'auto'
        : siguienteModo === 'dark'
        ? 'oscuro'
        : 'claro';

    executeThemeTransition(siguienteTema);
  };

  const sizePixels = size === 'sm' ? 32 : size === 'lg' ? 44 : 36;
  const iconSize = size === 'sm' ? 15 : size === 'lg' ? 20 : 17;

  return (
    <button
      type="button"
      className={`tema-boton ${className}`}
      onClick={handleToggle}
      aria-label={
        esOscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'
      }
      title={
        temaGuardadoActual === 'auto'
          ? 'Tema del sistema (automático)'
          : esOscuro
          ? 'Modo oscuro'
          : 'Modo claro'
      }
      style={{
        width: showLabel ? 'auto' : `${sizePixels}px`,
        height: `${sizePixels}px`,
        padding: showLabel ? '0 12px' : undefined,
        gap: showLabel ? '8px' : undefined,
        borderRadius: variant === 'minimal' ? '9999px' : undefined,
        ...style,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: 'rotate(0deg)',
          transition: 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        {temaGuardadoActual === 'auto' ? (
          <Laptop size={iconSize} />
        ) : esOscuro ? (
          <Sun size={iconSize} />
        ) : (
          <Moon size={iconSize} />
        )}
      </div>

      {showLabel && (
        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
          {temaGuardadoActual === 'auto'
            ? 'Sistema'
            : esOscuro
            ? 'Oscuro'
            : 'Claro'}
        </span>
      )}
    </button>
  );
};

export interface ThemeTogglerButtonDemoProps {
  variant?: ThemeTogglerButtonProps['variant'];
  size?: ThemeTogglerButtonProps['size'];
  direction?: ThemeTogglerButtonProps['direction'];
  system?: boolean;
}

export default function ThemeTogglerButtonDemo({
  variant = 'default',
  size = 'md',
  direction = 'bottom-left-to-top-right',
  system = false,
}: ThemeTogglerButtonDemoProps) {
  return (
    <ThemeTogglerButton
      variant={variant}
      size={size}
      direction={direction}
      modes={system ? ['light', 'dark', 'system'] : ['light', 'dark']}
    />
  );
}
