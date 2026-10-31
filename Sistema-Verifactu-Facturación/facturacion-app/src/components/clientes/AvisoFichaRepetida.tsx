'use client';

import Link from 'next/link';
import type { Ref } from 'react';
import { Users } from 'lucide-react';
import { nombreEnAviso, type FichaComparable, type FichaParecida } from '@/lib/clienteRepetido';

/**
 * «Ya tienes a Bar Pepe S.L. (B35…) · Abrir su ficha / Crear igualmente»
 * (lib/clienteRepetido.ts). Abrir lleva a la ficha que ya existe —o, en el
 * alta rápida de un documento, la elige—; crear igualmente quita el aviso.
 */
export default function AvisoFichaRepetida({ parecidas, href, onUsar, textoUsar = 'Abrir su ficha', onCrearIgualmente, ref }: {
  parecidas: readonly FichaParecida<FichaComparable>[];
  /** Con `href`, «Abrir su ficha» es un enlace; con `onUsar`, un botón. */
  href?: (f: FichaComparable) => string;
  onUsar?: (f: FichaComparable) => void;
  textoUsar?: string;
  onCrearIgualmente: () => void;
  /** Para llevar el foco al aviso si se intenta guardar sin verlo. */
  ref?: Ref<HTMLDivElement>;
}) {
  if (!parecidas.length) return null;
  return (
    <div className="aviso-repetida" role="status" ref={ref} tabIndex={-1}>
      <Users size={16} className="aviso-repetida-icono" aria-hidden />
      <div className="aviso-repetida-cuerpo">
        {parecidas.map(({ ficha, motivo }) => (
          <p key={ficha.id} className="aviso-repetida-fila">
            <span>
              Ya tienes a <strong>{nombreEnAviso(ficha)}</strong>
              {motivo === 'nif' ? ', con el mismo NIF.' : ', con un nombre muy parecido.'}
            </span>
            {href ? (
              <Link className="btn btn-ghost btn-xs" href={href(ficha)}>{textoUsar}</Link>
            ) : onUsar ? (
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => onUsar(ficha)}>{textoUsar}</button>
            ) : null}
          </p>
        ))}
        <button type="button" className="btn btn-secondary btn-xs aviso-repetida-crear" onClick={onCrearIgualmente}>
          Crear igualmente
        </button>
      </div>
    </div>
  );
}
