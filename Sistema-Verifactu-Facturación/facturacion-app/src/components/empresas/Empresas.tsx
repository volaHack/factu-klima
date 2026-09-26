'use client';

import { useEffect, useState } from 'react';
import { Building2, Check, Copy, KeyRound, Link2, Loader2, LogIn, Plus, Unlink, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { soltarPerfilYPantallas, subirPendientesOPreguntar, vaciarCache } from '@/lib/cuentas/soltarCuenta';

/**
 * VARIAS EMPRESAS CON UN SOLO ACCESO
 *
 * Quien lleva más de una empresa (una SL y además es autónomo, o una
 * gestoría pequeña) pasa de una a otra desde el menú de la cuenta, sin
 * volver a iniciar sesión. Cada empresa guarda sus datos aparte: clientes,
 * facturas, series, Veri*Factu y plan. Ver lib/empresas/servidor.ts.
 */

export interface Empresa {
  id: string;
  nombre: string;
  nif: string | null;
  correo: string | null;
  actual: boolean;
  sinConfigurar: boolean;
}

async function pedir<T>(cuerpo?: Record<string, unknown>): Promise<T> {
  const r = await fetch('/api/empresas', cuerpo
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) }
    : { cache: 'no-store' });
  const datos = await r.json().catch(() => null);
  if (!r.ok) throw new Error(datos?.error || 'No se ha podido completar. Prueba otra vez.');
  return datos as T;
}

/** Las empresas del grupo. `null` mientras carga o si el servidor no lo tiene. */
export function useEmpresas() {
  const [empresas, setEmpresas] = useState<Empresa[] | null>(null);
  useEffect(() => {
    let vivo = true;
    pedir<{ empresas: Empresa[] }>()
      .then(d => { if (vivo) setEmpresas(d.empresas); })
      .catch(() => {});
    return () => { vivo = false; };
  }, []);
  return { empresas, setEmpresas };
}

/**
 * Entra en otra empresa del grupo con el enlace de un solo uso que da el
 * servidor. Antes se deja esta cuenta como al cerrar sesión (cola sin
 * conexión, perfil, caché), para que la otra no vea nada de esta.
 */
export async function entrarConToken(token: string, perfil: { activo: boolean; cuenta: string | null }): Promise<boolean> {
  if (!(await subirPendientesOPreguntar('cambias de empresa'))) return false;
  await soltarPerfilYPantallas(perfil.activo, perfil.cuenta);
  const { error } = await createClient().auth.verifyOtp({ token_hash: token, type: 'magiclink' });
  if (error) throw new Error('No se ha podido entrar en esa empresa. Prueba otra vez.');
  await vaciarCache();
  window.location.href = '/dashboard';
  return true;
}

export async function cambiarDeEmpresa(id: string, perfil: { activo: boolean; cuenta: string | null }): Promise<boolean> {
  const { token } = await pedir<{ token: string }>({ accion: 'cambiar', id });
  return entrarConToken(token, perfil);
}

/** Las empresas dentro del menú de la cuenta. */
export function EmpresasEnMenu({ empresas, cambiando, onCambiar, onGestionar }: {
  empresas: Empresa[] | null;
  cambiando: string | null;
  onCambiar: (id: string) => void;
  onGestionar: () => void;
}) {
  if (!empresas) return null;
  return (
    <div className="menu-empresas">
      {empresas.length > 1 && (
        <>
          <div className="menu-empresas-titulo">Tus empresas</div>
          {empresas.map(e => (
            <button
              key={e.id}
              type="button"
              className={`account-dropdown-item menu-empresas-item ${e.actual ? 'is-actual' : ''}`}
              onClick={() => { if (!e.actual) onCambiar(e.id); }}
              disabled={!!cambiando}
              aria-current={e.actual ? 'true' : undefined}
              title={e.actual ? 'Estás en esta empresa' : `Pasar a ${e.nombre}`}
            >
              {cambiando === e.id ? <Loader2 size={16} className="spin" /> : e.actual ? <Check size={16} /> : <Building2 size={16} />}
              <span className="menu-empresas-nombre">{e.nombre}</span>
            </button>
          ))}
        </>
      )}
      <button type="button" className="account-dropdown-item" onClick={onGestionar} disabled={!!cambiando}>
        <Plus size={16} /> {empresas.length > 1 ? 'Gestionar empresas' : 'Añadir otra empresa'}
      </button>
      <div className="account-dropdown-divider" />
    </div>
  );
}

/** La ventana para crear, unir, entrar y separar empresas. */
export function GestionEmpresas({ empresas, perfil, onCerrar, onCambio }: {
  empresas: Empresa[];
  perfil: { activo: boolean; cuenta: string | null };
  onCerrar: () => void;
  onCambio: (empresas: Empresa[]) => void;
}) {
  const [nombre, setNombre] = useState('');
  const [codigoAjeno, setCodigoAjeno] = useState('');
  const [miCodigo, setMiCodigo] = useState<{ codigo: string; caduca: string } | null>(null);
  const [ocupado, setOcupado] = useState('');
  const [fallo, setFallo] = useState('');
  const [aviso, setAviso] = useState('');
  const [copiado, setCopiado] = useState(false);

  const hacer = async (que: string, fn: () => Promise<void>) => {
    setOcupado(que);
    setFallo('');
    setAviso('');
    try {
      await fn();
    } catch (e) {
      setFallo(e instanceof Error ? e.message : 'No se ha podido completar.');
    } finally {
      setOcupado('');
    }
  };

  const crear = () => hacer('crear', async () => {
    const { token } = await pedir<{ token: string }>({ accion: 'crear', nombre });
    await entrarConToken(token, perfil);
  });
  const vincular = () => hacer('vincular', async () => {
    const { empresas: nuevas } = await pedir<{ empresas: Empresa[] }>({ accion: 'vincular', codigo: codigoAjeno });
    onCambio(nuevas);
    setCodigoAjeno('');
    setAviso('Hecho: ya puedes pasar de una a otra desde el menú de la cuenta.');
  });
  const sacarCodigo = () => hacer('codigo', async () => {
    setMiCodigo(await pedir<{ codigo: string; caduca: string }>({ accion: 'codigo' }));
  });
  const separarla = (e: Empresa) => {
    const texto = e.actual
      ? `¿Sacar esta empresa del grupo? Dejarás de poder pasar desde aquí a las demás.`
      : `¿Sacar «${e.nombre}» del grupo? Sus datos no se borran. Para volver a entrar en ella tendrás que iniciar sesión con ${e.correo ?? 'su correo'} (si la creaste desde aquí, pide una contraseña nueva con ese correo: te llega a tu buzón).`;
    if (!confirm(texto)) return;
    void hacer(`separar-${e.id}`, async () => {
      onCambio((await pedir<{ empresas: Empresa[] }>({ accion: 'separar', id: e.id })).empresas);
    });
  };

  const hora = miCodigo ? new Date(miCodigo.caduca).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <div className="modal-overlay animate-fade-in" onClick={onCerrar}>
      <div className="modal gestion-empresas" role="dialog" aria-label="Tus empresas" onClick={ev => ev.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Tus empresas</h2>
          <button className="modal-close" onClick={onCerrar} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="modal-body">
          <p className="form-hint" style={{ marginTop: 0 }}>
            Cada empresa lleva sus propios clientes, facturas, series, certificado de Veri*Factu y plan. Pasas de una a otra
            desde el menú de la cuenta, sin volver a entrar.
          </p>

          <ul className="gestion-empresas-lista">
            {empresas.map(e => (
              <li key={e.id} className={e.actual ? 'is-actual' : ''}>
                <Building2 size={16} />
                <span className="gestion-empresas-dato">
                  <strong>{e.nombre}</strong>
                  <small>{e.actual ? 'Estás aquí' : e.sinConfigurar ? 'Sin datos todavía' : e.nif || ''}</small>
                </span>
                {!e.actual && (
                  <button type="button" className="btn btn-ghost btn-sm" disabled={!!ocupado} onClick={() => void hacer(`entrar-${e.id}`, async () => { await cambiarDeEmpresa(e.id, perfil); })}>
                    {ocupado === `entrar-${e.id}` ? <Loader2 size={14} className="spin" /> : <LogIn size={14} />} Entrar
                  </button>
                )}
                {empresas.length > 1 && (
                  <button type="button" className="btn btn-ghost btn-sm" disabled={!!ocupado} onClick={() => separarla(e)} title="Sacar del grupo" aria-label={`Sacar ${e.nombre} del grupo`}>
                    <Unlink size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>

          <section className="gestion-empresas-bloque">
            <h3><Plus size={15} /> Crear una empresa nueva</h3>
            <div className="gestion-empresas-fila">
              <input
                className="form-input"
                value={nombre}
                onChange={ev => setNombre(ev.target.value)}
                placeholder="Nombre de la empresa"
                maxLength={120}
                onKeyDown={ev => { if (ev.key === 'Enter' && nombre.trim().length >= 2) void crear(); }}
              />
              <button type="button" className="btn btn-primary" disabled={!!ocupado || nombre.trim().length < 2} onClick={() => void crear()}>
                {ocupado === 'crear' ? <Loader2 size={16} className="spin" /> : <LogIn size={16} />} Crear y entrar
              </button>
            </div>
            <p className="form-hint">Entrarás en ella y te pedirá sus datos (razón social, NIF, serie), como al empezar.</p>
          </section>

          <section className="gestion-empresas-bloque">
            <h3><Link2 size={15} /> Unir una cuenta que ya tienes</h3>
            <p className="form-hint" style={{ marginTop: 0 }}>
              Saca un código aquí, entra con la otra cuenta y escríbelo en su menú → «Añadir otra empresa». O al revés.
            </p>
            {miCodigo ? (
              <div className="gestion-empresas-codigo">
                <code>{miCodigo.codigo}</code>
                <button type="button" className="btn btn-ghost btn-sm" onClick={async () => {
                  try { await navigator.clipboard.writeText(miCodigo.codigo); setCopiado(true); setTimeout(() => setCopiado(false), 1800); } catch { /* */ }
                }}>
                  {copiado ? <Check size={14} /> : <Copy size={14} />} {copiado ? 'Copiado' : 'Copiar'}
                </button>
                <small>Vale hasta las {hora} y una sola vez.</small>
              </div>
            ) : (
              <button type="button" className="btn btn-secondary btn-sm" disabled={!!ocupado} onClick={() => void sacarCodigo()}>
                {ocupado === 'codigo' ? <Loader2 size={14} className="spin" /> : <KeyRound size={14} />} Sacar un código
              </button>
            )}
            <div className="gestion-empresas-fila" style={{ marginTop: 'var(--space-3)' }}>
              <input
                className="form-input mono"
                value={codigoAjeno}
                onChange={ev => setCodigoAjeno(ev.target.value.toUpperCase())}
                placeholder="Código de la otra cuenta"
                maxLength={12}
                aria-label="Código de la otra cuenta"
              />
              <button type="button" className="btn btn-secondary" disabled={!!ocupado || codigoAjeno.replace(/[^A-Z0-9]/g, '').length !== 8} onClick={() => void vincular()}>
                {ocupado === 'vincular' ? <Loader2 size={16} className="spin" /> : <Link2 size={16} />} Unir
              </button>
            </div>
          </section>

          {aviso && <p className="form-hint" role="status" style={{ color: 'var(--color-success)' }}>{aviso}</p>}
          {fallo && <p className="equipo-error" role="alert">{fallo}</p>}
        </div>
      </div>
    </div>
  );
}

/**
 * En el asistente de primeros pasos de una empresa recién creada, que no se
 * puede saltar: si se ha creado por error, hay que poder volver a las otras.
 */
export function VolverAOtraEmpresa() {
  const { empresas } = useEmpresas();
  const [yendo, setYendo] = useState<string | null>(null);
  const otras = (empresas ?? []).filter(e => !e.actual);
  if (otras.length === 0) return null;
  const ir = async (id: string) => {
    setYendo(id);
    try {
      if (!(await cambiarDeEmpresa(id, { activo: false, cuenta: null }))) setYendo(null);
    } catch (e) {
      setYendo(null);
      alert(e instanceof Error ? e.message : 'No se ha podido cambiar de empresa.');
    }
  };
  return (
    <div className="onboarding-volver">
      <span>¿Ahora no?</span>
      {otras.slice(0, 3).map(e => (
        <button key={e.id} type="button" className="btn btn-ghost btn-sm" disabled={!!yendo} onClick={() => void ir(e.id)}>
          {yendo === e.id ? <Loader2 size={14} className="spin" /> : <LogIn size={14} />} Volver a {e.nombre}
        </button>
      ))}
    </div>
  );
}
