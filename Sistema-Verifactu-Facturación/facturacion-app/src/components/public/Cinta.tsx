import { CINTA, corta, euros, total } from '@/lib/cintaHero';

/* ------------------------------------------------------------------ *
 * La cinta.
 *
 * El rollo de papel del héroe, colgando del cabezal. Cinco registros de
 * un día de mostrador, encadenados de verdad (ver `cintaHero`).
 *
 * No hay JavaScript aquí y es deliberado. El papel se paga hacia abajo,
 * la huella se imprime carácter a carácter y el lacre cae al final, todo
 * atado al scroll con `animation-timeline` en la hoja de estilos. Ni un
 * `useState`, ni un `addEventListener('scroll')`, ni un render por
 * fotograma: el compositor lo mueve solo, fuera del hilo principal.
 *
 * Sin soporte de animaciones ligadas al scroll —o con
 * `prefers-reduced-motion`— la CSS deja la cinta quieta, impresa y
 * sellada. Se pierde el gesto, no la información.
 *
 * Para un lector de pantalla esto son cinco tickets de mentira llenos de
 * hexadecimal, así que va oculto y en su lugar queda la frase de
 * `.oculto-visualmente` que el héroe pone al lado.
 * ------------------------------------------------------------------ */

/* Sello de lacre. Marca decorativa, no un icono: el texto va curvado
   sobre una circunferencia con <textPath>, que es algo que ninguna
   librería de iconos trae hecho. Cae sobre el papel al final del
   recorrido, cuando la cadena ya está entera. */
function Sello() {
  return (
    <svg className="home-seal" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <defs>
        <path id="seal-arc" d="M60,60 m-44,0 a44,44 0 1,1 88,0 a44,44 0 1,1 -88,0" fill="none" />
      </defs>
      <circle cx="60" cy="60" r="58" className="home-seal-disc" />
      <circle cx="60" cy="60" r="47" className="home-seal-ring" />
      <text className="home-seal-text">
        <textPath href="#seal-arc" startOffset="0%">
          REGISTRO SELLADO · SHA-256 · CADENA ÍNTEGRA ·
        </textPath>
      </text>
      <g className="home-seal-core">
        <path d="M60 40 L76 46 v12 c0 10-7 18-16 22-9-4-16-12-16-22V46z" />
        <path d="M53 59 l5 5 10-11" className="home-seal-check" />
      </g>
    </svg>
  );
}

export default function Cinta() {
  return (
    <div className="cinta" aria-hidden="true">
      <Sello />
      <div className="cinta-ventana">
        <ol className="cinta-tira">
          {CINTA.map((r) => (
            <li key={r.num} className="cinta-reg">
              <span className="cinta-nodo" />

              <div className="cinta-reg-cabecera">
                <span className="cinta-reg-num">{r.num}</span>
                <span className="cinta-reg-hora">{r.hora}</span>
              </div>

              <p className="cinta-reg-cliente">{r.cliente}</p>
              <p className="cinta-reg-total">
                {euros(total(r.base))} <span>€</span>
              </p>

              <dl className="cinta-reg-huellas">
                <div>
                  <dt>ant</dt>
                  <dd>{corta(r.anterior)}</dd>
                </div>
                <div>
                  <dt>huella</dt>
                  <dd>
                    <span className="cinta-tinta">{corta(r.huella)}</span>
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
