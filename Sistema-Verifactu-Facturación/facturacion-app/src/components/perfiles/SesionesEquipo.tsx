'use client';

import { useCallback, useEffect, useState } from 'react';
import { Laptop, LogOut, MonitorSmartphone, Pencil, RefreshCw, X } from 'lucide-react';
import AvatarPerfil from './AvatarPerfil';
import { haceCuanto, nombreRol } from '@/lib/perfiles';
import { usePerfiles } from '@/lib/perfilesCliente';
import {
  estadoSesion, idDeEsteEquipo, leerSesiones, nombreDeEsteEquipo, olvidarSesion, pedirCierreDeSesion,
  ponerNombreAEsteEquipo, type SesionPerfil,
} from '@/lib/sesionesPerfiles';
import { tituloDePagina } from '@/lib/titulos';

const CADA_MS = 20_000;

interface Lectura {
  sesiones: SesionPerfil[] | null;
  ahora: number;
  esteEquipo: string;
}

/**
 * «¿Quién está usando el panel?»: cada equipo con un perfil puesto, en qué
 * pantalla está y desde cuándo. La titular puede cerrar la sesión de otro
 * equipo (por ejemplo, el mostrador que se quedó abierto por la noche).
 */
export default function SesionesEquipo() {
  const { perfiles, enUso } = usePerfiles();
  const [lectura, setLectura] = useState<Lectura | null>(null);
  const [fallo, setFallo] = useState('');
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const sesiones = await leerSesiones();
      setLectura({ sesiones, ahora: Date.now(), esteEquipo: idDeEsteEquipo() });
      setFallo('');
    } catch (e) {
      setFallo(e instanceof Error ? e.message : 'No se han podido leer las sesiones.');
    }
  }, []);

  useEffect(() => {
    let vivo = true;
    const vuelta = () => { if (vivo && document.visibilityState === 'visible') void cargar(); };
    const primera = setTimeout(vuelta, 0);
    const t = setInterval(vuelta, CADA_MS);
    return () => { vivo = false; clearTimeout(primera); clearInterval(t); };
  }, [cargar]);

  const cerrarDe = async (s: SesionPerfil, inactiva: boolean) => {
    const texto = inactiva
      ? `¿Quitar de la lista la sesión de ${s.perfilNombre} en «${s.equipo}»? Si ese equipo vuelve a usarse, tendrá que elegir perfil.`
      : `¿Cerrar la sesión de ${s.perfilNombre} en «${s.equipo}»? En menos de un minuto ese equipo pedirá elegir perfil otra vez.`;
    if (!window.confirm(texto)) return;
    setOcupado(s.equipoId);
    try {
      // Una sesión sin señales de vida no va a leer el aviso: se marca para
      // que, si vuelve, obedezca, y no se enseña más.
      await pedirCierreDeSesion(s.equipoId);
      if (inactiva) await olvidarSesion(s.equipoId);
      await cargar();
    } catch (e) {
      setFallo(e instanceof Error ? e.message : 'No se ha podido cerrar.');
    } finally {
      setOcupado(null);
    }
  };

  if (!lectura) return <p className="equipo-nota">Mirando quién está trabajando…</p>;

  if (lectura.sesiones === null) {
    return (
      <p className="equipo-nota">
        La lista de sesiones necesita la migración 054 (sesiones_perfiles) en la base de datos. Los perfiles funcionan igual mientras tanto.
      </p>
    );
  }

  const visibles = lectura.sesiones
    .map(s => ({ s, estado: estadoSesion(s.vistoEn, lectura.ahora) }))
    .filter(x => x.estado !== 'caducada' && !x.s.cerrar);

  return (
    <div className="sesiones">
      {fallo && <p className="equipo-error" role="alert">{fallo}</p>}
      {visibles.length === 0 ? (
        <p className="equipo-nota">
          {enUso
            ? 'Ahora mismo no hay nadie trabajando con perfil en ningún equipo.'
            : 'Cuando crees los perfiles, aquí verás quién está trabajando en cada equipo y en qué pantalla.'}
        </p>
      ) : (
        <ul className="equipo-lista">
          {visibles.map(({ s, estado }) => {
            const perfil = perfiles.find(p => p.id === s.perfilId);
            const esEste = s.equipoId === lectura.esteEquipo;
            return (
              <li key={s.equipoId} className={`equipo-fila sesion ${estado === 'inactiva' ? 'is-inactiva' : ''}`}>
                <span className="sesion-avatar">
                  <AvatarPerfil perfil={perfil ?? { nombre: s.perfilNombre, color: '#8b8b93' }} tam={36} />
                  <span className={`sesion-punto ${estado === 'en_linea' ? 'is-en-linea' : ''}`} aria-hidden="true" />
                </span>
                <div className="equipo-fila-texto">
                  <span className="equipo-fila-nombre">
                    {s.perfilNombre}
                    <span className="equipo-fila-detalle">{nombreRol(s.perfilRol)}</span>
                    {esEste && <span className="badge badge-success">Este equipo</span>}
                  </span>
                  <span className="equipo-fila-detalle sesion-detalle">
                    <MonitorSmartphone size={13} aria-hidden="true" /> {s.equipo}
                    {s.pagina && <> · en {tituloDePagina(s.pagina) || s.pagina}</>}
                  </span>
                  <span className="equipo-fila-detalle">
                    {estado === 'en_linea' ? 'Conectado' : `Sin actividad desde ${haceCuanto(s.vistoEn, new Date(lectura.ahora))}`}
                    {' · '}empezó {haceCuanto(s.desde, new Date(lectura.ahora))}
                  </span>
                </div>
                {!esEste && (
                  <div className="equipo-fila-acciones">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={ocupado === s.equipoId}
                      onClick={() => void cerrarDe(s, estado === 'inactiva')}
                      title={estado === 'inactiva' ? 'Quitar de la lista' : 'Cerrar su sesión en ese equipo'}
                    >
                      {estado === 'inactiva' ? <X size={15} /> : <LogOut size={15} />}
                      <span className="sesion-accion-texto">{estado === 'inactiva' ? 'Quitar' : 'Cerrar sesión'}</span>
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <button type="button" className="btn btn-ghost btn-sm sesiones-refrescar" onClick={() => void cargar()}>
        <RefreshCw size={14} /> Actualizar
      </button>
    </div>
  );
}

/** El nombre con el que sale ESTE equipo en la lista («Mostrador», «Oficina»…). */
export function NombreDeEsteEquipo() {
  // Se lee al montar: en el servidor no hay navegador ni localStorage.
  const [nombre, setNombre] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState('');
  useEffect(() => { queueMicrotask(() => setNombre(nombreDeEsteEquipo())); }, []);

  if (nombre === null) return null;

  if (!editando) {
    return (
      <div className="sesion-este">
        <Laptop size={16} aria-hidden="true" />
        <span>Este equipo se llama <strong>{nombre}</strong></span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setBorrador(nombre); setEditando(true); }}>
          <Pencil size={14} /> Cambiar
        </button>
      </div>
    );
  }
  return (
    <form
      className="sesion-este"
      onSubmit={e => {
        e.preventDefault();
        ponerNombreAEsteEquipo(borrador);
        setNombre(nombreDeEsteEquipo());
        setEditando(false);
      }}
    >
      <label className="sr-only" htmlFor="nombre-equipo">Nombre de este equipo</label>
      <input
        id="nombre-equipo"
        className="form-input"
        value={borrador}
        maxLength={60}
        autoFocus
        placeholder="Mostrador, Oficina, Tablet de la barra…"
        onChange={e => setBorrador(e.target.value)}
      />
      <button type="submit" className="btn btn-primary btn-sm">Guardar</button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditando(false)}>Cancelar</button>
    </form>
  );
}
