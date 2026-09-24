'use client';

/** Modelo 190 — resumen anual de retenciones, por perceptor. */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { getModelo, type Trimestre } from '@/lib/fiscal/tipos';
import { calcularModelo190, validarModelo190, exportarCsv190 } from '@/lib/fiscal/aeat/modelo190';
import { registrarGeneracion } from '@/lib/fiscal/historial';
import ModeloShell, { Resumen, descargarTexto } from '../_componentes/ModeloShell';
import { useDatosFiscales } from '../_componentes/useDatosFiscales';
import { formatCurrency } from '@/lib/utils';

const TRIMESTRES: Trimestre[] = [1, 2, 3, 4];

export default function Modelo190Page() {
  const d = useDatosFiscales(new Date().getFullYear() - 1);
  const [preview, setPreview] = useState(false);
  const modelo = getModelo('190')!;

  const r = useMemo(() => (d.datos ? calcularModelo190({ facturas: d.datos.facturas }, { ejercicio: d.ejercicio }) : null), [d.datos, d.ejercicio]);
  const validacion = useMemo(() => (r && d.datos ? validarModelo190(r, d.datos.empresa) : null), [r, d.datos]);

  if (d.cargando || !r || !d.datos) return <PageSkeleton />;

  const exportar = () => {
    const contenido = exportarCsv190(r);
    const nombre = `190_${d.ejercicio}.csv`;
    descargarTexto(contenido, nombre);
    registrarGeneracion({
      modelo: '190', ejercicio: d.ejercicio,
      numRegistros: r.perceptores.length, resultado: r.retenciones,
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
      etiquetaGenerar="Exportar perceptores (CSV)"
    >
      <Resumen datos={[
        { etiqueta: 'Perceptores', valor: r.perceptores.length },
        { etiqueta: 'Percepciones', valor: formatCurrency(r.base) },
        { etiqueta: 'Retenciones', valor: formatCurrency(r.retenciones) },
        { etiqueta: 'Facturas', valor: r.numFacturas },
      ]} />

      {preview && (
        <div className="lf-preview">
          <h2>Vista previa fiscal</h2>
          <p>Retenciones de {d.ejercicio} por trimestre, calculadas igual que cada 111:</p>
          <div className="lf-preview-trimestres">
            {TRIMESTRES.map(t => (
              <div key={t}><span>{t}T</span><strong>{formatCurrency(r.trimestres[t].retenciones)}</strong></div>
            ))}
          </div>
        </div>
      )}

      <h2 className="lf-subtitulo">Perceptores (clave G · actividades profesionales)</h2>
      {r.perceptores.length === 0 ? (
        <p className="lf-card-estado">No hay facturas de compra con retención en {d.ejercicio}.</p>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead><tr><th>NIF</th><th>Perceptor</th><th>Clave</th><th className="num">Facturas</th><th className="num">Percepciones</th><th className="num">Retenciones</th></tr></thead>
            <tbody>
              {r.perceptores.map(p => (
                <tr key={`${p.nif}-${p.nombre}`}>
                  <td className="mono">{p.nif || '—'}</td>
                  <td><Link href={`/documentos/${p.facturaId}`}>{p.nombre}</Link></td>
                  <td>{p.clave}</td>
                  <td className="num">{p.numFacturas}</td>
                  <td className="num">{formatCurrency(p.base)}</td>
                  <td className="num">{formatCurrency(p.retencion)}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={4}><strong>Total</strong></td>
                <td className="num"><strong>{formatCurrency(r.base)}</strong></td>
                <td className="num"><strong>{formatCurrency(r.retenciones)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </ModeloShell>
  );
}
