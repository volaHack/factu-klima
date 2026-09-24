'use client';

/** Modelo 349 — operaciones intracomunitarias, trimestral. */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { getModelo } from '@/lib/fiscal/tipos';
import { calcularModelo349, validarModelo349, exportarCsv349 } from '@/lib/fiscal/aeat/modelo349';
import { registrarGeneracion } from '@/lib/fiscal/historial';
import ModeloShell, { Resumen, descargarTexto } from '../_componentes/ModeloShell';
import { useDatosFiscales } from '../_componentes/useDatosFiscales';
import { formatCurrency } from '@/lib/utils';

const CLAVES: Record<string, string> = {
  E: 'Entregas de bienes', A: 'Adquisiciones de bienes', T: 'Operaciones triangulares',
  S: 'Servicios prestados', I: 'Servicios adquiridos',
};

export default function Modelo349Page() {
  const d = useDatosFiscales();
  const [preview, setPreview] = useState(false);
  const modelo = getModelo('349')!;

  const r = useMemo(() => (d.datos ? calcularModelo349({ facturas: d.datos.facturas }, { ejercicio: d.ejercicio, trimestre: d.trimestre }) : null), [d.datos, d.ejercicio, d.trimestre]);
  const validacion = useMemo(() => (r && d.datos ? validarModelo349(r, d.datos.empresa) : null), [r, d.datos]);

  if (d.cargando || !r || !d.datos) return <PageSkeleton />;

  const exportar = () => {
    const contenido = exportarCsv349(r);
    const nombre = `349_${d.ejercicio}_${d.trimestre}T.csv`;
    descargarTexto(contenido, nombre);
    registrarGeneracion({
      modelo: '349', ejercicio: d.ejercicio, trimestre: d.trimestre,
      numRegistros: r.totalOperaciones, resultado: r.totalBaseImponible,
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
      etiquetaGenerar="Exportar operadores (CSV)"
    >
      <Resumen datos={[
        { etiqueta: 'Operadores', valor: r.totalOperaciones },
        { etiqueta: 'Base imponible total', valor: formatCurrency(r.totalBaseImponible) },
      ]} />

      {preview && (
        <div className="lf-preview">
          <h2>Vista previa fiscal</h2>
          <p>
            {r.totalOperaciones} operadores en el {d.trimestre}T {d.ejercicio}, agrupados por NIF-IVA y
            clave como en <Link href="/intracomunitarias">Intracomunitarias</Link>.
          </p>
        </div>
      )}

      <h2 className="lf-subtitulo">Operadores intracomunitarios</h2>
      {r.operaciones.length === 0 ? (
        <p className="lf-card-estado">No hay operaciones intracomunitarias en el {d.trimestre}T {d.ejercicio}.</p>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead><tr><th>País</th><th>NIF-IVA</th><th>Operador</th><th>Clave</th><th className="num">Base imponible</th></tr></thead>
            <tbody>
              {r.operaciones.map(o => (
                <tr key={`${o.codigoPais}${o.vatNumber}-${o.claveOperacion}`}>
                  <td>{o.codigoPais}</td>
                  <td className="mono">{o.vatNumber}</td>
                  <td>{o.nombreRazon}</td>
                  <td title={CLAVES[o.claveOperacion]}>{o.claveOperacion} · {CLAVES[o.claveOperacion]}</td>
                  <td className="num">{formatCurrency(o.baseImponible)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ModeloShell>
  );
}
