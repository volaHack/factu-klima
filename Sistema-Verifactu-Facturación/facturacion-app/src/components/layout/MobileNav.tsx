'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, FileText, Users, Package, Plus, ShoppingBag,
} from 'lucide-react';
import { usePerfiles } from '@/lib/perfilesCliente';
import { listaDeVendedor, nuevoDeVendedor } from '@/lib/perfiles';

interface Entrada {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}

const navItems: Entrada[] = [
  { href: '/dashboard', label: 'Inicio', icon: LayoutDashboard },
  { href: '/facturas', label: 'Facturas', icon: FileText },
  { href: '/clientes', label: 'Clientes', icon: Users },
  { href: '/productos', label: 'Productos', icon: Package },
];

/**
 * La barra del vendedor: sus pedidos a un lado, los clientes al otro y,
 * en medio, el pedido nuevo. Lo demás (presupuestos) está en el menú.
 */
const navVendedor: Entrada[] = [
  { href: listaDeVendedor('pedido'), label: 'Pedidos', icon: ShoppingBag },
  { href: '/clientes?tipo=clientes', label: 'Clientes', icon: Users },
];

export default function MobileNav() {
  const pathname = usePathname();
  const { activo: perfilActivo } = usePerfiles();
  const esVendedor = perfilActivo?.rol === 'vendedor';

  const isActive = (href: string) => {
    const ruta = href.split('?')[0];
    return pathname === ruta || (ruta !== '/dashboard' && pathname.startsWith(ruta + '/'));
  };

  const items = esVendedor ? navVendedor : navItems;
  const mitad = Math.ceil(items.length / 2);
  // La acción principal, con la luz del marco como el botón del menú
  // lateral en el ordenador: la factura nueva o, para el vendedor, el pedido.
  const fab = esVendedor
    ? { href: nuevoDeVendedor('pedido'), label: 'Nuevo pedido' }
    : { href: '/facturas/nueva', label: 'Nueva factura' };

  const enlace = (item: Entrada) => (
    <Link
      key={item.href}
      href={item.href}
      className={`mobile-nav-item ${isActive(item.href) ? 'active' : ''}`}
      aria-current={isActive(item.href) ? 'page' : undefined}
    >
      <item.icon size={22} strokeWidth={isActive(item.href) ? 2.2 : 2} />
      <span>{item.label}</span>
    </Link>
  );

  return (
    <nav className="mobile-nav" aria-label="Navegación principal">
      <div className="mobile-nav-items">
        {items.slice(0, mitad).map(enlace)}

        <Link href={fab.href} className="mobile-nav-fab neon" aria-label={fab.label}>
          <Plus size={26} strokeWidth={2.4} />
        </Link>

        {items.slice(mitad).map(enlace)}
      </div>
    </nav>
  );
}
