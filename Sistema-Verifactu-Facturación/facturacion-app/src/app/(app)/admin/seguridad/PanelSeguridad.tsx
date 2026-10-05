'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Ban, ChevronDown, ChevronUp, ShieldCheck, Unlock } from 'lucide-react';
import type { PanelSeguridad as Datos, FilaEvento } from '@/lib/seguridad/leer';

const cuando = (iso: string) => new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Lo que significa cada tipo, en cristiano. */
const QUE_ES: Record<string, string> = {
  escaneo: 'Robot buscando ficheros con fallos conocidos',
  traversal: 'Intento de leer ficheros del servidor',
  log4shell: 'Ataque Log4Shell',
  ssrf: 'Intento de usar el servidor contra la red interna',
  sqli: 'Inyección SQL',
  xss: 'Inyección de código en la página (XSS)',
  comando: 'Intento de ejecutar comandos',
  plantilla: 'Inyección en plantillas',
  byte_nulo: 'Byte nulo en la dirección',
  admin_acceso_denegado: 'Alguien sin permiso intentó entrar al panel de administración',
  admin_sin_2fa: 'Administrador sin verificación en dos pasos',
  firma_webhook_invalida: 'Aviso de Stripe con firma falsa',
  pago_factura_ajena: 'Pago dirigido a una factura de otra empresa',
  secreto_invalido: 'Llamada al buzón con la clave equivocada',
  cron_no_autorizado: 'Llamada a una tarea programada sin la clave',
  token_invalido: 'Enlace público inventado o caducado',
  manipulacion_peticion: 'Petición manipulada a mano',
  banco_vuelta_ajena: 'Vuelta del banco en otra cuenta (posible robo de conexión)',
  empresa_ajena: 'Intento de entrar en una empresa ajena',
  codigo_vinculo_invalido: 'Código de vinculación de empresa erróneo',
  limite_superado: 'Demasiados intentos seguidos',
  ip_bloqueada: 'IP bloqueada',
};

const PILDORA: Record<string, string> = { alta: 'apple-pill-rose', media: 'apple-pill-amber', baja: 'apple-pill-slate' };

export default function PanelSeguridad({ datos }: { datos: Datos }) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<'todas' | 'alta' | 'media' | 'baja'>('todas');
  const [ipFiltro, setIpFiltro] = useState('');
  const [abierto, setAbierto] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [nuevaIp, setNuevaIp] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);

  const bloqueadas = useMemo(() => new Set(datos.bloqueadas.map(b => b.ip)), [datos.bloqueadas]);
  const visibles = datos.eventos.filter(e => (filtro === 'todas' || e.gravedad === filtro) && (!ipFiltro || e.ip === ipFiltro));

  const accion = async (accion: 'bloquear' | 'desbloquear', ip: string, motivo?: string) => {
    if (accion === 'bloquear' && !confirm(`¿Bloquear ${ip}? No podrá abrir ninguna página del programa.`)) return;
    setOcupado(ip);
    setMensaje(null);
    try {
      const r = await fetch('/api/admin/seguridad', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion, ip, motivo }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setMensaje(j.error ?? 'No se ha podido hacer.');
      else { setNuevaIp(''); router.refresh(); }
    } finally { setOcupado(null); }
  };

  const tarjeta = (titulo: string, valor: number, color: string) => (
    <div className="apple-card" style={{ flex: '1 1 160px' }}>
      <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>{titulo}</div>
      <div style={{ fontSize: '1.75rem', fontWeight: 700, color }}>{valor}</div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        {tarjeta('Graves (24 h)', datos.ultimas24h.alta, datos.ultimas24h.alta ? '#e11d48' : 'var(--text-primary)')}
        {tarjeta('Sospechosos (24 h)', datos.ultimas24h.media, datos.ultimas24h.media ? '#d97706' : 'var(--text-primary)')}
        {tarjeta('Leves (24 h)', datos.ultimas24h.baja, 'var(--text-primary)')}
        {tarjeta('IPs bloqueadas', datos.bloqueadas.length, 'var(--text-primary)')}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', gap: '1rem' }}>
        <div className="apple-card" style={{ padding: 0 }}>
          <div style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>IPs con más actividad sospechosa</div>
          {datos.ipsMasActivas.length === 0 ? (
            <p style={{ padding: '1.5rem 1rem', margin: 0, color: 'var(--text-tertiary)', textAlign: 'center' }}>Ninguna.</p>
          ) : (
            <div className="table-responsive">
              <table className="apple-table">
                <thead><tr><th>IP</th><th style={{ textAlign: 'right' }}>Eventos</th><th style={{ textAlign: 'right' }}>Graves</th><th>Última</th><th><span className="sr-only">Acciones</span></th></tr></thead>
                <tbody>
                  {datos.ipsMasActivas.map(g => (
                    <tr key={g.ip}>
                      <td style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.8125rem' }}>
                        <button type="button" onClick={() => setIpFiltro(ipFiltro === g.ip ? '' : g.ip)} title="Ver sólo los eventos de esta IP" style={{ background: 'none', border: 0, padding: 0, color: 'var(--accent-500)', cursor: 'pointer', font: 'inherit' }}>{g.ip}</button>
                        <div style={{ fontFamily: 'inherit', fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>{g.tipos.slice(0, 3).join(', ')}{g.tipos.length > 3 ? '…' : ''}</div>
                      </td>
                      <td style={{ textAlign: 'right' }}>{g.veces}</td>
                      <td style={{ textAlign: 'right' }}>{g.altas}</td>
                      <td style={{ fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>{cuando(g.ultima)}</td>
                      <td>
                        {bloqueadas.has(g.ip)
                          ? <span className="apple-pill apple-pill-rose">Bloqueada</span>
                          : <button type="button" className="apple-btn-secondary" disabled={ocupado === g.ip} onClick={() => accion('bloquear', g.ip, `Bloqueada a mano: ${g.veces} eventos (${g.tipos.join(', ')})`.slice(0, 300))} style={{ whiteSpace: 'nowrap' }}><Ban size={14} /> Bloquear</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="apple-card" style={{ padding: 0 }}>
          <div style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>IPs bloqueadas</div>
          <form
            onSubmit={ev => { ev.preventDefault(); if (nuevaIp.trim()) void accion('bloquear', nuevaIp.trim()); }}
            style={{ display: 'flex', gap: 8, padding: '0 1rem 0.75rem', flexWrap: 'wrap' }}
          >
            <input className="form-input" value={nuevaIp} onChange={e => setNuevaIp(e.target.value)} placeholder="Bloquear una IP a mano (p. ej. 203.0.113.7)" aria-label="IP a bloquear" style={{ flex: '1 1 200px' }} />
            <button type="submit" className="apple-btn-secondary" disabled={!nuevaIp.trim() || ocupado !== null}><Ban size={14} /> Bloquear</button>
          </form>
          {mensaje && <p role="alert" style={{ margin: '0 1rem 0.75rem', color: '#e11d48', fontSize: '0.8125rem' }}>{mensaje}</p>}
          {datos.bloqueadas.length === 0 ? (
            <p style={{ padding: '1rem', margin: 0, color: 'var(--text-tertiary)', textAlign: 'center' }}>Ninguna IP bloqueada.</p>
          ) : (
            <div className="table-responsive">
              <table className="apple-table">
                <thead><tr><th>IP</th><th>Motivo</th><th>Hasta</th><th><span className="sr-only">Acciones</span></th></tr></thead>
                <tbody>
                  {datos.bloqueadas.map(b => (
                    <tr key={b.ip}>
                      <td style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.8125rem' }}>{b.ip}</td>
                      <td style={{ fontSize: '0.8125rem', overflowWrap: 'anywhere' }}>
                        <span className={`apple-pill ${b.automatico ? 'apple-pill-purple' : 'apple-pill-blue'}`} style={{ marginRight: 6 }}>{b.automatico ? 'automático' : 'a mano'}</span>
                        {b.motivo}
                      </td>
                      <td style={{ fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>{b.hasta ? cuando(b.hasta) : 'Indefinido'}</td>
                      <td>
                        <button type="button" className="apple-btn-secondary" disabled={ocupado === b.ip} onClick={() => accion('desbloquear', b.ip)} style={{ whiteSpace: 'nowrap' }}><Unlock size={14} /> Desbloquear</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="apple-card" style={{ padding: 0 }}>
        <div className="apple-filter-bar" style={{ padding: '0.75rem 1rem', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontWeight: 600 }}>
            Eventos{ipFiltro && <> de <span style={{ fontFamily: 'var(--font-mono, monospace)' }}>{ipFiltro}</span> <button type="button" onClick={() => setIpFiltro('')} style={{ background: 'none', border: 0, color: 'var(--accent-500)', cursor: 'pointer' }}>(ver todos)</button></>}
          </span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(['todas', 'alta', 'media', 'baja'] as const).map(f => (
              <button key={f} type="button" onClick={() => setFiltro(f)} className={`apple-pill ${filtro === f ? 'apple-pill-blue' : 'apple-pill-slate'}`} style={{ border: 0, cursor: 'pointer' }}>
                {f === 'todas' ? 'Todos' : f === 'alta' ? 'Graves' : f === 'media' ? 'Sospechosos' : 'Leves'}
              </button>
            ))}
          </div>
        </div>
        {visibles.length === 0 ? (
          <p style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--text-tertiary)', margin: 0, display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center' }}>
            <ShieldCheck size={16} /> Nada raro.
          </p>
        ) : (
          <div className="table-responsive">
            <table className="apple-table">
              <thead><tr><th>Cuándo</th><th>Qué</th><th>IP</th><th>Dónde</th><th>Cuenta</th></tr></thead>
              <tbody>
                {visibles.map((e: FilaEvento) => (
                  <tr key={e.id}>
                    <td style={{ fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>{cuando(e.creado_en)}</td>
                    <td style={{ maxWidth: 420 }}>
                      <span className={`apple-pill ${PILDORA[e.gravedad]}`} style={{ marginRight: 6 }}>{e.tipo}</span>
                      <span style={{ fontSize: '0.8125rem' }}>{QUE_ES[e.tipo] ?? ''}</span>
                      {(e.detalle || e.navegador) && (
                        <button type="button" onClick={() => setAbierto(abierto === e.id ? null : e.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, marginLeft: 6, background: 'none', border: 0, color: 'var(--accent-500)', cursor: 'pointer', fontSize: '0.75rem' }}>
                          {abierto === e.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />} detalle
                        </button>
                      )}
                      {abierto === e.id && (
                        <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: '0.7rem', background: 'var(--bg-tertiary)', padding: 8, borderRadius: 8, marginTop: 6, maxHeight: 240, overflow: 'auto' }}>
                          {JSON.stringify({ ...(e.detalle ?? {}), navegador: e.navegador ?? undefined }, null, 2)}
                        </pre>
                      )}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>
                      {e.ip ? <button type="button" onClick={() => setIpFiltro(e.ip!)} style={{ background: 'none', border: 0, padding: 0, color: 'inherit', cursor: 'pointer', font: 'inherit' }}>{e.ip}</button> : '—'}
                      {e.ip && bloqueadas.has(e.ip) && <Ban size={12} style={{ marginLeft: 4, color: '#e11d48' }} aria-label="bloqueada" />}
                    </td>
                    <td style={{ fontSize: '0.8125rem', fontFamily: 'var(--font-mono, monospace)', maxWidth: 260, overflowWrap: 'anywhere' }}>{e.ruta ?? '—'}</td>
                    <td style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono, monospace)' }}>
                      {e.user_id ? <a href={`/admin/cuentas/${e.user_id}`}>{e.user_id.slice(0, 8)}…</a> : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
