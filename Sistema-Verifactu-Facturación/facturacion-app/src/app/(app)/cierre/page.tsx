'use client';

/**
 * CIERRE DEL MES
 *
 * La lista de lo que se repasa antes de dar un mes por cerrado, cada punto
 * en verde (listo) o en ámbar (queda algo), con una barra de cuánto falta y
 * lo que hay que hacer a un toque: abrir o borrar el borrador olvidado,
 * facturar lo entregado, reclamar o cobrar lo vencido, conciliar el banco,
 * apuntar la factura del proveedor de siempre y mirar el impuesto del mes.
 *
 * Las cuentas están en lib/cierreMes. Desde aquí no se emite nada: la
 * factura en borrador se emite desde su ficha, con el repaso de siempre.
 * Borrar un borrador se puede deshacer unos segundos, como en el resto
 * del programa.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CalendarCheck, CheckCircle2, CircleAlert, CircleDashed, FileClock, Truck, AlarmClock, Landmark, Receipt, Percent,
  ExternalLink, Trash2, Send, ChevronDown, Check, Inbox,
} from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import {
  getInvoices, getAlbaranes, getGastos, getCompanySettings, deleteInvoice, deleteAlbaran,
} from '@/lib/storage';
import type { Albaran, CompanySettings, Gasto, Invoice } from '@/lib/types';
import {
  borradoresOlvidados, albaranesSinFacturar, vencidasAlCierre, movimientosPorConciliar, proveedoresQueFaltan,
  resumenImpuestoMes, montarCierre, leerRevisados, marcarRevisado, mesPropuesto, mesesElegibles, nombreMes,
  DIAS_OLVIDADO, REVISABLES, type IdPunto, type MovimientoDelBanco, type PuntoCierre, type BorradorOlvidado,
} from '@/lib/cierreMes';
import { periodoDelMes } from '@/lib/albaranes/facturacionPeriodo';
import { programarBorrado, ESPERA_DESHACER_MS } from '@/lib/borradoDiferido';
import { usePerfiles } from '@/lib/perfilesCliente';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useToast } from '@/hooks/useToast';

/** Lo que se enseña de cada lista antes de «Ver todos». */
const CUANTOS = 5;

interface Datos {
  docs: Invoice[];
  albaranes: Albaran[];
  gastos: Gasto[];
  settings: CompanySettings;
}

/** El banco: null mientras se pregunta; `conectado: false` si no hay. */
type Banco = { conectado: false } | { conectado: true; movimientos: MovimientoDelBanco[] };

const TITULOS: Record<IdPunto, { titulo: string; icono: React.ComponentType<{ size?: number }> }> = {
  borradores: { titulo: 'Borradores olvidados', icono: FileClock },
  albaranes: { titulo: 'Albaranes entregados sin facturar', icono: Truck },
  vencidas: { titulo: 'Facturas vencidas', icono: AlarmClock },
  banco: { titulo: 'Banco sin conciliar', icono: Landmark },
  gastos: { titulo: 'Gastos de proveedores habituales', icono: Receipt },
  impuesto: { titulo: 'Resumen del impuesto', icono: Percent },
};

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export default function CierrePage() {
  const { error: toastError, addToast } = useToast();
  const { cuenta } = usePerfiles();
  const [mes, setMes] = useState(() => mesPropuesto());
  const [datos, setDatos] = useState<Datos | null>(null);
  const [banco, setBanco] = useState<Banco | null>(null);
  // Lo dado por revisado: se lee de este navegador y, al tocarlo, se guarda
  // aquí lo que devuelve la escritura (por si el almacenamiento está bloqueado).
  const [marcados, setMarcados] = useState<{ clave: string; ids: Set<IdPunto> } | null>(null);
  const [ocultos, setOcultos] = useState<Set<string>>(() => new Set());
  const [abiertos, setAbiertos] = useState<Set<IdPunto>>(() => new Set());

  const leer = () => Promise.all([getInvoices(), getAlbaranes(), getGastos(), getCompanySettings()])
    .then(([docs, albaranes, gastos, settings]) => ({ docs, albaranes, gastos, settings }));
  const cargar = useCallback(async () => { setDatos(await leer()); }, []);

  // Lo que se cambie en otra pantalla (o al borrar aquí) se vuelve a leer.
  // El estado se toca después de la lectura, nunca en el cuerpo del efecto.
  useEffect(() => {
    let vivo = true;
    void leer().then(d => { if (vivo) setDatos(d); });
    const alCambiar = () => { void leer().then(d => { if (vivo) setDatos(d); }); };
    window.addEventListener('klima-data-updated', alCambiar);
    return () => { vivo = false; window.removeEventListener('klima-data-updated', alCambiar); };
  }, []);

  // El banco, si hay uno conectado: los movimientos del mes y si están casados.
  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const e = await fetch('/api/banco', { cache: 'no-store' }).then(r => r.json());
        if (!e?.disponible || !e.conexiones?.length) { if (vivo) setBanco({ conectado: false }); return; }
        const d = await fetch(`/api/banco/movimientos?desde=${periodoDelMes(mes).desde}`, { cache: 'no-store' }).then(r => r.json());
        if (vivo) setBanco({ conectado: true, movimientos: d.movimientos ?? [] });
      } catch {
        if (vivo) setBanco({ conectado: false });
      }
    })();
    return () => { vivo = false; };
  }, [mes]);

  const claveRevisados = `${cuenta ?? ''}|${mes}`;
  const revisados = useMemo(
    () => (marcados?.clave === claveRevisados ? marcados.ids : leerRevisados(cuenta, mes)),
    [marcados, claveRevisados, cuenta, mes],
  );

  const calculo = useMemo(() => {
    if (!datos) return null;
    const docs = datos.docs.filter(d => !ocultos.has(d.id));
    const albaranes = datos.albaranes.filter(a => !ocultos.has(a.id));
    const borradores = borradoresOlvidados(docs, albaranes, mes);
    const sinFacturar = albaranesSinFacturar(albaranes, docs, mes);
    const deudores = vencidasAlCierre(docs, mes);
    const porConciliar = banco?.conectado ? movimientosPorConciliar(banco.movimientos, mes) : null;
    const faltan = proveedoresQueFaltan(datos.gastos, docs, mes);
    const impuesto = resumenImpuestoMes(docs, datos.gastos, mes, !!datos.settings.igicEnabled);
    const cierre = montarCierre({
      borradores: borradores.length,
      albaranes: sinFacturar.length,
      vencidas: deudores.length,
      banco: porConciliar ? porConciliar.length : null,
      gastos: faltan.length,
      revisados,
    });
    return { borradores, sinFacturar, deudores, porConciliar, faltan, impuesto, cierre };
  }, [datos, banco, mes, revisados, ocultos]);

  const alternarRevisado = (id: IdPunto, si: boolean) => {
    const ids = new Set(revisados);
    if (si) ids.add(id); else ids.delete(id);
    marcarRevisado(cuenta, mes, id, si);
    setMarcados({ clave: claveRevisados, ids });
  };

  const alternarAbierto = (id: IdPunto) => setAbiertos(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  // Borrar no pregunta: sale de la lista y el aviso deja deshacerlo unos segundos.
  const borrar = (b: BorradorOlvidado) => {
    const volver = () => setOcultos(prev => { const n = new Set(prev); n.delete(b.id); return n; });
    setOcultos(prev => new Set(prev).add(b.id));
    const borrado = programarBorrado(`cierre:${b.id}`, () => (b.origen === 'albaran' ? deleteAlbaran(b.id) : deleteInvoice(b.id)), {
      alTerminar: () => { void cargar().then(volver); },
      alFallar: e => { volver(); toastError('No se ha podido borrar', `${b.numero}: ${e instanceof Error ? e.message : 'error desconocido'}`); },
    });
    addToast({
      type: 'info',
      title: 'Borrador eliminado',
      message: `${b.tipo} ${b.numero}`,
      duration: ESPERA_DESHACER_MS,
      accion: { etiqueta: 'Deshacer', alPulsar: () => { if (borrado.deshacer()) volver(); } },
    });
  };

  if (!datos || !calculo) return <PageSkeleton variant="list" label="Preparando el cierre del mes" />;

  const { borradores, sinFacturar, deudores, porConciliar, faltan, impuesto, cierre } = calculo;
  const punto = (id: IdPunto) => cierre.puntos.find(p => p.id === id)!;
  const acortar = <T,>(id: IdPunto, lista: T[]) => (abiertos.has(id) ? lista : lista.slice(0, CUANTOS));
  const verTodos = (id: IdPunto, total: number) => total > CUANTOS && (
    <button type="button" className="btn btn-ghost btn-sm cierre-mas" aria-expanded={abiertos.has(id)} onClick={() => alternarAbierto(id)}>
      <ChevronDown size={14} /> {abiertos.has(id) ? 'Ver menos' : `Ver los ${total}`}
    </button>
  );

  const resumen: Record<IdPunto, string> = {
    borradores: borradores.length
      ? `${plural(borradores.length, 'borrador lleva', 'borradores llevan')} más de ${DIAS_OLVIDADO} días sin tocarse.`
      : 'Ningún borrador olvidado.',
    albaranes: sinFacturar.length
      ? `${plural(sinFacturar.length, 'albarán entregado', 'albaranes entregados')} por ${formatCurrency(sinFacturar.reduce((n, a) => n + a.total, 0))}, sin factura.`
      : 'Todo lo entregado está facturado.',
    vencidas: deudores.length
      ? `${plural(deudores.length, 'cliente debe', 'clientes deben')} ${formatCurrency(deudores.reduce((n, d) => n + d.total, 0))} vencidos.`
      : 'Nada vencido sin cobrar.',
    banco: !banco
      ? 'Mirando el banco…'
      : porConciliar === null
        ? 'Sin banco conectado: aquí no se puede comprobar.'
        : porConciliar.length
          ? `${plural(porConciliar.length, 'movimiento del mes', 'movimientos del mes')} sin casar con un cobro, un pago o un gasto.`
          : 'Todos los movimientos del mes están conciliados.',
    gastos: faltan.length
      ? `${plural(faltan.length, 'proveedor de siempre no ha', 'proveedores de siempre no han')} pasado factura este mes.`
      : 'Están los gastos de los proveedores de siempre.',
    impuesto: `${impuesto.impuesto} del mes: ${impuesto.resultado >= 0 ? 'a ingresar' : 'a compensar'} ${formatCurrency(Math.abs(impuesto.resultado))}.`,
  };

  const tarjeta = (p: PuntoCierre, children?: React.ReactNode) => {
    const { titulo, icono: Icono } = TITULOS[p.id];
    const revisable = REVISABLES.includes(p.id);
    const EstadoIcono = p.estado === 'listo' ? CheckCircle2 : p.estado === 'pendiente' ? CircleAlert : CircleDashed;
    const textoEstado = p.estado === 'listo' ? (p.revisado ? 'Revisado' : 'Listo') : p.estado === 'pendiente' ? 'Pendiente' : 'Sin datos';
    return (
      <li className="cierre-punto" data-estado={p.estado} aria-labelledby={`cierre-${p.id}`}>
        <div className="cierre-punto-cabecera">
          <span className="cierre-punto-estado" aria-hidden="true"><EstadoIcono size={20} /></span>
          <div className="cierre-punto-titulo">
            <h2 id={`cierre-${p.id}`}><Icono size={15} /> {titulo}</h2>
            <p><span className="solo-lectores">{textoEstado}. </span>{resumen[p.id]}</p>
          </div>
          {revisable && p.estado !== 'sin_datos' && (p.cuenta > 0 || p.id === 'impuesto' || p.revisado) && (
            <button
              type="button"
              className={`btn btn-sm cierre-revisado${p.revisado ? ' is-revisado' : ''}`}
              aria-pressed={p.revisado}
              onClick={() => alternarRevisado(p.id, !p.revisado)}
            >
              <Check size={14} /> {p.revisado ? 'Revisado' : p.id === 'impuesto' ? 'Dar por visto' : 'Dar por revisado'}
            </button>
          )}
        </div>
        <div className="cierre-punto-cuerpo">{children}</div>
      </li>
    );
  };

  return (
    <div className="page-container cierre">
      <div className="page-header cierre-cabecera">
        <div>
          <h1 className="page-title"><CalendarCheck size={22} aria-hidden="true" /> Cierre del mes</h1>
          <p className="page-subtitle">Lo que se repasa antes de dar el mes por cerrado, con lo que hay que hacer a un toque.</p>
        </div>
        <label className="cierre-mes">
          <span>Mes</span>
          <select className="form-select" value={mes} onChange={e => { setMes(e.target.value); setAbiertos(new Set()); }}>
            {mesesElegibles().map(m => <option key={m} value={m}>{nombreMes(m)}</option>)}
          </select>
        </label>
      </div>

      <section className="cierre-progreso" aria-label={`Progreso del cierre de ${nombreMes(mes)}`}>
        <div className="cierre-progreso-texto">
          <strong>{cierre.hechos === cierre.total ? `${nombreMes(mes)}, listo para cerrar` : `${cierre.hechos} de ${cierre.total} puntos listos`}</strong>
          <span className="mono">{cierre.progreso} %</span>
        </div>
        <div className="cierre-barra" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={cierre.progreso} aria-label="Puntos del cierre listos">
          <span style={{ width: `${cierre.progreso}%` }} />
        </div>
      </section>

      <ol className="cierre-lista">
        {tarjeta(punto('borradores'), <>
          {borradores.length > 0 && (
            <>
              <ul className="cierre-filas">
                {acortar('borradores', borradores).map(b => (
                  <li key={b.id} className="cierre-fila">
                    <span className="cierre-fila-que">
                      <strong>{b.tipo} <span className="mono">{b.numero}</span></strong>
                      <small>{b.tercero || 'Sin cliente'} · {formatDate(b.fecha)} · {plural(b.dias, 'día', 'días')} sin tocar</small>
                    </span>
                    <strong className="mono cierre-fila-importe">{formatCurrency(b.total)}</strong>
                    <span className="cierre-fila-acciones">
                      <Link href={b.href} className="btn btn-ghost btn-sm" aria-label={`Abrir ${b.tipo} ${b.numero}`}>
                        <ExternalLink size={14} /> Abrir
                      </Link>
                      {b.esFacturaVenta && (
                        <Link href={b.href} className="btn btn-outline btn-sm" aria-label={`Revisar y emitir la factura ${b.numero}`}>
                          <Send size={14} /> Emitir
                        </Link>
                      )}
                      <button type="button" className="btn btn-ghost btn-sm cierre-borrar" onClick={() => borrar(b)} aria-label={`Borrar ${b.tipo} ${b.numero}`}>
                        <Trash2 size={14} /> Borrar
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
              {verTodos('borradores', borradores.length)}
            </>
          )}
        </>)}

        {tarjeta(punto('albaranes'), <>
          {sinFacturar.length > 0 && (
            <div className="cierre-acciones">
              {sinFacturar.some(a => a.origen === 'albaran') && (
                <Link href="/albaranes" className="btn btn-primary btn-sm"><Truck size={14} /> Facturar por periodo</Link>
              )}
              {sinFacturar.some(a => a.origen === 'documento') && (
                <Link href="/documentos?tipo=albaran&sentido=venta" className="btn btn-outline btn-sm">Ver los albaranes de documentos</Link>
              )}
              <small>De {plural(new Set(sinFacturar.map(a => a.cliente)).size, 'cliente', 'clientes')}; el más antiguo, del {formatDate(sinFacturar[0].fecha)}.</small>
            </div>
          )}
        </>)}

        {tarjeta(punto('vencidas'), <>
          {deudores.length > 0 && (
            <>
              <ul className="cierre-filas">
                {acortar('vencidas', deudores).map(d => (
                  <li key={d.clienteId || d.cliente} className="cierre-fila">
                    <span className="cierre-fila-que">
                      <strong>{d.cliente}</strong>
                      <small>{plural(d.facturas.length, 'factura', 'facturas')} · la más antigua, {plural(d.maxRetraso, 'día', 'días')} de retraso</small>
                    </span>
                    <strong className="mono cierre-fila-importe">{formatCurrency(d.total)}</strong>
                    <span className="cierre-fila-acciones">
                      {d.clienteId && (
                        <Link href={`/clientes/${d.clienteId}`} className="btn btn-outline btn-sm" aria-label={`Reclamar a ${d.cliente}`}>
                          <AlarmClock size={14} /> Reclamar
                        </Link>
                      )}
                      <Link href="/tesoreria?tab=cobros&nuevo=cobro" className="btn btn-ghost btn-sm" aria-label={`Apuntar un cobro de ${d.cliente}`}>
                        Cobrar
                      </Link>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="cierre-acciones">
                {verTodos('vencidas', deudores.length)}
                <Link href="/recordatorios" className="btn btn-ghost btn-sm">Todos en Recordatorios</Link>
              </div>
            </>
          )}
        </>)}

        {tarjeta(punto('banco'), <>
          {porConciliar === null && banco && (
            <div className="cierre-acciones"><Link href="/banco" className="btn btn-outline btn-sm"><Landmark size={14} /> Conectar el banco</Link></div>
          )}
          {porConciliar && porConciliar.length > 0 && (
            <div className="cierre-acciones">
              <Link href="/conciliacion" className="btn btn-primary btn-sm"><Landmark size={14} /> Conciliar</Link>
              <small>
                Entradas por {formatCurrency(porConciliar.filter(m => m.importe > 0).reduce((n, m) => n + m.importe, 0))} y
                salidas por {formatCurrency(-porConciliar.filter(m => m.importe < 0).reduce((n, m) => n + m.importe, 0))}.
              </small>
            </div>
          )}
        </>)}

        {tarjeta(punto('gastos'), <>
          {faltan.length > 0 && (
            <>
              <ul className="cierre-filas">
                {acortar('gastos', faltan).map(f => (
                  <li key={f.clave} className="cierre-fila">
                    <span className="cierre-fila-que">
                      <strong>{f.nombre}</strong>
                      <small>En {f.meses} de los 3 meses anteriores · el último, del {formatDate(f.ultimaFecha)}</small>
                    </span>
                    <span className="cierre-fila-importe"><small>suele ser</small> <strong className="mono">{formatCurrency(f.importeMedio)}</strong></span>
                  </li>
                ))}
              </ul>
              <div className="cierre-acciones">
                {verTodos('gastos', faltan.length)}
                <Link href="/gastos" className="btn btn-outline btn-sm"><Receipt size={14} /> Apuntar un gasto</Link>
                <Link href="/gastos/buzon" className="btn btn-ghost btn-sm"><Inbox size={14} /> Facturas recibidas</Link>
              </div>
            </>
          )}
        </>)}

        {tarjeta(punto('impuesto'), <>
          <dl className="cierre-impuesto">
            {impuesto.porTipo.map(t => (
              <div key={t.tipo}><dt>Repercutido al {String(t.tipo).replace('.', ',')} %</dt><dd className="mono">{formatCurrency(t.cuota)}</dd></div>
            ))}
            <div><dt>{impuesto.impuesto} repercutido</dt><dd className="mono">{formatCurrency(impuesto.repercutido)}</dd></div>
            <div><dt>{impuesto.impuesto} soportado deducible</dt><dd className="mono">{formatCurrency(impuesto.deducible)}</dd></div>
            <div className="cierre-impuesto-total"><dt>Resultado del mes</dt><dd className="mono">{formatCurrency(impuesto.resultado)}</dd></div>
          </dl>
          <div className="cierre-acciones">
            <Link href={`/listados-fiscales/${impuesto.impuesto === 'IGIC' ? '420' : '303'}`} className="btn btn-ghost btn-sm">
              Ver el modelo {impuesto.impuesto === 'IGIC' ? '420' : '303'} del trimestre
            </Link>
            <small>
              Orientativo: {plural(impuesto.numFacturas, 'factura', 'facturas')} y {plural(impuesto.numGastos, 'gasto', 'gastos')} del mes. Se declara por trimestre.
            </small>
          </div>
        </>)}
      </ol>

      {cierre.hechos === cierre.total && (
        <p className="cierre-fin" role="status">
          <CheckCircle2 size={16} aria-hidden="true" /> Todo en orden. Si quieres, prepara el paquete del trimestre en{' '}
          <Link href="/listados-fiscales">Listados fiscales</Link>.
        </p>
      )}
    </div>
  );
}
