import Link from 'next/link';
import { exigirAdminCon2fa } from '@/lib/admin/dal';
import { listarCuentas, eventosPendientes } from '@/lib/admin/datos';
import { resumen } from '@/lib/admin/cuentas';
import { proximoPlazo } from '@/lib/plataforma/plazos';
import { formatCurrency } from '@/lib/utils';
import { AlertCircle } from 'lucide-react';

export default async function AdminResumen() {
  await exigirAdminCon2fa();
  const [cuentas, pendientes] = await Promise.all([listarCuentas(), eventosPendientes()]);
  const hoy = new Date();
  const r = resumen(cuentas, hoy);
  const plazo = proximoPlazo(hoy);
  const avisoPlazo = plazo.dias <= 10;
  const cifras: [string, string][] = [
    ['Ingresos recurrentes / mes (a precio de tarifa)', formatCurrency(r.ingresosMensuales)],
    ['Básico · Pro · Sin límite', `${r.activasPorPlan.basico} · ${r.activasPorPlan.pro} · ${r.activasPorPlan.sin_limite}`],
    ['Cortesías activas', String(r.cortesias)],
    ['Altas / bajas este mes', `${r.altasMes} / ${r.bajasMes}`],
    ['Cobros fallidos', String(r.cobrosFallidos)],
    ['Eventos de Stripe por revisar', String(pendientes.length)],
  ];
  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Administración</h1>
      </div>
      {avisoPlazo && (
        <div className="card" style={{ borderLeft: '4px solid #f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.05)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <AlertCircle className="w-5 h-5 text-amber-500" style={{ flexShrink: 0 }} />
          <div>
            <strong>Plazo fiscal próximo:</strong> Quedan <strong>{plazo.dias} {plazo.dias === 1 ? 'día' : 'días'}</strong> para presentar el Modelo 420 y el Modelo 130 del {plazo.trimestre}T {plazo.anio} (hasta el {plazo.limite}).{' '}
            <Link href="/admin/hacienda" style={{ textDecoration: 'underline', fontWeight: 500 }}>
              Ver detalles en Hacienda →
            </Link>
          </div>
        </div>
      )}
      <div className="kpi-grid">
        {cifras.map(([etiqueta, valor]) => (
          <div key={etiqueta} className="card">
            <div className="card-subtitle">{etiqueta}</div>
            <div className="page-meta-value">{valor}</div>
          </div>
        ))}
      </div>
    </>
  );
}
