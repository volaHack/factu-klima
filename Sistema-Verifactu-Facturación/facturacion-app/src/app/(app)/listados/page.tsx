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

import { useEffect, useMemo, useRef, useState } from 'react';
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

/**
 * El CSS del papel, escrito aparte y a mano.
 *
 * Va sin variables y con los colores puestos: esta hoja se imprime en un
 * documento propio que no carga el CSS de la aplicación, así que no hay
 * tokens que resolver ni tema claro/oscuro que valga. Los nombres de
 * clase son los mismos que en pantalla para que el marcado sirva igual.
 */
const CSS_PAPEL = `
@page { size: A4 portrait; margin: 14mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; }
body {
  font-family: 'IBM Plex Sans', system-ui, 'Segoe UI', Arial, sans-serif;
  color: #1a1216; font-size: 10px; line-height: 1.45;
}
.listado-hoja { border: 0; padding: 0; background: #fff; }
.listado-hoja-cabeza {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 16px; padding-bottom: 10px; margin-bottom: 10px;
  border-bottom: 2px solid #1a1216;
}
.listado-hoja-cabeza h2 { margin: 0; font-size: 15px; font-weight: 700; letter-spacing: -0.02em; }
.listado-hoja-cabeza p { margin: 2px 0 0; font-size: 9px; color: #6f5d63; }
.listado-hoja-acotado { display: grid; gap: 2px; margin: 0; font-size: 8px; text-align: right; }
.listado-hoja-acotado > div { display: flex; gap: 8px; justify-content: flex-end; }
.listado-hoja-acotado dt { color: #6f5d63; }
.listado-hoja-acotado dd { margin: 0; font-weight: 600; }
.listado-tabla { width: 100%; border-collapse: collapse; font-size: 9.5px; }
.listado-tabla th {
  text-align: left; padding: 5px 6px; font-size: 8px; font-weight: 700;
  letter-spacing: 0.04em; text-transform: uppercase; color: #4a3a40;
  border-bottom: 1px solid rgba(26, 18, 22, 0.35);
}
.listado-tabla td { padding: 5px 6px; border-bottom: 1px solid rgba(26, 18, 22, 0.15); }
.listado-tabla .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.listado-tabla .fuerte { font-weight: 700; }
.listado-tabla .mono { font-family: 'IBM Plex Mono', ui-monospace, Consolas, monospace; }
.listado-tabla .listado-doc { color: #6f5d63; }
.listado-tabla tfoot td {
  padding-top: 8px; border-top: 2px solid #1a1216; border-bottom: none; font-weight: 700;
}
/* La cabecera se repite en cada hoja y ninguna fila se parte por la mitad. */
thead { display: table-header-group; }
tr { break-inside: avoid; }
`;

/** El primer día del mes en curso, que es el acotado que se pide nueve de cada diez veces. */
function primeroDeMes(): string {
  const h = new Date();
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-01`;
}

export default function ListadosPage() {
  const { error: avisarError } = useToast();
  const hojaRef = useRef<HTMLDivElement>(null);
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

  /**
   * Imprime la hoja en un documento aparte, no la página.
   *
   * Con window.print() lo que va al papel es la aplicación entera, y para
   * que salga bien tienen que portarse bien a la vez el armazón (barras
   * fijas, superposiciones, z-index), los tokens del tema y las reglas
   * comodín de @media print. Basta con que una falle para que el folio
   * salga en blanco, y encima no se ve por qué. Copiando la hoja a un
   * iframe con su propio CSS, lo que se imprime no depende de nada de eso.
   */
  const imprimir = () => {
    const hoja = hojaRef.current;
    if (!hoja) return;

    const marco = document.createElement('iframe');
    marco.setAttribute('aria-hidden', 'true');
    // Fuera de la vista, pero con tamaño real: un iframe en display:none
    // o de 0x0 no llega a imprimirse en algunos navegadores.
    marco.style.cssText =
      'position:fixed;right:0;bottom:0;width:210mm;height:297mm;border:0;opacity:0;pointer-events:none;';
    document.body.appendChild(marco);

    const doc = marco.contentDocument;
    const ventana = marco.contentWindow;
    if (!doc || !ventana) { marco.remove(); return; }

    // El título es el nombre del fichero que propone «Guardar como PDF».
    const titulo = `${relacion.nombre} ${filtro.fechaDesde ?? ''} ${filtro.fechaHasta ?? ''}`.trim();
    doc.open();
    doc.write(
      '<!doctype html><html lang="es"><head><meta charset="utf-8">' +
      `<title>${titulo.replace(/[<>&]/g, ' ')}</title>` +
      `<style>${CSS_PAPEL}</style></head><body>${hoja.outerHTML}</body></html>`
    );
    doc.close();

    const lanzar = () => {
      ventana.focus();
      ventana.print();
    };
    // El marco no se puede quitar antes de que el diálogo termine, o se
    // cancela la impresión. onafterprint avisa al cerrarse; el temporizador
    // es la red de seguridad por si el navegador no lo dispara.
    ventana.onafterprint = () => marco.remove();
    window.setTimeout(() => marco.remove(), 60000);

    if (doc.readyState === 'complete') lanzar();
    else marco.onload = lanzar;
  };

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
          <button className="btn btn-primary" onClick={imprimir} disabled={filas.length === 0}>
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
      <div className="listado-hoja" ref={hojaRef}>
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
