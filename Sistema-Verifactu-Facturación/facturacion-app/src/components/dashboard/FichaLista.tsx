import Link from 'next/link';
import { ArrowRight, CheckCircle2, ChevronRight, Inbox } from 'lucide-react';

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
 *
 * Las filas van regladas, como un libro: un filete entre una y otra y el
 * valor alineado a la derecha. Antes cada fila era una cajita rellena y la
 * ficha parecía un montón de botones.
 */
export default function FichaLista({ titulo, subtitulo, href, enlace = 'Ver todo', vacio, vacioNeutro = false, filas }: {
  titulo: string;
  subtitulo?: string;
  href?: string;
  enlace?: string;
  vacio: string;
  /** Vacía porque aún no hay datos, no porque esté todo hecho: sin el check. */
  vacioNeutro?: boolean;
  filas: FilaFicha[];
}) {
  const IconoVacio = vacioNeutro ? Inbox : CheckCircle2;
  return (
    <section className="chart-card ficha-lista">
      <div className="chart-header">
        <div className="chart-heading">
          <h3 className="chart-title">{titulo}</h3>
          {subtitulo && <p className="chart-subtitle">{subtitulo}</p>}
        </div>
        {href && filas.length > 0 && (
          <Link href={href} className="chart-enlace">{enlace} <ArrowRight size={13} aria-hidden="true" /></Link>
        )}
      </div>
      {filas.length === 0 ? (
        // Vacía casi siempre es buena noticia («nada vencido», «todo
        // facturado»): lo dice con el check, en una línea, sin recuadro.
        <p className={`ficha-vacia${vacioNeutro ? '' : ' es-bueno'}`}><IconoVacio size={16} strokeWidth={1.75} aria-hidden="true" />{vacio}</p>
      ) : (
        <ul className="lista-reglada">
          {filas.slice(0, MAX).map(f => {
            const cuerpo = (
              <>
                <span className="lista-reglada-texto">
                  <span className="lista-reglada-principal">{f.principal}</span>
                  {f.detalle && <span className="lista-reglada-detalle">{f.detalle}</span>}
                </span>
                {f.valor && <span className={`lista-reglada-valor${f.tono ? ` is-${f.tono}` : ''}`}>{f.valor}</span>}
                {f.href && <ChevronRight size={14} aria-hidden="true" className="lista-reglada-flecha" />}
              </>
            );
            return (
              <li key={f.key}>
                {f.href
                  ? <Link href={f.href} className="lista-reglada-fila es-enlace">{cuerpo}</Link>
                  : <div className="lista-reglada-fila">{cuerpo}</div>}
              </li>
            );
          })}
        </ul>
      )}
      {filas.length > MAX && <p className="ficha-mas">y {filas.length - MAX} más</p>}
    </section>
  );
}
