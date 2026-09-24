'use client';

/**
 * IMPORTAR CLIENTES O PRODUCTOS DE OTRO PROGRAMA
 *
 * Tres pasos en una pantalla: se elige el archivo, se comprueba qué
 * columna es cada dato (ya viene propuesto) y se ve fila a fila qué entra,
 * qué ya existía y qué tiene un problema, antes de crear nada. La lógica
 * está en `lib/importar/importar.ts`; aquí sólo se enseña y se confirma.
 *
 * El archivo se lee en el navegador: no se sube a ningún servidor. Sólo
 * viajan las fichas que se crean, igual que al darlas de alta a mano.
 */

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle, CheckCircle2, FileSpreadsheet, Info, Loader2, Package, RotateCcw, Upload, Users, XCircle,
} from 'lucide-react';

import { useToast } from '@/hooks/useToast';
import {
  getClients, getCompanySettings, getProducts, saveClient, saveProduct,
} from '@/lib/storage';
import {
  ETIQUETAS, camposDe, celdaATexto, decodificarTexto, detectarColumnas, detectarTipo, filaDeCabecera,
  leerCsv, resumen, revisarClientes, revisarProductos,
  type EstadoFila, type FilaRevisada, type Mapeo, type Tabla, type TipoImportacion,
} from '@/lib/importar/importar';
import { generateId } from '@/lib/utils';
import type { Client, Product } from '@/lib/types';

const PROGRAMAS = 'Holded, Contasimple, Factusol, Quipu, Sage, Anfix, Billin o tu propia hoja de cálculo';

const ESTADOS: Record<EstadoFila, { texto: string; clase: string }> = {
  nuevo: { texto: 'Se crea', clase: 'imp-estado--nuevo' },
  existe: { texto: 'Ya lo tienes', clase: 'imp-estado--existe' },
  repetido: { texto: 'Repetido en el archivo', clase: 'imp-estado--existe' },
  error: { texto: 'No se puede', clase: 'imp-estado--error' },
};

export default function ImportarPage() {
  const { success, error: avisarError } = useToast();
  const entrada = useRef<HTMLInputElement>(null);

  const [archivo, setArchivo] = useState<string | null>(null);
  const [tabla, setTabla] = useState<Tabla>([]);
  const [tipo, setTipo] = useState<TipoImportacion>('clientes');
  const [cabecera, setCabecera] = useState(0);
  const [mapeo, setMapeo] = useState<Mapeo>({});
  const [existentes, setExistentes] = useState<{ clientes: Client[]; productos: Product[]; impuesto: number }>({ clientes: [], productos: [], impuesto: 21 });
  const [leyendo, setLeyendo] = useState(false);
  const [importando, setImportando] = useState<{ hechos: number; total: number } | null>(null);
  const [hecho, setHecho] = useState<{ creados: number; fallidos: string[] } | null>(null);
  const [soloProblemas, setSoloProblemas] = useState(false);

  const filas = useMemo<FilaRevisada<Client | Product>[]>(() => {
    if (tabla.length === 0) return [];
    const ctx = { ahora: new Date().toISOString(), nuevoId: generateId, impuestoPorDefecto: existentes.impuesto };
    return tipo === 'clientes'
      ? revisarClientes(tabla, cabecera + 1, mapeo, existentes.clientes, ctx)
      : revisarProductos(tabla, cabecera + 1, mapeo, existentes.productos, ctx);
  }, [tabla, tipo, cabecera, mapeo, existentes]);

  const cuenta = resumen(filas);
  const aCrear = filas.filter(f => f.estado === 'nuevo' && f.ficha);
  const obligatorio = tipo === 'clientes' ? 'businessName' : 'name';
  const faltaObligatorio = tabla.length > 0 && mapeo[obligatorio] === undefined
    && !(tipo === 'clientes' && mapeo.tradeName !== undefined)
    && !(tipo === 'productos' && mapeo.description !== undefined);

  const prepararTipo = (t: TipoImportacion, datos: Tabla) => {
    const fila = filaDeCabecera(datos, t);
    setTipo(t);
    setCabecera(fila);
    setMapeo(detectarColumnas(datos[fila] ?? [], t));
  };

  const leer = async (fichero: File) => {
    setLeyendo(true);
    setHecho(null);
    try {
      let datos: Tabla;
      if (/\.xlsx$/i.test(fichero.name)) {
        const { readSheet } = await import('read-excel-file/browser');
        const hoja = await readSheet(fichero);
        datos = hoja.map(f => f.map(celdaATexto)).filter(f => f.some(c => c !== ''));
      } else if (/\.xls$/i.test(fichero.name)) {
        throw new Error('Los .xls antiguos no se pueden leer. Ábrelo en Excel y guárdalo como .xlsx o como CSV.');
      } else {
        datos = leerCsv(decodificarTexto(new Uint8Array(await fichero.arrayBuffer())));
      }
      if (datos.length < 2) throw new Error('El archivo no tiene filas con datos.');

      const [clientes, productos, ajustes] = await Promise.all([getClients(), getProducts(), getCompanySettings()]);
      setExistentes({ clientes, productos, impuesto: ajustes?.igicEnabled ? 7 : 21 });
      setTabla(datos);
      setArchivo(fichero.name);
      prepararTipo(detectarTipo(datos), datos);
    } catch (e) {
      avisarError('No se ha podido leer el archivo', e instanceof Error ? e.message : 'Formato no reconocido.');
    } finally {
      setLeyendo(false);
      if (entrada.current) entrada.current.value = '';
    }
  };

  const importar = async () => {
    if (aCrear.length === 0) return;
    const nombre = tipo === 'clientes' ? 'clientes' : 'productos';
    if (!confirm(`Se van a crear ${aCrear.length} ${nombre}. Los que ya tienes y las filas con problemas no se tocan.\n\n¿Seguir?`)) return;
    setImportando({ hechos: 0, total: aCrear.length });
    const fallidos: string[] = [];
    let creados = 0;
    for (const f of aCrear) {
      try {
        if (tipo === 'clientes') await saveClient(f.ficha as Client);
        else await saveProduct(f.ficha as Product);
        creados++;
      } catch (e) {
        fallidos.push(`Fila ${f.fila} (${f.titulo}): ${e instanceof Error ? e.message : 'error'}`);
      }
      setImportando({ hechos: creados + fallidos.length, total: aCrear.length });
    }
    setImportando(null);
    setHecho({ creados, fallidos });
    if (creados > 0) success('Importación terminada', `${creados} ${nombre} creados`);
    // Lo recién creado pasa a «Ya lo tienes» si se vuelve a importar.
    const [clientes, productos] = await Promise.all([getClients(), getProducts()]);
    setExistentes(prev => ({ ...prev, clientes, productos }));
  };

  const empezarDeNuevo = () => {
    setTabla([]); setArchivo(null); setMapeo({}); setHecho(null); setSoloProblemas(false);
  };

  const columnas = tabla[cabecera] ?? [];
  const ejemplo = tabla[cabecera + 1] ?? [];
  const visibles = (soloProblemas ? filas.filter(f => f.estado === 'error' || f.avisos.length) : filas).slice(0, 200);

  return (
    <div className="animate-fade-in imp">
      <div className="page-header">
        <div className="page-header-left">
          <p className="page-eyebrow"><Upload /> Datos</p>
          <h1 className="page-title">Importar de otro programa</h1>
          <p className="page-subtitle">Trae tus clientes y tus productos desde {PROGRAMAS}.</p>
        </div>
      </div>

      {tabla.length === 0 ? (
        <section className="card imp-inicio">
          <button
            type="button"
            className="imp-soltar"
            onClick={() => entrada.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void leer(f); }}
            disabled={leyendo}
          >
            {leyendo ? <Loader2 size={28} className="spin" /> : <FileSpreadsheet size={28} />}
            <strong>{leyendo ? 'Leyendo el archivo…' : 'Elige o arrastra aquí el archivo'}</strong>
            <span>Excel (.xlsx) o CSV. Se lee en tu navegador: no se sube a ningún sitio.</span>
          </button>
          <input ref={entrada} type="file" accept=".xlsx,.csv,.txt,.xls" hidden onChange={e => { const f = e.target.files?.[0]; if (f) void leer(f); }} />

          <div className="imp-como">
            <h2><Info size={16} /> Cómo sacar el archivo de tu programa actual</h2>
            <ul>
              <li><strong>Holded:</strong> Contactos (o Inventario) → botón de exportar → Excel.</li>
              <li><strong>Contasimple, Quipu, Anfix, Billin:</strong> en el listado de clientes o de productos, «Exportar» a Excel o CSV.</li>
              <li><strong>Factusol y Sage:</strong> en el listado, imprimir o exportar a Excel. Si sale un .xls antiguo, ábrelo y guárdalo como .xlsx.</li>
              <li><strong>Tu propia hoja:</strong> vale cualquiera con una fila de títulos (Nombre, NIF, Email… o Referencia, Nombre, Precio, IVA…).</li>
            </ul>
            <p className="imp-nota">
              Las facturas antiguas no se importan, a propósito: ya las emitió y registró tu programa anterior,
              y meterlas aquí las volvería a sellar como si fueran de este. Se conservan allí.
            </p>
          </div>
        </section>
      ) : (
        <>
          {/* PASO 1: qué es y qué columna es cada dato */}
          <section className="card imp-paso">
            <header className="imp-paso-cabeza">
              <div>
                <h2><span className="imp-num">1</span> Qué hay en <em>{archivo}</em></h2>
                <p>{tabla.length - cabecera - 1} filas. Comprueba qué columna es cada dato: ya está propuesto.</p>
              </div>
              <div className="imp-tipo" role="radiogroup" aria-label="Qué se importa">
                {(['clientes', 'productos'] as const).map(t => (
                  <button key={t} type="button" role="radio" aria-checked={tipo === t}
                    className={`imp-tipo-op ${tipo === t ? 'is-activo' : ''}`} onClick={() => prepararTipo(t, tabla)}>
                    {t === 'clientes' ? <Users size={15} /> : <Package size={15} />} {t === 'clientes' ? 'Clientes' : 'Productos'}
                  </button>
                ))}
              </div>
            </header>

            <div className="imp-mapeo">
              {camposDe(tipo).map(campo => (
                <label key={campo} className="imp-mapeo-fila">
                  <span className="imp-mapeo-campo">
                    {ETIQUETAS[campo]}{campo === obligatorio && <b title="Obligatorio"> *</b>}
                  </span>
                  <select
                    className="form-input"
                    value={mapeo[campo] ?? ''}
                    onChange={e => setMapeo(m => {
                      const nuevo = { ...m };
                      if (e.target.value === '') delete nuevo[campo];
                      else nuevo[campo] = Number(e.target.value);
                      return nuevo;
                    })}
                  >
                    <option value="">— No importar —</option>
                    {columnas.map((c, i) => <option key={i} value={i}>{c || `Columna ${i + 1}`}</option>)}
                  </select>
                  <span className="imp-mapeo-ejemplo" title={mapeo[campo] !== undefined ? ejemplo[mapeo[campo]!] : ''}>
                    {mapeo[campo] !== undefined ? (ejemplo[mapeo[campo]!] || '(vacío)') : ''}
                  </span>
                </label>
              ))}
            </div>
            {faltaObligatorio && (
              <p className="imp-alerta"><AlertTriangle size={15} /> Elige qué columna es el {tipo === 'clientes' ? 'nombre o la razón social' : 'nombre del producto'}: sin eso no se puede importar nada.</p>
            )}
          </section>

          {/* PASO 2: qué va a pasar con cada fila */}
          <section className="card imp-paso">
            <header className="imp-paso-cabeza">
              <div>
                <h2><span className="imp-num">2</span> Qué va a pasar</h2>
                <p>Revísalo antes de importar: no se crea nada hasta que pulses el botón.</p>
              </div>
            </header>

            <div className="imp-cuentas">
              <div className="imp-cuenta imp-cuenta--nuevo"><strong>{cuenta.nuevo}</strong><span>se crean</span></div>
              <div className="imp-cuenta"><strong>{cuenta.existe}</strong><span>ya los tienes</span></div>
              <div className="imp-cuenta"><strong>{cuenta.repetido}</strong><span>repetidos en el archivo</span></div>
              <div className="imp-cuenta imp-cuenta--error"><strong>{cuenta.error}</strong><span>con problemas</span></div>
            </div>

            <label className="imp-filtro">
              <input type="checkbox" checked={soloProblemas} onChange={e => setSoloProblemas(e.target.checked)} />
              Ver sólo las filas con problemas o avisos
            </label>

            <div className="table-container imp-tabla">
              <table className="table">
                <thead>
                  <tr><th>Fila</th><th>{tipo === 'clientes' ? 'Cliente' : 'Producto'}</th><th>{tipo === 'clientes' ? 'NIF' : 'Precio · IVA'}</th><th>Qué pasa</th></tr>
                </thead>
                <tbody>
                  {visibles.map(f => (
                    <tr key={f.fila}>
                      <td className="imp-fila-num">{f.fila}</td>
                      <td>{f.titulo}</td>
                      <td className="imp-fila-dato">
                        {tipo === 'clientes'
                          ? ((f.ficha as Client | null)?.nif || (f.ficha as Client | null)?.vatNumber || '—')
                          : f.ficha ? `${(f.ficha as Product).unitPrice.toFixed(2)} € · ${(f.ficha as Product).defaultTaxRate} %` : '—'}
                      </td>
                      <td>
                        <span className={`imp-estado ${ESTADOS[f.estado].clase}`}>{ESTADOS[f.estado].texto}</span>
                        {[...f.errores, ...f.avisos].map((t, i) => (
                          <span key={i} className={`imp-motivo ${i < f.errores.length ? 'is-error' : ''}`}>{t}</span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filas.length > 200 && !soloProblemas && <p className="imp-nota">Se enseñan las 200 primeras filas; se importan todas.</p>}
          </section>

          {/* PASO 3 */}
          <section className="card imp-paso imp-final">
            {hecho ? (
              <div className="imp-hecho">
                {hecho.fallidos.length === 0 ? <CheckCircle2 size={22} /> : <XCircle size={22} />}
                <div>
                  <strong>{hecho.creados} {tipo} creados.</strong>
                  {hecho.fallidos.length > 0 && (
                    <>
                      <p>{hecho.fallidos.length} no se han podido guardar:</p>
                      <ul>{hecho.fallidos.slice(0, 20).map(t => <li key={t}>{t}</li>)}</ul>
                    </>
                  )}
                  <div className="imp-acciones">
                    <Link href={tipo === 'clientes' ? '/clientes' : '/productos'} className="btn btn-primary">
                      Ver {tipo}
                    </Link>
                    <button type="button" className="btn btn-ghost" onClick={empezarDeNuevo}><RotateCcw size={15} /> Importar otro archivo</button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="imp-acciones">
                <button type="button" className="btn btn-ghost" onClick={empezarDeNuevo} disabled={!!importando}>
                  <RotateCcw size={15} /> Otro archivo
                </button>
                <button type="button" className="btn btn-primary" onClick={importar} disabled={!!importando || aCrear.length === 0 || faltaObligatorio}>
                  {importando
                    ? <><Loader2 size={16} className="spin" /> Creando {importando.hechos} de {importando.total}…</>
                    : <><Upload size={16} /> Crear {aCrear.length} {tipo}</>}
                </button>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
