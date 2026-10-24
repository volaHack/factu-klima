'use client';

/**
 * PRECIOS ESPECIALES DE UN CLIENTE
 *
 * Lo que se le cobra a este cliente distinto de su tarifa: un precio fijo o
 * un descuento por artículo, y un descuento por familia. Se aplica solo al
 * elegir el artículo en su factura, albarán, pedido o presupuesto (ver
 * `condicionesDeVenta` en lib/documentos.ts). Cada apunte se puede apagar
 * sin borrarlo: así se guardan las condiciones de temporada o las que
 * venían del programa anterior hasta confirmarlas.
 */

import { useEffect, useMemo, useState } from 'react';
import { Percent, Plus, Power, Tag, Trash2 } from 'lucide-react';

import { useToast } from '@/hooks/useToast';
import { getCompanyCategories, getProducts, saveClient, type CategoryOption } from '@/lib/storage';
import { getPrecioProductoParaCliente } from '@/lib/documentos';
import { formatCurrency } from '@/lib/utils';
import type { Client, CompanySettings, DescuentoFamilia, PrecioEspecial, Product } from '@/lib/types';
import BuscadorProducto from '@/components/productos/BuscadorProducto';

interface Props {
  client: Client;
  settings: CompanySettings | null;
  onGuardado: (c: Client) => void;
}

const etiquetaProducto = (p: Product) => (p.ref ? `${p.ref} · ${p.name}` : p.name);
const numero = (t: string): number | null => {
  const n = Number(t.replace(',', '.'));
  return t.trim() !== '' && Number.isFinite(n) ? n : null;
};

export default function CondicionesEspeciales({ client, settings, onGuardado }: Props) {
  const { success, error: avisarError } = useToast();
  const [productos, setProductos] = useState<Product[]>([]);
  const [categorias, setCategorias] = useState<CategoryOption[]>([]);
  const [guardando, setGuardando] = useState(false);

  const [articuloId, setArticuloId] = useState('');
  const [precio, setPrecio] = useState('');
  const [descuento, setDescuento] = useState('');
  const [familia, setFamilia] = useState('');
  const [descuentoFamilia, setDescuentoFamilia] = useState('');

  useEffect(() => {
    void Promise.all([getProducts(), getCompanyCategories()]).then(([p, c]) => {
      setProductos(p.filter(x => x.active !== false));
      setCategorias(c);
    });
  }, []);

  const precios = client.preciosEspeciales ?? [];
  const familias = client.descuentosFamilia ?? [];
  const porId = useMemo(() => new Map(productos.map(p => [p.id, p])), [productos]);
  const nombreFamilia = (id: string) => categorias.find(c => c.value === id)?.label ?? id;
  const apagados = precios.filter(p => !p.activo).length + familias.filter(f => !f.activo).length;

  const guardar = async (cambio: Partial<Pick<Client, 'preciosEspeciales' | 'descuentosFamilia'>>, aviso: string) => {
    const nuevo: Client = { ...client, ...cambio, updatedAt: new Date().toISOString() };
    setGuardando(true);
    try {
      await saveClient(nuevo);
      onGuardado(nuevo);
      success(aviso);
      return true;
    } catch (e) {
      avisarError('No se ha podido guardar', e instanceof Error ? e.message : 'Inténtalo otra vez.');
      return false;
    } finally {
      setGuardando(false);
    }
  };

  const anadirPrecio = async () => {
    const p = productos.find(x => x.id === articuloId);
    if (!p) { avisarError('Busca y elige el artículo'); return; }
    const pr = numero(precio);
    const de = numero(descuento);
    if (pr !== null && pr <= 0) { avisarError('El precio tiene que ser mayor que cero'); return; }
    if (de !== null && (de <= 0 || de > 100)) { avisarError('El descuento va de 0 a 100 %'); return; }
    if (pr === null && de === null) { avisarError('Pon un precio, un descuento o los dos'); return; }
    const entrada: PrecioEspecial = { productId: p.id, precio: pr, descuento: de, activo: true };
    const ok = await guardar(
      { preciosEspeciales: [...precios.filter(x => x.productId !== p.id), entrada] },
      precios.some(x => x.productId === p.id) ? 'Precio especial cambiado' : 'Precio especial añadido',
    );
    if (ok) { setArticuloId(''); setPrecio(''); setDescuento(''); }
  };

  const anadirFamilia = async () => {
    const de = numero(descuentoFamilia);
    if (!familia) { avisarError('Elige la familia'); return; }
    if (de === null || de <= 0 || de > 100) { avisarError('El descuento va de 0 a 100 %'); return; }
    const entrada: DescuentoFamilia = { categoria: familia, descuento: de, activo: true };
    const ok = await guardar(
      { descuentosFamilia: [...familias.filter(x => x.categoria !== familia), entrada] },
      'Descuento por familia guardado',
    );
    if (ok) { setFamilia(''); setDescuentoFamilia(''); }
  };

  const encenderTodo = () => guardar({
    preciosEspeciales: precios.map(p => ({ ...p, activo: true })),
    descuentosFamilia: familias.map(f => ({ ...f, activo: true })),
  }, 'Todas las condiciones encendidas');

  return (
    <div className="card" style={{ marginTop: 'var(--space-6)' }}>
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <h3 className="card-title"><Tag size={16} aria-hidden /> Precios especiales</h3>
          <p className="card-subtitle">
            Se aplican solos al poner el artículo en sus facturas, albaranes, pedidos y presupuestos.
            Manda lo más concreto: precio del artículo, descuento del artículo y, después, descuento de la familia.
          </p>
        </div>
        {apagados > 0 && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={encenderTodo} disabled={guardando}>
            <Power size={14} /> Encender {apagados === 1 ? 'la apagada' : `las ${apagados} apagadas`}
          </button>
        )}
      </div>

      {/* Por artículo */}
      <div className="table-container" style={{ border: 'none' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Artículo</th>
              <th style={{ textAlign: 'right' }}>Su tarifa</th>
              <th style={{ textAlign: 'right' }}>Precio especial</th>
              <th style={{ textAlign: 'right' }}>Descuento</th>
              <th>Aplicar</th>
              <th><span className="solo-lectores">Quitar</span></th>
            </tr>
          </thead>
          <tbody>
            {precios.map(pe => {
              const p = porId.get(pe.productId);
              return (
                <tr key={pe.productId} style={pe.activo ? undefined : { opacity: 0.55 }}>
                  <td>{p ? etiquetaProducto(p) : <em>Artículo que ya no existe</em>}</td>
                  <td className="amount">{p ? formatCurrency(getPrecioProductoParaCliente(p, client.tarifaId, settings?.tarifas)) : '—'}</td>
                  <td className="amount">{pe.precio ? <strong>{formatCurrency(pe.precio)}</strong> : '—'}</td>
                  <td className="amount">{pe.descuento ? `${pe.descuento.toLocaleString('es-ES')} %` : '—'}</td>
                  <td>
                    <label style={{ display: 'inline-flex', gap: 'var(--space-1)', alignItems: 'center' }}>
                      <input
                        type="checkbox"
                        checked={pe.activo}
                        disabled={guardando}
                        onChange={e => guardar(
                          { preciosEspeciales: precios.map(x => (x.productId === pe.productId ? { ...x, activo: e.target.checked } : x)) },
                          e.target.checked ? 'Precio especial encendido' : 'Precio especial apagado',
                        )}
                      />
                      {pe.activo ? 'Sí' : 'Apagado'}
                    </label>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon btn-sm"
                      disabled={guardando}
                      aria-label={`Quitar el precio especial de ${p ? p.name : 'este artículo'}`}
                      onClick={() => guardar({ preciosEspeciales: precios.filter(x => x.productId !== pe.productId) }, 'Precio especial quitado')}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
            {precios.length === 0 && (
              <tr><td colSpan={6} className="form-hint">Este cliente paga todos los artículos a su tarifa.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'flex-end', padding: 'var(--space-3) 0' }}>
        <div className="form-group" style={{ flex: '3 1 260px', margin: 0 }}>
          <span className="form-label">Artículo</span>
          <BuscadorProducto products={productos} value={articuloId} onSelect={setArticuloId} placeholder="Busca la referencia, el nombre o el código" />
        </div>
        <label className="form-group" style={{ flex: '1 1 110px', margin: 0 }}>
          <span className="form-label">Precio (sin impuesto)</span>
          <input className="form-input" inputMode="decimal" value={precio} onChange={e => setPrecio(e.target.value)} placeholder="—" />
        </label>
        <label className="form-group" style={{ flex: '1 1 90px', margin: 0 }}>
          <span className="form-label">Descuento %</span>
          <input className="form-input" inputMode="decimal" value={descuento} onChange={e => setDescuento(e.target.value)} placeholder="—" />
        </label>
        <button type="button" className="btn btn-primary btn-sm" onClick={anadirPrecio} disabled={guardando}>
          <Plus size={14} /> Añadir
        </button>
      </div>

      {/* Por familia */}
      <h4 className="card-title" style={{ marginTop: 'var(--space-4)' }}><Percent size={14} aria-hidden /> Descuento por familia</h4>
      <div className="table-container" style={{ border: 'none' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Familia</th>
              <th style={{ textAlign: 'right' }}>Descuento</th>
              <th>Aplicar</th>
              <th><span className="solo-lectores">Quitar</span></th>
            </tr>
          </thead>
          <tbody>
            {familias.map(f => (
              <tr key={f.categoria} style={f.activo ? undefined : { opacity: 0.55 }}>
                <td>{nombreFamilia(f.categoria)}</td>
                <td className="amount">{f.descuento.toLocaleString('es-ES')} %</td>
                <td>
                  <label style={{ display: 'inline-flex', gap: 'var(--space-1)', alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={f.activo}
                      disabled={guardando}
                      onChange={e => guardar(
                        { descuentosFamilia: familias.map(x => (x.categoria === f.categoria ? { ...x, activo: e.target.checked } : x)) },
                        e.target.checked ? 'Descuento encendido' : 'Descuento apagado',
                      )}
                    />
                    {f.activo ? 'Sí' : 'Apagado'}
                  </label>
                </td>
                <td>
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon btn-sm"
                    disabled={guardando}
                    aria-label={`Quitar el descuento de ${nombreFamilia(f.categoria)}`}
                    onClick={() => guardar({ descuentosFamilia: familias.filter(x => x.categoria !== f.categoria) }, 'Descuento quitado')}
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {familias.length === 0 && (
              <tr><td colSpan={4} className="form-hint">Sin descuentos por familia.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', alignItems: 'flex-end', paddingTop: 'var(--space-3)' }}>
        <label className="form-group" style={{ flex: '3 1 220px', margin: 0 }}>
          <span className="form-label">Familia</span>
          <select className="form-select" value={familia} onChange={e => setFamilia(e.target.value)}>
            <option value="">Elige una familia</option>
            {categorias.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </label>
        <label className="form-group" style={{ flex: '1 1 90px', margin: 0 }}>
          <span className="form-label">Descuento %</span>
          <input className="form-input" inputMode="decimal" value={descuentoFamilia} onChange={e => setDescuentoFamilia(e.target.value)} placeholder="—" />
        </label>
        <button type="button" className="btn btn-primary btn-sm" onClick={anadirFamilia} disabled={guardando}>
          <Plus size={14} /> Añadir
        </button>
      </div>
    </div>
  );
}
