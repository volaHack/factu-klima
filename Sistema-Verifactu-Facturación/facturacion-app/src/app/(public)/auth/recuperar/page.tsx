'use client';

/**
 * «HE OLVIDADO MI CONTRASEÑA»
 *
 * Se pide el correo y Supabase manda (a través de nuestro gancho y con
 * nuestra plantilla) un enlace para elegir una contraseña nueva.
 *
 * Siempre se contesta lo mismo, exista o no la cuenta: decir «ese correo
 * no está registrado» le serviría a cualquiera para averiguar quién es
 * cliente.
 */

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, Loader2, Mail, MailCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

/** Se llega aquí también desde un enlace caducado o ya usado. */
function AvisoCaducado() {
  if (!useSearchParams().has('caducado')) return null;
  return (
    <div className="login-alert login-alert--info" role="status">
      Ese enlace ya no vale: sirve una sola vez y durante 1 hora. Pide otro aquí.
    </div>
  );
}

export default function RecuperarPage() {
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState('');

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const correo = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
      setError('Escribe un correo válido.');
      return;
    }
    setEnviando(true);
    const { error: fallo } = await createClient().auth.resetPasswordForEmail(correo, {
      redirectTo: `${window.location.origin}/auth/nueva-contrasena`,
    });
    setEnviando(false);
    // Demasiadas peticiones seguidas: eso sí se dice, para que espere.
    if (fallo && /rate|seconds|too many/i.test(fallo.message)) {
      setError('Has pedido varios correos seguidos. Espera un minuto y vuelve a intentarlo.');
      return;
    }
    setEnviado(true);
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
          <h1 className="login-title">{enviado ? 'Revisa tu correo' : <>Recupera tu <em className="accent-serif">contraseña</em></>}</h1>
          <p className="login-subtitle">
            {enviado
              ? <>Si <strong>{email.trim().toLowerCase()}</strong> tiene cuenta en KlimaFacturas, te hemos mandado un enlace para elegir una contraseña nueva. Caduca en 1 hora.</>
              : 'Escribe el correo de tu cuenta y te mandamos un enlace para elegir una contraseña nueva.'}
          </p>
        </div>

        {!enviado && <Suspense fallback={null}><AvisoCaducado /></Suspense>}
        {enviado ? (
          <div className="login-alert login-alert--success" role="status">
            <MailCheck size={16} /> Mira también en «Correo no deseado» o «Promociones». Llega desde administrador@klimafacturas.com.
          </div>
        ) : (
          <form onSubmit={enviar} className="login-form">
            <div className="form-group">
              <label className="form-label" htmlFor="recuperar-email">Correo electrónico</label>
              <div className="field-affix has-prefix">
                <span className="field-affix-prefix"><Mail size={16} /></span>
                <input
                  id="recuperar-email"
                  className="form-input"
                  type="email"
                  autoComplete="email"
                  placeholder="tu@empresa.es"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
            </div>
            {error && <div className="login-alert login-alert--error" role="alert">{error}</div>}
            <button type="submit" className="btn btn-primary btn-lg" disabled={enviando}>
              {enviando ? <Loader2 size={18} className="spin" /> : <ArrowRight size={18} />}
              {enviando ? 'Enviando…' : 'Mandarme el enlace'}
            </button>
          </form>
        )}

        <div className="login-toggle">
          <Link href="/login" className="login-toggle-btn"><ArrowLeft size={14} /> Volver a entrar</Link>
        </div>
      </div>
    </div>
  );
}
