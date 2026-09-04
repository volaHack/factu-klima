'use client';

/**
 * MODELO 347 — pantalla del modelo
 *
 * Aquí no se calcula nada: todo sale de `lib/fiscal/aeat/modelo347.ts`,
 * que son funciones puras y están cubiertas por tests que comprueban las
 * posiciones del fichero contra el diseño oficial de la AEAT. Esta
 * pantalla sólo pide los datos, enseña el resultado y deja generar.
 *
 * El botón de generar está deshabilitado mientras haya errores críticos.
 * Es a propósito: un 347 con un NIF mal lo rechaza la Sede entera, y es
 * mejor que se entere aquí que después de subirlo.
 */

import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Search, Download, RefreshCw, ShieldCheck, AlertTriangle,
  ChevronRight, FileText, Eye,
} from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import TableEmpty from '@/components/ui/TableEmpty';
import { cargarDatosFiscales, ejerciciosDisponibles } from '@/lib/fiscal/FiscalDataService';
import {
  calcularModelo347,
  validarModelo347,
  generarFichero347,
  nombreFichero347,
  UMBRAL_347,
  type Resultado347,
} from '@/lib/fiscal/aeat/modelo347';
import type { ResultadoValidacion } from '@/lib/fiscal/tipos';
import type { DatosFiscales } from '@/lib/fiscal/FiscalDataService';
import { formatCurrency } from '@/lib/utils';

type Filtro = 'todos' | 'venta' | 'compra';

export default function Modelo347Page() {
  const [cargando, setCargando] = useState(true);
  const [datos, setDatos] = useState<DatosFiscales | null>(null);
  const [ejercicio, setEjercicio] = useState(new Date().getFullYear() - 1);
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [vistaPrevia, setVistaPrevia] = useState(false);
  const [detalle, setDetalle] = useState<string | null>(null);

  // `recarga` es lo que hace funcionar el botón «Recalcular»: volver a
  // poner el mismo ejercicio no dispararía el efecto, porque el estado no
  // cambia. Un contador sí cambia siempre.
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let vivo = true;
    (async () => {
      // Dentro del async, no en el cuerpo del efecto: un setState síncrono
      // ahí encadena renders (y la regla de lint lo prohíbe).
      setCargando(true);
      const d = await cargarDatosFiscales(ejercicio);
      if (!vivo) return;
      setDatos(d);
      setCargando(false);
    })();
    return () => { vivo = false; };
  }, [ejercicio, recarga]);

  const resultado: Resultado347 | null = useMemo(() => {
    if (!datos) return null;
    return calcularModelo347(
      { facturas: datos.facturas, gastos: datos.gastos, clientes: datos.clientes },
      { ejercicio },
    );
  }, [datos, ejercicio]);

  const validacion: ResultadoValidacion | null = useMemo(() => {
    if (!resultado || !datos) return null;
    return validarModelo347(resultado, datos.empresa);
  }, [resultado, datos]);

  const lineasVisibles = useMemo(() => {
    if (!resultado) return [];
    const q = busqueda.trim().toUpperCase();
    return resultado.lineas.filter(l => {
      if (filtro !== 'todos' && l.tipo !== filtro) return false;
      if (!q) return true;
      return l.nif.includes(q) || l.nombre.toUpperCase().includes(q);
    });
  }, [resultado, busqueda, filtro]);

  const ejercicios = useMemo(
    () => ejerciciosDisponibles(datos?.facturas ?? [], datos?.gastos ?? []),
    [datos],
  );

  const generar = () => {
    if (!resultado || !datos || !validacion?.valido) return;
    const contenido = generarFichero347(resultado, datos.empresa);
    // El diseño oficial exige ISO-8859-1, no UTF-8: la Ñ tiene que salir
    // como el byte 209. Se escribe byte a byte para no dejar que el
    // navegador lo codifique en UTF-8 por su cuenta.
    const bytes = new Uint8Array(contenido.length);
    for (let i = 0; i < contenido.length; i++) bytes[i] = contenido.charCodeAt(i) & 0xff;
    const url = URL.createObjectURL(new Blob([bytes], { type: 'text/plain;charset=iso-8859-1' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreFichero347(datos.empresa);
    a.click();
    URL.revokeObjectURL(url);
  };

  if (cargando || !resultado || !validacion || !datos) return <PageSkeleton />;

  const criticos = validacion.errores;
  const avisos = validacion.avisos;

  return (
    <div className="page">
      <Link href="/listados-fiscales" className="lf-volver">
        <ArrowLeft size={16} /> Listados fiscales
      </Link>

      <header className="page-header">
        <div>
          <h1 className="page-title">Modelo 347</h1>
          <p className="page-subtitle">Declaración anual de operaciones con terceras personas</p>
        </div>
        <label className="lf-ejercicio">
          Ejercicio
          <select value={ejercicio} onChange={e => setEjercicio(Number(e.target.value))}>
            {ejercicios.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
      </header>

      {/* Estado */}
      <div className="lf-estado">
        <span className="lf-estado-ok"><ShieldCheck size={15} /> Datos calculados</span>
        {criticos.length === 0 ? (
          <span className="lf-estado-ok"><ShieldCheck size={15} /> Validación correcta</span>
        ) : (
          <span className="lf-estado-mal">
            <AlertTriangle size={15} /> {criticos.length} {criticos.length === 1 ? 'error' : 'errores'}
          </span>
        )}
        {avisos.length > 0 && (
          <span className="lf-estado-aviso">
            <AlertTriangle size={15} /> {avisos.length} {avisos.length === 1 ? 'aviso' : 'avisos'}
          </span>
        )}
        <div className="lf-acciones">
          <button className="btn" onClick={() => setRecarga(n => n + 1)} title="Volver a leer los datos">
            <RefreshCw size={15} /> Recalcular
          </button>
          <button className="btn" onClick={() => setVistaPrevia(v => !v)}>
            <Eye size={15} /> Vista previa
          </button>
          <button
            className="btn btn-primary"
            onClick={generar}
            disabled={!validacion.valido}
            title={validacion.valido ? 'Generar el fichero .347' : 'Corrige los errores antes de generar'}
          >
            <Download size={15} /> Generar fichero 347
          </button>
        </div>
      </div>

      {/* Errores, con el enlace al registro que los causa */}
      {(criticos.length > 0 || avisos.length > 0) && (
        <div className="lf-errores">
          {criticos.map((e, i) => (
            <p key={`c${i}`} className="lf-error lf-error--critico">
              <AlertTriangle size={14} />
              <span>{e.mensaje}</span>
              {e.referencia?.tipo === 'empresa' && (
                <Link href="/ajustes">Ir a Ajustes <ChevronRight size={13} /></Link>
              )}
              {e.referencia?.tipo === 'cliente' && (
                <Link href={`/clientes?buscar=${encodeURIComponent(e.referencia.id)}`}>
                  Ver ficha <ChevronRight size={13} />
                </Link>
              )}
            </p>
          ))}
          {avisos.map((a, i) => (
            <p key={`a${i}`} className="lf-error lf-error--aviso">
              <AlertTriangle size={14} /><span>{a.mensaje}</span>
            </p>
          ))}
        </div>
      )}

      {/* Resumen */}
      <div className="lf-resumen">
        <div><span>Declarados</span><strong>{resultado.totalDeclarados}</strong></div>
        <div><span>Operaciones</span><strong>{resultado.totalOperaciones}</strong></div>
        <div><span>Importe total</span><strong>{formatCurrency(resultado.importeTotal)}</strong></div>
        <div><span>Ventas (clave B)</span><strong>{formatCurrency(resultado.importeVentas)}</strong></div>
        <div><span>Compras (clave A)</span><strong>{formatCurrency(resultado.importeCompras)}</strong></div>
        <div>
          <span>Bajo umbral</span>
          <strong>{resultado.descartadosPorUmbral}</strong>
        </div>
      </div>

      {vistaPrevia && (
        <div className="lf-preview">
          <h2>Vista previa fiscal</h2>
          <p>
            Se exportarán <strong>{resultado.totalDeclarados}</strong> registros de declarado más el
            registro de declarante, con un importe total de{' '}
            <strong>{formatCurrency(resultado.importeTotal)}</strong>. Fichero{' '}
            <code>{nombreFichero347(datos.empresa)}</code>, registros de 500 posiciones,
            codificación ISO-8859-1.
          </p>
          <div className="lf-preview-trimestres">
            {([1, 2, 3, 4] as const).map(t => (
              <div key={t}>
                <span>{t}T</span>
                <strong>{formatCurrency(resultado.porTrimestre[t])}</strong>
              </div>
            ))}
          </div>
          <p className="lf-preview-nota">
            Sólo entran los terceros que superan {formatCurrency(UMBRAL_347)} en el año natural.
          </p>
        </div>
      )}

      {/* Filtros */}
      <div className="lf-filtros">
        <div className="lf-buscador">
          <Search size={15} />
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por NIF o nombre…"
            aria-label="Buscar declarado por NIF o nombre"
          />
        </div>
        {(['todos', 'venta', 'compra'] as const).map(f => (
          <button
            key={f}
            className={`filter-chip ${filtro === f ? 'active' : ''}`}
            onClick={() => setFiltro(f)}
          >
            {f === 'todos' ? 'Todos' : f === 'venta' ? 'Ventas (B)' : 'Compras (A)'}
          </button>
        ))}
      </div>

      {/* Tabla */}
      {(
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>NIF</th>
                <th>Nombre o razón social</th>
                <th>Clave</th>
                <th className="num">Total anual</th>
                <th className="num">1T</th>
                <th className="num">2T</th>
                <th className="num">3T</th>
                <th className="num">4T</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lineasVisibles.length === 0 && (
                <TableEmpty
                  colSpan={9}
                  icon={FileText}
                  title="Sin declarados"
                  hint={`Ningún tercero supera ${formatCurrency(UMBRAL_347)} en ${ejercicio}.`}
                />
              )}
              {lineasVisibles.map(l => {
                const k = `${l.nif}|${l.clave}`;
                return (
                  <Fragment key={k}>
                    <tr>
                      <td className="mono">{l.nif}</td>
                      <td>{l.nombre || <em>sin razón social</em>}</td>
                      <td>{l.clave}</td>
                      <td className="num"><strong>{formatCurrency(l.totalAnual)}</strong></td>
                      <td className="num">{formatCurrency(l.trimestres[1])}</td>
                      <td className="num">{formatCurrency(l.trimestres[2])}</td>
                      <td className="num">{formatCurrency(l.trimestres[3])}</td>
                      <td className="num">{formatCurrency(l.trimestres[4])}</td>
                      <td>
                        <button
                          className="btn btn-sm"
                          onClick={() => setDetalle(detalle === k ? null : k)}
                          aria-expanded={detalle === k}
                        >
                          {detalle === k ? 'Ocultar' : 'Detalle'}
                        </button>
                      </td>
                    </tr>
                    {detalle === k && (
                      <tr className="lf-detalle">
                        <td colSpan={9}>
                          <ul>
                            {l.documentos.map(d => (
                              <li key={d.id}>
                                <Link href={`/facturas/${d.id}`}>{d.numero}</Link>
                                <span>{d.fecha}</span>
                                <span>{formatCurrency(d.importe)}</span>
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
