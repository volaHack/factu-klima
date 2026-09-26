import 'server-only';

/**
 * PORTAL DEL CLIENTE — LECTURA EN EL SERVIDOR
 *
 * El cliente de un negocio no tiene cuenta en el programa ni debe tenerla.
 * Entra con un enlace secreto (`portal_clientes.token`) y el servidor, con
 * la clave de servicio, le enseña SÓLO lo suyo: las facturas emitidas de
 * ese negocio a ese cliente. Nada de borradores, presupuestos ni de otros
 * clientes. Si el negocio revoca el enlace, deja de funcionar al momento.
 */

import { supabaseServicio } from '@/lib/supabase/servicio';
import { pendienteDeCobro, sePuedePagarOnline } from '@/lib/cobroOnline/calculo';

export interface EmpresaPortal {
  nombre: string;
  razonSocial: string;
  nif: string;
  direccion: string;
  email: string | null;
  telefono: string | null;
  iban: string | null;
  banco: string | null;
  logo: string | null;
}

export interface FacturaPortal {
  id: string;
  numero: string;
  fecha: string;
  vencimiento: string | null;
  total: number;
  pendiente: number;
  estado: string;
  rectificativa: boolean;
  sePuedePagar: boolean;
}

export interface Portal {
  token: string;
  empresa: EmpresaPortal;
  cliente: { nombre: string; nif: string | null };
  facturas: FacturaPortal[];
  pagoConTarjeta: boolean;
  totalPendiente: number;
}

/** Lo que tiene que cumplir un token antes de ir a la base de datos. */
export const tokenConForma = (t: string) => /^[A-Za-z0-9_-]{32,128}$/.test(t);

const direccion = (e: Record<string, string | null>) =>
  [e.address, [e.postal_code, e.city].filter(Boolean).join(' '), e.province].filter(Boolean).join(', ');

async function resolver(token: string) {
  if (!tokenConForma(token)) return null;
  const db = supabaseServicio();
  const { data: enlace } = await db.from('portal_clientes')
    .select('user_id, client_id, revocado_en').eq('token', token).maybeSingle();
  if (!enlace || enlace.revocado_en) return null;
  return { db, userId: enlace.user_id as string, clientId: enlace.client_id as string };
}

async function empresaDe(db: ReturnType<typeof supabaseServicio>, userId: string): Promise<EmpresaPortal | null> {
  const { data: e } = await db.from('company_settings')
    .select('business_name, trade_name, nif, address, city, postal_code, province, email, phone, iban, bank_name, logo_url')
    .eq('user_id', userId).order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (!e) return null;
  return {
    nombre: e.trade_name || e.business_name || '',
    razonSocial: e.business_name || '',
    nif: e.nif || '',
    direccion: direccion(e),
    email: e.email || null,
    telefono: e.phone || null,
    iban: e.iban || null,
    banco: e.bank_name || null,
    // Un logo en base64 de varios MB no se manda al portal: sólo URLs.
    logo: typeof e.logo_url === 'string' && /^https:\/\//.test(e.logo_url) ? e.logo_url : null,
  };
}

export async function leerPortal(token: string): Promise<Portal | null> {
  const r = await resolver(token);
  if (!r) return null;
  const { db, userId, clientId } = r;

  const [empresa, { data: cliente }, { data: filas }, { data: cuenta }] = await Promise.all([
    empresaDe(db, userId),
    db.from('clients').select('business_name, nif').eq('id', clientId).eq('user_id', userId).maybeSingle(),
    db.from('invoices')
      .select('id, number, issue_date, due_date, total, subtotal, retencion_pct, paid_amount, status, tipo')
      .eq('user_id', userId).eq('client_id', clientId)
      .in('tipo', ['factura', 'rectificativa']).not('sealed_at', 'is', null)
      .order('issue_date', { ascending: false }).limit(200),
    db.from('cobro_online_cuentas').select('cobros_activos').eq('user_id', userId).maybeSingle(),
  ]);
  if (!empresa || !cliente) return null;

  // Se apunta cuándo lo abrió por última vez: al negocio le sirve saber si lo ha visto.
  void db.from('portal_clientes').update({ ultimo_acceso: new Date().toISOString() }).eq('token', token);

  const pagoConTarjeta = !!cuenta?.cobros_activos;
  const facturas: FacturaPortal[] = (filas ?? []).map(f => {
    // Marcada como pagada (aunque no se apuntara el importe) o anulada: nada pendiente.
    const pendiente = f.status === 'anulada' || f.status === 'pagada' ? 0 : pendienteDeCobro(f);
    return {
      id: f.id, numero: f.number, fecha: f.issue_date, vencimiento: f.due_date,
      total: Number(f.total) || 0, pendiente, estado: f.status, rectificativa: f.tipo === 'rectificativa',
      sePuedePagar: pagoConTarjeta && f.tipo === 'factura' && sePuedePagarOnline(f),
    };
  });

  return {
    token,
    empresa,
    cliente: { nombre: cliente.business_name, nif: cliente.nif ?? null },
    facturas,
    pagoConTarjeta,
    totalPendiente: Math.round(facturas.filter(f => !f.rectificativa).reduce((s, f) => s + f.pendiente, 0) * 100) / 100,
  };
}

export interface DetalleFacturaPortal {
  empresa: EmpresaPortal;
  cliente: { nombre: string; nif: string | null; direccion: string | null };
  factura: {
    id: string; numero: string; fecha: string; vencimiento: string | null; estado: string; tipo: string;
    lineas: { concepto: string; cantidad: number; precio: number; total: number }[];
    impuestos: { tipo: number; base: number; cuota: number }[];
    subtotal: number; impuestosTotal: number; total: number; pendiente: number;
    retencionPct: number | null; notas: string | null; sePuedePagar: boolean;
  };
}

export async function leerFacturaDelPortal(token: string, facturaId: string): Promise<DetalleFacturaPortal | null> {
  const r = await resolver(token);
  if (!r || !/^[0-9a-f-]{20,40}$/i.test(facturaId)) return null;
  const { db, userId, clientId } = r;

  const { data: f } = await db.from('invoices')
    .select('id, number, issue_date, due_date, status, tipo, subtotal, total_tax, total, retencion_pct, paid_amount, notes, client_name, client_nif, client_address, sealed_at')
    .eq('id', facturaId).eq('user_id', userId).eq('client_id', clientId).maybeSingle();
  if (!f || !f.sealed_at || !['factura', 'rectificativa'].includes(f.tipo)) return null;

  const [empresa, { data: lineas }, { data: impuestos }, { data: cuenta }] = await Promise.all([
    empresaDe(db, userId),
    db.from('invoice_line_items').select('product_name, quantity, unit_price, subtotal, total')
      .eq('invoice_id', f.id).order('sort_order', { ascending: true }),
    db.from('invoice_tax_breakdown').select('rate, base_amount, tax_amount').eq('invoice_id', f.id),
    db.from('cobro_online_cuentas').select('cobros_activos').eq('user_id', userId).maybeSingle(),
  ]);
  if (!empresa) return null;

  return {
    empresa,
    cliente: { nombre: f.client_name, nif: f.client_nif ?? null, direccion: f.client_address ?? null },
    factura: {
      id: f.id, numero: f.number, fecha: f.issue_date, vencimiento: f.due_date, estado: f.status, tipo: f.tipo,
      lineas: (lineas ?? []).map(l => ({
        concepto: l.product_name || '',
        // El importe de la línea sin impuestos: los impuestos van abajo, por tipo.
        cantidad: Number(l.quantity) || 0, precio: Number(l.unit_price) || 0, total: Number(l.subtotal ?? l.total) || 0,
      })),
      impuestos: (impuestos ?? []).map(t => ({ tipo: Number(t.rate), base: Number(t.base_amount), cuota: Number(t.tax_amount) })),
      subtotal: Number(f.subtotal) || 0, impuestosTotal: Number(f.total_tax) || 0, total: Number(f.total) || 0,
      pendiente: f.status === 'anulada' || f.status === 'pagada' ? 0 : pendienteDeCobro(f),
      retencionPct: f.retencion_pct != null ? Number(f.retencion_pct) : null,
      notas: f.notes || null,
      sePuedePagar: !!cuenta?.cobros_activos && f.tipo === 'factura' && sePuedePagarOnline(f),
    },
  };
}
