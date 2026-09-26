'use client';

import { useEffect, useState } from 'react';
import { Download, Landmark, Link2, Loader2, Unlink } from 'lucide-react';
import type { Extracto } from '@/lib/banco/extracto';

interface Conexion {
  id: string;
  banco: string;
  cuentas: { uid: string; iban: string | null; nombre: string | null }[];
  validoHasta: string | null;
  ultimaLectura: string | null;
  caducada: boolean;
}

const hoy = () => new Date().toISOString().slice(0, 10);
const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

/**
 * EL BANCO CONECTADO, EN LA CONCILIACIÓN
 *
 * En vez de descargar el Norma 43 de la banca online y subirlo, el negocio
 * da permiso una vez en la web de su banco (PSD2, hasta 180 días) y desde
 * entonces «Traer movimientos» los pone aquí, listos para conciliar.
 *
 * Si la plataforma no tiene la conexión con bancos configurada, no se
 * enseña nada: la pantalla queda como siempre, con el fichero.
 */
export default function BancoConectado({ onExtracto, avisar }: {
  onExtracto: (e: Extracto) => void;
  avisar: (tipo: 'ok' | 'error', titulo: string, texto?: string) => void;
}) {
  const [estado, setEstado] = useState<{ disponible: boolean; conexiones: Conexion[] } | null>(null);
  const [bancos, setBancos] = useState<{ nombre: string; logo: string | null }[] | null>(null);
  const [elegido, setElegido] = useState('');
  const [empresa, setEmpresa] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargar = () => fetch('/api/banco').then(r => r.json()).then(setEstado).catch(() => setEstado(null));

  useEffect(() => {
    let vivo = true;
    fetch('/api/banco').then(r => r.json()).then(d => { if (vivo) setEstado(d); }).catch(() => {});
    // Vuelta desde la web del banco.
    const vuelta = new URLSearchParams(window.location.search).get('banco');
    if (vuelta) {
      if (vuelta === 'conectado') avisar('ok', 'Banco conectado', 'Ya puedes traer los movimientos.');
      else if (vuelta === 'cancelado') avisar('error', 'No se ha conectado', 'Se canceló el permiso en la web del banco.');
      else avisar('error', 'No se ha podido conectar el banco', 'Inténtalo otra vez en un momento.');
      window.history.replaceState(null, '', window.location.pathname);
    }
    return () => { vivo = false; };
  }, [avisar]);

  if (!estado?.disponible) return null;

  const verBancos = async () => {
    if (bancos) return;
    setOcupado('lista');
    try {
      const d = await fetch('/api/banco/bancos').then(r => r.json());
      setBancos(d.bancos ?? []);
    } catch { avisar('error', 'No se ha podido cargar la lista de bancos'); } finally { setOcupado(null); }
  };

  const conectar = async () => {
    if (!elegido) return;
    setOcupado('conectar');
    try {
      const r = await fetch('/api/banco/conectar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ banco: elegido, empresa }) });
      const d = await r.json();
      if (!r.ok || !d.url) throw new Error(d.error || 'No se ha podido conectar.');
      window.location.href = d.url;
    } catch (e) {
      avisar('error', 'No se ha podido conectar el banco', e instanceof Error ? e.message : '');
      setOcupado(null);
    }
  };

  const traer = async (c: Conexion, uid: string) => {
    setOcupado(uid);
    try {
      const r = await fetch('/api/banco/movimientos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conexionId: c.id, cuenta: uid }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se han podido traer los movimientos.');
      onExtracto({ formato: 'banco', cuenta: d.cuenta ?? undefined, desde: d.desde, hasta: hoy(), movimientos: d.movimientos });
      void cargar();
    } catch (e) {
      avisar('error', 'No se han podido traer los movimientos', e instanceof Error ? e.message : '');
    } finally {
      setOcupado(null);
    }
  };

  const desconectar = async (c: Conexion) => {
    if (!confirm(`¿Desconectar ${c.banco}? Dejarán de llegar sus movimientos.`)) return;
    setOcupado(c.id);
    await fetch(`/api/banco?id=${c.id}`, { method: 'DELETE' }).catch(() => {});
    await cargar();
    setOcupado(null);
  };

  return (
    <section className="card banco-conectado">
      <h2 className="banco-conectado-titulo"><Landmark size={18} /> Tu banco, conectado</h2>
      {estado.conexiones.length === 0 ? (
        <>
          <p className="banco-nota" style={{ marginTop: 0 }}>
            Da permiso una vez en la web de tu banco y los movimientos llegan aquí con un clic, sin descargar ficheros.
            Es de solo lectura: nadie puede mover dinero con este permiso. Dura hasta 180 días y lo puedes quitar cuando quieras.
          </p>
          {bancos === null ? (
            <button type="button" className="btn btn-primary" onClick={verBancos} disabled={ocupado === 'lista'}>
              {ocupado === 'lista' ? <Loader2 size={16} className="spin" /> : <Link2 size={16} />} Conectar mi banco
            </button>
          ) : (
            <div className="banco-conectado-form">
              <label className="sr-only" htmlFor="banco-elegido">Tu banco</label>
              <select id="banco-elegido" className="form-select" value={elegido} onChange={e => setElegido(e.target.value)}>
                <option value="">Elige tu banco…</option>
                {bancos.map(b => <option key={b.nombre} value={b.nombre}>{b.nombre}</option>)}
              </select>
              <label className="field-check"><input type="checkbox" checked={empresa} onChange={e => setEmpresa(e.target.checked)} /> Es una cuenta de empresa o autónomo</label>
              <button type="button" className="btn btn-primary" onClick={conectar} disabled={!elegido || ocupado === 'conectar'}>
                {ocupado === 'conectar' ? <Loader2 size={16} className="spin" /> : <Link2 size={16} />} Ir a la web del banco
              </button>
            </div>
          )}
        </>
      ) : (
        <ul className="banco-conectado-lista">
          {estado.conexiones.map(c => (
            <li key={c.id}>
              <div className="banco-conectado-cabeza">
                <strong>{c.banco}</strong>
                <span className="banco-nota">
                  {c.caducada ? 'El permiso ha caducado: vuelve a conectarlo.' : c.validoHasta ? `Permiso hasta el ${fecha(c.validoHasta)}` : ''}
                  {c.ultimaLectura ? ` · última lectura ${fecha(c.ultimaLectura)}` : ''}
                </span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void desconectar(c)} disabled={ocupado === c.id}>
                  <Unlink size={14} /> Desconectar
                </button>
              </div>
              {!c.caducada && c.cuentas.map(cu => (
                <div key={cu.uid} className="banco-conectado-cuenta">
                  <span className="mono">{cu.iban ?? cu.nombre ?? 'Cuenta'}</span>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => void traer(c, cu.uid)} disabled={ocupado === cu.uid}>
                    {ocupado === cu.uid ? <Loader2 size={14} className="spin" /> : <Download size={14} />} Traer movimientos
                  </button>
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
