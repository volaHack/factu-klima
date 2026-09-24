import { NextResponse } from 'next/server';

import { adminParaApi } from '@/lib/admin/dal';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { ingresosACsv, type Ingreso } from '@/lib/plataforma/ingresos';

export const dynamic = 'force-dynamic';

/** El libro de ingresos de la plataforma en CSV, para la gestoría. */
export async function GET(request: Request) {
  const admin = await adminParaApi();
  if (!admin.ok) return admin.respuesta;

  const url = new URL(request.url);
  const fecha = /^\d{4}-\d{2}-\d{2}$/;
  const desde = url.searchParams.get('desde') ?? '';
  const hasta = url.searchParams.get('hasta') ?? '';
  if (!fecha.test(desde) || !fecha.test(hasta)) {
    return NextResponse.json({ error: 'Indica desde y hasta como AAAA-MM-DD.' }, { status: 400 });
  }

  const db = supabaseServicio();
  const { data, error } = await db.from('ingresos_plataforma')
    .select('*, factura:invoices(number)')
    .gte('fecha', desde).lte('fecha', hasta)
    .order('fecha', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const filas = (data ?? []).map(f => ({
    ...(f as unknown as Ingreso),
    factura_numero: (f as { factura?: { number?: string } | null }).factura?.number ?? null,
  }));
  return new NextResponse(ingresosACsv(filas), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="ingresos-klima-${desde}-a-${hasta}.csv"`,
    },
  });
}
