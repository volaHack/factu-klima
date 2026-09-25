'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Loader2, RotateCcw, Send } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface Conversacion {
  id: string;
  user_id: string;
  asunto: string;
  estado: 'abierta' | 'cerrada';
  empresa: string | null;
  email: string | null;
  no_leidos_admin: number;
  ultimo_mensaje_en: string;
}
interface Mensaje { id: string; de_admin: boolean; texto: string; pagina: string | null; creado_en: string }

const cuando = (iso: string) => {
  const d = new Date(iso);
  const hoy = new Date().toDateString() === d.toDateString();
  return hoy ? d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) + ', ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
};

export default function BandejaSoporte() {
  const db = useMemo(() => createClient(), []);
  const [filtro, setFiltro] = useState<'abierta' | 'cerrada'>('abierta');
  const [convs, setConvs] = useState<Conversacion[] | null>(null);
  const [activa, setActiva] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState('');
  const lista = useRef<HTMLDivElement>(null);

  const cargarLista = useCallback(async () => {
    const { data, error } = await db.from('soporte_conversaciones').select('*')
      .eq('estado', filtro).order('ultimo_mensaje_en', { ascending: false }).limit(200);
    if (error) { setFallo(error.message); return; }
    setConvs((data ?? []) as Conversacion[]);
  }, [db, filtro]);

  const cargarHilo = useCallback(async (id: string) => {
    const { data } = await db.from('soporte_mensajes').select('id, de_admin, texto, pagina, creado_en')
      .eq('conversacion_id', id).order('creado_en', { ascending: true }).limit(1000);
    setMensajes((data ?? []) as Mensaje[]);
    await db.from('soporte_conversaciones').update({ no_leidos_admin: 0 }).eq('id', id);
  }, [db]);

  useEffect(() => {
    let vivo = true;
    const vuelta = async () => {
      if (!vivo || document.visibilityState !== 'visible') return;
      await cargarLista();
      if (activa) await cargarHilo(activa);
    };
    void vuelta();
    const t = setInterval(vuelta, 10_000);
    return () => { vivo = false; clearInterval(t); };
  }, [cargarLista, cargarHilo, activa]);

  useEffect(() => { lista.current?.scrollTo({ top: lista.current.scrollHeight }); }, [mensajes.length, activa]);

  const conv = convs?.find(c => c.id === activa) ?? null;

  const llamar = async (cuerpo: object) => {
    const r = await fetch('/api/admin/soporte', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error || `Error ${r.status}`);
  };

  const contestar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activa || !texto.trim()) return;
    setEnviando(true); setFallo('');
    try {
      await llamar({ conversacionId: activa, texto: texto.trim() });
      setTexto('');
      await cargarHilo(activa);
      await cargarLista();
    } catch (err) { setFallo(err instanceof Error ? err.message : 'No se ha podido enviar.'); }
    finally { setEnviando(false); }
  };

  const cambiarEstado = async (estado: 'abierta' | 'cerrada') => {
    if (!activa) return;
    try { await llamar({ conversacionId: activa, estado }); setActiva(null); await cargarLista(); }
    catch (err) { setFallo(err instanceof Error ? err.message : 'No se ha podido cambiar.'); }
  };

  return (
    <div className="soporte-admin">
      <div className="apple-card soporte-admin-lista" style={{ padding: 0 }}>
        <div className="apple-filter-bar" style={{ padding: '0.75rem' }}>
          {(['abierta', 'cerrada'] as const).map(f => (
            <button key={f} type="button" className={`apple-filter-chip ${filtro === f ? 'active' : ''}`} onClick={() => { setFiltro(f); setActiva(null); }}>
              {f === 'abierta' ? 'Abiertas' : 'Cerradas'}
            </button>
          ))}
        </div>
        {convs === null ? <p className="soporte-admin-nada"><Loader2 size={16} className="spin" /> Cargando…</p>
          : convs.length === 0 ? <p className="soporte-admin-nada">{filtro === 'abierta' ? 'No hay conversaciones abiertas.' : 'No hay conversaciones cerradas.'}</p>
          : convs.map(c => (
            <button key={c.id} type="button" className={`soporte-admin-conv ${c.id === activa ? 'is-activa' : ''}`} onClick={() => { setActiva(c.id); void cargarHilo(c.id); }}>
              <span className="soporte-admin-quien">
                <strong>{c.empresa || c.email || 'Cuenta sin nombre'}</strong>
                {c.no_leidos_admin > 0 && <span className="apple-pill apple-pill-rose">{c.no_leidos_admin}</span>}
              </span>
              <span className="soporte-admin-asunto">{c.asunto}</span>
              <span className="soporte-admin-cuando">{cuando(c.ultimo_mensaje_en)}{c.email && c.empresa ? ` · ${c.email}` : ''}</span>
            </button>
          ))}
      </div>

      <div className="apple-card soporte-admin-hilo">
        {!conv ? (
          <p className="soporte-admin-nada">Elige una conversación.</p>
        ) : (
          <>
            <div className="soporte-admin-hilo-cabeza">
              <div>
                <strong>{conv.empresa || conv.email}</strong>
                <span>{conv.email}</span>
              </div>
              {conv.estado === 'abierta'
                ? <button type="button" className="apple-btn-secondary" onClick={() => cambiarEstado('cerrada')}><CheckCircle2 size={15} /> Resuelta</button>
                : <button type="button" className="apple-btn-secondary" onClick={() => cambiarEstado('abierta')}><RotateCcw size={15} /> Reabrir</button>}
            </div>
            <div className="soporte-mensajes soporte-admin-mensajes" ref={lista}>
              {mensajes.map(m => (
                <div key={m.id} className={`soporte-msg ${m.de_admin ? 'is-mio' : 'is-admin'}`}>
                  <p>{m.texto}</p>
                  <time dateTime={m.creado_en}>{cuando(m.creado_en)}{!m.de_admin && m.pagina ? ` · en ${m.pagina}` : ''}</time>
                </div>
              ))}
            </div>
            <form className="soporte-escribir" onSubmit={contestar}>
              <textarea rows={3} maxLength={4000} placeholder="Tu respuesta…" value={texto} onChange={e => setTexto(e.target.value)} aria-label="Respuesta"
                onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void contestar(e as unknown as React.FormEvent); } }} />
              <button type="submit" className="soporte-enviar" disabled={!texto.trim() || enviando} aria-label="Enviar respuesta">
                {enviando ? <Loader2 size={17} className="spin" /> : <Send size={17} />}
              </button>
            </form>
          </>
        )}
        {fallo && <p className="soporte-fallo" role="alert">{fallo}</p>}
      </div>
    </div>
  );
}
