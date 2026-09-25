'use client';

/**
 * El botón de soporte: un círculo pequeño abajo a la derecha que abre un
 * chat con la administración. Sólo dentro del programa (con sesión), y no
 * en Administración, que tiene la bandeja.
 *
 * Se apaga solo para no estorbar: no tapa contenido (va en una esquina que
 * no usa nadie), no salta con animaciones, y sólo llama la atención con un
 * punto cuando hay una respuesta sin leer.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { MessageCircle, X, Send, Loader2 } from 'lucide-react';
import {
  ABRIR_SOPORTE, enviarASoporte, marcarLeida, mensajesDe, miConversacion, type MensajeSoporte,
} from '@/lib/soporte';

const CADA_ABIERTO_MS = 8_000;
const CADA_CERRADO_MS = 90_000;

const hora = (iso: string) => {
  const d = new Date(iso);
  const hoy = new Date().toDateString() === d.toDateString();
  return hoy
    ? d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
};

export default function Soporte() {
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);
  const [convId, setConvId] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<MensajeSoporte[]>([]);
  const [noLeidos, setNoLeidos] = useState(0);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState('');
  const lista = useRef<HTMLDivElement>(null);
  const entrada = useRef<HTMLTextAreaElement>(null);

  const refrescar = useCallback(async (leyendo: boolean) => {
    try {
      const c = await miConversacion();
      if (!c) return;
      setConvId(c.id);
      if (leyendo) {
        setMensajes(await mensajesDe(c.id));
        if (c.noLeidos) await marcarLeida(c.id);
        setNoLeidos(0);
      } else {
        setNoLeidos(c.noLeidos);
      }
    } catch { /* sin conexión: se reintenta en la siguiente vuelta */ }
  }, []);

  // Cerrado: sólo mira si hay respuesta nueva, de tarde en tarde. Abierto: la conversación.
  useEffect(() => {
    let vivo = true;
    const vuelta = () => { if (vivo && document.visibilityState === 'visible') void refrescar(abierto); };
    const primera = setTimeout(vuelta, abierto ? 0 : 4_000);
    const t = setInterval(vuelta, abierto ? CADA_ABIERTO_MS : CADA_CERRADO_MS);
    return () => { vivo = false; clearTimeout(primera); clearInterval(t); };
  }, [abierto, refrescar]);

  // Desde cualquier sitio (la pantalla de error, la ayuda…) se puede abrir.
  useEffect(() => {
    const abrir = () => setAbierto(true);
    window.addEventListener(ABRIR_SOPORTE, abrir);
    return () => window.removeEventListener(ABRIR_SOPORTE, abrir);
  }, []);

  useEffect(() => {
    if (abierto) {
      lista.current?.scrollTo({ top: lista.current.scrollHeight });
      entrada.current?.focus();
    }
  }, [abierto, mensajes.length]);

  if (pathname.startsWith('/admin')) return null;

  const enviar = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true);
    setFallo('');
    // Sale en el chat al instante; si no llega, vuelve a la caja de texto.
    const provisional: MensajeSoporte = { id: `tmp-${Date.now()}`, deAdmin: false, texto: t, creadoEn: new Date().toISOString() };
    setMensajes(m => [...m, provisional]);
    setTexto('');
    try {
      const r = await enviarASoporte(t);
      setConvId(r.conversacionId);
      setMensajes(await mensajesDe(r.conversacionId));
    } catch (err) {
      setMensajes(m => m.filter(x => x.id !== provisional.id));
      setTexto(t);
      setFallo(err instanceof Error ? err.message : 'No se ha podido enviar.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <>
      {abierto && (
        <section className="soporte-panel" role="dialog" aria-label="Chat con soporte">
          <header className="soporte-cabeza">
            <div>
              <strong>Soporte</strong>
              <span>Te contesta una persona, normalmente el mismo día laborable.</span>
            </div>
            <button type="button" className="soporte-cerrar" onClick={() => setAbierto(false)} aria-label="Cerrar el chat"><X size={18} /></button>
          </header>

          <div className="soporte-mensajes" ref={lista}>
            {mensajes.length === 0 && (
              <p className="soporte-vacio">
                Cuéntanos qué necesitas: una duda, algo que no funciona o una idea. Si es un fallo, dinos qué estabas haciendo;
                ya sabemos en qué pantalla estás.
              </p>
            )}
            {mensajes.map(m => (
              <div key={m.id} className={`soporte-msg ${m.deAdmin ? 'is-admin' : 'is-mio'}`}>
                <p>{m.texto}</p>
                <time dateTime={m.creadoEn}>{m.deAdmin ? 'Soporte · ' : ''}{hora(m.creadoEn)}</time>
              </div>
            ))}
          </div>

          <form className="soporte-escribir" onSubmit={enviar}>
            <textarea
              ref={entrada}
              rows={2}
              maxLength={4000}
              placeholder={convId ? 'Escribe tu mensaje…' : 'Escribe tu consulta…'}
              value={texto}
              onChange={e => setTexto(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void enviar(); } }}
              aria-label="Mensaje para soporte"
            />
            <button type="submit" className="soporte-enviar" disabled={!texto.trim() || enviando} aria-label="Enviar">
              {enviando ? <Loader2 size={17} className="spin" /> : <Send size={17} />}
            </button>
          </form>
          {fallo && <p className="soporte-fallo" role="alert">{fallo}</p>}
        </section>
      )}

      <button
        type="button"
        className={`soporte-boton ${abierto ? 'is-abierto' : ''}`}
        onClick={() => setAbierto(a => !a)}
        aria-label={abierto ? 'Cerrar el chat de soporte' : noLeidos ? `Soporte: ${noLeidos} ${noLeidos === 1 ? 'respuesta nueva' : 'respuestas nuevas'}` : 'Escribir a soporte'}
        aria-expanded={abierto}
        title="Soporte"
      >
        {abierto ? <X size={20} /> : <MessageCircle size={20} />}
        {!abierto && noLeidos > 0 && <span className="soporte-punto" aria-hidden="true">{noLeidos > 9 ? '9+' : noLeidos}</span>}
      </button>
    </>
  );
}
