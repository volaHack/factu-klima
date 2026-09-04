'use client';

/** Modelo 303 — IVA. Cálculo, validación y fichero oficial de la AEAT. */

import { useMemo, useState } from 'react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { getModelo } from '@/lib/fiscal/tipos';
import {
  calcularModelo303, validarModelo303, generarFichero303, nombreFichero303,
} from '@/lib/fiscal/aeat/modelo303';
import { registrarGeneracion } from '@/lib/fiscal/historial';
import ModeloShell, { Resumen, descargarTexto } from '../_componentes/ModeloShell';
import { useDatosFiscales } from '../_componentes/useDatosFiscales';
import { formatCurrency } from '@/lib/utils';

export default function Modelo303Page() {
  const d = useDatosFiscales();
  const [preview, setPreview] = useState(false);
  const modelo = getModelo('303')!;

  const r = useMemo(() => {
    if (!d.datos) return null;
    return calcularModelo303(
      { facturas: d.datos.facturas, gastos: d.datos.gastos },
      { ejercicio: d.ejercicio, trimestre: d.trimestre },
    );
  }, [d.datos, d.ejercicio, d.trimestre]);

  const validacion = useMemo(
    () => (r && d.datos ? validarModelo303(r, d.datos.empresa) : null),
    [r, d.datos],
  );

  if (d.cargando || !r || !d.datos) return <PageSkeleton />;

  const generar = () => {
    const contenido = generarFichero303(r, d.datos!.empresa);
    const nombre = nombreFichero303(d.datos!.empresa, r.periodo);
    descargarTexto(contenido, nombre, true);
    registrarGeneracion({
      modelo: '303', ejercicio: d.ejercicio, trimestre: d.trimestre,
      numRegistros: r.numFacturas + r.numGastos, resultado: r.resultadoLiquidacion,
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
      onGenerar={generar}
      etiquetaGenerar="Generar fichero 303"
    >
      <Resumen datos={[
        { etiqueta: 'Base devengada', valor: formatCurrency(r.baseDevengada) },
        { etiqueta: 'IVA devengado [27]', valor: formatCurrency(r.cuotaDevengada) },
        { etiqueta: 'IVA deducible [45]', valor: formatCurrency(r.cuotaDeducible) },
        { etiqueta: 'Resultado [71]', valor: formatCurrency(r.resultadoLiquidacion) },
        { etiqueta: 'Facturas', valor: r.numFacturas },
        { etiqueta: 'Gastos', valor: r.numGastos },
      ]} />

      {preview && (
        <div className="lf-preview">
          <h2>Vista previa fiscal</h2>
          <p>
            Fichero <code>{nombreFichero303(d.datos.empresa, r.periodo)}</code> con la cabecera AUX,
            la página 01 (identificación y liquidación del régimen general) y la página 03
            (resultado). Codificación ISO-8859-1, según el diseño de registro vigente.
          </p>
          <p className="lf-preview-nota">
            No se rellenan régimen simplificado, recargo de equivalencia, prorrata especial ni
            supuestos concursales: el programa no registra esos datos.
          </p>
        </div>
      )}

      <h2 className="lf-subtitulo">IVA devengado</h2>
      <div className="table-container">
        <table className="table">
          <thead>
            <tr><th>Tipo</th><th className="num">Base imponible</th><th className="num">Cuota</th></tr>
          </thead>
          <tbody>
            {r.devengado.length === 0 && (
              <tr><td colSpan={3}><em>Sin operaciones en el período.</em></td></tr>
            )}
            {r.devengado.map(t => (
              <tr key={t.tipo}>
                <td>{t.tipo}%</td>
                <td className="num">{formatCurrency(t.base)}</td>
                <td className="num">{formatCurrency(t.cuota)}</td>
              </tr>
            ))}
            <tr>
              <td><strong>Total [27]</strong></td>
              <td className="num"><strong>{formatCurrency(r.baseDevengada)}</strong></td>
              <td className="num"><strong>{formatCurrency(r.cuotaDevengada)}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 className="lf-subtitulo">IVA soportado deducible</h2>
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Tipo de operación</th><th>Casillas</th>
              <th className="num">Base</th><th className="num">Cuota deducible</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Interiores corrientes', '[28][29]', r.soportado.interiorCorriente],
              ['Interiores con bienes de inversión', '[30][31]', r.soportado.interiorInversion],
              ['Importaciones corrientes', '[32][33]', r.soportado.importacionCorriente],
              ['Importaciones de bienes de inversión', '[34][35]', r.soportado.importacionInversion],
              ['Adq. intracomunitarias corrientes', '[36][37]', r.soportado.intracomunitariaCorriente],
              ['Adq. intracomunitarias de inversión', '[38][39]', r.soportado.intracomunitariaInversion],
            ].map(([etiqueta, casillas, v]) => {
              const val = v as { base: number; cuota: number };
              return (
                <tr key={etiqueta as string}>
                  <td>{etiqueta as string}</td>
                  <td className="mono">{casillas as string}</td>
                  <td className="num">{formatCurrency(val.base)}</td>
                  <td className="num">{formatCurrency(val.cuota)}</td>
                </tr>
              );
            })}
            <tr>
              <td><strong>Total a deducir</strong></td>
              <td className="mono"><strong>[45]</strong></td>
              <td className="num" />
              <td className="num"><strong>{formatCurrency(r.cuotaDeducible)}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="lf-liquidacion">
        <h2 className="lf-subtitulo">Liquidación</h2>
        <dl>
          <div><dt>IVA devengado [27]</dt><dd>{formatCurrency(r.cuotaDevengada)}</dd></div>
          <div><dt>IVA deducible [45]</dt><dd>−{formatCurrency(r.cuotaDeducible)}</dd></div>
          <div className="lf-liquidacion-total">
            <dt>Resultado [71]</dt><dd>{formatCurrency(r.resultadoLiquidacion)}</dd>
          </div>
        </dl>
      </div>
    </ModeloShell>
  );
}
