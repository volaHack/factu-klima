'use client';

import { useEffect, useState } from 'react';
import { Link2, Link2Off, PenLine, RotateCcw, ShieldCheck } from 'lucide-react';

/* ------------------------------------------------------------------ *
 * La cadena, de verdad.
 *
 * La versión anterior de la home tenía un deslizador que movía un
 * importe y enseñaba un "SHA-256:" que en realidad era un FNV-1a de 32
 * bits pintado en hexadecimal — ocho caracteres donde SHA-256 da 64.
 * Enseñar una huella falsa en la página que vende integridad es el peor
 * sitio posible para hacer trampas.
 *
 * Aquí las huellas las calcula el navegador con `crypto.subtle.digest`,
 * SHA-256 real, encadenando cada registro con la huella del anterior —
 * el mismo esquema que exige el reglamento. La demostración consiste en
 * alterar un importe ya registrado y ver que a partir de ahí nada cuadra.
 * ------------------------------------------------------------------ */

interface Registro {
  num: string;
  fecha: string;
  cliente: string;
  base: number;
}

const LIBRO: Registro[] = [
  { num: 'FAC-2026-0038', fecha: '2026-02-03', cliente: 'Panadería Sanchís',     base: 340 },
  { num: 'FAC-2026-0039', fecha: '2026-02-04', cliente: 'Talleres Verdú',        base: 1120 },
  { num: 'FAC-2026-0040', fecha: '2026-02-06', cliente: 'Distribuciones García', base: 1250 },
  { num: 'FAC-2026-0041', fecha: '2026-02-09', cliente: 'Café Central',          base: 96.5 },
  { num: 'FAC-2026-0042', fecha: '2026-02-11', cliente: 'Frutas del Turia',      base: 780 },
];

/** El registro que se altera en la demostración, y su importe falseado. */
const INDICE_ALTERADO = 2;
const BASE_FALSEADA = 250;

/** Semilla de la cadena: el primer registro no tiene anterior. */
const HUELLA_CERO = '0'.repeat(64);

const IVA = 0.21;
const total = (base: number) => Math.round(base * (1 + IVA) * 100) / 100;

const euros = (n: number) =>
  n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Lo que se firma. Se enseña literalmente debajo de la cadena. */
const preimagen = (r: Registro, base: number, anterior: string) =>
  `${r.num}|${r.fecha}|${total(base).toFixed(2)}|${anterior}`;

async function sha256Hex(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** La cadena tal y como quedó registrada en su día. */
async function encadenar(): Promise<string[]> {
  const huellas: string[] = [];
  let anterior = HUELLA_CERO;
  for (const r of LIBRO) {
    anterior = await sha256Hex(preimagen(r, r.base, anterior));
    huellas.push(anterior);
  }
  return huellas;
}

const corta = (h: string) => `${h.slice(0, 6)}…${h.slice(-6)}`;

type Estado = 'ok' | 'alterado' | 'roto' | 'colgado';

export default function ChainDemo() {
  const [registradas, setRegistradas] = useState<string[] | null>(null);
  const [huellaAlterada, setHuellaAlterada] = useState<string | null>(null);
  const [alterado, setAlterado] = useState(false);

  // Todo se calcula una vez al montar: la cadena registrada y la huella
  // que daría el registro manipulado. Así el botón sólo conmuta entre
  // dos resultados ya calculados, sin un `await` en mitad del clic.
  useEffect(() => {
    let cancelado = false;
    if (typeof crypto === 'undefined' || !crypto.subtle) return;

    (async () => {
      const cadena = await encadenar();
      // Ojo con el matiz: el registro manipulado NO recalcula su
      // «anterior». Su enlace hacia atrás es el que quedó grabado; lo
      // único que cambia es su propio contenido, y por tanto su huella.
      const falsa = await sha256Hex(
        preimagen(LIBRO[INDICE_ALTERADO], BASE_FALSEADA, cadena[INDICE_ALTERADO - 1]),
      );
      if (cancelado) return;
      setRegistradas(cadena);
      setHuellaAlterada(falsa);
    })().catch(() => { /* sin subtle crypto la sección se queda en reposo */ });

    return () => { cancelado = true; };
  }, []);

  const listo = registradas !== null && huellaAlterada !== null;

  return (
    <div className="chain">
      <ol className="chain-track">
        {LIBRO.map((r, i) => {
          const base = alterado && i === INDICE_ALTERADO ? BASE_FALSEADA : r.base;

          const estado: Estado = !alterado ? 'ok'
            : i < INDICE_ALTERADO ? 'ok'
            : i === INDICE_ALTERADO ? 'alterado'
            : i === INDICE_ALTERADO + 1 ? 'roto'
            : 'colgado';

          // El «anterior» es siempre el que quedó grabado: nadie
          // reescribe los registros posteriores al manipular uno.
          const anterior = registradas && i > 0 ? registradas[i - 1] : null;
          // La huella sólo cambia en el registro manipulado.
          const huella = !registradas ? null
            : alterado && i === INDICE_ALTERADO ? huellaAlterada
            : registradas[i];

          return (
            <li key={r.num} className="chain-node" data-estado={estado}>
              <div className="chain-node-head">
                <span className="chain-node-num">{r.num}</span>
                <span className="chain-node-flag">
                  {estado === 'ok' ? <><ShieldCheck size={12} /> sellada</>
                    : estado === 'alterado' ? <><PenLine size={12} /> alterada</>
                    : estado === 'roto' ? <><Link2Off size={12} /> enlace roto</>
                    : <><Link2Off size={12} /> sin verificar</>}
                </span>
              </div>

              <p className="chain-node-cliente">{r.cliente}</p>
              <p className="chain-node-total">
                {euros(total(base))} <span>€</span>
              </p>

              <dl className="chain-node-hashes">
                <div>
                  <dt>anterior</dt>
                  <dd className={estado === 'roto' ? 'is-mismatch' : undefined}>
                    {i === 0 ? '—' : anterior ? corta(anterior) : '·'}
                  </dd>
                </div>
                <div>
                  <dt>huella</dt>
                  <dd className={estado === 'alterado' ? 'is-mismatch' : undefined}>
                    {huella ? corta(huella) : '·'}
                  </dd>
                </div>
              </dl>

              {estado === 'alterado' && registradas && (
                <p className="chain-node-diff">
                  se registró como <code>{corta(registradas[INDICE_ALTERADO])}</code>
                </p>
              )}
              {estado === 'roto' && huellaAlterada && (
                <p className="chain-node-diff">
                  pero la 0040 ahora da <code>{corta(huellaAlterada)}</code>
                </p>
              )}
            </li>
          );
        })}
      </ol>

      <div className="chain-controls">
        <button
          type="button"
          className={`chain-btn ${alterado ? 'chain-btn--undo' : ''}`}
          onClick={() => setAlterado((v) => !v)}
          disabled={!listo}
        >
          {alterado ? <><RotateCcw size={15} /> Restaurar el importe original</>
                    : <><PenLine size={15} /> Bajar la 0040 de {euros(total(LIBRO[INDICE_ALTERADO].base))} € a {euros(total(BASE_FALSEADA))} €</>}
        </button>

        <p className="chain-verdict" data-estado={alterado ? 'roto' : 'ok'} aria-live="polite">
          {alterado ? (
            <><Link2Off size={14} /> Se ha tocado un importe y nada más. Pero la 0040 ya no
            devuelve la huella con la que se registró, y la 0041 apunta a esa huella que ya no
            existe: el enlace está roto y, a partir de ahí, la cadena no se puede verificar.</>
          ) : (
            <><Link2 size={14} /> Cada huella incluye la huella de la factura anterior. La cadena
            entera cuadra de principio a fin.</>
          )}
        </p>
      </div>

      <p className="chain-formula">
        <code>huella = SHA-256( nº · fecha · total · huella anterior )</code>
        <span>
          {listo
            ? 'Las 64 cifras hexadecimales de ahí arriba las está calculando tu propio navegador ahora mismo, con SHA-256 real. Ábrele las herramientas de desarrollo si quieres comprobarlo.'
            : 'El cálculo necesita una conexión segura (HTTPS) para usar SHA-256 en el navegador.'}
        </span>
      </p>
    </div>
  );
}
