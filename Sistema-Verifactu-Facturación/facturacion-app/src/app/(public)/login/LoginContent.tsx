'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Mail, Lock, Eye, EyeOff, ArrowRight, ShieldCheck, Loader2, RefreshCw } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { isSafeRedirectPath } from '@/lib/security';

export default function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // En el instalador TPV (electron expone window.klimaDesktop.mode) el
  // cajero entra siempre al terminal, nunca al dashboard: el propio
  // cliente de escritorio además bloquea cualquier otra ruta.
  const isTpvKiosk = typeof window !== 'undefined' &&
    (window as { klimaDesktop?: { mode?: string } }).klimaDesktop?.mode === 'tpv';
  const rawNext = searchParams.get('next');
  const next = isTpvKiosk ? '/tpv' : isSafeRedirectPath(rawNext) ? rawNext : '/dashboard';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [desktopState, setDesktopState] = useState<string | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  // preload.js expone window.klimaDesktop solo dentro de la app de
  // escritorio (ver electron/preload.js). Con este flag el login con
  // Google deja de depender de enlaces del sistema operativo (klima://)
  // y pasa a detectar la sesión por polling (ver pollDesktopSession).
  const isDesktop = typeof window !== 'undefined' && Boolean((window as { klimaDesktop?: unknown }).klimaDesktop);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, []);

  // El "state" es la clave de un solo uso que une el login que el usuario
  // hace en el navegador del sistema con la ventana de Electron: va en el
  // redirectTo del OAuth y la app lo usa después para recoger la sesión.
  function makeDesktopState(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
    }
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  async function pollDesktopSession(state: string, attempt = 0) {
    if (!mountedRef.current) return;
    // ~5 minutos (200 intentos × 1,5 s) antes de rendirse.
    if (attempt >= 200) {
      setError('No se detectó el inicio de sesión. Completa el acceso en el navegador y pulsa "Ya inicié sesión", o vuelve a intentarlo.');
      setGoogleLoading(false);
      setDesktopState(null);
      return;
    }

    let row: { code?: string } | undefined;
    try {
      const { data, error } = await createClient().rpc('complete_desktop_login', { p_state: state });
      if (!error && Array.isArray(data) && data[0]) row = data[0];
    } catch {
      // Fallo de red puntual: se reintenta en la siguiente iteración.
    }

    if (row?.code) {
      // El verifier PKCE del signInWithOAuth vive en las cookies de esta
      // ventana de Electron, así que el exchange del code tiene que hacerse
      // aquí (el servidor no puede: nunca tiene ese verifier).
      const { error: sessionError } = await createClient().auth.exchangeCodeForSession(row.code);
      if (sessionError) {
        if (mountedRef.current) {
          setError('La sesión se detectó pero no se pudo confirmar. Vuelve a intentarlo.');
          setGoogleLoading(false);
          setDesktopState(null);
        }
        return;
      }
      if (mountedRef.current) {
        router.replace(next);
        router.refresh();
      }
      return;
    }

    if (mountedRef.current) {
      pollTimerRef.current = window.setTimeout(() => pollDesktopSession(state, attempt + 1), 1500);
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);

    const supabase = createClient();

    if (isLogin) {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message === 'Invalid login credentials'
          ? 'Email o contraseña incorrectos'
          : signInError.message);
        setLoading(false);
        return;
      }

      router.push(next);
      router.refresh();
    } else {
      if (password.length < 6) {
        setError('La contraseña debe tener al menos 6 caracteres');
        setLoading(false);
        return;
      }

      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (signUpError) {
        setError(signUpError.message);
        setLoading(false);
        return;
      }

      setSuccessMsg('Cuenta creada. Revisa tu correo para confirmar el registro.');
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setGoogleLoading(true);
    const supabase = createClient();

    const callbackUrl = new URL(`${window.location.origin}/auth/callback`);
    callbackUrl.searchParams.set('next', next);
    if (isDesktop) callbackUrl.searchParams.set('platform', 'desktop');
    // State de un solo uso que une el login del navegador con esta
    // ventana: la app lo usa para recoger la sesión por polling.
    const state = isDesktop ? makeDesktopState() : null;
    if (isDesktop && state) callbackUrl.searchParams.set('state', state);

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: callbackUrl.toString(),
      },
    });

    if (oauthError) {
      setError('Error al conectar con Google. Inténtalo de nuevo.');
      setGoogleLoading(false);
      return;
    }

    // En la web normal el navegador navega a Google y esta línea nunca
    // llega a ejecutarse. En Electron la navegación se abre en el
    // navegador del sistema (electron/main.js) y aquí empieza el polling.
    if (isDesktop && state) {
      setDesktopState(state);
      pollDesktopSession(state);
    }
  };

  return (
    <div className="login-page">
      <div className="login-bg-glow login-bg-glow--1" />
      <div className="login-bg-glow login-bg-glow--2" />
      <div className="login-bg-grid" />

      <div className="login-card">
        <div className="login-header">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/klima-mark.svg" alt="Klima Solutions" className="login-logo" width={56} height={56} />
          <h1 className="login-title">
            {isLogin ? (
              <>Bienvenida de <em className="accent-serif">nuevo</em></>
            ) : 'Empieza a facturar'}
          </h1>
          <p className="login-subtitle">
            {isLogin
              ? 'Entra para ver tus facturas, clientes y cobros pendientes.'
              : 'En dos minutos tendrás lista tu primera factura sellada.'}
          </p>
        </div>

        <button
          type="button"
          className="btn-google"
          onClick={handleGoogleLogin}
          disabled={googleLoading}
        >
          {googleLoading ? (
            <Loader2 size={18} className="spin" />
          ) : (
            <svg width="18" height="18" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
          )}
          <span>
            {googleLoading
              ? desktopState ? 'Esperando acceso en el navegador…' : 'Abriendo Google…'
              : 'Continuar con Google'}
          </span>
        </button>

        {desktopState && (
          <div className="login-alert login-alert--info" role="status">
            <p>Se ha abierto tu navegador para iniciar sesión con Google.</p>
            <p>Cuando termines, esta ventana entrará automáticamente.</p>
            <button
              type="button"
              className="login-alert-btn"
              onClick={() => pollDesktopSession(desktopState)}
            >
              <RefreshCw size={14} /> Ya inicié sesión
            </button>
          </div>
        )}

        <div className="login-divider">
          <span>o continúa con email</span>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label className="form-label" htmlFor="login-email">Correo electrónico</label>
            <div className="field-affix has-prefix">
              <span className="field-affix-prefix"><Mail size={16} /></span>
              <input
                id="login-email"
                className="form-input"
                type="email"
                autoComplete="email"
                placeholder="tu@empresa.es"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="login-password">Contraseña</label>
            <div className="field-affix has-prefix">
              <span className="field-affix-prefix"><Lock size={16} /></span>
              <input
                id="login-password"
                className="form-input"
                type={showPassword ? 'text' : 'password'}
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                placeholder={isLogin ? '••••••••' : 'Al menos 6 caracteres'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
              />
              <button
                type="button"
                className="field-affix-btn"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="login-alert login-alert--error" role="alert">
              {error}
            </div>
          )}

          {successMsg && (
            <div className="login-alert login-alert--success" role="status">
              {successMsg}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-lg"
            disabled={loading}
            style={{ width: '100%', justifyContent: 'center', marginTop: 'var(--space-2)' }}
          >
            {loading ? <Loader2 size={18} className="spin" /> : <ArrowRight size={18} />}
            {loading
              ? (isLogin ? 'Entrando…' : 'Creando tu cuenta…')
              : isLogin ? 'Entrar' : 'Crear cuenta'}
          </button>
        </form>

        <div className="login-toggle">
          {isLogin ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?'}{' '}
          <button
            onClick={() => { setIsLogin(!isLogin); setError(''); setSuccessMsg(''); }}
            className="login-toggle-btn"
          >
            {isLogin ? 'Crear una aquí' : 'Inicia sesión'}
          </button>
        </div>

        <div className="login-footer">
          <span className="verifactu-badge">
            <ShieldCheck size={12} /> Registros sellados · SHA-256
          </span>
        </div>
      </div>
    </div>
  );
}
