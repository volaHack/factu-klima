'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, Landmark, History, Sliders, MessageCircle, Bug } from 'lucide-react';

const tabs = [
  { href: '/admin', label: 'Resumen', icon: LayoutDashboard },
  { href: '/admin/cuentas', label: 'Cuentas', icon: Users },
  { href: '/admin/hacienda', label: 'Hacienda', icon: Landmark },
  { href: '/admin/soporte', label: 'Soporte', icon: MessageCircle },
  { href: '/admin/errores', label: 'Errores', icon: Bug },
  { href: '/admin/registro', label: 'Auditoría', icon: History },
  { href: '/admin/configuracion', label: 'Configuración', icon: Sliders },
];

export default function AdminNavBar() {
  const pathname = usePathname();

  return (
    <nav className="admin-navbar" aria-label="Navegación de administración">
      <div className="admin-nav-tabs">
        {tabs.map(tab => {
          const isActive = tab.href === '/admin' ? pathname === '/admin' : pathname.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`admin-nav-link ${isActive ? 'active' : ''}`}
            >
              <Icon size={16} strokeWidth={isActive ? 2.2 : 1.8} />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>

      <div className="admin-navbar-actions">
        <div className="admin-badge-pulse" title="Sesión validada con 2FA (AAL2)">
          <div className="admin-pulse-dot" />
          <span className="admin-badge-text">Admin 2FA Activo</span>
        </div>
      </div>
    </nav>
  );
}
