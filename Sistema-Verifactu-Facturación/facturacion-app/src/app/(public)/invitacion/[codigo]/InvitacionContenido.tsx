'use client';

/**
 * LA PÁGINA DEL ENLACE DE INVITACIÓN
 *
 * Lo que ve quien recibe el enlace antes de entrar: el logo de la empresa
 * que le invita, que no tiene que registrarse ni poner contraseña, hasta
 * cuándo vale y un botón. Al pulsarlo el servidor gasta el enlace y
 * devuelve un enlace mágico de la cuenta, que se canjea aquí mismo con la
 * misma función que el cambio de empresa (deja limpio lo que hubiera de
 * otra sesión).
 *
 * Todo entra en un solo movimiento, en este orden: la tarjeta, el logo
 * sobre su placa, el nombre, el texto, cada garantía y el botón (ver
 * `--paso` en formularios.css). Sólo opacidad y desplazamiento, nunca
 * escala sobre texto: Safari del iPhone lo deja borroso. Al entrar, la
 * tarjeta cambia a «Abriendo el panel…» en vez de quedarse esperando.
 */

import { useEffect, useState, type CSSProperties } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, CalendarClock, Check, KeyRound, Loader2, ShieldCheck, TriangleAlert } from 'lucide-react';
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

/** El orden de entrada de cada pieza. */
const paso = (n: number) => ({ '--paso': n } as CSSProperties);

export default function InvitacionContenido() {
  const { codigo } = useParams<{ codigo: string }>();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [logoRoto, setLogoRoto] = useState(false);
  const [entrando, setEntrando] = useState(false);
  const [abriendo, setAbriendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // La entrada encadenada se ve una vez: si se vuelve al formulario (falla
  // la entrada), todo aparece ya en su sitio.
  const [calmada, setCalmada] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/invitacion/${encodeURIComponent(codigo)}`, { cache: 'no-store' })
      .then(r => r.json().catch(() => ({ estado: 'no_existe' })))
      .then((d: Datos) => { if (vivo) setDatos(d.estado ? d : { estado: 'no_existe' }); })
      .catch(() => { if (vivo) setDatos({ estado: 'no_existe' }); });
    return () => { vivo = false; };
  }, [codigo]);

  useEffect(() => {
    if (!datos) return;
    const t = setTimeout(() => setCalmada(true), 2200);
    return () => clearTimeout(t);
  }, [datos]);

  const entrar = async () => {
    setEntrando(true);
    setError(null);
    try {
      const r = await fetch(`/api/invitacion/${encodeURIComponent(codigo)}`, { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.token) throw new Error(d.error || 'No se ha podido entrar. Prueba otra vez.');
      setAbriendo(true);
      const hecho = await entrarConToken(d.token, { activo: false, cuenta: null });
      if (!hecho) { setCalmada(true); setAbriendo(false); setEntrando(false); }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se ha podido entrar. Prueba otra vez.');
      setCalmada(true);
      setAbriendo(false);
      setEntrando(false);
    }
  };

  const empresa = datos?.empresa ?? '';
  const inicial = empresa.trim().charAt(0).toUpperCase() || 'K';
  const conLogo = !!datos?.logo && !logoRoto;
  const detalle = datos
    ? [datos.razonSocial && datos.razonSocial !== empresa ? datos.razonSocial : null, datos.ciudad].filter(Boolean).join(' · ')
    : '';

  return (
    <div className="login-page invitacion-pagina">
      <div className="login-aurora" aria-hidden="true" />
      <div className="login-bg-grid" />
      <div className="invitacion-destellos" aria-hidden="true"><i /><i /><i /></div>

      <main className="invitacion-escena">
        <div className={`invitacion-marco neon neon--lento${abriendo ? ' es-abriendo' : ''}`}>
          <div className={`invitacion-tarjeta${calmada ? ' es-calmada' : ''}`} aria-busy={!datos || abriendo}>
            {!datos ? (
              <div className="invitacion-cargando" role="status">
                <span className="invitacion-cargando-placa" aria-hidden="true" />
                <span className="invitacion-cargando-linea" aria-hidden="true" />
                <span className="invitacion-cargando-linea corta" aria-hidden="true" />
                <span className="sr-only">Abriendo la invitación…</span>
              </div>
            ) : datos.estado !== 'activa' ? (
              <div className="invitacion-aviso">
                <span className="invitacion-aviso-icono invitacion-entra" style={paso(0)}><TriangleAlert size={22} aria-hidden /></span>
                <h1 className="invitacion-titulo-pequeno invitacion-entra" style={paso(1)}>Este enlace ya no sirve</h1>
                <p className="invitacion-texto invitacion-entra" style={paso(2)}>{MOTIVO[datos.estado]}</p>
                <Link href="/login" className="btn btn-secondary invitacion-boton-secundario invitacion-entra" style={paso(3)}>Ir a la entrada</Link>
              </div>
            ) : abriendo ? (
              <div className="invitacion-abriendo" role="status">
                <span className="invitacion-abriendo-check"><Check size={26} aria-hidden /></span>
                <p className="invitacion-titulo-pequeno">Bienvenido a {empresa}</p>
                <p className="invitacion-texto">Abriendo el panel…</p>
                <span className="invitacion-abriendo-barra" aria-hidden="true"><i /></span>
              </div>
            ) : (
              <>
                <div className="invitacion-emblema invitacion-entra" style={paso(0)} aria-hidden="true">
                  <span className="invitacion-halo" />
                  <span className={`invitacion-placa${conLogo ? ' con-logo' : ''}`}>
                    {conLogo
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={datos.logo!} alt="" className="invitacion-logo" onError={() => setLogoRoto(true)} />
                      : <span className="invitacion-inicial">{inicial}</span>}
                    <span className="invitacion-brillo" />
                  </span>
                </div>

                <p className="invitacion-antetitulo invitacion-entra" style={paso(1)}>
                  {datos.para ? `${datos.para}, te han invitado a` : 'Te han invitado a'}
                </p>
                <h1 className="invitacion-titulo invitacion-entra" style={paso(2)}>{empresa}</h1>
                {detalle && <p className="invitacion-razon invitacion-entra" style={paso(3)}>{detalle}</p>}

                <p className="invitacion-texto invitacion-entra" style={paso(4)}>
                  Entra en su panel de facturación con el mismo acceso que la cuenta: facturas, clientes,
                  cobros y el día a día. <strong>Sin registrarte y sin contraseña.</strong>
                </p>

                <ul className="invitacion-garantias">
                  <li className="invitacion-entra" style={paso(5)}><span><KeyRound size={15} aria-hidden /></span> Enlace personal de un solo uso</li>
                  {datos.caduca && <li className="invitacion-entra" style={paso(6)}><span><CalendarClock size={15} aria-hidden /></span> Vale hasta el {caducaEnTexto(datos.caduca)}</li>}
                  <li className="invitacion-entra" style={paso(7)}><span><ShieldCheck size={15} aria-hidden /></span> Facturas selladas con Veri*Factu</li>
                </ul>

                <button type="button" className="btn btn-primary invitacion-boton invitacion-entra" style={paso(8)} onClick={entrar} disabled={entrando}>
                  {entrando
                    ? <><Loader2 size={18} className="animate-spin" aria-hidden /> Entrando…</>
                    : <>Entrar en {empresa} <ArrowRight size={18} aria-hidden /></>}
                </button>
                {error && <p className="invitacion-error" role="alert">{error}</p>}
                <p className="invitacion-pie invitacion-entra" style={paso(9)}>Al entrar, este dispositivo queda con la sesión abierta.</p>
              </>
            )}
          </div>
        </div>
        <p className="invitacion-marca">Klima Solutions · facturación Veri*Factu</p>
      </main>
    </div>
  );
}
