'use client';

/** Modelo 415 — operaciones con terceros (IGIC). El «347 canario». */

import { Fragment, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { getModelo } from '@/lib/fiscal/tipos';
import { calcularModelo415, validarModelo415, exportarCsv415, UMBRAL_415 } from '@/lib/fiscal/atc/modelo415';
import { registrarGeneracion } from '@/lib/fiscal/historial';
import ModeloShell, { Resumen, descargarTexto } from '../_componentes/ModeloShell';
import { useDatosFiscales } from '../_componentes/useDatosFiscales';
import { formatCurrency } from '@/lib/utils';

type Filtro = 'todos' | 'entrega' | 'adquisicion';

export default function Modelo415Page() {
  const d = useDatosFiscales(new Date().getFullYear() - 1);
  const [preview, setPreview] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [detalle, setDetalle] = useState<string | null>(null);
  const modelo = getModelo('415')!;

  const r = useMemo(() => {
    if (!d.datos) return null;
    return calcularModelo415(
      { facturas: d.datos.facturas, gastos: d.datos.gastos, clientes: d.datos.clientes },
      { ejercicio: d.ejercicio },
    );
  }, [d.datos, d.ejercicio]);

  const validacion = useMemo(
    () => (r && d.datos ? validarModelo415(r, d.datos.empresa) : null),
    [r, d.datos],
  );

  const visibles = useMemo(() => {
    if (!r) return [];
    const q = busqueda.trim().toUpperCase();
    return r.declarados.filter(x => {
      if (filtro !== 'todos' && x.tipo !== filtro) return false;
      if (!q) return true;
      return x.nif.includes(q) || x.nombre.toUpperCase().includes(q);
    });
  }, [r, busqueda, filtro]);

  if (d.cargando || !r || !d.datos) return <PageSkeleton />;

  const exportar = () => {
    const contenido = exportarCsv415(r);
    const nombre = `415_${d.ejercicio}.csv`;
    descargarTexto(contenido, nombre);
    registrarGeneracion({
      modelo: '415', ejercicio: d.ejercicio,
      numRegistros: r.numDeclarados, resultado: null,
      estado: (validacion?.avisos.length ?? 0) > 0 ? 'con_avisos' : 'ok',
      nombreFichero: nombre, contenido,
    });
  };

  return (
    <ModeloShell
      modelo={modelo}
      ejercicio={d.ejercicio} ejercicios={d.ejercicios} onEjercicio={d.setEjercicio}
      validacion={validacion}
      onRecalcular={d.recargar}
      onVistaPrevia={() => setPreview(p => !p)}
      onGenerar={exportar}
      etiquetaGenerar="Exportar datos (CSV)"
    >
      <Resumen datos={[
        { etiqueta: 'Declarados', valor: r.numDeclarados },
        { etiqueta: 'Operaciones', valor: r.numOperaciones },
        { etiqueta: 'Importe total', valor: formatCurrency(r.importeTotal) },
        { etiqueta: 'Entregas', valor: formatCurrency(r.importeEntregas) },
        { etiqueta: 'Adquisiciones', valor: formatCurrency(r.importeAdquisiciones) },
        { etiqueta: 'Bajo umbral', valor: r.descartadosPorUmbral },
      ]} />

      {preview && (
        <div className="lf-preview">
          <h2>Vista previa fiscal</h2>
          <p>
            {r.numDeclarados} terceros por encima de {formatCurrency(UMBRAL_415)}, con un importe
            total de <strong>{formatCurrency(r.importeTotal)}</strong>.
          </p>
          <p className="lf-preview-nota">
            El fichero <code>.dec</code> que se sube a la Sede lo genera el programa de ayuda de la
            ATC. Aquí se exporta el detalle para cotejarlo.
          </p>
        </div>
      )}

      <div className="lf-filtros">
        <div className="lf-buscador">
          <Search size={15} />
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por NIF o nombre…"
            aria-label="Buscar declarado"
          />
        </div>
        {(['todos', 'entrega', 'adquisicion'] as const).map(f => (
          <button key={f} className={`filter-chip ${filtro === f ? 'active' : ''}`} onClick={() => setFiltro(f)}>
            {f === 'todos' ? 'Todos' : f === 'entrega' ? 'Entregas' : 'Adquisiciones'}
          </button>
        ))}
      </div>

      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>NIF</th><th>Nombre</th><th>Tipo</th>
              <th className="num">Importe</th>
              <th className="num">1T</th><th className="num">2T</th>
              <th className="num">3T</th><th className="num">4T</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && (
              <tr><td colSpan={9}><em>Ningún tercero supera {formatCurrency(UMBRAL_415)} en {d.ejercicio}.</em></td></tr>
            )}
            {visibles.map(x => {
              const k = `${x.nif}|${x.tipo}`;
              return (
                <Fragment key={k}>
                  <tr>
                    <td className="mono">{x.nif}</td>
                    <td>{x.nombre || <em>sin razón social</em>}</td>
                    <td>{x.tipo === 'entrega' ? 'Entrega' : 'Adquisición'}</td>
                    <td className="num"><strong>{formatCurrency(x.importe)}</strong></td>
                    <td className="num">{formatCurrency(x.trimestres[1])}</td>
                    <td className="num">{formatCurrency(x.trimestres[2])}</td>
                    <td className="num">{formatCurrency(x.trimestres[3])}</td>
                    <td className="num">{formatCurrency(x.trimestres[4])}</td>
                    <td>
                      <button className="btn btn-sm" onClick={() => setDetalle(detalle === k ? null : k)} aria-expanded={detalle === k}>
                        {detalle === k ? 'Ocultar' : 'Detalle'}
                      </button>
                    </td>
                  </tr>
                  {detalle === k && (
                    <tr className="lf-detalle">
                      <td colSpan={9}>
                        <ul>
                          {x.documentos.map(doc => (
                            <li key={doc.id}>
                              <Link href={`/facturas/${doc.id}`}>{doc.numero}</Link>
                              <span>{doc.fecha}</span>
                              <span>{formatCurrency(doc.importe)}</span>
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
    </ModeloShell>
  );
}
