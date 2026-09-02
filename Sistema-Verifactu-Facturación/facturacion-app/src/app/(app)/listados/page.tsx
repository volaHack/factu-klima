'use client';

/**
 * LISTADOS — la relación de lo que hay, lista para imprimir
 *
 * Eliges qué relación quieres, acotas por serie, número, fecha o tercero,
 * y sale la hoja: una fila por documento y el total al pie. Se imprime
 * tal cual —el navegador la guarda en PDF si hace falta— o se baja en
 * CSV para abrirla con Excel.
 *
 * La hoja se compone al vuelo y no pasa por el diseñador de plantillas.
 * Una relación no es un documento que se manda a nadie: es papel de
 * trabajo, y lo que se le pide es salir rápido y caber en un A4. El
 * diseñador está para las facturas, que sí van con la cara de la empresa.
 */

import { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Download, Printer, Search } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import {
  getAlbaranes, getCobrosPagos, getCompanySettings, getInvoices,
  getRegularizaciones, getTraspasos,
} from '@/lib/storage';
import type {
  Albaran, CobroPago, CompanySettings, Invoice, RegularizacionStock, TraspasoAlmacen,
} from '@/lib/types';
import {
  GRUPOS_LISTADO, filasDeAlbaranes, filasDeCobrosPagos, filasDeDocumentos,
  filasDeRegularizaciones, filasDeTraspasos, filtrarFilas, listadoComoCsv,
  relacionesDisponibles, relacionPorId, totalesDe,
  type FilaListado, type FiltroListado,
} from '@/lib/listados';
import { formatCurrency, formatDate, getToday } from '@/lib/utils';
import { useToast } from '@/hooks/useToast';

/** El primer día del mes en curso, que es el acotado que se pide nueve de cada diez veces. */
function primeroDeMes(): string {
  const h = new Date();
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-01`;
}

export default function ListadosPage() {
  const { error: avisarError } = useToast();
  const [montado, setMontado] = useState(false);
  const [ajustes, setAjustes] = useState<CompanySettings | null>(null);

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [albaranes, setAlbaranes] = useState<Albaran[]>([]);
  const [movimientos, setMovimientos] = useState<CobroPago[]>([]);
  const [regularizaciones, setRegularizaciones] = useState<RegularizacionStock[]>([]);
  const [traspasos, setTraspasos] = useState<TraspasoAlmacen[]>([]);

  const [relacionId, setRelacionId] = useState('facturas_venta');
  const [filtro, setFiltro] = useState<FiltroListado>({
    fechaDesde: primeroDeMes(),
    fechaHasta: getToday(),
  });

  useEffect(() => {
    (async () => {
      try {
        const [inv, alb, mov, regs, tras, cfg] = await Promise.all([
          getInvoices(), getAlbaranes(), getCobrosPagos(),
          getRegularizaciones(), getTraspasos(), getCompanySettings(),
        ]);
        setInvoices(inv);
        setAlbaranes(alb);
        setMovimientos(mov);
        setRegularizaciones(regs);
        setTraspasos(tras);
        setAjustes(cfg);
      } catch {
        avisarError('No se han podido cargar los datos', 'Vuelve a intentarlo en un momento.');
      } finally {
        setMontado(true);
      }
    })();
    // Sólo al entrar: una relación no cambia mientras se está mirando.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const disponibles = useMemo(
    () => relacionesDisponibles(ajustes?.modulos),
    [ajustes?.modulos],
  );
  const relacion = relacionPorId(relacionId) ?? disponibles[0];

  /** Las filas en bruto de la relación elegida, antes de acotar. */
  const filasBrutas: FilaListado[] = useMemo(() => {
    if (!relacion) return [];
    const f = relacion.fuente;
    switch (f.clase) {
      case 'documentos': return filasDeDocumentos(invoices, f.tipo, f.sentido);
      case 'albaranes': return filasDeAlbaranes(albaranes);
      case 'cobrosPagos': return filasDeCobrosPagos(movimientos, f.tipo);
      case 'regularizaciones': return filasDeRegularizaciones(regularizaciones);
      case 'traspasos': return filasDeTraspasos(traspasos);
    }
  }, [relacion, invoices, albaranes, movimientos, regularizaciones, traspasos]);

  const filas = useMemo(() => filtrarFilas(filasBrutas, filtro), [filasBrutas, filtro]);
  const totales = useMemo(() => totalesDe(filas), [filas]);

  const cambiar = (campo: keyof FiltroListado, valor: string | number | boolean | undefined) =>
    setFiltro(prev => ({ ...prev, [campo]: valor === '' ? undefined : valor }));

  const descargarCsv = () => {
    if (!relacion) return;
    const csv = listadoComoCsv(filas, relacion.columnaNombre);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${relacion.id}_${filtro.fechaDesde ?? 'inicio'}_${filtro.fechaHasta ?? 'hoy'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!montado) return <PageSkeleton variant="list" label="Cargando listados" />;
  if (!relacion) return null;

  const enUnidades = !!relacion.enUnidades;
  const cifra = (n: number) => (enUnidades ? String(n) : formatCurrency(n));

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <p className="page-eyebrow"><ClipboardList /> Listados</p>
          <h1 className="page-title">Relaciones</h1>
          <p className="page-subtitle">
            La lista de lo que hay, acotada como necesites y lista para imprimir o
            llevarte a la hoja de cálculo.
          </p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={descargarCsv} disabled={filas.length === 0}>
            <Download size={16} /> Excel (CSV)
          </button>
          <button className="btn btn-primary" onClick={() => window.print()} disabled={filas.length === 0}>
            <Printer size={16} /> Imprimir
          </button>
        </div>
      </div>

      {/* --- Qué se lista y con qué acotado --- */}
      <div className="card listado-filtros">
        <div className="form-group">
          <label className="form-label" htmlFor="relacion">Relación</label>
          <select
            id="relacion"
            className="form-select"
            value={relacion.id}
            onChange={e => setRelacionId(e.target.value)}
          >
            {GRUPOS_LISTADO.map(g => {
              const delGrupo = disponibles.filter(r => r.grupo === g.id);
              if (delGrupo.length === 0) return null;
              return (
                <optgroup key={g.id} label={g.nombre}>
                  {delGrupo.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                </optgroup>
              );
            })}
          </select>
        </div>

        <div className="listado-rangos">
          <Rango
            titulo="Serie"
            desde={<input className="form-input" value={filtro.serieDesde ?? ''} onChange={e => cambiar('serieDesde', e.target.value)} placeholder="Primera" />}
            hasta={<input className="form-input" value={filtro.serieHasta ?? ''} onChange={e => cambiar('serieHasta', e.target.value)} placeholder="Última" />}
          />
          <Rango
            titulo="Número"
            desde={<input className="form-input" type="number" value={filtro.numeroDesde ?? ''} onChange={e => cambiar('numeroDesde', e.target.value === '' ? undefined : Number(e.target.value))} placeholder="1" />}
            hasta={<input className="form-input" type="number" value={filtro.numeroHasta ?? ''} onChange={e => cambiar('numeroHasta', e.target.value === '' ? undefined : Number(e.target.value))} placeholder="Sin tope" />}
          />
          <Rango
            titulo="Fecha"
            desde={<input className="form-input" type="date" value={filtro.fechaDesde ?? ''} onChange={e => cambiar('fechaDesde', e.target.value)} />}
            hasta={<input className="form-input" type="date" value={filtro.fechaHasta ?? ''} onChange={e => cambiar('fechaHasta', e.target.value)} />}
          />
          {relacion.porTercero && (
            <Rango
              titulo={relacion.columnaNombre}
              desde={<input className="form-input" value={filtro.terceroDesde ?? ''} onChange={e => cambiar('terceroDesde', e.target.value)} placeholder="A" />}
              hasta={<input className="form-input" value={filtro.terceroHasta ?? ''} onChange={e => cambiar('terceroHasta', e.target.value)} placeholder="Z" />}
            />
          )}
        </div>

        <div className="listado-pie-filtros">
          {relacion.conPendientes && (
            <label className="listado-pendientes">
              <input
                type="checkbox"
                checked={!!filtro.soloPendientes}
                onChange={e => cambiar('soloPendientes', e.target.checked)}
              />
              <span>
                Sólo pendientes
                <em>
                  {relacion.fuente.clase === 'albaranes'
                    ? 'los que aún no se han facturado'
                    : 'lo que queda por cobrar o pagar'}
                </em>
              </span>
            </label>
          )}
          <span className="listado-cuenta">
            <Search size={13} />
            {totales.documentos === 0
              ? 'Nada con ese acotado'
              : `${totales.documentos} ${totales.documentos === 1 ? 'documento' : 'documentos'}`}
          </span>
        </div>
      </div>

      {/* --- La hoja. Es lo único que sale por la impresora. --- */}
      <div className="listado-hoja">
        <header className="listado-hoja-cabeza">
          <div>
            <h2>{relacion.nombre}</h2>
            <p>{ajustes?.businessName} · NIF {ajustes?.nif}</p>
          </div>
          <dl className="listado-hoja-acotado">
            <div><dt>Emitido</dt><dd>{formatDate(getToday())}</dd></div>
            <div>
              <dt>Fechas</dt>
              <dd>
                {filtro.fechaDesde ? formatDate(filtro.fechaDesde) : 'Desde el principio'}
                {' — '}
                {filtro.fechaHasta ? formatDate(filtro.fechaHasta) : 'hasta hoy'}
              </dd>
            </div>
            {(filtro.serieDesde || filtro.serieHasta) && (
              <div><dt>Serie</dt><dd>{filtro.serieDesde || '·'} — {filtro.serieHasta || '·'}</dd></div>
            )}
            {(filtro.numeroDesde != null || filtro.numeroHasta != null) && (
              <div><dt>Número</dt><dd>{filtro.numeroDesde ?? '·'} — {filtro.numeroHasta ?? '·'}</dd></div>
            )}
            {filtro.soloPendientes && <div><dt>Filtro</dt><dd>Sólo pendientes</dd></div>}
          </dl>
        </header>

        <table className="listado-tabla">
          <thead>
            <tr>
              <th>Número</th>
              <th>Fecha</th>
              <th>{relacion.columnaNombre}</th>
              <th>Documento</th>
              {enUnidades ? (
                <th className="num">Unidades</th>
              ) : (
                <>
                  <th className="num">Neto</th>
                  <th className="num">Impuestos</th>
                  <th className="num">Total</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 ? (
              <tr>
                <td colSpan={enUnidades ? 5 : 7} className="listado-vacio">
                  No hay {relacion.nombre.toLowerCase()} con ese acotado. Prueba a ampliar
                  las fechas o a dejar los demás campos en blanco.
                </td>
              </tr>
            ) : (
              filas.map(f => (
                <tr key={f.id}>
                  <td className="mono">{f.numero}</td>
                  <td>{formatDate(f.fecha)}</td>
                  <td>{f.nombre}</td>
                  <td className="listado-doc">{f.documento || '—'}</td>
                  {enUnidades ? (
                    <td className="num">{f.neto}</td>
                  ) : (
                    <>
                      <td className="num">{formatCurrency(f.neto)}</td>
                      <td className="num">{formatCurrency(f.impuestos)}</td>
                      <td className="num fuerte">{formatCurrency(f.total)}</td>
                    </>
                  )}
                </tr>
              ))
            )}
          </tbody>
          {filas.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={4}>Total · {totales.documentos} {totales.documentos === 1 ? 'documento' : 'documentos'}</td>
                {enUnidades ? (
                  <td className="num fuerte">{cifra(totales.neto)}</td>
                ) : (
                  <>
                    <td className="num">{formatCurrency(totales.neto)}</td>
                    <td className="num">{formatCurrency(totales.impuestos)}</td>
                    <td className="num fuerte">{formatCurrency(totales.total)}</td>
                  </>
                )}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

/** Un «desde / hasta», que es como se acota en todas las líneas del filtro. */
function Rango({ titulo, desde, hasta }: { titulo: string; desde: React.ReactNode; hasta: React.ReactNode }) {
  return (
    <div className="listado-rango">
      <span className="listado-rango-titulo">{titulo}</span>
      <div className="listado-rango-campos">
        {desde}
        <span className="listado-rango-guion">—</span>
        {hasta}
      </div>
    </div>
  );
}
