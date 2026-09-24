'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ShieldOff, Users } from 'lucide-react';
import SelectorPerfil from './SelectorPerfil';
import { inicioDe, nombreRol, puedeEntrar, type Perfil } from '@/lib/perfiles';
import {
  cerrarPerfil, EVENTO_CAMBIAR_PERFIL, minutosDeBloqueo, pedirCambioDePerfil, usePerfiles,
} from '@/lib/perfilesCliente';

/**
 * Quién está delante del equipo, en todas las pantallas.
 *
 *  · Si la cuenta usa perfiles y aquí no hay ninguno elegido, se pide.
 *  · Si se configuró el bloqueo, tras ese rato sin tocar nada se cierra
 *    el perfil y se vuelve a pedir: el mostrador no se queda abierto a
 *    nombre de quien se fue.
 *  · Un cajero fuera del TPV vuelve al TPV.
 *
 * Si la cuenta no usa perfiles, no hace nada: la app es la de siempre.
 */
export default function ControlPerfiles() {
  const { cargado, enUso, activo } = usePerfiles();
  const pathname = usePathname();
  const router = useRouter();
  const [pedido, setPedido] = useState(false);

  useEffect(() => {
    const abrir = () => setPedido(true);
    window.addEventListener(EVENTO_CAMBIAR_PERFIL, abrir);
    return () => window.removeEventListener(EVENTO_CAMBIAR_PERFIL, abrir);
  }, []);

  // Bloqueo por inactividad (por equipo, se configura en Ajustes → Equipo).
  useEffect(() => {
    if (!activo) return;
    const min = minutosDeBloqueo();
    if (!min) return;
    let t: ReturnType<typeof setTimeout>;
    const reiniciar = () => { clearTimeout(t); t = setTimeout(() => cerrarPerfil(), min * 60_000); };
    const eventos = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    eventos.forEach(e => window.addEventListener(e, reiniciar, { passive: true }));
    reiniciar();
    return () => { clearTimeout(t); eventos.forEach(e => window.removeEventListener(e, reiniciar)); };
  }, [activo]);

  useEffect(() => {
    if (activo?.rol === 'cajero' && !puedeEntrar('cajero', pathname)) router.replace('/tpv');
  }, [activo, pathname, router]);

  if (!cargado || !enUso) return null;
  const obligatorio = !activo;
  if (!obligatorio && !pedido) return null;

  const alElegir = (p: Perfil) => {
    setPedido(false);
    if (!puedeEntrar(p.rol, pathname)) router.push(inicioDe(p.rol));
  };

  return <SelectorPerfil obligatorio={obligatorio} onCerrar={() => setPedido(false)} onElegido={alElegir} />;
}

/** Lo que ve un perfil que ha llegado a una pantalla que no es de su rol. */
export function SinAcceso({ perfil }: { perfil: Perfil }) {
  const router = useRouter();
  return (
    <div className="perfil-sin-acceso">
      <span className="perfil-sin-acceso-icono"><ShieldOff size={26} /></span>
      <h1>Esta sección no es de tu perfil</h1>
      <p>
        Estás trabajando como <strong>{perfil.nombre}</strong> ({nombreRol(perfil.rol).toLowerCase()}).
        Los ajustes, los informes y lo fiscal los lleva el titular de la cuenta.
      </p>
      <div className="perfil-sin-acceso-acciones">
        <button type="button" className="btn btn-primary" onClick={() => router.push(inicioDe(perfil.rol))}>
          Ir a mi inicio
        </button>
        <button type="button" className="btn btn-secondary" onClick={pedirCambioDePerfil}>
          <Users size={15} /> Cambiar de perfil
        </button>
      </div>
    </div>
  );
}
