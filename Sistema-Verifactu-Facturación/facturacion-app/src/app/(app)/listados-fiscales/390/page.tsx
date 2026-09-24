'use client';

/** Modelo 390 — resumen anual del IVA, a partir de los cuatro 303. */

import { useMemo, useState } from 'react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { getModelo, type Trimestre } from '@/lib/fiscal/tipos';
import { calcularModelo390, validarModelo390, exportarCsv390 } from '@/lib/fiscal/aeat/modelo390';
import { registrarGeneracion } from '@/lib/fiscal/historial';
import ModeloShell, { Resumen, descargarTexto } from '../_componentes/ModeloShell';
import { useDatosFiscales } from '../_componentes/useDatosFiscales';
import { formatCurrency } from '@/lib/utils';

const TRIMESTRES: Trimestre[] = [1, 2, 3, 4];

export default function Modelo390Page() {
  const d = useDatosFiscales(new Date().getFullYear() - 1);
  const [preview, setPreview] = useState(false);
  const modelo = getModelo('390')!;

  const r = useMemo(() => (d.datos ? calcularModelo390({ facturas: d.datos.facturas, gastos: d.datos.gastos }, { ejercicio: d.ejercicio }) : null), [d.datos, d.ejercicio]);
  const validacion = useMemo(() => (r && d.datos ? validarModelo390(r, d.datos.empresa) : null), [r, d.datos]);

  if (d.cargando || !r || !d.datos) return <PageSkeleton />;

  const exportar = () => {
    const contenido = exportarCsv390(r);
    const nombre = `390_${d.ejercicio}.csv`;
    descargarTexto(contenido, nombre);
    registrarGeneracion({
      modelo: '390', ejercicio: d.ejercicio,
      numRegistros: r.numFacturas + r.numGastos, resultado: r.resultadoAnual,
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
        { etiqueta: 'Base devengada', valor: formatCurrency(r.baseDevengada) },
        { etiqueta: 'IVA devengado', valor: formatCurrency(r.cuotaDevengada) },
        { etiqueta: 'IVA deducible', valor: formatCurrency(r.cuotaDeducible) },
        { etiqueta: 'Resultado anual', valor: formatCurrency(r.resultadoAnual) },
        { etiqueta: 'Facturas', valor: r.numFacturas },
        { etiqueta: 'Gastos', valor: r.numGastos },
      ]} />

      {preview && (
        <div className="lf-preview">
          <h2>Vista previa fiscal</h2>
          <p>Resultado de cada 303 de {d.ejercicio}, calculado con el mismo motor:</p>
          <div className="lf-preview-trimestres">
            {TRIMESTRES.map(t => (
              <div key={t}><span>{t}T</span><strong>{formatCurrency(r.trimestres[t].resultadoRegimenGeneral)}</strong></div>
            ))}
          </div>
        </div>
      )}

      <h2 className="lf-subtitulo">IVA devengado por tipo</h2>
      <div className="table-container">
        <table className="table">
          <thead><tr><th>Tipo</th><th className="num">Base</th><th className="num">Cuota</th></tr></thead>
          <tbody>
            {r.devengado.length === 0 ? (
              <tr><td colSpan={3}>Sin ventas en {d.ejercicio}.</td></tr>
            ) : r.devengado.map(x => (
              <tr key={x.tipo}>
                <td>{x.tipo.toLocaleString('es-ES')} %</td>
                <td className="num">{formatCurrency(x.base)}</td>
                <td className="num">{formatCurrency(x.cuota)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="lf-subtitulo">Los cuatro trimestres</h2>
      <div className="table-container">
        <table className="table">
          <thead>
            <tr><th>Trimestre</th><th className="num">Base devengada</th><th className="num">IVA devengado</th><th className="num">IVA deducible</th><th className="num">Resultado</th></tr>
          </thead>
          <tbody>
            {TRIMESTRES.map(t => {
              const q = r.trimestres[t];
              return (
                <tr key={t}>
                  <td><strong>{t}T</strong></td>
                  <td className="num">{formatCurrency(q.baseDevengada)}</td>
                  <td className="num">{formatCurrency(q.cuotaDevengada)}</td>
                  <td className="num">{formatCurrency(q.cuotaDeducible)}</td>
                  <td className="num">{formatCurrency(q.resultadoRegimenGeneral)}</td>
                </tr>
              );
            })}
            <tr>
              <td><strong>Anual</strong></td>
              <td className="num"><strong>{formatCurrency(r.baseDevengada)}</strong></td>
              <td className="num"><strong>{formatCurrency(r.cuotaDevengada)}</strong></td>
              <td className="num"><strong>{formatCurrency(r.cuotaDeducible)}</strong></td>
              <td className="num"><strong>{formatCurrency(r.resultadoAnual)}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>
    </ModeloShell>
  );
}
