'use client';

/**
 * ASISTENCIA CON IA — CON PESTAÑAS DE SESIONES
 *
 * Un chat inteligente que recuerda las conversaciones anteriores
 * como pestañas horizontales. Inspirado en el diseño minimalista
 * de Emil Kowalski: transiciones suaves, espaciado generoso,
 * micro-interacciones con propósito.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Loader2, Mic, MicOff, Plus, Send,
  Sparkles, X, User, ChevronRight, Shield,
} from 'lucide-react';

import PageSkeleton from '@/components/ui/PageSkeleton';
import { useToast } from '@/hooks/useToast';
import {
  getClients, getCompanySettings, getInvoices, getProducts,
  getAlbaranes, getDevoluciones, getAbonos, getAlmacenes,
  getVendedores, getObras, getGastos, getVehiculos, getLotes,
} from '@/lib/storage';
import { getPlantillas } from '@/lib/plantillas/almacen';
import { retratoDelPanel, retratoEnPalabras, type RetratoDelPanel } from '@/lib/asistencia/contexto';
import { dictadoDisponible, empezarDictado, type Dictado } from '@/lib/asistencia/dictado';

/* ---------------------------------------------------------------
   TIPOS Y PERSISTENCIA
   --------------------------------------------------------------- */

interface Mensaje {
  id: string;
  deQuien: 'persona' | 'asistente';
  texto: string;
  hora: number;
}

interface Sesion {
  id: string;
  titulo: string;
  mensajes: Mensaje[];
  creadaEn: number;
  ultimoMensaje: number;
}

const CLAVE_MEMORIA = 'asistencia-sesiones';
const MAX_SESIONES = 15;

function cargarSesiones(): Sesion[] {
  try {
    const g = localStorage.getItem(CLAVE_MEMORIA);
    return g ? JSON.parse(g) : [];
  } catch { return []; }
}

function guardarSesiones(ss: Sesion[]) {
  try {
    localStorage.setItem(CLAVE_MEMORIA, JSON.stringify(ss.slice(0, MAX_SESIONES)));
  } catch { /* sin espacio, no pasa nada */ }
}

function tituloCorto(texto: string): string {
  const l = texto.replace(/[¿?¡!]/g, '').trim();
  return l.length > 28 ? l.slice(0, 25) + '…' : l;
}

/* ---------------------------------------------------------------
   SUGERENCIAS
   --------------------------------------------------------------- */

const SUGERENCIAS = [
  { texto: '¿Cuánto dinero tengo en facturas?', emoji: '💰' },
  { texto: '¿Qué facturas tengo registradas?', emoji: '📄' },
  { texto: '¿Tengo cobros pendientes o vencidos?', emoji: '⏰' },
  { texto: '¿Qué me falta por configurar?', emoji: '⚙️' },
];

/* ---------------------------------------------------------------
   COMPONENTE
   --------------------------------------------------------------- */

export default function AsistenciaPage() {
  const { error: avisarError } = useToast();
  const [montado, setMontado] = useState(false);
  const [retrato, setRetrato] = useState<RetratoDelPanel | null>(null);

  const [sesiones, setSesiones] = useState<Sesion[]>([]);
  const [sesionActiva, setSesionActiva] = useState<string | null>(null);

  const [texto, setTexto] = useState('');
  const [pensando, setPensando] = useState(false);
  const [escuchando, setEscuchando] = useState(false);
  const [hayMicro, setHayMicro] = useState(false);
  const [tardando, setTardando] = useState(false);

  const dictadoRef = useRef<Dictado | null>(null);
  const finRef = useRef<HTMLDivElement>(null);
  const cajaRef = useRef<HTMLDivElement>(null);
  const campoRef = useRef<HTMLTextAreaElement>(null);

  const sesion = sesiones.find(s => s.id === sesionActiva) ?? null;
  const mensajes = sesion?.mensajes ?? [];
  const sinChat = !sesionActiva || mensajes.length === 0;

  // --- Recarga fresca de todos los documentos y datos del negocio ---
  const refrescarDatos = useCallback(async () => {
    try {
      const [
        facturas,
        albaranes,
        clientes,
        ajustes,
        plantillas,
        productos,
        almacenes,
        vendedores,
        obras,
        gastos,
        vehiculos,
        lotes,
        devoluciones,
        abonos,
      ] = await Promise.all([
        getInvoices(),
        getAlbaranes(),
        getClients(),
        getCompanySettings(),
        getPlantillas(),
        getProducts(),
        getAlmacenes().catch(() => []),
        getVendedores().catch(() => []),
        getObras().catch(() => []),
        getGastos().catch(() => []),
        getVehiculos().catch(() => []),
        getLotes().catch(() => []),
        getDevoluciones().catch(() => []),
        getAbonos().catch(() => []),
      ]);
      const nuevoRetrato = retratoDelPanel({
        facturas,
        albaranes,
        devoluciones,
        abonos,
        clientes,
        ajustes,
        productos,
        almacenes,
        vendedores,
        obras,
        vehiculos,
        gastos,
        lotes,
        tienePlantillaPropia: plantillas.length > 0,
      });
      setRetrato(nuevoRetrato);
      return nuevoRetrato;
    } catch {
      return null;
    }
  }, []);

  // --- Montaje inicial y sincronización con foco de ventana ---
  useEffect(() => {
    (async () => {
      await refrescarDatos();
      setHayMicro(dictadoDisponible());
      const guardadas = cargarSesiones();
      setSesiones(guardadas);
      if (guardadas.length > 0) setSesionActiva(guardadas[0].id);
      setMontado(true);
    })();
  }, [refrescarDatos]);

  // Si el usuario crea facturas, pedidos o presupuestos en otra pestaña y vuelve, se actualiza solo
  useEffect(() => {
    const alCambiar = () => { refrescarDatos(); };
    window.addEventListener('focus', alCambiar);
    window.addEventListener('storage', alCambiar);
    return () => {
      window.removeEventListener('focus', alCambiar);
      window.removeEventListener('storage', alCambiar);
    };
  }, [refrescarDatos]);

  // Persistir
  useEffect(() => { if (montado) guardarSesiones(sesiones); }, [sesiones, montado]);

  // Auto-scroll
  useEffect(() => {
    const c = cajaRef.current;
    if (!c) return;
    const cerca = c.scrollHeight - c.scrollTop - c.clientHeight < 120;
    if (cerca) finRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [mensajes, pensando]);

  // Tardanza
  useEffect(() => {
    if (!pensando) return;
    const t = setTimeout(() => setTardando(true), 8_000);
    return () => clearTimeout(t);
  }, [pensando]);

  // Auto-resize textarea
  useEffect(() => {
    const c = campoRef.current;
    if (!c) return;
    c.style.height = 'auto';
    c.style.height = `${c.scrollHeight}px`;
  }, [texto]);

  // Limpiar micrófono al salir
  useEffect(() => () => dictadoRef.current?.parar(), []);

  // --- Crear pestaña nueva ---
  const crearSesion = useCallback(() => {
    const nueva: Sesion = {
      id: crypto.randomUUID(),
      titulo: 'Nueva conversación',
      mensajes: [],
      creadaEn: Date.now(),
      ultimoMensaje: Date.now(),
    };
    setSesiones(prev => [nueva, ...prev]);
    setSesionActiva(nueva.id);
    setTexto('');
  }, []);

  // --- Cerrar pestaña ---
  const cerrarSesion = useCallback((id: string) => {
    setSesiones(prev => {
      const nuevas = prev.filter(s => s.id !== id);
      if (sesionActiva === id) {
        setSesionActiva(nuevas.length > 0 ? nuevas[0].id : null);
      }
      return nuevas;
    });
  }, [sesionActiva]);

  // --- Preguntar ---
  const preguntar = useCallback(async (pregunta: string) => {
    const limpia = pregunta.trim();
    if (!limpia || pensando || !retrato) return;

    dictadoRef.current?.parar();
    const ahora = Date.now();
    const msg: Mensaje = { id: crypto.randomUUID(), deQuien: 'persona', texto: limpia, hora: ahora };

    let id = sesionActiva;
    if (!id) {
      // Crear sesión al primer mensaje
      id = crypto.randomUUID();
      const nueva: Sesion = {
        id,
        titulo: tituloCorto(limpia),
        mensajes: [msg],
        creadaEn: ahora,
        ultimoMensaje: ahora,
      };
      setSesiones(prev => [nueva, ...prev]);
      setSesionActiva(id);
    } else {
      setSesiones(prev => prev.map(s =>
        s.id === id
          ? { ...s, mensajes: [...s.mensajes, msg], ultimoMensaje: ahora,
              titulo: s.mensajes.length === 0 ? tituloCorto(limpia) : s.titulo }
          : s
      ));
    }

    const historial = mensajes.map(m => ({ deQuien: m.deQuien, texto: m.texto }));
    setTexto('');
    setPensando(true);

    // Refrescar en vivo para que siempre tenga las últimas facturas, presupuestos, pedidos y cifras
    const retratoActual = (await refrescarDatos()) || retrato;

    try {
      const res = await fetch('/api/ayuda', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modo: 'asistencia',
          pregunta: limpia,
          situacion: retratoActual ? retratoEnPalabras(retratoActual) : [],
          historial,
        }),
      });
      const body = await res.json().catch(() => ({}));
      const respMsg: Mensaje = {
        id: crypto.randomUUID(),
        deQuien: 'asistente',
        texto: res.ok ? String(body.texto ?? '') : (body?.error ?? 'No he podido responder.'),
        hora: Date.now(),
      };
      setSesiones(prev => prev.map(s =>
        s.id === id ? { ...s, mensajes: [...s.mensajes, respMsg], ultimoMensaje: Date.now() } : s
      ));
    } catch {
      const errMsg: Mensaje = {
        id: crypto.randomUUID(), deQuien: 'asistente', hora: Date.now(),
        texto: 'No he podido contactar con la asistencia. El programa sigue funcionando.',
      };
      setSesiones(prev => prev.map(s =>
        s.id === id ? { ...s, mensajes: [...s.mensajes, errMsg], ultimoMensaje: Date.now() } : s
      ));
    } finally {
      setPensando(false);
      setTardando(false);
    }
  }, [mensajes, pensando, retrato, sesionActiva]);

  // --- Micrófono ---
  const toggleMic = () => {
    if (escuchando) { dictadoRef.current?.parar(); return; }
    const s = empezarDictado({
      alOir: (t) => setTexto(t),
      alFallar: (m) => { avisarError('Micrófono', m); setEscuchando(false); },
      alTerminar: () => setEscuchando(false),
    });
    if (!s) { avisarError('Sin dictado', 'Usa Chrome o Edge.'); return; }
    dictadoRef.current = s;
    setEscuchando(true);
  };

  if (!montado) return <PageSkeleton variant="report" label="Preparando la asistencia" />;

  return (
    <div className="animate-fade-in asistencia-pagina">

      {/* ─── HEADER ─── */}
      <div className="page-header">
        <div className="page-header-left">
          <p className="page-eyebrow"><Sparkles /> Asistencia IA</p>
          <h1 className="page-title">Tu compañero de facturación</h1>
          <p className="page-subtitle">
            Pregunta lo que necesites. Conoce tus facturas, clientes y configuración.
          </p>
        </div>
      </div>

      {/* ─── PESTAÑAS DE SESIONES ─── */}
      <div className="sesiones-bar">
        <div className="sesiones-tabs">
          {sesiones.map(s => (
            <button
              key={s.id}
              className={`sesion-tab ${s.id === sesionActiva ? 'sesion-tab--activa' : ''}`}
              onClick={() => setSesionActiva(s.id)}
            >
              <Sparkles size={12} className="sesion-tab-icono" />
              <span className="sesion-tab-titulo">{s.titulo}</span>
              <span
                className="sesion-tab-cerrar"
                role="button"
                tabIndex={0}
                onClick={(e) => { e.stopPropagation(); cerrarSesion(s.id); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); cerrarSesion(s.id); } }}
                aria-label="Cerrar sesión"
              >
                <X size={12} />
              </span>
            </button>
          ))}
        </div>
        <button className="sesion-nueva" onClick={crearSesion} title="Nueva conversación">
          <Plus size={16} />
        </button>
      </div>

      {/* ─── CHAT ─── */}
      <div className="asistencia-ventana">
        <div className="asistencia-conversacion" ref={cajaRef}>
          {sinChat ? (
            <div className="asistencia-vacio">
              <div className="asistencia-vacio-icono">
                <Sparkles size={28} />
              </div>
              <strong>¿En qué te echo una mano?</strong>
              <p className="asistencia-vacio-sub">
                Pregunta con tus palabras. Conozco tu situación.
              </p>
              <div className="asistencia-sugerencias">
                {SUGERENCIAS.map(s => (
                  <button
                    key={s.texto}
                    type="button"
                    className="asistencia-chip"
                    onClick={() => preguntar(s.texto)}
                  >
                    <span className="asistencia-chip-emoji">{s.emoji}</span>
                    <span>{s.texto}</span>
                    <ChevronRight size={14} className="asistencia-chip-flecha" />
                  </button>
                ))}
              </div>
              <div className="asistencia-privacidad">
                <Shield size={12} />
                <span>Tus datos no salen de aquí. Solo viaja un resumen anónimo.</span>
              </div>
            </div>
          ) : (
            <ul className="asistencia-mensajes">
              {mensajes.map(m => (
                <li key={m.id} className={`msg msg--${m.deQuien}`}>
                  <span className="msg-avatar" aria-hidden="true">
                    {m.deQuien === 'persona' ? <User size={14} /> : <Sparkles size={14} />}
                  </span>
                  <div className="msg-burbuja">
                    {m.texto.split('\n').filter(Boolean).map((l, i) => <p key={i}>{l}</p>)}
                  </div>
                </li>
              ))}
              {pensando && (
                <li className="msg msg--asistente">
                  <span className="msg-avatar" aria-hidden="true"><Sparkles size={14} /></span>
                  <div className="msg-burbuja msg-pensando" role="status" aria-live="polite">
                    <span className="msg-dots"><i /><i /><i /></span>
                    {tardando ? 'Un momento…' : 'Pensando…'}
                  </div>
                </li>
              )}
            </ul>
          )}
          <div ref={finRef} />
        </div>

        {/* ─── INPUT ─── */}
        <form
          className="asistencia-input"
          onSubmit={(e) => { e.preventDefault(); preguntar(texto); }}
        >
          <div className="asistencia-input-inner">
            <textarea
              ref={campoRef}
              className="asistencia-campo"
              rows={1}
              autoFocus
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); preguntar(texto); }
              }}
              placeholder={escuchando ? 'Te escucho…' : 'Escribe tu pregunta…'}
              disabled={pensando}
            />
            <div className="asistencia-input-btns">
              {escuchando && <span className="asistencia-mic-on">Escuchando…</span>}
              {hayMicro && (
                <button
                  type="button"
                  className={`asistencia-btn-round ${escuchando ? 'asistencia-btn-round--rojo' : ''}`}
                  onClick={toggleMic}
                  disabled={pensando}
                  title={escuchando ? 'Parar' : 'Dictar'}
                >
                  {escuchando ? <MicOff size={18} /> : <Mic size={18} />}
                </button>
              )}
              <button
                type="submit"
                className="asistencia-btn-enviar"
                disabled={pensando || !texto.trim()}
              >
                {pensando ? <Loader2 size={18} className="spin" /> : <Send size={18} />}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
