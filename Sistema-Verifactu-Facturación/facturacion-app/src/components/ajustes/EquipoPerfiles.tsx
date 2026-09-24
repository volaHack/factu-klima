'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Clock, KeyRound, Pencil, Plus, Trash2, UserPlus, X } from 'lucide-react';
import AvatarPerfil from '@/components/perfiles/AvatarPerfil';
import {
  COLORES_PERFIL, haceCuanto, nombreRol, problemaAlBorrar, problemaAlGuardar, ROLES, TEXTO_ACCION, tienePin,
  type Perfil, type RolPerfil,
} from '@/lib/perfiles';
import {
  borrarPerfil, fijarMinutosDeBloqueo, guardarPerfil, leerActividad, minutosDeBloqueo, usePerfiles,
  type ApunteLeido,
} from '@/lib/perfilesCliente';

const OPCIONES_BLOQUEO = [
  { min: 0, texto: 'Nunca' },
  { min: 5, texto: 'Tras 5 min sin uso' },
  { min: 15, texto: 'Tras 15 min sin uso' },
  { min: 30, texto: 'Tras 30 min sin uso' },
  { min: 60, texto: 'Tras 1 h sin uso' },
];

interface Borrador {
  perfil: Perfil;
  /** undefined = no tocar el PIN · '' = quitarlo · cifras = el nuevo. */
  pin?: string;
  nuevo: boolean;
}

const nuevoPerfil = (rol: RolPerfil, n: number, nombre = ''): Perfil => ({
  id: crypto.randomUUID(), nombre, rol, color: COLORES_PERFIL[n % COLORES_PERFIL.length], activo: true,
});

/**
 * AJUSTES → EQUIPO
 *
 * Quién trabaja en el negocio. El primer perfil es siempre el del
 * titular; después, los empleados y cajeros. Cada uno con su PIN si se
 * quiere que nadie use el perfil de otro.
 */
export default function EquipoPerfiles() {
  const { cargado, disponible, almacen, perfiles, activo } = usePerfiles();
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  // Es un ajuste de ESTE equipo (localStorage); Ajustes sólo se pinta en cliente.
  const [bloqueo, setBloqueo] = useState(() => minutosDeBloqueo());
  const [actividad, setActividad] = useState<ApunteLeido[] | null>(null);

  useEffect(() => {
    if (!disponible || perfiles.length === 0) return;
    let vivo = true;
    void leerActividad({ limite: 25 }).then(a => { if (vivo) setActividad(a); });
    return () => { vivo = false; };
  }, [disponible, perfiles.length]);

  if (!cargado) return <p className="equipo-nota">Cargando el equipo…</p>;

  if (!disponible) {
    return (
      <div className="equipo-vacio">
        <p><strong>No se ha podido cargar el equipo.</strong></p>
        <p className="equipo-nota">
          Hace falta conexión la primera vez. Mientras tanto todo funciona como siempre, con un único usuario.
        </p>
      </div>
    );
  }

  const guardar = async () => {
    if (!borrador) return;
    // El PIN: cifras = uno nuevo; vacío = sin tocar, salvo que se haya
    // pulsado «Quitar PIN» (o no tuviera), que entonces queda sin PIN.
    const pinParam = borrador.pin ? borrador.pin : (tienePin(borrador.perfil) ? undefined : '');
    const problema = problemaAlGuardar(perfiles, borrador.perfil, borrador.pin);
    if (problema) { setError(problema); return; }
    setGuardando(true);
    setError('');
    try {
      // El primer perfil (el del titular) se pone en uso al crearlo: quien
      // lo está creando es esa persona, y así no se le pide nada al momento.
      await guardarPerfil(borrador.perfil, pinParam, { activar: perfiles.length === 0 });
      setBorrador(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se ha podido guardar.');
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async (p: Perfil) => {
    const problema = problemaAlBorrar(perfiles, p.id);
    if (problema) { setError(problema); return; }
    if (!window.confirm(`¿Borrar el perfil de ${p.nombre}? Lo que hizo seguirá en el historial con su nombre.`)) return;
    try { await borrarPerfil(p.id); } catch (e) { setError(e instanceof Error ? e.message : 'No se ha podido borrar.'); }
  };

  // --- Sin perfiles todavía: presentación y alta del titular ---
  if (perfiles.length === 0 && !borrador) {
    return (
      <div className="equipo-vacio">
        <p>
          Si en tu negocio trabaja más gente, dale a cada persona su perfil. En cada equipo se elige quién está
          trabajando, la cabecera lo enseña, y las facturas, tickets y cierres de caja quedan a su nombre.
        </p>
        <ul className="equipo-roles">
          {ROLES.map(r => <li key={r.id}><strong>{r.nombre}.</strong> {r.explica}</li>)}
        </ul>
        <button type="button" className="btn btn-primary" onClick={() => setBorrador({ perfil: nuevoPerfil('titular', 0), nuevo: true, pin: '' })}>
          <UserPlus size={16} /> Empezar: crear mi perfil de titular
        </button>
      </div>
    );
  }

  return (
    <div className="equipo">
      {error && <p className="equipo-error" role="alert">{error}</p>}

      {borrador ? (
        <FormularioPerfil
          borrador={borrador}
          primero={perfiles.length === 0}
          guardando={guardando}
          onCambio={b => { setError(''); setBorrador(b); }}
          onGuardar={guardar}
          onCancelar={() => { setError(''); setBorrador(null); }}
        />
      ) : (
        <>
          <ul className="equipo-lista">
            {perfiles.map(p => (
              <li key={p.id} className={`equipo-fila ${p.activo ? '' : 'is-inactivo'}`}>
                <AvatarPerfil perfil={p} tam={36} />
                <div className="equipo-fila-texto">
                  <span className="equipo-fila-nombre">
                    {p.nombre}
                    {activo?.id === p.id && <span className="badge badge-success">En este equipo</span>}
                    {!p.activo && <span className="badge badge-neutral">Desactivado</span>}
                  </span>
                  <span className="equipo-fila-detalle">
                    {nombreRol(p.rol)} · {tienePin(p) ? 'con PIN' : 'sin PIN'}
                    {p.rol === 'titular' && !tienePin(p) && <span className="equipo-aviso"> · ponle un PIN para que nadie más lo use</span>}
                  </span>
                </div>
                <div className="equipo-fila-acciones">
                  <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setBorrador({ perfil: { ...p }, nuevo: false })} aria-label={`Editar a ${p.nombre}`} title="Editar">
                    <Pencil size={15} />
                  </button>
                  <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => void borrar(p)} aria-label={`Borrar a ${p.nombre}`} title="Borrar">
                    <Trash2 size={15} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-secondary" onClick={() => setBorrador({ perfil: nuevoPerfil('empleado', perfiles.length), nuevo: true, pin: '' })}>
            <Plus size={16} /> Añadir persona
          </button>

          <div className="equipo-bloqueo">
            <label className="form-label" htmlFor="equipo-bloqueo">Pedir el perfil otra vez en este equipo</label>
            <select
              id="equipo-bloqueo"
              className="form-select"
              value={bloqueo}
              onChange={e => { const v = Number(e.target.value); setBloqueo(v); fijarMinutosDeBloqueo(v); }}
            >
              {OPCIONES_BLOQUEO.map(o => <option key={o.min} value={o.min}>{o.texto}</option>)}
            </select>
            <p className="equipo-nota">Útil en un mostrador compartido: si alguien se va sin cerrar su perfil, el siguiente tiene que elegir el suyo.</p>
          </div>

          <div className="equipo-actividad">
            <h3 className="equipo-subtitulo"><Clock size={15} /> Actividad reciente</h3>
            {almacen === 'cuenta' && (
              <p className="equipo-nota">De este equipo. Cada dispositivo guarda lo que se ha hecho en él.</p>
            )}
            {actividad === null ? (
              <p className="equipo-nota">Cargando…</p>
            ) : actividad.length === 0 ? (
              <p className="equipo-nota">Todavía no hay nada apuntado.</p>
            ) : (
              <ul className="equipo-actividad-lista">
                {actividad.map(a => {
                  const perfil = perfiles.find(p => p.id === a.perfilId);
                  return (
                    <li key={a.id}>
                      <AvatarPerfil perfil={perfil ?? { nombre: a.perfilNombre, color: '#8b8b93' }} tam={24} />
                      <span className="equipo-actividad-texto">
                        <strong>{a.perfilNombre}</strong> {TEXTO_ACCION[a.accion].toLowerCase()}
                        {a.detalle && (a.accion === 'factura_emitida' && a.documentoId
                          ? <> <Link href={`/facturas/${a.documentoId}`}>{a.detalle}</Link></>
                          : <> · {a.detalle}</>)}
                      </span>
                      <time dateTime={a.en}>{haceCuanto(a.en)}</time>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function FormularioPerfil({
  borrador, primero, guardando, onCambio, onGuardar, onCancelar,
}: {
  borrador: Borrador;
  primero: boolean;
  guardando: boolean;
  onCambio: (b: Borrador) => void;
  onGuardar: () => void;
  onCancelar: () => void;
}) {
  const { perfil, pin, nuevo } = borrador;
  const cambiar = (parcial: Partial<Perfil>) => onCambio({ ...borrador, perfil: { ...perfil, ...parcial } });
  const conPin = tienePin(perfil);

  return (
    <form className="equipo-form" onSubmit={e => { e.preventDefault(); onGuardar(); }}>
      <div className="equipo-form-cabeza">
        <AvatarPerfil perfil={{ nombre: perfil.nombre || '?', color: perfil.color }} tam={44} />
        <h3>{primero ? 'Tu perfil de titular' : nuevo ? 'Nueva persona' : `Editar a ${perfil.nombre}`}</h3>
      </div>

      <div className="form-group">
        <label className="form-label required" htmlFor="perfil-nombre">Nombre</label>
        <input id="perfil-nombre" className="form-input" value={perfil.nombre} maxLength={60} autoFocus
          onChange={e => cambiar({ nombre: e.target.value })} placeholder="Como le llamáis en el negocio" />
      </div>

      {!primero && (
        <fieldset className="equipo-form-roles">
          <legend className="form-label">Qué hace</legend>
          {ROLES.map(r => (
            <label key={r.id} className={`equipo-rol ${perfil.rol === r.id ? 'is-activo' : ''}`}>
              <input type="radio" name="perfil-rol" checked={perfil.rol === r.id} onChange={() => cambiar({ rol: r.id })} />
              <span><strong>{r.nombre}</strong><small>{r.explica}</small></span>
            </label>
          ))}
        </fieldset>
      )}

      <div className="form-group">
        <span className="form-label">Color</span>
        <div className="equipo-colores" role="radiogroup" aria-label="Color del perfil">
          {COLORES_PERFIL.map(c => (
            <button key={c} type="button" role="radio" aria-checked={perfil.color === c} aria-label={`Color ${c}`}
              className={`equipo-color ${perfil.color === c ? 'is-activo' : ''}`} style={{ background: c }}
              onClick={() => cambiar({ color: c })}>
              {perfil.color === c && <Check size={14} />}
            </button>
          ))}
        </div>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="perfil-pin"><KeyRound size={13} /> PIN {conPin && pin === undefined ? '(tiene uno)' : '(opcional)'}</label>
        {conPin && pin === undefined ? (
          <div className="equipo-pin-acciones">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onCambio({ ...borrador, pin: '' })}>Cambiar PIN</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onCambio({ ...borrador, perfil: { ...perfil, pinHash: null, pinSal: null }, pin: '' })}>
              <X size={14} /> Quitar PIN
            </button>
          </div>
        ) : (
          <input id="perfil-pin" className="form-input equipo-pin" inputMode="numeric" autoComplete="off" type="password"
            value={pin ?? ''} maxLength={6} placeholder="4 a 6 cifras"
            onChange={e => onCambio({ ...borrador, pin: e.target.value.replace(/\D/g, '').slice(0, 6) })} />
        )}
        <p className="equipo-nota">Se pide al elegir este perfil. {perfil.rol === 'titular' ? 'Recomendado para el titular: sin PIN, cualquiera podría entrar como tú.' : ''}</p>
      </div>

      {!primero && (
        <label className="field-check">
          <input type="checkbox" checked={perfil.activo} onChange={e => cambiar({ activo: e.target.checked })} />
          Perfil activo <span className="equipo-nota">(desactívalo si alguien deja de trabajar; su historial se conserva)</span>
        </label>
      )}

      <div className="equipo-form-acciones">
        <button type="submit" className="btn btn-primary" disabled={guardando}>
          {guardando ? 'Guardando…' : primero ? 'Crear y empezar a usarlo' : 'Guardar'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancelar} disabled={guardando}>Cancelar</button>
      </div>
    </form>
  );
}
