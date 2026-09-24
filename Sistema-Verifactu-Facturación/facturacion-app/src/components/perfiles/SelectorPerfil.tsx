'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Delete, Lock, LogOut, X } from 'lucide-react';
import Portal from '@/components/ui/Portal';
import AvatarPerfil from './AvatarPerfil';
import { comprobarPin, nombreRol, tienePin, type Perfil } from '@/lib/perfiles';
import { entrarComo, usePerfiles } from '@/lib/perfilesCliente';

const MAX_FALLOS = 5;
const ESPERA_S = 30;

/**
 * «¿QUIÉN ESTÁ TRABAJANDO?»
 *
 * Sale al abrir la app en un equipo sin perfil, al volver tras un rato sin
 * uso (si se configuró) y cuando alguien pide cambiar. Si el perfil lleva
 * PIN se teclea aquí: con los números en pantalla, para el mostrador
 * táctil, o con el teclado del ordenador.
 *
 * Tras cinco PIN equivocados se espera medio minuto: suficiente para que
 * probar combinaciones al azar no compense, y poco para quien sólo se ha
 * equivocado de dedo.
 */
export default function SelectorPerfil({
  obligatorio, onCerrar, onElegido,
}: {
  /** Sin perfil no se puede seguir: no hay botón de cerrar. */
  obligatorio: boolean;
  onCerrar: () => void;
  onElegido: (perfil: Perfil) => void;
}) {
  const { perfiles, activo } = usePerfiles();
  const visibles = perfiles.filter(p => p.activo);
  const [elegido, setElegido] = useState<Perfil | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [fallos, setFallos] = useState(0);
  const [esperaHasta, setEsperaHasta] = useState(0);
  const [ahora, setAhora] = useState(() => Date.now());
  const [comprobando, setComprobando] = useState(false);
  const primeraTarjeta = useRef<HTMLButtonElement>(null);

  const bloqueado = esperaHasta > ahora;
  const segundos = Math.ceil((esperaHasta - ahora) / 1000);

  useEffect(() => {
    if (!bloqueado) return;
    const t = setInterval(() => setAhora(Date.now()), 500);
    return () => clearInterval(t);
  }, [bloqueado]);

  useEffect(() => { primeraTarjeta.current?.focus(); }, [elegido]);

  const terminar = useCallback((p: Perfil) => {
    entrarComo(p);
    onElegido(p);
  }, [onElegido]);

  const elegir = (p: Perfil) => {
    setError('');
    setPin('');
    if (!tienePin(p)) { terminar(p); return; }
    setElegido(p);
  };

  // Se comprueba en cuanto hay 4 cifras o más: con un PIN de 4 no hace
  // falta pulsar «Entrar». Si llega a 6 y no cuadra, es un fallo.
  const probar = useCallback(async (valor: string, forzar = false) => {
    if (!elegido || bloqueado || comprobando) return;
    if (valor.length < 4) { if (forzar) setError('El PIN tiene al menos 4 cifras.'); return; }
    setComprobando(true);
    const ok = await comprobarPin(elegido, valor);
    setComprobando(false);
    if (ok) { terminar(elegido); return; }
    if (valor.length >= 6 || forzar) {
      const n = fallos + 1;
      setFallos(n);
      setPin('');
      if (n >= MAX_FALLOS) {
        setEsperaHasta(Date.now() + ESPERA_S * 1000);
        setAhora(Date.now());
        setFallos(0);
        setError(`Demasiados intentos. Espera ${ESPERA_S} segundos.`);
      } else {
        setError('PIN incorrecto.');
      }
    }
  }, [elegido, bloqueado, comprobando, fallos, terminar]);

  const pulsar = useCallback((d: string) => {
    if (bloqueado) return;
    setError('');
    const nuevo = (pin + d).slice(0, 6);
    setPin(nuevo);
    void probar(nuevo);
  }, [bloqueado, probar, pin]);

  // Teclado físico: cifras, borrar, Intro y Escape.
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (!elegido) {
        if (e.key === 'Escape' && !obligatorio) onCerrar();
        return;
      }
      if (/^\d$/.test(e.key)) { e.preventDefault(); pulsar(e.key); }
      else if (e.key === 'Backspace') { e.preventDefault(); setPin(p => p.slice(0, -1)); }
      else if (e.key === 'Enter') { e.preventDefault(); void probar(pin, true); }
      else if (e.key === 'Escape') { e.preventDefault(); setElegido(null); setPin(''); setError(''); }
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [elegido, pin, pulsar, probar, obligatorio, onCerrar]);

  return (
    <Portal>
      <div className="perfil-selector" role="dialog" aria-modal="true" aria-labelledby="perfil-selector-titulo">
        {!obligatorio && (
          <button type="button" className="perfil-selector-cerrar" onClick={onCerrar} aria-label="Cerrar">
            <X size={20} />
          </button>
        )}

        {!elegido ? (
          <div className="perfil-selector-cuerpo">
            <h2 id="perfil-selector-titulo" className="perfil-selector-titulo">¿Quién está trabajando?</h2>
            <p className="perfil-selector-sub">Elige tu perfil. Lo que hagas quedará a tu nombre.</p>
            <ul className="perfil-selector-lista">
              {visibles.map((p, i) => (
                <li key={p.id}>
                  <button
                    type="button"
                    ref={i === 0 ? primeraTarjeta : undefined}
                    className={`perfil-tarjeta ${activo?.id === p.id ? 'is-actual' : ''}`}
                    onClick={() => elegir(p)}
                  >
                    <AvatarPerfil perfil={p} tam={64} />
                    <span className="perfil-tarjeta-nombre">{p.nombre}</span>
                    <span className="perfil-tarjeta-rol">
                      {tienePin(p) && <Lock size={11} aria-label="con PIN" />}
                      {nombreRol(p.rol)}{activo?.id === p.id ? ' · ahora' : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <form action="/auth/signout" method="post" className="perfil-selector-pie">
              <button type="submit" className="perfil-selector-salir">
                <LogOut size={14} /> Salir de la cuenta
              </button>
            </form>
          </div>
        ) : (
          <div className="perfil-selector-cuerpo perfil-selector-cuerpo--pin">
            <button type="button" className="perfil-selector-volver" onClick={() => { setElegido(null); setPin(''); setError(''); }}>
              <ArrowLeft size={16} /> Otro perfil
            </button>
            <AvatarPerfil perfil={elegido} tam={72} />
            <h2 id="perfil-selector-titulo" className="perfil-selector-titulo">Hola, {elegido.nombre.split(' ')[0]}</h2>
            <p className="perfil-selector-sub">Teclea tu PIN</p>

            <div className={`perfil-pin-puntos ${error && !bloqueado ? 'is-error' : ''}`} aria-live="polite" aria-label={`${pin.length} cifras tecleadas`}>
              {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
                <span key={i} className={i < pin.length ? 'is-lleno' : ''} />
              ))}
            </div>
            <p className="perfil-pin-error" role="alert">
              {bloqueado ? `Espera ${segundos} s para volver a intentarlo.` : error}
            </p>

            <div className="perfil-pin-teclado">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
                <button key={d} type="button" onClick={() => pulsar(d)} disabled={bloqueado}>{d}</button>
              ))}
              <button type="button" onClick={() => setPin(p => p.slice(0, -1))} disabled={bloqueado || !pin} aria-label="Borrar la última cifra">
                <Delete size={20} />
              </button>
              <button type="button" onClick={() => pulsar('0')} disabled={bloqueado}>0</button>
              <button
                type="button"
                className="perfil-pin-entrar"
                onClick={() => void probar(pin, true)}
                disabled={bloqueado || pin.length < 4}
              >
                Entrar
              </button>
            </div>
          </div>
        )}
      </div>
    </Portal>
  );
}
