'use client';

/**
 * AJUSTES → SEGURIDAD → CAMBIAR LA CONTRASEÑA
 *
 * Con la sesión abierta, Supabase deja poner otra contraseña sin más. Por
 * eso aquí se pide antes la actual: un ordenador que se queda abierto en la
 * oficina no basta para quedarse con la cuenta.
 *
 * La actual se comprueba con una entrada aparte contra Supabase Auth (que
 * no toca la sesión de esta pestaña) y esa sesión de prueba se cierra en el
 * acto. Si el proyecto tiene activado el cambio «seguro», Supabase manda un
 * código al correo y se pide aquí mismo.
 */

import { useRef, useState } from 'react';
import { Eye, EyeOff, KeyRound, Loader2, Lock, MailCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/hooks/useToast';
import { LARGO_MINIMO, mensajeDeFallo, pideCodigoDelCorreo, problemaDeLaNueva, type FalloAuth } from '@/lib/seguridad/contrasena';

const URL_AUTH = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`;
const CLAVE_PUBLICA = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

/** ¿Es esta la contraseña de la cuenta? Sin tocar la sesión abierta. */
async function comprobarActual(correo: string, actual: string): Promise<FalloAuth | null> {
  const r = await fetch(`${URL_AUTH}/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: CLAVE_PUBLICA, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: correo, password: actual }),
  });
  const cuerpo = await r.json().catch(() => ({}));
  if (!r.ok) {
    return { code: cuerpo.error_code ?? cuerpo.code ?? 'invalid_credentials', message: cuerpo.msg ?? cuerpo.error_description, status: r.status };
  }
  // La sesión de prueba sobra: se cierra (sólo esa).
  if (cuerpo.access_token) {
    await fetch(`${URL_AUTH}/logout?scope=local`, {
      method: 'POST',
      headers: { apikey: CLAVE_PUBLICA, Authorization: `Bearer ${cuerpo.access_token}` },
    }).catch(() => {});
  }
  return null;
}

export default function CambiarContrasena() {
  const { success } = useToast();
  const [abierto, setAbierto] = useState(false);
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const [ver, setVer] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [esperandoCodigo, setEsperandoCodigo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [fallo, setFallo] = useState('');
  const primerCampo = useRef<HTMLInputElement>(null);

  const cerrar = () => {
    setAbierto(false);
    setActual(''); setNueva(''); setRepetida(''); setCodigo('');
    setEsperandoCodigo(false); setFallo(''); setVer(false);
  };

  const terminar = () => {
    cerrar();
    success('Contraseña cambiada', 'La próxima vez que entres, usa la nueva.');
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    const problema = problemaDeLaNueva(actual, nueva, repetida);
    if (problema) { setFallo(problema); return; }
    if (typeof navigator !== 'undefined' && !navigator.onLine) { setFallo(mensajeDeFallo({ message: 'network' })); return; }
    setGuardando(true);
    setFallo('');
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      const correo = data.user?.email;
      if (!correo) { setFallo('No se encuentra tu sesión. Sal y vuelve a entrar.'); return; }

      const malActual = await comprobarActual(correo, actual);
      if (malActual) { setFallo(mensajeDeFallo(malActual)); return; }

      const { error } = await supabase.auth.updateUser({ password: nueva, current_password: actual });
      if (error && pideCodigoDelCorreo(error)) {
        const { error: sinCodigo } = await supabase.auth.reauthenticate();
        if (sinCodigo) { setFallo(mensajeDeFallo(sinCodigo)); return; }
        setEsperandoCodigo(true);
        return;
      }
      if (error) { setFallo(mensajeDeFallo(error)); return; }
      terminar();
    } catch (err) {
      setFallo(mensajeDeFallo({ message: err instanceof Error ? err.message : String(err) }));
    } finally {
      setGuardando(false);
    }
  };

  const confirmarCodigo = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    setFallo('');
    try {
      const { error } = await createClient().auth.updateUser({ password: nueva, nonce: codigo.trim() });
      if (error) { setFallo(mensajeDeFallo(error)); return; }
      terminar();
    } catch (err) {
      setFallo(mensajeDeFallo({ message: err instanceof Error ? err.message : String(err) }));
    } finally {
      setGuardando(false);
    }
  };

  const campoClave = (id: string, valor: string, cambiar: (v: string) => void, autoComplete: string, extra?: { ref?: React.Ref<HTMLInputElement>; placeholder?: string; conOjo?: boolean }) => (
    <div className="field-affix has-prefix">
      <span className="field-affix-prefix"><Lock size={16} /></span>
      <input
        ref={extra?.ref}
        id={id}
        className="form-input"
        type={ver ? 'text' : 'password'}
        autoComplete={autoComplete}
        placeholder={extra?.placeholder}
        value={valor}
        onChange={e => cambiar(e.target.value)}
        disabled={guardando}
      />
      {extra?.conOjo && (
        <button type="button" className="field-affix-btn" onClick={() => setVer(v => !v)} aria-label={ver ? 'Ocultar contraseñas' : 'Ver contraseñas'}>
          {ver ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      )}
    </div>
  );

  return (
    <div className="status-panel seguridad-fila" id="contrasena">
      <span className="status-panel-icon"><KeyRound size={19} /></span>
      <div className="status-panel-body">
        <div className="status-panel-title">Contraseña</div>
        <p className="status-panel-text">
          La que usas para entrar. Es la de la cuenta: con ella entran también los demás perfiles de tu equipo.
        </p>

        {!abierto ? (
          <button
            type="button"
            className="btn btn-secondary btn-sm seguridad-accion"
            onClick={() => { setAbierto(true); setTimeout(() => primerCampo.current?.focus(), 50); }}
          >
            <KeyRound size={14} /> Cambiar contraseña
          </button>
        ) : esperandoCodigo ? (
          <form className="contrasena-form" onSubmit={confirmarCodigo}>
            <p className="contrasena-codigo-aviso">
              <MailCheck size={16} /> Por seguridad, te hemos mandado un código a tu correo. Escríbelo para terminar.
            </p>
            <div className="form-group">
              <label className="form-label" htmlFor="contrasena-codigo">Código del correo</label>
              <input
                id="contrasena-codigo"
                className="form-input dos-pasos-codigo"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={10}
                value={codigo}
                onChange={e => setCodigo(e.target.value.replace(/[^\d]/g, ''))}
                autoFocus
                disabled={guardando}
              />
            </div>
            {fallo && <p className="field-message is-error" role="alert">{fallo}</p>}
            <div className="contrasena-botones">
              <button className="btn btn-primary btn-sm" disabled={guardando || codigo.length < 6}>
                {guardando && <Loader2 size={14} className="spin" />} Confirmar
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={cerrar} disabled={guardando}>Cancelar</button>
            </div>
          </form>
        ) : (
          <form className="contrasena-form" onSubmit={guardar} noValidate>
            <div className="form-group">
              <label className="form-label" htmlFor="contrasena-actual">Contraseña actual</label>
              {campoClave('contrasena-actual', actual, setActual, 'current-password', { ref: primerCampo, conOjo: true })}
            </div>
            <div className="contrasena-nuevas">
              <div className="form-group">
                <label className="form-label" htmlFor="contrasena-nueva">Nueva</label>
                {campoClave('contrasena-nueva', nueva, setNueva, 'new-password', { placeholder: `Al menos ${LARGO_MINIMO} caracteres` })}
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="contrasena-repetida">Repite la nueva</label>
                {campoClave('contrasena-repetida', repetida, setRepetida, 'new-password')}
              </div>
            </div>
            {fallo && <p className="field-message is-error" role="alert">{fallo}</p>}
            <div className="contrasena-botones">
              <button className="btn btn-primary btn-sm" disabled={guardando}>
                {guardando && <Loader2 size={14} className="spin" />} {guardando ? 'Guardando…' : 'Guardar contraseña'}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={cerrar} disabled={guardando}>Cancelar</button>
            </div>
            <p className="contrasena-nota">
              Los demás equipos siguen dentro. Si crees que alguien conocía la anterior, ciérrales la sesión aquí abajo.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
