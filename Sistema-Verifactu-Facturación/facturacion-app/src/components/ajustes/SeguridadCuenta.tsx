'use client';

/**
 * AJUSTES → SEGURIDAD DE LA CUENTA
 *
 *   · Verificación en dos pasos: además de la contraseña, un código de 6
 *     cifras de una app de autenticación (Google Authenticator, Microsoft
 *     Authenticator, 1Password…). Con ella activada, la base de datos no da
 *     ni un dato a una sesión que sólo tenga la contraseña (migración 065).
 *
 *   · Cerrar sesión en los demás dispositivos: para un portátil o un móvil
 *     perdido o robado. Esos equipos salen y borran su copia local en
 *     cuanto vuelven a conectarse (lib/seguridad/sesionCliente.ts).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyRound, Loader2, LogOut, ShieldCheck, ShieldOff } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/hooks/useToast';

interface Factor { id: string; status: string; created_at?: string; friendly_name?: string }
type Alta = { factorId: string; qr: string; secreto: string };

export default function SeguridadCuenta() {
  const { success, error: avisarError } = useToast();
  const [factor, setFactor] = useState<Factor | null | undefined>(undefined);
  const [alta, setAlta] = useState<Alta | null>(null);
  const [codigo, setCodigo] = useState('');
  const [ocupado, setOcupado] = useState<'alta' | 'verificar' | 'quitar' | 'otros' | null>(null);
  const [confirmar, setConfirmar] = useState<'quitar' | 'otros' | null>(null);
  const [fallo, setFallo] = useState('');
  const campo = useRef<HTMLInputElement>(null);

  const leer = useCallback(async () => {
    const { data } = await createClient().auth.mfa.listFactors();
    return ((data?.totp ?? []) as Factor[]).find(f => f.status === 'verified') ?? null;
  }, []);

  useEffect(() => {
    let vivo = true;
    void leer().then(f => { if (vivo) setFactor(f); });
    return () => { vivo = false; };
  }, [leer]);

  const empezarAlta = async () => {
    setOcupado('alta');
    setFallo('');
    const supabase = createClient();
    // Un alta a medias de otro intento impide empezar otra: se borra.
    const { data } = await supabase.auth.mfa.listFactors();
    for (const f of ((data?.all ?? []) as Factor[]).filter(f => f.status === 'unverified')) {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data: nuevo, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: `KlimaFacturas ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
    });
    setOcupado(null);
    if (error || !nuevo) {
      avisarError('No se ha podido empezar', 'Vuelve a intentarlo en un momento.');
      return;
    }
    setAlta({ factorId: nuevo.id, qr: nuevo.totp.qr_code, secreto: nuevo.totp.secret });
    setCodigo('');
    setTimeout(() => campo.current?.focus(), 50);
  };

  const verificarAlta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!alta) return;
    setOcupado('verificar');
    setFallo('');
    const { error } = await createClient().auth.mfa.challengeAndVerify({ factorId: alta.factorId, code: codigo.replace(/\s/g, '') });
    setOcupado(null);
    if (error) {
      setFallo('Ese código no vale. Espera a que la app muestre el siguiente y escríbelo.');
      setCodigo('');
      campo.current?.focus();
      return;
    }
    setAlta(null);
    setFactor(await leer());
    success('Verificación en dos pasos activada', 'A partir de ahora, al entrar te pediremos también el código.');
  };

  const cancelarAlta = async () => {
    if (alta) await createClient().auth.mfa.unenroll({ factorId: alta.factorId }).catch(() => {});
    setAlta(null);
    setFallo('');
  };

  const quitar = async () => {
    if (!factor) return;
    setOcupado('quitar');
    const supabase = createClient();
    const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
    if (!error) await supabase.auth.refreshSession().catch(() => {});
    setOcupado(null);
    setConfirmar(null);
    // Quitarla exige haber puesto el código en esta sesión: si no, a ponerlo y de vuelta aquí.
    if (error && /aal2|insufficient_aal|AAL/i.test(`${error.code ?? ''} ${error.message}`)) {
      window.location.assign(`/auth/dos-pasos?next=${encodeURIComponent('/ajustes#seguridad')}`);
      return;
    }
    if (error) {
      avisarError('No se ha podido desactivar', 'Sal y vuelve a entrar con tu código, y prueba otra vez.');
      return;
    }
    setFactor(await leer());
    success('Verificación en dos pasos desactivada');
  };

  const cerrarOtros = async () => {
    setOcupado('otros');
    const { error } = await createClient().auth.signOut({ scope: 'others' });
    setOcupado(null);
    setConfirmar(null);
    if (error) {
      avisarError('No se ha podido cerrar', 'Comprueba la conexión y vuelve a intentarlo.');
      return;
    }
    success('Sesiones cerradas', 'Los demás equipos saldrán y borrarán su copia en cuanto se conecten. Este sigue dentro.');
  };

  return (
    <div className="seguridad-cuenta">
      {/* Verificación en dos pasos */}
      <div className="status-panel seguridad-fila">
        <span className="status-panel-icon">{factor ? <ShieldCheck size={19} /> : <KeyRound size={19} />}</span>
        <div className="status-panel-body">
          <div className="status-panel-title">
            Verificación en dos pasos{' '}
            {factor === undefined ? null : factor
              ? <span className="badge badge-pagada"><span className="badge-dot" /> Activada</span>
              : <span className="badge badge-borrador"><span className="badge-dot" /> Desactivada</span>}
          </div>
          <p className="seguridad-opcional">Es opcional: cada persona decide si la quiere. Se activa y se desactiva cuando quieras.</p>
          <p className="status-panel-text">
            Además de la contraseña, al entrar se pide un código de tu móvil. Si alguien consigue tu contraseña, sin tu
            móvil no puede ver ni una factura.
          </p>

          {alta ? (
            <form className="seguridad-alta" onSubmit={verificarAlta}>
              <ol className="seguridad-pasos">
                <li>Instala en tu móvil una app de autenticación: <strong>Google Authenticator</strong>, <strong>Microsoft Authenticator</strong> o la que uses.</li>
                <li>Escanea este código con la app (botón «+» o «Añadir cuenta»).</li>
                <li>Escribe aquí el código de 6 cifras que aparece.</li>
              </ol>
              <div className="seguridad-qr">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={alta.qr} alt="Código QR para la app de autenticación" width={176} height={176} />
                <p>¿No puedes escanearlo? Añade la cuenta a mano con esta clave:<br /><code>{alta.secreto}</code></p>
              </div>
              <label className="form-label" htmlFor="seguridad-codigo">Código de la app</label>
              <div className="seguridad-verificar">
                <input
                  ref={campo}
                  id="seguridad-codigo"
                  className="form-input dos-pasos-codigo"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={7}
                  placeholder="123 456"
                  value={codigo}
                  onChange={e => setCodigo(e.target.value.replace(/[^\d ]/g, ''))}
                />
                <button className="btn btn-primary" disabled={ocupado !== null || codigo.replace(/\s/g, '').length !== 6}>
                  {ocupado === 'verificar' ? <Loader2 size={15} className="spin" /> : <ShieldCheck size={15} />} Activar
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => void cancelarAlta()}>Cancelar</button>
              </div>
              {fallo && <p className="field-message is-error" role="alert">{fallo}</p>}
            </form>
          ) : factor ? (
            confirmar === 'quitar' ? (
              <div className="seguridad-confirmar" role="alert">
                <span>¿Seguro? Tu cuenta volverá a depender sólo de la contraseña.</span>
                <button type="button" className="btn btn-danger btn-sm" onClick={() => void quitar()} disabled={ocupado !== null}>
                  {ocupado === 'quitar' ? <Loader2 size={14} className="spin" /> : <ShieldOff size={14} />} Sí, desactivar
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmar(null)}>No</button>
              </div>
            ) : null
          ) : null}
        </div>
        <label className="toggle-switch seguridad-interruptor" aria-label="Verificación en dos pasos">
          <input
            type="checkbox"
            checked={!!factor || !!alta}
            disabled={factor === undefined || ocupado !== null}
            onChange={e => {
              if (e.target.checked) void empezarAlta();
              else if (alta) void cancelarAlta();
              else setConfirmar('quitar');
            }}
          />
          <span className="toggle-slider" />
        </label>
      </div>

      {/* Cerrar sesión en los demás dispositivos */}
      <div className="status-panel seguridad-fila">
        <span className="status-panel-icon"><LogOut size={19} /></span>
        <div className="status-panel-body">
          <div className="status-panel-title">Cerrar sesión en los demás dispositivos</div>
          <p className="status-panel-text">
            ¿Has perdido el móvil o te han robado el portátil? Ciérrales la sesión desde aquí: en cuanto se conecten,
            saldrán y borrarán la copia de tus datos que guardan. Este equipo sigue dentro.
          </p>
          {confirmar === 'otros' ? (
            <div className="seguridad-confirmar" role="alert">
              <span>Lo que se haya hecho sin conexión en esos equipos y aún no se haya subido, se perderá.</span>
              <button type="button" className="btn btn-danger btn-sm" onClick={() => void cerrarOtros()} disabled={ocupado !== null}>
                {ocupado === 'otros' ? <Loader2 size={14} className="spin" /> : <LogOut size={14} />} Cerrar las demás
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmar(null)}>Cancelar</button>
            </div>
          ) : (
            <button type="button" className="btn btn-secondary btn-sm seguridad-accion" onClick={() => setConfirmar('otros')}>
              <LogOut size={14} /> Cerrar sesión en los demás dispositivos
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
