/**
 * LAS DOS HOJAS DEL ALMACÉN, EN PAPEL
 *
 *   · La hoja de preparación: una por pedido, con una casilla por línea
 *     para ir tachando lo que ya está en el muelle, y cada línea en cajas
 *     y sueltas, que es como se coge del palé.
 *   · La hoja de carga: lo de varios pedidos (los marcados o, sin marcar
 *     ninguno, los que se ven) sumado por artículo, para subirlo a la
 *     furgoneta de una vez, y la lista de paradas por cliente, con su
 *     dirección, para repartirlo.
 *
 * Están siempre montadas y escondidas en pantalla: al imprimir, almacen.css
 * esconde la cola y deja sólo esto. Los números salen de prepararPedidos.ts.
 */

import { formatDate } from '@/lib/utils';
import {
  hojaDeCarga, paradasDe, totalesDePedido, nombreDe, numeroDeLineas, type PedidoEnCola,
} from '@/lib/prepararPedidos';

const num = (n: number) => (n ? n.toLocaleString('es-ES', { maximumFractionDigits: 3 }) : '');

function Casilla() {
  return <span className="almacen-casilla" aria-hidden />;
}

export function HojaPreparacion({ pedido, empresa }: { pedido: PedidoEnCola; empresa: string }) {
  const t = totalesDePedido(pedido);
  return (
    <section className="almacen-hoja">
      <header className="almacen-hoja-cabeza">
        <div>
          <p className="almacen-hoja-empresa">{empresa}</p>
          <h2>Hoja de preparación</h2>
          <p>{nombreDe(pedido)} · {formatDate(pedido.fecha)}</p>
        </div>
        <dl className="almacen-hoja-datos">
          <div><dt>Cliente</dt><dd>{pedido.cliente}</dd></div>
          {pedido.direccion && <div><dt>Dirección</dt><dd>{pedido.direccion}</dd></div>}
        </dl>
      </header>
      {pedido.notas && <p className="almacen-hoja-nota">{pedido.notas}</p>}
      <table className="almacen-hoja-tabla">
        <thead>
          <tr>
            <th className="casilla"><span className="solo-lectores">Hecho</span></th>
            <th>Artículo</th>
            <th className="num">Cajas</th>
            <th className="num">U/caja</th>
            <th className="num">Sueltas</th>
            <th className="num">Unidades</th>
          </tr>
        </thead>
        <tbody>
          {pedido.lineas.map(l => (
            <tr key={l.id}>
              <td className="casilla"><Casilla /></td>
              <td>
                <strong>{l.nombre}</strong>
                {(l.ref || l.lote) && <span className="almacen-hoja-ref">{[l.ref, l.lote && `Lote ${l.lote}`].filter(Boolean).join(' · ')}</span>}
              </td>
              <td className="num fuerte">{num(l.cajas)}</td>
              <td className="num">{l.udsCaja ?? ''}</td>
              <td className="num fuerte">{num(l.sueltas)}</td>
              <td className="num">{num(l.unidades)} {l.unidad}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td />
            <td>{numeroDeLineas(pedido.lineas.length)}</td>
            <td className="num">{num(t.cajas)}</td>
            <td />
            <td />
            <td className="num">{num(t.unidades)}</td>
          </tr>
        </tfoot>
      </table>
      <div className="almacen-hoja-firmas">
        <div>Preparado por</div>
        <div>Revisado por</div>
      </div>
    </section>
  );
}

export function HojaCarga({ pedidos, titulo, empresa }: { pedidos: PedidoEnCola[]; titulo: string; empresa: string }) {
  const hoja = hojaDeCarga(pedidos);
  return (
    <section className="almacen-hoja">
      <header className="almacen-hoja-cabeza">
        <div>
          <p className="almacen-hoja-empresa">{empresa}</p>
          <h2>Hoja de carga</h2>
          <p>{titulo} · {formatDate(new Date().toISOString().slice(0, 10))}</p>
        </div>
        <dl className="almacen-hoja-datos">
          <div><dt>Pedidos</dt><dd>{hoja.pedidos}</dd></div>
          <div><dt>Paradas</dt><dd>{hoja.paradas}</dd></div>
          <div><dt>Cajas</dt><dd>{num(hoja.cajas) || '0'}</dd></div>
        </dl>
      </header>
      <table className="almacen-hoja-tabla">
        <thead>
          <tr>
            <th className="casilla"><span className="solo-lectores">Cargado</span></th>
            <th>Artículo</th>
            <th className="num">Cajas</th>
            <th className="num">U/caja</th>
            <th className="num">Sueltas</th>
            <th className="num">Unidades</th>
            <th className="num">Pedidos</th>
          </tr>
        </thead>
        <tbody>
          {hoja.filas.map(f => (
            <tr key={f.clave}>
              <td className="casilla"><Casilla /></td>
              <td><strong>{f.nombre}</strong>{f.ref && <span className="almacen-hoja-ref">{f.ref}</span>}</td>
              <td className="num fuerte">{num(f.cajas)}</td>
              <td className="num">{f.udsCaja ?? ''}</td>
              <td className="num fuerte">{num(f.sueltas)}</td>
              <td className="num">{num(f.unidades)} {f.unidad}</td>
              <td className="num">{f.pedidos}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td />
            <td>{hoja.filas.length === 1 ? '1 artículo' : `${hoja.filas.length} artículos`}</td>
            <td className="num">{num(hoja.cajas)}</td>
            <td />
            <td />
            <td className="num">{num(hoja.unidades)}</td>
            <td />
          </tr>
        </tfoot>
      </table>

      <h3 className="almacen-hoja-sub">Paradas</h3>
      <table className="almacen-hoja-tabla">
        <thead>
          <tr>
            <th className="casilla"><span className="solo-lectores">Entregado</span></th>
            <th>Cliente</th>
            <th>Dirección</th>
            <th>Documentos</th>
          </tr>
        </thead>
        <tbody>
          {paradasDe(pedidos).map(p => (
            <tr key={p.clave}>
              <td className="casilla"><Casilla /></td>
              <td><strong>{p.cliente}</strong></td>
              <td>{p.direccion}</td>
              <td className="mono">{p.numeros.join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
