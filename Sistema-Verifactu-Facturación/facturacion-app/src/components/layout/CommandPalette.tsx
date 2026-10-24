'use client';

/**
 * EL BUSCADOR UNIVERSAL (Ctrl+K, o la lupa de la cabecera)
 *
 * Encuentra pantallas, acciones, documentos, clientes, proveedores,
 * artículos y el historial del programa anterior desde una sola caja (la
 * lógica está en lib/buscadorUniversal). Con la caja vacía sugiere lo
 * último que se abrió y los atajos de siempre. Flechas para moverse, Intro
 * para abrir, Esc para cerrar.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search, FileText, Users, Package, X, Plus, LayoutGrid, History, Clock, CornerDownLeft,
} from 'lucide-react';
import { getInvoices, getClients, getProducts, getCompanySettings } from '@/lib/storage';
import type { Invoice, Client, Product } from '@/lib/types';
import { modulosPorDefecto, type ModuloId } from '@/lib/modulos';
import { usePerfiles } from '@/lib/perfilesCliente';
import { puedeEntrar } from '@/lib/perfiles';
import type { Hoja } from '@/components/layout/MenuPrincipal';
import {
  buscarPantallas, quiereCrear, buscarDocumentos, buscarFichas, buscarArticulos, leerRecientes, apuntarReciente,
  type Resultado, type GrupoResultado,
} from '@/lib/buscadorUniversal';
import { buscarHistorico, fichasQueCasan, numeroVisible, ETIQUETA_TIPO } from '@/lib/historico';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

const TITULO_GRUPO: Record<GrupoResultado | 'reciente' | 'sugerido', string> = {
  reciente: 'Abierto hace poco',
  sugerido: 'Para empezar',
  accion: 'Crear',
  pantalla: 'Pantallas',
  documento: 'Documentos',
  ficha: 'Clientes y proveedores',
  articulo: 'Artículos',
  historico: 'Historial anterior',
};

const ICONO: Record<GrupoResultado, React.ComponentType<{ size?: number }>> = {
  accion: Plus,
  pantalla: LayoutGrid,
  documento: FileText,
  ficha: Users,
  articulo: Package,
  historico: History,
};

const SUGERIDOS: Resultado[] = [
  { clave: 's:nf', grupo: 'accion', titulo: 'Nueva factura de venta', href: '/facturas/nueva' },
  { clave: 's:na', grupo: 'accion', titulo: 'Nuevo albarán de venta', href: '/documentos/nuevo?tipo=albaran&sentido=venta' },
  { clave: 's:nc', grupo: 'accion', titulo: 'Nueva compra (albarán de proveedor)', href: '/documentos/nuevo?tipo=albaran&sentido=compra' },
  { clave: 's:cl', grupo: 'pantalla', titulo: 'Clientes', href: '/clientes?tipo=clientes' },
  { clave: 's:ar', grupo: 'pantalla', titulo: 'Artículos', href: '/productos' },
  { clave: 's:ve', grupo: 'pantalla', titulo: 'Vencimientos y cobros pendientes', href: '/tesoreria?tab=vencimientos' },
];

export default function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [modulos, setModulos] = useState<ModuloId[] | null>(null);
  const [historico, setHistorico] = useState<{ texto: string; filas: Resultado[] } | null>(null);
  const [recientes, setRecientes] = useState<Resultado[]>([]);
  const [activo, setActivo] = useState(0);
  const listaRef = useRef<HTMLDivElement>(null);
  const { activo: perfilActivo } = usePerfiles();

  useEffect(() => {
    if (!isOpen) return;
    let vivo = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lo recordado en este dispositivo, al abrir
    setRecientes(leerRecientes());
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
    return () => { vivo = false; };
  }, [isOpen]);

  const visible = useCallback((h: Hoja) => {
    if (h.modulo && modulos && !modulos.includes(h.modulo)) return false;
    return !perfilActivo || puedeEntrar(perfilActivo.rol, h.lista.split('?')[0]);
  }, [modulos, perfilActivo]);

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

  const secciones = useMemo((): { titulo: string; filas: Resultado[] }[] => {
    if (!texto) {
      return [
        { titulo: TITULO_GRUPO.reciente, filas: recientes },
        { titulo: TITULO_GRUPO.sugerido, filas: SUGERIDOS.filter(s => !recientes.some(r => r.href === s.href)) },
      ].filter(s => s.filas.length);
    }
    const pantallas = buscarPantallas(texto, visible);
    const acciones = { titulo: TITULO_GRUPO.accion, filas: pantallas.filter(r => r.grupo === 'accion').slice(0, 4) };
    const vistas = { titulo: TITULO_GRUPO.pantalla, filas: pantallas.filter(r => r.grupo === 'pantalla').slice(0, 5) };
    return [
      // «nuevo albarán» pide crear: eso primero. Si no, primero la pantalla.
      ...(quiereCrear(texto) ? [acciones, vistas] : [vistas, acciones]),
      { titulo: TITULO_GRUPO.ficha, filas: buscarFichas(clients, texto) },
      { titulo: TITULO_GRUPO.articulo, filas: buscarArticulos(products, texto) },
      { titulo: TITULO_GRUPO.documento, filas: buscarDocumentos(invoices, texto) },
      { titulo: TITULO_GRUPO.historico, filas: historico?.texto === texto ? historico.filas : [] },
    ].filter(s => s.filas.length);
  }, [texto, recientes, visible, clients, products, invoices, historico]);

  const planas = useMemo(() => secciones.flatMap(s => s.filas), [secciones]);
  const indice = Math.min(activo, Math.max(planas.length - 1, 0));

  useEffect(() => {
    listaRef.current?.querySelector(`[data-indice="${indice}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [indice]);

  const cerrar = () => {
    setQuery('');
    setActivo(0);
    onClose();
  };

  const abrir = (r: Resultado) => {
    apuntarReciente(r);
    router.push(r.href);
    cerrar();
  };

  const alTeclear = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActivo(Math.min(indice + 1, planas.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActivo(Math.max(indice - 1, 0)); }
    else if (e.key === 'Enter' && planas[indice]) { e.preventDefault(); abrir(planas[indice]); }
    else if (e.key === 'Escape') { e.preventDefault(); cerrar(); }
  };

  if (!isOpen) return null;

  let n = -1;
  return (
    <div className="cmd-palette-overlay" onClick={cerrar}>
      <div className="cmd-palette" role="dialog" aria-label="Buscar en todo" onClick={e => e.stopPropagation()}>
        <div className="cmd-palette-input">
          <Search size={18} style={{ color: 'var(--text-tertiary)' }} />
          <input
            type="text"
            role="combobox"
            aria-expanded
            aria-controls="cmd-resultados"
            aria-activedescendant={planas[indice] ? `cmd-${indice}` : undefined}
            placeholder="Buscar cliente, artículo, nº de documento, NIF, importe… o «nuevo albarán»"
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

        <div className="cmd-palette-results" id="cmd-resultados" role="listbox" ref={listaRef}>
          {secciones.map(s => (
            <div key={s.titulo} role="group" aria-label={s.titulo}>
              <div className="cmd-palette-group-label">{s.titulo}</div>
              {s.filas.map(r => {
                n += 1;
                const i = n;
                const Icono = s.titulo === TITULO_GRUPO.reciente ? Clock : ICONO[r.grupo];
                return (
                  <div
                    key={`${s.titulo}-${r.clave}`}
                    id={`cmd-${i}`}
                    data-indice={i}
                    role="option"
                    aria-selected={i === indice}
                    className={`cmd-palette-item${i === indice ? ' selected' : ''}`}
                    onMouseMove={() => setActivo(i)}
                    onClick={() => abrir(r)}
                  >
                    <div className="cmd-palette-item-texto">
                      <Icono size={16} />
                      <div>
                        <strong>{r.titulo}</strong>
                        {r.detalle && <small>{r.detalle}</small>}
                      </div>
                    </div>
                    {r.extra && <span className="cmd-palette-item-extra">{r.extra}</span>}
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

        <div className="cmd-palette-pie">
          <span><kbd>↑</kbd><kbd>↓</kbd> moverse</span>
          <span><kbd><CornerDownLeft size={11} /></kbd> abrir</span>
          <span><kbd>Esc</kbd> cerrar</span>
          <span className="cmd-palette-pie-atajo"><kbd>Ctrl</kbd><kbd>K</kbd> desde cualquier pantalla</span>
        </div>
      </div>
    </div>
  );
}
