'use client';

/** Modelo 111 — retenciones de IRPF practicadas, trimestral. */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { getModelo } from '@/lib/fiscal/tipos';
import { calcularModelo111, validarModelo111, casillas111 } from '@/lib/fiscal/aeat/modelo111';
import { registrarGeneracion } from '@/lib/fiscal/historial';
import ModeloShell, { Resumen, TablaCasillas, descargarTexto } from '../_componentes/ModeloShell';
import { useDatosFiscales } from '../_componentes/useDatosFiscales';
import { formatCurrency } from '@/lib/utils';

export default function Modelo111Page() {
  const d = useDatosFiscales();
  const [preview, setPreview] = useState(false);
  // Sólo en una complementaria: lo ingresado con la declaración anterior.
  const [aDeducir, setADeducir] = useState(0);
  const modelo = getModelo('111')!;

  const r = useMemo(() => {
    if (!d.datos) return null;
    return calcularModelo111({ facturas: d.datos.facturas, aDeducir }, { ejercicio: d.ejercicio, trimestre: d.trimestre });
  }, [d.datos, d.ejercicio, d.trimestre, aDeducir]);

  const validacion = useMemo(() => (r && d.datos ? validarModelo111(r, d.datos.empresa) : null), [r, d.datos]);

  if (d.cargando || !r || !d.datos) return <PageSkeleton />;

  const exportar = () => {
    const filas = casillas111(r);
    const contenido = [
      ['Modelo 111', `${d.trimestre}T ${d.ejercicio}`].join(';'),
      ['Casilla', 'Concepto', 'Importe'].join(';'),
      ...filas.map(f => [`[${f.casilla}]`, f.concepto, f.importe === null ? '' : f.importe.toFixed(2)].join(';')),
      '',
      ['NIF', 'Perceptor', 'Base', 'Retención'].join(';'),
      ...r.detalle.map(p => [p.nif, p.nombre, p.base.toFixed(2), p.retencion.toFixed(2)].join(';')),
    ].join('\r\n');
    const nombre = `111_${d.ejercicio}_${d.trimestre}T.csv`;
    descargarTexto(contenido, nombre);
    registrarGeneracion({
      modelo: '111', ejercicio: d.ejercicio, trimestre: d.trimestre,
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
          <strong>Lo presenta quien retiene.</strong> Aquí entran las facturas de <em>compra</em> con
          retención: profesionales o empresarios que te facturan y a los que pagas descontando el IRPF.
          Las retenciones que te hacen tus clientes van en tu 130, no aquí. Las nóminas no se registran
          en el programa: añádelas tú en las casillas [01] a [03].
        </p>
      </div>

      <Resumen datos={[
        { etiqueta: 'Perceptores', valor: r.perceptores },
        { etiqueta: 'Percepciones', valor: formatCurrency(r.base) },
        { etiqueta: 'Retenciones', valor: formatCurrency(r.retenciones) },
        { etiqueta: 'Resultado', valor: formatCurrency(r.resultado) },
      ]} />

      {preview && (
        <div className="lf-preview">
          <h2>Vista previa fiscal</h2>
          <p>
            {r.numFacturas} facturas de compra con retención de {r.perceptores} perceptores en el {d.trimestre}T.
            Resultado a ingresar: <strong>{formatCurrency(r.resultado)}</strong>.
          </p>
        </div>
      )}

      <div className="lf-liquidacion">
        <h2 className="lf-subtitulo">Declaración complementaria</h2>
        <dl>
          <div>
            <dt><label htmlFor="deducir">Ingresado en la declaración anterior del mismo trimestre [29]</label></dt>
            <dd>
              <input id="deducir" type="number" step="0.01" className="lf-input-num" value={aDeducir}
                onChange={e => setADeducir(Number(e.target.value) || 0)} />
            </dd>
          </div>
        </dl>
      </div>

      <h2 className="lf-subtitulo">Casillas del modelo</h2>
      <TablaCasillas filas={casillas111(r)} />

      {r.detalle.length > 0 && (
        <>
          <h2 className="lf-subtitulo">Perceptores del trimestre</h2>
          <div className="table-container">
            <table className="table">
              <thead><tr><th>NIF</th><th>Perceptor</th><th className="num">Facturas</th><th className="num">Base</th><th className="num">Retención</th></tr></thead>
              <tbody>
                {r.detalle.map(p => (
                  <tr key={`${p.nif}-${p.nombre}`}>
                    <td className="mono">{p.nif || '—'}</td>
                    <td><Link href={`/documentos/${p.facturaId}`}>{p.nombre}</Link></td>
                    <td className="num">{p.numFacturas}</td>
                    <td className="num">{formatCurrency(p.base)}</td>
                    <td className="num">{formatCurrency(p.retencion)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </ModeloShell>
  );
}
