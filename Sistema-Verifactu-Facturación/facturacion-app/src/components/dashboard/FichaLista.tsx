import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export interface FilaFicha {
  key: string;
  principal: string;
  detalle?: string;
  /** Lo de la derecha: un importe, unas unidades… */
  valor?: string;
  /** Tono del valor: aviso en ámbar, peligro en rojo. */
  tono?: 'aviso' | 'peligro';
  href?: string;
}

const MAX = 5;

/**
 * Una ficha de «cosas que esperan algo»: título, las cinco primeras y un
 * enlace a la pantalla donde se atienden. Vacía, lo dice con una frase en
 * vez de desaparecer: una ficha que se va y viene según los datos parece
 * que se ha roto.
 */
export default function FichaLista({ titulo, subtitulo, href, enlace = 'Ver todo', vacio, filas }: {
  titulo: string;
  subtitulo?: string;
  href?: string;
  enlace?: string;
  vacio: string;
  filas: FilaFicha[];
}) {
  return (
    <div className="chart-card">
      <div className="chart-header">
        <div className="chart-heading">
          <h3 className="chart-title">{titulo}</h3>
          {subtitulo && <p className="chart-subtitle">{subtitulo}</p>}
        </div>
        {href && filas.length > 0 && (
          <Link href={href} className="btn btn-ghost btn-sm">{enlace} <ArrowRight size={14} /></Link>
        )}
      </div>
      {filas.length === 0 ? (
        <p className="ficha-vacia">{vacio}</p>
      ) : (
        <div className="stats-list">
          {filas.slice(0, MAX).map(f => {
            const cuerpo = (
              <>
                <div className="stats-item-left">
                  <div>
                    <div className="stats-item-name">{f.principal}</div>
                    {f.detalle && <div className="stats-item-detail">{f.detalle}</div>}
                  </div>
                </div>
                {f.valor && <div className={`ficha-valor mono ${f.tono ? `is-${f.tono}` : ''}`}>{f.valor}</div>}
              </>
            );
            return f.href
              ? <Link key={f.key} href={f.href} className="stats-item">{cuerpo}</Link>
              : <div key={f.key} className="stats-item">{cuerpo}</div>;
          })}
          {filas.length > MAX && <p className="ficha-mas">y {filas.length - MAX} más</p>}
        </div>
      )}
    </div>
  );
}
