'use client';

/**
 * EQUIPO
 *
 * Las personas que trabajan en el negocio y quién está usando el programa
 * ahora mismo. Antes vivía al final de Ajustes y no lo encontraba nadie:
 * ahora tiene su entrada en el menú.
 *
 *  · Trabajando ahora: cada equipo con un perfil puesto, en qué pantalla
 *    está y desde cuándo; la titular puede cerrar una sesión a distancia.
 *  · Personas: alta, rol (titular, empleado, cajero), PIN y actividad.
 */

import { Activity, UsersRound } from 'lucide-react';
import EquipoPerfiles from '@/components/ajustes/EquipoPerfiles';
import SesionesEquipo, { NombreDeEsteEquipo } from '@/components/perfiles/SesionesEquipo';

export default function EquipoPage() {
  return (
    <div className="page equipo-pagina">
      <div className="page-header">
        <div className="page-header-left">
          <p className="page-eyebrow"><UsersRound /> Tu negocio</p>
          <h1 className="page-title">Equipo</h1>
          <p className="page-subtitle">
            Quién trabaja contigo y quién está usando el programa ahora. Cada persona entra con su perfil y su PIN;
            las facturas, los tickets y los cierres de caja quedan a su nombre.
          </p>
        </div>
      </div>

      <section className="card equipo-bloque" aria-labelledby="equipo-ahora">
        <h2 id="equipo-ahora" className="equipo-bloque-titulo"><Activity size={18} /> Trabajando ahora</h2>
        <SesionesEquipo />
        <NombreDeEsteEquipo />
      </section>

      <section className="card equipo-bloque" aria-labelledby="equipo-personas">
        <h2 id="equipo-personas" className="equipo-bloque-titulo"><UsersRound size={18} /> Personas</h2>
        <EquipoPerfiles />
      </section>
    </div>
  );
}
