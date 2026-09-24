import type { FacturaCobro } from './textos';

/** Una fila de `invoices` tal cual llega de la base de datos, a lo que necesitan los recordatorios. */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export function facturaDeFila(f: any): FacturaCobro {
  return {
    id: f.id, number: f.number, clientId: f.client_id ?? '', clientName: f.client_name ?? '',
    issueDate: f.issue_date, dueDate: f.due_date, status: f.status,
    total: Number(f.total) || 0, subtotal: Number(f.subtotal) || 0,
    retencionPct: f.retencion_pct != null ? Number(f.retencion_pct) : undefined,
    paidAmount: Number(f.paid_amount || 0), sentido: f.sentido ?? 'venta', tipo: f.tipo ?? 'factura',
    cancelledAt: f.cancelled_at || undefined, posSessionId: f.pos_session_id || undefined,
  };
}

/** La tabla de la migración 051 todavía no existe. */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export function faltaLaTabla(error: any): boolean {
  const code: string = error?.code ?? '';
  const msg: string = error?.message ?? '';
  return code === 'PGRST205' || code === '42P01' || /does not exist|could not find the table/i.test(msg);
}

export const CAMPO_AJUSTES = 'klima_recordatorios';

/** Ajustes del envío automático, guardados en los metadatos de la cuenta. */
export interface AjustesRecordatorios {
  /** Envío automático diario activado. */
  a: boolean;
  /** Días entre un recordatorio y el siguiente al mismo cliente. */
  c: number;
  /** Días de retraso antes del primero. */
  p: number;
}

export const AJUSTES_POR_DEFECTO: AjustesRecordatorios = { a: false, c: 7, p: 3 };
