'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Plus, Search, RefreshCw, Heart, ShieldCheck, ChevronUp, ChevronDown,
  LayoutDashboard, FileText, Users, Package, Zap
} from 'lucide-react';
import TipModal from '@/components/ui/TipModal';
import { notifyDataUpdate } from '@/lib/storage';
import { atajoDe, EVENTO_BUSCAR, EVENTO_REFRESCAR } from '@/lib/atajos';

export interface ManagementBarProps {
  className?: string;
}

export const ManagementBar: React.FC<ManagementBarProps> = ({ className = '' }) => {
  const pathname = usePathname();
  const [isMinimized, setIsMinimized] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showTipModal, setShowTipModal] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [oculta, setOculta] = useState(false);

  // Al bajar por una página se aparta, y vuelve en cuanto se sube un poco o
  // se llega al final. Fija en mitad de la pantalla tapaba justo lo que se
  // estaba leyendo: las gráficas del Panel, las últimas filas de una tabla.
  useEffect(() => {
    let ultima = window.scrollY;
    let pendiente = false;
    const mirar = () => {
      pendiente = false;
      const y = window.scrollY;
      const alFinal = window.innerHeight + y >= document.documentElement.scrollHeight - 40;
      if (y < 80 || alFinal) setOculta(false);
      else if (y > ultima + 6) setOculta(true);
      else if (y < ultima - 6) setOculta(false);
      ultima = y;
    };
    const alDesplazar = () => {
      if (pendiente) return;
      pendiente = true;
      requestAnimationFrame(mirar);
    };
    window.addEventListener('scroll', alDesplazar, { passive: true });
    return () => window.removeEventListener('scroll', alDesplazar);
  }, []);

  // Al cambiar de pantalla se vuelve a ver.
  const [rutaVista, setRutaVista] = useState(pathname);
  if (rutaVista !== pathname) {
    setRutaVista(pathname);
    setOculta(false);
  }

  // El teclado lo escucha el armazón (`AuthWrapper`), que es quien conoce
  // todas las pantallas. Aquí sólo se recoge el aviso de refrescar, porque
  // el icono que gira se pinta en esta barra y en ningún otro sitio.
  useEffect(() => {
    const alRefrescar = () => {
      setIsRefreshing(true);
      notifyDataUpdate('all');
      setTimeout(() => setIsRefreshing(false), 500);
    };
    window.addEventListener(EVENTO_REFRESCAR, alRefrescar);
    return () => window.removeEventListener(EVENTO_REFRESCAR, alRefrescar);
  }, []);

  // Tanto el botón como la tecla pasan por el mismo sitio: si algún día
  // refrescar hace algo más, lo hará igual con el ratón que con la R.
  const triggerRefresh = () => window.dispatchEvent(new CustomEvent(EVENTO_REFRESCAR));

  // Antes se fingía una pulsación de Ctrl+K para que la escuchara el
  // armazón. Además de frágil, alternaba: pulsar el botón con el buscador
  // ya abierto lo cerraba.
  const triggerSearch = () => window.dispatchEvent(new CustomEvent(EVENTO_BUSCAR));

  const navItems = [
    {
      id: 'dashboard',
      label: 'Panel',
      icon: LayoutDashboard,
      href: '/dashboard',
      shortcut: atajoDe('panel').tecla,
    },
    {
      id: 'facturas',
      label: 'Facturas',
      icon: FileText,
      href: '/facturas',
      shortcut: atajoDe('facturas').tecla,
    },
    {
      id: 'nueva_factura',
      label: 'Nueva Factura',
      icon: Plus,
      href: '/facturas/nueva',
      primary: true,
      shortcut: atajoDe('nueva-factura').tecla,
    },
    {
      id: 'search',
      label: 'Búsqueda rápida',
      icon: Search,
      action: triggerSearch,
      shortcut: atajoDe('buscar').tecla,
    },
    {
      id: 'refresh',
      label: 'Actualizar datos',
      icon: RefreshCw,
      action: triggerRefresh,
      spinning: isRefreshing,
      shortcut: atajoDe('refrescar').tecla,
    },
    {
      id: 'tip',
      label: 'Dejar propina',
      icon: Heart,
      action: () => setShowTipModal(true),
      badge: 'Tip',
      highlightColor: 'var(--accent-500, #b02a5c)',
    },
  ];

  return (
    <>
      <div
        className={`management-bar-container ${className}`}
        aria-hidden={oculta || undefined}
        style={{
          position: 'fixed',
          bottom: '24px',
          // Centrada en el CONTENIDO, no en la ventana: con el sidebar
          // abierto, el 50 % de la ventana la dejaba corrida a la izquierda.
          left: 'calc(50% + var(--sidebar-width, 0px) / 2)',
          transform: oculta ? 'translate(-50%, calc(100% + 32px))' : 'translateX(-50%)',
          opacity: oculta ? 0 : 1,
          transition: 'transform 0.28s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease',
          // Por debajo de la cabecera y de cualquier modal: con 9990 se
          // quedaba flotando encima de los diálogos y de su fondo oscuro.
          zIndex: 85,
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            pointerEvents: oculta ? 'none' : 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: isMinimized ? '6px 12px' : '6px 8px',
            backgroundColor: 'var(--bg-header)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid var(--border-color)',
            borderRadius: '9999px',
            boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.5), 0 0 25px var(--accent-glow, rgba(176, 42, 92, 0.2))',
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
                color: 'var(--text-primary)',
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
              <div style={{ width: '1px', height: '22px', backgroundColor: 'var(--border-color)' }} />

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
                        background: item.primary
                          ? 'var(--accent-gradient, linear-gradient(135deg, #c9407a 0%, #9c2856 100%))'
                          : isActive
                          ? 'var(--bg-card)'
                          : isHovered
                          ? 'var(--bg-card-hover)'
                          : 'transparent',
                        color: item.primary ? '#ffffff' : isActive ? 'var(--accent-500, #b02a5c)' : 'var(--text-secondary)',
                        border: item.primary
                          ? '1px solid transparent'
                          : isActive
                          ? '1px solid var(--accent-500, #b02a5c)'
                          : '1px solid transparent',
                        boxShadow: item.primary ? '0 4px 14px var(--accent-glow, rgba(176, 42, 92, 0.35))' : 'none',
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
                            backgroundColor: 'var(--bg-elevated)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px',
                            padding: '4px 10px',
                            color: 'var(--text-primary)',
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
                                backgroundColor: 'var(--bg-tertiary)',
                                padding: '1px 5px',
                                borderRadius: '4px',
                                fontSize: '9px',
                                color: 'var(--text-muted)',
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
