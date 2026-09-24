'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Lock } from 'lucide-react';

import VistaContabilidad from '@/components/contabilidad/VistaContabilidad';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { cargarContabilidadDeEmpresa } from '@/lib/contabilidad/deEmpresa';
import { empresasQueLlevo, type EmpresaGestionada } from '@/lib/gestoria';

/**
 * La contabilidad de una empresa cliente, en solo lectura: los mismos
 * libros que ve ella, generados con sus datos.
 */
export default function ContabilidadDeEmpresa() {
  const params = useParams();
  const empresaId = String(params.empresaId ?? '');
  const [empresa, setEmpresa] = useState<EmpresaGestionada | null | undefined>(undefined);

  useEffect(() => {
    let vivo = true;
    empresasQueLlevo()
      .then(lista => { if (vivo) setEmpresa(lista.find(e => e.userId === empresaId) ?? null); })
      .catch(() => { if (vivo) setEmpresa(null); });
    return () => { vivo = false; };
  }, [empresaId]);

  const cargar = useCallback(() => cargarContabilidadDeEmpresa(empresaId), [empresaId]);

  if (empresa === undefined) return <PageSkeleton label="Comprobando el acceso" />;

  if (!empresa) {
    return (
      <div className="empty-state">
        <span className="empty-state-icon"><Lock strokeWidth={1.6} /></span>
        <h2 className="empty-state-title">No tienes acceso a esta empresa</h2>
        <p className="empty-state-description">
          O el acceso se ha retirado, o esta dirección no corresponde a ninguna de tus empresas.
        </p>
        <div className="empty-state-actions">
          <Link href="/gestoria" className="btn btn-primary"><ArrowLeft size={16} /> Volver</Link>
        </div>
      </div>
    );
  }

  return (
    <VistaContabilidad
      cargar={cargar}
      enlaces={false}
      titulo={empresa.nombre}
      antes={<Link href={`/gestoria/${empresaId}`} className="page-back"><ArrowLeft /> Libros de la empresa</Link>}
      subtitulo={<>NIF {empresa.nif} · solo lectura. Los asientos salen de sus facturas, compras y gastos.
        Los cobros parciales que apunte en su tesorería no llegan aquí: las facturas pagadas sí se cobran.</>}
    />
  );
}
