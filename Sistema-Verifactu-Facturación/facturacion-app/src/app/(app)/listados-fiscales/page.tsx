'use client';

/**
 * LISTADOS FISCALES — pantalla de entrada
 *
 * Una tarjeta por modelo. Cada modelo es una pantalla aparte con sus
 * propios filtros, cálculos y validaciones: aquí no se calcula nada más
 * que el resumen que se enseña en la tarjeta.
 *
 * QUÉ ENSEÑA CADA TARJETA Y POR QUÉ DICE LA VERDAD
 * ------------------------------------------------
 * El estado de un modelo no es decorativo: si dice «listo para generar»
 * y luego no hay generador, el usuario se entera en el peor momento. Así
 * que cada tarjeta lleva la vía de presentación real (`via` en
 * `lib/fiscal/tipos.ts`), que sale de haber ido al diseño oficial de cada
 * organismo, y los modelos que todavía no están implementados lo dicen.
 *
 * Los modelos que no le tocan a la empresa (los de IVA si está en IGIC, y
 * al revés) se enseñan apagados en vez de esconderse: que no aparezca un
 * modelo es más desconcertante que verlo marcado como «no te aplica».
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Building2, Landmark, Info } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { getInvoices, getCompanySettings } from '@/lib/storage';
import { MODELOS, type DefinicionModelo } from '@/lib/fiscal/tipos';
import { ejerciciosDisponibles, regimenIndirecto } from '@/lib/fiscal/FiscalDataService';
import { calcularModelo347 } from '@/lib/fiscal/aeat/modelo347';
import type { CompanySettings, Invoice } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';

/** Los modelos implementados de verdad. El resto se enseña, pero no se abre. */
const IMPLEMENTADOS = new Set<string>(['347']);

function aplicaALaEmpresa(m: DefinicionModelo, regimen: 'IVA' | 'IGIC'): boolean {
  // El 303 es del IVA; el 420/415/425 son del IGIC. El 347 y los pagos
  // fraccionados de IRPF (130/131) los presenta cualquiera de los dos.
  if (m.id === '303') return regimen === 'IVA';
  if (m.id === '420' || m.id === '415' || m.id === '425') return regimen === 'IGIC';
  return true;
}

export default function ListadosFiscalesPage() {
  const [cargando, setCargando] = useState(true);
  const [facturas, setFacturas] = useState<Invoice[]>([]);
  const [empresa, setEmpresa] = useState<CompanySettings | null>(null);
  const [ejercicio, setEjercicio] = useState(new Date().getFullYear());

  useEffect(() => {
    let vivo = true;
    (async () => {
      const [f, e] = await Promise.all([getInvoices(), getCompanySettings()]);
      if (!vivo) return;
      setFacturas(f);
      setEmpresa(e);
      setCargando(false);
    })();
    return () => { vivo = false; };
  }, []);

  const ejercicios = useMemo(() => ejerciciosDisponibles(facturas), [facturas]);
  const regimen = regimenIndirecto(empresa);

  // Sólo se precalcula el resumen de los modelos implementados: no tiene
  // sentido inventar un «resultado» para una tarjeta que no se puede abrir.
  const resumen347 = useMemo(() => {
    if (cargando) return null;
    return calcularModelo347(
      { facturas, gastos: [], clientes: [] },
      { ejercicio },
    );
  }, [facturas, ejercicio, cargando]);

  if (cargando) return <PageSkeleton />;

  const porOrganismo = (org: 'AEAT' | 'ATC') => MODELOS.filter(m => m.organismo === org);

  const tarjeta = (m: DefinicionModelo) => {
    const implementado = IMPLEMENTADOS.has(m.id);
    const aplica = aplicaALaEmpresa(m, regimen);
    const datos = m.id === '347' ? resumen347 : null;

    return (
      <article
        key={m.id}
        className={`lf-card ${!aplica ? 'lf-card--na' : ''} ${!implementado ? 'lf-card--pendiente' : ''}`}
      >
        <header className="lf-card-head">
          <h3>{m.nombre}</h3>
          <span className={`lf-org lf-org--${m.organismo.toLowerCase()}`}>{m.organismo}</span>
        </header>
        <p className="lf-card-desc">{m.descripcion}</p>

        <dl className="lf-card-datos">
          <div>
            <dt>Periodicidad</dt>
            <dd>{m.periodicidad === 'anual' ? 'Anual' : 'Trimestral'}</dd>
          </div>
          <div>
            <dt>Ejercicio</dt>
            <dd>{ejercicio}</dd>
          </div>
          {datos && (
            <>
              <div>
                <dt>Declarados</dt>
                <dd>{datos.totalDeclarados}</dd>
              </div>
              <div>
                <dt>Importe</dt>
                <dd>{formatCurrency(datos.importeTotal)}</dd>
              </div>
            </>
          )}
        </dl>

        <p className="lf-card-estado">
          {!aplica
            ? `No te aplica: la empresa tributa en ${regimen}.`
            : !implementado
              ? 'Todavía no implementado.'
              : m.via === 'fichero_oficial'
                ? `Genera fichero .${m.extension} con el diseño oficial.`
                : 'Cálculo y validación; la presentación se hace en la Sede del organismo.'}
        </p>

        {implementado && aplica ? (
          <Link href={`/listados-fiscales/${m.id}`} className="btn btn-primary lf-card-btn">
            Abrir modelo <ArrowRight size={16} />
          </Link>
        ) : (
          <button className="btn lf-card-btn" disabled>
            Abrir modelo
          </button>
        )}
      </article>
    );
  };

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
            {ejercicios.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </label>
      </header>

      <div className="lf-aviso">
        <Info size={16} />
        <p>
          Estos listados preparan y validan la información. La presentación ante la AEAT o la
          ATC la haces tú en la Sede del organismo: el programa no presenta nada por ti.
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
    </div>
  );
}
