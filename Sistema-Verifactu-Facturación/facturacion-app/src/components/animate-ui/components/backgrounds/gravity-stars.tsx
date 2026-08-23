'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';

export interface GravityStarsBackgroundProps extends React.ComponentProps<'div'> {
  starsCount?: number;
  starsSize?: number;
  starsOpacity?: number;
  glowIntensity?: number;
  glowAnimation?: 'instant' | 'ease' | 'spring';
  movementSpeed?: number;
  mouseInfluence?: number;
  mouseGravity?: 'attract' | 'repel';
  gravityStrength?: number;
  starsInteraction?: boolean;
  starsInteractionType?: 'bounce' | 'merge';
}

interface Star {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  baseRadius: number;
  opacity: number;
  color: string;
}

export const GravityStarsBackground: React.FC<GravityStarsBackgroundProps> = ({
  starsCount = 75,
  starsSize = 2,
  starsOpacity = 0.75,
  glowIntensity = 15,
  glowAnimation = 'ease',
  movementSpeed = 0.3,
  mouseInfluence = 100,
  mouseGravity = 'attract',
  gravityStrength = 75,
  starsInteraction = false,
  starsInteractionType = 'bounce',
  className = '',
  style,
  children,
  ...props
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mouseRef = useRef<{ x: number | null; y: number | null; isDown: boolean }>({
    x: null,
    y: null,
    isDown: false,
  });

  const starsRef = useRef<Star[]>([]);
  const isVisibleRef = useRef(true);

  // Inicializar o regenerar estrellas
  const initStars = useCallback(
    (width: number, height: number) => {
      const colors = ['255, 255, 255', '245, 220, 240', '255, 180, 210', '230, 240, 255'];
      const stars: Star[] = [];

      for (let i = 0; i < starsCount; i++) {
        const radius = Math.random() * (starsSize - 0.5) + 0.5;
        stars.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * movementSpeed * 1.5,
          vy: (Math.random() - 0.5) * movementSpeed * 1.5,
          radius,
          baseRadius: radius,
          opacity: Math.random() * (starsOpacity - 0.2) + 0.2,
          color: colors[Math.floor(Math.random() * colors.length)],
        });
      }
      starsRef.current = stars;
    },
    [starsCount, starsSize, starsOpacity, movementSpeed]
  );

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = container.offsetWidth || window.innerWidth);
    let height = (canvas.height = container.offsetHeight || window.innerHeight);

    initStars(width, height);

    // ResizeObserver para ajuste responsivo continuo
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newWidth = Math.floor(entry.contentRect.width);
        const newHeight = Math.floor(entry.contentRect.height);
        if (newWidth > 0 && newHeight > 0 && (newWidth !== width || newHeight !== height)) {
          width = canvas.width = newWidth;
          height = canvas.height = newHeight;
        }
      }
    });
    resizeObserver.observe(container);

    // IntersectionObserver para pausar render cuando no esté a la vista
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      isVisibleRef.current = entry.isIntersecting;
    });
    intersectionObserver.observe(container);

    // Bucle de animación de físicas
    const animate = () => {
      if (!isVisibleRef.current) {
        animationFrameId = requestAnimationFrame(animate);
        return;
      }

      ctx.clearRect(0, 0, width, height);

      const stars = starsRef.current;
      const mouse = mouseRef.current;
      const speedMultiplier = movementSpeed;
      const gravityFactor = (gravityStrength / 100) * 0.45;
      const influenceSq = mouseInfluence * mouseInfluence;

      for (let i = 0; i < stars.length; i++) {
        const star = stars[i];

        // 1. Interacción con ratón
        if (mouse.x !== null && mouse.y !== null) {
          const dx = mouse.x - star.x;
          const dy = mouse.y - star.y;
          const distSq = dx * dx + dy * dy;

          if (distSq < influenceSq && distSq > 4) {
            const dist = Math.sqrt(distSq);
            const force = (1 - dist / mouseInfluence) * gravityFactor;
            const dirX = dx / dist;
            const dirY = dy / dist;

            if (mouseGravity === 'attract') {
              star.vx += dirX * force;
              star.vy += dirY * force;
            } else {
              star.vx -= dirX * force;
              star.vy -= dirY * force;
            }

            // Aumento de brillo cerca del cursor
            if (glowAnimation !== 'instant') {
              star.radius = star.baseRadius * (1 + force * 1.5);
            }
          } else {
            star.radius = star.baseRadius;
          }
        }

        // 2. Fricción y movimiento base
        star.vx *= 0.985;
        star.vy *= 0.985;

        // Mantener una velocidad mínima de deriva cósmica
        const currentSpeed = Math.sqrt(star.vx * star.vx + star.vy * star.vy);
        if (currentSpeed < 0.1) {
          star.vx += (Math.random() - 0.5) * 0.04;
          star.vy += (Math.random() - 0.5) * 0.04;
        }

        star.x += star.vx * (1 + speedMultiplier);
        star.y += star.vy * (1 + speedMultiplier);

        // 3. Espacio Toroidal (reaparecen por el lado opuesto)
        if (star.x < -10) star.x = width + 10;
        else if (star.x > width + 10) star.x = -10;

        if (star.y < -10) star.y = height + 10;
        else if (star.y > height + 10) star.y = -10;

        // 4. Interacción entre estrellas (opcional)
        if (starsInteraction) {
          for (let j = i + 1; j < stars.length; j++) {
            const other = stars[j];
            const sdx = other.x - star.x;
            const sdy = other.y - star.y;
            const sdistSq = sdx * sdx + sdy * sdy;
            const minDistance = star.radius + other.radius + 2;

            if (sdistSq < minDistance * minDistance && sdistSq > 0) {
              if (starsInteractionType === 'bounce') {
                const sdist = Math.sqrt(sdistSq);
                const snx = sdx / sdist;
                const sny = sdy / sdist;
                const kx = star.vx - other.vx;
                const ky = star.vy - other.vy;
                const p = 2 * (snx * kx + sny * ky) / 2;

                star.vx -= p * snx * 0.5;
                star.vy -= p * sny * 0.5;
                other.vx += p * snx * 0.5;
                other.vy += p * sny * 0.5;
              }
            }
          }
        }

        // 5. Dibujar estrella y su resplandor
        ctx.beginPath();
        ctx.arc(star.x, star.y, Math.max(0.2, star.radius), 0, Math.PI * 2);

        if (glowIntensity > 0) {
          ctx.shadowBlur = glowIntensity;
          ctx.shadowColor = `rgba(${star.color}, ${star.opacity})`;
        } else {
          ctx.shadowBlur = 0;
        }

        ctx.fillStyle = `rgba(${star.color}, ${star.opacity})`;
        ctx.fill();
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
    };
  }, [
    initStars,
    movementSpeed,
    gravityStrength,
    mouseGravity,
    mouseInfluence,
    glowIntensity,
    glowAnimation,
    starsInteraction,
    starsInteractionType,
  ]);

  // Manejadores de eventos de ratón sobre el contenedor
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    mouseRef.current.x = e.clientX - rect.left;
    mouseRef.current.y = e.clientY - rect.top;
  };

  const handleMouseLeave = () => {
    mouseRef.current.x = null;
    mouseRef.current.y = null;
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Generar nuevas estrellas al hacer clic
    const newStars: Star[] = Array.from({ length: 5 }).map(() => ({
      x: clickX,
      y: clickY,
      vx: (Math.random() - 0.5) * 4,
      vy: (Math.random() - 0.5) * 4,
      radius: Math.random() * starsSize + 1,
      baseRadius: Math.random() * starsSize + 1,
      opacity: starsOpacity,
      color: '255, 200, 230',
    }));

    starsRef.current.push(...newStars);
    // Limitar total para evitar saturación
    if (starsRef.current.length > starsCount + 30) {
      starsRef.current.splice(0, 5);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${className}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      style={{
        ...style,
      }}
      {...props}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none"
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
        }}
      />
      {children}
    </div>
  );
};

export const GravityStarsBackgroundDemo = () => {
  return (
    <GravityStarsBackground className="absolute inset-0 flex items-center justify-center rounded-xl" />
  );
};
