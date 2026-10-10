'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Search, ShieldCheck } from 'lucide-react';

export interface ConectarBancoProps {
  /** Si viene, se renueva el permiso de ese banco sin tener que elegirlo. */
  readonly bancoFijo?: string;
  readonly onError: (titulo: string, texto?: string) => void;
  readonly onCerrar?: () => void;
}

interface BancoLista { nombre: string; logo: string | null; empresas?: boolean }

/**
 * Elegir el banco y salir a su web a dar el permiso (PSD2). La app nunca ve
 * ni guarda la contraseña del banco: el cliente la escribe en la web de su
 * banco, y el banco nos da un permiso de sólo lectura que caduca solo.
 */
export default function ConectarBanco({ bancoFijo, onError, onCerrar }: ConectarBancoProps) {
  const [bancos, setBancos] = useState<BancoLista[] | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [elegido, setElegido] = useState(bancoFijo ?? '');
  const [empresa, setEmpresa] = useState(true);
  const [yendo, setYendo] = useState(false);

  useEffect(() => {
    if (bancoFijo) return;
    let vivo = true;
    fetch('/api/banco/bancos').then(r => r.json()).then(d => { if (vivo) setBancos(d.bancos ?? []); })
      .catch(() => { if (vivo) { setBancos([]); onError('No se ha podido cargar la lista de bancos'); } });
    return () => { vivo = false; };
  }, [bancoFijo, onError]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (bancos ?? []).filter(b => !q || b.nombre.toLowerCase().includes(q)).slice(0, 60);
  }, [bancos, busqueda]);

  const ir = async () => {
    if (!elegido) return;
    setYendo(true);
    try {
      const r = await fetch('/api/banco/conectar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ banco: elegido, empresa }) });
      const d = await r.json();
      if (!r.ok || !d.url) throw new Error(d.error || 'No se ha podido conectar.');
      window.location.href = d.url;
    } catch (e) {
      onError('No se ha podido conectar el banco', e instanceof Error ? e.message : '');
      setYendo(false);
    }
  };

  return (
    <div className="banco-conectar">
      {!bancoFijo && (
        <>
          <label className="banco-buscar">
            <Search size={15} aria-hidden="true" />
            <input className="form-input" placeholder="Busca tu banco: Santander, BBVA, CaixaBank…" value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)} aria-label="Buscar banco" />
          </label>
          <div className="banco-lista" role="listbox" aria-label="Bancos">
            {bancos === null && <p className="banco-cargando"><Loader2 size={14} className="spin" /> Cargando bancos…</p>}
            {bancos !== null && visibles.length === 0 && <p className="banco-cargando">Ningún banco con ese nombre.</p>}
            {visibles.map(b => (
              <button key={b.nombre} type="button" role="option" aria-selected={elegido === b.nombre}
                className={`banco-opcion ${elegido === b.nombre ? 'is-elegido' : ''}`} onClick={() => setElegido(b.nombre)}>
                {b.logo
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={b.logo} alt="" width={22} height={22} />
                  : <span className="banco-opcion-inicial">{b.nombre[0]}</span>}
                <span>{b.nombre}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <label className="banco-empresa">
        <input type="checkbox" checked={empresa} onChange={(e) => setEmpresa(e.target.checked)} />
        Es una cuenta de empresa (banca de empresas)
      </label>

      <p className="banco-seguridad">
        <ShieldCheck size={15} aria-hidden="true" />
        Vas a la web de tu banco para dar permiso. Tu contraseña la escribes allí, no aquí: nosotros sólo podemos
        leer saldos y movimientos, nunca mover dinero, y el permiso caduca solo (hasta 180 días).
      </p>

      <div className="banco-conectar-botones">
        {onCerrar && <button type="button" className="btn btn-secondary" onClick={onCerrar}>Cancelar</button>}
        <button type="button" className="btn btn-primary" disabled={!elegido || yendo} onClick={ir}>
          {yendo ? <Loader2 size={15} className="spin" /> : null}
          {bancoFijo ? `Renovar en ${bancoFijo}` : elegido ? `Ir a ${elegido}` : 'Elige tu banco'}
        </button>
      </div>
    </div>
  );
}
