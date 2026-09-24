'use client';

/**
 * CONTABILIDAD
 *
 * La pantalla se usa dos veces: en /contabilidad, con los datos de la
 * cuenta, y en la zona de gestoría, con los de una empresa cliente y sin
 * enlaces a sus documentos (la gestoría no los abre desde aquí).
 *
 * Todo lo de esta pantalla sale solo de lo que ya se hace en el programa
 * (ver lib/contabilidad/motor.ts). No hay un botón de «contabilizar»: al
 * emitir, comprar, gastar, cobrar o vender en el TPV, el asiento ya existe.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  BookOpenCheck, CheckCircle2, AlertTriangle, XCircle, Download, Search, ArrowUpRight, Scale, Receipt,
} from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import Apuntes from './Apuntes';
import type { Contabilidad } from '@/lib/contabilidad/cargar';
import {
  balance, cuadres, diarioCsv, diarioDelEjercicio, enPeriodo, libroMayor, perdidasYGanancias, saldos,
  sumasYSaldos, sumasYSaldosCsv, type Periodo,
} from '@/lib/contabilidad/informes';
import type { Asiento } from '@/lib/contabilidad/motor';
import { formatCurrency } from '@/lib/utils';

type Pestana = 'resumen' | 'diario' | 'mayor' | 'sumas' | 'anuales' | 'apuntes' | 'cuadres';

const PESTANAS: { id: Pestana; nombre: string }[] = [
  { id: 'resumen', nombre: 'Resumen' },
  { id: 'diario', nombre: 'Libro diario' },
  { id: 'mayor', nombre: 'Mayor' },
  { id: 'sumas', nombre: 'Sumas y saldos' },
  { id: 'anuales', nombre: 'Cuentas anuales' },
  { id: 'apuntes', nombre: 'Apuntes' },
  { id: 'cuadres', nombre: 'Cuadres' },
];

const PERIODOS = [
  { id: 'anio', nombre: 'Año completo' },
  { id: '1', nombre: '1.er trimestre' }, { id: '2', nombre: '2.º trimestre' },
  { id: '3', nombre: '3.er trimestre' }, { id: '4', nombre: '4.º trimestre' },
];

function periodoDe(ejercicio: number, id: string): Periodo {
  if (id === 'anio') return { ejercicio };
  const t = Number(id);
  const mesIni = (t - 1) * 3 + 1;
  const mesFin = t * 3;
  const ultimo = new Date(Date.UTC(ejercicio, mesFin, 0)).getUTCDate();
  return {
    ejercicio,
    desde: `${ejercicio}-${String(mesIni).padStart(2, '0')}-01`,
    hasta: `${ejercicio}-${String(mesFin).padStart(2, '0')}-${ultimo}`,
  };
}

const ORIGEN: Record<Asiento['origen'], string> = {
  apertura: 'Apertura', factura: 'Factura', rectificativa: 'Rectificativa', tpv: 'TPV', compra: 'Compra',
  rectificativa_compra: 'Rect. compra', gasto: 'Gasto', cobro: 'Cobro', pago: 'Pago', cobro_implicito: 'Cobro',
  manual: 'A mano', periodico: 'Periódico',
};

const PLURAL: Record<Asiento['origen'], [string, string]> = {
  apertura: ['apertura', 'aperturas'], factura: ['factura', 'facturas'], rectificativa: ['rectificativa', 'rectificativas'],
  tpv: ['día de TPV', 'días de TPV'], compra: ['compra', 'compras'], rectificativa_compra: ['rectificativa de compra', 'rectificativas de compra'],
  gasto: ['gasto', 'gastos'], cobro: ['cobro', 'cobros'], pago: ['pago', 'pagos'], cobro_implicito: ['cobro', 'cobros'],
  manual: ['apunte a mano', 'apuntes a mano'], periodico: ['apunte periódico', 'apuntes periódicos'],
};

function enlaceDe(a: Asiento): string | null {
  if (!a.documentoId) return null;
  if (a.origen === 'factura' || a.origen === 'rectificativa' || (a.origen === 'cobro_implicito')) return `/facturas/${a.documentoId}`;
  if (a.origen === 'compra' || a.origen === 'rectificativa_compra') return `/documentos/${a.documentoId}`;
  if (a.origen === 'gasto') return '/gastos';
  if (a.origen === 'cobro' || a.origen === 'pago') return '/tesoreria';
  return null;
}

const fecha = (iso: string) => iso.split('-').reverse().join('/');
const importe = (n: number) => (n ? formatCurrency(n) : '');

function descargar(texto: string, nombre: string) {
  const blob = new Blob(['﻿' + texto], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre; a.click();
  URL.revokeObjectURL(url);
}

export interface PropsVista {
  cargar: () => Promise<Contabilidad>;
  titulo?: string;
  subtitulo?: ReactNode;
  /** Lo que va encima del título (un «volver», por ejemplo). */
  antes?: ReactNode;
  /** Enlazar cada asiento con su documento. Sólo en la cuenta propia. */
  enlaces?: boolean;
}

export default function VistaContabilidad({
  cargar, titulo = 'Contabilidad', subtitulo, antes, enlaces = true,
}: PropsVista) {
  const [conta, setConta] = useState<Contabilidad | null>(null);
  const [error, setError] = useState('');
  const [pestana, setPestana] = useState<Pestana>('resumen');
  const [ejercicio, setEjercicio] = useState(new Date().getFullYear());
  const [periodoId, setPeriodoId] = useState('anio');
  // Sube al guardar o borrar un apunte: vuelve a generar la contabilidad.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let vivo = true;
    cargar()
      .then(c => { if (vivo) setConta(c); })
      .catch(e => { if (vivo) setError(e instanceof Error ? e.message : 'No se ha podido cargar la contabilidad.'); });
    return () => { vivo = false; };
  }, [cargar, version]);

  const diario = useMemo(() => (conta ? diarioDelEjercicio(conta.asientos, ejercicio) : []), [conta, ejercicio]);
  const periodo = useMemo(() => periodoDe(ejercicio, periodoId), [ejercicio, periodoId]);
  const delPeriodo = useMemo(
    () => diario.filter(a => (periodoId === 'anio' ? true : a.origen !== 'apertura' && enPeriodo(a, periodo))),
    [diario, periodo, periodoId],
  );

  if (error) return <div className="page"><p className="equipo-error" role="alert">{error}</p></div>;
  if (!conta) return <PageSkeleton label="Preparando la contabilidad" />;

  const nombre = conta.nombreCuenta;
  const sufijo = periodoId === 'anio' ? `${ejercicio}` : `${ejercicio}_${periodoId}T`;

  return (
    <div className="page conta">
      <div className="page-header">
        <div className="page-header-left">
          {antes}
          <p className="page-eyebrow"><BookOpenCheck /> Contabilidad automática</p>
          <h1 className="page-title">{titulo}</h1>
          <p className="page-subtitle">
            {subtitulo ?? <>Cada factura, compra, gasto, cobro y venta del TPV ya tiene su asiento en el Plan General Contable.
            No hay que apuntar nada: se lleva sola mientras trabajas.</>}
          </p>
        </div>
        <div className="page-header-actions conta-filtros">
          <label className="lf-ejercicio">
            Ejercicio
            <select value={ejercicio} onChange={e => setEjercicio(Number(e.target.value))}>
              {conta.ejercicios.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <label className="lf-ejercicio">
            Periodo
            <select value={periodoId} onChange={e => setPeriodoId(e.target.value)}>
              {PERIODOS.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label="Libros contables">
        {PESTANAS.map(p => (
          <button key={p.id} type="button" role="tab" aria-selected={pestana === p.id}
            className={`tab ${pestana === p.id ? 'active' : ''}`} onClick={() => setPestana(p.id)}>
            {p.nombre}
          </button>
        ))}
      </div>

      {pestana === 'resumen' && <Resumen conta={conta} diario={diario} delPeriodo={delPeriodo} periodo={periodo} ejercicio={ejercicio} irA={setPestana} />}
      {pestana === 'diario' && <Diario asientos={delPeriodo} nombre={nombre} enlaces={enlaces} onExportar={() => descargar(diarioCsv(delPeriodo, nombre), `diario_${sufijo}.csv`)} />}
      {pestana === 'mayor' && <Mayor diario={delPeriodo} nombre={nombre} />}
      {pestana === 'sumas' && <SumasSaldos diario={delPeriodo} nombre={nombre} onExportar={() => descargar(sumasYSaldosCsv(delPeriodo, nombre), `sumas_y_saldos_${sufijo}.csv`)} />}
      {pestana === 'anuales' && <CuentasAnuales diario={diario} periodo={periodo} periodoId={periodoId} />}
      {pestana === 'apuntes' && (
        <Apuntes apuntes={conta.apuntes} almacen={conta.almacenApuntes} editable={enlaces} nombreCuenta={nombre} onCambio={() => setVersion(v => v + 1)} />
      )}
      {pestana === 'cuadres' && <Cuadres conta={conta} diario={diario} ejercicio={ejercicio} />}
    </div>
  );
}

// ------------------------------------------------------------------

function Resumen({ conta, diario, delPeriodo, periodo, ejercicio, irA }: {
  conta: Contabilidad; diario: Asiento[]; delPeriodo: Asiento[]; periodo: Periodo; ejercicio: number; irA: (p: Pestana) => void;
}) {
  const pyg = perdidasYGanancias(diario, periodo);
  const hasta = periodo.hasta ?? `${ejercicio}-12-31`;
  const s = saldos(diario.filter(a => a.fecha <= hasta));
  const suma = (pref: string[], deudor: boolean) =>
    [...s.entries()].filter(([c]) => pref.some(p => c.startsWith(p))).reduce((t, [, v]) => t + (deudor ? v.debe - v.haber : v.haber - v.debe), 0);
  const sp = saldos(delPeriodo.filter(a => a.origen !== 'apertura'));
  const impuestoPeriodo = [...sp.entries()].reduce((t, [c, v]) => t + (c.startsWith('477') ? v.haber - v.debe : c.startsWith('472') ? -(v.debe - v.haber) : 0), 0);
  const lista = cuadres(diario, ejercicio, conta.datosCuadre(ejercicio));
  const mal = lista.filter(c => c.estado !== 'ok');

  const porOrigen = new Map<string, number>();
  for (const a of delPeriodo) {
    const clave = a.origen === 'cobro_implicito' ? 'cobro' : a.origen;
    porOrigen.set(clave, (porOrigen.get(clave) ?? 0) + 1);
  }

  return (
    <>
      <div className="kpi-grid">
        <Cifra titulo="Ingresos" valor={pyg.ingresos} pie="Ventas y servicios, sin impuestos" />
        <Cifra titulo="Gastos" valor={pyg.gastos} pie="Compras, gastos y personal" />
        <Cifra titulo="Resultado" valor={pyg.resultadoAntesDeImpuestos} pie="Antes del impuesto sobre beneficios" destacar />
        <Cifra titulo={`${conta.impuesto} del periodo`} valor={impuestoPeriodo} pie={impuestoPeriodo >= 0 ? 'Repercutido menos soportado: a ingresar' : 'A compensar o devolver'} />
      </div>
      <div className="kpi-grid" style={{ marginTop: 'var(--space-4)' }}>
        <Cifra titulo="Te deben los clientes" valor={suma(['430'], true)} pie="Saldo de la cuenta 430" />
        <Cifra titulo="Debes a proveedores" valor={suma(['400', '410'], false)} pie="Cuentas 400 y 410" />
        <Cifra titulo="Tesorería" valor={suma(['57'], true)} pie="Caja y bancos, según lo apuntado" />
        <Cifra titulo="Asientos" valor={delPeriodo.length} pie={[...porOrigen.entries()].map(([k, v]) => `${v} ${PLURAL[k as Asiento['origen']][v === 1 ? 0 : 1]}`).join(' · ') || 'Todavía no hay movimientos'} numero />
      </div>

      <section className={`conta-cuadres-resumen ${mal.length ? 'is-aviso' : 'is-ok'}`}>
        {mal.length === 0 ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
        <div>
          <strong>{mal.length === 0 ? 'Todo cuadra' : `${mal.length} ${mal.length === 1 ? 'cosa que revisar' : 'cosas que revisar'}`}</strong>
          <p>{mal.length === 0
            ? `El diario, el balance, los clientes, la caja y el ${conta.impuesto} del modelo trimestral coinciden.`
            : mal.map(c => c.titulo).join(' · ')}</p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => irA('cuadres')}>Ver cuadres</button>
      </section>

      <section className="conta-como">
        <h2 className="lf-subtitulo">De dónde sale cada asiento</h2>
        <dl className="conta-como-lista">
          <div><dt>Factura emitida</dt><dd>Cliente (430) contra ventas (700/705) y {conta.impuesto} repercutido (477), con la retención a la 473.</dd></div>
          <div><dt>Ventas del TPV</dt><dd>Un asiento por día: caja (570) y banco (572) contra ventas e impuesto.</dd></div>
          <div><dt>Compra y gasto</dt><dd>La cuenta de gasto que toca (600, 621, 628…) y el {conta.impuesto} deducible (472); lo no deducible es más gasto.</dd></div>
          <div><dt>Cobros y pagos</dt><dd>Los de tesorería y, si una factura está cobrada sin cobro apuntado, el que falte.</dd></div>
        </dl>
        <p className="equipo-nota">
          Nóminas con su Seguridad Social, amortizaciones y préstamos no pasan por el programa: si los tienes, tu gestoría
          los añade a partir del diario exportado.
        </p>
      </section>
    </>
  );
}

function Cifra({ titulo, valor, pie, destacar, numero }: { titulo: string; valor: number; pie: string; destacar?: boolean; numero?: boolean }) {
  return (
    <div className={`kpi-card ${destacar ? 'conta-cifra-destacada' : ''}`}>
      <div className="kpi-card-label" style={{ marginBottom: 'var(--space-2)' }}>{titulo}</div>
      <div className={`kpi-card-value ${!numero && valor < 0 ? 'conta-negativo' : ''}`}>{numero ? valor : formatCurrency(Math.round(valor * 100) / 100)}</div>
      <div className="kpi-card-label">{pie}</div>
    </div>
  );
}

// ------------------------------------------------------------------

const POR_PAGINA = 60;

function Diario({ asientos, nombre, enlaces, onExportar }: {
  asientos: Asiento[]; nombre: (c: string) => string; enlaces: boolean; onExportar: () => void;
}) {
  const [buscar, setBuscar] = useState('');
  const [cuantos, setCuantos] = useState(POR_PAGINA);
  const q = buscar.trim().toLowerCase();
  const filtrados = q
    ? asientos.filter(a => a.concepto.toLowerCase().includes(q) || (a.documento ?? '').toLowerCase().includes(q)
      || a.lineas.some(l => l.cuenta.startsWith(q) || nombre(l.cuenta).toLowerCase().includes(q)))
    : asientos;
  const visibles = filtrados.slice(0, cuantos);

  return (
    <>
      <div className="conta-barra">
        <div className="conta-buscar">
          <Search size={16} aria-hidden="true" />
          <input value={buscar} onChange={e => { setBuscar(e.target.value); setCuantos(POR_PAGINA); }} placeholder="Buscar por concepto, documento o cuenta (430, 477…)" aria-label="Buscar en el diario" />
        </div>
        <button type="button" className="btn btn-secondary" onClick={onExportar} disabled={asientos.length === 0}>
          <Download size={15} /> Exportar diario (CSV)
        </button>
      </div>
      {filtrados.length === 0 ? (
        <p className="lf-card-estado">{asientos.length === 0 ? 'No hay asientos en este periodo.' : 'Nada coincide con la búsqueda.'}</p>
      ) : (
        <div className="table-container">
          <table className="table conta-diario">
            <thead>
              <tr><th>Nº</th><th>Fecha</th><th>Cuenta</th><th>Concepto</th><th className="num">Debe</th><th className="num">Haber</th></tr>
            </thead>
            <tbody>
              {visibles.map(a => {
                const enlace = enlaces ? enlaceDe(a) : null;
                return a.lineas.map((l, i) => (
                  <tr key={`${a.numero}-${i}`} className={i === 0 ? 'conta-diario-primera' : ''}>
                    {i === 0 ? <td rowSpan={a.lineas.length} className="mono conta-diario-num">{a.numero}</td> : null}
                    {i === 0 ? <td rowSpan={a.lineas.length} className="mono">{fecha(a.fecha)}</td> : null}
                    <td><span className="mono">{l.cuenta}</span> <span className="conta-cuenta-nombre">{nombre(l.cuenta)}</span></td>
                    {i === 0 ? (
                      <td rowSpan={a.lineas.length}>
                        <span className="conta-origen">{ORIGEN[a.origen]}</span> {a.concepto}
                        {enlace && <> <Link href={enlace} className="conta-enlace" aria-label="Abrir el documento"><ArrowUpRight size={13} /></Link></>}
                      </td>
                    ) : null}
                    <td className="num mono">{importe(l.debe)}</td>
                    <td className="num mono">{importe(l.haber)}</td>
                  </tr>
                ));
              })}
            </tbody>
          </table>
        </div>
      )}
      {filtrados.length > cuantos && (
        <button type="button" className="btn btn-secondary conta-mas" onClick={() => setCuantos(c => c + POR_PAGINA)}>
          Ver más asientos ({filtrados.length - cuantos} más)
        </button>
      )}
    </>
  );
}

// ------------------------------------------------------------------

function Mayor({ diario, nombre }: { diario: Asiento[]; nombre: (c: string) => string }) {
  const cuentas = useMemo(() => sumasYSaldos(diario).filas.map(f => f.cuenta), [diario]);
  const [cuenta, setCuenta] = useState(() => cuentas.find(c => c.startsWith('430')) ?? cuentas[0] ?? '');
  const actual = cuentas.includes(cuenta) ? cuenta : (cuentas[0] ?? '');
  const movs = actual ? libroMayor(diario, actual) : [];
  const totalDebe = movs.reduce((t, m) => t + m.debe, 0);
  const totalHaber = movs.reduce((t, m) => t + m.haber, 0);

  if (cuentas.length === 0) return <p className="lf-card-estado">No hay movimientos en este periodo.</p>;
  return (
    <>
      <div className="conta-barra">
        <label className="lf-ejercicio conta-cuenta-select">
          Cuenta
          <select value={actual} onChange={e => setCuenta(e.target.value)}>
            {cuentas.map(c => <option key={c} value={c}>{c} · {nombre(c)}</option>)}
          </select>
        </label>
      </div>
      <div className="table-container">
        <table className="table">
          <thead><tr><th>Nº</th><th>Fecha</th><th>Concepto</th><th className="num">Debe</th><th className="num">Haber</th><th className="num">Saldo</th></tr></thead>
          <tbody>
            {movs.map((m, i) => (
              <tr key={i}>
                <td className="mono">{m.numero}</td>
                <td className="mono">{fecha(m.fecha)}</td>
                <td>{m.concepto}</td>
                <td className="num mono">{importe(m.debe)}</td>
                <td className="num mono">{importe(m.haber)}</td>
                <td className={`num mono ${m.saldo < 0 ? 'conta-negativo' : ''}`}>{formatCurrency(m.saldo)}</td>
              </tr>
            ))}
            <tr className="conta-total">
              <td colSpan={3}>Total {actual} · {nombre(actual)}</td>
              <td className="num mono">{formatCurrency(totalDebe)}</td>
              <td className="num mono">{formatCurrency(totalHaber)}</td>
              <td className="num mono">{formatCurrency(totalDebe - totalHaber)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

// ------------------------------------------------------------------

function SumasSaldos({ diario, nombre, onExportar }: { diario: Asiento[]; nombre: (c: string) => string; onExportar: () => void }) {
  const { filas, totales } = sumasYSaldos(diario);
  if (filas.length === 0) return <p className="lf-card-estado">No hay movimientos en este periodo.</p>;
  return (
    <>
      <div className="conta-barra">
        <p className="equipo-nota">Si el diario está bien, la suma del debe es igual a la del haber, y la de saldos deudores a la de acreedores.</p>
        <button type="button" className="btn btn-secondary" onClick={onExportar}><Download size={15} /> Exportar (CSV)</button>
      </div>
      <div className="table-container">
        <table className="table">
          <thead><tr><th>Cuenta</th><th>Nombre</th><th className="num">Debe</th><th className="num">Haber</th><th className="num">Saldo deudor</th><th className="num">Saldo acreedor</th></tr></thead>
          <tbody>
            {filas.map(f => (
              <tr key={f.cuenta}>
                <td className="mono">{f.cuenta}</td>
                <td>{nombre(f.cuenta)}</td>
                <td className="num mono">{importe(f.debe)}</td>
                <td className="num mono">{importe(f.haber)}</td>
                <td className="num mono">{importe(f.saldoDeudor)}</td>
                <td className="num mono">{importe(f.saldoAcreedor)}</td>
              </tr>
            ))}
            <tr className="conta-total">
              <td colSpan={2}>Total</td>
              <td className="num mono">{formatCurrency(totales.debe)}</td>
              <td className="num mono">{formatCurrency(totales.haber)}</td>
              <td className="num mono">{formatCurrency(totales.saldoDeudor)}</td>
              <td className="num mono">{formatCurrency(totales.saldoAcreedor)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

// ------------------------------------------------------------------

function Lineas({ lineas }: { lineas: { nombre: string; importe: number }[] }) {
  return (
    <>
      {lineas.filter(l => l.importe !== 0).map(l => (
        <div key={l.nombre} className="conta-linea"><span>{l.nombre}</span><span className="mono">{formatCurrency(l.importe)}</span></div>
      ))}
    </>
  );
}

function CuentasAnuales({ diario, periodo, periodoId }: { diario: Asiento[]; periodo: Periodo; periodoId: string }) {
  const pyg = perdidasYGanancias(diario, periodo);
  const b = balance(diario, periodo.hasta);
  const cierre = periodo.hasta ?? `${periodo.ejercicio}-12-31`;

  return (
    <div className="conta-anuales">
      <section className="card conta-estado">
        <h2 className="conta-estado-titulo"><Receipt size={17} /> Pérdidas y ganancias</h2>
        <p className="equipo-nota">{periodoId === 'anio' ? `Ejercicio ${periodo.ejercicio}` : `Del ${fecha(periodo.desde!)} al ${fecha(periodo.hasta!)}`} · modelo abreviado del PGC de PYMES</p>
        {pyg.partidas.filter(p => p.importe !== 0).map(p => (
          <div key={p.clave} className="conta-linea"><span>{p.clave}. {p.nombre}</span><span className={`mono ${p.importe < 0 ? 'conta-negativo' : ''}`}>{formatCurrency(p.importe)}</span></div>
        ))}
        <div className="conta-linea conta-linea--total"><span>A) Resultado de explotación</span><span className="mono">{formatCurrency(pyg.resultadoExplotacion)}</span></div>
        {pyg.resultadoFinanciero !== 0 && (
          <div className="conta-linea conta-linea--total"><span>B) Resultado financiero</span><span className="mono">{formatCurrency(pyg.resultadoFinanciero)}</span></div>
        )}
        <div className="conta-linea conta-linea--total"><span>C) Resultado antes de impuestos</span><span className="mono">{formatCurrency(pyg.resultadoAntesDeImpuestos)}</span></div>
      </section>

      <section className="card conta-estado">
        <h2 className="conta-estado-titulo"><Scale size={17} /> Balance de situación</h2>
        <p className="equipo-nota">A {fecha(cierre)} · {b.cuadra ? 'cuadrado' : 'NO cuadra: revisa los cuadres'}</p>
        <h3 className="conta-masa">Activo</h3>
        <Lineas lineas={b.activoNoCorriente} />
        <Lineas lineas={b.activoCorriente} />
        <div className="conta-linea conta-linea--total"><span>Total activo</span><span className="mono">{formatCurrency(b.totalActivo)}</span></div>
        <h3 className="conta-masa">Patrimonio neto y pasivo</h3>
        <Lineas lineas={b.patrimonioNeto} />
        <Lineas lineas={b.pasivoNoCorriente} />
        <Lineas lineas={b.pasivoCorriente} />
        <div className="conta-linea conta-linea--total"><span>Total patrimonio neto y pasivo</span><span className="mono">{formatCurrency(b.totalPatrimonioNetoYPasivo)}</span></div>
      </section>
    </div>
  );
}

// ------------------------------------------------------------------

function Cuadres({ conta, diario, ejercicio }: { conta: Contabilidad; diario: Asiento[]; ejercicio: number }) {
  const lista = cuadres(diario, ejercicio, conta.datosCuadre(ejercicio));
  return (
    <>
      <p className="equipo-nota" style={{ marginBottom: 'var(--space-4)' }}>
        Lo que una gestoría comprueba a mano antes de cerrar un trimestre, hecho cada vez que abres esta pantalla ({ejercicio}, hasta hoy).
      </p>
      <ul className="conta-cuadres">
        {lista.map(c => (
          <li key={c.id} className={`conta-cuadre conta-cuadre--${c.estado}`}>
            {c.estado === 'ok' ? <CheckCircle2 size={18} /> : c.estado === 'aviso' ? <AlertTriangle size={18} /> : <XCircle size={18} />}
            <div>
              <strong>{c.titulo}</strong>
              <p>{c.detalle}</p>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
