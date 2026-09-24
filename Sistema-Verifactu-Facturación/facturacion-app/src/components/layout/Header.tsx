'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, Search, Bell, ShieldCheck, Crown, Zap, Lock, Heart } from 'lucide-react';
import { useState, useEffect } from 'react';
import TipModal from '@/components/ui/TipModal';
import AyudaContextual from '@/components/ayuda/AyudaContextual';
import { getInvoices, getCompanySettings, getProducts } from '@/lib/storage';
import { InvoiceStatus } from '@/lib/types';
import { getDaysUntilDue } from '@/lib/utils';
import { getPlan } from '@/lib/plans';
import { tituloDePagina } from '@/lib/titulos';
import AccountMenu from './AccountMenu';
import BotonTema from './BotonTema';
import NotificationsPopover from './NotificationsPopover';

interface HeaderProps {
  onMenuClick: () => void;
  onSearchClick: () => void;
  menuButtonRef?: React.Ref<HTMLButtonElement>;
}


export default function Header({ onMenuClick, onSearchClick, menuButtonRef }: HeaderProps) {
  const pathname = usePathname();
  const [totalAlerts, setTotalAlerts] = useState(0);
  const [verifactuActive, setVerifactuActive] = useState(true);
  const [showNotifications, setShowNotifications] = useState(false);
  const [planName, setPlanName] = useState('Plan Pro');
  const [planId, setPlanId] = useState('pro');
  const [isSubActive, setIsSubActive] = useState(true);
  const [showTipModal, setShowTipModal] = useState(false);

  useEffect(() => {
    (async () => {
      const [invoices, products, settings] = await Promise.all([
        getInvoices(),
        getProducts(),
        getCompanySettings(),
      ]);

      const pId = settings?.planId || 'pro';
      const pObj = getPlan(pId);
      setPlanId(pId);
      setPlanName(pObj ? `Plan ${pObj.name}` : 'Plan Pro');
      setIsSubActive((settings?.subscriptionStatus || 'active') === 'active');

      const overdue = invoices.filter(inv => {
        if (inv.status === InvoiceStatus.ANULADA || inv.status === InvoiceStatus.PAGADA) return false;
        if (inv.status === InvoiceStatus.PENDIENTE || inv.status === InvoiceStatus.EMITIDA) {
          return getDaysUntilDue(inv.dueDate) <= 7;
        }
        if (inv.status === InvoiceStatus.VENCIDA) return true;
        return false;
      });

      const lowStock = products.filter(p => p.active && (p.stockQuantity ?? 0) <= (p.lowStockThreshold ?? 5));

      setTotalAlerts(overdue.length + lowStock.length);
      setVerifactuActive(settings?.verifactuEnabled ?? true);
    })();
  }, [pathname]);

  const pageTitle = tituloDePagina(pathname);

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
        {/* La ayuda de la pantalla en la que estás. Va aquí y no en cada
            página porque la cabecera es el único sitio que aparece en las
            cuarenta y siete: se monta una vez y funciona en todas. */}
        <AyudaContextual />

        <button
          className="header-search-btn-mobile"
          onClick={onSearchClick}
          aria-label="Buscar"
        >
          <Search size={20} />
        </button>

        {/* Membership Tier Badge */}
        <Link
          href="/precios"
          className="header-plan-badge"
          style={{
            // El resto (display, tamaños) va en el CSS: escrito aquí,
            // `display` anulaba la regla que la esconde en el móvil.
            background: !isSubActive ? 'var(--color-danger-bg)' : planId === 'sin_limite' ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'var(--accent-50)',
            color: !isSubActive ? 'var(--color-danger)' : planId === 'sin_limite' ? '#ffffff' : 'var(--accent-500)',
            border: !isSubActive ? '1px solid var(--color-danger)' : '1px solid var(--border-color)',
          }}
          title="Ver nivel de membresía y cambiar de plan"
        >
          {!isSubActive ? <Lock size={12} /> : planId === 'sin_limite' ? <Zap size={12} /> : <Crown size={12} />}
          <span className="header-plan-texto">{isSubActive ? planName : 'Sin Suscripción'}</span>
        </Link>

        {verifactuActive && (
          <div className="verifactu-badge" title="Cada factura emitida se sella con una huella SHA-256 encadenada a la anterior">
            <ShieldCheck size={14} /> Registros sellados
          </div>
        )}

        <div style={{ position: 'relative' }}>
          <button
            className="btn btn-ghost btn-icon"
            style={{ position: 'relative' }}
            title={totalAlerts > 0 ? `${totalAlerts} avisos de stock o vencimiento` : 'Sin avisos pendientes'}
            onClick={() => setShowNotifications(prev => !prev)}
            aria-label={totalAlerts > 0 ? `Notificaciones: ${totalAlerts} avisos` : 'Notificaciones'}
          >
            <Bell size={20} />
            {totalAlerts > 0 && (
              <span className="header-contador" aria-hidden="true">
                {totalAlerts > 99 ? '99+' : totalAlerts}
              </span>
            )}
          </button>

          {showNotifications && (
            <NotificationsPopover onClose={() => setShowNotifications(false)} />
          )}
        </div>

        {/* Botón de Propina / Apoyo Stripe. Oculto en móvil por CSS
            (.header-tip-btn): entre el buscador, la insignia de plan, la
            campana, el tema y la cuenta ya no queda sitio para esto en un
            móvil sin que algo se salga de la cabecera, y de todo lo que hay
            aquí es lo único que no hace falta para usar la app. */}
        <button
          className="btn btn-ghost header-tip-btn"
          onClick={() => setShowTipModal(true)}
          title="Dejar una propina o invitar un café al desarrollo del software vía Stripe"
        >
          <Heart size={13} style={{ color: '#e11d48', fill: '#e11d48' }} />
          <span>Tip ☕</span>
        </button>

        <BotonTema />
        <AccountMenu
          plan={{ nombre: isSubActive ? planName : 'Sin suscripción', id: planId, activo: isSubActive }}
          onTip={() => setShowTipModal(true)}
        />
      </div>

      <TipModal isOpen={showTipModal} onClose={() => setShowTipModal(false)} />
    </header>
  );
}
