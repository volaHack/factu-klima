'use client';

import { ThemeTogglerButton } from '@/components/animate-ui/components/buttons/theme-toggler';

/**
 * El interruptor de claro/oscuro de la barra superior.
 * Incluye la animación con expansión diagonal desde la esquina inferior izquierda
 * hasta la esquina superior derecha de la pantalla.
 */
export default function BotonTema() {
  return (
    <ThemeTogglerButton
      direction="bottom-left-to-top-right"
      variant="default"
      size="md"
      modes={['light', 'dark']}
    />
  );
}
