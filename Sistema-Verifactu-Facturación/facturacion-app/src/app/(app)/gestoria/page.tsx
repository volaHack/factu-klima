'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Briefcase, Check, Loader2, Building2, ArrowRight, MailOpen } from 'lucide-react';

import {
  aceptarInvitacion, empresasQueLlevo, invitacionesPendientes,
  type Acceso, type EmpresaGestionada,
} from '@/lib/gestoria';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { useToast } from '@/hooks/useToast';
import { formatDate } from '@/lib/utils';

/**
 * EL PANEL DE LA GESTORÍA
 *
 * Aquí no se factura: se mira. Una gestoría entra con su propia cuenta,
 * ve las empresas que la han invitado y abre sus libros en solo lectura.
 * Lo que puede leer lo decide la base de datos (migración 045), no esta
 * pantalla.
 */
export default function PanelGestoria() {
  const { success, error: toastError } = useToast();
  const [cargando, setCargando] = useState(true);
  const [aceptando, setAceptando] = useState<string | null>(null);
  const [invitaciones, setInvitaciones] = useState<Acceso[]>([]);
  const [empresas, setEmpresas] = useState<EmpresaGestionada[]>([]);

  const cargar = async () => {
    const [pendientes, llevadas] = await Promise.all([
      invitacionesPendientes(),
      empresasQueLlevo(),
    ]);
    setInvitaciones(pendientes);
    setEmpresas(llevadas);
    setCargando(false);
  };

  // Todo lo que cambia estado ocurre DESPUÉS de un await: cambiarlo en
  // el cuerpo síncrono del efecto provoca un render en cascada y el
  // compilador de React lo rechaza.
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        await cargar();
      } catch (err) {
        if (!vivo) return;
        toastError('No se han podido cargar tus empresas', err instanceof Error ? err.message : '');
        setCargando(false);
      }
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const aceptar = async (acceso: Acceso) => {
    setAceptando(acceso.id);
    try {
      await aceptarInvitacion(acceso.id);
      await cargar();
      success('Invitación aceptada', 'Ya puedes consultar sus libros.');
    } catch (err) {
      toastError('No se ha podido aceptar', err instanceof Error ? err.message : '');
    } finally {
      setAceptando(null);
    }
  };

  if (cargando) return <PageSkeleton variant="list" label="Cargando tus empresas" />;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div className="page-header-left">
          <p className="page-eyebrow"><Briefcase /> Gestoría</p>
          <div className="page-title-row">
            <h1 className="page-title">Empresas que llevas</h1>
          </div>
          <p className="page-subtitle">
            Solo lectura: puedes consultar y exportar, nunca emitir ni modificar.
            Cada empresa te da acceso desde sus Ajustes y te lo puede retirar cuando quiera.
          </p>
        </div>
      </div>

      {invitaciones.length > 0 && (
        <section className="card" style={{ marginBottom: 'var(--space-5)' }}>
          <h2 className="card-title" style={{ marginBottom: 'var(--space-3)' }}>
            <MailOpen size={16} style={{ verticalAlign: '-2px', marginRight: 6 }} />
            Invitaciones pendientes
          </h2>
          <div className="gestoria-invitaciones">
            {invitaciones.map(inv => (
              <div key={inv.id} className="gestoria-invitacion">
                <div>
                  <strong>Una empresa te ha invitado</strong>
                  <p className="card-subtitle">
                    Recibida el {formatDate(inv.creado_en)} · para {inv.gestoria_email}
                  </p>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={() => aceptar(inv)}
                  disabled={aceptando === inv.id}
                >
                  {aceptando === inv.id ? <Loader2 size={16} className="spin" /> : <Check size={16} />}
                  Aceptar
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {empresas.length === 0 ? (
        <div className="empty-state">
          <span className="empty-state-icon"><Building2 strokeWidth={1.6} /></span>
          <h2 className="empty-state-title">Todavía no llevas ninguna empresa</h2>
          <p className="empty-state-description">
            Pide a tu cliente que entre en <strong>Ajustes → Tu gestoría</strong> y te invite
            con este mismo correo. En cuanto aceptes la invitación, sus libros aparecerán aquí.
          </p>
        </div>
      ) : (
        <div className="gestoria-grid">
          {empresas.map(e => (
            <Link key={e.userId} href={`/gestoria/${e.userId}`} className="gestoria-empresa">
              <span className="gestoria-empresa-icono"><Building2 size={18} /></span>
              <span className="gestoria-empresa-datos">
                <strong>{e.nombre}</strong>
                <span className="card-subtitle">{e.nif}</span>
                {e.desde && <span className="card-subtitle">Desde el {formatDate(e.desde)}</span>}
              </span>
              <ArrowRight size={16} className="gestoria-empresa-flecha" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
