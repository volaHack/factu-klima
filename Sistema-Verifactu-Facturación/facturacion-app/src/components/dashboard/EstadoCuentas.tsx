import Link from 'next/link';
import { useId } from 'react';
import { AlertTriangle } from 'lucide-react';
import CifraQueCuenta from '@/components/ui/CifraQueCuenta';
import Delta from './Delta';

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
  /**
   * La misma cifra mes a mes (la última, el mes en curso). Sólo la pinta
   * la cifra principal: una línea por celda sería ruido.
   */
  serie?: number[];
}

/**
 * La tendencia de la cifra principal en una línea, sin ejes ni números:
 * dice «va subiendo» o «va bajando» de un vistazo, que es lo que la cifra
 * sola no cuenta. Las cifras exactas están en las gráficas de abajo.
 *
 * El último tramo (el mes en curso) va punteado: a día 5 el mes siempre
 * parece un desplome, y una línea continua lo daría por cerrado.
 */
function Traza({ valores }: { valores: number[] }) {
  // Sin el carácter «:» que trae useId: dentro de url(#…) rompe la referencia.
  const degradado = `traza${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const ANCHO = 200, ALTO = 40, MARGEN = 4;
  const max = Math.max(...valores);
  const min = Math.min(0, ...valores);
  const rango = max - min || 1;
  const puntos = valores.map((v, i) => [
    (i / (valores.length - 1)) * ANCHO,
    MARGEN + (1 - (v - min) / rango) * (ALTO - MARGEN * 2),
  ] as const);
  const tramo = (lista: readonly (readonly [number, number])[]) =>
    lista.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const cerrados = puntos.slice(0, -1);
  const [ux, uy] = puntos[puntos.length - 1];
  return (
    <span className="cuentas-traza-caja">
      <svg className="cuentas-traza" viewBox={`0 0 ${ANCHO} ${ALTO}`} aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id={degradado} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.2" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path className="cuentas-traza-area" d={`${tramo(puntos)} L${ANCHO} ${ALTO} L0 ${ALTO} Z`} fill={`url(#${degradado})`} />
        <path className="cuentas-traza-linea" d={tramo(cerrados)} pathLength={1} />
        <path className="cuentas-traza-curso" d={tramo(puntos.slice(-2))} />
        <circle className="cuentas-traza-punto" cx={ux} cy={uy} r="3" />
      </svg>
      <span className="cuentas-traza-pie">12 meses</span>
    </span>
  );
}

/** Hay algo que dibujar: dos meses o más y alguno con importe. */
const hayTraza = (serie?: number[]): serie is number[] =>
  !!serie && serie.length > 2 && serie.some(v => v !== 0);

/**
 * EL ESTADO DE CUENTAS
 *
 * Las cifras de arriba del panel, como en un libro de cuentas: una sola
 * hoja dividida por filetes, no una fila de tarjetas iguales. La primera
 * que la empresa haya puesto manda (es la que más le importa) y va más
 * grande; las demás la acompañan a su lado. Al llegar, las cifras cuentan
 * hasta su valor (ver CifraQueCuenta). Las cifras van con números de ancho fijo para que
 * se comparen de un vistazo.
 */
export default function EstadoCuentas({ cifras }: { cifras: CifraPanel[] }) {
  if (cifras.length === 0) return null;
  return (
    // El marco es el contenedor que mide el ancho (ver `.cuentas-marco`) y
    // lleva la luz que da la vuelta al borde: es lo primero que se mira.
    <section className="cuentas-marco neon neon--lento" aria-labelledby="cuentas-titulo">
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
              <span className="cuentas-valor"><CifraQueCuenta texto={c.valor} /></span>
              {i === 0 && hayTraza(c.serie) && <Traza valores={c.serie} />}
              {(c.cambio || c.detalle) && (
                <span className="cuentas-pie">
                  {c.cambio && (
                    <span className="cuentas-cambio">
                      <Delta porcentaje={c.cambio.porcentaje} decimales={1} titulo={c.cambio.titulo} />
                      <span className="cuentas-cambio-texto">{c.cambio.texto}</span>
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
