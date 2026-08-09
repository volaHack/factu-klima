'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';

/* Las tres páginas públicas (/, /precios, /instalar) llevaban cada una
   su propia copia del <nav>, con enlaces distintos entre sí: la home
   ofrecía "Precios · Instalar · Iniciar sesión", precios se dejaba
   "Precios" fuera y ninguna tenía menú en móvil — por debajo de 640px
   los cuatro botones se apilaban encima del logo. Una sola fuente. */

const LINKS = [
  { href: '/', label: 'Producto' },
  { href: '/precios', label: 'Precios' },
  { href: '/instalar', label: 'Instalar' },
];

export default function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const cerrar = () => setOpen(false);

  // La barra sólo dibuja su línea inferior y su sombra cuando hay
  // contenido pasando por debajo; sobre el hero se apoya sin marco.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // El panel de móvil se cierra con Escape; al navegar lo cierra el
  // propio enlace (onClick), que es donde ocurre el evento — cerrarlo
  // desde un efecto sobre `pathname` provocaba un render en cascada.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <nav className={`site-nav ${scrolled ? 'is-scrolled' : ''}`}>
      <div className="site-nav-inner">
        <Link href="/" className="site-nav-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/klima-mark.svg" alt="" className="site-nav-logo" width={30} height={30} />
          <span>Klima Solutions</span>
        </Link>

        <div className="site-nav-links">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`site-nav-link ${pathname === l.href ? 'is-current' : ''}`}
              aria-current={pathname === l.href ? 'page' : undefined}
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="site-nav-actions">
          <Link href="/login" className="site-nav-link site-nav-link--login">Iniciar sesión</Link>
          <Link href="/login" className="site-nav-cta">Crear cuenta</Link>
          <button
            type="button"
            className="site-nav-burger"
            aria-expanded={open}
            aria-controls="site-nav-panel"
            aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      <div id="site-nav-panel" className={`site-nav-panel ${open ? 'is-open' : ''}`} hidden={!open}>
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="site-nav-panel-link" onClick={cerrar}>
            {l.label}
          </Link>
        ))}
        <Link href="/login" className="site-nav-panel-link" onClick={cerrar}>Iniciar sesión</Link>
        <Link href="/login" className="site-nav-cta site-nav-panel-cta" onClick={cerrar}>Crear cuenta</Link>
      </div>
    </nav>
  );
}
