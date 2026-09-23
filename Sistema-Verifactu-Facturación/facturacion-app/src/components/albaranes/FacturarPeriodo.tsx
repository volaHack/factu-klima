'use client';

/**
 * FACTURAR EL MES
 *
 * Todos los albaranes expedidos de un mes, ya agrupados por cliente: se
 * marca a quién se factura y sale una factura borrador por cliente, con
 * cada albarán citado y la fecha de las operaciones. La lógica está en
 * `lib/albaranes/facturacionPeriodo.ts`; aquí sólo se elige y se confirma.
 */

import { useMemo, useState } from 'react';
import { CalendarRange, FileText, Loader2 } from 'lucide-react';

import type { Albaran, Invoice } from '@/lib/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import { agruparPendientes, periodoDelMes } from '@/lib/albaranes/facturacionPeriodo';
import { facturarAlbaranesDelPeriodo } from '@/lib/storage';

function mesDe(fecha: string): string {
  return fecha.slice(0, 7);
}

/**
 * El mes que se propone: el anterior si tiene algo pendiente —es lo que
 * se factura a primeros de mes—; si no, el más reciente con pendientes.
 */
function mesPropuesto(albaranes: readonly Albaran[]): string {
  const hoy = new Date();
  const anterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
  const mesAnterior = `${anterior.getFullYear()}-${String(anterior.getMonth() + 1).padStart(2, '0')}`;
  const meses = [...new Set(albaranes.filter(a => a.status === 'expedido').map(a => mesDe(a.issueDate)))].sort();
  if (meses.includes(mesAnterior)) return mesAnterior;
  return meses[meses.length - 1] ?? mesDe(hoy.toISOString());
}

export default function FacturarPeriodo({
  albaranes,
  onFacturado,
}: {
  albaranes: Albaran[];
  onFacturado: (facturas: Invoice[]) => void | Promise<void>;
}) {
  const [mes, setMes] = useState(() => mesPropuesto(albaranes));
  const [excluidos, setExcluidos] = useState<Set<string>>(new Set());
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const periodo = useMemo(() => periodoDelMes(mes), [mes]);
  const grupos = useMemo(() => agruparPendientes(albaranes, periodo), [albaranes, periodo]);
  const elegidos = grupos.filter(g => !excluidos.has(g.clave));
  const totalElegido = elegidos.reduce((s, g) => s + g.total, 0);
  const otrosMeses = albaranes.filter(a => a.status === 'expedido' && mesDe(a.issueDate) !== mes).length;

  const alternar = (clave: string) => setExcluidos(prev => {
    const nuevo = new Set(prev);
    if (nuevo.has(clave)) nuevo.delete(clave); else nuevo.add(clave);
    return nuevo;
  });

  const facturar = async () => {
    if (elegidos.length === 0) return;
    const ok = confirm(
      `Se crearán ${elegidos.length} ${elegidos.length === 1 ? 'factura borrador' : 'facturas borrador'} ` +
      `por ${formatCurrency(totalElegido)}: una por cliente, con sus albaranes de ` +
      `${new Date(`${mes}-15`).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}.\n\n` +
      'Los albaranes quedarán como «Facturados». Revisa las facturas antes de emitirlas.',
    );
    if (!ok) return;
    setTrabajando(true);
    setError(null);
    try {
      const facturas = await facturarAlbaranesDelPeriodo(periodo, elegidos.map(g => g.clave));
      setExcluidos(new Set());
      await onFacturado(facturas);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se han podido crear las facturas.');
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <section className="card facturar-periodo" aria-labelledby="facturar-periodo-titulo">
      <header className="facturar-periodo-cabeza">
        <div>
          <h2 id="facturar-periodo-titulo" className="facturar-periodo-titulo">
            <CalendarRange size={18} /> Facturar el mes
          </h2>
          <p className="facturar-periodo-sub">
            Una factura por cliente con todos sus albaranes expedidos del mes.
          </p>
        </div>
        <label className="facturar-periodo-mes">
          <span>Mes</span>
          <input
            type="month"
            className="form-input"
            value={mes}
            onChange={e => { if (e.target.value) { setMes(e.target.value); setExcluidos(new Set()); } }}
          />
        </label>
      </header>

      {grupos.length === 0 ? (
        <p className="facturar-periodo-vacio">
          No hay albaranes expedidos sin facturar en ese mes.
          {otrosMeses > 0 && ` Hay ${otrosMeses} en otros meses: cambia el mes para verlos.`}
        </p>
      ) : (
        <>
          <ul className="facturar-periodo-lista">
            {grupos.map(g => {
              const marcado = !excluidos.has(g.clave);
              return (
                <li key={g.clave}>
                  <label className={`facturar-periodo-fila ${marcado ? '' : 'is-fuera'}`}>
                    <input type="checkbox" checked={marcado} onChange={() => alternar(g.clave)} />
                    <span className="facturar-periodo-cliente">
                      <strong>{g.clientName || 'Sin nombre'}</strong>
                      <span>
                        {g.clientNif || 'sin NIF'} · {g.albaranes.length} {g.albaranes.length === 1 ? 'albarán' : 'albaranes'}
                        {' · '}
                        {g.primeraEntrega === g.ultimaEntrega
                          ? formatDate(g.primeraEntrega)
                          : `${formatDate(g.primeraEntrega)} – ${formatDate(g.ultimaEntrega)}`}
                      </span>
                    </span>
                    <span className="facturar-periodo-importe">{formatCurrency(g.total)}</span>
                  </label>
                </li>
              );
            })}
          </ul>

          {error && <p className="facturar-periodo-error" role="alert">{error}</p>}

          <footer className="facturar-periodo-pie">
            <span>
              {elegidos.length} de {grupos.length} {grupos.length === 1 ? 'cliente' : 'clientes'} ·{' '}
              <strong>{formatCurrency(totalElegido)}</strong>
            </span>
            <button type="button" className="btn btn-primary" onClick={facturar} disabled={trabajando || elegidos.length === 0}>
              {trabajando ? <Loader2 size={16} className="spin" /> : <FileText size={16} />}
              {trabajando
                ? 'Creando facturas…'
                : `Crear ${elegidos.length} ${elegidos.length === 1 ? 'factura' : 'facturas'}`}
            </button>
          </footer>
        </>
      )}
    </section>
  );
}
