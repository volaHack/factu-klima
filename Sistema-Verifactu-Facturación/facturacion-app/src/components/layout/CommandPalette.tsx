'use client';

/**
 * EL BUSCADOR UNIVERSAL (Ctrl+K, o la lupa de la cabecera)
 *
 * Encuentra pantallas, acciones, documentos, clientes, proveedores,
 * artículos y el historial del programa anterior desde una sola caja (la
 * lógica está en lib/buscadorUniversal). Y además HACE: «fra bar pepe» abre
 * la factura nueva con el cliente puesto, «cobrar F-2026-1127» la factura,
 * «vencidas» lo que hay que reclamar (lib/ordenesPaleta). La orden sale la
 * primera, así que basta con escribir e Intro.
 *
 * Con la caja vacía salen las fichas fijadas con la estrella y las últimas
 * abiertas (lib/memoriaFichas), y los atajos de siempre. Flechas para
 * moverse, Intro para abrir, Ctrl+D para fijar o quitar la estrella, Esc
 * para cerrar.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, FileText, Users, Package, X, Plus, LayoutGrid, History, Clock, CornerDownLeft, Star,
  ClipboardList, Truck, ShoppingBag, HandCoins, UserPlus, Building2, PackagePlus, ArrowRight, CalendarClock,
} from 'lucide-react';
import { getInvoices, getClients, getProducts, getCompanySettings } from '@/lib/storage';
import type { Invoice, Client, Product } from '@/lib/types';
import { modulosPorDefecto, type ModuloId } from '@/lib/modulos';
import { usePerfiles } from '@/lib/perfilesCliente';
import { puedeEntrar } from '@/lib/perfiles';
import type { Hoja } from '@/components/layout/MenuPrincipal';
import {
  buscarPantallas, quiereCrear, buscarDocumentos, buscarFichas, buscarArticulos, fichaDeResultado,
  type Resultado, type GrupoResultado,
} from '@/lib/buscadorUniversal';
import { interpretarOrden, type IconoOrden, type Orden } from '@/lib/ordenesPaleta';
import {
  leerMemoria, recordarFicha, alternarFijada, estaFijada, EVENTO_MEMORIA,
  type FichaRecordada, type Memoria, type TipoFicha,
} from '@/lib/memoriaFichas';
import { buscarHistorico, fichasQueCasan, numeroVisible, ETIQUETA_TIPO } from '@/lib/historico';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

type Icono = React.ComponentType<{ size?: number }>;

/** Una fila de la lista, venga de una orden, de lo recordado o de la búsqueda. */
interface Fila {
  clave: string;
  titulo: string;
  detalle?: string;
  extra?: string;
  href: string;
  Icono: Icono;
  tecla?: string;
  truco?: string;
  /** Si se puede fijar con la estrella (y se recuerda al abrirla). */
  ficha?: Omit<FichaRecordada, 'cuando'> | null;
  esOrden?: boolean;
}

const TITULO_GRUPO: Record<GrupoResultado | 'orden' | 'fijada' | 'reciente' | 'sugerido', string> = {
  orden: 'Hacer',
  fijada: 'Fijadas',
  reciente: 'Abierto hace poco',
  sugerido: 'Para empezar',
  accion: 'Crear',
  pantalla: 'Pantallas',
  documento: 'Documentos',
  ficha: 'Clientes y proveedores',
  articulo: 'Artículos',
  historico: 'Historial anterior',
};

const ICONO: Record<GrupoResultado, Icono> = {
  accion: Plus,
  pantalla: LayoutGrid,
  documento: FileText,
  ficha: Users,
  articulo: Package,
  historico: History,
};

const ICONO_ORDEN: Record<IconoOrden, Icono> = {
  factura: FileText,
  presupuesto: ClipboardList,
  albaran: Truck,
  pedido: ShoppingBag,
  cobrar: HandCoins,
  cliente: UserPlus,
  proveedor: Building2,
  producto: PackagePlus,
  ir: ArrowRight,
  vencidas: CalendarClock,
};

const ICONO_FICHA: Record<TipoFicha, Icono> = {
  factura: FileText,
  documento: FileText,
  cliente: Users,
  producto: Package,
  pantalla: LayoutGrid,
};

const SUGERIDOS: Resultado[] = [
  { clave: 's:nf', grupo: 'accion', titulo: 'Nueva factura de venta', href: '/facturas/nueva' },
  { clave: 's:na', grupo: 'accion', titulo: 'Nuevo albarán de venta', href: '/documentos/nuevo?tipo=albaran&sentido=venta' },
  { clave: 's:nc', grupo: 'accion', titulo: 'Nueva compra (albarán de proveedor)', href: '/documentos/nuevo?tipo=albaran&sentido=compra' },
  { clave: 's:cl', grupo: 'pantalla', titulo: 'Clientes', href: '/clientes?tipo=clientes' },
  { clave: 's:ar', grupo: 'pantalla', titulo: 'Artículos', href: '/productos' },
  { clave: 's:ve', grupo: 'pantalla', titulo: 'Vencimientos y cobros pendientes', href: '/tesoreria?tab=vencimientos' },
];

/** Lo que se puede escribir, enseñado con la caja vacía. */
const EJEMPLOS = ['fra bar pepe', 'cobrar F-2026-0012', 'presu pepe', 'ir a tesorería', 'vencidas', 'producto nuevo'];

const deResultado = (r: Resultado, Icono: Icono = ICONO[r.grupo]): Fila => ({
  clave: r.clave, titulo: r.titulo, detalle: r.detalle, extra: r.extra, href: r.href, Icono, ficha: fichaDeResultado(r),
});

const deOrden = (o: Orden): Fila => ({
  clave: o.clave, titulo: o.titulo, detalle: o.detalle, href: o.href, Icono: ICONO_ORDEN[o.icono], tecla: o.tecla, truco: o.truco, esOrden: true,
});

const deRecordada = (f: FichaRecordada, Icono: Icono = ICONO_FICHA[f.tipo]): Fila => ({
  clave: f.clave, titulo: f.titulo, detalle: f.detalle, href: f.href, Icono, ficha: f,
});

export default function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [modulos, setModulos] = useState<ModuloId[] | null>(null);
  const [historico, setHistorico] = useState<{ texto: string; filas: Resultado[] } | null>(null);
  const [memoria, setMemoria] = useState<Memoria>({ recientes: [], fijadas: [] });
  const [activo, setActivo] = useState(0);
  const listaRef = useRef<HTMLDivElement>(null);
  const entradaRef = useRef<HTMLInputElement>(null);
  const { activo: perfilActivo, cuenta } = usePerfiles();

  useEffect(() => {
    if (!isOpen) return;
    let vivo = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lo recordado en este dispositivo, al abrir
    setMemoria(leerMemoria(cuenta));
    const alCambiar = () => setMemoria(leerMemoria(cuenta));
    window.addEventListener(EVENTO_MEMORIA, alCambiar);
    (async () => {
      const [inv, cli, pro, ajustes] = await Promise.all([
        getInvoices(), getClients(), getProducts(), getCompanySettings().catch(() => null),
      ]);
      if (!vivo) return;
      setInvoices(inv);
      setClients(cli);
      setProducts(pro);
      if (ajustes) setModulos(ajustes.modulos ?? modulosPorDefecto(ajustes.sector));
    })();
    return () => { vivo = false; window.removeEventListener(EVENTO_MEMORIA, alCambiar); };
  }, [isOpen, cuenta]);

  const puede = useCallback(
    (href: string) => !perfilActivo || puedeEntrar(perfilActivo.rol, href.split('?')[0]),
    [perfilActivo],
  );
  const visible = useCallback((h: Hoja) => {
    if (h.modulo && modulos && !modulos.includes(h.modulo)) return false;
    return puede(h.lista);
  }, [modulos, puede]);

  const texto = query.trim();

  // El historial del programa anterior está en la base de datos (diecisiete
  // mil documentos): se le pregunta a ella, un momento después de teclear.
  useEffect(() => {
    if (!isOpen || texto.length < 3) return;
    let vivo = true;
    const t = setTimeout(() => {
      buscarHistorico({ texto, clientIds: fichasQueCasan(clients, texto) }, 0, 5)
        .then(({ docs }) => {
          if (!vivo) return;
          setHistorico({
            texto,
            filas: docs.map(d => ({
              clave: `hist:${d.id}`,
              grupo: 'historico',
              titulo: `${ETIQUETA_TIPO[d.tipo] ?? d.tipo} ${numeroVisible(d)}`,
              detalle: [clients.find(c => c.id === d.clientId)?.tradeName || clients.find(c => c.id === d.clientId)?.businessName || d.codigoTercero, d.fecha].filter(Boolean).join(' · '),
              extra: new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(d.total),
              href: `/documentos/historico/${d.id}`,
            })),
          });
        })
        .catch(() => {});
    }, 300);
    return () => { vivo = false; clearTimeout(t); };
  }, [isOpen, texto, clients]);

  const secciones = useMemo((): { titulo: string; filas: Fila[] }[] => {
    // Lo mismo no sale dos veces: la primera sección que lo trae se lo queda
    // (la orden antes que la pantalla, lo fijado antes que lo reciente).
    const vistas = new Set<string>();
    const sinRepetir = (filas: Fila[]) => filas.filter(f => {
      const k = f.href;
      if (vistas.has(k)) return false;
      vistas.add(k);
      return true;
    });
    const montar = (lista: { titulo: string; filas: Fila[] }[]) =>
      lista.map(s => ({ ...s, filas: sinRepetir(s.filas) })).filter(s => s.filas.length);

    if (!texto) {
      return montar([
        { titulo: TITULO_GRUPO.fijada, filas: memoria.fijadas.map(f => deRecordada(f)) },
        { titulo: TITULO_GRUPO.reciente, filas: memoria.recientes.slice(0, 6).map(f => deRecordada(f, f.tipo === 'pantalla' ? Clock : ICONO_FICHA[f.tipo])) },
        { titulo: TITULO_GRUPO.sugerido, filas: SUGERIDOS.map(s => deResultado(s)) },
      ]);
    }
    const ordenes = interpretarOrden(texto, { clientes: clients, documentos: invoices, modulos, puede });
    const pantallas = buscarPantallas(texto, visible);
    const acciones = { titulo: TITULO_GRUPO.accion, filas: pantallas.filter(r => r.grupo === 'accion').slice(0, 4).map(r => deResultado(r)) };
    const vistasPant = { titulo: TITULO_GRUPO.pantalla, filas: pantallas.filter(r => r.grupo === 'pantalla').slice(0, 5).map(r => deResultado(r)) };
    return montar([
      { titulo: TITULO_GRUPO.orden, filas: ordenes.map(deOrden) },
      // «nuevo albarán» pide crear: eso primero. Si no, primero la pantalla.
      ...(quiereCrear(texto) ? [acciones, vistasPant] : [vistasPant, acciones]),
      { titulo: TITULO_GRUPO.ficha, filas: buscarFichas(clients, texto).map(r => deResultado(r)) },
      { titulo: TITULO_GRUPO.articulo, filas: buscarArticulos(products, texto).map(r => deResultado(r)) },
      { titulo: TITULO_GRUPO.documento, filas: buscarDocumentos(invoices, texto).map(r => deResultado(r)) },
      { titulo: TITULO_GRUPO.historico, filas: (historico?.texto === texto ? historico.filas : []).map(r => deResultado(r)) },
    ]);
  }, [texto, memoria, visible, puede, modulos, clients, products, invoices, historico]);

  const planas = useMemo(() => secciones.flatMap(s => s.filas), [secciones]);
  // Dónde empieza cada sección en la lista plana que recorren las flechas.
  const inicios = useMemo(() => secciones.map((_, k) => secciones.slice(0, k).reduce((t, s) => t + s.filas.length, 0)), [secciones]);
  const indice = Math.min(activo, Math.max(planas.length - 1, 0));

  useEffect(() => {
    listaRef.current?.querySelector(`[data-indice="${indice}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [indice]);

  const cerrar = () => {
    setQuery('');
    setActivo(0);
    onClose();
  };

  const abrir = (f: Fila) => {
    if (f.ficha) recordarFicha(cuenta, f.ficha);
    router.push(f.href);
    cerrar();
  };

  const fijar = (f: Fila) => {
    if (f.ficha) setMemoria(alternarFijada(cuenta, f.ficha));
  };

  const alTeclear = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActivo(Math.min(indice + 1, planas.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActivo(Math.max(indice - 1, 0)); }
    else if (e.key === 'Home' && e.ctrlKey) { e.preventDefault(); setActivo(0); }
    else if (e.key === 'End' && e.ctrlKey) { e.preventDefault(); setActivo(Math.max(planas.length - 1, 0)); }
    else if (e.key === 'Enter' && planas[indice]) { e.preventDefault(); abrir(planas[indice]); }
    else if (e.key === 'Escape') { e.preventDefault(); cerrar(); }
    // Ctrl+D, como marcar una página: fija la fila activa.
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd' && planas[indice]?.ficha) { e.preventDefault(); fijar(planas[indice]); }
  };

  if (!isOpen) return null;

  return (
    <div className="cmd-palette-overlay" onClick={cerrar}>
      <div className="cmd-palette" role="dialog" aria-modal="true" aria-label="Buscar o pedir algo" onClick={e => e.stopPropagation()}>
        <div className="cmd-palette-input">
          <Search size={18} style={{ color: 'var(--text-tertiary)' }} />
          <input
            ref={entradaRef}
            type="text"
            role="combobox"
            aria-expanded
            aria-controls="cmd-resultados"
            aria-autocomplete="list"
            aria-label="Buscar o escribir una orden"
            aria-activedescendant={planas[indice] ? `cmd-${indice}` : undefined}
            placeholder="Busca, o pide: «fra bar pepe», «cobrar F-2026-0012», «vencidas»…"
            value={query}
            onChange={e => { setQuery(e.target.value); setActivo(0); }}
            onKeyDown={alTeclear}
            autoFocus
            autoComplete="off"
            spellCheck={false}
          />
          <button className="btn btn-ghost btn-sm" onClick={cerrar} aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>

        <div className="cmd-palette-results" id="cmd-resultados" role="listbox" aria-label="Resultados" ref={listaRef}>
          {secciones.map((s, k) => (
            <div key={s.titulo} role="group" aria-label={s.titulo}>
              <div className="cmd-palette-group-label" aria-hidden="true">{s.titulo}</div>
              {s.filas.map((f, j) => {
                const i = inicios[k] + j;
                const fijada = f.ficha ? estaFijada(memoria, f.ficha.clave) : false;
                return (
                  <div
                    key={`${s.titulo}-${f.clave}`}
                    id={`cmd-${i}`}
                    data-indice={i}
                    role="option"
                    aria-selected={i === indice}
                    className={`cmd-palette-item${i === indice ? ' selected' : ''}${f.esOrden ? ' cmd-palette-item--orden' : ''}`}
                    onMouseMove={() => setActivo(i)}
                    onClick={() => abrir(f)}
                  >
                    <div className="cmd-palette-item-texto">
                      <f.Icono size={16} />
                      <div>
                        <strong>{f.titulo}</strong>
                        {f.detalle && <small>{f.detalle}</small>}
                      </div>
                    </div>
                    <div className="cmd-fila-fin">
                      {f.extra && <span className="cmd-palette-item-extra">{f.extra}</span>}
                      {f.tecla && <kbd className="cmd-tecla" title={`También con la tecla ${f.tecla} desde cualquier pantalla`}>{f.tecla}</kbd>}
                      {!f.tecla && f.truco && <span className="cmd-truco">«{f.truco}»</span>}
                      {f.esOrden && i === indice && <CornerDownLeft size={14} className="cmd-intro" aria-hidden="true" />}
                      {f.ficha && (
                        // Dentro de una opción no se tabula (la lista se maneja
                        // con las flechas): con el teclado se fija con Ctrl+D.
                        <button
                          type="button"
                          tabIndex={-1}
                          className={`cmd-estrella${fijada ? ' is-fijada' : ''}`}
                          aria-pressed={fijada}
                          aria-label={fijada ? `Quitar ${f.titulo} de las fijadas` : `Fijar ${f.titulo}`}
                          title={fijada ? 'Quitar de las fijadas (Ctrl+D)' : 'Fijar arriba (Ctrl+D)'}
                          onClick={e => { e.stopPropagation(); fijar(f); }}
                        >
                          <Star size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {texto && planas.length === 0 && (
            <div className="cmd-palette-vacio">
              Nada con «{texto}». Prueba con menos letras, el NIF, la referencia o el número sin la serie.
            </div>
          )}
        </div>

        {/* Fuera de la lista: son botones, no opciones que se elijan con las flechas. */}
        {!texto && (
          <div className="cmd-trucos">
            <span>También puedes pedirlo con palabras:</span>
            {EJEMPLOS.map(ej => (
              <button key={ej} type="button" className="cmd-truco-ejemplo" onClick={() => { setQuery(ej); setActivo(0); entradaRef.current?.focus(); }}>
                {ej}
              </button>
            ))}
          </div>
        )}

        <div className="cmd-palette-pie">
          <span><kbd>↑</kbd><kbd>↓</kbd> moverse</span>
          <span><kbd><CornerDownLeft size={11} /></kbd> abrir</span>
          <span><kbd>Ctrl</kbd><kbd>D</kbd> fijar</span>
          <span><kbd>Esc</kbd> cerrar</span>
          <span className="cmd-palette-pie-atajo"><kbd>Ctrl</kbd><kbd>K</kbd> desde cualquier pantalla</span>
        </div>
      </div>
    </div>
  );
}
