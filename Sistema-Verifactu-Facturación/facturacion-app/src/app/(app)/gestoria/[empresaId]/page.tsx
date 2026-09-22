'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Building2, Lock } from 'lucide-react';

import {
  empresasQueLlevo, facturasDeEmpresa, resumenPorTrimestre,
  type EmpresaGestionada, type FacturaDeEmpresa,
} from '@/lib/gestoria';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { useToast } from '@/hooks/useToast';
import { formatCurrency, formatDate } from '@/lib/utils';

/**
 * LOS LIBROS DE UNA EMPRESA, EN SOLO LECTURA.
 *
 * Lo que hace falta para presentar: el reparto por trimestres —que es
 * como se presentan los modelos— y el detalle de facturas selladas. Las
 * anuladas salen en la lista, porque siguen en los libros, pero no suman
 * en los totales.
 */
export default function LibrosDeEmpresa() {
  const params = useParams();
  const empresaId = String(params.empresaId ?? '');
  const { error: toastError } = useToast();

  const [anio, setAnio] = useState(() => new Date().getFullYear());
  const [cargando, setCargando] = useState(true);
  const [empresa, setEmpresa] = useState<EmpresaGestionada | null>(null);
  const [facturas, setFacturas] = useState<FacturaDeEmpresa[]>([]);

  // Al cambiar de ejercicio no se vacía la pantalla: se deja lo anterior
  // hasta que llega lo nuevo. Además, todos los cambios de estado van
  // después de un await — en el cuerpo síncrono del efecto provocarían
  // un render en cascada.
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const [empresas, filas] = await Promise.all([
          empresasQueLlevo(),
          facturasDeEmpresa(empresaId, anio),
        ]);
        if (cancelado) return;
        setEmpresa(empresas.find(e => e.userId === empresaId) ?? null);
        setFacturas(filas);
      } catch (err) {
        if (cancelado) return;
        toastError('No se han podido cargar los libros', err instanceof Error ? err.message : '');
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, anio]);

  const trimestres = useMemo(() => resumenPorTrimestre(facturas), [facturas]);
  const totales = useMemo(() => trimestres.reduce(
    (acc, t) => ({
      facturas: acc.facturas + t.facturas,
      base: acc.base + t.base,
      cuota: acc.cuota + t.cuota,
      total: acc.total + t.total,
    }),
    { facturas: 0, base: 0, cuota: 0, total: 0 },
  ), [trimestres]);

  const anios = [0, 1, 2].map(i => new Date().getFullYear() - i);

  if (cargando) return <PageSkeleton variant="detail" label="Cargando los libros" />;

  if (!empresa) {
    return (
      <div className="empty-state">
        <span className="empty-state-icon"><Lock strokeWidth={1.6} /></span>
        <h2 className="empty-state-title">No tienes acceso a esta empresa</h2>
        <p className="empty-state-description">
          O el acceso se ha retirado, o esta dirección no corresponde a ninguna de tus empresas.
        </p>
        <div className="empty-state-actions">
          <Link href="/gestoria" className="btn btn-primary"><ArrowLeft size={16} /> Volver</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <Link href="/gestoria" className="page-back"><ArrowLeft /> Empresas</Link>
          <div className="page-title-row">
            <h1 className="page-title">{empresa.nombre}</h1>
            <span className="badge badge-borrador"><Lock size={11} /> Solo lectura</span>
          </div>
          <p className="page-subtitle">NIF {empresa.nif} · facturas selladas de {anio}</p>
        </div>
        <div className="page-header-actions">
          <label className="form-label" htmlFor="anio" style={{ margin: 0 }}>Ejercicio</label>
          <select
            id="anio"
            className="form-select"
            value={anio}
            onChange={e => setAnio(Number(e.target.value))}
            style={{ width: 'auto' }}
          >
            {anios.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 'var(--space-5)' }}>
        {[
          ['Facturas selladas', String(totales.facturas)],
          ['Base imponible', formatCurrency(totales.base)],
          ['Cuota repercutida', formatCurrency(totales.cuota)],
          ['Total facturado', formatCurrency(totales.total)],
        ].map(([etiqueta, valor]) => (
          <div key={etiqueta} className="card">
            <div className="card-subtitle">{etiqueta}</div>
            <div className="page-meta-value">{valor}</div>
          </div>
        ))}
      </div>

      <section className="card" style={{ marginBottom: 'var(--space-5)' }}>
        <h2 className="card-title" style={{ marginBottom: 'var(--space-3) ' }}>Por trimestres</h2>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr><th>Trimestre</th><th>Facturas</th><th>Base</th><th>Cuota</th><th>Total</th></tr>
            </thead>
            <tbody>
              {trimestres.map(t => (
                <tr key={t.trimestre}>
                  <th scope="row">{t.trimestre}T</th>
                  <td>{t.facturas}</td>
                  <td>{formatCurrency(t.base)}</td>
                  <td>{formatCurrency(t.cuota)}</td>
                  <td>{formatCurrency(t.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2 className="card-title" style={{ marginBottom: 'var(--space-3)' }}>
          Facturas ({facturas.length})
        </h2>
        {facturas.length === 0 ? (
          <p className="card-subtitle">No hay facturas selladas en {anio}.</p>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Número</th><th>Fecha</th><th>Cliente</th>
                  <th>Base</th><th>Cuota</th><th>Total</th><th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {facturas.map(f => (
                  <tr key={f.id}>
                    <th scope="row" style={{ fontFamily: 'var(--font-mono)' }}>{f.number}</th>
                    <td>{formatDate(f.issue_date)}</td>
                    <td>{f.client_name ?? '—'}</td>
                    <td>{formatCurrency(Number(f.subtotal))}</td>
                    <td>{formatCurrency(Number(f.total_tax))}</td>
                    <td>{formatCurrency(Number(f.total))}</td>
                    <td><span className={`badge badge-${f.status}`}><span className="badge-dot" />{f.status}</span></td>
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
