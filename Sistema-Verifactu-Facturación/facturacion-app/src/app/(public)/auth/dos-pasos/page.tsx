'use client';

/**
 * VERIFICACIÓN EN DOS PASOS: EL CÓDIGO AL ENTRAR
 *
 * Se llega aquí (lo manda el proxy) cuando la cuenta tiene activada la
 * verificación en dos pasos y la sesión sólo ha pasado la contraseña.
 * Con el código de 6 cifras de la app de autenticación la sesión sube a
 * aal2 y ya puede ver sus datos (la base de datos no se los da antes).
 */

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { isSafeRedirectPath } from '@/lib/security';

function Formulario() {
  const params = useSearchParams();
  const destino = (() => {
    const n = params.get('next');
    return n && isSafeRedirectPath(n) ? n : '/dashboard';
  })();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { window.location.replace('/login'); return; }
      const { data } = await supabase.auth.mfa.listFactors();
      const factor = (data?.totp as { id: string; status: string }[] | undefined)?.find(f => f.status === 'verified');
      // Sin segundo factor no hay nada que pedir.
      if (!factor) { window.location.replace(destino); return; }
      if (vivo) { setFactorId(factor.id); setTimeout(() => campo.current?.focus(), 50); }
    })();
    return () => { vivo = false; };
  }, [destino]);

  const verificar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factorId) return;
    setEnviando(true);
    setError('');
    const { error: fallo } = await createClient().auth.mfa.challengeAndVerify({ factorId, code: codigo.replace(/\s/g, '') });
    if (fallo) {
      setError('Código incorrecto o caducado. Espera al siguiente y vuelve a probar.');
      setCodigo('');
      setEnviando(false);
      campo.current?.focus();
      return;
    }
    // Navegación completa: el proxy tiene que ver la sesión nueva.
    window.location.replace(destino);
  };

  const otraCuenta = async () => {
    await createClient().auth.signOut({ scope: 'local' }).catch(() => {});
    window.location.replace('/login');
  };

  return (
    <div className="login-card">
      <div className="login-header">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/klima-mark.svg" alt="KlimaFacturas" className="login-logo" width={56} height={56} />
        <h1 className="login-title">Verificación en <em className="accent-serif">dos pasos</em></h1>
        <p className="login-subtitle">Escribe el código de 6 cifras que te muestra tu app de autenticación.</p>
      </div>
      <form onSubmit={verificar} className="login-form">
        <div className="form-group">
          <label className="form-label" htmlFor="codigo-dos-pasos">Código</label>
          <div className="field-affix has-prefix">
            <span className="field-affix-prefix"><ShieldCheck size={16} /></span>
            <input
              ref={campo}
              id="codigo-dos-pasos"
              className="form-input dos-pasos-codigo"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]{6,7}"
              maxLength={7}
              placeholder="123 456"
              value={codigo}
              onChange={e => setCodigo(e.target.value.replace(/[^\d ]/g, ''))}
              required
              disabled={!factorId}
            />
          </div>
        </div>
        {error && <div className="login-alert login-alert--error" role="alert">{error}</div>}
        <button className="btn btn-primary btn-lg login-submit" disabled={enviando || !factorId || codigo.replace(/\s/g, '').length !== 6}>
          {enviando || !factorId ? <Loader2 size={16} className="spin" /> : null} Entrar
        </button>
      </form>
      <div className="login-toggle">
        <button type="button" className="login-toggle-btn" onClick={() => void otraCuenta()}>Entrar con otra cuenta</button>
      </div>
      <p className="dos-pasos-ayuda">
        ¿Has perdido el móvil con la app? Escríbenos a <a href="mailto:administrador@klimafacturas.com">administrador@klimafacturas.com</a> desde
        el correo de tu cuenta y te ayudamos a recuperar el acceso.
      </p>
    </div>
  );
}

export default function DosPasosPage() {
  return (
    <div className="login-page">
      <div className="login-bg-glow login-bg-glow--1" />
      <div className="login-bg-glow login-bg-glow--2" />
      <div className="login-bg-grid" />
      <Suspense fallback={null}>
        <Formulario />
      </Suspense>
    </div>
  );
}
