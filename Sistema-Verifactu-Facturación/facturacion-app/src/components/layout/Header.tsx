'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, Search, Bell, ShieldCheck, Crown, Zap, Lock, Heart } from 'lucide-react';
import { useState, useEffect } from 'react';
import TipModal from '@/components/ui/TipModal';
import { createClient } from '@/lib/supabase/client';
import AyudaContextual from '@/components/ayuda/AyudaContextual';
import { getInvoices, getCompanySettings, getProducts } from '@/lib/storage';
import { avisosDeLaCampana } from '@/lib/notificaciones';
import { getPlan } from '@/lib/plans';
import { tituloDePagina } from '@/lib/titulos';
import AccountMenu from './AccountMenu';
import BotonTema from './BotonTema';
import ChipPerfil from '@/components/perfiles/ChipPerfil';
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
  /**
   * Si quien mira es la administración de la plataforma.
   *
   * La propina es para quien hace el programa, no para los clientes: a una
   * empresa que lo está probando, un corazón de «Propina» en la cabecera le
   * parece poco serio. Así que sólo lo ve la administración de la plataforma. Empieza en
   * `false` para que nadie lo vea parpadear mientras llega la respuesta.
   * Es la misma comprobación que abre /admin (`soy_admin`, migración 053),
   * hecha aquí una vez para la cabecera y el menú de la cuenta.
   */
  const [esAdmin, setEsAdmin] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const { data } = await createClient().rpc('soy_admin');
        if (vivo) setEsAdmin(data === true);
      } catch {
        // Sin conexión: se queda oculto, que es lo prudente.
      }
    })();
    return () => { vivo = false; };
  }, []);

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

      // El mismo cálculo que la lista del panel: el número cuadra con ella.
      setTotalAlerts(avisosDeLaCampana(invoices, products).avisos.length);
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
            placeholder="Buscar en todo: cliente, artículo, nº, NIF, importe, pantalla…"
            aria-label="Buscar en todo"
            onFocus={onSearchClick}
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
            background: !isSubActive ? 'var(--color-danger-bg)' : 'var(--accent-50)',
            color: !isSubActive ? 'var(--color-danger)' : 'var(--accent-500)',
            border: !isSubActive ? '1px solid var(--color-danger)' : '1px solid var(--border-color)',
          }}
          title="Ver tu plan o cambiarlo"
        >
          {!isSubActive ? <Lock size={12} /> : planId === 'sin_limite' ? <Zap size={12} /> : <Crown size={12} />}
          <span className="header-plan-texto">{isSubActive ? planName : 'Sin suscripción'}</span>
        </Link>

        {verifactuActive && (
          <div className="verifactu-badge" title="Cada factura emitida se sella con una huella SHA-256 encadenada a la anterior">
            <ShieldCheck size={14} /> Registros sellados
          </div>
        )}

        <div style={{ position: 'relative' }}>
          {/* Con avisos, la campana se mece una vez al llegar (no en bucle:
              un aviso que no para de moverse se acaba ignorando). */}
          <button
            className={`btn btn-ghost btn-icon header-campana${totalAlerts > 0 ? ' suena' : ''}`}
            style={{ position: 'relative' }}
            title={totalAlerts > 0 ? `${totalAlerts} avisos de stock o vencimiento` : 'Sin avisos pendientes'}
            onClick={() => setShowNotifications(prev => !prev)}
            aria-haspopup="dialog"
            aria-expanded={showNotifications}
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

        {/* Propina al desarrollo (Stripe), sólo para la administración de la plataforma.
            Además se oculta en el móvil por CSS (.header-tip-btn): entre el
            buscador, la insignia de plan, la campana, el tema y la cuenta
            no queda sitio sin que algo se salga de la cabecera. */}
        {esAdmin && (
          <button
            className="btn btn-ghost header-tip-btn"
            onClick={() => setShowTipModal(true)}
            title="Dejar una propina o invitar un café al desarrollo del software vía Stripe"
          >
            <Heart size={13} style={{ color: '#e11d48', fill: '#e11d48' }} />
            <span>Propina</span>
          </button>
        )}

        <ChipPerfil />
        <BotonTema />
        <AccountMenu
          plan={{ nombre: isSubActive ? planName : 'Sin suscripción', id: planId, activo: isSubActive }}
          esAdmin={esAdmin}
          onTip={esAdmin ? () => setShowTipModal(true) : undefined}
        />
      </div>

      <TipModal isOpen={showTipModal} onClose={() => setShowTipModal(false)} />
    </header>
  );
}
