'use client';

import Link from 'next/link';
import { Plus, ShieldCheck } from 'lucide-react';
import CategoryIcon from '@/components/ui/CategoryIcon';

export interface CabeceraPanelProps {
  readonly nombre: string;
  readonly sector: { readonly label: string; readonly icon: string };
  /** Fecha de hoy ya escrita («lunes, 5 de octubre»). */
  readonly fecha: string;
  /** Número que llevará la próxima factura. */
  readonly siguiente: string;
  readonly plan: string;
  readonly sellado: boolean;
}

/**
 * La banda de arriba del panel: de quién es, qué día es y el botón que
 * más se pulsa. Antes eran dos tarjetas (identidad y plan) que se comían
 * la primera pantalla del móvil sin decir nada que se pudiera hacer.
 */
export default function CabeceraPanel({ nombre, sector, fecha, siguiente, plan, sellado }: CabeceraPanelProps) {
  return (
    <header className="cabecera-panel">
      <div className="cabecera-panel-texto">
        <p className="cabecera-panel-ceja">
          <CategoryIcon name={sector.icon} size={14} />
          <span>{sector.label}</span>
          <span className="cabecera-panel-sep" aria-hidden="true" />
          <span className="cabecera-panel-fecha">{fecha}</span>
        </p>
        <h1 className="cabecera-panel-nombre">{nombre}</h1>
        <ul className="cabecera-panel-datos">
          <li>
            <span className="cabecera-panel-dato-etiqueta">Siguiente</span>
            <span className="cabecera-panel-dato-valor mono">{siguiente}</span>
          </li>
          <li>
            <Link href="/precios" className="cabecera-panel-dato-enlace">
              <span className="cabecera-panel-dato-etiqueta">Plan</span>
              <span className="cabecera-panel-dato-valor">{plan}</span>
            </Link>
          </li>
          {sellado && (
            <li className="cabecera-panel-sello" title="Cada factura lleva su huella SHA-256 encadenada a la anterior">
              <ShieldCheck size={14} aria-hidden="true" />
              <span className="cabecera-panel-dato-valor">Facturas selladas</span>
            </li>
          )}
        </ul>
      </div>
      <Link href="/facturas/nueva" className="btn btn-primary btn-lg cabecera-panel-cta">
        <Plus size={16} />
        Nueva factura
      </Link>
    </header>
  );
}
