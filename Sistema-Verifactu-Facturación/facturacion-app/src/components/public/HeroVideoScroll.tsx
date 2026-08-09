'use client';

import { useEffect, useRef, useState } from 'react';

interface HeroVideoScrollProps {
  videoSrc?: string;
  posterSrc?: string;
}

export default function HeroVideoScroll({
  videoSrc = '/hero-video.mp4',
  posterSrc = '/img/mostrador-1920.webp',
}: HeroVideoScrollProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    let animationFrameId: number;

    const handleScroll = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      
      // Calculate scroll progress from 0 (at top) to 1 (when scrolled past hero)
      const totalScrollable = rect.height || windowHeight;
      const currentScroll = Math.max(0, -rect.top);
      const progress = Math.min(1, Math.max(0, currentScroll / totalScrollable));

      setScrollProgress(progress);

      // Smoothly adjust video playback rate slightly on active scroll for interactive feedback
      if (videoRef.current) {
        const speed = 1.0 + progress * 0.4;
        videoRef.current.playbackRate = Math.min(1.5, Math.max(0.8, speed));
      }
    };

    const onScrollThrottled = () => {
      animationFrameId = requestAnimationFrame(handleScroll);
    };

    window.addEventListener('scroll', onScrollThrottled, { passive: true });
    handleScroll(); // Initial check

    return () => {
      window.removeEventListener('scroll', onScrollThrottled);
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, []);

  // Compute dynamic scroll transforms:
  // - Scale: 1.0 -> 1.15 for subtle cinematic zoom-in effect
  // - TranslateY: 0px -> 60px parallax shift
  // - Brightness/Filter: Maintains high contrast
  const videoScale = 1 + scrollProgress * 0.15;
  const videoY = scrollProgress * 65;
  const scrimOpacity = 0.75 + scrollProgress * 0.2;

  return (
    <div ref={containerRef} className="home-hero-video-container">
      <video
        ref={videoRef}
        className="home-hero-video"
        src={videoSrc}
        poster={posterSrc}
        autoPlay
        loop
        muted
        playsInline
        aria-hidden="true"
        style={{
          transform: `translate3d(0, ${videoY}px, 0) scale(${videoScale})`,
          willChange: 'transform',
        }}
      />
      <div
        className="home-hero-scrim"
        style={{
          opacity: scrimOpacity,
          transition: 'opacity 150ms ease-out',
        }}
      />
    </div>
  );
}
