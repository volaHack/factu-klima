'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, FileText, Users, Package, Plus
} from 'lucide-react';

const navItems = [
  { href: '/dashboard', label: 'Inicio', icon: LayoutDashboard },
  { href: '/facturas', label: 'Facturas', icon: FileText },
  { href: '/clientes', label: 'Clientes', icon: Users },
  { href: '/productos', label: 'Productos', icon: Package },
];

export default function MobileNav() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    pathname === href || (href !== '/dashboard' && pathname.startsWith(href));

  return (
    <nav className="mobile-nav" aria-label="Navegación principal">
      <div className="mobile-nav-items">
        {navItems.slice(0, 2).map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`mobile-nav-item ${isActive(item.href) ? 'active' : ''}`}
            aria-current={isActive(item.href) ? 'page' : undefined}
          >
            <item.icon size={22} strokeWidth={isActive(item.href) ? 2.2 : 2} />
            <span>{item.label}</span>
          </Link>
        ))}

        {/* FAB - New Invoice */}
        <Link href="/facturas/nueva" className="mobile-nav-fab" aria-label="Nueva factura">
          <Plus size={26} strokeWidth={2.4} />
        </Link>

        {navItems.slice(2).map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`mobile-nav-item ${isActive(item.href) ? 'active' : ''}`}
            aria-current={isActive(item.href) ? 'page' : undefined}
          >
            <item.icon size={22} strokeWidth={isActive(item.href) ? 2.2 : 2} />
            <span>{item.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
