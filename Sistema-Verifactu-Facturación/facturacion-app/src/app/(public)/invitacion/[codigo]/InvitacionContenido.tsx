'use client';

/**
 * LA PÁGINA DEL ENLACE DE INVITACIÓN
 *
 * Lo que ve quien recibe el enlace antes de entrar: de qué empresa es, que
 * no tiene que registrarse ni poner contraseña, hasta cuándo vale y un
 * botón. Al pulsarlo el servidor gasta el enlace y devuelve un enlace
 * mágico de la cuenta, que se canjea aquí mismo con la misma función que
 * el cambio de empresa (deja limpio lo que hubiera de otra sesión).
 *
 * Mismo fondo que la entrada (aurora y rejilla), y la tarjeta con la luz
 * de neón en el marco.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, CalendarClock, KeyRound, Loader2, ShieldCheck, Sparkles, TriangleAlert } from 'lucide-react';
import { entrarConToken } from '@/components/empresas/Empresas';
import { caducaEnTexto, type EstadoInvitacion } from '@/lib/invitaciones';

interface Datos {
  estado: EstadoInvitacion | 'no_existe';
  empresa?: string;
  razonSocial?: string | null;
  ciudad?: string | null;
  logo?: string | null;
  para?: string | null;
  caduca?: string;
}

const MOTIVO: Record<Exclude<Datos['estado'], 'activa'>, string> = {
  usada: 'Este enlace ya se usó para entrar. Cada enlace sirve una sola vez: pide otro a quien te lo envió.',
  caducada: 'Este enlace ha caducado. Pide otro a quien te lo envió.',
  anulada: 'Quien te lo envió ha anulado este enlace.',
  no_existe: 'Este enlace no es válido. Comprueba que lo has copiado entero.',
};

export default function InvitacionContenido() {
  const { codigo } = useParams<{ codigo: string }>();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [entrando, setEntrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/invitacion/${encodeURIComponent(codigo)}`, { cache: 'no-store' })
      .then(r => r.json().catch(() => ({ estado: 'no_existe' })))
      .then((d: Datos) => { if (vivo) setDatos(d.estado ? d : { estado: 'no_existe' }); })
      .catch(() => { if (vivo) setDatos({ estado: 'no_existe' }); });
    return () => { vivo = false; };
  }, [codigo]);

  const entrar = async () => {
    setEntrando(true);
    setError(null);
    try {
      const r = await fetch(`/api/invitacion/${encodeURIComponent(codigo)}`, { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.token) throw new Error(d.error || 'No se ha podido entrar. Prueba otra vez.');
      const hecho = await entrarConToken(d.token, { activo: false, cuenta: null });
      if (!hecho) setEntrando(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se ha podido entrar. Prueba otra vez.');
      setEntrando(false);
    }
  };

  const empresa = datos?.empresa ?? '';
  const inicial = empresa.trim().charAt(0).toUpperCase() || 'K';

  return (
    <div className="login-page invitacion-pagina">
      <div className="login-aurora" aria-hidden="true" />
      <div className="login-bg-grid" />

      <main className="invitacion-escena">
        <div className="invitacion-marco neon neon--lento">
          <div className="invitacion-tarjeta" aria-busy={!datos}>
            {!datos ? (
              <div className="invitacion-cargando" role="status">
                <Loader2 size={22} className="animate-spin" aria-hidden />
                <span>Abriendo la invitación…</span>
              </div>
            ) : datos.estado !== 'activa' ? (
              <div className="invitacion-aviso">
                <span className="invitacion-aviso-icono"><TriangleAlert size={22} aria-hidden /></span>
                <h1 className="invitacion-titulo-pequeno">Este enlace ya no sirve</h1>
                <p className="invitacion-texto">{MOTIVO[datos.estado]}</p>
                <Link href="/login" className="btn btn-secondary invitacion-boton-secundario">Ir a la entrada</Link>
              </div>
            ) : (
              <>
                <div className="invitacion-sello" aria-hidden="true">
                  {datos.logo
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={datos.logo} alt="" className="invitacion-logo" />
                    : <span className="invitacion-inicial">{inicial}</span>}
                  <span className="invitacion-chispa"><Sparkles size={14} /></span>
                </div>

                <p className="invitacion-antetitulo">{datos.para ? `${datos.para}, te han invitado a` : 'Te han invitado a'}</p>
                <h1 className="invitacion-titulo">{empresa}</h1>
                {(datos.razonSocial && datos.razonSocial !== empresa) || datos.ciudad ? (
                  <p className="invitacion-razon">
                    {[datos.razonSocial !== empresa ? datos.razonSocial : null, datos.ciudad].filter(Boolean).join(' · ')}
                  </p>
                ) : null}

                <p className="invitacion-texto">
                  Entra en su panel de facturación con el mismo acceso que la cuenta: facturas, clientes,
                  cobros y el día a día. Sin registrarte y sin contraseña.
                </p>

                <ul className="invitacion-garantias">
                  <li><KeyRound size={15} aria-hidden /> Enlace personal de un solo uso</li>
                  {datos.caduca && <li><CalendarClock size={15} aria-hidden /> Vale hasta el {caducaEnTexto(datos.caduca)}</li>}
                  <li><ShieldCheck size={15} aria-hidden /> Facturas selladas con Veri*Factu</li>
                </ul>

                <button type="button" className="btn btn-primary invitacion-boton" onClick={entrar} disabled={entrando}>
                  {entrando
                    ? <><Loader2 size={18} className="animate-spin" aria-hidden /> Entrando…</>
                    : <>Entrar en {empresa} <ArrowRight size={18} aria-hidden /></>}
                </button>
                {error && <p className="invitacion-error" role="alert">{error}</p>}
                <p className="invitacion-pie">Al entrar, este dispositivo queda con la sesión abierta.</p>
              </>
            )}
          </div>
        </div>
        <p className="invitacion-marca">Klima Solutions · facturación Veri*Factu</p>
      </main>
    </div>
  );
}
