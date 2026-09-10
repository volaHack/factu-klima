'use client';

/**
 * LA AYUDA, DENTRO DE LA PANTALLA EN LA QUE ESTÁS
 *
 * Un programa con cuarenta y siete pantallas no se explica con un manual: la
 * duda aparece delante del ordenador, con el cliente esperando, y nadie va a
 * abrir un PDF en ese momento. Así que el manual está aquí, partido en trozos
 * y pegado a la pantalla que lo necesita.
 *
 * Tres cosas y en este orden, que es el orden en que se pregunta:
 *
 *   1. ¿Para qué sirve esto? — una frase.
 *   2. ¿Cómo se usa? — los pasos, con el nombre de los botones.
 *   3. ¿Qué debería saber? — las trampas, antes de meter la pata.
 *
 * Y debajo, para lo que no esté escrito, la misma ayuda con IA del mostrador,
 * que aquí responde SABIENDO en qué pantalla estás: se le manda el texto de
 * arriba como base, así que contesta con lo que este programa hace de verdad
 * y no con lo que un modelo se imagine que hace un programa de facturación.
 *
 * DÓNDE VIVE
 * ----------
 * En la cabecera, que es el único sitio que aparece en las cuarenta y siete
 * pantallas. Se monta una vez y funciona en todas, en vez de tener que tocar
 * cuarenta y siete ficheros y acordarse del cuarenta y ocho.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CircleHelp, X, Sparkles, Loader2, CornerDownLeft, ArrowRight } from 'lucide-react';
import { ayudaDe } from '@/lib/ayuda/paginas';

export default function AyudaContextual() {
  const pathname = usePathname() ?? '/';
  const ayuda = ayudaDe(pathname);

  // Sin ayuda escrita para esta pantalla no se enseña el botón. Es mejor que
  // no haya ayuda a que la haya y no diga nada.
  if (!ayuda) return null;

  // La `key` es la ruta: al navegar, React tira este componente y monta otro
  // con el panel cerrado. Es lo que evita tener que apagarlo a mano desde un
  // efecto —escribir estado en el cuerpo de un efecto encadena renders— y
  // además garantiza que nunca se quede abierta la ayuda de la anterior.
  return <BotonAyuda key={pathname} ayuda={ayuda} />;
}

function BotonAyuda({ ayuda }: { ayuda: NonNullable<ReturnType<typeof ayudaDe>> }) {
  const [abierta, setAbierta] = useState(false);

  useEffect(() => {
    if (!abierta) return;
    const alPulsar = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierta(false); };
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [abierta]);

  return (
    <>
      <button
        type="button"
        className="header-ayuda-btn"
        onClick={() => setAbierta(true)}
        aria-label={`Ayuda de ${ayuda.titulo}`}
        title="¿Cómo se usa esta pantalla?"
      >
        <CircleHelp size={20} />
      </button>

      {abierta && <PanelAyuda ayuda={ayuda} onCerrar={() => setAbierta(false)} />}
    </>
  );
}

function PanelAyuda({ ayuda, onCerrar }: { ayuda: NonNullable<ReturnType<typeof ayudaDe>>; onCerrar: () => void }) {
  const [pregunta, setPregunta] = useState('');
  const [respuesta, setRespuesta] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const campoRef = useRef<HTMLTextAreaElement>(null);

  const preguntar = async () => {
    const limpia = pregunta.trim();
    if (!limpia || cargando) return;
    setCargando(true);
    setError('');
    setRespuesta('');
    try {
      const res = await fetch('/api/ayuda', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modo: 'pagina',
          pregunta: limpia,
          // Se le manda la ayuda escrita como base: así responde con lo que
          // esta pantalla hace de verdad, no con lo que un modelo suponga.
          pagina: {
            titulo: ayuda.titulo,
            paraQue: ayuda.paraQue,
            pasos: ayuda.pasos,
            saber: ayuda.saber ?? [],
          },
        }),
      });
      const datos = await res.json();
      if (!res.ok) throw new Error(datos?.error || 'No se ha podido responder.');
      setRespuesta(String(datos.texto ?? ''));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido responder.');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onCerrar}>
      <aside
        className="ayuda-panel"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-label={`Ayuda de ${ayuda.titulo}`}
      >
        <div className="ayuda-panel-cabecera">
          <div>
            <span className="ayuda-panel-etiqueta">Cómo se usa</span>
            <h2 className="ayuda-panel-titulo">{ayuda.titulo}</h2>
          </div>
          <button className="modal-close" onClick={onCerrar} aria-label="Cerrar"><X size={18} /></button>
        </div>

        <div className="ayuda-panel-cuerpo">
          <p className="ayuda-para-que">{ayuda.paraQue}</p>

          <h3 className="ayuda-seccion">Paso a paso</h3>
          <ol className="ayuda-pasos">
            {ayuda.pasos.map((p, i) => <li key={i}>{p}</li>)}
          </ol>

          {ayuda.saber && ayuda.saber.length > 0 && (
            <>
              <h3 className="ayuda-seccion">Lo que conviene saber</h3>
              <ul className="ayuda-saber">
                {ayuda.saber.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </>
          )}

          {ayuda.relacionadas && ayuda.relacionadas.length > 0 && (
            <>
              <h3 className="ayuda-seccion">Sigue por aquí</h3>
              <div className="ayuda-enlaces">
                {ayuda.relacionadas.map(r => (
                  <Link key={r.ruta} href={r.ruta} className="ayuda-enlace" onClick={onCerrar}>
                    {r.texto} <ArrowRight size={13} />
                  </Link>
                ))}
              </div>
            </>
          )}

          {/* --- Lo que no esté escrito, se pregunta --- */}
          <div className="ayuda-ia">
            <div className="ayuda-ia-titulo"><Sparkles size={14} /> ¿Otra duda de esta pantalla?</div>

            {respuesta && <div className="ayuda-ia-respuesta">{respuesta}</div>}
            {error && <div className="login-alert login-alert--error" role="alert">{error}</div>}

            <div className="ayuda-ia-campo">
              <textarea
                ref={campoRef}
                className="form-textarea"
                rows={2}
                placeholder="Escribe tu pregunta…"
                value={pregunta}
                onChange={e => setPregunta(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void preguntar(); }
                }}
              />
              <button className="btn btn-primary btn-sm" onClick={() => void preguntar()} disabled={cargando || !pregunta.trim()}>
                {cargando ? <Loader2 size={15} className="spin" /> : <CornerDownLeft size={15} />}
              </button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
