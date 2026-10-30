'use client';

import { Keyboard } from 'lucide-react';
import { ATAJOS_EDITOR } from '@/lib/atajos';
import DialogoRapido from './DialogoRapido';

/** En el Mac la tecla es Cmd y no Ctrl: la chuleta lo dice como es. */
function enMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
}

/** La chuleta de atajos del editor (se abre con `?`). Sale de ATAJOS_EDITOR: lo que dice es lo que hay. */
export default function ChuletaAtajos({ onCerrar }: { onCerrar: () => void }) {
  const mac = enMac();
  const teclas = (t: string) => (mac ? t.replace('Ctrl', '⌘').replace('Alt', '⌥') : t).split('+');
  return (
    <DialogoRapido
      titulo="Atajos de teclado"
      icono={<Keyboard size={18} aria-hidden />}
      onCerrar={onCerrar}
      className="chuleta-atajos"
      pie={<button type="button" className="btn btn-secondary" onClick={onCerrar} data-foco-inicial>Entendido</button>}
    >
      <dl className="chuleta-atajos-lista">
        {ATAJOS_EDITOR.map(a => (
          <div key={a.accion} className="chuleta-atajos-fila">
            <dt>
              {teclas(a.teclas).map((t, i) => (
                <span key={i}>{i > 0 && <span className="chuleta-atajos-mas" aria-hidden>+</span>}<kbd>{t}</kbd></span>
              ))}
            </dt>
            <dd>{a.etiqueta}</dd>
          </div>
        ))}
      </dl>
      <p className="chuleta-atajos-nota">
        En las casillas de cantidad, cajas, precio y descuento puedes escribir una cuenta: <kbd>12*3,5</kbd>, <kbd>24/2</kbd> o <kbd>=100-15%</kbd>. Se resuelve al salir de la casilla o con Intro.
      </p>
    </DialogoRapido>
  );
}
