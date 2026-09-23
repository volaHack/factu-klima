'use client';

/**
 * ASISTENCIA IA
 *
 * Un chat que conoce el negocio de quien lo usa: sus documentos, sus
 * clientes, su stock y lo que le falta por configurar. Las conversaciones
 * se guardan por cuenta (`lib/asistencia/memoria.ts`), así que en un
 * ordenador compartido nadie abre las de otro.
 *
 * Se pregunta escribiendo o hablando. Al hablar se usan a la vez el
 * dictado del navegador (se ve el texto mientras se habla) y una
 * grabación (por si el navegador no sabe dictar): al soltar, la pregunta
 * sale sola, como una nota de voz.
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle, ArrowUp, Check, Clock, Copy, FileText, Loader2, Menu, MessageSquare,
  Mic, PackageX, Plus, RotateCcw, Settings2, Sparkles, Square, Trash2, TrendingUp,
  Truck, Users, Volume2, VolumeX, Wallet, X,
} from 'lucide-react';

import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

import PageSkeleton from '@/components/ui/PageSkeleton';
import { useToast } from '@/hooks/useToast';
import {
  getClients, getCompanySettings, getInvoices, getProducts,
  getAlbaranes, getDevoluciones, getAbonos, getAlmacenes,
  getVendedores, getObras, getGastos, getVehiculos, getLotes,
} from '@/lib/storage';
import { getPlantillas } from '@/lib/plantillas/almacen';
import { createClient } from '@/lib/supabase/client';
import { retratoDelPanel, retratoEnPalabras, type RetratoDelPanel } from '@/lib/asistencia/contexto';
import { dictadoDisponible, empezarDictado, type Dictado } from '@/lib/asistencia/dictado';
import {
  audioAWav, bytesABase64, empezarGrabacion, grabacionDisponible, motivoDeFalloDeGrabacion,
  type Grabacion,
} from '@/lib/asistencia/grabacion';
import {
  cargarSesiones, guardarSesiones, tituloCorto,
  type MensajeGuardado as Mensaje, type SesionGuardada as Sesion,
} from '@/lib/asistencia/memoria';

/* ---------------------------------------------------------------
   PEQUEÑAS AYUDAS
   --------------------------------------------------------------- */

const euros = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0);

function haceCuanto(ms: number, ahora: number): string {
  const s = Math.max(0, Math.round((ahora - ms) / 1000));
  if (s < 45) return 'ahora';
  const min = Math.round(s / 60);
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d === 1) return 'ayer';
  if (d < 7) return `hace ${d} días`;
  return new Date(ms).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

function grupoDeFecha(ms: number, ahora: number): string {
  const inicioHoy = new Date(ahora); inicioHoy.setHours(0, 0, 0, 0);
  const dias = (inicioHoy.getTime() - ms) / 86_400_000;
  if (ms >= inicioHoy.getTime()) return 'Hoy';
  if (dias < 1) return 'Ayer';
  if (dias < 7) return 'Esta semana';
  return 'Antes';
}

function reloj(segundos: number): string {
  return `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, '0')}`;
}

/* ---------------------------------------------------------------
   TEXTO DE LA RESPUESTA
   El modelo contesta con listas «- » y **negritas**. Se pintan como
   tales, sin HTML del modelo: se parte el texto y se montan elementos.
   --------------------------------------------------------------- */

function enLinea(texto: string): ReactNode[] {
  return texto.split(/(\*\*[^*]+\*\*)/g).map((trozo, i) =>
    trozo.startsWith('**') && trozo.endsWith('**') && trozo.length > 4
      ? <strong key={i}>{trozo.slice(2, -2)}</strong>
      : <Fragment key={i}>{trozo}</Fragment>,
  );
}

function TextoRespuesta({ texto }: { texto: string }) {
  const bloques: ReactNode[] = [];
  let lista: { ordenada: boolean; items: string[] } | null = null;
  const cerrarLista = () => {
    if (!lista) return;
    const Etiqueta = lista.ordenada ? 'ol' : 'ul';
    bloques.push(
      <Etiqueta key={bloques.length}>
        {lista.items.map((it, i) => <li key={i}>{enLinea(it)}</li>)}
      </Etiqueta>,
    );
    lista = null;
  };

  for (const cruda of texto.split('\n')) {
    const linea = cruda.trim();
    const vineta = linea.match(/^[-•*]\s+(.*)$/);
    const numero = linea.match(/^\d+[.)]\s+(.*)$/);
    if (vineta || numero) {
      const ordenada = Boolean(numero);
      if (lista && lista.ordenada !== ordenada) cerrarLista();
      lista ??= { ordenada, items: [] };
      lista.items.push((vineta ?? numero)![1]);
      continue;
    }
    cerrarLista();
    if (linea) bloques.push(<p key={bloques.length}>{enLinea(linea.replace(/^#+\s*/, ''))}</p>);
  }
  cerrarLista();
  return <>{bloques}</>;
}

/* ---------------------------------------------------------------
   SUGERENCIAS, SACADAS DE LOS DATOS
   Una sugerencia genérica («¿cuánto dinero tengo?») se pulsa una vez.
   Una que ya sabe que hay 4 vencidas es la que se usa.
   --------------------------------------------------------------- */

interface Sugerencia { texto: string; icono: ReactNode; tono?: 'aviso' }

function sugerenciasPara(r: RetratoDelPanel | null): Sugerencia[] {
  if (!r) return [];
  const s: Sugerencia[] = [];
  if (r.facturasVencidas > 0) {
    s.push({ texto: `Tengo ${r.facturasVencidas} factura${r.facturasVencidas === 1 ? '' : 's'} vencida${r.facturasVencidas === 1 ? '' : 's'}: ¿a quién reclamo primero?`, icono: <AlertTriangle size={16} />, tono: 'aviso' });
  }
  if (r.totalPendiente > 0) s.push({ texto: '¿Quién me debe más dinero ahora mismo?', icono: <Wallet size={16} /> });
  if (r.facturasBorradores > 0) {
    s.push({ texto: `¿Qué ${r.facturasBorradores === 1 ? 'borrador tengo' : `${r.facturasBorradores} borradores tengo`} a medias?`, icono: <FileText size={16} /> });
  }
  if (r.albaranesPendientesFacturar > 0) s.push({ texto: '¿Qué albaranes me quedan por facturar?', icono: <Truck size={16} /> });
  if (r.productos.some(p => p.stock !== undefined && p.stock <= 0)) s.push({ texto: '¿Qué productos se han quedado sin stock?', icono: <PackageX size={16} /> });
  s.push({ texto: '¿Cómo va el negocio este mes comparado con el año?', icono: <TrendingUp size={16} /> });
  if (r.clientes.length > 0) s.push({ texto: '¿Quiénes son mis mejores clientes?', icono: <Users size={16} /> });
  s.push({ texto: '¿Qué me falta por configurar?', icono: <Settings2 size={16} /> });
  return s.slice(0, 4);
}

const PASOS_PENSANDO = ['Leyendo tus documentos', 'Cruzando las cifras', 'Preparando la respuesta'];

type EstadoVoz = 'reposo' | 'grabando' | 'transcribiendo';
const BARRAS = 36;

/* ---------------------------------------------------------------
   COMPONENTE
   --------------------------------------------------------------- */

export default function AsistenciaPage() {
  const { error: avisarError } = useToast();

  const [montado, setMontado] = useState(false);
  const [usuario, setUsuario] = useState<string | null>(null);
  const [retrato, setRetrato] = useState<RetratoDelPanel | null>(null);
  const [actualizadoEn, setActualizadoEn] = useState(0);
  const [ahora, setAhora] = useState(0);

  const [sesiones, setSesiones] = useState<Sesion[]>([]);
  const [sesionActiva, setSesionActiva] = useState<string | null>(null);
  const [panelAbierto, setPanelAbierto] = useState(false);

  const [texto, setTexto] = useState('');
  const [pensando, setPensando] = useState(false);
  const [paso, setPaso] = useState(0);

  const [hayVoz, setHayVoz] = useState(false);
  const [estadoVoz, setEstadoVoz] = useState<EstadoVoz>('reposo');
  const [segundos, setSegundos] = useState(0);
  const [provisional, setProvisional] = useState('');

  const [copiado, setCopiado] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState<string | null>(null);

  const finRef = useRef<HTMLDivElement>(null);
  const cajaRef = useRef<HTMLDivElement>(null);
  const campoRef = useRef<HTMLTextAreaElement>(null);
  const barrasRef = useRef<(HTMLSpanElement | null)[]>([]);
  const niveles = useRef<number[]>(Array(BARRAS).fill(0));
  const voz = useRef<{
    grabacion: Grabacion | null;
    dictado: Dictado | null;
    dicho: string;
    antes: string;
    finDictado: Promise<void> | null;
    inicio: number;
  }>({ grabacion: null, dictado: null, dicho: '', antes: '', finDictado: null, inicio: 0 });
  /** La cuenta cuyas conversaciones hay en pantalla; null hasta arrancar. */
  const usuarioCargado = useRef<{ id: string | null } | null>(null);
  const preguntarRef = useRef<(p: string, porVoz?: boolean) => void>(() => {});
  const terminarVozRef = useRef<(enviar: boolean) => void>(() => {});

  const sesion = sesiones.find(s => s.id === sesionActiva) ?? null;
  const mensajes = useMemo(() => sesion?.mensajes ?? [], [sesion]);
  const sinChat = mensajes.length === 0;

  /* --- Datos del negocio, siempre frescos --- */
  const refrescarDatos = useCallback(async () => {
    try {
      const [
        facturas, albaranes, clientes, ajustes, plantillas, productos,
        almacenes, vendedores, obras, gastos, vehiculos, lotes, devoluciones, abonos,
      ] = await Promise.all([
        getInvoices(), getAlbaranes(), getClients(), getCompanySettings(), getPlantillas(), getProducts(),
        getAlmacenes().catch(() => []), getVendedores().catch(() => []), getObras().catch(() => []),
        getGastos().catch(() => []), getVehiculos().catch(() => []), getLotes().catch(() => []),
        getDevoluciones().catch(() => []), getAbonos().catch(() => []),
      ]);
      const nuevo = retratoDelPanel({
        facturas, albaranes, devoluciones, abonos, clientes, ajustes, productos,
        almacenes, vendedores, obras, vehiculos, gastos, lotes,
        tienePlantillaPropia: plantillas.length > 0,
      });
      setRetrato(nuevo);
      setActualizadoEn(Date.now());
      return nuevo;
    } catch {
      return null;
    }
  }, []);

  /* --- Arranque: de quién es la sesión, y sólo sus conversaciones --- */
  useEffect(() => {
    let vivo = true;
    const supabase = createClient();

    (async () => {
      const { data } = await supabase.auth.getSession();
      const id = data.session?.user?.id ?? null;
      await refrescarDatos();
      if (!vivo) return;
      const guardadas = cargarSesiones(id, localStorage);
      usuarioCargado.current = { id };
      setUsuario(id);
      setSesiones(guardadas);
      setSesionActiva(guardadas[0]?.id ?? null);
      setHayVoz(dictadoDisponible() || grabacionDisponible());
      setAhora(Date.now());
      setMontado(true);
    })();

    // Si en otra pestaña se sale o entra otra cuenta, lo que hay en
    // pantalla deja de ser suyo: se cambia al momento, sin esperar a
    // recargar.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_evento: AuthChangeEvent, s: Session | null) => {
      const id = s?.user?.id ?? null;
      if (!vivo || !usuarioCargado.current || id === usuarioCargado.current.id) return;
      usuarioCargado.current = { id };
      const suyas = cargarSesiones(id, localStorage);
      setUsuario(id);
      setSesiones(suyas);
      setSesionActiva(suyas[0]?.id ?? null);
      setRetrato(null);
      void refrescarDatos();
    });

    return () => { vivo = false; subscription.unsubscribe(); };
  }, [refrescarDatos]);

  // Al volver a la pestaña, datos al día: puede haber hecho facturas en otra.
  useEffect(() => {
    const alVolver = () => { void refrescarDatos(); };
    window.addEventListener('focus', alVolver);
    return () => window.removeEventListener('focus', alVolver);
  }, [refrescarDatos]);

  // «hace 3 min» tiene que moverse solo.
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (montado) guardarSesiones(usuario, sesiones, localStorage);
  }, [sesiones, usuario, montado]);

  useEffect(() => {
    const c = cajaRef.current;
    if (!c) return;
    const cerca = c.scrollHeight - c.scrollTop - c.clientHeight < 160;
    if (cerca) finRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [mensajes.length, pensando]);

  useEffect(() => {
    if (!pensando) return;
    const t = setInterval(() => setPaso(p => Math.min(p + 1, PASOS_PENSANDO.length - 1)), 2_400);
    return () => { clearInterval(t); setPaso(0); };
  }, [pensando]);

  useEffect(() => {
    const c = campoRef.current;
    if (!c) return;
    c.style.height = 'auto';
    c.style.height = `${Math.min(c.scrollHeight, 200)}px`;
  }, [texto]);

  useEffect(() => () => {
    voz.current.dictado?.parar();
    voz.current.grabacion?.cancelar();
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  }, []);

  /* --- Conversaciones --- */
  const nuevaConversacion = useCallback(() => {
    setSesionActiva(null);
    setTexto('');
    setPanelAbierto(false);
    requestAnimationFrame(() => campoRef.current?.focus());
  }, []);

  const borrarConversacion = useCallback((id: string) => {
    setSesiones(prev => prev.filter(s => s.id !== id));
    setSesionActiva(actual => (actual === id ? null : actual));
  }, []);

  const anadirMensaje = (id: string, m: Mensaje) => {
    setSesiones(prev => prev.map(s =>
      s.id === id ? { ...s, mensajes: [...s.mensajes, m], ultimoMensaje: m.hora } : s,
    ));
  };

  /* --- Preguntar --- */
  const preguntar = useCallback(async (pregunta: string, porVoz = false) => {
    const limpia = pregunta.trim();
    if (!limpia || pensando) return;

    const hora = Date.now();
    const msg: Mensaje = { id: crypto.randomUUID(), deQuien: 'persona', texto: limpia, hora, porVoz };
    const historial = mensajes
      .filter(m => !m.error)
      .map(m => ({ deQuien: m.deQuien, texto: m.texto }));

    let id = sesionActiva;
    if (!id) {
      id = crypto.randomUUID();
      const nueva: Sesion = { id, titulo: tituloCorto(limpia), mensajes: [msg], creadaEn: hora, ultimoMensaje: hora };
      setSesiones(prev => [nueva, ...prev]);
      setSesionActiva(id);
    } else {
      anadirMensaje(id, msg);
    }

    setTexto('');
    setPensando(true);

    const actual = (await refrescarDatos()) ?? retrato;

    try {
      const res = await fetch('/api/ayuda', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modo: 'asistencia',
          pregunta: limpia,
          situacion: actual ? retratoEnPalabras(actual) : [],
          historial,
        }),
      });
      const cuerpo = await res.json().catch(() => ({}));
      const respuesta = res.ok ? String(cuerpo.texto ?? '').trim() : '';
      anadirMensaje(id, {
        id: crypto.randomUUID(),
        deQuien: 'asistente',
        hora: Date.now(),
        texto: respuesta || cuerpo?.error || 'No he podido responder. Vuelve a intentarlo.',
        error: !respuesta,
      });
    } catch {
      anadirMensaje(id, {
        id: crypto.randomUUID(), deQuien: 'asistente', hora: Date.now(), error: true,
        texto: 'No he podido contactar con la asistencia. Revisa la conexión y vuelve a intentarlo.',
      });
    } finally {
      setPensando(false);
    }
  }, [mensajes, pensando, retrato, sesionActiva, refrescarDatos]);

  useEffect(() => { preguntarRef.current = preguntar; }, [preguntar]);

  const reintentar = (indiceError: number) => {
    const anterior = [...mensajes.slice(0, indiceError)].reverse().find(m => m.deQuien === 'persona');
    if (!anterior || !sesionActiva) return;
    const idError = mensajes[indiceError].id;
    setSesiones(prev => prev.map(s =>
      s.id === sesionActiva ? { ...s, mensajes: s.mensajes.filter(m => m.id !== idError && m.id !== anterior.id) } : s,
    ));
    void preguntar(anterior.texto, anterior.porVoz);
  };

  /* --- Voz --- */
  const pintarNivel = (nivel: number) => {
    const n = niveles.current;
    n.push(nivel);
    n.shift();
    barrasRef.current.forEach((b, i) => {
      if (b) b.style.transform = `scaleY(${Math.max(0.08, n[i])})`;
    });
  };

  const empezarVoz = async () => {
    if (estadoVoz !== 'reposo' || pensando) return;
    const v = voz.current;
    v.dicho = '';
    v.antes = texto.trim();
    v.grabacion = null;
    v.dictado = null;
    v.finDictado = null;
    niveles.current = Array(BARRAS).fill(0);

    let motivo: string | null = null;
    if (grabacionDisponible()) {
      try {
        v.grabacion = await empezarGrabacion({
          alNivel: pintarNivel,
          alLlegarAlMaximo: () => terminarVozRef.current(true),
        });
      } catch (err) {
        motivo = motivoDeFalloDeGrabacion(err);
      }
    }

    if (dictadoDisponible() && !(motivo && /permiso/.test(motivo))) {
      let terminar: () => void = () => {};
      v.finDictado = new Promise<void>(r => { terminar = r; });
      v.dictado = empezarDictado({
        alOir: (t) => { v.dicho = t; setProvisional(t); },
        // Si el dictado falla pero hay grabación, no se avisa: la
        // grabación se transcribe en el servidor al soltar.
        alFallar: (m) => { if (!v.grabacion) motivo = m; },
        alTerminar: () => terminar(),
      });
    }

    if (!v.grabacion && !v.dictado) {
      avisarError('Micrófono', motivo ?? 'Este navegador no deja usar el micrófono. Escribe la pregunta.');
      return;
    }

    v.inicio = Date.now();
    setSegundos(0);
    setProvisional('');
    setEstadoVoz('grabando');
  };

  const terminarVoz = async (enviar: boolean) => {
    const v = voz.current;
    if (!v.grabacion && !v.dictado) return;

    v.dictado?.parar();
    const grabado = enviar ? await v.grabacion?.parar() : (v.grabacion?.cancelar(), null);
    // El dictado entrega sus últimas palabras DESPUÉS de parar: se le
    // da un momento para que lleguen antes de decidir que no dijo nada.
    if (enviar && v.finDictado) {
      await Promise.race([v.finDictado, new Promise(r => setTimeout(r, 1_200))]);
    }
    const grabacion = v.grabacion;
    v.grabacion = null;
    v.dictado = null;

    if (!enviar) {
      setEstadoVoz('reposo');
      setProvisional('');
      return;
    }

    let dicho = v.dicho.trim();
    if (!dicho && grabado && grabacion) {
      setEstadoVoz('transcribiendo');
      try {
        const wav = await audioAWav(grabado);
        const res = await fetch('/api/ayuda/voz', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audio: bytesABase64(wav) }),
        });
        const cuerpo = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(cuerpo?.error || 'No se ha podido pasar la nota a texto.');
        dicho = String(cuerpo.texto ?? '').trim();
      } catch (err) {
        avisarError('Nota de voz', err instanceof Error ? err.message : 'No se ha podido pasar la nota a texto.');
        setEstadoVoz('reposo');
        setProvisional('');
        return;
      }
    }

    setEstadoVoz('reposo');
    setProvisional('');
    if (!dicho) {
      avisarError('Nota de voz', 'No se ha oído nada. Prueba otra vez, más cerca del micrófono.');
      return;
    }
    preguntarRef.current([v.antes, dicho].filter(Boolean).join(' '), true);
  };

  useEffect(() => { terminarVozRef.current = (e) => { void terminarVoz(e); }; });

  useEffect(() => {
    if (estadoVoz !== 'grabando') return;
    const t = setInterval(() => setSegundos(Math.floor((Date.now() - voz.current.inicio) / 1000)), 250);
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') terminarVozRef.current(false);
      if (e.key === 'Enter') { e.preventDefault(); terminarVozRef.current(true); }
    };
    window.addEventListener('keydown', alTeclear);
    return () => { clearInterval(t); window.removeEventListener('keydown', alTeclear); };
  }, [estadoVoz]);

  /* --- Copiar y escuchar --- */
  const copiar = async (m: Mensaje) => {
    try {
      await navigator.clipboard.writeText(m.texto.replace(/\*\*/g, ''));
      setCopiado(m.id);
      setTimeout(() => setCopiado(c => (c === m.id ? null : c)), 1_600);
    } catch { /* sin portapapeles no pasa nada */ }
  };

  const escuchar = (m: Mensaje) => {
    if (typeof speechSynthesis === 'undefined') return;
    if (leyendo === m.id) { speechSynthesis.cancel(); setLeyendo(null); return; }
    speechSynthesis.cancel();
    const frase = new SpeechSynthesisUtterance(m.texto.replace(/\*\*/g, '').replace(/^[-•]\s*/gm, ''));
    frase.lang = 'es-ES';
    const vozEs = speechSynthesis.getVoices().find(v => v.lang.startsWith('es-ES')) ?? speechSynthesis.getVoices().find(v => v.lang.startsWith('es'));
    if (vozEs) frase.voice = vozEs;
    frase.onend = () => setLeyendo(l => (l === m.id ? null : l));
    frase.onerror = frase.onend;
    setLeyendo(m.id);
    speechSynthesis.speak(frase);
  };

  if (!montado) return <PageSkeleton variant="report" label="Preparando la asistencia" />;

  const sugerencias = sugerenciasPara(retrato);
  const nombre = retrato?.nombreEmpresa?.trim();
  const ordenadas = [...sesiones].sort((a, b) => b.ultimoMensaje - a.ultimoMensaje);
  const grabando = estadoVoz === 'grabando';
  const transcribiendo = estadoVoz === 'transcribiendo';

  const cifras = retrato ? [
    { etiqueta: `Facturado en ${new Date().getFullYear()}`, valor: euros(retrato.importeDelAno), detalle: `${retrato.facturasDelAno} facturas`, pregunta: '¿Cómo va la facturación de este año?' },
    { etiqueta: 'Pendiente de cobro', valor: euros(retrato.totalPendiente), detalle: `${retrato.facturasPendientes} facturas`, pregunta: '¿Quién me debe más dinero ahora mismo?' },
    { etiqueta: 'Vencido', valor: euros(retrato.totalVencido), detalle: `${retrato.facturasVencidas} facturas`, pregunta: '¿Qué facturas tengo vencidas y a quién reclamo primero?', aviso: retrato.facturasVencidas > 0 },
    { etiqueta: 'Clientes', valor: String(retrato.clientes.filter(c => !c.esProveedor).length), detalle: `${retrato.todosLosDocumentos.length} documentos`, pregunta: '¿Quiénes son mis mejores clientes?' },
  ] : [];


  return (
    <div className="asis animate-fade-in">
      {/* ─── CONVERSACIONES ─── */}
      <aside className={`asis-lado ${panelAbierto ? 'asis-lado--abierto' : ''}`} aria-label="Conversaciones">
        <div className="asis-lado-cabeza">
          <span className="asis-lado-titulo">Conversaciones</span>
          <button type="button" className="asis-icono asis-solo-movil" onClick={() => setPanelAbierto(false)} aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>
        <button type="button" className="asis-nueva" onClick={nuevaConversacion}>
          <Plus size={16} /> Nueva conversación
        </button>
        <nav className="asis-lista">
          {ordenadas.length === 0 && (
            <p className="asis-lista-vacia">Aquí irán tus conversaciones. Sólo las ves tú.</p>
          )}
          {ordenadas.map((s, i) => {
            const grupo = grupoDeFecha(s.ultimoMensaje, ahora);
            const cambia = i === 0 || grupoDeFecha(ordenadas[i - 1].ultimoMensaje, ahora) !== grupo;
            const cabecera = cambia ? <p className="asis-lista-grupo">{grupo}</p> : null;
            return (
              <Fragment key={s.id}>
                {cabecera}
                <div className={`asis-item ${s.id === sesionActiva ? 'asis-item--activo' : ''}`}>
                  <button
                    type="button"
                    className="asis-item-abrir"
                    onClick={() => { setSesionActiva(s.id); setPanelAbierto(false); }}
                    aria-current={s.id === sesionActiva ? 'true' : undefined}
                  >
                    <MessageSquare size={14} className="asis-item-icono" />
                    <span className="asis-item-texto">
                      <span className="asis-item-titulo">{s.titulo}</span>
                      <span className="asis-item-meta">{haceCuanto(s.ultimoMensaje, ahora)} · {s.mensajes.length} mensajes</span>
                    </span>
                  </button>
                  <button type="button" className="asis-item-borrar" onClick={() => borrarConversacion(s.id)} aria-label={`Borrar «${s.titulo}»`} title="Borrar">
                    <Trash2 size={14} />
                  </button>
                </div>
              </Fragment>
            );
          })}
        </nav>
        <p className="asis-lado-pie">Las conversaciones se guardan en este navegador y sólo para tu cuenta.</p>
      </aside>
      {panelAbierto && <button type="button" className="asis-velo" aria-label="Cerrar conversaciones" onClick={() => setPanelAbierto(false)} />}

      {/* ─── CHAT ─── */}
      <section className="asis-chat">
        <header className="asis-cabeza">
          <button type="button" className="asis-icono asis-solo-movil" onClick={() => setPanelAbierto(true)} aria-label="Ver conversaciones">
            <Menu size={18} />
          </button>
          <span className="asis-orbe" aria-hidden="true"><Sparkles size={16} /></span>
          <div className="asis-cabeza-texto">
            <strong>{sesion ? sesion.titulo : 'Asistencia IA'}</strong>
            <span className="asis-estado">
              <i className="asis-estado-punto" />
              {retrato ? `Conectada a tus datos · al día ${haceCuanto(actualizadoEn, ahora)}` : 'Cargando tus datos…'}
            </span>
          </div>
          {!sinChat && (
            <button type="button" className="asis-boton-suave" onClick={nuevaConversacion}>
              <Plus size={15} /> <span className="asis-oculto-movil">Nueva</span>
            </button>
          )}
        </header>

        <div className="asis-scroll" ref={cajaRef}>
          {sinChat ? (
            <div className="asis-bienvenida">
              <span className="asis-orbe asis-orbe--grande" aria-hidden="true"><Sparkles size={26} /></span>
              <h1 className="asis-saludo">{nombre ? <>Hola, <em>{nombre}</em></> : 'Hola'}</h1>
              <p className="asis-saludo-sub">
                Pregúntame lo que quieras de tu negocio. Escribe o pulsa el micrófono y habla:
                veo tus documentos, clientes, cobros y stock al momento.
              </p>

              {cifras.length > 0 && (
                <div className="asis-cifras">
                  {cifras.map((c, i) => (
                    <button
                      key={c.etiqueta}
                      type="button"
                      className={`asis-cifra ${c.aviso ? 'asis-cifra--aviso' : ''}`}
                      style={{ animationDelay: `${60 + i * 40}ms` }}
                      onClick={() => preguntar(c.pregunta)}
                    >
                      <span className="asis-cifra-etiqueta">{c.etiqueta}</span>
                      <span className="asis-cifra-valor">{c.valor}</span>
                      <span className="asis-cifra-detalle">{c.detalle}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="asis-sugerencias">
                {sugerencias.map((s, i) => (
                  <button
                    key={s.texto}
                    type="button"
                    className={`asis-sugerencia ${s.tono === 'aviso' ? 'asis-sugerencia--aviso' : ''}`}
                    style={{ animationDelay: `${220 + i * 40}ms` }}
                    onClick={() => preguntar(s.texto)}
                  >
                    <span className="asis-sugerencia-icono">{s.icono}</span>
                    <span>{s.texto}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <ol className="asis-mensajes">
              {mensajes.map((m, i) => (
                <li key={m.id} className={`asis-msg asis-msg--${m.deQuien} ${m.error ? 'asis-msg--error' : ''}`}>
                  {m.deQuien === 'asistente' && (
                    <span className="asis-orbe asis-orbe--mini" aria-hidden="true">
                      {m.error ? <AlertTriangle size={13} /> : <Sparkles size={13} />}
                    </span>
                  )}
                  <div className="asis-msg-cuerpo">
                    <div className="asis-msg-burbuja">
                      {m.deQuien === 'asistente' ? <TextoRespuesta texto={m.texto} /> : <p>{m.texto}</p>}
                    </div>
                    <div className="asis-msg-pie">
                      {m.porVoz && <span className="asis-msg-voz"><Mic size={11} /> Por voz</span>}
                      <span className="asis-msg-hora">
                        {new Date(m.hora).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {m.deQuien === 'asistente' && !m.error && (
                        <>
                          <button type="button" className="asis-accion" onClick={() => copiar(m)} aria-label="Copiar respuesta" title="Copiar">
                            {copiado === m.id ? <Check size={13} /> : <Copy size={13} />}
                          </button>
                          <button type="button" className="asis-accion" onClick={() => escuchar(m)} aria-label={leyendo === m.id ? 'Dejar de leer' : 'Leer en voz alta'} title={leyendo === m.id ? 'Parar' : 'Escuchar'}>
                            {leyendo === m.id ? <VolumeX size={13} /> : <Volume2 size={13} />}
                          </button>
                        </>
                      )}
                      {m.error && i === mensajes.length - 1 && (
                        <button type="button" className="asis-accion asis-accion--texto" onClick={() => reintentar(i)} disabled={pensando}>
                          <RotateCcw size={12} /> Reintentar
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
              {pensando && (
                <li className="asis-msg asis-msg--asistente" role="status" aria-live="polite">
                  <span className="asis-orbe asis-orbe--mini asis-orbe--vivo" aria-hidden="true"><Sparkles size={13} /></span>
                  <div className="asis-pensando">
                    <span key={paso} className="asis-pensando-texto">{PASOS_PENSANDO[paso]}…</span>
                  </div>
                </li>
              )}
            </ol>
          )}
          <div ref={finRef} />
        </div>

        {/* ─── ESCRIBIR O HABLAR ─── */}
        <form
          className="asis-compositor"
          onSubmit={(e) => { e.preventDefault(); void preguntar(texto); }}
        >
          <div className={`asis-caja ${grabando ? 'asis-caja--grabando' : ''}`}>
            {grabando || transcribiendo ? (
              <div className="asis-grabando" aria-live="polite">
                <button type="button" className="asis-icono" onClick={() => terminarVozRef.current(false)} aria-label="Descartar nota de voz" title="Descartar (Esc)" disabled={transcribiendo}>
                  <X size={18} />
                </button>
                <span className={`asis-rec ${transcribiendo ? 'asis-rec--parado' : ''}`} aria-hidden="true" />
                <span className="asis-reloj">{reloj(segundos)}</span>
                <div className="asis-onda" aria-hidden="true">
                  {Array.from({ length: BARRAS }, (_, i) => (
                    <span key={i} ref={el => { barrasRef.current[i] = el; }} />
                  ))}
                </div>
                <span className="asis-provisional">
                  {transcribiendo ? 'Pasando tu nota a texto…' : (provisional || 'Te escucho…')}
                </span>
              </div>
            ) : (
              <textarea
                ref={campoRef}
                className="asis-campo"
                rows={1}
                autoFocus
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void preguntar(texto); }
                }}
                placeholder={pensando ? 'Pensando…' : 'Pregunta lo que quieras de tu negocio…'}
                aria-label="Tu pregunta"
                maxLength={1500}
              />
            )}

            <div className="asis-botones">
              {hayVoz && !grabando && !transcribiendo && (
                <button
                  type="button"
                  className="asis-mic"
                  onClick={() => void empezarVoz()}
                  disabled={pensando}
                  aria-label="Hablar"
                  title="Mandar una nota de voz"
                >
                  <Mic size={18} />
                </button>
              )}
              {grabando || transcribiendo ? (
                <button
                  type="button"
                  className="asis-enviar asis-enviar--voz"
                  onClick={() => terminarVozRef.current(true)}
                  disabled={transcribiendo}
                  aria-label="Terminar y enviar"
                  title="Enviar (Intro)"
                >
                  {transcribiendo ? <Loader2 size={18} className="spin" /> : <Square size={14} fill="currentColor" />}
                </button>
              ) : (
                <button type="submit" className="asis-enviar" disabled={pensando || !texto.trim()} aria-label="Enviar">
                  {pensando ? <Loader2 size={18} className="spin" /> : <ArrowUp size={18} />}
                </button>
              )}
            </div>
          </div>
          <p className="asis-nota">
            <Clock size={11} /> Contesta con tus datos de ahora mismo. Revisa las cifras importantes antes de actuar.
          </p>
        </form>
      </section>
    </div>
  );
}
