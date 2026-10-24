'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Plus, ChevronLeft } from 'lucide-react';
import CategoryIcon from '@/components/ui/CategoryIcon';
import MenuPrincipal, { type Hoja } from './MenuPrincipal';
import { getCompanySettings } from '@/lib/storage';
import { isTpvEnabled, BUSINESS_SECTORS } from '@/lib/constants';
import { modulosPorDefecto, type ModuloId } from '@/lib/modulos';
import { empresasQueLlevo, invitacionesPendientes } from '@/lib/gestoria';
import { NOMBRE_ORIGEN, origenDelHistorico } from '@/lib/historico';
import type { CompanySettings } from '@/lib/types';
import { usePerfiles } from '@/lib/perfilesCliente';
import { puedeEntrar } from '@/lib/perfiles';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

// Qué sale en el menú: el árbol (MenuPrincipal) con las hojas de los
// módulos que la empresa tiene encendidos y que el perfil de trabajo activo
// puede abrir. Facturar, cobrar y las fichas salen siempre: son el suelo
// del programa, no un módulo que se pueda apagar.

export default function Sidebar({ isOpen, onClose, collapsed, onToggleCollapse }: SidebarProps) {
  // El menú sólo enseña lo que el perfil de trabajo activo puede abrir.
  const { activo: perfilActivo } = usePerfiles();
  const pathname = usePathname();
  const [brandName, setBrandName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [sectorIcon, setSectorIcon] = useState('Apple');
  const [sectorLabel, setSectorLabel] = useState('Distribución');
  const [tpvActive, setTpvActive] = useState(true);
  const [modulos, setModulos] = useState<ModuloId[] | null>(null);
  // El menú de gestoría sólo sale si de verdad llevas empresas o te han
  // invitado a una: a quien sólo factura lo suyo no le estorba una
  // sección que no va a usar nunca.
  const [tieneGestoria, setTieneGestoria] = useState(false);
  // Lo mismo con el historial del programa anterior: solo sale si se cargó.
  const [origenHistorico, setOrigenHistorico] = useState<string | null>(null);

  // Mientras no se sepan los módulos se enseña todo: esconder menús y
  // hacerlos aparecer medio segundo después es peor que esperar.
  const visible = useCallback((h: Hoja) => {
    if (h.modulo && modulos && !modulos.includes(h.modulo)) return false;
    if (h.requiere === 'tpv' && !tpvActive) return false;
    if (h.requiere === 'historico' && !origenHistorico) return false;
    if (h.requiere === 'gestoria' && !tieneGestoria) return false;
    return !perfilActivo || puedeEntrar(perfilActivo.rol, h.lista.split('?')[0]);
  }, [modulos, tpvActive, origenHistorico, tieneGestoria, perfilActivo]);

  useEffect(() => {
    origenDelHistorico().then(setOrigenHistorico).catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      const [invitaciones, empresas] = await Promise.all([
        invitacionesPendientes(),
        empresasQueLlevo(),
      ]);
      setTieneGestoria(invitaciones.length > 0 || empresas.length > 0);
    })().catch(() => {
      // Sin acceso de gestoría no hay menú, y no hay nada que avisar.
    });
  }, []);

  useEffect(() => {
    const aplicar = (settings: CompanySettings) => {
      setTpvActive(isTpvEnabled(settings));
      // Sin configurar todavía, mandan los de fábrica de su sector: una
      // empresa que ya existía no puede quedarse sin menús de golpe.
      setModulos(settings.modulos ?? modulosPorDefecto(settings.sector));
      setBrandName(settings.tradeName || settings.businessName || 'Empresa');
      setLogoUrl(settings.logoUrl || '');
      const sec = BUSINESS_SECTORS.find(s => s.value === settings.sector);
      if (sec) {
        setSectorIcon(sec.icon);
        setSectorLabel(sec.label);
      }
    };

    const updateState = async () => {
      const settings = await getCompanySettings();
      if (settings) aplicar(settings);
    };

    updateState();

    /**
     * Al guardar en Ajustes se avisa con los ajustes nuevos dentro del evento.
     *
     * Antes, de ese detalle sólo se leía si el TPV seguía encendido, así que
     * cambiar el nombre comercial —o subir un logotipo— no se veía aquí hasta
     * recargar la página. Se aplica entero, que es para lo que viene.
     */
    const handleCustomEvent = (e: Event) => {
      const customEvt = e as CustomEvent<CompanySettings | undefined>;
      if (customEvt.detail) {
        aplicar(customEvt.detail);
      } else {
        updateState();
      }
    };

    window.addEventListener('klima-settings-updated', handleCustomEvent);
    window.addEventListener('storage', updateState);

    return () => {
      window.removeEventListener('klima-settings-updated', handleCustomEvent);
      window.removeEventListener('storage', updateState);
    };
  }, [pathname]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  return (
    <>
      <div
        className={`sidebar-overlay ${isOpen ? 'visible' : ''}`}
        onClick={onClose}
      />
      <aside className={`sidebar ${isOpen ? 'open' : ''} ${collapsed ? 'collapsed' : ''}`}>
        {/* Logo */}
        <div className="sidebar-logo">
          {/* El logotipo de la empresa manda sobre la inicial: en cuanto hay
              uno subido, el panel deja de parecer una plantilla genérica. */}
          <div className={`sidebar-logo-icon${logoUrl ? ' sidebar-logo-icon--imagen' : ''}`}>
            {logoUrl
              ? /* eslint-disable-next-line @next/next/no-img-element */
                <img src={logoUrl} alt="" />
              : (brandName.charAt(0).toUpperCase() || 'K')}
          </div>
          <div className="sidebar-logo-text">
            <h1>{brandName || 'Tu empresa'}</h1>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <CategoryIcon name={sectorIcon} size={13} style={{ opacity: 0.7 }} />
              {sectorLabel}
            </span>
          </div>
          <button
            className="sidebar-close-mobile"
            onClick={onClose}
            aria-label="Cerrar menú"
            style={{ marginLeft: 'auto' }}
          >
            <ChevronLeft size={20} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          <Suspense fallback={null}>
            <MenuPrincipal
              visible={visible}
              onClose={onClose}
              collapsed={collapsed}
              onExpand={onToggleCollapse}
              nombreHistorial={origenHistorico ? (NOMBRE_ORIGEN[origenHistorico] ?? 'anterior') : undefined}
            />
          </Suspense>
        </nav>

        {/* CTA */}
        <div className="sidebar-cta">
          <Link href="/facturas/nueva" className="btn btn-primary" onClick={onClose} title={collapsed ? 'Nueva factura' : undefined}>
            <Plus size={16} />
            <span>Nueva factura</span>
          </Link>
        </div>
      </aside>

      {/* Plegar/desplegar — fuera del <aside> a propósito: dentro quedaba
          recortado por su overflow-x:hidden. Solo escritorio (oculto por
          CSS en móvil, donde el cajón siempre se abre completo). */}
      <button
        className="sidebar-collapse-btn"
        onClick={onToggleCollapse}
        title={collapsed ? 'Expandir menú' : 'Plegar menú'}
        aria-label={collapsed ? 'Expandir menú' : 'Plegar menú'}
      >
        <ChevronLeft size={13} />
      </button>
    </>
  );
}
