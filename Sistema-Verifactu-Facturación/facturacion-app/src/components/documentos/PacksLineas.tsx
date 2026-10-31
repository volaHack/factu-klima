'use client';

import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Boxes, Plus, Save, Trash2 } from 'lucide-react';
import type { InvoiceLineItem } from '@/lib/types';
import {
  conPackNuevo, escribirPacks, EVENTO_PACKS, leerPacks, packConNombre, resumenPack, sinPack, type PackLineas,
} from '@/lib/packsLineas';
import DialogoRapido from './DialogoRapido';

/*
 * Los packs de la cuenta, leídos del navegador y al día si otro editor
 * abierto guarda uno. La lista se guarda en memoria por clave para que
 * `useSyncExternalStore` reciba siempre el mismo objeto mientras no cambie.
 */
const enMemoria = new Map<string, PackLineas[]>();
const NINGUNO: PackLineas[] = [];

function suscribirse(avisar: () => void) {
  const alCambiar = () => { enMemoria.clear(); avisar(); };
  window.addEventListener(EVENTO_PACKS, alCambiar);
  window.addEventListener('storage', alCambiar);
  return () => {
    window.removeEventListener(EVENTO_PACKS, alCambiar);
    window.removeEventListener('storage', alCambiar);
  };
}

function usePacks(cuenta: string | null): PackLineas[] {
  const clave = cuenta ?? '';
  return useSyncExternalStore(
    suscribirse,
    () => {
      if (!enMemoria.has(clave)) enMemoria.set(clave, leerPacks(cuenta));
      return enMemoria.get(clave) ?? NINGUNO;
    },
    () => NINGUNO,
  );
}

/**
 * Los packs de líneas en el editor (lib/packsLineas.ts): cada pack es un
 * botón que lo mete entero, y «Guardar como pack» guarda las líneas de
 * ahora con un nombre. En la ventana de guardar se ven y se borran los
 * que hay.
 */
export default function PacksLineas({ cuenta, lineas, onMeter }: {
  cuenta: string | null;
  lineas: readonly InvoiceLineItem[];
  onMeter: (pack: PackLineas) => void;
}) {
  const packs = usePacks(cuenta);
  const [guardando, setGuardando] = useState(false);
  const hayLineas = lineas.some(l => (Number(l.quantity) || 0) > 0 && (l.productId || l.productName?.trim()));

  return (
    <>
      {packs.length > 0 && (
        <section className="packs-lineas" aria-label="Tus packs de líneas">
          <span className="packs-lineas-titulo"><Boxes size={14} aria-hidden /> Packs</span>
          {packs.map(p => (
            <button
              key={p.id}
              type="button"
              className="habitual pack-chip"
              onClick={() => onMeter(p)}
              aria-label={`Meter el pack ${p.nombre}: ${resumenPack(p)}`}
              title={resumenPack(p)}
            >
              <Plus size={13} aria-hidden />
              <span className="habitual-nombre">{p.nombre}</span>
              <span className="habitual-ultima">{p.lineas.length}</span>
            </button>
          ))}
        </section>
      )}
      <button
        type="button"
        className="btn btn-ghost btn-xs"
        onClick={() => setGuardando(true)}
        disabled={!hayLineas && !packs.length}
        title={hayLineas ? 'Guarda estas líneas con un nombre para meterlas de un toque otro día' : 'Pon alguna línea para poder guardarla como pack'}
      >
        <Save size={13} aria-hidden /> {packs.length ? 'Packs…' : 'Guardar como pack'}
      </button>
      {guardando && <GuardarPack cuenta={cuenta} packs={packs} lineas={lineas} hayLineas={hayLineas} onCerrar={() => setGuardando(false)} />}
    </>
  );
}

function GuardarPack({ cuenta, packs, lineas, hayLineas, onCerrar }: {
  cuenta: string | null;
  packs: readonly PackLineas[];
  lineas: readonly InvoiceLineItem[];
  hayLineas: boolean;
  onCerrar: () => void;
}) {
  const idNombre = useId();
  const [nombre, setNombre] = useState('');
  const [aviso, setAviso] = useState('');
  const repetido = packConNombre(packs, nombre);

  // Un mensaje de «guardado» o «no se ha podido» se va solo al rato.
  useEffect(() => {
    if (!aviso) return;
    const r = window.setTimeout(() => setAviso(''), 4000);
    return () => window.clearTimeout(r);
  }, [aviso]);

  const guardar = () => {
    const siguiente = conPackNuevo(packs, nombre, lineas);
    if (!siguiente) return;
    if (!escribirPacks(cuenta, siguiente)) {
      setAviso('No se ha podido guardar: este navegador no deja guardar datos (¿ventana privada?).');
      return;
    }
    onCerrar();
  };

  const borrar = (p: PackLineas) => {
    if (!escribirPacks(cuenta, sinPack(packs, p.id))) setAviso('No se ha podido borrar.');
    else setAviso(`Pack «${p.nombre}» borrado.`);
  };

  const pie = (
    <>
      <button type="button" className="btn btn-secondary" onClick={onCerrar}>Cerrar</button>
      {hayLineas && (
        <button type="button" className="btn btn-primary" onClick={guardar} disabled={!nombre.trim()}>
          <Save size={16} aria-hidden /> {repetido ? 'Sustituir el pack' : 'Guardar el pack'}
        </button>
      )}
    </>
  );

  return createPortal(
    <DialogoRapido titulo="Packs de líneas" icono={<Boxes size={18} aria-hidden />} onCerrar={onCerrar} pie={pie} className="packs-dialogo">
      {hayLineas && (
        <div className="form-group">
          <label className="form-label" htmlFor={idNombre}>Guarda las líneas de ahora como un pack</label>
          <input
            id={idNombre}
            className="form-input"
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); guardar(); } }}
            placeholder="Pedido semanal hotel, surtido bar…"
            maxLength={80}
            autoComplete="off"
            data-foco-inicial
          />
          <p className="form-hint">
            {repetido
              ? `Ya tienes un pack «${repetido.nombre}» (${resumenPack(repetido)}): se sustituirá por estas líneas.`
              : 'Se guardan los artículos y las cantidades. Al meterlo, cada línea toma el precio que le toque ese día a ese cliente.'}
          </p>
        </div>
      )}
      {packs.length > 0 && (
        <>
          <p className="packs-dialogo-titulo">Tus packs</p>
          <ul className="packs-dialogo-lista">
            {packs.map(p => (
              <li key={p.id}>
                <span className="packs-dialogo-nombre">{p.nombre}</span>
                <span className="packs-dialogo-resumen">{resumenPack(p)}</span>
                <button type="button" className="line-item-delete" onClick={() => borrar(p)} aria-label={`Borrar el pack ${p.nombre}`}>
                  <Trash2 size={14} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {!hayLineas && !packs.length && <p className="form-hint">Pon alguna línea para poder guardarla como pack.</p>}
      {aviso && <p className="form-hint" role="status">{aviso}</p>}
      <p className="form-hint">Los packs se guardan en este navegador, para esta cuenta.</p>
    </DialogoRapido>,
    document.body,
  );
}
