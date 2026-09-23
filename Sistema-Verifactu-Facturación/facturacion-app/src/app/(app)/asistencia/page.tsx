'use client';

/**
 * ASISTENCIA CON IA
 *
 * Un sitio donde preguntar —escribiendo o hablando— y que la respuesta
 * venga con los números de esta empresa delante, no con los del manual.
 *
 * La diferencia está en el retrato: antes de mandar la pregunta se cuenta
 * lo que hay (facturas vencidas, borradores sin emitir, lo que falta por
 * configurar) y viaja con ella. Así «¿por qué no me cuadra el cobro?» se
 * contesta con «tienes 3 vencidas por 1.240 €, la más vieja lleva 47
 * días» en vez de con la teoría.
 *
 * EL AUDIO NO SALE DE AQUÍ
 * Se usa el dictado del propio navegador: lo que viaja es el texto ya
 * transcrito. Ver `lib/asistencia/dictado.ts`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Mic, MicOff, Send, Sparkles, Trash2, User } from 'lucide-react';

import PageSkeleton from '@/components/ui/PageSkeleton';
import { useToast } from '@/hooks/useToast';
import { getClients, getCompanySettings, getInvoices } from '@/lib/storage';
import { getPlantillas } from '@/lib/plantillas/almacen';
import { retratoDelPanel, retratoEnPalabras, type RetratoDelPanel } from '@/lib/asistencia/contexto';
import { dictadoDisponible, empezarDictado, type Dictado } from '@/lib/asistencia/dictado';

interface Mensaje {
  id: string;
  deQuien: 'persona' | 'asistente';
  texto: string;
}

/** Lo que casi todo el mundo pregunta el primer día. */
const SUGERENCIAS = [
  '¿Qué me falta por configurar?',
  '¿Tengo facturas sin cobrar?',
  '¿Cómo corrijo una factura que ya he emitido?',
  '¿Cómo pongo mi logotipo en las facturas?',
];

export default function AsistenciaPage() {
  const { error: avisarError } = useToast();
  const [montado, setMontado] = useState(false);
  const [retrato, setRetrato] = useState<RetratoDelPanel | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState('');
  const [pensando, setPensando] = useState(false);
  const [escuchando, setEscuchando] = useState(false);
  const [hayMicrofono, setHayMicrofono] = useState(false);

  const dictado = useRef<Dictado | null>(null);
  const finDeLaLista = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const [facturas, clientes, ajustes, plantillas] = await Promise.all([
        getInvoices(), getClients(), getCompanySettings(), getPlantillas(),
      ]);
      setRetrato(retratoDelPanel({
        facturas, clientes, ajustes,
        tienePlantillaPropia: plantillas.length > 0,
      }));
      setHayMicrofono(dictadoDisponible());
      setMontado(true);
    })();
  }, []);

  // La conversación crece hacia abajo: sin esto hay que bajar a mano para
  // leer lo que acaba de contestar.
  useEffect(() => {
    finDeLaLista.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [mensajes, pensando]);

  // Si se sale de la pantalla con el micrófono abierto, se cierra: dejarlo
  // escuchando de fondo no lo espera nadie.
  useEffect(() => () => dictado.current?.parar(), []);

  const preguntar = useCallback(async (pregunta: string) => {
    const limpia = pregunta.trim();
    if (!limpia || pensando || !retrato) return;

    dictado.current?.parar();
    const mia: Mensaje = { id: crypto.randomUUID(), deQuien: 'persona', texto: limpia };
    const conversacion = [...mensajes, mia];
    setMensajes(conversacion);
    setTexto('');
    setPensando(true);

    try {
      const respuesta = await fetch('/api/ayuda', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modo: 'asistencia',
          pregunta: limpia,
          situacion: retratoEnPalabras(retrato),
          historial: mensajes.map(m => ({ deQuien: m.deQuien, texto: m.texto })),
        }),
      });
      const cuerpo = await respuesta.json().catch(() => ({}));

      if (!respuesta.ok) {
        // El error se cuenta en la conversación, no en un aviso que se va
        // solo: así queda claro a qué pregunta no se pudo contestar.
        setMensajes([...conversacion, {
          id: crypto.randomUUID(),
          deQuien: 'asistente',
          texto: cuerpo?.error ?? 'No se ha podido responder ahora mismo.',
        }]);
        return;
      }

      setMensajes([...conversacion, {
        id: crypto.randomUUID(), deQuien: 'asistente', texto: String(cuerpo.texto ?? ''),
      }]);
    } catch {
      setMensajes([...conversacion, {
        id: crypto.randomUUID(),
        deQuien: 'asistente',
        texto: 'No se ha podido contactar con la asistencia. El resto del programa sigue funcionando igual.',
      }]);
    } finally {
      setPensando(false);
    }
  }, [mensajes, pensando, retrato]);

  const alternarMicrofono = () => {
    if (escuchando) {
      dictado.current?.parar();
      return;
    }
    const sesion = empezarDictado({
      alOir: (oido) => setTexto(oido),
      alFallar: (mensaje) => { avisarError('Micrófono', mensaje); setEscuchando(false); },
      alTerminar: () => setEscuchando(false),
    });
    if (!sesion) {
      avisarError('Este navegador no dicta', 'Prueba con Chrome o Edge, o escribe la pregunta.');
      return;
    }
    dictado.current = sesion;
    setEscuchando(true);
  };

  if (!montado) return <PageSkeleton variant="report" label="Preparando la asistencia" />;

  const vacio = mensajes.length === 0;

  return (
    <div className="animate-fade-in asistencia-pagina">
      <div className="page-header">
        <div className="page-header-left">
          <p className="page-eyebrow"><Sparkles /> Asistencia</p>
          <h1 className="page-title">Pregunta lo que necesites</h1>
          <p className="page-subtitle">
            Escribe o dicta tu duda. La respuesta viene con tus números delante:
            sabe cuántas facturas tienes sin cobrar y qué te queda por configurar.
          </p>
        </div>
        {!vacio && (
          <div className="page-header-actions">
            <button className="btn btn-secondary" onClick={() => setMensajes([])}>
              <Trash2 size={16} /> Empezar de nuevo
            </button>
          </div>
        )}
      </div>

      <div className="card asistencia-conversacion">
        {vacio ? (
          <div className="asistencia-vacio">
            <Sparkles size={26} />
            <strong>¿En qué te echo una mano?</strong>
            <p className="card-subtitle">
              Pregunta con tus palabras. Si algo no lo hace el programa, te lo digo.
            </p>
            <div className="asistencia-sugerencias">
              {SUGERENCIAS.map(s => (
                <button key={s} type="button" className="btn btn-secondary btn-sm" onClick={() => preguntar(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ul className="asistencia-mensajes">
            {mensajes.map(m => (
              <li key={m.id} className={`asistencia-mensaje asistencia-mensaje--${m.deQuien}`}>
                <span className="asistencia-mensaje-quien" aria-hidden="true">
                  {m.deQuien === 'persona' ? <User size={14} /> : <Sparkles size={14} />}
                </span>
                <div className="asistencia-mensaje-texto">
                  {m.texto.split('\n').filter(Boolean).map((linea, i) => <p key={i}>{linea}</p>)}
                </div>
              </li>
            ))}
            {pensando && (
              <li className="asistencia-mensaje asistencia-mensaje--asistente">
                <span className="asistencia-mensaje-quien" aria-hidden="true"><Sparkles size={14} /></span>
                <div className="asistencia-mensaje-texto asistencia-pensando">
                  <Loader2 size={15} className="spin" /> Mirando tus datos…
                </div>
              </li>
            )}
          </ul>
        )}
        <div ref={finDeLaLista} />
      </div>

      <form
        className="card asistencia-entrada"
        onSubmit={(e) => { e.preventDefault(); preguntar(texto); }}
      >
        <textarea
          className="form-textarea"
          rows={2}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            // Intro envía, Mayús+Intro hace párrafo: lo que espera
            // cualquiera que haya usado un chat.
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); preguntar(texto); }
          }}
          placeholder={escuchando ? 'Te escucho…' : 'Escribe tu pregunta, o pulsa el micrófono y háblame'}
          aria-label="Tu pregunta"
          disabled={pensando}
        />
        <div className="asistencia-botones">
          {hayMicrofono && (
            <button
              type="button"
              className={`btn ${escuchando ? 'btn-danger' : 'btn-secondary'}`}
              onClick={alternarMicrofono}
              disabled={pensando}
              title={escuchando ? 'Dejar de escuchar' : 'Dictar la pregunta'}
              aria-pressed={escuchando}
            >
              {escuchando ? <MicOff size={16} /> : <Mic size={16} />}
              {escuchando ? 'Parar' : 'Dictar'}
            </button>
          )}
          <button className="btn btn-primary" disabled={pensando || !texto.trim()}>
            {pensando ? <Loader2 size={16} className="spin" /> : <Send size={16} />} Enviar
          </button>
        </div>
      </form>

      <p className="asistencia-nota">
        Tus facturas no se envían: sólo viaja un resumen con cuántas hay y en qué
        estado, y lo que escribes o dictas. El audio se transcribe en tu propio
        navegador y no sale de aquí.
      </p>
    </div>
  );
}
