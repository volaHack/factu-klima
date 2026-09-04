'use client';

/** Modelo 420 — IGIC trimestral. Cálculo, validación y exportación. */

import { useMemo, useState } from 'react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { getModelo } from '@/lib/fiscal/tipos';
import { calcularModelo420, validarModelo420, exportarCsv420 } from '@/lib/fiscal/atc/modelo420';
import { registrarGeneracion } from '@/lib/fiscal/historial';
import ModeloShell, { Resumen, descargarTexto } from '../_componentes/ModeloShell';
import { useDatosFiscales } from '../_componentes/useDatosFiscales';
import { formatCurrency } from '@/lib/utils';

export default function Modelo420Page() {
  const d = useDatosFiscales();
  const [preview, setPreview] = useState(false);
  // Lo que quedó a compensar del trimestre anterior. No se puede deducir
  // de las facturas: sale del 420 que ya se presentó, así que lo pone el
  // usuario.
  const [compensaciones, setCompensaciones] = useState(0);
  const modelo = getModelo('420')!;

  const r = useMemo(() => {
    if (!d.datos) return null;
    return calcularModelo420(
      { facturas: d.datos.facturas, gastos: d.datos.gastos, compensacionesAnteriores: compensaciones },
      { ejercicio: d.ejercicio, trimestre: d.trimestre },
    );
  }, [d.datos, d.ejercicio, d.trimestre, compensaciones]);

  const validacion = useMemo(
    () => (r && d.datos ? validarModelo420(r, d.datos.empresa) : null),
    [r, d.datos],
  );

  if (d.cargando || !r || !d.datos) return <PageSkeleton />;

  const exportar = () => {
    const contenido = exportarCsv420(r);
    const nombre = `420_${d.ejercicio}_${d.trimestre}T.csv`;
    descargarTexto(contenido, nombre);
    registrarGeneracion({
      modelo: '420', ejercicio: d.ejercicio, trimestre: d.trimestre,
      numRegistros: r.numFacturas + r.numGastos, resultado: r.resultado,
      estado: (validacion?.avisos.length ?? 0) > 0 ? 'con_avisos' : 'ok',
      nombreFichero: nombre, contenido,
    });
  };

  return (
    <ModeloShell
      modelo={modelo}
      ejercicio={d.ejercicio} ejercicios={d.ejercicios} onEjercicio={d.setEjercicio}
      trimestre={d.trimestre} onTrimestre={d.setTrimestre}
      validacion={validacion}
      onRecalcular={d.recargar}
      onVistaPrevia={() => setPreview(p => !p)}
      onGenerar={exportar}
      etiquetaGenerar="Exportar datos (CSV)"
    >
      <Resumen datos={[
        { etiqueta: 'Base repercutida', valor: formatCurrency(r.baseRepercutida) },
        { etiqueta: 'IGIC repercutido', valor: formatCurrency(r.totalRepercutido) },
        { etiqueta: 'IGIC soportado', valor: formatCurrency(r.totalSoportado) },
        { etiqueta: 'IGIC deducible', valor: formatCurrency(r.totalDeducible) },
        { etiqueta: 'Resultado', valor: formatCurrency(r.resultado) },
        { etiqueta: 'Al 0 %', valor: formatCurrency(r.baseSinCuota) },
      ]} />

      {preview && (
        <div className="lf-preview">
          <h2>Vista previa fiscal</h2>
          <p>
            Se exportarán {r.numFacturas} facturas y {r.numGastos} gastos del {d.trimestre}T
            de {d.ejercicio}, con un resultado de <strong>{formatCurrency(r.resultado)}</strong>.
          </p>
          <p className="lf-preview-nota">
            El CSV es para cotejar y archivar. La presentación del 420 se hace en la Sede de la ATC.
          </p>
        </div>
      )}

      <h2 className="lf-subtitulo">IGIC repercutido</h2>
      <div className="table-container">
        <table className="table">
          <thead>
            <tr><th>Tipo</th><th className="num">Base imponible</th><th className="num">Cuota</th></tr>
          </thead>
          <tbody>
            {r.repercutido.length === 0 && (
              <tr><td colSpan={3}><em>Sin operaciones con cuota en el trimestre.</em></td></tr>
            )}
            {r.repercutido.map(t => (
              <tr key={t.tipo}>
                <td>{t.tipo}%</td>
                <td className="num">{formatCurrency(t.base)}</td>
                <td className="num">{formatCurrency(t.cuota)}</td>
              </tr>
            ))}
            <tr>
              <td><strong>Total</strong></td>
              <td className="num"><strong>{formatCurrency(r.baseRepercutida)}</strong></td>
              <td className="num"><strong>{formatCurrency(r.totalRepercutido)}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 className="lf-subtitulo">IGIC soportado</h2>
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Tipo</th><th className="num">Base</th>
              <th className="num">Cuota soportada</th><th className="num">Cuota deducible</th>
            </tr>
          </thead>
          <tbody>
            {r.soportadoPorTipo.length === 0 && (
              <tr><td colSpan={4}><em>Sin gastos registrados en el trimestre.</em></td></tr>
            )}
            {r.soportadoPorTipo.map(l => (
              <tr key={l.tipo}>
                <td>{l.tipo}%</td>
                <td className="num">{formatCurrency(l.base)}</td>
                <td className="num">{formatCurrency(l.cuotaSoportada)}</td>
                <td className="num">{formatCurrency(l.cuotaDeducible)}</td>
              </tr>
            ))}
            <tr>
              <td><strong>Total</strong></td>
              <td className="num" />
              <td className="num"><strong>{formatCurrency(r.totalSoportado)}</strong></td>
              <td className="num"><strong>{formatCurrency(r.totalDeducible)}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="lf-liquidacion">
        <h2 className="lf-subtitulo">Liquidación</h2>
        <dl>
          <div><dt>IGIC repercutido</dt><dd>{formatCurrency(r.totalRepercutido)}</dd></div>
          <div><dt>IGIC soportado deducible</dt><dd>−{formatCurrency(r.totalDeducible)}</dd></div>
          <div>
            <dt>
              <label htmlFor="comp">Compensaciones de periodos anteriores</label>
            </dt>
            <dd>
              <input
                id="comp"
                type="number"
                step="0.01"
                className="lf-input-num"
                value={compensaciones}
                onChange={e => setCompensaciones(Number(e.target.value) || 0)}
              />
            </dd>
          </div>
          <div className="lf-liquidacion-total">
            <dt>Resultado</dt><dd>{formatCurrency(r.resultado)}</dd>
          </div>
        </dl>
      </div>
    </ModeloShell>
  );
}
