'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Lock, Users } from 'lucide-react';
import AvatarPerfil from './AvatarPerfil';
import { nombreRol } from '@/lib/perfiles';
import { cerrarPerfil, pedirCambioDePerfil, usePerfiles } from '@/lib/perfilesCliente';

/**
 * Quién está trabajando, a la vista en la cabecera: avatar, nombre y rol.
 * Es lo que responde a «¿quién está usando el panel?» sin abrir nada.
 * Al pulsarlo: cambiar de perfil o cerrar el propio (deja el equipo
 * pidiendo perfil a la siguiente persona).
 */
export default function ChipPerfil({ compacto = false, directo = false }: {
  compacto?: boolean;
  /** Al pulsar abre el selector sin menú intermedio (TPV: cambiar de cajero es lo único que se hace ahí). */
  directo?: boolean;
}) {
  const { enUso, activo } = usePerfiles();
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setAbierto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc); };
  }, [abierto]);

  if (!enUso || !activo) return null;

  return (
    <div className={`perfil-chip ${compacto ? 'perfil-chip--compacto' : ''}`} ref={ref}>
      <button
        type="button"
        className="perfil-chip-boton"
        onClick={() => (directo ? pedirCambioDePerfil() : setAbierto(v => !v))}
        aria-haspopup={directo ? 'dialog' : 'menu'}
        aria-expanded={directo ? undefined : abierto}
        aria-label={`Trabajando como ${activo.nombre}, ${nombreRol(activo.rol)}. Cambiar de perfil`}
        title="Quién está trabajando en este equipo"
      >
        <AvatarPerfil perfil={activo} tam={26} />
        <span className="perfil-chip-texto">
          <span className="perfil-chip-nombre">{activo.nombre}</span>
          <span className="perfil-chip-rol">{nombreRol(activo.rol)}</span>
        </span>
        <ChevronDown size={13} className="perfil-chip-flecha" aria-hidden="true" />
      </button>
      {abierto && (
        <div className="perfil-chip-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => { setAbierto(false); pedirCambioDePerfil(); }}>
            <Users size={15} /> Cambiar de perfil
          </button>
          <button type="button" role="menuitem" onClick={() => { setAbierto(false); cerrarPerfil(); }}>
            <Lock size={15} /> Cerrar mi perfil
          </button>
        </div>
      )}
    </div>
  );
}
