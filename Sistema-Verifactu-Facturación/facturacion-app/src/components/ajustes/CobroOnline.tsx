'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Clock, CreditCard, ExternalLink, Loader2 } from 'lucide-react';

interface Estado {
  disponible: boolean;
  conectada: boolean;
  activos: boolean;
  datosEnviados: boolean;
}

/**
 * AJUSTES → COBRO ONLINE
 *
 * Activar que los clientes paguen las facturas con tarjeta desde el enlace
 * que les llega. El alta la hace Stripe (verifica la identidad del negocio
 * y su cuenta bancaria) y el dinero va directo al banco del negocio.
 */
export default function CobroOnline() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [fallo, setFallo] = useState('');

  useEffect(() => {
    let vivo = true;
    fetch('/api/cobros/estado').then(r => r.json()).then(d => { if (vivo) setEstado(d); }).catch(() => { if (vivo) setEstado(null); });
    return () => { vivo = false; };
  }, []);

  const ir = async (ruta: string) => {
    setOcupado(true);
    setFallo('');
    try {
      const r = await fetch(ruta, { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.url) throw new Error(d.error || 'No se ha podido abrir Stripe.');
      window.location.href = d.url;
    } catch (e) {
      setFallo(e instanceof Error ? e.message : 'No se ha podido abrir Stripe.');
      setOcupado(false);
    }
  };

  if (!estado) return <p className="equipo-nota">Mirando el estado del cobro online…</p>;
  if (!estado.disponible) return <p className="equipo-nota">El cobro online no está disponible ahora mismo.</p>;

  return (
    <div className="cobro-online">
      {estado.activos ? (
        <p className="cobro-online-estado is-activo"><CheckCircle2 size={18} /> Activo: tus clientes pueden pagar con tarjeta desde su enlace.</p>
      ) : estado.datosEnviados ? (
        <p className="cobro-online-estado"><Clock size={18} /> Stripe está revisando tus datos. Suele tardar unos minutos; a veces pide algún documento más.</p>
      ) : (
        <p className="equipo-nota" style={{ marginTop: 0 }}>
          Tus clientes pagan la factura con tarjeta, Apple Pay o Google Pay desde el enlace que les mandas, y la factura se marca cobrada sola.
          El dinero llega a tu cuenta bancaria. Stripe cobra su comisión por cada pago (con tarjetas europeas, desde el 1,5 % + 0,25 €);
          FactuKlima no se queda nada.
        </p>
      )}

      {fallo && <p className="equipo-error" role="alert">{fallo}</p>}

      <div className="cobro-online-acciones">
        {!estado.activos && (
          <button type="button" className="btn btn-primary" disabled={ocupado} onClick={() => void ir('/api/cobros/conectar')}>
            {ocupado ? <Loader2 size={16} className="spin" /> : <CreditCard size={16} />}
            {estado.conectada ? ' Terminar el alta en Stripe' : ' Activar el cobro con tarjeta'}
          </button>
        )}
        {estado.datosEnviados && (
          <button type="button" className="btn btn-secondary" disabled={ocupado} onClick={() => void ir('/api/cobros/panel')}>
            <ExternalLink size={16} /> Ver mis cobros en Stripe
          </button>
        )}
      </div>
      <p className="equipo-nota">
        Para mandar el enlace a un cliente: en Clientes, el icono del globo; o en la factura, «Enlace de pago».
      </p>
    </div>
  );
}
