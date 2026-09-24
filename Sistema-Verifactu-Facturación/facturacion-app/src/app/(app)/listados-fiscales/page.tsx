'use client';

/**
 * LISTADOS FISCALES — pantalla de entrada
 *
 * Una tarjeta por modelo, cada una con su propia pantalla. Aquí sólo se
 * calcula el resumen que se enseña en la tarjeta.
 *
 * QUÉ ENSEÑA CADA TARJETA Y POR QUÉ DICE LA VERDAD
 * ------------------------------------------------
 * El estado de un modelo no es decoración: si dice «listo para generar»
 * y luego no hay generador, el usuario se entera en el peor momento. Cada
 * tarjeta lleva la vía de presentación REAL (`via` en
 * `lib/fiscal/tipos.ts`), que sale de haber ido al diseño oficial de cada
 * organismo, no de suponerlo.
 *
 * Los modelos que no le tocan a la empresa (los de IVA si está en IGIC, y
 * al revés) se enseñan apagados en vez de esconderse: que desaparezca un
 * modelo desconcierta más que verlo marcado como «no te aplica».
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Building2, Landmark, Info, History } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { cargarDatosFiscales, ejerciciosDisponibles, regimenIndirecto } from '@/lib/fiscal/FiscalDataService';
import type { DatosFiscales } from '@/lib/fiscal/FiscalDataService';
import { MODELOS, type DefinicionModelo, type Trimestre } from '@/lib/fiscal/tipos';
import { calcularModelo347 } from '@/lib/fiscal/aeat/modelo347';
import { calcularModelo303 } from '@/lib/fiscal/aeat/modelo303';
import { calcularModelo130 } from '@/lib/fiscal/aeat/modelo130';
import { calcularModelo390 } from '@/lib/fiscal/aeat/modelo390';
import { calcularModelo349 } from '@/lib/fiscal/aeat/modelo349';
import { calcularModelo111 } from '@/lib/fiscal/aeat/modelo111';
import { calcularModelo190 } from '@/lib/fiscal/aeat/modelo190';
import { calcularModelo420 } from '@/lib/fiscal/atc/modelo420';
import { calcularModelo415 } from '@/lib/fiscal/atc/modelo415';
import { calcularModelo425 } from '@/lib/fiscal/atc/modelo425';
import { getHistorialFiscal } from '@/lib/fiscal/historial';
import type { GeneracionFiscal } from '@/lib/fiscal/tipos';
import { formatCurrency } from '@/lib/utils';

function aplicaALaEmpresa(m: DefinicionModelo, regimen: 'IVA' | 'IGIC'): boolean {
  // El 303, su resumen (390) y el 349 son del IVA; el 420/415/425 son del
  // IGIC. Los de IRPF (130, 131, 111, 190) los presenta cualquiera.
  if (m.id === '303' || m.id === '347' || m.id === '390' || m.id === '349') return regimen === 'IVA';
  if (m.id === '420' || m.id === '415' || m.id === '425') return regimen === 'IGIC';
  return true;
}

interface ResumenTarjeta {
  operaciones?: number;
  importe?: number;
  etiquetaImporte?: string;
}

export default function ListadosFiscalesPage() {
  const [datos, setDatos] = useState<DatosFiscales | null>(null);
  const [historial, setHistorial] = useState<GeneracionFiscal[]>([]);
  const [cargando, setCargando] = useState(true);
  const hoy = new Date();
  const [ejercicio, setEjercicio] = useState(hoy.getFullYear());
  const trimestre = (Math.floor(hoy.getMonth() / 3) + 1) as Trimestre;

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCargando(true);
      const [d, h] = await Promise.all([cargarDatosFiscales(ejercicio), getHistorialFiscal()]);
      if (!vivo) return;
      setDatos(d);
      setHistorial(h);
      setCargando(false);
    })();
    return () => { vivo = false; };
  }, [ejercicio]);

  const ejercicios = useMemo(
    () => ejerciciosDisponibles(datos?.facturas ?? [], datos?.gastos ?? []),
    [datos],
  );
  const regimen = regimenIndirecto(datos?.empresa);

  /** El resumen de cada tarjeta, calculado con el módulo real del modelo. */
  const resumenes = useMemo(() => {
    if (!datos) return {} as Record<string, ResumenTarjeta>;
    const f = datos.facturas, g = datos.gastos, c = datos.clientes;
    const anual = { ejercicio };
    const trim = { ejercicio, trimestre };

    const r347 = calcularModelo347({ facturas: f, gastos: g, clientes: c }, anual);
    const r303 = calcularModelo303({ facturas: f, gastos: g }, trim);
    const r130 = calcularModelo130({ facturas: f, gastos: g }, trim);
    const r420 = calcularModelo420({ facturas: f, gastos: g }, trim);
    const r415 = calcularModelo415({ facturas: f, gastos: g, clientes: c }, anual);
    const r425 = calcularModelo425({ facturas: f, gastos: g }, anual);
    const r390 = calcularModelo390({ facturas: f, gastos: g }, anual);
    const r349 = calcularModelo349({ facturas: f }, trim);
    const r111 = calcularModelo111({ facturas: f }, trim);
    const r190 = calcularModelo190({ facturas: f }, anual);

    return {
      '347': { operaciones: r347.totalOperaciones, importe: r347.importeTotal, etiquetaImporte: 'Importe' },
      '303': { operaciones: r303.numFacturas + r303.numGastos, importe: r303.resultadoLiquidacion, etiquetaImporte: 'Resultado' },
      '390': { operaciones: r390.numFacturas + r390.numGastos, importe: r390.resultadoAnual, etiquetaImporte: 'Resultado' },
      '349': { operaciones: r349.totalOperaciones, importe: r349.totalBaseImponible, etiquetaImporte: 'Base' },
      '130': { operaciones: r130.numFacturas + r130.numGastos, importe: r130.resultado, etiquetaImporte: 'Resultado' },
      '111': { operaciones: r111.numFacturas, importe: r111.resultado, etiquetaImporte: 'Retenciones' },
      '190': { operaciones: r190.perceptores.length, importe: r190.retenciones, etiquetaImporte: 'Retenciones' },
      '131': { operaciones: 0 },
      '420': { operaciones: r420.numFacturas + r420.numGastos, importe: r420.resultado, etiquetaImporte: 'Resultado' },
      '415': { operaciones: r415.numOperaciones, importe: r415.importeTotal, etiquetaImporte: 'Importe' },
      '425': { operaciones: r425.numFacturas + r425.numGastos, importe: r425.resultadoAnual, etiquetaImporte: 'Resultado' },
    } as Record<string, ResumenTarjeta>;
  }, [datos, ejercicio, trimestre]);

  if (cargando || !datos) return <PageSkeleton />;

  const tarjeta = (m: DefinicionModelo) => {
    const aplica = aplicaALaEmpresa(m, regimen);
    const s = resumenes[m.id] || {};
    const periodo = m.periodicidad === 'anual' ? `${ejercicio}` : `${trimestre}T ${ejercicio}`;

    return (
      <article key={m.id} className={`lf-card ${!aplica ? 'lf-card--na' : ''}`}>
        <header className="lf-card-head">
          <h3>{m.nombre}</h3>
          <span className={`lf-org lf-org--${m.organismo.toLowerCase()}`}>{m.organismo}</span>
        </header>
        <p className="lf-card-desc">{m.descripcion}</p>

        <dl className="lf-card-datos">
          <div><dt>Periodicidad</dt><dd>{m.periodicidad === 'anual' ? 'Anual' : 'Trimestral'}</dd></div>
          <div><dt>Periodo</dt><dd>{periodo}</dd></div>
          <div><dt>Operaciones</dt><dd>{aplica ? (s.operaciones ?? 0) : '—'}</dd></div>
          <div>
            <dt>{s.etiquetaImporte || 'Resultado'}</dt>
            <dd>{aplica && s.importe != null ? formatCurrency(s.importe) : '—'}</dd>
          </div>
        </dl>

        <p className="lf-card-estado">
          {!aplica
            ? `No te aplica: la empresa tributa en ${regimen}.`
            : m.via === 'fichero_oficial'
              ? `Genera el fichero oficial${m.extension ? ` .${m.extension}` : ''}.`
              : m.via === 'diseno_sin_generador'
                ? 'Cálculo, validación y exportación de datos. El fichero oficial todavía no se genera aquí.'
                : 'Cálculo y validación; la presentación se hace en la Sede del organismo.'}
        </p>

        {aplica ? (
          <Link href={`/listados-fiscales/${m.id}`} className="btn btn-primary lf-card-btn">
            Abrir modelo <ArrowRight size={16} />
          </Link>
        ) : (
          <button className="btn lf-card-btn" disabled>Abrir modelo</button>
        )}
      </article>
    );
  };

  const porOrganismo = (org: 'AEAT' | 'ATC') => MODELOS.filter(m => m.organismo === org);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Listados fiscales</h1>
          <p className="page-subtitle">
            Modelos calculados a partir de tus facturas y gastos. La empresa tributa en{' '}
            <strong>{regimen}</strong>.
          </p>
        </div>
        <label className="lf-ejercicio">
          Ejercicio
          <select value={ejercicio} onChange={e => setEjercicio(Number(e.target.value))}>
            {ejercicios.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
      </header>

      <div className="lf-aviso">
        <Info size={16} />
        <p>
          Estos listados preparan y validan la información. La presentación ante la AEAT o la ATC
          la haces tú en la Sede del organismo: el programa no presenta nada por ti.
        </p>
      </div>

      <section className="lf-seccion">
        <h2><Landmark size={18} /> Agencia Estatal de Administración Tributaria</h2>
        <div className="lf-grid">{porOrganismo('AEAT').map(tarjeta)}</div>
      </section>

      <section className="lf-seccion">
        <h2><Building2 size={18} /> Agencia Tributaria Canaria</h2>
        <div className="lf-grid">{porOrganismo('ATC').map(tarjeta)}</div>
      </section>

      <section className="lf-seccion">
        <h2><History size={18} /> Historial de generaciones</h2>
        {historial.length === 0 ? (
          <p className="lf-card-estado">
            Todavía no has generado ningún modelo. Aquí quedará constancia de cada fichero, con su
            contenido, para poder volver a descargarlo tal y como se presentó.
          </p>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Modelo</th><th>Ejercicio</th><th>Periodo</th><th>Generado</th>
                  <th>Usuario</th><th className="num">Registros</th>
                  <th className="num">Resultado</th><th>Estado</th><th><span className="solo-lectores">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {historial.map(h => (
                  <tr key={h.id}>
                    <td><strong>{h.modelo}</strong></td>
                    <td>{h.ejercicio}</td>
                    <td>{h.trimestre ? `${h.trimestre}T` : 'Anual'}</td>
                    <td>{new Date(h.generadoEn).toLocaleString('es-ES')}</td>
                    <td>{h.generadoPor || '—'}</td>
                    <td className="num">{h.numRegistros}</td>
                    <td className="num">{h.resultado == null ? '—' : formatCurrency(h.resultado)}</td>
                    <td>{h.estado === 'ok' ? '✓' : '⚠'}</td>
                    <td>
                      {h.contenido && h.nombreFichero && (
                        <button
                          className="btn btn-sm"
                          onClick={() => {
                            const esFicheroAeat = h.nombreFichero!.endsWith('.347') || h.nombreFichero!.endsWith('.303');
                            const bytes = new Uint8Array(h.contenido!.length);
                            for (let i = 0; i < h.contenido!.length; i++) bytes[i] = h.contenido!.charCodeAt(i) & 0xff;
                            const blob = esFicheroAeat
                              ? new Blob([bytes], { type: 'text/plain;charset=iso-8859-1' })
                              : new Blob(['﻿' + h.contenido], { type: 'text/csv;charset=utf-8' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = h.nombreFichero!;
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                        >
                          Descargar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
