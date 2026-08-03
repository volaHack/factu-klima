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

  return (
    <nav className="mobile-nav">
      <div className="mobile-nav-items">
        {navItems.slice(0, 2).map(item => {
          const isActive = pathname === item.href || 
            (item.href !== '/dashboard' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`mobile-nav-item ${isActive ? 'active' : ''}`}
            >
              <item.icon size={22} />
              <span>{item.label}</span>
            </Link>
          );
        })}

        {/* FAB - New Invoice */}
        <Link href="/facturas/nueva" className="mobile-nav-fab">
          <Plus size={24} />
        </Link>

        {navItems.slice(2).map(item => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`mobile-nav-item ${isActive ? 'active' : ''}`}
            >
              <item.icon size={22} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
