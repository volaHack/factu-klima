'use client';

import React, { useSyncExternalStore } from 'react';
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
  const temaEfectivoActual = useSyncExternalStore(
    suscribirseAlTema,
    leerTemaEfectivo,
    leerTemaEnServidor
  );

  const temaGuardadoActual = typeof window !== 'undefined' ? temaGuardado() : 'auto';
  const esOscuro = temaEfectivoActual === 'oscuro';

  const executeThemeTransition = (nuevoTema: Tema) => {
    // Si la API de View Transitions está disponible y no se prefiere reducción de movimiento
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (
      typeof document !== 'undefined' &&
      'startViewTransition' in document &&
      !prefersReducedMotion
    ) {
      let x = 0;
      let y = window.innerHeight; // Por defecto: Esquina abajo izquierda

      if (direction === 'top-right-to-bottom-left') {
        x = window.innerWidth;
        y = 0;
      } else if (direction === 'radial') {
        x = window.innerWidth / 2;
        y = window.innerHeight / 2;
      }

      // Distancia máxima hasta la esquina superior derecha (o más lejana)
      const endRadius = Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y)
      );

      const transition = (document as unknown as { startViewTransition: (cb: () => void) => { ready: Promise<void> } }).startViewTransition(() => {
        guardarTema(nuevoTema);
      });

      transition.ready.then(() => {
        document.documentElement.animate(
          {
            clipPath: [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${endRadius}px at ${x}px ${y}px)`,
            ],
          },
          {
            duration: 650,
            easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
            pseudoElement: '::view-transition-new(root)',
          }
        );
      });
    } else {
      // Fallback estándar
      guardarTema(nuevoTema);
    }
  };

  const handleToggle = () => {
    // Mapear modos ['light', 'dark', 'system'] -> ['claro', 'oscuro', 'auto']
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
