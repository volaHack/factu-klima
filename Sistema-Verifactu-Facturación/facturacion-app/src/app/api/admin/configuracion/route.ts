import { NextResponse } from 'next/server';
import { adminParaApi } from '@/lib/admin/dal';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { isValidNif } from '@/lib/validation/nif';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const txt = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

export const dynamic = 'force-dynamic';

export async function GET() {
  const admin = await adminParaApi();
  if (!admin.ok) {
    return admin.respuesta;
  }

  const db = supabaseServicio();
  const { data, error } = await db.from('plataforma_config').select('*').single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ config: data });
}

export async function POST(request: Request) {
  const admin = await adminParaApi();
  if (!admin.ok) {
    return admin.respuesta;
  }

  try {
    const body = await request.json();
    const {
      serie_suscripciones,
      serie_propinas,
      regimen_igic,
      cobrar_impuesto,
      stripe_tax_rate_igic,
      actividad_desde,
      motivo,
      productor,
    } = body;

    // El productor del software y su declaración responsable (migración 053).
    let datosProductor: Record<string, unknown> = {};
    if (productor && typeof productor === 'object') {
      const nif = txt(productor.nif, 20)?.toUpperCase().replace(/[^A-Z0-9]/g, '') ?? null;
      if (nif && !isValidNif(nif)) return NextResponse.json({ error: `El NIF del productor (${nif}) no es válido.` }, { status: 400 });
      for (const campo of ['email', 'soporte_email'] as const) {
        const v = txt(productor[campo], 200);
        if (v && !EMAIL.test(v)) return NextResponse.json({ error: `El correo «${v}» no es válido.` }, { status: 400 });
      }
      const fecha = txt(productor.fecha, 10);
      if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return NextResponse.json({ error: 'La fecha de la declaración tiene que ser AAAA-MM-DD.' }, { status: 400 });
      const id = txt(productor.sistema_id, 2);
      if (id && !/^[A-Za-z0-9]{2}$/.test(id)) return NextResponse.json({ error: 'El código del sistema son dos letras o cifras (p. ej. FK).' }, { status: 400 });
      datosProductor = {
        productor_nombre: txt(productor.nombre, 120),
        productor_nif: nif,
        productor_domicilio: txt(productor.domicilio, 300),
        productor_email: txt(productor.email, 200),
        soporte_email: txt(productor.soporte_email, 200),
        sistema_nombre: txt(productor.sistema_nombre, 30) ?? 'FactuKlima',
        sistema_id: id?.toUpperCase() ?? 'FK',
        sistema_version: txt(productor.sistema_version, 50) ?? '1.0',
        declaracion_lugar: txt(productor.lugar, 120),
        declaracion_fecha: fecha,
      };
    }

    if (actividad_desde !== undefined && actividad_desde !== null && actividad_desde !== ''
        && !/^\d{4}-\d{2}-\d{2}$/.test(String(actividad_desde))) {
      return NextResponse.json({ error: 'La fecha de alta tiene que ser AAAA-MM-DD.' }, { status: 400 });
    }

    if (!motivo?.trim()) {
      return NextResponse.json({ error: 'Debes indicar un motivo para guardar los cambios de configuración.' }, { status: 400 });
    }

    if (regimen_igic && !['general', 'pequeno_empresario'].includes(regimen_igic)) {
      return NextResponse.json({ error: 'Régimen de IGIC inválido.' }, { status: 400 });
    }

    const db = supabaseServicio();
    const { data: anterior } = await db.from('plataforma_config').select('*').single();

    const actualizacion = {
      ...(serie_suscripciones ? { serie_suscripciones: String(serie_suscripciones).trim().toUpperCase() } : {}),
      ...(serie_propinas ? { serie_propinas: String(serie_propinas).trim().toUpperCase() } : {}),
      ...(regimen_igic ? { regimen_igic } : {}),
      ...(typeof cobrar_impuesto === 'boolean' ? { cobrar_impuesto } : {}),
      ...(stripe_tax_rate_igic !== undefined ? { stripe_tax_rate_igic: stripe_tax_rate_igic ? String(stripe_tax_rate_igic).trim() : null } : {}),
      ...(actividad_desde !== undefined ? { actividad_desde: actividad_desde || null } : {}),
      ...datosProductor,
    };

    const { error: errorUpdate } = await db
      .from('plataforma_config')
      .update(actualizacion)
      .eq('id', true);

    if (errorUpdate) {
      return NextResponse.json({ error: errorUpdate.message }, { status: 500 });
    }

    // Registrar en auditoría inmutable
    await db.from('admin_registro').insert({
      admin_user_id: admin.user.id,
      accion: 'configuracion_plataforma',
      motivo: `Actualización de configuración: ${motivo.trim()} (régimen ${anterior?.regimen_igic} → ${regimen_igic ?? anterior?.regimen_igic}; alta ${anterior?.actividad_desde ?? '—'} → ${(actividad_desde === undefined ? anterior?.actividad_desde : actividad_desde) || '—'})`,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error al guardar' }, { status: 500 });
  }
}
