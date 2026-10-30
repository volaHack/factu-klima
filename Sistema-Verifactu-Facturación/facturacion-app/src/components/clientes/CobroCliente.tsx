'use client';

/**
 * Cómo paga un cliente y cuánto debe hoy, en dos tamaños:
 *
 *   · `LineaCobro`: una línea para la tarjeta del cliente elegido en un
 *     documento, que se lee sin dejar de facturar.
 *   · `TarjetaCobroCliente`: la ficha del cliente, con el semáforo, su
 *     perfil de pago y el botón para reclamar lo vencido.
 *
 * El semáforo nunca va solo con su color: lleva su nombre al lado.
 */

import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import type { Deudor, Remitente } from '@/lib/recordatorios/textos';
import {
  NOMBRE_SEMAFORO, TEXTO_TENDENCIA, type PerfilPago, type RiesgoCliente, type Tendencia,
} from '@/lib/perfilPago';
import ReclamarCobro, { type ContactoReclamar } from './ReclamarCobro';

const ICONO_TENDENCIA: Record<Tendencia, typeof TrendingUp> = { mejora: TrendingUp, empeora: TrendingDown, estable: Minus };

export function Semaforo({ riesgo }: { riesgo: RiesgoCliente }) {
  return (
    <span className={`semaforo is-${riesgo.semaforo}`}>
      <span className="semaforo-luz" aria-hidden="true" />
      {NOMBRE_SEMAFORO[riesgo.semaforo]}
    </span>
  );
}

function TendenciaPago({ perfil }: { perfil: PerfilPago }) {
  if (!perfil.tendencia) return null;
  const Icono = ICONO_TENDENCIA[perfil.tendencia];
  return (
    <span className={`perfil-tendencia is-${perfil.tendencia}`} title={`Últimos 6 meses: ${perfil.diasRecientes} días · antes: ${perfil.diasAntes} días`}>
      <Icono size={13} aria-hidden /> {TEXTO_TENDENCIA[perfil.tendencia]}
    </span>
  );
}

/** Una línea: semáforo, lo que debe y cómo suele pagar. */
export function LineaCobro({ riesgo, perfil }: { riesgo: RiesgoCliente; perfil: PerfilPago | null }) {
  return (
    <div className={`linea-cobro is-${riesgo.semaforo}`}>
      <Semaforo riesgo={riesgo} />
      <span className="linea-cobro-texto">{riesgo.texto}</span>
      {perfil && <span className="linea-cobro-perfil">{perfil.etiqueta}</span>}
      {perfil?.tendencia === 'empeora' && <TendenciaPago perfil={perfil} />}
    </div>
  );
}

export function TarjetaCobroCliente({ riesgo, perfil, deudor, contacto, remitente }: {
  riesgo: RiesgoCliente;
  perfil: PerfilPago | null;
  deudor: Deudor | null;
  contacto: ContactoReclamar;
  remitente: Remitente;
}) {
  return (
    <section className={`tarjeta-cobro is-${riesgo.semaforo}`} aria-labelledby="tarjeta-cobro-titulo">
      <div className="tarjeta-cobro-cabeza">
        <h2 id="tarjeta-cobro-titulo" className="tarjeta-cobro-titulo">Cobros de este cliente</h2>
        <Semaforo riesgo={riesgo} />
      </div>
      <p className="tarjeta-cobro-deuda">{riesgo.texto}</p>

      {perfil ? (
        <dl className="tarjeta-cobro-perfil">
          <div><dt>Paga de media a</dt><dd>{perfil.diasMedios} días</dd></div>
          <div><dt>En plazo</dt><dd>{perfil.puntualidad} %</dd></div>
          <div><dt>Retraso típico</dt><dd>{perfil.retrasoMedio ? `${perfil.retrasoMedio} días` : 'Ninguno'}</dd></div>
          <div><dt>Medido en</dt><dd>{perfil.cobradas} {perfil.cobradas === 1 ? 'cobro' : 'cobros'}</dd></div>
        </dl>
      ) : (
        <p className="tarjeta-cobro-nota">Aún no ha pagado ninguna factura: cuando lo haga, aquí verás cómo suele pagar.</p>
      )}
      {perfil && !perfil.fiable && <p className="tarjeta-cobro-nota">Con tan pocos cobros es un indicio, no una costumbre.</p>}
      {perfil && <TendenciaPago perfil={perfil} />}

      {deudor && (
        <div className="tarjeta-cobro-acciones">
          <ReclamarCobro deudor={deudor} contacto={contacto} remitente={remitente} etiqueta="Reclamar lo vencido" className="btn btn-primary btn-sm" />
        </div>
      )}
    </section>
  );
}
