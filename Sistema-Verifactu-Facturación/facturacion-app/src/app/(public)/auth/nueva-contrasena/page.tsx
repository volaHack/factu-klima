'use client';

/**
 * ELEGIR UNA CONTRASEÑA NUEVA
 *
 * Se llega desde el enlace del correo de «he olvidado mi contraseña» (o de
 * una invitación). `/auth/confirm` ya ha canjeado el token y la sesión
 * está abierta: aquí sólo queda escribir la contraseña nueva.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2, Lock } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function NuevaContrasenaPage() {
  const router = useRouter();
  const [hayCuenta, setHayCuenta] = useState<boolean | null>(null);
  const [clave, setClave] = useState('');
  const [repetida, setRepetida] = useState('');
  const [ver, setVer] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const { data } = await createClient().auth.getUser();
      if (vivo) setHayCuenta(!!data.user);
    })();
    return () => { vivo = false; };
  }, []);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (clave.length < 8) { setError('Usa al menos 8 caracteres.'); return; }
    if (clave !== repetida) { setError('Las dos contraseñas no coinciden.'); return; }
    setGuardando(true);
    const { error: fallo } = await createClient().auth.updateUser({ password: clave });
    setGuardando(false);
    if (fallo) {
      setError(/same|different/i.test(fallo.message)
        ? 'La nueva contraseña tiene que ser distinta de la anterior.'
        : 'No se ha podido guardar. Vuelve a pedir el enlace e inténtalo otra vez.');
      return;
    }
    router.push('/dashboard?contrasena=cambiada');
    router.refresh();
  };

  return (
    <div className="login-page">
      <div className="login-bg-glow login-bg-glow--1" />
      <div className="login-bg-glow login-bg-glow--2" />
      <div className="login-bg-grid" />
      <div className="login-card">
        <div className="login-header">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/klima-mark.svg" alt="KlimaFacturas" className="login-logo" width={56} height={56} />
          <h1 className="login-title">Elige tu nueva contraseña</h1>
          <p className="login-subtitle">Tus facturas, clientes y ajustes siguen exactamente igual.</p>
        </div>

        {hayCuenta === false ? (
          <>
            <div className="login-alert login-alert--error" role="alert">
              El enlace ha caducado o ya se ha usado. Pide uno nuevo: sólo vale una vez y durante 1 hora.
            </div>
            <div className="login-toggle">
              <Link href="/auth/recuperar" className="login-toggle-btn">Pedir otro enlace</Link>
            </div>
          </>
        ) : (
          <form onSubmit={guardar} className="login-form">
            <div className="form-group">
              <label className="form-label" htmlFor="nueva-clave">Contraseña nueva</label>
              <div className="field-affix has-prefix">
                <span className="field-affix-prefix"><Lock size={16} /></span>
                <input id="nueva-clave" className="form-input" type={ver ? 'text' : 'password'} autoComplete="new-password"
                  placeholder="Al menos 8 caracteres" value={clave} onChange={(e) => setClave(e.target.value)} required autoFocus />
                <button type="button" className="field-affix-btn" onClick={() => setVer(v => !v)} aria-label={ver ? 'Ocultar' : 'Ver'}>
                  {ver ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="nueva-clave-2">Repítela</label>
              <div className="field-affix has-prefix">
                <span className="field-affix-prefix"><Lock size={16} /></span>
                <input id="nueva-clave-2" className="form-input" type={ver ? 'text' : 'password'} autoComplete="new-password"
                  value={repetida} onChange={(e) => setRepetida(e.target.value)} required />
              </div>
            </div>
            {error && <div className="login-alert login-alert--error" role="alert">{error}</div>}
            <button type="submit" className="btn btn-primary btn-lg" disabled={guardando || hayCuenta === null}>
              {guardando && <Loader2 size={18} className="spin" />}
              {guardando ? 'Guardando…' : 'Guardar y entrar'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
