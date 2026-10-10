'use client';

import { AlertTriangle, Loader2, RefreshCw, Unlink } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { estadoPermiso, ibanCorto } from '@/lib/banco/vista';
import type { ConexionVista } from './tipos';

export interface CuentasBancoProps {
  readonly conexiones: readonly ConexionVista[];
  readonly ocupado: string | null;
  readonly onRenovar: (c: ConexionVista) => void;
  readonly onDesconectar: (c: ConexionVista) => void;
}

const cuando = (iso: string | null) => (iso
  ? new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  : 'todavía no');

/** Una tarjeta por banco conectado, con sus cuentas y su saldo. */
export default function CuentasBanco({ conexiones, ocupado, onRenovar, onDesconectar }: CuentasBancoProps) {
  return (
    <div className="banco-conexiones">
      {conexiones.map(c => {
        const estado = estadoPermiso(c);
        return (
          <section key={c.id} className={`banco-conexion is-${estado.tono}`} aria-label={c.banco}>
            <header className="banco-conexion-cabecera">
              <div>
                <h3>{c.banco}</h3>
                <p>Última lectura: {cuando(c.ultimaLectura)}</p>
              </div>
              <span className={`banco-estado is-${estado.tono}`}>{estado.texto}</span>
            </header>

            {c.ultimoError && !c.caducada && (
              <p className="banco-conexion-error"><AlertTriangle size={14} /> La última lectura no fue bien del todo: se reintentará sola.</p>
            )}

            <ul className="banco-cuentas">
              {c.cuentas.map(cu => (
                <li key={cu.uid}>
                  <div className="banco-cuenta-nombre">
                    <strong>{cu.nombre || 'Cuenta'}</strong>
                    <span className="mono">{ibanCorto(cu.iban)}</span>
                  </div>
                  <div className="banco-cuenta-saldo">
                    {cu.saldo ? (
                      <>
                        <strong className={cu.saldo.importe < 0 ? 'is-negativo' : ''}>{formatCurrency(cu.saldo.importe)}</strong>
                        <span>{cu.saldo.fecha ? `a ${new Date(`${cu.saldo.fecha}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}` : 'saldo disponible'}</span>
                      </>
                    ) : <span>Sin saldo todavía</span>}
                  </div>
                </li>
              ))}
            </ul>

            <footer className="banco-conexion-pie">
              {(estado.tono !== 'ok') && (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => onRenovar(c)} disabled={ocupado !== null}>
                  <RefreshCw size={14} /> Renovar permiso
                </button>
              )}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onDesconectar(c)} disabled={ocupado !== null}>
                {ocupado === c.id ? <Loader2 size={14} className="spin" /> : <Unlink size={14} />} Desconectar
              </button>
            </footer>
          </section>
        );
      })}
    </div>
  );
}
