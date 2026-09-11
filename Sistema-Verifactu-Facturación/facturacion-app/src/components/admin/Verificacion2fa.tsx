'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

/**
 * Si ya hay un factor verificado, pide el código. Si no, da de alta uno
 * nuevo con su QR. Los factores a medio dar de alta de un intento anterior
 * se borran antes: si no, Supabase rechaza el alta nueva.
 */
export default function Verificacion2fa() {
  const router = useRouter();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secreto, setSecreto] = useState<string | null>(null);
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data, error: e } = await supabase.auth.mfa.listFactors();
      if (e) { setError(e.message); return; }
      const verificado = (data?.totp as any[])?.find(f => f.status === 'verified');
      if (verificado) { setFactorId(verificado.id); return; }

      for (const f of ((data?.all as any[]) || []).filter(f => f.status === 'unverified')) {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data: alta, error: eAlta } = await supabase.auth.mfa.enroll({
        factorType: 'totp', friendlyName: `Klima admin ${new Date().toISOString().slice(0, 10)}`,
      });
      if (eAlta) { setError(eAlta.message); return; }
      setFactorId(alta.id);
      setQr(alta.totp.qr_code);
      setSecreto(alta.totp.secret);
    })();
  }, []);

  const verificar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factorId) return;
    setEnviando(true);
    setError('');
    const { error: e2 } = await createClient().auth.mfa.challengeAndVerify({ factorId, code: codigo.trim() });
    if (e2) { setError('Código incorrecto o caducado. Prueba con el siguiente.'); setEnviando(false); return; }
    router.replace('/admin');
    router.refresh();
  };

  return (
    <div className="card" style={{ maxWidth: 420, margin: 'var(--space-8) auto' }}>
      <h1 className="card-title"><ShieldCheck size={18} /> Segundo factor</h1>
      {qr && (
        <>
          <p className="card-subtitle">Escanea el código con tu app de autenticación (Google Authenticator, 1Password…).</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="Código QR para la app de autenticación" width={200} height={200} />
          <p className="card-subtitle">¿No puedes escanearlo? Escribe esta clave: <code>{secreto}</code></p>
        </>
      )}
      <form onSubmit={verificar} className="form-group">
        <label className="form-label" htmlFor="codigo-2fa">Código de 6 cifras</label>
        <input id="codigo-2fa" className="form-input" inputMode="numeric" autoComplete="one-time-code"
          pattern="[0-9]{6}" maxLength={6} value={codigo} onChange={e => setCodigo(e.target.value)} required />
        {error && <p className="field-message is-error" role="alert">{error}</p>}
        <button className="btn btn-primary" disabled={enviando || !factorId}>
          {enviando ? <Loader2 size={16} className="spin" /> : null} Entrar al panel
        </button>
      </form>
    </div>
  );
}
