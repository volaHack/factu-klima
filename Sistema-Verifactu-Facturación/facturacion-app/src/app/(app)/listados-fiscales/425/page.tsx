'use client';

/** Modelo 425 — resumen anual del IGIC, a partir de los cuatro 420. */

import { useMemo, useState } from 'react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { getModelo, type Trimestre } from '@/lib/fiscal/tipos';
import { calcularModelo425, validarModelo425, exportarCsv425 } from '@/lib/fiscal/atc/modelo425';
import { registrarGeneracion } from '@/lib/fiscal/historial';
import ModeloShell, { Resumen, descargarTexto } from '../_componentes/ModeloShell';
import { useDatosFiscales } from '../_componentes/useDatosFiscales';
import { formatCurrency } from '@/lib/utils';

const TRIMESTRES: Trimestre[] = [1, 2, 3, 4];

export default function Modelo425Page() {
  const d = useDatosFiscales(new Date().getFullYear() - 1);
  const [preview, setPreview] = useState(false);
  const modelo = getModelo('425')!;

  const r = useMemo(() => {
    if (!d.datos) return null;
    return calcularModelo425(
      { facturas: d.datos.facturas, gastos: d.datos.gastos },
      { ejercicio: d.ejercicio },
    );
  }, [d.datos, d.ejercicio]);

  const validacion = useMemo(
    () => (r && d.datos ? validarModelo425(r, d.datos.empresa) : null),
    [r, d.datos],
  );

  if (d.cargando || !r || !d.datos) return <PageSkeleton />;

  const exportar = () => {
    const contenido = exportarCsv425(r);
    const nombre = `425_${d.ejercicio}.csv`;
    descargarTexto(contenido, nombre);
    registrarGeneracion({
      modelo: '425', ejercicio: d.ejercicio,
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
        { etiqueta: 'Base repercutida', valor: formatCurrency(r.baseRepercutidaAnual) },
        { etiqueta: 'IGIC repercutido', valor: formatCurrency(r.repercutidoAnual) },
        { etiqueta: 'IGIC deducible', valor: formatCurrency(r.deducibleAnual) },
        { etiqueta: 'Resultado anual', valor: formatCurrency(r.resultadoAnual) },
        { etiqueta: 'Facturas', valor: r.numFacturas },
        { etiqueta: 'Al 0 %', valor: formatCurrency(r.baseSinCuotaAnual) },
      ]} />

      {preview && (
        <div className="lf-preview">
          <h2>Vista previa fiscal</h2>
          <p>
            Resumen de {d.ejercicio} con los cuatro trimestres calculados con el mismo motor que el
            420, para que cuadren al céntimo con lo que se presentó cada trimestre.
          </p>
          <div className="lf-preview-trimestres">
            {TRIMESTRES.map(t => (
              <div key={t}>
                <span>{t}T</span>
                <strong>{formatCurrency(r.trimestres[t].resultado)}</strong>
              </div>
            ))}
          </div>
        </div>
      )}

      <h2 className="lf-subtitulo">Los cuatro trimestres</h2>
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Trimestre</th>
              <th className="num">Base repercutida</th>
              <th className="num">IGIC repercutido</th>
              <th className="num">IGIC deducible</th>
              <th className="num">Resultado</th>
            </tr>
          </thead>
          <tbody>
            {TRIMESTRES.map(t => {
              const q = r.trimestres[t];
              return (
                <tr key={t}>
                  <td><strong>{t}T</strong></td>
                  <td className="num">{formatCurrency(q.baseRepercutida)}</td>
                  <td className="num">{formatCurrency(q.totalRepercutido)}</td>
                  <td className="num">{formatCurrency(q.totalDeducible)}</td>
                  <td className="num">{formatCurrency(q.resultado)}</td>
                </tr>
              );
            })}
            <tr>
              <td><strong>Anual</strong></td>
              <td className="num"><strong>{formatCurrency(r.baseRepercutidaAnual)}</strong></td>
              <td className="num"><strong>{formatCurrency(r.repercutidoAnual)}</strong></td>
              <td className="num"><strong>{formatCurrency(r.deducibleAnual)}</strong></td>
              <td className="num"><strong>{formatCurrency(r.resultadoAnual)}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>
    </ModeloShell>
  );
}
