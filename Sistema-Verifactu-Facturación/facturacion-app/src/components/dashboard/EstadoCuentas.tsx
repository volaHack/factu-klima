import Link from 'next/link';
import { AlertTriangle, TrendingDown, TrendingUp } from 'lucide-react';

export interface CifraPanel {
  id: string;
  etiqueta: string;
  valor: string;
  /** Lo que explica la cifra: cuántas facturas, de qué parte sale… */
  detalle?: string;
  /** Peligro tiñe la cifra y le pone un aviso: no se fía todo al color. */
  tono?: 'peligro';
  href?: string;
  /** Comparación con el mismo punto del mes pasado. */
  cambio?: { porcentaje: number; texto: string; titulo: string };
}

/**
 * EL ESTADO DE CUENTAS
 *
 * Las cifras de arriba del panel, como en un libro de cuentas: una sola
 * hoja dividida por filetes, no una fila de tarjetas iguales. La primera
 * que la empresa haya puesto manda (es la que más le importa) y va más
 * grande, con la doble raya con la que se cierra un total; las demás la
 * acompañan a su lado. Las cifras van con números de ancho fijo para que
 * se comparen de un vistazo.
 */
export default function EstadoCuentas({ cifras }: { cifras: CifraPanel[] }) {
  if (cifras.length === 0) return null;
  return (
    // El marco es el contenedor que mide el ancho (ver `.cuentas-marco`).
    <section className="cuentas-marco" aria-labelledby="cuentas-titulo">
      <h2 id="cuentas-titulo" className="solo-lectores">Cómo va el negocio</h2>
      <div className="cuentas">
        {cifras.map((c, i) => {
          const clase = `cuentas-cifra${i === 0 ? ' es-principal' : ''}${c.tono ? ` is-${c.tono}` : ''}${c.href ? ' es-enlace' : ''}`;
          const cuerpo = (
            <>
              <span className="cuentas-etiqueta">
                {c.tono === 'peligro' && <AlertTriangle size={13} aria-hidden="true" />}
                {c.etiqueta}
              </span>
              <span className="cuentas-valor">{c.valor}</span>
              {(c.cambio || c.detalle) && (
                <span className="cuentas-pie">
                  {c.cambio && (
                    <span className={`cuentas-cambio ${c.cambio.porcentaje >= 0 ? 'sube' : 'baja'}`} title={c.cambio.titulo}>
                      {c.cambio.porcentaje >= 0 ? <TrendingUp size={13} aria-hidden="true" /> : <TrendingDown size={13} aria-hidden="true" />}
                      {c.cambio.porcentaje >= 0 ? '+' : '−'}{Math.abs(c.cambio.porcentaje).toFixed(1).replace('.', ',')} %
                      <span className="cuentas-cambio-texto"> {c.cambio.texto}</span>
                    </span>
                  )}
                  {c.detalle && <span className="cuentas-detalle">{c.detalle}</span>}
                </span>
              )}
            </>
          );
          return c.href
            ? <Link key={c.id} href={c.href} className={clase}>{cuerpo}</Link>
            : <div key={c.id} className={clase}>{cuerpo}</div>;
        })}
      </div>
    </section>
  );
}
