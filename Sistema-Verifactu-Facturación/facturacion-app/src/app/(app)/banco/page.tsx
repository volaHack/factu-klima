'use client';

/**
 * BANCO
 *
 * Las cuentas de la empresa en sus bancos, dentro de la app: el saldo de
 * cada una, los movimientos que llegan solos cada mañana y cuáles quedan
 * por conciliar con facturas, pagos o gastos. Conectar es dar permiso en
 * la web del banco (PSD2); la app sólo puede leer.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Landmark, Loader2, Plus, RefreshCw } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import ConectarBanco from '@/components/banco/ConectarBanco';
import CuentasBanco from '@/components/banco/CuentasBanco';
import MovimientosBanco from '@/components/banco/MovimientosBanco';
import type { ConexionVista, EstadoBanco, MovimientoVista } from '@/components/banco/tipos';
import { useToast } from '@/hooks/useToast';
import { formatCurrency } from '@/lib/utils';
import { totalSaldos } from '@/lib/banco/vista';

const MENSAJES_VUELTA: Record<string, [ok: boolean, titulo: string, texto?: string]> = {
  conectado: [true, 'Banco conectado', 'Estamos trayendo los movimientos de los últimos 90 días. Tarda unos segundos.'],
  renovado: [true, 'Permiso renovado', 'Los movimientos vuelven a llegar solos cada mañana.'],
  cancelado: [false, 'No se ha conectado', 'Se canceló el permiso en la web del banco.'],
  otra_cuenta: [false, 'No se ha conectado', 'La conexión se empezó desde otra empresa o sesión. Hazla desde aquí, con tu sesión abierta.'],
  sin_sesion: [false, 'No se ha conectado', 'Al volver del banco no había sesión abierta. Entra y vuelve a intentarlo.'],
  error: [false, 'No se ha podido conectar el banco', 'Inténtalo otra vez en un momento.'],
};

export default function BancoPage() {
  const { success, error: toastError } = useToast();
  const [estado, setEstado] = useState<EstadoBanco | null>(null);
  const [movimientos, setMovimientos] = useState<MovimientoVista[]>([]);
  const [conectando, setConectando] = useState<{ banco?: string } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const e: EstadoBanco = await fetch('/api/banco').then(r => r.json()).catch(() => ({ disponible: false, conexiones: [], sinConciliar: 0 }));
    setEstado(e);
    if (e.disponible && e.conexiones.length) {
      const d = await fetch('/api/banco/movimientos').then(r => r.json()).catch(() => ({ movimientos: [] }));
      setMovimientos(d.movimientos ?? []);
    }
    return e;
  }, []);

  const avisarError = useCallback((titulo: string, texto?: string) => toastError(titulo, texto), [toastError]);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const e = await cargar();
      if (!vivo) return;
      const vuelta = new URLSearchParams(window.location.search).get('banco');
      if (vuelta) {
        const [ok, titulo, texto] = MENSAJES_VUELTA[vuelta] ?? MENSAJES_VUELTA.error;
        if (ok) success(titulo, texto); else toastError(titulo, texto);
        window.history.replaceState(null, '', window.location.pathname);
        // La primera lectura va por detrás: se vuelve a mirar en unos segundos.
        if (ok && e.disponible) setTimeout(() => { if (vivo) void cargar(); }, 6000);
      }
    })();
    return () => { vivo = false; };
  }, [cargar, success, toastError]);

  const sincronizar = async () => {
    setOcupado('sync');
    try {
      const r = await fetch('/api/banco/sincronizar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se ha podido sincronizar.');
      await cargar();
      if (d.caducadas) toastError('Hay que renovar el permiso', 'El permiso de algún banco ha caducado: pulsa «Renovar permiso».');
      else if (d.errores?.length) toastError('Algún banco no ha respondido', 'Lo demás se ha leído bien. Se reintentará solo.');
      else success(d.nuevos ? `${d.nuevos} movimientos nuevos` : 'Todo al día', d.nuevos ? 'Ya están abajo, listos para conciliar.' : 'No había movimientos nuevos.');
    } catch (e) {
      toastError('No se ha podido sincronizar', e instanceof Error ? e.message : '');
    } finally {
      setOcupado(null);
    }
  };

  const desconectar = async (c: ConexionVista) => {
    if (!confirm(`¿Desconectar ${c.banco}? Dejarán de llegar sus movimientos. Los que ya están se quedan.`)) return;
    setOcupado(c.id);
    try {
      const r = await fetch(`/api/banco?id=${encodeURIComponent(c.id)}`, { method: 'DELETE' });
      if (!r.ok) throw new Error((await r.json()).error);
      success('Banco desconectado');
      await cargar();
    } catch (e) {
      toastError('No se ha podido desconectar', e instanceof Error ? e.message : '');
    } finally {
      setOcupado(null);
    }
  };

  const apartar = async (m: MovimientoVista, si: boolean) => {
    setMovimientos(lista => lista.map(x => (x.id === m.id ? { ...x, ignorado: si } : x)));
    const r = await fetch('/api/banco/movimientos', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: m.id, ignorado: si }) });
    if (!r.ok) {
      setMovimientos(lista => lista.map(x => (x.id === m.id ? { ...x, ignorado: !si } : x)));
      toastError('No se ha podido guardar');
    }
  };

  if (!estado) return <PageSkeleton label="Cargando el banco" />;

  const conexiones = estado.conexiones;
  const hayBanco = conexiones.length > 0;
  const total = totalSaldos(conexiones);
  const conSaldo = conexiones.some(c => !c.caducada && c.cuentas.some(cu => cu.saldo));

  return (
    <div className="animate-fade-in banco-pagina">
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Landmark size={24} /> Banco
          </h1>
          <p className="page-subtitle">Tus cuentas, su saldo y los movimientos, que llegan solos cada mañana.</p>
        </div>
        {estado.disponible && hayBanco && (
          <div className="page-header-actions">
            <button type="button" className="btn btn-secondary" onClick={sincronizar} disabled={ocupado !== null}>
              {ocupado === 'sync' ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />} Sincronizar ahora
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setConectando({})}>
              <Plus size={15} /> Conectar otro banco
            </button>
          </div>
        )}
      </div>

      {!estado.disponible ? (
        <div className="card banco-no-disponible">
          <h2>La conexión con los bancos todavía no está activada</h2>
          <p>
            Mientras tanto puedes conciliar subiendo el extracto de tu banco (Norma 43 o CSV) en{' '}
            <Link href="/conciliacion">Conciliación bancaria</Link>.
          </p>
        </div>
      ) : conectando ? (
        <div className="card">
          <h2 className="banco-titulo-seccion">{conectando.banco ? `Renovar el permiso de ${conectando.banco}` : 'Conectar un banco'}</h2>
          <ConectarBanco bancoFijo={conectando.banco} onError={avisarError} onCerrar={() => setConectando(null)} />
        </div>
      ) : !hayBanco ? (
        <div className="card banco-vacio-grande">
          <Landmark size={28} aria-hidden="true" />
          <h2>Conecta tu banco y olvídate de los extractos</h2>
          <p>
            Cada mañana llegan solos los movimientos de tus cuentas, ves el saldo sin entrar en el banco y concilias cada
            cobro con su factura en un clic. Funciona con los bancos españoles (Santander, BBVA, CaixaBank, Sabadell,
            ING, Bankinter, Unicaja, Kutxabank, cajas rurales…).
          </p>
          <ConectarBanco onError={avisarError} />
        </div>
      ) : null}

      {estado.disponible && hayBanco && (
        <>
          {conSaldo && (
            <div className="banco-resumen">
              <div>
                <span>Saldo en tus cuentas</span>
                <strong className={total < 0 ? 'is-negativo' : ''}>{formatCurrency(total)}</strong>
              </div>
              {estado.sinConciliar > 0 && (
                <Link href="/conciliacion" className="banco-resumen-pendiente">
                  {estado.sinConciliar} {estado.sinConciliar === 1 ? 'movimiento' : 'movimientos'} por conciliar →
                </Link>
              )}
            </div>
          )}
          <CuentasBanco
            conexiones={conexiones}
            ocupado={ocupado}
            onRenovar={(c) => setConectando({ banco: c.banco })}
            onDesconectar={desconectar}
          />
          <MovimientosBanco movimientos={movimientos} onApartar={apartar} />
        </>
      )}
    </div>
  );
}
