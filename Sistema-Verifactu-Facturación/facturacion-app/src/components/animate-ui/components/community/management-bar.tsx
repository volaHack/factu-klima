'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import {
  Plus, Search, RefreshCw, Heart, ShieldCheck, ChevronUp, ChevronDown,
  LayoutDashboard, FileText, Users, Package, Sparkles, Zap
} from 'lucide-react';
import TipModal from '@/components/ui/TipModal';
import { notifyDataUpdate } from '@/lib/storage';

export interface ManagementBarProps {
  className?: string;
}

export const ManagementBar: React.FC<ManagementBarProps> = ({ className = '' }) => {
  const router = useRouter();
  const pathname = usePathname();
  const [isMinimized, setIsMinimized] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showTipModal, setShowTipModal] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Escuchar atajos de teclado globales (ej: N para nueva factura, R para refrescar)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignorar si el foco está en un input o textarea
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)) return;

      if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        router.push('/facturas/nueva');
      } else if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        triggerRefresh();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [router]);

  const triggerRefresh = () => {
    setIsRefreshing(true);
    notifyDataUpdate('all');
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const triggerSearch = () => {
    // Disparar evento de apertura de CommandPalette
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
  };

  const navItems = [
    {
      id: 'dashboard',
      label: 'Panel',
      icon: LayoutDashboard,
      href: '/dashboard',
      shortcut: 'D',
    },
    {
      id: 'facturas',
      label: 'Facturas',
      icon: FileText,
      href: '/facturas',
      shortcut: 'F',
    },
    {
      id: 'nueva_factura',
      label: 'Nueva Factura',
      icon: Plus,
      href: '/facturas/nueva',
      primary: true,
      shortcut: 'N',
    },
    {
      id: 'search',
      label: 'Búsqueda rápida',
      icon: Search,
      action: triggerSearch,
      shortcut: 'Ctrl+K',
    },
    {
      id: 'refresh',
      label: 'Actualizar datos',
      icon: RefreshCw,
      action: triggerRefresh,
      spinning: isRefreshing,
      shortcut: 'R',
    },
    {
      id: 'tip',
      label: 'Dejar propina ☕',
      icon: Heart,
      action: () => setShowTipModal(true),
      badge: 'Tip',
      highlightColor: '#e11d48',
    },
  ];

  return (
    <>
      <div
        className={`management-bar-container ${className}`}
        style={{
          position: 'fixed',
          bottom: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9990,
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            pointerEvents: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: isMinimized ? '6px 12px' : '6px 8px',
            backgroundColor: 'rgba(24, 20, 29, 0.82)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 255, 255, 0.14)',
            borderRadius: '9999px',
            boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.5), 0 0 25px rgba(201, 64, 122, 0.15)',
            transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {isMinimized ? (
            /* Versión colapsada / compacta */
            <button
              onClick={() => setIsMinimized(false)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-primary, #ffffff)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 700,
                padding: '2px 6px',
              }}
              title="Expandir barra de gestión rápida"
            >
              <Sparkles size={14} color="#e11d48" />
              <span>Gestión rápida</span>
              <ChevronUp size={14} />
            </button>
          ) : (
            /* Barra expandida completa */
            <>
              {/* Logo / Estado Verifactu indicator */}
              <Link
                href="/verifactu"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 10px',
                  borderRadius: '9999px',
                  backgroundColor: 'rgba(16, 185, 129, 0.12)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  color: '#10b981',
                  fontSize: '11px',
                  fontWeight: 800,
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease',
                }}
                title="Veri*Factu activo: sellado criptográfico en cada factura"
              >
                <ShieldCheck size={14} />
                <span className="hidden-mobile">Veri*Factu</span>
              </Link>

              {/* Separador vertical */}
              <div style={{ width: '1px', height: '22px', backgroundColor: 'rgba(255, 255, 255, 0.12)' }} />

              {/* Botones de acción */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {navItems.map((item, index) => {
                  const Icon = item.icon;
                  const isActive = item.href ? pathname === item.href : false;
                  const isHovered = hoveredIndex === index;

                  const buttonContent = (
                    <div
                      style={{
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: item.primary ? 'auto' : '38px',
                        height: '38px',
                        padding: item.primary ? '0 14px' : '0',
                        gap: item.primary ? '6px' : '0',
                        borderRadius: '9999px',
                        backgroundColor: item.primary
                          ? 'linear-gradient(135deg, #c9407a 0%, #9c2856 100%)'
                          : isActive
                          ? 'rgba(255, 255, 255, 0.16)'
                          : isHovered
                          ? 'rgba(255, 255, 255, 0.08)'
                          : 'transparent',
                        background: item.primary ? 'linear-gradient(135deg, #c9407a 0%, #9c2856 100%)' : undefined,
                        color: item.primary ? '#ffffff' : isActive ? 'var(--color-primary, #e11d48)' : 'var(--text-primary, #f3f4f6)',
                        border: item.primary
                          ? '1px solid rgba(255, 255, 255, 0.2)'
                          : isActive
                          ? '1px solid rgba(201, 64, 122, 0.4)'
                          : '1px solid transparent',
                        boxShadow: item.primary ? '0 4px 14px rgba(201, 64, 122, 0.45)' : 'none',
                        cursor: 'pointer',
                        transform: isHovered ? 'translateY(-2px)' : 'translateY(0)',
                        transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                      }}
                      onMouseEnter={() => setHoveredIndex(index)}
                      onMouseLeave={() => setHoveredIndex(null)}
                    >
                      <Icon
                        size={17}
                        className={item.spinning ? 'animate-spin' : ''}
                        fill={item.highlightColor && isHovered ? item.highlightColor : 'none'}
                        color={item.highlightColor ? item.highlightColor : undefined}
                      />
                      {item.primary && (
                        <span style={{ fontSize: '12px', fontWeight: 800 }}>
                          Factura
                        </span>
                      )}

                      {/* Tooltip flotante al pasar el ratón */}
                      {isHovered && (
                        <div
                          style={{
                            position: 'absolute',
                            bottom: '48px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            backgroundColor: 'rgba(15, 12, 20, 0.95)',
                            border: '1px solid rgba(255, 255, 255, 0.14)',
                            borderRadius: '8px',
                            padding: '4px 10px',
                            color: '#ffffff',
                            fontSize: '11px',
                            fontWeight: 700,
                            whiteSpace: 'nowrap',
                            boxShadow: '0 8px 16px rgba(0, 0, 0, 0.4)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            pointerEvents: 'none',
                            animation: 'fadeIn 0.15s ease-out',
                          }}
                        >
                          <span>{item.label}</span>
                          {item.shortcut && (
                            <span
                              style={{
                                backgroundColor: 'rgba(255, 255, 255, 0.15)',
                                padding: '1px 5px',
                                borderRadius: '4px',
                                fontSize: '9px',
                                color: 'rgba(255, 255, 255, 0.8)',
                              }}
                            >
                              {item.shortcut}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );

                  if (item.href) {
                    return (
                      <Link key={item.id} href={item.href} style={{ textDecoration: 'none' }}>
                        {buttonContent}
                      </Link>
                    );
                  }

                  return (
                    <button
                      key={item.id}
                      onClick={item.action}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                    >
                      {buttonContent}
                    </button>
                  );
                })}
              </div>

              {/* Botón Minimizar */}
              <button
                onClick={() => setIsMinimized(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted, #9ca3af)',
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  padding: 0,
                  marginLeft: '2px',
                  transition: 'color 0.15s ease',
                }}
                title="Minimizar barra"
                aria-label="Minimizar barra"
              >
                <ChevronDown size={14} />
              </button>
            </>
          )}
        </div>
      </div>

      <TipModal isOpen={showTipModal} onClose={() => setShowTipModal(false)} />
    </>
  );
};

export const ManagementBarDemo = () => <ManagementBar />;

export default ManagementBar;
