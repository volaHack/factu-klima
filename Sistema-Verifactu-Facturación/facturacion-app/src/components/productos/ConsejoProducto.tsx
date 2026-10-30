'use client';

/**
 * «CÓMO LE VA», DENTRO DE LA FICHA DEL PRODUCTO
 *
 * Lo que dicen las facturas de este artículo (lib/consejoProducto): las
 * ventas del año en una gráfica pequeña, quién lo compra, a cuánto se vende
 * de verdad frente al precio de la ficha, el margen y, si toca, el aviso de
 * que el precio lleva un año quieto mientras el coste sube, con el precio
 * que mantendría el margen de entonces y un botón para ponerlo.
 */

import { useMemo } from 'react';
import Link from 'next/link';
import { AlertTriangle, TrendingUp } from 'lucide-react';
import type { Invoice, Product } from '@/lib/types';
import { consejoDeProducto } from '@/lib/consejoProducto';
import { formatCurrency } from '@/lib/utils';

const pct = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(1).replace('.', ',')} %`;
const MES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const mesYAno = (fecha: string) => `${MES_LARGO[Number(fecha.slice(5, 7)) - 1]} de ${fecha.slice(0, 4)}`;

export default function ConsejoProducto({ producto, documentos, onUsarPrecio }: {
  producto: Product;
  documentos: readonly Invoice[];
  /** Pone el precio sugerido en el formulario (no se guarda hasta «Guardar»). */
  onUsarPrecio: (precio: number) => void;
}) {
  const c = useMemo(() => consejoDeProducto(producto, documentos), [producto, documentos]);
  const maximo = Math.max(...c.meses.map(m => m.unidades), 0);
  const aviso = c.avisoPrecio;
  // El precio que tendría hoy con el mismo margen que cuando se puso.
  const precioConMargen = aviso ? Math.ceil(producto.unitPrice * (aviso.costeAhora / aviso.costeAntes) * 100) / 100 : null;

  if (c.unidades === 0 && !aviso) {
    return (
      <section className="consejo-producto" aria-labelledby="consejo-titulo">
        <h4 id="consejo-titulo" className="consejo-titulo"><TrendingUp size={15} /> Cómo le va</h4>
        <p className="consejo-vacio">No se ha vendido en los últimos doce meses. Cuando salga en facturas, aquí verás el ritmo, quién lo compra y el margen real.</p>
      </section>
    );
  }

  return (
    <section className="consejo-producto" aria-labelledby="consejo-titulo">
      <h4 id="consejo-titulo" className="consejo-titulo"><TrendingUp size={15} /> Cómo le va</h4>

      {aviso && precioConMargen !== null && (
        <div className="consejo-aviso" role="note">
          <AlertTriangle size={16} />
          <div>
            <strong>El precio no cambia desde {mesYAno(aviso.desde)} y comprarlo cuesta un {pct(aviso.subidaCostePct).replace('+', '')} más</strong>
            <span>
              La compra ha pasado de {formatCurrency(aviso.costeAntes)} a {formatCurrency(aviso.costeAhora)}.
              Para mantener el margen de entonces, el precio sería {formatCurrency(precioConMargen)}.
            </span>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onUsarPrecio(precioConMargen)}>
            Usar {formatCurrency(precioConMargen)}
          </button>
        </div>
      )}

      <div className="consejo-rejilla">
        <div className="consejo-grafica">
          <div className="consejo-cifra">
            <span>Vendido en 12 meses</span>
            <strong className="mono">{c.unidades.toLocaleString('es-ES')} {producto.unit}</strong>
            <small>{formatCurrency(c.importe)}</small>
          </div>
          {/* Una sola serie: el título la nombra. Cada barra dice su mes y
              su cifra al pasar por encima, y la tabla oculta la lee entera. */}
          <div className="mini-barras" aria-hidden="true">
            {c.meses.map((m, i) => (
              <div key={m.mes} className="mini-barras-mes" title={`${m.etiqueta} ${m.mes.slice(0, 4)}: ${m.unidades.toLocaleString('es-ES')} ${producto.unit} · ${formatCurrency(m.importe)}`}>
                <span
                  className={`mini-barras-barra${i === c.meses.length - 1 ? ' is-actual' : ''}${m.unidades <= 0 ? ' is-cero' : ''}`}
                  style={{ height: maximo > 0 ? `${Math.max(4, (Math.max(0, m.unidades) / maximo) * 100)}%` : undefined }}
                />
                <small>{m.etiqueta[0]}</small>
              </div>
            ))}
          </div>
          <table className="solo-lectores">
            <caption>Unidades vendidas por mes</caption>
            <tbody>
              {c.meses.map(m => <tr key={m.mes}><th scope="row">{m.etiqueta} {m.mes.slice(0, 4)}</th><td>{m.unidades}</td><td>{formatCurrency(m.importe)}</td></tr>)}
            </tbody>
          </table>
        </div>

        <dl className="consejo-datos">
          <div>
            <dt>Precio medio cobrado</dt>
            <dd className="mono">
              {c.precioMedio !== null ? formatCurrency(c.precioMedio) : '—'}
              {c.diferenciaPct !== null && Math.abs(c.diferenciaPct) >= 0.5 && (
                <small data-tono={c.diferenciaPct < 0 ? 'baja' : 'sube'}> {pct(c.diferenciaPct)} sobre la ficha</small>
              )}
            </dd>
          </div>
          <div>
            <dt>Margen</dt>
            <dd className="mono">
              {c.margenFicha !== null ? `${c.margenFicha.toFixed(1).replace('.', ',')} % con el de la ficha` : 'Sin coste anotado'}
              {c.margenReal !== null && c.margenFicha !== null && Math.abs(c.margenReal - c.margenFicha) >= 0.5 && (
                <small data-tono={c.margenReal < c.margenFicha ? 'baja' : 'sube'}> {c.margenReal.toFixed(1).replace('.', ',')} % el real</small>
              )}
            </dd>
          </div>
          {c.mejoresClientes.length > 0 && (
            <div>
              <dt>Quién lo compra más</dt>
              <dd>
                <ol className="consejo-clientes">
                  {c.mejoresClientes.slice(0, 3).map(cl => (
                    <li key={cl.id || cl.nombre}>
                      {cl.id ? <Link href={`/clientes/${cl.id}`}>{cl.nombre}</Link> : cl.nombre}
                      <span className="mono">{formatCurrency(cl.importe)}</span>
                    </li>
                  ))}
                </ol>
              </dd>
            </div>
          )}
        </dl>
      </div>
    </section>
  );
}
