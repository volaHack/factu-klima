'use client';

import React, { useEffect, useRef, useCallback } from 'react';

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
  starsCount = 85,
  starsSize = 2.5,
  starsOpacity = 0.85,
  glowIntensity = 18,
  glowAnimation = 'ease',
  movementSpeed = 0.35,
  mouseInfluence = 150,
  mouseGravity = 'attract',
  gravityStrength = 80,
  starsInteraction = false,
  starsInteractionType = 'bounce',
  className = '',
  style,
  children,
  ...props
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mouseRef = useRef<{ x: number | null; y: number | null }>({
    x: null,
    y: null,
  });

  const starsRef = useRef<Star[]>([]);
  const isVisibleRef = useRef(true);

  // Inicializar o regenerar estrellas
  const initStars = useCallback(
    (width: number, height: number) => {
      const colors = ['255, 255, 255', '255, 180, 220', '210, 140, 240', '255, 220, 240', '190, 220, 255'];
      const stars: Star[] = [];

      for (let i = 0; i < starsCount; i++) {
        const radius = Math.random() * (starsSize - 0.8) + 0.8;
        stars.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * movementSpeed * 1.5,
          vy: (Math.random() - 0.5) * movementSpeed * 1.5,
          radius,
          baseRadius: radius,
          opacity: Math.random() * (starsOpacity - 0.25) + 0.25,
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

    // ResizeObserver para ajuste responsivo
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

    // IntersectionObserver para optimizar rendimiento
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      isVisibleRef.current = entry.isIntersecting;
    });
    intersectionObserver.observe(container);

    // Seguimiento del cursor global para que interactúe en toda la pantalla
    const onWindowMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouseRef.current.x = e.clientX - rect.left;
      mouseRef.current.y = e.clientY - rect.top;
    };

    const onWindowMouseLeave = () => {
      mouseRef.current.x = null;
      mouseRef.current.y = null;
    };

    const onWindowClick = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      if (clickX >= 0 && clickX <= width && clickY >= 0 && clickY <= height) {
        const newStars: Star[] = Array.from({ length: 6 }).map(() => ({
          x: clickX,
          y: clickY,
          vx: (Math.random() - 0.5) * 5,
          vy: (Math.random() - 0.5) * 5,
          radius: Math.random() * starsSize + 1.2,
          baseRadius: Math.random() * starsSize + 1.2,
          opacity: Math.min(1, starsOpacity + 0.2),
          color: '255, 190, 230',
        }));
        starsRef.current.push(...newStars);
        if (starsRef.current.length > starsCount + 40) {
          starsRef.current.splice(0, 6);
        }
      }
    };

    window.addEventListener('mousemove', onWindowMouseMove, { passive: true });
    window.addEventListener('mouseleave', onWindowMouseLeave);
    window.addEventListener('click', onWindowClick);

    // Bucle de animación
    const animate = () => {
      if (!isVisibleRef.current) {
        animationFrameId = requestAnimationFrame(animate);
        return;
      }

      ctx.clearRect(0, 0, width, height);

      const stars = starsRef.current;
      const mouse = mouseRef.current;
      const speedMultiplier = movementSpeed;
      const gravityFactor = (gravityStrength / 100) * 0.5;
      const influenceSq = mouseInfluence * mouseInfluence;

      for (let i = 0; i < stars.length; i++) {
        const star = stars[i];

        // 1. Interacción con cursor
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

            if (glowAnimation !== 'instant') {
              star.radius = star.baseRadius * (1 + force * 1.8);
            }
          } else {
            star.radius = star.baseRadius;
          }
        }

        // 2. Fricción y deriva natural
        star.vx *= 0.985;
        star.vy *= 0.985;

        const currentSpeed = Math.sqrt(star.vx * star.vx + star.vy * star.vy);
        if (currentSpeed < 0.12) {
          star.vx += (Math.random() - 0.5) * 0.05;
          star.vy += (Math.random() - 0.5) * 0.05;
        }

        star.x += star.vx * (1 + speedMultiplier);
        star.y += star.vy * (1 + speedMultiplier);

        // 3. Espacio Toroidal suave
        if (star.x < -10) star.x = width + 10;
        else if (star.x > width + 10) star.x = -10;

        if (star.y < -10) star.y = height + 10;
        else if (star.y > height + 10) star.y = -10;

        // 4. Interacción entre estrellas
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

        // 5. Renderizado con destello cósmico
        ctx.beginPath();
        ctx.arc(star.x, star.y, Math.max(0.3, star.radius), 0, Math.PI * 2);

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
      window.removeEventListener('mousemove', onWindowMouseMove);
      window.removeEventListener('mouseleave', onWindowMouseLeave);
      window.removeEventListener('click', onWindowClick);
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
    starsCount,
    starsSize,
    starsOpacity,
  ]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
      {...props}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 0,
          display: 'block',
        }}
      />
      {children && (
        <div style={{ position: 'relative', zIndex: 1, width: '100%' }}>
          {children}
        </div>
      )}
    </div>
  );
};

export const GravityStarsBackgroundDemo = () => {
  return (
    <GravityStarsBackground
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '12px',
      }}
    />
  );
};
