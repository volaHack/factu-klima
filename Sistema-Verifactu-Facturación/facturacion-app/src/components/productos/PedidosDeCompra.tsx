'use client';

/**
 * «PREPARAR PEDIDOS DE COMPRA», DESDE «REPÓN ESTO»
 *
 * Lo que hay que reponer, repartido por proveedor (el de la última compra
 * de cada artículo) y con las cantidades en cajas completas. Antes de crear
 * nada se ve cada pedido y se quita el que no toque; lo nunca comprado se
 * puede mandar a un proveedor elegido aquí. Se crean BORRADORES de pedido
 * de compra por la misma vía que la pantalla de documentos (saveDocumento,
 * que sin conexión los deja en la cola). Nada se manda ni se emite.
 * La cuenta está en lib/pedidoCompra.
 */

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { ShoppingCart, Loader2, Check, ExternalLink } from 'lucide-react';
import DialogoRapido from '@/components/documentos/DialogoRapido';
import type { Client, CompanySettings, Invoice, Product } from '@/lib/types';
import type { Reposicion } from '@/lib/reposicion';
import {
  repartirPorProveedor, proveedorDeFicha, grupoCon, numerosDePedido, pedidoBorrador, type GrupoPedido, type LineaPedido,
} from '@/lib/pedidoCompra';
import { getCompanySettings, getProveedores, saveDocumento } from '@/lib/storage';
import { actualizarContadorSerie } from '@/lib/documentos';
import { formatCurrency } from '@/lib/utils';
import { useToast } from '@/hooks/useToast';

const num = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 2 });

function cantidad(l: LineaPedido): string {
  if (l.cajas && l.udsCaja) return `${num(l.cajas)} ${l.cajas === 1 ? 'caja' : 'cajas'} × ${num(l.udsCaja)}`;
  return `${num(l.unidades)} ${l.unidad}`;
}

export default function PedidosDeCompra({ reponer, productos, documentos, onCerrar }: {
  reponer: readonly Reposicion[];
  productos: readonly Product[];
  documentos: readonly Invoice[];
  onCerrar: () => void;
}) {
  const { success, error: toastError } = useToast();
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [proveedores, setProveedores] = useState<Client[]>([]);
  const [quitados, setQuitados] = useState<Set<string>>(() => new Set());
  const [paraSinProveedor, setParaSinProveedor] = useState('');
  const [creando, setCreando] = useState(false);
  const [creados, setCreados] = useState<Invoice[] | null>(null);

  useEffect(() => {
    let vivo = true;
    void Promise.all([getCompanySettings(), getProveedores()]).then(([s, p]) => {
      if (!vivo) return;
      setSettings(s);
      setProveedores(p.filter(x => x.active !== false));
    });
    return () => { vivo = false; };
  }, []);

  const reparto = useMemo(() => repartirPorProveedor(reponer, productos, documentos), [reponer, productos, documentos]);

  // Lo nunca comprado, si se ha elegido a quién pedírselo, va con los demás
  // (junto al pedido de ese proveedor si ya tenía uno).
  const grupos = useMemo<GrupoPedido[]>(() => {
    const ficha = proveedores.find(p => p.id === paraSinProveedor);
    if (!ficha || !reparto.sinProveedor.length) return reparto.grupos;
    const prov = proveedorDeFicha(ficha);
    const yaEsta = reparto.grupos.find(g => g.proveedor.clave === prov.clave);
    if (yaEsta) return reparto.grupos.map(g => (g === yaEsta ? grupoCon(g.proveedor, [...g.lineas, ...reparto.sinProveedor]) : g));
    return [...reparto.grupos, grupoCon(prov, reparto.sinProveedor)];
  }, [reparto, proveedores, paraSinProveedor]);

  const elegidos = grupos.filter(g => !quitados.has(g.proveedor.clave));
  const alternar = (clave: string) => setQuitados(prev => {
    const n = new Set(prev);
    if (n.has(clave)) n.delete(clave); else n.add(clave);
    return n;
  });

  const crear = async () => {
    if (!settings || !elegidos.length) return;
    setCreando(true);
    try {
      const numeros = numerosDePedido(settings, elegidos.length);
      const guardados: Invoice[] = [];
      for (const [i, g] of elegidos.entries()) guardados.push(await saveDocumento(pedidoBorrador(g, numeros[i])));
      // El contador de la serie, con el número más alto que se ha usado.
      const ultimo = [...guardados].sort((a, b) => a.number.localeCompare(b.number)).at(-1);
      if (ultimo) await actualizarContadorSerie(settings, 'pedido_compra', ultimo.number);
      setCreados(guardados);
      success(
        guardados.length === 1 ? 'Borrador de pedido creado' : `${guardados.length} borradores de pedido creados`,
        'Revísalos y mándalos a cada proveedor cuando quieras.',
      );
    } catch (e) {
      toastError('No se han podido crear los pedidos', e instanceof Error ? e.message : '');
    } finally {
      setCreando(false);
    }
  };

  // Al cuerpo de la página: el aviso vive dentro de una lista que puede
  // llevar efectos de entrada, y un «position: fixed» dentro de algo
  // transformado deja de cubrir la pantalla.
  if (creados) {
    return createPortal(
      <DialogoRapido
        titulo="Pedidos preparados"
        icono={<Check size={18} />}
        onCerrar={onCerrar}
        className="pedidos-compra"
        pie={<button type="button" className="btn btn-primary" onClick={onCerrar} data-foco-inicial>Hecho</button>}
      >
        <p className="pedidos-compra-intro">Están en borrador: ábrelos, repásalos y mándalos al proveedor.</p>
        <ul className="pedidos-compra-hechos">
          {creados.map(d => (
            <li key={d.id}>
              <span><strong className="mono">{d.number}</strong> · {d.clientName}</span>
              <Link href={`/documentos/${d.id}`} className="btn btn-ghost btn-sm" aria-label={`Abrir el pedido ${d.number} de ${d.clientName}`}>
                <ExternalLink size={14} /> Abrir
              </Link>
            </li>
          ))}
        </ul>
      </DialogoRapido>,
      document.body,
    );
  }

  return createPortal(
    <DialogoRapido
      titulo="Preparar pedidos de compra"
      icono={<ShoppingCart size={18} />}
      onCerrar={onCerrar}
      className="pedidos-compra"
      pie={(
        <>
          <button type="button" className="btn btn-outline" onClick={onCerrar}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={() => void crear()} disabled={creando || !settings || !elegidos.length}>
            {creando ? <Loader2 size={16} className="spin" /> : <Check size={16} />}
            {elegidos.length === 1 ? 'Crear 1 borrador' : `Crear ${elegidos.length} borradores`}
          </button>
        </>
      )}
    >
      <p className="pedidos-compra-intro">
        Un pedido por proveedor, al que se le compró la última vez, con lo que conviene pedir en cajas completas.
        Se crean como borrador: no se manda nada.
      </p>

      {!grupos.length && !reparto.sinProveedor.length && (
        <p className="pedidos-compra-vacio">No hay nada nuevo que pedir{reparto.yaEnBorrador.length ? ': lo que falta ya está en un borrador de pedido.' : '.'}</p>
      )}

      {grupos.map(g => {
        const dentro = !quitados.has(g.proveedor.clave);
        return (
          <section key={g.proveedor.clave} className="pedidos-compra-grupo" data-fuera={!dentro || undefined}>
            <label className="pedidos-compra-cabecera">
              <input type="checkbox" checked={dentro} onChange={() => alternar(g.proveedor.clave)} />
              <span className="pedidos-compra-proveedor">
                <strong>{g.proveedor.clientName}</strong>
                <small>{g.lineas.length} {g.lineas.length === 1 ? 'artículo' : 'artículos'} · base {formatCurrency(g.base)}</small>
              </span>
            </label>
            <ul className="pedidos-compra-lineas">
              {g.lineas.map(l => (
                <li key={l.productId}>
                  <span className="pedidos-compra-articulo">
                    {l.nombre}
                    <small className="mono">{l.supplierRef ? `Ref. proveedor ${l.supplierRef}` : l.ref}</small>
                  </span>
                  <span className="pedidos-compra-cantidad">
                    <strong className="mono">{cantidad(l)}</strong>
                    <small>{l.precio > 0 ? `${formatCurrency(l.precio)}/${l.unidad}` : 'sin precio de compra'}</small>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {reparto.sinProveedor.length > 0 && (
        <section className="pedidos-compra-grupo pedidos-compra-sin">
          <p className="pedidos-compra-proveedor">
            <strong>Sin proveedor conocido</strong>
            <small>{reparto.sinProveedor.map(l => l.nombre).join(', ')}: nunca se han comprado.</small>
          </p>
          <label className="form-label" htmlFor="pedido-sin-proveedor">Pedírselo a</label>
          <select id="pedido-sin-proveedor" className="form-select" value={paraSinProveedor} onChange={e => setParaSinProveedor(e.target.value)}>
            <option value="">— No pedirlo ahora —</option>
            {proveedores.map(p => <option key={p.id} value={p.id}>{p.businessName}</option>)}
          </select>
        </section>
      )}

      {reparto.yaEnBorrador.length > 0 && (grupos.length > 0 || reparto.sinProveedor.length > 0) && (
        <p className="pedidos-compra-nota">Ya en un borrador de pedido, no se repite: {reparto.yaEnBorrador.join(', ')}.</p>
      )}
    </DialogoRapido>,
    document.body,
  );
}
