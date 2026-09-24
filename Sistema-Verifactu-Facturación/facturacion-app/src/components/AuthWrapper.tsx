'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import MobileNav from '@/components/layout/MobileNav';
import ToastContainer from '@/components/ui/ToastContainer';
import CommandPalette from '@/components/layout/CommandPalette';
import OnboardingModal from '@/components/OnboardingModal';
import NetworkStatusBar from '@/components/ui/NetworkStatusBar';
import { useToast } from '@/hooks/useToast';
import { getCompanySettings, seedInitialData, isOnboardingCompleted } from '@/lib/storage';
import { initAutoSync, fullDownloadToOffline } from '@/lib/syncEngine';
import { CompanySettings } from '@/lib/types';
import { ManagementBar } from '@/components/animate-ui/components/community/management-bar';
import { isPublicRoute } from '@/lib/publicRoutes';
import { aplicarAcento } from '@/lib/acento';
import ControlPerfiles, { SinAcceso } from '@/components/perfiles/ControlPerfiles';
import { usePerfiles } from '@/lib/perfilesCliente';
import { puedeEntrar } from '@/lib/perfiles';
import { accionDeEventoDeTeclado, atajoDe, EVENTO_BUSCAR, EVENTO_REFRESCAR } from '@/lib/atajos';

/**
 * Rutas que exigen sesión pero se dibujan a pantalla completa, sin sidebar,
 * cabecera ni navegación móvil.
 *
 * El TPV es un mostrador de venta, no una página del panel: su .tpv-shell
 * mide 100dvh y trae su propia barra superior con enlace de vuelta. Metido
 * dentro del armazón del dashboard quedaba debajo de una cabecera que ya
 * ocupa alto y con el sidebar comiéndole ancho, así que se desbordaba y se
 * veía encajonado.
 */
const FULLSCREEN_ROUTES = ['/tpv'];

export default function AuthWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [settingsForOnboarding, setSettingsForOnboarding] = useState<CompanySettings | null>(null);
  const { toasts, removeToast } = useToast();

  const isPublic = isPublicRoute(pathname);
  // Perfil de trabajo activo en este equipo: si su rol no llega a esta
  // pantalla, se enseña el aviso en su lugar (ver lib/perfiles.ts).
  const { enUso: perfilesEnUso, activo: perfilActivo } = usePerfiles();
  const sinAcceso = !isPublic && perfilesEnUso && perfilActivo && !puedeEntrar(perfilActivo.rol, pathname)
    ? perfilActivo : null;
  const isFullScreen = FULLSCREEN_ROUTES.some(r => pathname.startsWith(r));

  useEffect(() => {
    // Se lee tras montar, no en el useState inicial: localStorage no
    // existe en el servidor, y leerlo en el inicializador produciría un
    // valor distinto entre servidor y cliente en el primer render —
    // exactamente el bug de hidratación que ya tuvimos con navigator.onLine.
    if (localStorage.getItem('sidebar-collapsed') === 'true') {
      setSidebarCollapsed(true);
    }
  }, []);

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sidebar-collapsed', String(next));
      return next;
    });
  };

  useEffect(() => {
    if (!isPublic) {
      // Initialize offline sync engine
      initAutoSync();

      // Initial data load
      seedInitialData();
      getCompanySettings().then(stg => {
        aplicarAcento(stg?.accentTheme);
        setSettingsForOnboarding(stg);
      });

      // Full download to offline DB if online
      if (navigator.onLine) {
        fullDownloadToOffline();
      }

      // Check onboarding
      isOnboardingCompleted().then(completed => {
        if (!completed) {
          setShowOnboarding(true);
        }
      });
    }

    // Los atajos globales, todos por el mismo sitio. Qué tecla hace qué —y
    // sobre todo cuándo NO debe hacer nada— está en `lib/atajos.ts`, que es
    // de donde la barra de gestión rápida saca también sus rótulos: así no
    // puede volver a anunciarse un atajo que no escucha nadie.
    const handleKeyDown = (e: KeyboardEvent) => {
      const accion = accionDeEventoDeTeclado(e);
      if (!accion) return;
      e.preventDefault();

      if (accion === 'buscar') {
        setCmdOpen(true);
        return;
      }
      if (accion === 'refrescar') {
        // Lo recoge la barra, que es quien enseña el icono girando.
        window.dispatchEvent(new CustomEvent(EVENTO_REFRESCAR));
        return;
      }
      const destino = atajoDe(accion).href;
      if (destino) router.push(destino);
    };
    const abrirBuscador = () => setCmdOpen(true);

    // Sólo dentro del programa. En el login o en la web pública no hay
    // panel ni facturas donde ir: pulsar «n» ahí llevaba a una ruta
    // privada y rebotaba de vuelta al login.
    if (isPublic) return;

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener(EVENTO_BUSCAR, abrirBuscador);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener(EVENTO_BUSCAR, abrirBuscador);
    };
  }, [isPublic, router]);

  if (isPublic) {
    return <main>{children}</main>;
  }

  // Los efectos de arriba (sincronización, tema, datos iniciales) ya se han
  // ejecutado: el TPV los necesita igual que el resto de la aplicación. Lo
  // único que cambia es que no se envuelve en el armazón del panel.
  //
  // Tampoco se monta aquí ToastContainer: la página del TPV ya monta el suyo
  // sobre el mismo contexto, y con los dos salían los avisos duplicados.
  if (isFullScreen) {
    return (
      <>
        {sinAcceso ? <SinAcceso perfil={sinAcceso} /> : children}
        <ControlPerfiles />
      </>
    );
  }

  return (
    <div className={`app-layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => {
          setSidebarOpen(false);
          menuButtonRef.current?.focus();
        }}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebarCollapsed}
      />
      <div className="app-main">
        <NetworkStatusBar />
        <Header onMenuClick={() => setSidebarOpen(true)} onSearchClick={() => setCmdOpen(true)} menuButtonRef={menuButtonRef} />
        <main className="app-content animate-fade-in">
          {sinAcceso ? <SinAcceso perfil={sinAcceso} /> : children}
        </main>
      </div>
      <MobileNav />
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <CommandPalette isOpen={cmdOpen} onClose={() => setCmdOpen(false)} />
      <ControlPerfiles />
      <ManagementBar />
      {showOnboarding && settingsForOnboarding && (
        <OnboardingModal
          settings={settingsForOnboarding}
          onComplete={() => setShowOnboarding(false)}
        />
      )}
    </div>
  );
}
