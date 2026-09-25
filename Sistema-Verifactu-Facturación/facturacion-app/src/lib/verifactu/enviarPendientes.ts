import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptCertificateBlob } from '@/lib/verifactu/certificateEncryption';
import { ENDPOINTS, enviarSobreSoap, type EntornoAeat } from '@/lib/verifactu/clienteAeat';
import { sobreRegFactu, MAX_REGISTROS_POR_ENVIO, type Registro } from '@/lib/verifactu/registroXml';
import {
  problemasDelRegistro, registroAltaDesdeFila, registroAnulacionDesdeFila,
  sistemaInformaticoDe, type FilaFactura, type FilaRegistro,
} from '@/lib/verifactu/mapeo';
import { estadoLocalDe, parsearRespuestaAeat, resumirRespuesta } from '@/lib/verifactu/respuestaAeat';
import { productorDePlataforma } from '@/lib/plataforma/productor';

const TAMANO_LOTE = 100;

/**
 * Manda a la AEAT los registros de facturación pendientes de un usuario.
 *
 * TRES REGLAS QUE MANDAN SOBRE EL RESTO:
 * 1. ORDEN: los registros salen por índice ascendente.
 * 2. UNA VEZ: lo que la AEAT ya aceptó no se reenvía.
 * 3. NADA SE DA POR HECHO: si la conexión falla a mitad, queda en pendiente.
 */
export async function enviarPendientes(
  db: SupabaseClient,
  userId: string,
): Promise<{ estado: number; cuerpo: Record<string, unknown> }> {
  // ---------- Configuración ----------
  const { data: config } = await db
    .from('verifactu_config')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (!config?.activo) {
    return {
      estado: 400,
      cuerpo: {
        ok: false,
        error: 'El envío a la AEAT no está activado. Actívalo en la pantalla de Veri*Factu cuando tengas el certificado puesto.',
      },
    };
  }

  const entorno: EntornoAeat = config.entorno === 'produccion' ? 'produccion' : 'pruebas';

  const { data: ajustes } = await db
    .from('company_settings')
    .select('business_name, nif, igic_enabled')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!ajustes?.nif?.trim() || !ajustes.business_name?.trim()) {
    return {
      estado: 400,
      cuerpo: {
        ok: false,
        error: 'Falta el nombre o el NIF de tu empresa en Ajustes. Sin eso no se puede identificar quién factura.',
      },
    };
  }

  // El productor del software es la plataforma para todas las cuentas: si
  // está configurado en Administración, manda sobre lo que tenga la cuenta.
  const productor = await productorDePlataforma();
  const configSistema = productor?.nombre && productor.nif
    ? {
      ...config,
      productor_nombre: productor.nombre,
      productor_nif: productor.nif,
      nombre_sistema: productor.sistemaNombre,
      id_sistema: productor.sistemaId,
      version_sistema: productor.sistemaVersion,
    }
    : config;

  let sistema;
  try {
    sistema = sistemaInformaticoDe(configSistema, userId);
  } catch (e) {
    return {
      estado: 400,
      cuerpo: {
        ok: false,
        error: e instanceof Error ? e.message : 'Configuración incompleta',
      },
    };
  }

  // ---------- Certificado ----------
  const { data: cert } = await db
    .from('verifactu_certificates')
    .select('id, certificate_data, certificate_password_encrypted')
    .eq('user_id', userId)
    .eq('is_valid', true)
    .eq('is_revoked', false)
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!cert) {
    return {
      estado: 400,
      cuerpo: {
        ok: false,
        error: 'No hay ningún certificado cargado. Súbelo en la pantalla de Veri*Factu.',
      },
    };
  }
  if (!cert.certificate_password_encrypted) {
    return {
      estado: 400,
      cuerpo: {
        ok: false,
        error: 'El certificado guardado es anterior a la integración con la AEAT y no lleva la contraseña cifrada. Vuelve a subirlo para poder enviarlo.',
      },
    };
  }

  let credencial;
  try {
    credencial = {
      pfx: decryptCertificateBlob(cert.certificate_data as string),
      passphrase: decryptCertificateBlob(cert.certificate_password_encrypted as string).toString('utf8'),
    };
  } catch {
    return {
      estado: 500,
      cuerpo: {
        ok: false,
        error: 'No se ha podido descifrar el certificado en el servidor. Vuelve a subirlo.',
      },
    };
  }

  // ---------- Lo que está pendiente ----------
  const { data: pendientes, error: errorConsulta } = await db
    .from('verifactu_registros')
    .select('*')
    .eq('user_id', userId)
    .in('estado', ['pendiente', 'error_envio', 'rechazado'])
    .order('indice', { ascending: true })
    .limit(TAMANO_LOTE);

  if (errorConsulta) {
    return {
      estado: 500,
      cuerpo: {
        ok: false,
        error: 'No se han podido leer los registros pendientes.',
      },
    };
  }
  if (!pendientes?.length) {
    return {
      estado: 200,
      cuerpo: {
        ok: true,
        enviados: 0,
        mensaje: 'No hay nada pendiente de enviar.',
      },
    };
  }

  const lote = (pendientes as FilaRegistro[]).slice(0, MAX_REGISTROS_POR_ENVIO);

  // ---------- Datos de las facturas ----------
  const idsFactura = [...new Set(lote.map(r => r.invoice_id))];
  const [{ data: facturas }, { data: tramos }, { data: lineas }, { data: anteriores }] = await Promise.all([
    db.from('invoices')
      .select('id, client_name, client_nif, client_vat_number, es_intracomunitaria, clave_regimen_iva, tipo, documento_origen_number, documento_origen_id, issue_date, notes, datos_extras')
      .in('id', idsFactura),
    db.from('invoice_tax_breakdown').select('invoice_id, rate, base_amount, tax_amount').in('invoice_id', idsFactura),
    db.from('invoice_line_items').select('invoice_id, product_name').in('invoice_id', idsFactura),
    db.from('verifactu_registros')
      .select('indice, id_emisor, num_serie, fecha_expedicion')
      .eq('user_id', userId)
      .lt('indice', lote[lote.length - 1].indice + 1),
  ]);

  const porFactura = new Map((facturas ?? []).map(f => [f.id, f as unknown as FilaFactura]));
  const porIndice = new Map((anteriores ?? []).map(r => [r.indice as number, r]));

  // ---------- Validar antes de abrir la conexión ----------
  const rechazadasEnCasa: Array<{ numero: string; problemas: string[] }> = [];
  const enviables: FilaRegistro[] = [];

  for (const registro of lote) {
    const problemas = problemasDelRegistro(registro, porFactura.get(registro.invoice_id) ?? null);
    if (problemas.length) rechazadasEnCasa.push({ numero: registro.num_serie, problemas });
    else enviables.push(registro);
  }

  if (!enviables.length) {
    return {
      estado: 400,
      cuerpo: {
        ok: false,
        enviados: 0,
        error: 'Ninguno de los registros pendientes se puede enviar todavía.',
        problemas: rechazadasEnCasa,
      },
    };
  }

  // ---------- Construir el sobre ----------
  let sobre: string;
  try {
    const registros: Registro[] = enviables.map(r => {
      const anterior = porIndice.get(r.indice - 1);
      const datosAnterior = r.huella_anterior && anterior
        ? { idEmisor: anterior.id_emisor as string, numSerie: anterior.num_serie as string, fecha: anterior.fecha_expedicion as string }
        : null;

      if (r.tipo_registro === 'anulacion') {
        return { tipo: 'anulacion', datos: registroAnulacionDesdeFila(r, datosAnterior) };
      }

      return {
        tipo: 'alta',
        datos: registroAltaDesdeFila({
          registro: r,
          factura: porFactura.get(r.invoice_id)!,
          tramos: (tramos ?? []).filter(t => t.invoice_id === r.invoice_id),
          lineas: (lineas ?? []).filter(l => l.invoice_id === r.invoice_id),
          nombreRazonEmisor: ajustes.business_name,
          igic: ajustes.igic_enabled ?? false,
          anterior: datosAnterior,
        }),
      };
    });

    sobre = sobreRegFactu(
      { obligadoEmision: { nombreRazon: ajustes.business_name, nif: ajustes.nif } },
      registros,
      sistema,
    );
  } catch (e) {
    return {
      estado: 500,
      cuerpo: {
        ok: false,
        error: e instanceof Error ? e.message : 'No se ha podido construir el envío',
      },
    };
  }

  // ---------- Enviar ----------
  const idsEnviables = enviables.map(r => r.id);
  await db.from('verifactu_registros')
    .update({ estado: 'enviando', enviado_en: new Date().toISOString(), entorno })
    .in('id', idsEnviables);

  let respuestaHttp;
  try {
    respuestaHttp = await enviarSobreSoap(ENDPOINTS[entorno], sobre, credencial);
  } catch (e) {
    const motivo = e instanceof Error ? e.message : 'Error de red desconocido';
    await Promise.all(enviables.map(r => db.from('verifactu_registros')
      .update({ estado: 'pendiente', descripcion_error: motivo, intentos: (r.intentos ?? 0) + 1 })
      .eq('id', r.id)));
    return {
      estado: 502,
      cuerpo: {
        ok: false,
        error: motivo,
        enviados: 0,
      },
    };
  }

  // ---------- Interpretar ----------
  const respuesta = parsearRespuestaAeat(respuestaHttp.cuerpo);
  const ahora = new Date().toISOString();

  if (respuesta.fallo || (!respuesta.estadoEnvio && respuestaHttp.estado !== 200)) {
    const motivo = respuesta.fallo?.mensaje
      ?? `La AEAT ha respondido con un código ${respuestaHttp.estado} que no se ha podido interpretar.`;
    await db.from('verifactu_registros')
      .update({
        estado: 'error_envio', respondido_en: ahora, descripcion_error: motivo,
        respuesta_cruda: respuestaHttp.cuerpo.slice(0, 20000),
      })
      .in('id', idsEnviables);
    return {
      estado: 502,
      cuerpo: {
        ok: false,
        error: motivo,
        enviados: 0,
        estadoHttp: respuestaHttp.estado,
      },
    };
  }

  const clave = (numSerie: string, operacion: string) => `${numSerie.trim()}|${operacion.toLowerCase()}`;
  const porClave = new Map(
    respuesta.lineas.map(l => [clave(l.numSerieFactura, l.operacion || 'alta'), l]),
  );

  let aceptados = 0, conAvisos = 0, rechazados = 0, sinRespuesta = 0;

  for (const registro of enviables) {
    const linea = porClave.get(clave(registro.num_serie, registro.tipo_registro === 'alta' ? 'alta' : 'anulacion'));

    if (!linea) {
      sinRespuesta++;
      await db.from('verifactu_registros')
        .update({
          estado: 'pendiente', respondido_en: ahora,
          descripcion_error: 'La AEAT no ha devuelto respuesta para este registro. Se reintentará.',
          intentos: (registro.intentos ?? 0) + 1,
        })
        .eq('id', registro.id);
      continue;
    }

    const estadoLocal = estadoLocalDe(linea.estado);
    if (estadoLocal === 'aceptado') aceptados++;
    else if (estadoLocal === 'aceptado_con_errores') conAvisos++;
    else rechazados++;

    await db.from('verifactu_registros')
      .update({
        estado: estadoLocal,
        intentos: (registro.intentos ?? 0) + 1,
        respondido_en: ahora,
        csv_aeat: respuesta.csv,
        codigo_error: linea.codigoError,
        descripcion_error: linea.descripcionError,
        respuesta_cruda: respuestaHttp.cuerpo.slice(0, 20000),
        entorno,
      })
      .eq('id', registro.id);
  }

  return {
    estado: 200,
    cuerpo: {
      ok: true,
      entorno,
      csv: respuesta.csv,
      estadoEnvio: respuesta.estadoEnvio,
      enviados: enviables.length,
      aceptados,
      conAvisos,
      rechazados,
      sinRespuesta,
      resumen: resumirRespuesta(respuesta),
      problemas: rechazadasEnCasa,
    },
  };
}
