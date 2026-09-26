'use client';

import { useState, useEffect, useRef, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { User, Settings, LogOut, ChevronDown, Save, X, Shield, Crown, Zap, Lock, Heart, ChevronRight, Moon, Sun, Users, UsersRound } from 'lucide-react';
import { guardarTema, leerTemaEfectivo, leerTemaEnServidor, suscribirseAlTema } from '@/lib/tema';
import { cerrarPerfil, pedirCambioDePerfil, usePerfiles } from '@/lib/perfilesCliente';
import { iniciales as inicialesPerfil, nombreRol } from '@/lib/perfiles';
import { createClient } from '@/lib/supabase/client';
import { getUserProfile, saveUserProfile } from '@/lib/storage';
import { soltarPerfilYPantallas, subirPendientesOPreguntar, vaciarCache } from '@/lib/cuentas/soltarCuenta';
import { EmpresasEnMenu, GestionEmpresas, cambiarDeEmpresa, useEmpresas } from '@/components/empresas/Empresas';
import { UserProfile } from '@/lib/types';

function initialsFrom(name: string, email: string): string {
  const source = name.trim() || email.trim();
  if (!source) return '?';
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export interface PlanDeCuenta {
  nombre: string;
  id: string;
  activo: boolean;
}

/**
 * El menú de la cuenta. En el móvil recoge además el plan y el «Tip», que
 * en la cabecera del ordenador van sueltos pero en el móvil no caben.
 */
export default function AccountMenu({ plan, onTip }: { plan?: PlanDeCuenta; onTip?: () => void } = {}) {
  const temaActual = useSyncExternalStore(suscribirseAlTema, leerTemaEfectivo, leerTemaEnServidor);
  // Perfil de trabajo: su avatar en el botón, y los ajustes y el plan sólo
  // para el titular (o para todos si la cuenta no usa perfiles).
  const { activo: perfilActivo, cuenta: cuentaPerfiles } = usePerfiles();
  const esTitular = !perfilActivo || perfilActivo.rol === 'titular';
  const [open, setOpen] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const [editing, setEditing] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [email, setEmail] = useState('');
  const [nameDraft, setNameDraft] = useState('');
  const [avatarDraft, setAvatarDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [esAdmin, setEsAdmin] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  // Varias empresas: con más de una, la cabecera dice en cuál se está.
  const { empresas, setEmpresas } = useEmpresas();
  const empresaActual = empresas && empresas.length > 1 ? empresas.find(e => e.actual) ?? null : null;
  const [cambiando, setCambiando] = useState<string | null>(null);
  const [gestionando, setGestionando] = useState(false);
  const perfilParaSalir = { activo: Boolean(perfilActivo), cuenta: cuentaPerfiles };
  const cambiarA = async (id: string) => {
    setCambiando(id);
    try {
      if (!(await cambiarDeEmpresa(id, perfilParaSalir))) setCambiando(null);
    } catch (e) {
      setCambiando(null);
      alert(e instanceof Error ? e.message : 'No se ha podido cambiar de empresa.');
    }
  };
  const formSalir = useRef<HTMLFormElement>(null);

  /**
   * Cierra la sesión de verdad: en el navegador y en el servidor.
   *
   * El orden importa. Primero se tira la sesión del cliente y se vacía la
   * caché sin conexión —si no, quien entre después con otra cuenta se
   * encuentra las facturas de la anterior en IndexedDB—, y sólo entonces se
   * envía el formulario a `/auth/signout`, que borra la cookie del servidor y
   * redirige a /login con una navegación completa.
   */
  const cerrarSesion = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (cerrando) return;
    setCerrando(true);
    // `currentTarget` se vacía en cuanto este manejador cede el control, así
    // que el formulario se coge de la ref, que sí sobrevive al await.
    const formulario = formSalir.current;

    if (!(await subirPendientesOPreguntar('sales'))) { setCerrando(false); return; }
    await soltarPerfilYPantallas(Boolean(perfilActivo), cuentaPerfiles);
    try {
      await createClient().auth.signOut();
    } catch {
      // Sin conexión no se puede avisar a Supabase; se sigue igualmente,
      // porque lo que no puede pasar es que el botón no haga nada.
    }
    await vaciarCache();
    if (formulario) formulario.submit();
    else window.location.href = '/auth/signout';
  };

  useEffect(() => {
    (async () => {
      const [p, { data }, esAdminRes] = await Promise.all([
        getUserProfile(),
        createClient().auth.getUser(),
        createClient().rpc('soy_admin'),
      ]);
      setProfile(p);
      setEmail(data?.user?.email || '');
      setNameDraft(p?.displayName || '');
      setAvatarDraft(p?.avatarUrl || '');
      setEsAdmin(esAdminRes.data === true);
    })();
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setEditing(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); setEditing(false); }
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const displayName = profile?.displayName || '';
  const initials = initialsFrom(displayName, email);

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      await saveUserProfile({
        displayName: nameDraft.trim(),
        avatarUrl: avatarDraft.trim(),
        onboardingCompleted: profile?.onboardingCompleted ?? true,
      });
      setProfile(prev => ({
        id: prev?.id || '',
        createdAt: prev?.createdAt || new Date().toISOString(),
        onboardingCompleted: prev?.onboardingCompleted ?? true,
        displayName: nameDraft.trim(),
        avatarUrl: avatarDraft.trim(),
      }));
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="account-menu" ref={menuRef}>
      <button
        className={`account-trigger ${open ? 'open' : ''}`}
        onClick={() => setOpen(v => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {/* Con perfiles de trabajo, el avatar es el de quien trabaja ahora. */}
        {/* En el móvil no cabe el chip del perfil: el avatar pasa a ser el
            de quien trabaja. En escritorio el chip ya lo dice y aquí sigue
            el de la cuenta, para no repetir las mismas iniciales dos veces. */}
        {perfilActivo && (
          <span className="account-avatar account-avatar--perfil" style={{ background: perfilActivo.color }} title={`Trabajando: ${perfilActivo.nombre}`}>
            {inicialesPerfil(perfilActivo.nombre)}
          </span>
        )}
        <span className={`account-avatar ${perfilActivo ? 'account-avatar--cuenta' : ''}`}>
          {profile?.avatarUrl ? <img src={profile.avatarUrl} alt="" /> : initials}
        </span>
        {empresaActual
          ? <span className="account-trigger-name" title={`Empresa: ${empresaActual.nombre}`}>{empresaActual.nombre}</span>
          : displayName && <span className="account-trigger-name">{displayName}</span>}
        <ChevronDown size={14} className="account-trigger-flecha" style={{ color: 'var(--text-muted)' }} />
      </button>

      {open && (
        <div className="account-dropdown" role="menu">
          <div className="account-dropdown-header">
            <span className="account-avatar lg">
              {profile?.avatarUrl ? <img src={profile.avatarUrl} alt="" /> : initials}
            </span>
            <div className="account-dropdown-identity">
              <div className="account-dropdown-name">{displayName || 'Sin nombre configurado'}</div>
              <div className="account-dropdown-email">{empresaActual ? empresaActual.nombre : email}</div>
            </div>
          </div>

          {editing ? (
            <div className="account-profile-form">
              <div className="form-group">
                <label className="form-label">Nombre para mostrar</label>
                <input
                  className="form-input"
                  type="text"
                  value={nameDraft}
                  onChange={e => setNameDraft(e.target.value)}
                  placeholder="Tu nombre"
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="form-label">URL de foto de perfil</label>
                <input
                  className="form-input"
                  type="url"
                  value={avatarDraft}
                  onChange={e => setAvatarDraft(e.target.value)}
                  placeholder="https://..."
                />
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={handleSaveProfile} disabled={saving}>
                  <Save size={14} /> {saving ? 'Guardando…' : 'Guardar'}
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setEditing(false)} disabled={saving}>
                  <X size={14} />
                </button>
              </div>
            </div>
          ) : (
            <div className="account-dropdown-body">
              {perfilActivo && (
                <div className="account-dropdown-perfil">
                  <span className="account-avatar" style={{ background: perfilActivo.color }}>{inicialesPerfil(perfilActivo.nombre)}</span>
                  <span className="account-dropdown-perfil-texto">
                    <small>Trabajando ahora</small>
                    <strong>{perfilActivo.nombre} · {nombreRol(perfilActivo.rol)}</strong>
                  </span>
                </div>
              )}
              {perfilActivo && (
                <>
                  <button className="account-dropdown-item" onClick={() => { setOpen(false); pedirCambioDePerfil(); }}>
                    <Users size={16} /> Cambiar de perfil
                  </button>
                  <button className="account-dropdown-item" onClick={() => { setOpen(false); cerrarPerfil(); }}>
                    <Lock size={16} /> Cerrar mi perfil
                  </button>
                  <div className="account-dropdown-divider" />
                </>
              )}
              {esTitular && (
                <EmpresasEnMenu
                  empresas={empresas}
                  cambiando={cambiando}
                  onCambiar={id => void cambiarA(id)}
                  onGestionar={() => { setOpen(false); setGestionando(true); }}
                />
              )}
              {plan && esTitular && (
                <Link
                  href="/precios"
                  className={`account-dropdown-plan ${!plan.activo ? 'is-inactivo' : plan.id === 'sin_limite' ? 'is-top' : ''}`}
                  onClick={() => setOpen(false)}
                >
                  <span className="account-dropdown-plan-icono">
                    {!plan.activo ? <Lock size={15} /> : plan.id === 'sin_limite' ? <Zap size={15} /> : <Crown size={15} />}
                  </span>
                  <span className="account-dropdown-plan-texto">
                    <small>Tu plan</small>
                    <strong>{plan.nombre}</strong>
                  </span>
                  <span className="account-dropdown-plan-accion">
                    {plan.activo ? 'Cambiar' : 'Activar'} <ChevronRight size={14} />
                  </span>
                </Link>
              )}
              <button className="account-dropdown-item" onClick={() => setEditing(true)}>
                <User size={16} /> Editar perfil
              </button>
              {esAdmin && esTitular && (
                <Link href="/admin" className="account-dropdown-item" onClick={() => setOpen(false)}>
                  <Shield size={16} /> Administración
                </Link>
              )}
              {esTitular && (
                <Link href="/equipo" className="account-dropdown-item" onClick={() => setOpen(false)}>
                  <UsersRound size={16} /> Equipo y sesiones
                </Link>
              )}
              {esTitular && (
                <Link href="/ajustes" className="account-dropdown-item" onClick={() => setOpen(false)}>
                  <Settings size={16} /> Ajustes de la empresa
                </Link>
              )}
              {/* En el móvil el interruptor de tema sale de la cabecera para
                  dejarle sitio al título de la pantalla, y vive aquí. */}
              <button
                className="account-dropdown-item account-dropdown-solo-movil"
                onClick={() => guardarTema(temaActual === 'oscuro' ? 'claro' : 'oscuro')}
              >
                {temaActual === 'oscuro' ? <Sun size={16} /> : <Moon size={16} />}
                {temaActual === 'oscuro' ? 'Modo claro' : 'Modo oscuro'}
              </button>
              {onTip && (
                <button
                  className="account-dropdown-item account-dropdown-solo-movil"
                  onClick={() => { setOpen(false); onTip(); }}
                >
                  <Heart size={16} style={{ color: '#e11d48' }} /> Invitar a un café
                </button>
              )}
              <div className="account-dropdown-divider" />
              {/*
                POR QUÉ ESTO NO ERA UN `onSubmit` NORMAL

                Lo era, y por eso no funcionaba. El manejador hacía
                `await clearOfflineCache()` y después `e.currentTarget.submit()`,
                pero React vacía `currentTarget` en cuanto el manejador
                devuelve el control —y un `await` lo devuelve—: al volver del
                await valía `null`, la llamada reventaba dentro de una promesa
                sin `catch` y el botón se quedaba sin hacer absolutamente nada.

                Ahora el formulario se guarda en una `ref`, que sobrevive al
                await. Y se cierra sesión también en el navegador antes de
                enviarlo: la sesión vive en las cookies que escribe
                `createBrowserClient`, así que limpiar sólo la del servidor
                dejaba al cliente creyendo que seguía dentro.
              */}
              <form ref={formSalir} action="/auth/signout" method="post" onSubmit={cerrarSesion}>
                <button
                  type="submit"
                  className="account-dropdown-item danger"
                  style={{ width: '100%' }}
                  disabled={cerrando}
                >
                  <LogOut size={16} /> {cerrando ? 'Cerrando sesión…' : 'Cerrar sesión'}
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {gestionando && empresas && (
        <GestionEmpresas
          empresas={empresas}
          perfil={perfilParaSalir}
          onCerrar={() => setGestionando(false)}
          onCambio={setEmpresas}
        />
      )}
    </div>
  );
}
