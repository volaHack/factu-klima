'use client';

import { useReveal } from './useReveal';

/**
 * Sección que entra al llegar a pantalla. El movimiento lo hace el CSS
 * (`.reveal` → `.is-in`), y bajo `prefers-reduced-motion` la hoja de
 * estilos lo desactiva entero, así que aquí no hay nada que consultar.
 */
export default function Reveal({
  children,
  className = '',
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  const { ref, className: revealClass } = useReveal<HTMLElement>();

  return (
    <section id={id} ref={ref} className={`${className} ${revealClass}`}>
      {children}
    </section>
  );
}
