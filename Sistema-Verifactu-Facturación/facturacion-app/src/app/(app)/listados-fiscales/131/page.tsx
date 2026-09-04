'use client';

/**
 * Modelo 131 — pago fraccionado del IRPF en estimación objetiva.
 *
 * El rendimiento de módulos NO sale de las facturas: lo pone el usuario a
 * partir de su Orden de módulos. La pantalla lo pide explícitamente en
 * vez de calcular algo parecido y llamarlo rendimiento.
 */

import { useMemo, useState } from 'react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { getModelo } from '@/lib/fiscal/tipos';
import {
  calcularModelo131, validarModelo131, casillas131, PORCENTAJE_131, LIMITE_MODULOS,
} from '@/lib/fiscal/aeat/modelo131';
import { registrarGeneracion } from '@/lib/fiscal/historial';
import ModeloShell, { Resumen, TablaCasillas, descargarTexto } from '../_componentes/ModeloShell';
import { useDatosFiscales } from '../_componentes/useDatosFiscales';
import { formatCurrency } from '@/lib/utils';

export default function Modelo131Page() {
  const d = useDatosFiscales();
  const [preview, setPreview] = useState(false);
  const [rendimiento, setRendimiento] = useState<string>('');
  const [porcentaje, setPorcentaje] = useState(PORCENTAJE_131);
  const modelo = getModelo('131')!;

  const r = useMemo(() => {
    if (!d.datos) return null;
    return calcularModelo131(
      {
        facturas: d.datos.facturas,
        rendimientoNetoPrevio: rendimiento === '' ? null : Number(rendimiento),
        porcentaje,
      },
      { ejercicio: d.ejercicio, trimestre: d.trimestre },
    );
  }, [d.datos, d.ejercicio, d.trimestre, rendimiento, porcentaje]);

  const validacion = useMemo(
    () => (r && d.datos ? validarModelo131(r, d.datos.empresa) : null),
    [r, d.datos],
  );

  if (d.cargando || !r || !d.datos) return <PageSkeleton />;

  const exportar = () => {
    const contenido = [
      ['Modelo 131', `${d.trimestre}T ${d.ejercicio}`].join(';'),
      ['Casilla', 'Concepto', 'Importe'].join(';'),
      ...casillas131(r).map(f =>
        [`[${f.casilla}]`, f.concepto, f.importe === null ? '' : f.importe.toFixed(2)].join(';')),
    ].join('\r\n');
    const nombre = `131_${d.ejercicio}_${d.trimestre}T.csv`;
    descargarTexto(contenido, nombre);
    registrarGeneracion({
      modelo: '131', ejercicio: d.ejercicio, trimestre: d.trimestre,
      numRegistros: r.numFacturas, resultado: r.resultado,
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
          <strong>En módulos el rendimiento no depende de lo facturado.</strong> Sale de los signos,
          índices y módulos de tu actividad (personal, superficie, potencia…), que fija la Orden
          ministerial de cada año. El programa no los guarda, así que ese dato lo pones tú aquí; lo
          demás sí lo calcula.
        </p>
      </div>

      <div className="lf-liquidacion">
        <h2 className="lf-subtitulo">Datos de tu Orden de módulos</h2>
        <dl>
          <div>
            <dt><label htmlFor="rend">Rendimiento neto previo</label></dt>
            <dd>
              <input
                id="rend" type="number" step="0.01" className="lf-input-num"
                value={rendimiento} placeholder="0,00"
                onChange={e => setRendimiento(e.target.value)}
              />
            </dd>
          </div>
          <div>
            <dt><label htmlFor="pct">Porcentaje aplicable</label></dt>
            <dd>
              <input
                id="pct" type="number" step="0.1" className="lf-input-num"
                value={porcentaje}
                onChange={e => setPorcentaje(Number(e.target.value) || 0)}
              />
            </dd>
          </div>
        </dl>
      </div>

      <Resumen datos={[
        { etiqueta: 'Rendimiento de módulos', valor: r.rendimientoNetoPrevio === null ? '—' : formatCurrency(r.rendimientoNetoPrevio) },
        { etiqueta: `Pago fraccionado (${r.porcentaje}%)`, valor: formatCurrency(r.pagoFraccionado) },
        { etiqueta: 'Retenciones', valor: formatCurrency(r.retenciones) },
        { etiqueta: 'Resultado', valor: r.resultado === null ? '—' : formatCurrency(r.resultado) },
        { etiqueta: 'Facturado en el trimestre', valor: formatCurrency(r.ingresosTrimestre) },
        { etiqueta: 'Facturado en el año', valor: formatCurrency(r.ingresosAcumulados) },
      ]} />

      {preview && (
        <div className="lf-preview">
          <h2>Vista previa fiscal</h2>
          <p>
            {r.resultado === null
              ? 'Falta el rendimiento neto previo: sin él no hay liquidación que presentar.'
              : <>Resultado a ingresar: <strong>{formatCurrency(r.resultado)}</strong>.</>}
          </p>
          <p className="lf-preview-nota">
            Límite general de módulos: {formatCurrency(LIMITE_MODULOS)} al año. Llevas{' '}
            {formatCurrency(r.ingresosAcumulados)}.
          </p>
        </div>
      )}

      <h2 className="lf-subtitulo">Casillas del modelo</h2>
      <TablaCasillas filas={casillas131(r)} />
    </ModeloShell>
  );
}
