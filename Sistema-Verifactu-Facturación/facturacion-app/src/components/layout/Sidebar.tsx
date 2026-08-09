'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, FileText, Users, Package, BarChart3,
  Settings, Plus, ChevronLeft, ShieldCheck, Plug, Store,
} from 'lucide-react';
import CategoryIcon from '@/components/ui/CategoryIcon';
import { getCompanySettings } from '@/lib/storage';
import { isTpvEnabled, BUSINESS_SECTORS } from '@/lib/constants';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
}

function SidebarLink({ item, pathname, onClose, collapsed }: {
  item: NavItem;
  pathname: string;
  onClose: () => void;
  collapsed: boolean;
}) {
  const isActive =
    pathname === item.href ||
    (item.href !== '/dashboard' && pathname.startsWith(item.href));

  return (
    <Link
      href={item.href}
      className={`sidebar-link ${isActive ? 'active' : ''}`}
      onClick={onClose}
      aria-current={isActive ? 'page' : undefined}
      title={collapsed ? item.label : undefined}
    >
      <item.icon size={18} />
      <span>{item.label}</span>
    </Link>
  );
}

const baseNavItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/facturas', label: 'Facturas', icon: FileText },
  { href: '/clientes', label: 'Clientes', icon: Users },
  { href: '/productos', label: 'Productos', icon: Package },
];

const controlItems = [
  { href: '/informes', label: 'Informes y fiscal', icon: BarChart3 },
  { href: '/integridad', label: 'Integridad', icon: ShieldCheck },
  { href: '/verifactu', label: 'Verifactu', icon: Plug },
  { href: '/ajustes', label: 'Ajustes', icon: Settings },
];

export default function Sidebar({ isOpen, onClose, collapsed, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname();
  const [brandName, setBrandName] = useState('DistAlSur');
  const [sectorIcon, setSectorIcon] = useState('Apple');
  const [sectorLabel, setSectorLabel] = useState('Distribución');
  const [tpvActive, setTpvActive] = useState(true);

  useEffect(() => {
    (async () => {
      const settings = await getCompanySettings();
      if (settings) {
        setTpvActive(isTpvEnabled(settings));
        setBrandName(settings.tradeName || settings.businessName || 'Empresa');
        const sec = BUSINESS_SECTORS.find(s => s.value === settings.sector);
        if (sec) {
          setSectorIcon(sec.icon);
          setSectorLabel(sec.label);
        }
      }
    })();
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
          <div className="sidebar-logo-icon">{brandName.charAt(0).toUpperCase()}</div>
          <div className="sidebar-logo-text">
            <h1>{brandName}</h1>
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
          <span className="sidebar-section-label">Gestión operativa</span>
          {(tpvActive ? [...baseNavItems, { href: '/tpv', label: 'TPV', icon: Store }] : baseNavItems).map(item => (
            <SidebarLink key={item.href} item={item} pathname={pathname} onClose={onClose} collapsed={collapsed} />
          ))}

          <span className="sidebar-section-label" style={{ marginTop: 'var(--space-5)' }}>
            Control y cumplimiento
          </span>
          {controlItems.map(item => (
            <SidebarLink key={item.href} item={item} pathname={pathname} onClose={onClose} collapsed={collapsed} />
          ))}
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
