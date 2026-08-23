'use client';

import React, { useEffect, useRef } from 'react';

interface Star {
  x: number;
  y: number;
  size: number;
  color: string;
  speedX: number;
  speedY: number;
  alpha: number;
  fadeSpeed: number;
}

interface GravityStarsBackgroundProps {
  className?: string;
  starColor?: string;
  starCount?: number;
}

export const GravityStarsBackground: React.FC<GravityStarsBackgroundProps> = ({
  className = '',
  starColor = '255, 255, 255',
  starCount = 120,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = canvas.offsetWidth || window.innerWidth);
    let height = (canvas.height = canvas.offsetHeight || window.innerHeight);

    // Generar estrellas
    const stars: Star[] = Array.from({ length: starCount }).map(() => ({
      x: Math.random() * width,
      y: Math.random() * height,
      size: Math.random() * 1.8 + 0.3,
      color: starColor,
      speedX: (Math.random() - 0.5) * 0.15,
      speedY: (Math.random() - 0.5) * 0.15,
      alpha: Math.random(),
      fadeSpeed: Math.random() * 0.006 + 0.002,
    }));

    const resizeHandler = () => {
      if (!canvas) return;
      width = canvas.width = canvas.offsetWidth || window.innerWidth;
      height = canvas.height = canvas.offsetHeight || window.innerHeight;
    };

    window.addEventListener('resize', resizeHandler);

    // Loop de animación
    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      // Dibujar fondo suave radial
      const gradient = ctx.createRadialGradient(
        width / 2,
        height / 2,
        10,
        width / 2,
        height / 2,
        Math.max(width, height)
      );
      gradient.addColorStop(0, 'rgba(23, 10, 24, 0.35)');
      gradient.addColorStop(1, 'rgba(8, 4, 12, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      // Dibujar y actualizar estrellas
      stars.forEach(star => {
        // Movimiento gravitacional ligero hacia el centro
        const dx = width / 2 - star.x;
        const dy = height / 2 - star.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        
        // Fuerza de atracción leve
        const force = 0.005 / dist;
        star.speedX += dx * force;
        star.speedY += dy * force;

        // Limitar velocidad
        const speedLimit = 0.3;
        const speed = Math.sqrt(star.speedX * star.speedX + star.speedY * star.speedY);
        if (speed > speedLimit) {
          star.speedX = (star.speedX / speed) * speedLimit;
          star.speedY = (star.speedY / speed) * speedLimit;
        }

        // Actualizar coordenadas
        star.x += star.speedX;
        star.y += star.speedY;

        // Centelleo
        star.alpha += star.fadeSpeed;
        if (star.alpha > 1 || star.alpha < 0.1) {
          star.fadeSpeed = -star.fadeSpeed;
        }

        // Si se sale de los bordes o llega muy al centro, relocalizar
        if (
          star.x < 0 ||
          star.x > width ||
          star.y < 0 ||
          star.y > height ||
          dist < 20
        ) {
          star.x = Math.random() * width;
          star.y = Math.random() * height;
          star.speedX = (Math.random() - 0.5) * 0.15;
          star.speedY = (Math.random() - 0.5) * 0.15;
          star.alpha = 0.1;
        }

        // Dibujar estrella
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${star.color}, ${Math.max(0.1, Math.min(1, star.alpha))})`;
        ctx.shadowBlur = star.size > 1.2 ? 6 : 0;
        ctx.shadowColor = `rgba(${star.color}, 0.5)`;
        ctx.fill();
      });

      animationFrameId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener('resize', resizeHandler);
      cancelAnimationFrame(animationFrameId);
    };
  }, [starColor, starCount]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        display: 'block',
        pointerEvents: 'none',
        mixBlendMode: 'screen',
        width: '100%',
        height: '100%',
      }}
    />
  );
};
