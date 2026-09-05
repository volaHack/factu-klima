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

  // La barra sólo se apoya en papel translúcido cuando hay papel por
  // debajo; sobre fotografía va sin marco y con los textos en crema.
  //
  // Antes eso se decidía con `scrollY > 8`, que en la home dejaba la
  // barra en tinta oscura a los nueve píxeles de scroll, todavía sobre
  // la foto del mostrador. Con el héroe clavado el fallo duraba ya dos
  // pantallas y media. Ahora la home marca su zona oscura con
  // `[data-nav-oscura]` y un IntersectionObserver mira si sigue debajo:
  // sin listener de scroll y sin un render por fotograma.
  //
  // El estado inicial se queda siempre en `false`, igual que en el
  // servidor: leer `window.scrollY` aquí para arrancar «ya corregido»
  // desincroniza el HTML del cliente del que mandó el servidor en cuanto
  // la página se recarga a media altura. No hace falta arreglarlo — en
  // las páginas donde de verdad se usa este `if` (precios, instalar),
  // `.site-page:not(.home) .site-nav` ya fuerza el aspecto de papel para
  // cualquier valor de `scrolled`, así que el primer frame no se nota.
  useEffect(() => {
    const zona = document.querySelector('[data-nav-oscura]');

    if (!zona) {
      const onScroll = () => setScrolled(window.scrollY > 8);
      // `requestAnimationFrame`, no una llamada directa: así la primera
      // lectura de `scrollY` también ocurre dentro de un callback, no en
      // el cuerpo del efecto — el mismo motivo por el que el branch del
      // IntersectionObserver de abajo no dispara este mismo aviso.
      const raf = requestAnimationFrame(onScroll);
      window.addEventListener('scroll', onScroll, { passive: true });
      return () => {
        cancelAnimationFrame(raf);
        window.removeEventListener('scroll', onScroll);
      };
    }

    // El margen recorta el alto de la barra por arriba: en cuanto la
    // zona oscura deja de tocar ese borde, la barra ya está sobre papel.
    const io = new IntersectionObserver(
      ([entrada]) => setScrolled(!entrada.isIntersecting),
      { rootMargin: '-64px 0px 0px 0px', threshold: 0 },
    );
    io.observe(zona);
    return () => io.disconnect();
  }, [pathname]);

  // El panel de móvil se cierra con Escape; al navegar lo cierra el
  // propio enlace (onClick), que es donde ocurre el evento — cerrarlo
  // desde un efecto sobre `pathname` provocaba un render en cascada.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    // El panel ocupa la pantalla entera: sin esto, la página de debajo
    // se sigue desplazando con el dedo por detrás del menú.
    document.body.classList.add('nav-abierta');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('nav-abierta');
    };
  }, [open]);

  /**
   * EL MENÚ SE QUEDABA ATRAPADO AL GIRAR LA TABLETA
   *
   * El panel se abre a cualquier anchura, pero el botón con el que se
   * cierra —el hamburguesa— sólo existe por debajo de 860 px. Bastaba con
   * abrir el menú en vertical y girar el aparato: la barra volvía a su
   * versión de escritorio, el hamburguesa desaparecía, y quedaba una
   * pantalla de vino a pantalla completa sin ninguna manera de salir. En
   * una tableta o un móvil no hay tecla Escape que valga; el único remedio
   * era recargar la página.
   *
   * Así que el propio cambio de anchura lo cierra. Y por si el JavaScript
   * no llegara a ejecutarse, el CSS tampoco deja que el panel se pinte por
   * encima de esa anchura.
   */
  useEffect(() => {
    if (!open) return;
    const escritorio = window.matchMedia('(min-width: 861px)');
    const alCambiar = () => { if (escritorio.matches) setOpen(false); };
    alCambiar();
    escritorio.addEventListener('change', alCambiar);
    return () => escritorio.removeEventListener('change', alCambiar);
  }, [open]);

  return (
    <nav className={`site-nav ${scrolled ? 'is-scrolled' : ''} ${open ? 'tiene-panel' : ''}`}>
      {/* El hilo de la cadena: crece con el scroll de toda la página, no
          con un `scroll` listener — es una `animation-timeline: scroll()`
          nativa. Sin ese soporte, o con `prefers-reduced-motion`, se
          queda en `scaleX(0)` y no se nota que está ahí. */}
      <div className="site-nav-progress" aria-hidden="true" />

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
