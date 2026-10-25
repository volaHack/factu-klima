'use client';

/**
 * CONCILIACIÓN BANCARIA
 *
 * Se sube el extracto (Norma 43 o CSV) y cada movimiento sale con su
 * pareja propuesta: la factura que cobra, la que paga o el gasto que ya
 * estaba apuntado. Confirmar crea el cobro o el pago de verdad (la factura
 * queda pagada y la contabilidad lleva su asiento contra bancos). Los
 * cargos sin pareja se pueden apuntar como gasto sin salir de aquí.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EstadoBanco, MovimientoVista } from '@/components/banco/tipos';
import Link from 'next/link';
import {
  Upload, CheckCircle2, Sparkles, EyeOff, Undo2, Receipt, X, FileSpreadsheet, RefreshCw,
} from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { useToast } from '@/hooks/useToast';
import { getCobrosPagos, getCompanySettings, getGastos, getInvoices } from '@/lib/storage';
import type { CobroPago, Gasto, Invoice } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';
import { CATEGORIAS_GASTO } from '@/lib/gastos';
import { leerExtracto, textoDeFichero, type Extracto, type MovimientoBanco } from '@/lib/banco/extracto';
import { conciliar, esSegura, resumen, type Linea, type Propuesta } from '@/lib/banco/conciliar';
import {
  confirmar, crearGastoDesde, guardarIgnorados, leerIgnorados, sugerirGasto, type DatosGastoNuevo,
} from '@/lib/banco/acciones';
import CajaBusqueda from '@/components/ui/CajaBusqueda';
import { casaTexto } from '@/lib/casaTexto';

type Filtro = 'pendientes' | 'todos' | 'conciliados' | 'ignorados';

const CLAVE_EXTRACTO = 'klima_banco_extracto';

const fecha = (iso: string) => iso.split('-').reverse().join('/');

function describir(p: Propuesta): string {
  if (p.tipo === 'gasto') return `Gasto ya apuntado: ${p.gasto.concepto}${p.gasto.proveedorNombre ? ` · ${p.gasto.proveedorNombre}` : ''}`;
  const quien = p.facturas[0].factura.clientName;
  const nums = p.facturas.map(x => x.factura.number).join(', ');
  return `${p.tipo === 'cobro' ? 'Cobro' : 'Pago'} de ${nums} · ${quien}`;
}

function nivel(confianza: number): { clase: string; texto: string } {
  if (confianza >= 80) return { clase: 'badge-success', texto: 'Muy probable' };
  if (confianza >= 60) return { clase: 'badge-info', texto: 'Probable' };
  return { clase: 'badge-warning', texto: 'Revisar' };
}

/** Los movimientos guardados del banco conectado, como un extracto más. */
async function movimientosDelBanco(): Promise<{
  estado: { disponible: boolean; conectado: boolean; ultima: string | null };
  extracto: Extracto | null;
  ignorados: string[];
}> {
  const vacio = { estado: { disponible: false, conectado: false, ultima: null }, extracto: null, ignorados: [] };
  try {
    const e: EstadoBanco = await fetch('/api/banco').then(r => r.json());
    if (!e.disponible) return vacio;
    const activas = e.conexiones.filter(c => !c.caducada);
    const ultima = activas.map(c => c.ultimaLectura).filter(Boolean).sort().pop() ?? null;
    const estado = { disponible: true, conectado: e.conexiones.length > 0, ultima };
    if (!e.conexiones.length) return { ...vacio, estado };
    const d: { desde: string; movimientos: MovimientoVista[] } = await fetch('/api/banco/movimientos').then(r => r.json());
    const movs = d.movimientos ?? [];
    if (!movs.length) return { ...vacio, estado };
    const ibans = [...new Set(movs.map(m => m.iban).filter(Boolean))];
    return {
      estado,
      extracto: {
        formato: 'banco',
        cuenta: ibans.length === 1 ? ibans[0]! : undefined,
        desde: d.desde,
        hasta: new Date().toISOString().slice(0, 10),
        movimientos: movs.map(m => ({
          id: m.id, fecha: m.fecha, importe: m.importe, concepto: m.concepto,
          ...(m.referencia ? { referencia: m.referencia } : {}), ...(m.saldo != null ? { saldo: m.saldo } : {}),
        })).sort((a, b) => a.fecha.localeCompare(b.fecha)),
      },
      ignorados: movs.filter(m => m.ignorado).map(m => m.id),
    };
  } catch {
    return vacio;
  }
}

export default function ConciliacionPage() {
  const { success, error: toastError } = useToast();
  const entrada = useRef<HTMLInputElement>(null);

  const [extracto, setExtracto] = useState<Extracto | null>(null);
  const [datos, setDatos] = useState<{ facturas: Invoice[]; gastos: Gasto[]; cobrosPagos: CobroPago[] } | null>(null);
  const [tipoGeneral, setTipoGeneral] = useState(21);
  const [ignorados, setIgnorados] = useState<Set<string>>(new Set());
  const [filtro, setFiltro] = useState<Filtro>('pendientes');
  const [busca, setBusca] = useState('');
  const [eleccion, setEleccion] = useState<Record<string, number>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [gastoPara, setGastoPara] = useState<{ mov: MovimientoBanco; datos: DatosGastoNuevo } | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  // El banco conectado: si lo hay, sus movimientos guardados se cargan solos.
  const [banco, setBanco] = useState<{ disponible: boolean; conectado: boolean; ultima: string | null } | null>(null);

  const recargar = useCallback(async () => {
    const [facturas, gastos, cobrosPagos, ajustes] = await Promise.all([getInvoices(), getGastos(), getCobrosPagos(), getCompanySettings()]);
    setDatos({ facturas, gastos, cobrosPagos });
    setTipoGeneral(ajustes.igicEnabled ? 7 : 21);
  }, []);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const [, desdeBanco] = await Promise.all([recargar(), movimientosDelBanco()]);
      if (!vivo) return;
      setBanco(desdeBanco.estado);
      // Lo apartado en el servidor vale en todos los dispositivos; lo de
      // este navegador (extractos subidos a mano) se suma.
      setIgnorados(new Set([...leerIgnorados(), ...desdeBanco.ignorados]));
      let guardado: Extracto | null = null;
      try {
        const texto = localStorage.getItem(CLAVE_EXTRACTO);
        if (texto) guardado = JSON.parse(texto) as Extracto;
      } catch { /* sin extracto guardado */ }
      // Un extracto subido a mano manda (es lo que se estaba conciliando);
      // si no, los movimientos del banco conectado, siempre al día.
      if (guardado && guardado.formato !== 'banco') setExtracto(guardado);
      else if (desdeBanco.extracto) setExtracto(desdeBanco.extracto);
      else if (guardado) setExtracto(guardado);
    })();
    return () => { vivo = false; };
  }, [recargar]);

  const lineas = useMemo<Linea[]>(
    () => (extracto && datos ? conciliar(extracto.movimientos, { ...datos, ignorados }) : []),
    [extracto, datos, ignorados],
  );
  const cuenta = useMemo(() => resumen(lineas), [lineas]);
  const visibles = useMemo(() => lineas.filter(l => {
    if (filtro === 'todos') return true;
    if (filtro === 'conciliados') return !!l.hecho;
    if (filtro === 'ignorados') return !l.hecho && l.ignorado;
    return !l.hecho && !l.ignorado;
  }).filter(l => casaTexto(busca, l.mov.concepto, l.mov.fecha, l.mov.importe, String(l.mov.importe).replace('.', ','))), [lineas, filtro, busca]);

  const abrir = async (fichero: File | undefined) => {
    if (!fichero) return;
    try {
      const e = leerExtracto(await textoDeFichero(fichero));
      setExtracto(e);
      setEleccion({});
      setFiltro('pendientes');
      try { localStorage.setItem(CLAVE_EXTRACTO, JSON.stringify(e)); } catch { /* muy grande: sólo en memoria */ }
      success(`${e.movimientos.length} movimientos leídos`, e.formato === 'norma43' ? 'Formato Norma 43' : 'Formato CSV');
    } catch (err) {
      toastError('No se ha podido leer el extracto', err instanceof Error ? err.message : '');
    }
  };

  const cerrar = () => {
    setExtracto(null);
    try { localStorage.removeItem(CLAVE_EXTRACTO); } catch { /* nada */ }
  };

  const propuestaDe = (l: Linea) => l.propuestas[eleccion[l.mov.id] ?? 0];

  const hacer = async (l: Linea, p: Propuesta) => {
    setOcupado(l.mov.id);
    try {
      const hecho = await confirmar(l.mov, p);
      await recargar();
      success('Conciliado', hecho);
    } catch (err) {
      toastError('No se ha podido conciliar', err instanceof Error ? err.message : '');
    } finally {
      setOcupado(null);
    }
  };

  const confirmarSeguras = async () => {
    const seguras = lineas.filter(l => !l.hecho && !l.ignorado && esSegura(l));
    if (!seguras.length) return;
    setOcupado('todas');
    let bien = 0;
    try {
      // Una a una: cada cobro necesita el número siguiente de la serie.
      for (const l of seguras) {
        await confirmar(l.mov, l.propuestas[0]);
        bien++;
      }
      success(`${bien} movimientos conciliados`);
    } catch (err) {
      toastError(`Se han conciliado ${bien} de ${seguras.length}`, err instanceof Error ? err.message : '');
    } finally {
      await recargar();
      setOcupado(null);
    }
  };

  const ignorar = (id: string, si: boolean) => {
    const nuevo = new Set(ignorados);
    if (si) nuevo.add(id); else nuevo.delete(id);
    setIgnorados(nuevo);
    guardarIgnorados(nuevo);
    // Un movimiento del banco conectado se aparta también en el servidor.
    if (extracto?.formato === 'banco') {
      void fetch('/api/banco/movimientos', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ignorado: si }),
      }).catch(() => { /* se queda apartado en este navegador */ });
    }
  };

  const guardarGasto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gastoPara) return;
    setOcupado(gastoPara.mov.id);
    try {
      const hecho = await crearGastoDesde(gastoPara.mov, gastoPara.datos);
      setGastoPara(null);
      await recargar();
      success('Gasto apuntado y conciliado', hecho);
    } catch (err) {
      toastError('No se ha podido apuntar el gasto', err instanceof Error ? err.message : '');
    } finally {
      setOcupado(null);
    }
  };

  if (!datos) return <PageSkeleton label="Cargando facturas y gastos" />;

  return (
    <div className="page banco">
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Conciliación bancaria</h1>
          <p className="page-subtitle">
            Sube el extracto del banco y cada movimiento sale casado con su factura o su gasto.
            Confirmas, y la factura queda cobrada con su asiento en la contabilidad.
          </p>
        </div>
        {extracto && (
          <div className="page-header-actions">
            <button type="button" className="btn btn-secondary" onClick={() => entrada.current?.click()}>
              <RefreshCw size={16} /> Otro extracto
            </button>
            <button type="button" className="btn btn-ghost" onClick={cerrar}>Cerrar</button>
          </div>
        )}
      </div>

      <input
        ref={entrada} type="file" hidden accept=".n43,.q43,.aeb,.txt,.csv,.tsv,text/csv,text/plain"
        onChange={e => { abrir(e.target.files?.[0]); e.target.value = ''; }}
      />

      {!extracto && banco?.disponible && !banco.conectado && (
        <div className="card banco-invitacion">
          <div>
            <strong>Conecta tu banco y no vuelvas a subir extractos</strong>
            <p>Los movimientos llegan solos cada mañana y aparecen aquí, listos para conciliar.</p>
          </div>
          <Link href="/banco" className="btn btn-primary">Conectar el banco</Link>
        </div>
      )}
      {extracto?.formato === 'banco' && (
        <p className="banco-origen">
          Movimientos de tu banco conectado{banco?.ultima ? `, al día del ${new Date(banco.ultima).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}` : ''}.
          {' '}Llegan solos cada mañana. <Link href="/banco">Ver el banco</Link>
        </p>
      )}

      {!extracto ? (
        <div
          className={`card banco-subir ${arrastrando ? 'is-encima' : ''}`}
          onDragOver={e => { e.preventDefault(); setArrastrando(true); }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={e => { e.preventDefault(); setArrastrando(false); abrir(e.dataTransfer.files?.[0]); }}
        >
          <FileSpreadsheet size={32} strokeWidth={1.5} />
          <h2>Sube el extracto del banco</h2>
          <p>
            Mejor en <strong>Norma 43</strong> (también la llaman «Cuaderno 43» o «formato AEB/CSB»): está en la banca online
            de todos los bancos, en la sección de movimientos o de descargas. También vale el <strong>CSV</strong> del botón
            de exportar.
          </p>
          <button type="button" className="btn btn-primary" onClick={() => entrada.current?.click()}>
            <Upload size={16} /> Elegir fichero
          </button>
          <p className="banco-nota">El fichero se lee en tu navegador. No se sube a ningún sitio.</p>
        </div>
      ) : (
        <>
          <p className="banco-cuenta">
            {extracto.cuenta ? <>Cuenta <span className="mono">{extracto.cuenta}</span> · </> : null}
            {extracto.desde && extracto.hasta ? `del ${fecha(extracto.desde)} al ${fecha(extracto.hasta)}` : null}
            {extracto.saldoFinal !== undefined ? <> · saldo final {formatCurrency(extracto.saldoFinal)}</> : null}
          </p>

          <div className="kpi-grid">
            <div className="card"><div className="card-subtitle">Movimientos</div><div className="page-meta-value">{cuenta.total}</div>
              <p className="banco-pie">Entran {formatCurrency(cuenta.entradas)} · salen {formatCurrency(cuenta.salidas)}</p></div>
            <div className="card"><div className="card-subtitle">Conciliados</div><div className="page-meta-value">{cuenta.conciliados}</div>
              <p className="banco-pie">{cuenta.ignorados ? `${cuenta.ignorados} ignorados` : 'Ya casados con un cobro, pago o gasto'}</p></div>
            <div className="card"><div className="card-subtitle">Listos para confirmar</div><div className="page-meta-value">{cuenta.seguras}</div>
              <p className="banco-pie">{cuenta.conPropuesta ? `Y ${cuenta.conPropuesta} con propuesta que conviene mirar` : 'Pareja clara, sin dudas'}</p></div>
            <div className="card"><div className="card-subtitle">Sin pareja</div><div className="page-meta-value">{cuenta.sinPareja}</div>
              <p className="banco-pie">Cargos que se pueden apuntar como gasto</p></div>
          </div>

          <div className="banco-barra">
            <div className="tabs" role="tablist" aria-label="Qué movimientos ver">
              {([['pendientes', 'Por conciliar'], ['conciliados', 'Conciliados'], ['ignorados', 'Ignorados'], ['todos', 'Todos']] as [Filtro, string][]).map(([id, nombre]) => (
                <button key={id} type="button" role="tab" aria-selected={filtro === id} className={`tab ${filtro === id ? 'active' : ''}`} onClick={() => setFiltro(id)}>
                  {nombre}
                </button>
              ))}
            </div>
            {cuenta.seguras > 0 && (
              <button type="button" className="btn btn-primary" onClick={confirmarSeguras} disabled={!!ocupado}>
                <Sparkles size={16} /> Confirmar {cuenta.seguras === 1 ? 'la segura' : `las ${cuenta.seguras} seguras`}
              </button>
            )}
          </div>

          <CajaBusqueda value={busca} onChange={setBusca} placeholder="Buscar movimiento: concepto, fecha o importe" total={lineas.length} visibles={visibles.length} />

          {visibles.length === 0 ? (
            <div className="card banco-vacio">
              <CheckCircle2 size={22} />
              <p>{filtro === 'pendientes' ? 'No queda nada por conciliar en este extracto.' : 'Nada en esta vista.'}</p>
            </div>
          ) : (
            <div className="banco-lista">
              {visibles.map(l => {
                const p = propuestaDe(l);
                const n = p ? nivel(p.confianza) : null;
                const esteOcupado = ocupado === l.mov.id || ocupado === 'todas';
                return (
                  <div key={l.mov.id} className={`card banco-mov ${l.hecho ? 'is-hecho' : ''}`}>
                    <div className="banco-mov-dato">
                      <span className="mono banco-mov-fecha">{fecha(l.mov.fecha)}</span>
                      <span className="banco-mov-concepto">{l.mov.concepto}</span>
                      <span className={`mono banco-mov-importe ${l.mov.importe > 0 ? 'is-entra' : 'is-sale'}`}>
                        {l.mov.importe > 0 ? '+' : ''}{formatCurrency(l.mov.importe)}
                      </span>
                    </div>

                    <div className="banco-mov-pareja">
                      {l.hecho ? (
                        <span className="banco-hecho"><CheckCircle2 size={15} /> {l.hecho}</span>
                      ) : l.ignorado ? (
                        <>
                          <span className="banco-motivo">Ignorado. No genera nada.</span>
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => ignorar(l.mov.id, false)}><Undo2 size={14} /> Recuperar</button>
                        </>
                      ) : p ? (
                        <>
                          <div className="banco-propuesta">
                            {l.propuestas.length > 1 ? (
                              <select
                                className="form-select banco-elegir" value={eleccion[l.mov.id] ?? 0}
                                onChange={e => setEleccion({ ...eleccion, [l.mov.id]: Number(e.target.value) })}
                                aria-label="Elegir la pareja"
                              >
                                {l.propuestas.map((x, i) => <option key={i} value={i}>{describir(x)}</option>)}
                              </select>
                            ) : (
                              <strong>{describir(p)}</strong>
                            )}
                            <span className="banco-motivo">
                              <span className={`badge ${n!.clase}`}>{n!.texto}</span> {p.motivo}
                            </span>
                          </div>
                          <div className="banco-acciones">
                            <button type="button" className="btn btn-primary btn-sm" disabled={esteOcupado} onClick={() => hacer(l, p)}>
                              <CheckCircle2 size={14} /> Confirmar
                            </button>
                            {l.mov.importe < 0 && (
                              <button type="button" className="btn btn-ghost btn-sm" disabled={esteOcupado}
                                onClick={() => setGastoPara({ mov: l.mov, datos: sugerirGasto(l.mov, tipoGeneral) })}>
                                <Receipt size={14} /> Es otro gasto
                              </button>
                            )}
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => ignorar(l.mov.id, true)} title="Traspasos entre cuentas propias, movimientos que no son de la empresa…">
                              <EyeOff size={14} /> Ignorar
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <span className="banco-motivo">
                            {l.mov.importe > 0
                              ? <>Ninguna factura pendiente por este importe. Si es de una factura, anota el cobro en <Link href="/tesoreria">Tesorería</Link>.</>
                              : 'Sin gasto ni factura de compra por este importe.'}
                          </span>
                          <div className="banco-acciones">
                            {l.mov.importe < 0 && (
                              <button type="button" className="btn btn-secondary btn-sm" disabled={esteOcupado}
                                onClick={() => setGastoPara({ mov: l.mov, datos: sugerirGasto(l.mov, tipoGeneral) })}>
                                <Receipt size={14} /> Apuntar como gasto
                              </button>
                            )}
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => ignorar(l.mov.id, true)}>
                              <EyeOff size={14} /> Ignorar
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {gastoPara && (
        <div className="modal-overlay" onClick={() => setGastoPara(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Apuntar como gasto</h3>
              <button type="button" className="modal-close" onClick={() => setGastoPara(null)}><X size={18} /></button>
            </div>
            <form onSubmit={guardarGasto}>
              <div className="modal-body">
                <p className="banco-motivo" style={{ marginBottom: 'var(--space-4)' }}>
                  {fecha(gastoPara.mov.fecha)} · {formatCurrency(Math.abs(gastoPara.mov.importe))}, impuesto incluido. El total es el del banco.
                </p>
                <div className="form-group">
                  <label className="form-label required" htmlFor="g-concepto">Concepto</label>
                  <input id="g-concepto" className="form-input" required value={gastoPara.datos.concepto}
                    onChange={e => setGastoPara({ ...gastoPara, datos: { ...gastoPara.datos, concepto: e.target.value } })} />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="g-prov">Proveedor</label>
                  <input id="g-prov" className="form-input" value={gastoPara.datos.proveedorNombre ?? ''}
                    onChange={e => setGastoPara({ ...gastoPara, datos: { ...gastoPara.datos, proveedorNombre: e.target.value } })} />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label" htmlFor="g-cat">Categoría</label>
                    <select id="g-cat" className="form-select" value={gastoPara.datos.categoria}
                      onChange={e => setGastoPara({ ...gastoPara, datos: { ...gastoPara.datos, categoria: e.target.value as DatosGastoNuevo['categoria'] } })}>
                      {CATEGORIAS_GASTO.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="g-tipo">Impuesto incluido</label>
                    <select id="g-tipo" className="form-select" value={gastoPara.datos.taxRate}
                      onChange={e => setGastoPara({ ...gastoPara, datos: { ...gastoPara.datos, taxRate: Number(e.target.value) } })}>
                      {(tipoGeneral === 7 ? [0, 3, 7, 9.5, 15] : [0, 4, 10, 21]).map(t => <option key={t} value={t}>{t === 0 ? 'Sin impuesto' : `${String(t).replace('.', ',')} %`}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setGastoPara(null)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={!!ocupado}>Apuntar y conciliar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
