'use client';

/**
 * LISTADOS — fichas, compras y ventas, estadísticas, caja, libros,
 * impuestos, inventario e historial, listos para imprimir o llevar a Excel.
 *
 * Las cuentas están en lib/informes/listadosGenerales; aquí se elige el
 * listado, se acota y se pinta la hoja, que es la misma que va al papel.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Printer, Loader2 } from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import BuscadorFicha from '@/components/clientes/BuscadorFicha';
import BuscadorProducto from '@/components/productos/BuscadorProducto';
import CajaBusqueda from '@/components/ui/CajaBusqueda';
import {
  getInvoices, getClients, getProducts, getCobrosPagos, getCompanyCategories, getVendedores, getCompanySettings,
} from '@/lib/storage';
import type { CompanySettings } from '@/lib/types';
import { PAYMENT_METHODS } from '@/lib/constants';
import { historicoParaListado } from '@/lib/historico';
import {
  GRUPOS_LISTADO_GENERAL, LISTADOS_GENERALES, listadoGeneralPorId, generarHoja, sumasDe, hojaComoCsv,
  type Celda, type Columna, type DatosListados, type FiltroGeneral,
} from '@/lib/informes/listadosGenerales';
import { formatCurrency, formatDate, getToday } from '@/lib/utils';
import { useToast } from '@/hooks/useToast';
import { imprimirHtml, descargarCsv } from './papel';
import AtajosFechas from '@/components/ui/AtajosFechas';

function primeroDeAnio(): string {
  return `${new Date().getFullYear()}-01-01`;
}

const numero = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 3 });

function pintar(c: Columna, v: Celda): string {
  if (v === null || v === undefined || v === '') return '';
  switch (c.tipo) {
    case 'eur': return formatCurrency(Number(v));
    case 'pct': return `${numero.format(Number(v))} %`;
    case 'num': return numero.format(Number(v));
    case 'fecha': return formatDate(String(v));
    default: return String(v);
  }
}

const derecha = (c: Columna) => ['eur', 'pct', 'num'].includes(c.tipo);

export default function ListadosGenerales() {
  const { error: avisarError } = useToast();
  const [datos, setDatos] = useState<DatosListados | null>(null);
  const [ajustes, setAjustes] = useState<CompanySettings | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [facturas, clientes, productos, movimientos, categorias, vendedores, cfg] = await Promise.all([
          getInvoices(), getClients(), getProducts(), getCobrosPagos(), getCompanyCategories(),
          getVendedores().catch(() => []), getCompanySettings(),
        ]);
        setAjustes(cfg);
        setDatos({
          facturas, clientes, productos, movimientos,
          categorias: categorias.map(c => ({ value: c.value, label: c.label })),
          vendedores: vendedores.map(v => ({ id: v.id, nombre: v.nombre })),
          formasDePago: PAYMENT_METHODS.map(p => ({ value: p.value, label: p.label })),
        });
      } catch {
        avisarError('No se han podido cargar los datos', 'Vuelve a intentarlo en un momento.');
      }
    })();
  }, [avisarError]);

  if (!datos) return <PageSkeleton variant="list" label="Cargando los listados" />;
  return <VistaListados datos={datos} ajustes={ajustes} />;
}

/** La pantalla con los datos ya cargados. */
export function VistaListados({ datos, ajustes }: { datos: DatosListados; ajustes: CompanySettings | null }) {
  const { error: avisarError } = useToast();
  const hojaRef = useRef<HTMLDivElement>(null);
  const [id, setId] = useState('ventas_clientes');
  const [filtro, setFiltro] = useState<FiltroGeneral>({ desde: primeroDeAnio(), hasta: getToday(), soloActivos: true });
  const [historico, setHistorico] = useState<{ clave: string; filas: DatosListados['historico']; total: number } | null>(null);
  const [cargandoHist, setCargandoHist] = useState(false);

  const listado = listadoGeneralPorId(id) ?? LISTADOS_GENERALES[0];

  // El historial vive en la base de datos: se pide al elegirlo o al cambiar las fechas.
  const claveHist = `${filtro.desde}|${filtro.hasta}|${filtro.terceroId ?? ''}`;
  useEffect(() => {
    if (!listado.historico || historico?.clave === claveHist) return;
    let vivo = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- aviso de carga mientras llega de la base de datos
    setCargandoHist(true);
    historicoParaListado({ desde: filtro.desde, hasta: filtro.hasta, clientId: filtro.terceroId })
      .then(r => { if (vivo) setHistorico({ clave: claveHist, filas: r.filas, total: r.total }); })
      .catch(() => { if (vivo) avisarError('No se ha podido leer el historial', 'Vuelve a intentarlo en un momento.'); })
      .finally(() => { if (vivo) setCargandoHist(false); });
    return () => { vivo = false; };
  }, [listado.historico, claveHist, historico?.clave, filtro.desde, filtro.hasta, filtro.terceroId, avisarError]);

  const hoja = useMemo(() => {
    const conHist = listado.historico ? { ...datos, historico: historico?.filas ?? [] } : datos;
    // Cada listado usa solo los filtros que le sirven: los demás no deben colarse.
    const f: FiltroGeneral = {
      texto: filtro.texto,
      ...(listado.usa.fechas ? { desde: filtro.desde, hasta: filtro.hasta } : {}),
      ...(listado.usa.tercero ? { terceroId: filtro.terceroId } : {}),
      ...(listado.usa.familia ? { familia: filtro.familia } : {}),
      ...(listado.usa.articulo ? { productoId: filtro.productoId } : {}),
      ...(listado.usa.activos ? { soloActivos: filtro.soloActivos } : {}),
      ...(listado.usa.conStock ? { soloConStock: filtro.soloConStock } : {}),
    };
    return generarHoja(listado, conHist, f);
  }, [datos, listado, filtro, historico]);

  const sumas = useMemo(() => sumasDe(hoja), [hoja]);

  const cambiar = <K extends keyof FiltroGeneral>(k: K, v: FiltroGeneral[K]) => setFiltro(prev => ({ ...prev, [k]: v }));
  const terceros = listado.usa.tercero === 'cliente' ? datos.clientes.filter(c => !c.esProveedor)
    : listado.usa.tercero === 'proveedor' ? datos.clientes.filter(c => c.esProveedor) : datos.clientes;
  const tercero = datos.clientes.find(c => c.id === filtro.terceroId);
  const familia = datos.categorias.find(c => c.value === filtro.familia);
  const producto = datos.productos.find(p => p.id === filtro.productoId);
  const ancho = hoja.columnas.length > 7;

  const imprimir = () => {
    if (!hojaRef.current) return;
    imprimirHtml(`${listado.nombre} ${filtro.desde ?? ''} ${filtro.hasta ?? ''}`.trim(), hojaRef.current.outerHTML, '', ancho);
  };

  const csv = () => descargarCsv(`${listado.id}_${filtro.desde ?? 'inicio'}_${filtro.hasta ?? 'hoy'}.csv`, hojaComoCsv(hoja));

  return (
    <div>
      <div className="page-header">
        <div className="page-header-left">
          <h2 className="page-title">Listados</h2>
          <p className="page-subtitle">Elige el listado, acótalo y sácalo por impresora o a Excel.</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={csv} disabled={hoja.filas.length === 0}>
            <Download size={16} /> Excel (CSV)
          </button>
          <button className="btn btn-primary" onClick={imprimir} disabled={hoja.filas.length === 0}>
            <Printer size={16} /> Imprimir
          </button>
        </div>
      </div>

      <div className="listados-cuerpo">
        {/* El índice: todos los listados a la vista, por grupos, como en el menú de siempre. */}
        <nav className="card listados-indice" aria-label="Listados">
          {GRUPOS_LISTADO_GENERAL.map(g => (
            <div key={g.id}>
              <p className="listados-indice-grupo">{g.nombre}</p>
              {LISTADOS_GENERALES.filter(l => l.grupo === g.id).map(l => (
                <button
                  key={l.id}
                  type="button"
                  className={`listados-indice-item${l.id === listado.id ? ' active' : ''}`}
                  aria-current={l.id === listado.id ? 'true' : undefined}
                  onClick={() => setId(l.id)}
                >
                  {l.nombre}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="listados-derecha">
          <div className="card listado-filtros">
            <div className="listados-filtros-rejilla">
              {listado.usa.fechas && (
                <>
                  <div className="form-group">
                    <label className="form-label">Desde</label>
                    <input className="form-input" type="date" value={filtro.desde ?? ''} onChange={e => cambiar('desde', e.target.value || undefined)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Hasta</label>
                    <input className="form-input" type="date" value={filtro.hasta ?? ''} onChange={e => cambiar('hasta', e.target.value || undefined)} />
                  </div>
                </>
              )}
              {listado.usa.tercero && (
                <div className="form-group listados-filtro-ancho">
                  <label className="form-label">
                    {listado.usa.tercero === 'cliente' ? 'Cliente' : listado.usa.tercero === 'proveedor' ? 'Proveedor' : 'Cliente o proveedor'}
                  </label>
                  <BuscadorFicha fichas={terceros} value={filtro.terceroId ?? ''} onSelect={v => cambiar('terceroId', v || undefined)} placeholder="Todos · o busca uno" />
                </div>
              )}
              {listado.usa.familia && (
                <div className="form-group">
                  <label className="form-label">Familia</label>
                  <select className="form-select" value={filtro.familia ?? ''} onChange={e => cambiar('familia', e.target.value || undefined)}>
                    <option value="">Todas</option>
                    {datos.categorias.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
              )}
              {listado.usa.articulo && (
                <div className="form-group listados-filtro-ancho">
                  <label className="form-label">Artículo</label>
                  <BuscadorProducto products={datos.productos} value={filtro.productoId ?? ''} onSelect={v => cambiar('productoId', v || undefined)} placeholder="Todos · o busca uno" />
                </div>
              )}
            </div>
            {listado.usa.fechas && (
              <AtajosFechas desde={filtro.desde} hasta={filtro.hasta} onElegir={(d, h) => setFiltro(prev => ({ ...prev, desde: d, hasta: h }))} />
            )}
            {(listado.usa.activos || listado.usa.conStock) && (
              <div className="listados-casillas">
                {listado.usa.activos && (
                  <label className="form-check">
                    <input type="checkbox" checked={!!filtro.soloActivos} onChange={e => cambiar('soloActivos', e.target.checked)} />
                    <span>Solo los activos (sin los dados de baja)</span>
                  </label>
                )}
                {listado.usa.conStock && (
                  <label className="form-check">
                    <input type="checkbox" checked={!!filtro.soloConStock} onChange={e => cambiar('soloConStock', e.target.checked)} />
                    <span>Solo con existencias (distinto de cero)</span>
                  </label>
                )}
              </div>
            )}
            <CajaBusqueda value={filtro.texto ?? ''} onChange={v => cambiar('texto', v || undefined)} placeholder="Buscar dentro del listado" />
          </div>

          {listado.historico && historico && historico.total > (historico.filas?.length ?? 0) && (
            <p className="form-hint" role="status">
              Hay {historico.total.toLocaleString('es-ES')} documentos en esas fechas; salen los {(historico.filas?.length ?? 0).toLocaleString('es-ES')} primeros. Acota las fechas para verlos todos.
            </p>
          )}

          {/* --- La hoja: lo mismo que va al papel --- */}
          <div className="card listado-hoja" ref={hojaRef}>
            <div className="listado-hoja-cabeza">
              <div>
                <h2>{listado.nombre}</h2>
                <p>{ajustes?.businessName || ajustes?.tradeName || ''}{ajustes?.nif ? ` · ${ajustes.nif}` : ''}</p>
                {hoja.nota && <p>{hoja.nota}</p>}
              </div>
              <dl className="listado-hoja-acotado">
                {listado.usa.fechas && (
                  <div><dt>Fechas</dt><dd>{filtro.desde ? formatDate(filtro.desde) : 'Desde el principio'} — {filtro.hasta ? formatDate(filtro.hasta) : 'hasta hoy'}</dd></div>
                )}
                {tercero && <div><dt>{tercero.esProveedor ? 'Proveedor' : 'Cliente'}</dt><dd>{tercero.tradeName || tercero.businessName}</dd></div>}
                {familia && listado.usa.familia && <div><dt>Familia</dt><dd>{familia.label}</dd></div>}
                {producto && listado.usa.articulo && <div><dt>Artículo</dt><dd>{producto.name}</dd></div>}
                {filtro.texto && <div><dt>Buscando</dt><dd>«{filtro.texto}»</dd></div>}
                <div><dt>Impreso</dt><dd>{formatDate(getToday())}</dd></div>
              </dl>
            </div>
            <div className="table-responsive">
              <table className="listado-tabla">
                <thead>
                  <tr>{hoja.columnas.map(c => <th key={c.clave} className={derecha(c) ? 'num' : ''}>{c.titulo}</th>)}</tr>
                </thead>
                <tbody>
                  {cargandoHist && listado.historico ? (
                    <tr><td colSpan={hoja.columnas.length} className="listado-vacio"><Loader2 size={14} className="spin" /> Leyendo el historial…</td></tr>
                  ) : hoja.filas.length === 0 ? (
                    <tr><td colSpan={hoja.columnas.length} className="listado-vacio">Nada con ese acotado. Prueba a ampliar las fechas o quitar filtros.</td></tr>
                  ) : hoja.filas.map((f, i) => (
                    <tr key={i}>
                      {hoja.columnas.map(c => (
                        <td key={c.clave} className={`${derecha(c) ? 'num' : ''}${c.tipo === 'mono' ? ' mono' : ''}`}>{pintar(c, f[c.clave] ?? null)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                {hoja.filas.length > 0 && Object.keys(sumas).length > 0 && (
                  <tfoot>
                    <tr>
                      {hoja.columnas.map((c, i) => (
                        <td key={c.clave} className={derecha(c) ? 'num' : ''}>
                          {i === 0 ? `Total · ${hoja.filas.length} ${hoja.filas.length === 1 ? 'línea' : 'líneas'}` : c.clave in sumas ? pintar(c, sumas[c.clave]) : ''}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
