'use client';

import { useEffect, useState } from 'react';
import { Loader2, Mail, Trash2, UserCheck, Clock } from 'lucide-react';

import { invitarGestoria, misAccesos, revocarAcceso, type Acceso } from '@/lib/gestoria';
import { useToast } from '@/hooks/useToast';
import { formatDate } from '@/lib/utils';

/**
 * INVITAR A TU GESTORÍA
 *
 * Lo que hoy se hace mandando el usuario y la contraseña por WhatsApp.
 * Aquí la gestoría entra con su propia cuenta y sólo puede LEER: no
 * puede emitir, ni modificar, ni borrar nada. Y el acceso se retira con
 * un botón, con su fecha, en vez de cambiando la contraseña.
 */
export default function AccesoGestoria() {
  const { success, error: toastError } = useToast();
  const [accesos, setAccesos] = useState<Acceso[] | null>(null);
  const [email, setEmail] = useState('');
  const [invitando, setInvitando] = useState(false);
  const [quitando, setQuitando] = useState<string | null>(null);

  const cargar = async () => setAccesos(await misAccesos());

  // Los cambios de estado, después del await: en el cuerpo síncrono del
  // efecto el compilador de React los rechaza por render en cascada.
  useEffect(() => {
    (async () => {
      try {
        await cargar();
      } catch {
        setAccesos([]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const invitar = async (e: React.FormEvent) => {
    e.preventDefault();
    setInvitando(true);
    try {
      await invitarGestoria(email);
      setEmail('');
      await cargar();
      success('Invitación enviada', 'Tu gestoría la verá al entrar con ese correo.');
    } catch (err) {
      toastError('No se ha podido invitar', err instanceof Error ? err.message : '');
    } finally {
      setInvitando(false);
    }
  };

  const quitar = async (acceso: Acceso) => {
    if (!confirm(`¿Retirar el acceso de ${acceso.gestoria_email}?\n\nDejará de ver tus libros inmediatamente.`)) return;
    setQuitando(acceso.id);
    try {
      await revocarAcceso(acceso.id);
      await cargar();
      success('Acceso retirado', `${acceso.gestoria_email} ya no puede ver tus datos.`);
    } catch (err) {
      toastError('No se ha podido retirar', err instanceof Error ? err.message : '');
    } finally {
      setQuitando(null);
    }
  };

  return (
    <>
      <p className="settings-section-subtitle">
        Tu gestoría entra con su propia cuenta y ve tus facturas, tus gastos y tus
        datos fiscales en <strong>solo lectura</strong>. No puede emitir, modificar
        ni borrar nada, y le retiras el acceso cuando quieras.
      </p>

      <form onSubmit={invitar} className="gestoria-invitar">
        <input
          type="email"
          className="form-input"
          placeholder="correo@gestoria.es"
          value={email}
          onChange={e => setEmail(e.target.value)}
          aria-label="Correo de la gestoría"
          required
        />
        <button className="btn btn-primary" disabled={invitando || !email.trim()}>
          {invitando ? <Loader2 size={16} className="spin" /> : <Mail size={16} />} Invitar
        </button>
      </form>

      {accesos === null ? (
        <p className="card-subtitle">Cargando…</p>
      ) : accesos.length === 0 ? (
        <p className="card-subtitle">Todavía no has dado acceso a nadie.</p>
      ) : (
        <ul className="gestoria-lista">
          {accesos.map(a => (
            <li key={a.id} className="gestoria-item">
              <span className={`gestoria-estado gestoria-estado--${a.estado}`}>
                {a.estado === 'activo' ? <UserCheck size={14} /> : <Clock size={14} />}
                {a.estado === 'activo' ? 'Con acceso' : 'Invitada'}
              </span>
              <span className="gestoria-item-datos">
                <strong>{a.gestoria_email}</strong>
                <span className="card-subtitle">
                  {a.estado === 'activo' && a.aceptado_en
                    ? `Acepta desde el ${formatDate(a.aceptado_en)}`
                    : `Invitada el ${formatDate(a.creado_en)}`}
                </span>
              </span>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => quitar(a)}
                disabled={quitando === a.id}
                aria-label={`Retirar el acceso de ${a.gestoria_email}`}
              >
                {quitando === a.id ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />}
                Retirar
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
