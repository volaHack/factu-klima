'use client';

/** Modelo 130 — pago fraccionado del IRPF en estimación directa. */

import { useMemo, useState } from 'react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { getModelo } from '@/lib/fiscal/tipos';
import { calcularModelo130, validarModelo130, casillas130 } from '@/lib/fiscal/aeat/modelo130';
import { registrarGeneracion } from '@/lib/fiscal/historial';
import ModeloShell, { Resumen, TablaCasillas, descargarTexto } from '../_componentes/ModeloShell';
import { useDatosFiscales } from '../_componentes/useDatosFiscales';
import { formatCurrency } from '@/lib/utils';

export default function Modelo130Page() {
  const d = useDatosFiscales();
  const [preview, setPreview] = useState(false);
  // Lo ya pagado en trimestres anteriores del mismo año. No sale de las
  // facturas: sale de los 130 ya presentados.
  const [pagosAnteriores, setPagosAnteriores] = useState(0);
  const modelo = getModelo('130')!;

  const r = useMemo(() => {
    if (!d.datos) return null;
    return calcularModelo130(
      { facturas: d.datos.facturas, gastos: d.datos.gastos, pagosAnteriores },
      { ejercicio: d.ejercicio, trimestre: d.trimestre },
    );
  }, [d.datos, d.ejercicio, d.trimestre, pagosAnteriores]);

  const validacion = useMemo(
    () => (r && d.datos ? validarModelo130(r, d.datos.empresa) : null),
    [r, d.datos],
  );

  if (d.cargando || !r || !d.datos) return <PageSkeleton />;

  const exportar = () => {
    const filas = casillas130(r);
    const contenido = [
      ['Modelo 130', `${d.trimestre}T ${d.ejercicio}`].join(';'),
      ['Casilla', 'Concepto', 'Importe'].join(';'),
      ...filas.map(f => [`[${f.casilla}]`, f.concepto, f.importe.toFixed(2)].join(';')),
    ].join('\r\n');
    const nombre = `130_${d.ejercicio}_${d.trimestre}T.csv`;
    descargarTexto(contenido, nombre);
    registrarGeneracion({
      modelo: '130', ejercicio: d.ejercicio, trimestre: d.trimestre,
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
      etiquetaGenerar="Exportar casillas (CSV)"
    >
      <div className="lf-aviso">
        <p>
          <strong>El 130 es acumulado.</strong> Las cifras no son las del trimestre suelto: van
          desde el 1 de enero hasta el {new Date(r.hasta).toLocaleDateString('es-ES')}, y de ahí se
          restan los pagos fraccionados que ya hiciste.
        </p>
      </div>

      <Resumen datos={[
        { etiqueta: 'Ingresos acumulados', valor: formatCurrency(r.ingresos) },
        { etiqueta: 'Gastos acumulados', valor: formatCurrency(r.gastos) },
        { etiqueta: 'Rendimiento neto', valor: formatCurrency(r.rendimientoNeto) },
        { etiqueta: 'Pago fraccionado (20%)', valor: formatCurrency(r.pagoFraccionado) },
        { etiqueta: 'Retenciones', valor: formatCurrency(r.retenciones) },
        { etiqueta: 'Resultado', valor: formatCurrency(r.resultado) },
      ]} />

      {preview && (
        <div className="lf-preview">
          <h2>Vista previa fiscal</h2>
          <p>
            {r.numFacturas} facturas y {r.numGastos} gastos acumulados hasta el{' '}
            {new Date(r.hasta).toLocaleDateString('es-ES')}. Resultado a ingresar:{' '}
            <strong>{formatCurrency(r.resultado)}</strong>.
          </p>
          <p className="lf-preview-nota">
            El 130 se presenta por formulario en la Sede de la AEAT: copia las casillas de abajo.
          </p>
        </div>
      )}

      <div className="lf-liquidacion">
        <h2 className="lf-subtitulo">Pagos fraccionados anteriores</h2>
        <dl>
          <div>
            <dt><label htmlFor="pagos">Suma de las casillas [07] ya presentadas este año</label></dt>
            <dd>
              <input
                id="pagos" type="number" step="0.01" className="lf-input-num"
                value={pagosAnteriores}
                onChange={e => setPagosAnteriores(Number(e.target.value) || 0)}
              />
            </dd>
          </div>
        </dl>
      </div>

      <h2 className="lf-subtitulo">Casillas del modelo</h2>
      <TablaCasillas filas={casillas130(r)} />
    </ModeloShell>
  );
}
