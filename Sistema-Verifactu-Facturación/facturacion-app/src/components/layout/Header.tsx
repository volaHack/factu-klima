'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Menu, Search, Bell, ShieldCheck } from 'lucide-react';
import { useState, useEffect } from 'react';
import { getInvoices, getCompanySettings } from '@/lib/storage';
import { InvoiceStatus } from '@/lib/types';
import { getDaysUntilDue } from '@/lib/utils';
import AccountMenu from './AccountMenu';

interface HeaderProps {
  onMenuClick: () => void;
  onSearchClick: () => void;
  menuButtonRef?: React.Ref<HTMLButtonElement>;
}

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/facturas': 'Facturas',
  '/facturas/nueva': 'Nueva factura',
  '/clientes': 'Clientes',
  '/productos': 'Productos',
  '/informes': 'Informes',
  '/ajustes': 'Ajustes',
};

export default function Header({ onMenuClick, onSearchClick, menuButtonRef }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [overdueCount, setOverdueCount] = useState(0);
  const [verifactuActive, setVerifactuActive] = useState(true);

  useEffect(() => {
    (async () => {
      const invoices = await getInvoices();
      const overdue = invoices.filter(inv => {
        if (inv.status === InvoiceStatus.PENDIENTE || inv.status === InvoiceStatus.EMITIDA) {
          return getDaysUntilDue(inv.dueDate) <= 7;
        }
        if (inv.status === InvoiceStatus.VENCIDA) return true;
        return false;
      });
      setOverdueCount(overdue.length);

      const settings = await getCompanySettings();
      setVerifactuActive(settings?.verifactuEnabled ?? true);
    })();
  }, [pathname]);

  let pageTitle = PAGE_TITLES[pathname] || '';
  if (!pageTitle && pathname.startsWith('/facturas/') && pathname.includes('/editar')) {
    pageTitle = 'Editar Factura';
  } else if (!pageTitle && pathname.startsWith('/facturas/')) {
    pageTitle = 'Detalle de Factura';
  } else if (!pageTitle && pathname.startsWith('/clientes/')) {
    pageTitle = 'Ficha de Cliente';
  }

  return (
    <header className="header">
      <button className="header-menu-btn" onClick={onMenuClick} ref={menuButtonRef} aria-label="Abrir menú">
        <Menu size={24} />
      </button>

      <div className="header-breadcrumb">
        <span>{pageTitle}</span>
      </div>

      <div className="header-search">
        <div className="search-bar" onClick={onSearchClick}>
          <div className="search-bar-icon">
            <Search size={16} />
          </div>
          <input
            type="text"
            placeholder="Buscar facturas, clientes, productos..."
            readOnly
          />
          <span className="search-bar-shortcut">Ctrl+K</span>
        </div>
      </div>

      <div className="header-actions">
        <button
          className="btn btn-ghost btn-icon header-search-btn-mobile"
          onClick={onSearchClick}
          aria-label="Buscar"
        >
          <Search size={20} />
        </button>
        {verifactuActive && (
          <div className="verifactu-badge" title="Cada factura emitida se sella con una huella SHA-256 encadenada a la anterior">
            <ShieldCheck size={14} /> Registros sellados
          </div>
        )}
        <button
          className="btn btn-ghost btn-icon"
          style={{ position: 'relative' }}
          title={overdueCount > 0 ? `${overdueCount} factura(s) próximas a vencer o vencidas` : 'Sin avisos pendientes'}
          onClick={() => router.push('/facturas')}
        >
          <Bell size={20} />
          {overdueCount > 0 && (
            <span style={{
              position: 'absolute',
              top: 2,
              right: 2,
              width: 16,
              height: 16,
              borderRadius: '50%',
              background: 'var(--color-danger)',
              color: 'white',
              fontSize: '10px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              {overdueCount}
            </span>
          )}
        </button>
        <AccountMenu />
      </div>
    </header>
  );
}
