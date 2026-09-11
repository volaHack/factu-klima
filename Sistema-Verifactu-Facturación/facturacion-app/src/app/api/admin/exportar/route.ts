import { NextResponse } from 'next/server';
import { adminParaApi } from '@/lib/admin/dal';
import { listarCuentas } from '@/lib/admin/datos';
import { formatDate } from '@/lib/utils';
import { getPlan } from '@/lib/plans';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const admin = await adminParaApi();
  if (!admin.ok) {
    return admin.respuesta;
  }

  const { searchParams } = new URL(request.url);
  const tipo = searchParams.get('tipo') || 'cuentas';

  const cuentas = await listarCuentas();

  // CSV con BOM UTF-8 y delimitador punto y coma (;) para compatibilidad nativa con Microsoft Excel en España
  let csv = '\uFEFF';

  if (tipo === 'cuentas') {
    csv += 'Email;Nombre o Razón Social;NIF;Plan;Estado;Origen;Facturas este Mes;Fecha Alta;Última Actividad\n';
    for (const c of cuentas) {
      const planName = c.esAdmin ? 'Administrador' : c.estado.planId ? getPlan(c.estado.planId)?.name : 'Sin plan';
      const estado = c.esAdmin ? 'Admin' : c.estado.activa ? (c.estado.origen === 'cortesia' ? 'Cortesía' : 'Activa') : 'Inactiva';
      const origen = c.fila?.origen || '—';
      const alta = c.alta ? formatDate(c.alta) : '—';
      const actividad = c.ultimaActividad ? formatDate(c.ultimaActividad) : 'Nunca';

      const fila = [
        `"${(c.email || '').replace(/"/g, '""')}"`,
        `"${(c.nombre || '').replace(/"/g, '""')}"`,
        `"${(c.nif || '').replace(/"/g, '""')}"`,
        `"${planName}"`,
        `"${estado}"`,
        `"${origen}"`,
        c.facturasMes || 0,
        `"${alta}"`,
        `"${actividad}"`,
      ];
      csv += fila.join(';') + '\n';
    }
  } else if (tipo === 'suscripciones') {
    csv += 'Email;Nombre;Plan;Precio Mensual;Estado;Origen;Vencimiento o Fin;Cancela al Final\n';
    for (const c of cuentas) {
      if (!c.estado.planId && !c.estado.activa) continue;
      const plan = c.estado.planId ? getPlan(c.estado.planId) : null;
      const precio = plan ? plan.priceMonthly : 0;
      const estado = c.estado.activa ? (c.estado.origen === 'cortesia' ? 'Cortesía' : 'Activa') : 'Inactiva';
      const origen = c.fila?.origen || (c.estado.origen === 'cortesia' ? 'Cortesía manual' : 'Stripe');
      const fin = c.fila?.periodo_fin ? formatDate(c.fila.periodo_fin) : (c.fila?.cortesia_hasta ? formatDate(c.fila.cortesia_hasta) : '—');
      const cancela = c.fila?.cancela_al_final ? 'Sí' : 'No';

      const fila = [
        `"${(c.email || '').replace(/"/g, '""')}"`,
        `"${(c.nombre || '').replace(/"/g, '""')}"`,
        `"${plan?.name || 'Sin plan'}"`,
        precio,
        `"${estado}"`,
        `"${origen}"`,
        `"${fin}"`,
        `"${cancela}"`,
      ];
      csv += fila.join(';') + '\n';
    }
  }

  const hoy = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="factuklima-${tipo}-${hoy}.csv"`,
    },
  });
}
